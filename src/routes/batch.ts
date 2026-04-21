/**
 * POST /api/v1/address/normalize/batch — 複数住所の一括正規化
 *
 * 実装指示書 §2.2 / §3 に基づく本実装。
 *
 * パイプライン:
 *   1. リクエスト受信 + バリデーション(INVALID_FORMAT, BATCH_TOO_LARGE)
 *   2. 各要素を前処理(postal-code-parser / building-separator)
 *   3. OUTSIDE_COVERAGE は per-item で即決(Fly.io 呼び出し対象から外す)
 *   4. cacheGet(KV)で per-item ルックアップ。ヒットは即採用
 *   5. 未ヒット & in_coverage な要素だけを 1 回の Fly.io 呼び出しにまとめる
 *      (batch タイムアウト 30s)
 *   6. response-formatter.formatNormalizeResponse で per-item 整形
 *      (attribution は DEFAULT_ATTRIBUTION を自動付与)
 *   7. cachePut(書込失敗は黙殺)
 *   8. summary 集計 + analytics Context(addressBatchSize = 入力件数)
 *
 * Fly.io 呼び出し全体が失敗した場合は、呼び出し対象だった全要素に
 * SERVICE_UNAVAILABLE を返し、キャッシュ/OUTSIDE_COVERAGE で既に決まっていた要素は
 * その結果を維持する。**全要素が SERVICE_UNAVAILABLE になった場合のみ** HTTP 503 を返し、
 * それ以外は 200 を返す(AI エージェントが per-item で判断できる設計)。
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  BATCH_MAX_SIZE,
  type BatchNormalizeRequest,
  type BatchNormalizeResponse,
  type NormalizeResponse,
} from "../types/address.js";
import { extractPostalCode } from "../services/postal-code-parser.js";
import { separateBuilding } from "../services/building-separator.js";
import { checkCoverage } from "../services/coverage.js";
import { cacheGet, cachePut } from "../services/cache.js";
import {
  callFlyGeocode,
  FLY_TIMEOUT_BATCH_MS,
} from "../services/flyio-client.js";
import {
  formatNormalizeResponse,
  type EnrichmentContext,
} from "../services/response-formatter.js";
import {
  buildOutsideCoverageResponse,
  buildServiceUnavailableResponse,
} from "./normalize.js";

export const batch = new Hono<AppEnv>();

batch.post("/", async (c) => {
  // 1. Parse + validate
  let body: BatchNormalizeRequest;
  try {
    body = await c.req.json<BatchNormalizeRequest>();
  } catch {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message: "Request body must be valid JSON with {addresses: string[]}",
        },
      },
      400
    );
  }

  if (!Array.isArray(body?.addresses) || body.addresses.length === 0) {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message:
            "Field 'addresses' is required and must be a non-empty array of strings",
        },
      },
      400
    );
  }

  if (body.addresses.length > BATCH_MAX_SIZE) {
    return c.json(
      {
        error: {
          code: "BATCH_TOO_LARGE",
          message: `Batch size ${body.addresses.length} exceeds max ${BATCH_MAX_SIZE}. Split into smaller requests.`,
        },
      },
      400
    );
  }

  // 各要素が文字列かを検証(空文字は Fly.io に投げる前に除外)
  if (
    !body.addresses.every(
      (a) => typeof a === "string" && a.trim().length > 0
    )
  ) {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message: "Every item in 'addresses' must be a non-empty string",
        },
      },
      400
    );
  }

  const rawInputs = body.addresses;
  const batchSize = rawInputs.length;

  // 2-4. 前処理 + 被覆判定 + キャッシュルックアップ
  type ItemContext = {
    rawInput: string;
    streetAddress: string;
    enrichment: EnrichmentContext;
    coverage: ReturnType<typeof checkCoverage>;
    /** 確定済みレスポンス(OUTSIDE_COVERAGE もしくはキャッシュヒット)。null は Fly.io 問い合わせ対象 */
    finalized: NormalizeResponse | null;
  };

  const items: ItemContext[] = await Promise.all(
    rawInputs.map(async (rawInput) => {
      const { postalCode, remainder } = extractPostalCode(rawInput);
      const { streetAddress, building, floor } = separateBuilding(remainder);
      const enrichment: EnrichmentContext = { postalCode, building, floor };
      const coverage = checkCoverage(streetAddress);

      if (coverage.status === "out_of_coverage") {
        return {
          rawInput,
          streetAddress,
          enrichment,
          coverage,
          finalized: buildOutsideCoverageResponse(rawInput, coverage.prefecture),
        };
      }

      // キャッシュルックアップ(失敗はフェイル・オープン)
      let cached: NormalizeResponse | null = null;
      try {
        cached = await cacheGet(c.env.ADDRESS_CACHE, rawInput);
      } catch (err) {
        console.warn("[batch] cacheGet failed:", err);
      }

      return {
        rawInput,
        streetAddress,
        enrichment,
        coverage,
        finalized: cached,
      };
    })
  );

  // 5. Fly.io 呼び出し対象を束ねる
  const flyIndices: number[] = [];
  const flyInputs: string[] = [];
  items.forEach((item, i) => {
    if (!item.finalized) {
      flyIndices.push(i);
      flyInputs.push(item.streetAddress);
    }
  });

  const results: NormalizeResponse[] = new Array(items.length);

  if (flyInputs.length > 0) {
    const flyRes = await callFlyGeocode(c.env, flyInputs, {
      timeoutMs: FLY_TIMEOUT_BATCH_MS,
    });

    if (flyRes.ok) {
      // 6. Per-item 整形
      flyIndices.forEach((originalIndex, j) => {
        const flyItem = flyRes.data.results[j];
        const item = items[originalIndex] as ItemContext;
        if (!flyItem) {
          results[originalIndex] = buildServiceUnavailableResponse(item.rawInput, {
            kind: "invalid_response",
            message: `Fly.io results[${j}] missing`,
          });
          return;
        }
        const formatted = formatNormalizeResponse({
          input: item.rawInput,
          flyResult: flyItem,
          enrichment: item.enrichment,
        });
        results[originalIndex] = formatted;

        // 7. Cache write(per-item、失敗は黙殺)
        cachePut(c.env.ADDRESS_CACHE, item.rawInput, formatted).catch((err) => {
          console.warn("[batch] cachePut failed:", err);
        });
      });
    } else {
      // Fly.io 全体失敗: 呼び出し対象だった要素のみ SERVICE_UNAVAILABLE に設定
      flyIndices.forEach((originalIndex) => {
        const item = items[originalIndex] as ItemContext;
        results[originalIndex] = buildServiceUnavailableResponse(
          item.rawInput,
          flyRes.error
        );
      });
    }
  }

  // finalized(OUTSIDE_COVERAGE またはキャッシュヒット)を流し込む
  items.forEach((item, i) => {
    if (item.finalized) {
      results[i] = item.finalized;
    }
  });

  // 8. Summary 集計
  const summary = {
    total: results.length,
    succeeded: 0,
    ambiguous: 0,
    failed: 0,
  };
  for (const r of results) {
    if (r.result) summary.succeeded += 1;
    else if (r.candidates.length > 0) summary.ambiguous += 1;
    else summary.failed += 1;
  }

  // Analytics Context
  const allServiceUnavailable = results.every(
    (r) => r.error?.code === "SERVICE_UNAVAILABLE"
  );
  c.set(
    "addressResponseType",
    summary.succeeded > 0
      ? "success"
      : summary.ambiguous > 0
        ? "ambiguous"
        : "error"
  );
  c.set(
    "addressCoverage",
    items.every((i) => i.coverage.status === "out_of_coverage")
      ? "out_of_coverage"
      : "in_coverage"
  );
  c.set("addressBatchSize", batchSize);

  // batch では代表値として最初の成功結果の level/confidence を記録
  const firstSuccess = results.find((r) => r.result);
  if (firstSuccess?.result) {
    c.set("addressLevel", firstSuccess.result.level);
    c.set("addressConfidence", firstSuccess.result.confidence);
  } else {
    c.set("addressLevel", 0);
    c.set("addressConfidence", 0);
  }

  const response: BatchNormalizeResponse = { results, summary };

  // 全要素が SERVICE_UNAVAILABLE のときだけ HTTP 503(Fly.io ダウン相当)
  return c.json(response, allServiceUnavailable ? 503 : 200);
});

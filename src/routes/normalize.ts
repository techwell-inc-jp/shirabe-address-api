/**
 * POST /api/v1/address/normalize — 単一住所の正規化
 *
 * 実装指示書 §2.1 / §3 に基づく本実装。
 *
 * パイプライン(Claude Code 2026-04-21 配線):
 *   1. リクエスト受信 + バリデーション(INVALID_FORMAT)
 *   2. 前処理: postal-code-parser で郵便番号抽出、building-separator で建物名/階数分離
 *   3. 対象外判定(checkCoverage)→ OUTSIDE_COVERAGE(無効な都道府県名のみ)
 *   4. cache.cacheGet(ヒット時は即返却、AE には coverage=in_coverage を記録)
 *   5. flyio-client.callFlyGeocode → Fly.io /internal/geocode へ POST
 *   6. response-formatter.formatNormalizeResponse で公開スキーマへ整形
 *      (attribution は DEFAULT_ATTRIBUTION を自動付与)
 *   7. cache.cachePut(TTL 3600s、ただし AE 計測では書込失敗を黙殺)
 *   8. analytics 用 Context 変数(addressResponseType / addressCoverage / addressLevel /
 *      addressConfidence / addressBatchSize=1)をセットしてから返却
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  DEFAULT_ATTRIBUTION,
  type AddressLevel,
  type NormalizeRequest,
  type NormalizeResponse,
} from "../types/address.js";
import { extractPostalCode } from "../services/postal-code-parser.js";
import { separateBuilding } from "../services/building-separator.js";
import { checkCoverage } from "../services/coverage.js";
import { cacheGet, cachePut } from "../services/cache.js";
import {
  callFlyGeocode,
  FLY_TIMEOUT_SINGLE_MS,
  type FlyClientError,
} from "../services/flyio-client.js";
import {
  formatNormalizeResponse,
  type EnrichmentContext,
} from "../services/response-formatter.js";

export const normalize = new Hono<AppEnv>();

normalize.post("/", async (c) => {
  // 1. Parse + validate
  let body: NormalizeRequest;
  try {
    body = await c.req.json<NormalizeRequest>();
  } catch {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message: "Request body must be valid JSON with {address: string}",
        },
      },
      400
    );
  }

  if (typeof body?.address !== "string" || body.address.trim() === "") {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message:
            "Field 'address' is required and must be a non-empty string",
        },
      },
      400
    );
  }

  const rawInput = body.address;

  // 2. Preprocess
  const { postalCode, remainder } = extractPostalCode(rawInput);
  const { streetAddress, building, floor } = separateBuilding(remainder);
  const enrichment: EnrichmentContext = { postalCode, building, floor };

  // 3. OUTSIDE_COVERAGE pre-check
  const coverage = checkCoverage(streetAddress);
  if (coverage.status === "out_of_coverage") {
    const response = buildOutsideCoverageResponse(rawInput, coverage.prefecture);
    setAnalyticsContext(c, {
      responseType: "error",
      coverage: "out_of_coverage",
      batchSize: 1,
      level: 0,
      confidence: 0,
    });
    return c.json(response, 200);
  }

  // 4. Cache lookup
  try {
    const cached = await cacheGet(c.env.ADDRESS_CACHE, rawInput);
    if (cached) {
      setAnalyticsContextFromResponse(c, cached, 1);
      return c.json(cached, 200);
    }
  } catch (err) {
    // KV 障害はフェイル・オープン(ログのみ、通常フローを続行)
    console.warn("[normalize] cacheGet failed:", err);
  }

  // 5. Fly.io 呼び出し
  const flyRes = await callFlyGeocode(c.env, [streetAddress], {
    timeoutMs: FLY_TIMEOUT_SINGLE_MS,
  });

  if (!flyRes.ok) {
    const response = buildServiceUnavailableResponse(rawInput, flyRes.error);
    setAnalyticsContext(c, {
      responseType: "error",
      coverage: coverage.status === "in_coverage" ? "in_coverage" : "out_of_coverage",
      batchSize: 1,
      level: 0,
      confidence: 0,
    });
    return c.json(response, 503);
  }

  const firstResult = flyRes.data.results[0];
  if (!firstResult) {
    // Fly.io が results 空で返した場合(本来ありえない)
    const response = buildServiceUnavailableResponse(rawInput, {
      kind: "invalid_response",
      message: "Fly.io returned empty results array",
    });
    setAnalyticsContext(c, {
      responseType: "error",
      coverage: "in_coverage",
      batchSize: 1,
      level: 0,
      confidence: 0,
    });
    return c.json(response, 503);
  }

  // 6. Format
  const response = formatNormalizeResponse({
    input: rawInput,
    flyResult: firstResult,
    enrichment,
  });

  // 7. Cache write(失敗は黙殺)
  try {
    await cachePut(c.env.ADDRESS_CACHE, rawInput, response);
  } catch (err) {
    console.warn("[normalize] cachePut failed:", err);
  }

  // 8. Analytics
  setAnalyticsContextFromResponse(c, response, 1);

  return c.json(response, 200);
});

/**
 * 住所レスポンスから analytics 用 Context を設定する。
 */
function setAnalyticsContextFromResponse(
  c: Context<AppEnv>,
  response: NormalizeResponse,
  batchSize: number
): void {
  const responseType: "success" | "ambiguous" | "error" = response.result
    ? "success"
    : response.candidates.length > 0
      ? "ambiguous"
      : "error";
  setAnalyticsContext(c, {
    responseType,
    coverage: "in_coverage",
    batchSize,
    level: response.result?.level ?? 0,
    confidence: response.result?.confidence ?? 0,
  });
}

function setAnalyticsContext(
  c: Context<AppEnv>,
  vars: {
    responseType: "success" | "ambiguous" | "error";
    coverage: "in_coverage" | "out_of_coverage";
    batchSize: number;
    level: AddressLevel;
    confidence: number;
  }
): void {
  c.set("addressResponseType", vars.responseType);
  c.set("addressCoverage", vars.coverage);
  c.set("addressBatchSize", vars.batchSize);
  c.set("addressLevel", vars.level);
  c.set("addressConfidence", vars.confidence);
}

export function buildOutsideCoverageResponse(
  input: string,
  prefecture: string
): NormalizeResponse {
  return {
    input,
    result: null,
    candidates: [],
    error: {
      code: "OUTSIDE_COVERAGE",
      message: `${prefecture} は日本の都道府県として認識できませんでした。入力が正しい都道府県名か確認してください(全 47 都道府県対応)。`,
      matched_up_to: prefecture,
      level: 1,
    },
    attribution: DEFAULT_ATTRIBUTION,
  };
}

export function buildServiceUnavailableResponse(
  input: string,
  flyErr: FlyClientError
): NormalizeResponse {
  const message = describeFlyError(flyErr);
  return {
    input,
    result: null,
    candidates: [],
    error: {
      code: "SERVICE_UNAVAILABLE",
      message,
      matched_up_to: null,
      level: 0,
    },
    attribution: DEFAULT_ATTRIBUTION,
  };
}

function describeFlyError(err: FlyClientError): string {
  switch (err.kind) {
    case "timeout":
      return `Geocoding service timed out after ${err.timeoutMs}ms. Please retry.`;
    case "network":
      return "Could not reach geocoding service. Please retry.";
    case "auth":
      return "Internal authentication failed between edge and geocoder. Please report.";
    case "service_unavailable":
      return "Geocoding service is temporarily unavailable. Please retry in a moment.";
    case "bad_request":
      return `Geocoder rejected request: ${err.message}`;
    case "invalid_response":
      return `Geocoder returned an unexpected response: ${err.message}`;
    case "config_missing":
      return `Geocoding service is not configured (missing ${err.field}).`;
  }
}

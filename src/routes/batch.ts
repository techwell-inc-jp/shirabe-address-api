/**
 * POST /api/v1/address/normalize/batch
 *
 * 実装指示書 §2.2 のスタブ実装。
 * - 最大 100 件(BATCH_MAX_SIZE)、超過時は BATCH_TOO_LARGE で 400
 * - 空配列は INVALID_FORMAT で 400
 * - 個々の住所は normalize.ts と同じロジックで処理(現時点は SERVICE_UNAVAILABLE)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  BATCH_MAX_SIZE,
  DEFAULT_ATTRIBUTION,
  type BatchNormalizeRequest,
  type BatchNormalizeResponse,
  type NormalizeResponse,
} from "../types/address.js";

export const batch = new Hono<AppEnv>();

batch.post("/", async (c) => {
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
          message: "Field 'addresses' is required and must be a non-empty array of strings",
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

  // Phase 1 骨格: 各要素について SERVICE_UNAVAILABLE を返す
  // TODO(4/27-4/28): flyio-client の batch エンドポイントへ一括送信 → response-formatter
  const results: NormalizeResponse[] = body.addresses.map((address) => ({
    input: typeof address === "string" ? address : String(address),
    result: null,
    candidates: [],
    error: {
      code: "SERVICE_UNAVAILABLE" as const,
      message:
        "Address normalization service is not yet available (Phase 1 skeleton). Fly.io backend integration pending.",
      matched_up_to: null,
      level: 0 as const,
    },
    attribution: DEFAULT_ATTRIBUTION,
  }));

  const response: BatchNormalizeResponse = {
    results,
    summary: {
      total: body.addresses.length,
      succeeded: 0,
      ambiguous: 0,
      failed: body.addresses.length,
    },
  };

  return c.json(response, 503);
});

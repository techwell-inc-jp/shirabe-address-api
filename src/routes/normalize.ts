/**
 * POST /api/v1/address/normalize
 *
 * 実装指示書 §2.1 のスタブ実装。
 *
 * 現時点では Fly.io 側が未実装のため、以下の仮動作:
 * 1. リクエストをバリデーション(address が文字列であること)
 * 2. KV キャッシュを確認(ヒット時はそれを返却)
 * 3. Fly.io 側は呼ばず、`SERVICE_UNAVAILABLE` エラーで 503 を返す
 *
 * Fly.io 側実装完了後、以下の順序で段階的に置き換える:
 * - services/flyio-client.ts で Fly.io へ POST
 * - services/response-formatter.ts で attribution 付与 + components 分割
 * - services/postal-code-parser.ts で〒の分離
 * - services/building-separator.ts で建物名・階数分離
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  DEFAULT_ATTRIBUTION,
  type NormalizeRequest,
  type NormalizeResponse,
} from "../types/address.js";

export const normalize = new Hono<AppEnv>();

normalize.post("/", async (c) => {
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
          message: "Field 'address' is required and must be a non-empty string",
        },
      },
      400
    );
  }

  // Phase 1 骨格: Fly.io 側未実装のため常に SERVICE_UNAVAILABLE を返す
  // TODO(4/24-4/27): flyio-client 経由で Fly.io を呼び、response-formatter で整形
  const response: NormalizeResponse = {
    input: body.address,
    result: null,
    candidates: [],
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "Address normalization service is not yet available (Phase 1 skeleton). Fly.io backend integration pending.",
      matched_up_to: null,
      level: 0,
    },
    attribution: DEFAULT_ATTRIBUTION,
  };

  return c.json(response, 503);
});

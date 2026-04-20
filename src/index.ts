/**
 * Shirabe Address API — Hono エントリポイント
 *
 * Cloudflare Workers 上で動作する住所正規化 REST API(Phase 1 骨格)。
 *
 * 実装指示書 20260422-address-api-implementation-order.md に準拠。
 *
 * ミドルウェア適用順(Phase 1 骨格では最小構成):
 * 1. CORS(全エンドポイント)
 * 2. /health はミドルウェア非通過
 * 3. /api/v1/address/* は将来的に auth → usage-check → rate-limit → usage-logger の順
 *    (Phase 1 骨格ではスタブのみ、暦 API から段階的に移植)
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types/env.js";
import { health } from "./routes/health.js";
import { normalize } from "./routes/normalize.js";
import { batch } from "./routes/batch.js";

const app = new Hono<AppEnv>();

// CORS(API サーバーのため制限なし、暦 API と同方針)
app.use("*", cors());

// ヘルスチェック(認証不要)
app.route("/api/v1/address/health", health);

// API エンドポイント
// TODO(4/23): 認証・レート制限・課金計測ミドルウェアを暦 API から移植
app.route("/api/v1/address/normalize", normalize);
app.route("/api/v1/address/normalize/batch", batch);

// 404
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "The requested endpoint does not exist",
      },
    },
    404
  );
});

// グローバルエラーハンドラー
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
      },
    },
    500
  );
});

export default app;

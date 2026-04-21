/**
 * Shirabe Address API — Hono エントリポイント
 *
 * Cloudflare Workers 上で動作する住所正規化 REST API(Phase 1)。
 * 実装指示書 20260422-address-api-implementation-order.md に準拠。
 *
 * ミドルウェア適用順(暦 API と同方針):
 * 1. CORS(全エンドポイント)
 * 2. analytics(全ルートのレスポンス後に AE 書込)
 * 3. /api/v1/address/health はそれ以外のミドルウェア非通過
 * 4. /api/v1/address/* には auth → usage-check → rate-limit → usage-logger を適用
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types/env.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { usageCheckMiddleware } from "./middleware/usage-check.js";
import { usageLoggerMiddleware } from "./middleware/usage-logger.js";
import { analyticsMiddleware } from "./middleware/analytics.js";
import { health } from "./routes/health.js";
import { normalize } from "./routes/normalize.js";
import { batch } from "./routes/batch.js";

const app = new Hono<AppEnv>();

// CORS(API サーバーのため制限なし、暦 API と同方針)
app.use("*", cors());

// S1 計測: 全ルートのレスポンス後に AE 書込。失敗してもレスポンスに影響させない。
// CORS の直後・個別ルート/他ミドルウェアより前に登録し、auth 等が set した
// 値(plan / apiKeyIdHash 等)を await next() 後に読めるようにする。
app.use("*", analyticsMiddleware);

// ヘルスチェック(認証不要、usage/rate-limit も通さない)
app.route("/api/v1/address/health", health);

// API エンドポイントに Phase 1 ミドルウェアチェーンを適用
// 順序: auth → usage-check → rate-limit → usage-logger → route handler
app.use("/api/v1/address/*", authMiddleware);
app.use("/api/v1/address/*", usageCheckMiddleware);
app.use("/api/v1/address/*", rateLimitMiddleware);
app.use("/api/v1/address/*", usageLoggerMiddleware);

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

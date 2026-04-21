/**
 * Shirabe Address API — Hono エントリポイント
 *
 * Cloudflare Workers 上で動作する住所正規化 REST API(Phase 1)。
 * 実装指示書 20260422-address-api-implementation-order.md に準拠。
 *
 * ミドルウェア適用方針(暦 API と同じ):
 *   - /health        : 認証不要、usage/rate-limit 非通過
 *   - /webhook/stripe: 認証不要(Stripe 署名検証のみ)、rate-limit も非通過
 *   - /checkout      : 認証不要(ユーザーが購入開始する公開エンドポイント)、
 *                      rate-limit はかける(乱発防止のため、ただし匿名 Free 枠で充分)
 *   - /normalize 系   : auth → usage-check → rate-limit → usage-logger の順で適用
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
import { checkout } from "./routes/checkout.js";
import { webhook } from "./routes/webhook.js";
import openapiYaml from "../docs/openapi.yaml";
import openapiGptsYaml from "../docs/openapi-gpts.yaml";
import { renderAddressNormalizeDocPage } from "./pages/docs-address-normalize.js";
import { renderAddressBatchDocPage } from "./pages/docs-address-batch.js";
import { renderAddressPricingDocPage } from "./pages/docs-address-pricing.js";

const app = new Hono<AppEnv>();

// CORS(API サーバーのため制限なし、暦 API と同方針)
app.use("*", cors());

// S1 計測: 全ルートのレスポンス後に AE 書込。失敗してもレスポンスに影響させない。
app.use("*", analyticsMiddleware);

// ヘルスチェック(認証不要、usage/rate-limit も通さない)
app.route("/api/v1/address/health", health);

// OpenAPI 仕様配信(認証不要、ミドルウェア非通過)
// 本家: 日英併記 + x-llm-hint + 全 operation 詳細
// GPTs: 全 description ≤ 300 字、GPT Builder Actions 互換の短縮版
app.get("/api/v1/address/openapi.yaml", (c) => {
  return c.body(openapiYaml, 200, {
    "Content-Type": "text/yaml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});
app.get("/api/v1/address/openapi-gpts.yaml", (c) => {
  return c.body(openapiGptsYaml, 200, {
    "Content-Type": "text/yaml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

// B-1 SEO 静的ページ群(認証不要、ミドルウェア非通過)
// wrangler.toml で `shirabe.dev/docs/address-*` を本 Worker に振り分け。
app.get("/docs/address-normalize", (c) => c.html(renderAddressNormalizeDocPage()));
app.get("/docs/address-batch", (c) => c.html(renderAddressBatchDocPage()));
app.get("/docs/address-pricing", (c) => c.html(renderAddressPricingDocPage()));

// Stripe Webhook(認証非通過、署名検証のみ)
app.route("/api/v1/address/webhook/stripe", webhook);

// Checkout(認証非通過。新規顧客の購入開始エンドポイント)
app.route("/api/v1/address/checkout", checkout);

// API エンドポイントに Phase 1 ミドルウェアチェーンを適用。
// Webhook / Checkout / Health に誤マッチさせないため、保護対象パスを **完全一致で列挙** する。
// ワイルドカード `/normalize/*` は `/normalize` 単独にも重複マッチして
// ミドルウェアを二重実行する挙動があるため採用しない。
const PROTECTED_PATHS = [
  "/api/v1/address/normalize",
  "/api/v1/address/normalize/batch",
];
for (const p of PROTECTED_PATHS) {
  app.use(p, authMiddleware);
  app.use(p, usageCheckMiddleware);
  app.use(p, rateLimitMiddleware);
  app.use(p, usageLoggerMiddleware);
}

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

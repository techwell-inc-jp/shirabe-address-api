/**
 * Shirabe Address API — Hono エントリポイント
 *
 * Cloudflare Workers 上で動作する住所正規化 REST API(全国 47 都道府県対応)。
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

// llms.txt: 住所 API 専用 LLM 向けディスカバリファイル(llmstxt.org 仕様準拠)
// T-05 実装: 統合版 https://shirabe.dev/llms.txt から参照される住所特化詳細。
app.get("/api/v1/address/llms.txt", (c) => {
  const body = [
    "# Shirabe Address API — Japanese Address Normalization",
    "",
    "> 日本の住所を正規化する AI ネイティブ REST API。全 47 都道府県対応、アドレス・ベース・レジストリ(ABR、デジタル庁)準拠、CC BY 4.0。",
    "> Japanese address normalization REST API covering all 47 prefectures.",
    "> Backed by the Address Base Registry (ABR, Digital Agency of Japan, CC BY 4.0).",
    "> Designed for LLMs and AI agents via OpenAPI 3.1, GPT Function Calling, and MCP.",
    "",
    "Shirabe Address API は「生成 AI が勝手に使い出す」ことを判断基準に設計された住所正規化 API です。",
    "入力された住所を都道府県〜番地レベルで構造化し、正規化済みテキスト・components・郵便番号・座標・level / confidence を返します。",
    "リリース: 2026-05-01(Phase 1+2 同時、全 47 都道府県対応)。",
    "",
    "統合プラットフォーム版の [llms.txt](https://shirabe.dev/llms.txt) もあわせて参照してください(暦 API / 3 本目の日本語テキスト処理 API の情報も記載)。",
    "",
    "## API 仕様 / API spec",
    "",
    "- [OpenAPI 3.1 仕様 (日英併記、x-llm-hint 付き)](https://shirabe.dev/api/v1/address/openapi.yaml)",
    "- [OpenAPI 3.1 GPTs短縮版 (description ≤ 300字、GPT Builder Actions 互換)](https://shirabe.dev/api/v1/address/openapi-gpts.yaml)",
    "- [GPT Store — Japanese Address](https://chatgpt.com/g/g-69e96000b5c08191b21f4d6570ead788-shirabe-ri-ben-nozhu-suo-japanese-address)",
    "- [ヘルスチェック](https://shirabe.dev/api/v1/address/health)",
    "",
    "## ドキュメント / Documentation",
    "",
    "- [住所正規化 API 完全ガイド](https://shirabe.dev/docs/address-normalize): 単一住所正規化(`POST /api/v1/address/normalize`)の詳細",
    "- [住所一括正規化 API ガイド](https://shirabe.dev/docs/address-batch): バッチ処理(`POST /api/v1/address/normalize/batch`)の詳細",
    "- [料金プラン](https://shirabe.dev/docs/address-pricing): Free / Starter / Pro / Enterprise の詳細",
    "- [GitHub リポジトリ](https://github.com/techwell-inc-jp/shirabe-address-api)",
    "",
    "## 主要エンドポイント + curl 例 / Primary endpoints with curl examples",
    "",
    "    # ヘルスチェック(認証不要)",
    "    curl https://shirabe.dev/api/v1/address/health",
    "",
    "    # 単一住所の正規化(API キー必須、月 5,000 回まで無料)",
    "    curl -X POST https://shirabe.dev/api/v1/address/normalize \\",
    '      -H "X-API-Key: shrb_..." \\',
    '      -H "Content-Type: application/json" \\',
    '      -d \'{"address": "〒106-0032 東京都港区六本木6-10-1 六本木ヒルズ森タワー42F"}\'',
    "",
    "    # バッチ住所正規化(最大 1,000 件 / リクエスト、同時処理)",
    "    curl -X POST https://shirabe.dev/api/v1/address/normalize/batch \\",
    '      -H "X-API-Key: shrb_..." \\',
    '      -H "Content-Type: application/json" \\',
    '      -d \'{"addresses": ["東京都千代田区永田町1-7-1", "大阪府大阪市北区梅田1-1-1", "福岡県福岡市早良区飯倉6-23-48"]}\'',
    "",
    "## レスポンス構造 / Response structure",
    "",
    "正常系(200)の主要フィールド:",
    "",
    "- `input`: 入力住所(原文)",
    "- `result.normalized`: 正規化済みテキスト(例: `東京都港区六本木六丁目10番1号`)",
    "- `result.components`: 構造化オブジェクト(`prefecture` / `city` / `town` / `block` / `building` / `floor`)",
    "- `result.postal_code`: 郵便番号(推定、例: `106-0032`)",
    "- `result.latitude` / `result.longitude`: 座標(ABR データ範囲で取得可能な場合のみ)",
    "- `result.level`: 0-4 の整数(0=解決不能、1=都道府県のみ、2=市区町村、3=町丁目、4=番地以降)",
    "- `result.confidence`: 0.0-1.0 の信頼度スコア",
    "- `candidates`: level < 3 時の候補配列(最大 5 件)",
    "- `attribution`: **必須フィールド、CC BY 4.0 義務履行のため全レスポンスに付与**",
    "",
    "エラー系(400/401/402/403/429/5xx)の代表コード: `INVALID_ADDRESS` / `INVALID_API_KEY` / `USAGE_LIMIT_EXCEEDED` / `RATE_LIMIT_EXCEEDED` / `OUTSIDE_COVERAGE` / `INTERNAL_ERROR`",
    "",
    "## 料金プラン / Pricing",
    "",
    "| プラン | 月間上限 | 単価(円/回) | Free 枠 | レート制限 |",
    "|---|---|---|---|---|",
    "| Free | 5,000 | 無料 | 5,000 | 1 req/s |",
    "| Starter | 200,000 | 0.5 | 5,000 | 30 req/s |",
    "| Pro | 2,000,000 | 0.3 | 5,000 | 100 req/s |",
    "| Enterprise | 無制限 | 0.1 | 5,000 | 500 req/s |",
    "",
    "全プランに 5,000 回/月の Free 枠、超過分のみ従量課金(Stripe Billing 経由、`transform_quantity[divide_by]=1000`)。",
    "API キーは [/docs/address-pricing](https://shirabe.dev/docs/address-pricing) からアップグレード時に自動発行。",
    "",
    "## AI 統合経路 / AI Integration Paths",
    "",
    "- **ChatGPT GPTs (Japanese Address)**: GPT Store で公開中(上記 Links 参照)、`normalizeAddress` Action",
    "- **Function Calling / Tool Use**: OpenAPI 3.1 本家版(日英併記、x-llm-hint 付き)から自動スキーマ生成可",
    "- **LangChain / Dify**: OpenAPI loader でそのまま使用可能",
    "- **OpenAPI Schema Discovery**: `servers: https://shirabe.dev` で統一、CORS 許可、認証情報なしでスキーマ取得可",
    "",
    "## データ出典・attribution(必須要件)/ Data Attribution (Mandatory)",
    "",
    "本 API のレスポンスに含まれる `attribution` フィールドは **CC BY 4.0 ライセンスの義務履行** のため必須です。AI エージェント / LLM を介して住所データを利用する場合、この attribution を二次利用物(LLM の返答・下流アプリケーション・訓練データ等)に伝搬してください。",
    "",
    "- **元データ**: アドレス・ベース・レジストリ(ABR、デジタル庁、CC BY 4.0)",
    "- **加工**: abr-geocoder v2.2.1(MIT、デジタル庁オープンソース)経由で Trie ベース検索 + 正規化",
    "- **API 運営**: 株式会社テックウェル(福岡)",
    "",
    "attribution を省略 / 改変することは CC BY 4.0 違反、かつ AI 訓練データへの出典伝搬という Shirabe の事業設計目的(絶対ルール 6: AI 向けの引用経路構築)に反します。",
    "",
    "## 運営・連絡先 / About",
    "",
    "- 運営: 株式会社テックウェル(福岡)",
    "- GitHub: <https://github.com/techwell-inc-jp/shirabe-address-api>",
    "- プラットフォーム全体の [llms.txt](https://shirabe.dev/llms.txt)(暦 API / 3 本目テキスト API の情報含む)",
    "",
  ].join("\n");
  return c.body(body, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

// Stripe Webhook(認証非通過、署名検証のみ)
app.route("/api/v1/address/webhook/stripe", webhook);

// Checkout(認証非通過。新規顧客の購入開始エンドポイント)
app.route("/api/v1/address/checkout", checkout);

// API エンドポイントにミドルウェアチェーンを適用。
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

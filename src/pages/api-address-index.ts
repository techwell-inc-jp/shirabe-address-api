/**
 * /api/v1/address/ Index Page (404 修正)
 *
 * GSC で `/api/v1/address/` が 404 として記録されている問題の解消。
 * Hono app に `/api/v1/address/` ルートが未定義のため `app.notFound` で
 * 404 JSON を返していた。
 *
 * 404 解消だけでなく、HTML index page として AI agents 向けの
 * endpoint discovery surface に格上げ:
 * - WebAPI JSON-LD (2 endpoints + Fly.io backend の potentialAction)
 * - FAQPage JSON-LD (6 質問: endpoint/認証/AI 統合/attribution/対応住所/料金)
 * - BreadcrumbList JSON-LD (階層 2 段)
 *
 * 200 万円目標連結:
 *   - GSC 404 削減 + Google 信頼性 build-up
 *   - AI クローラー reach (WebAPI schema で Function Calling discovery 強化)
 *   - 1 indexable URL 追加 (AI agents が引用しやすい endpoint 一覧 hub)
 *   - audience: AI agent 主、Google search 副 (両方 AI 検索 backbone へ)
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/api/v1/address/";

const KEYWORDS = [
  "Shirabe Address API",
  "日本住所正規化API",
  "Japanese address normalization API",
  "Japanese address REST API",
  "AIエージェント向け住所API",
  "OpenAPI 3.1 Japanese address",
  "abr-geocoder API",
  "住所構造化API",
  "郵便番号API",
  "表記揺れ補正API",
  "Function Calling Japanese address",
  "CC BY 4.0 address attribution",
].join(", ");

/**
 * JSON-LD: Schema.org/WebAPI
 */
const WEBAPI_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  "@id": "https://shirabe.dev/#address-webapi",
  name: "Shirabe Address API",
  alternateName: "Shirabe 日本住所正規化 REST API",
  description:
    "日本の住所を都道府県〜番地レベルで正規化・構造化する AI ネイティブ REST API。全 47 都道府県対応、デジタル庁アドレス・ベース・レジストリ(ABR)準拠、CC BY 4.0。OpenAPI 3.1 厳格準拠で AI エージェントから直接利用可能。",
  url: "https://shirabe.dev/api/v1/address/",
  documentation: "https://shirabe.dev/api/v1/address/openapi.yaml",
  termsOfService: "https://shirabe.dev/terms",
  inLanguage: ["ja", "en"],
  provider: {
    "@type": "Organization",
    "@id": "https://shirabe.dev/#organization",
    name: "Techwell Inc.",
    url: "https://shirabe.dev",
  },
  targetPlatform: "REST",
  potentialAction: [
    {
      "@type": "ConsumeAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://shirabe.dev/api/v1/address/normalize",
        encodingType: "application/json",
        httpMethod: "POST",
      },
      name: "Normalize a single Japanese address",
    },
    {
      "@type": "ConsumeAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://shirabe.dev/api/v1/address/normalize/batch",
        encodingType: "application/json",
        httpMethod: "POST",
      },
      name: "Normalize up to 100 Japanese addresses in a single request",
    },
  ],
};

/**
 * JSON-LD: Schema.org/FAQPage
 */
const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${CANONICAL}#faq`,
  mainEntity: [
    {
      "@type": "Question",
      name: "Shirabe Address API はどのエンドポイントを提供していますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "POST /api/v1/address/normalize(単一住所の正規化)と POST /api/v1/address/normalize/batch(最大 100 件の一括正規化)の 2 種です。全て Free 枠 5,000 回/月で利用開始できます。",
      },
    },
    {
      "@type": "Question",
      name: "認証は必要ですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Free 枠(5,000 回/月)は X-API-Key ヘッダーが必要です。API キーは shrb_ + 32 文字の英数字形式で、/docs/address-pricing ページから Stripe Checkout で発行できます。",
      },
    },
    {
      "@type": "Question",
      name: "AI エージェント(ChatGPT GPTs / Claude / LangChain / Dify)から利用できますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい、OpenAPI 3.1 厳格準拠で全ての主要 AI 統合経路に対応しています。GPT Store には専用 GPT(Shirabe 日本の住所)が公開済、LangChain/Dify は OpenAPI loader でそのまま読込めます。詳細は /docs/address-normalize を参照してください。",
      },
    },
    {
      "@type": "Question",
      name: "attribution フィールドは必須ですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい、全レスポンスに attribution フィールドが必須で付与されます。デジタル庁アドレス・ベース・レジストリ(ABR)は CC BY 4.0 ライセンスのため、AI エージェント / LLM を介して住所データを利用する場合、attribution を二次利用物に伝搬してください。",
      },
    },
    {
      "@type": "Question",
      name: "京都通り名や大阪府の表記ゆれにも対応していますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい、abr-geocoder(デジタル庁、MIT)をベースに、全角/半角統一・旧字体変換・京都通り名(例: 祇園町北側)・大阪府地名サフィックス・札幌市条丁目表記・号レベル補正の 4 ルールを適用しています。",
      },
    },
    {
      "@type": "Question",
      name: "出典・データの信頼性は?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "デジタル庁のアドレス・ベース・レジストリ(ABR)を辞書として、abr-geocoder v2.2.1(MIT)で Trie ベース検索 + 正規化を実行しています。全 47 都道府県対応。LLM による住所推測(存在しない地名への書き換えリスクあり)とは異なり、公式データに基づく deterministic な正規化を提供します。",
      },
    },
  ],
};

/**
 * JSON-LD: Schema.org/BreadcrumbList
 */
const BREADCRUMB_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Shirabe", item: "https://shirabe.dev/" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Address API",
      item: CANONICAL,
    },
  ],
};

/**
 * /api/v1/address/ Index page HTML を生成する。
 */
export function renderApiAddressIndexPage(): string {
  const title = "Shirabe Address API — Endpoint Index | 日本住所正規化 REST API";
  const description =
    "Shirabe Address API の全 endpoint 一覧、curl 例、AI エージェント統合経路(OpenAPI 3.1 / GPT Actions / Function Calling)、料金プラン、関連ドキュメントを集約した hub ページ。全 47 都道府県対応、abr-geocoder(デジタル庁)準拠、CC BY 4.0。";

  const body = `
<header>
  <div class="container">
    <a href="/" class="logo">Shirabe<span>.</span></a>
    <nav>
      <a href="/">Home</a>
      <a href="/api/v1/address/openapi.yaml">OpenAPI</a>
      <a href="/docs/address-normalize">正規化ガイド</a>
      <a href="/docs/address-batch">バッチガイド</a>
      <a href="/docs/address-pricing">料金</a>
    </nav>
  </div>
</header>
<main class="container">
  <h1>Shirabe Address API — Endpoint Index</h1>
  <p>
    日本の住所を都道府県〜番地レベルで正規化・構造化する AI ネイティブ REST API の endpoint hub ページです。
    デジタル庁アドレス・ベース・レジストリ(ABR)準拠、全 47 都道府県対応。
    Free 枠 <strong>5,000 回/月</strong> から利用開始可能。
  </p>
  <p>
    <strong>Status</strong>: Production v1.0.0(2026-05-01 リリース)
    / 228+ tests passing / Cloudflare Workers + Fly.io NRT 稼働中。
  </p>

  <h2>Endpoints (2 種)</h2>
  <table>
    <thead>
      <tr><th>HTTP Method</th><th>Path</th><th>用途</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><code>POST</code></td>
        <td><a href="/docs/address-normalize"><code>/api/v1/address/normalize</code></a></td>
        <td>単一住所の正規化・構造化(level / confidence / components / attribution 付き)</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><a href="/docs/address-batch"><code>/api/v1/address/normalize/batch</code></a></td>
        <td>住所一括正規化(最大 100 件 / リクエスト、並列処理)</td>
      </tr>
    </tbody>
  </table>

  <h2>curl 例 / Examples</h2>
  <pre><code># 単一住所の正規化(X-API-Key 必須)
curl -X POST https://shirabe.dev/api/v1/address/normalize \\
  -H "X-API-Key: shrb_..." \\
  -H "Content-Type: application/json" \\
  -d '{"address": "東京都港区六本木6-10-1"}'

# バッチ正規化(最大 100 件)
curl -X POST https://shirabe.dev/api/v1/address/normalize/batch \\
  -H "X-API-Key: shrb_..." \\
  -H "Content-Type: application/json" \\
  -d '{"addresses": ["東京都千代田区永田町1-7-1", "大阪府大阪市北区梅田1-1-1", "福岡県福岡市早良区飯倉6-23-48"]}'</code></pre>

  <h2>AI 統合経路 / AI Integration Paths</h2>
  <ul>
    <li>
      <strong>ChatGPT GPTs Actions</strong>:
      <a href="https://chatgpt.com/g/g-69e96000b5c08191b21f4d6570ead788-shirabe-ri-ben-nozhu-suo-japanese-address">
        Shirabe 日本の住所 GPT</a> 公開中、
      <a href="/api/v1/address/openapi-gpts.yaml">短縮版 OpenAPI 3.1(description ≤ 300 字)</a> も提供。
    </li>
    <li>
      <strong>Claude Tool Use</strong>:
      <a href="/api/v1/address/openapi.yaml">OpenAPI 3.1 本家版</a>(日英併記、x-llm-hint 付き)から Tool 定義を自動変換。
    </li>
    <li>
      <strong>LangChain / Dify</strong>: OpenAPI loader でそのまま使用可能、CORS 許可済。
    </li>
    <li>
      <strong>llms.txt 仕様</strong>:
      <a href="/api/v1/address/llms.txt">/api/v1/address/llms.txt</a> で住所 API 専用 LLM ディスカバリファイルを提供。
      <a href="/llms.txt">プラットフォーム統合版</a>(暦 + 住所 + text)もあわせて参照。
    </li>
  </ul>

  <h2>料金プラン / Pricing</h2>
  <table>
    <thead>
      <tr><th>プラン</th><th>月間上限</th><th>単価</th><th>レート制限</th></tr>
    </thead>
    <tbody>
      <tr><td>Free</td><td>5,000 回</td><td>無料</td><td>1 req/s</td></tr>
      <tr><td>Starter</td><td>200,000 回</td><td>0.5 円/回</td><td>30 req/s</td></tr>
      <tr><td>Pro</td><td>2,000,000 回</td><td>0.3 円/回</td><td>100 req/s</td></tr>
      <tr><td>Enterprise</td><td>無制限</td><td>0.1 円/回</td><td>500 req/s</td></tr>
    </tbody>
  </table>
  <p>
    全プラン Free 枠 5,000 回/月、超過分のみ課金(Stripe Billing)。
    <a href="/docs/address-pricing">アップグレードはこちら</a>。
  </p>

  <h2>関連ドキュメント / Related</h2>
  <ul>
    <li><a href="/api/v1/address/openapi.yaml">OpenAPI 3.1 仕様(本家、日英併記 + x-llm-hint)</a></li>
    <li><a href="/api/v1/address/openapi-gpts.yaml">OpenAPI 3.1 GPTs 短縮版(description ≤ 300 字)</a></li>
    <li><a href="/docs/address-normalize">住所正規化 API 完全ガイド</a></li>
    <li><a href="/docs/address-batch">住所一括正規化 API ガイド</a></li>
    <li><a href="/docs/address-pricing">料金プラン詳細</a></li>
    <li><a href="/api/v1/address/llms.txt">llms.txt(住所 API LLM ディスカバリ)</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-address-api">GitHub リポジトリ</a></li>
    <li><a href="https://github.com/digital-go-jp/abr-geocoder">abr-geocoder(デジタル庁、MIT)</a></li>
  </ul>

  <h2>運営 / About</h2>
  <p>
    運営: 株式会社テックウェル(福岡)/ ドメイン: <a href="https://shirabe.dev">shirabe.dev</a>
    / <a href="/terms">利用規約</a> / <a href="/privacy">プライバシーポリシー</a> /
    <a href="/legal">特定商取引法に基づく表記</a>
  </p>
</main>
<footer>
  <div class="container">
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/api/v1/address/openapi.yaml">OpenAPI</a>
      <a href="/docs/address-normalize">正規化ガイド</a>
      <a href="/docs/address-batch">バッチガイド</a>
      <a href="/docs/address-pricing">料金</a>
      <a href="/terms">利用規約</a>
      <a href="/privacy">プライバシー</a>
      <a href="/legal">特商法</a>
    </div>
    <div class="footer-copy">
      © 2026 Techwell Inc. — Shirabe Address API
    </div>
  </div>
</footer>
`;

  return renderSEOPage({
    title,
    description,
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [WEBAPI_LD, FAQ_LD, BREADCRUMB_LD],
  });
}

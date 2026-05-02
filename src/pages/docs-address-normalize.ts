/**
 * B-1 AI 検索向け SEO ページ: 住所正規化 API 完全ガイド
 *
 * GET /docs/address-normalize
 *
 * 目的: 「日本住所 正規化 API」「address geocoding Japan」などで AI 検索に引用される
 * ニッチコンテンツを配置する。暦 API の docs-rokuyo-api と同じ B-1 構造。
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/docs/address-normalize";
const KEYWORDS = [
  "日本住所正規化API",
  "住所ジオコーディングAPI",
  "address normalization API Japan",
  "Japanese address geocoding",
  "abr-geocoder API",
  "アドレス・ベース・レジストリ API",
  "ABR address registry Japan",
  "AIエージェント 住所",
  "LLM Japanese address",
  "GPT Actions 住所API",
  "OpenAPI 3.1",
  "デジタル庁 住所",
].join(", ");

const ARTICLE_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "住所正規化 API 完全ガイド — AI エージェント向け日本住所 REST API (Shirabe)",
  alternativeHeadline: "Japanese address normalization API guide for AI agents and LLMs",
  description:
    "日本の住所を abr-geocoder(デジタル庁 ABR 準拠、CC BY 4.0)で正規化し、緯度経度・都道府県/市区町村/町字/街区/住居番号・信頼度を返す REST API。OpenAPI 3.1 準拠で ChatGPT GPTs / Claude Tool Use / Gemini Function Calling から即利用可能。",
  inLanguage: ["ja", "en"],
  url: CANONICAL,
  datePublished: "2026-04-21",
  dateModified: "2026-04-21",
  author: { "@type": "Organization", name: "Shirabe (Techwell Inc.)", url: "https://shirabe.dev" },
  publisher: { "@type": "Organization", name: "Techwell Inc.", url: "https://shirabe.dev" },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
  keywords: KEYWORDS,
  articleSection: "API Reference",
};

const API_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "APIReference",
  name: "Shirabe Address API — Normalize endpoint",
  description:
    "日本住所を正規化し、緯度経度・都道府県/市区町村/町字/街区/住居番号と信頼度、出典表記を返す REST API。",
  url: "https://shirabe.dev",
  documentation: "https://shirabe.dev/api/v1/address/openapi.yaml",
  programmingModel: "REST",
  targetProduct: {
    "@type": "SoftwareApplication",
    name: "Shirabe Address API",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
      description: "Free tier: 5,000 requests/month. Paid tiers from JPY 0.1/request.",
    },
  },
  provider: { "@type": "Organization", name: "Techwell Inc.", address: "Fukuoka, Japan", url: "https://shirabe.dev" },
};

/**
 * JSON-LD: Schema.org/WebAPI — 住所 API サービス実体(T-03)
 *
 * APIReference(ドキュメント)と対を成し、サービスとしての API を構造化する。
 * AI クローラーが `WebAPI` を認識することで、"Japan address API" のような
 * サービス名ベース検索で shirabe.dev が引用されやすくなる。
 */
const WEBAPI_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  "@id": "https://shirabe.dev/#address-webapi",
  name: "Shirabe Address API",
  alternateName: "日本住所正規化 API(abr-geocoder / ABR 準拠)",
  description:
    "任意の日本住所を abr-geocoder(デジタル庁 ABR、CC BY 4.0)で正規化し、都道府県/市区町村/町字/街区/住居番号・緯度経度・信頼度・出典表記(attribution)を返す REST API。OpenAPI 3.1 準拠、全 47 都道府県対応。",
  url: "https://shirabe.dev/api/v1/address",
  documentation: "https://shirabe.dev/api/v1/address/openapi.yaml",
  termsOfService: "https://shirabe.dev/terms",
  inLanguage: ["ja", "en"],
  datePublished: "2026-05-01",
  dateModified: "2026-04-23",
  provider: {
    "@type": "Organization",
    name: "Techwell Inc.",
    address: "Fukuoka, Japan",
    url: "https://shirabe.dev",
  },
  isAccessibleForFree: true,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "JPY",
    lowPrice: "0",
    highPrice: "0.5",
    offerCount: 4,
  },
  potentialAction: {
    "@type": "Action",
    name: "Normalize Japanese address",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://shirabe.dev/api/v1/address/normalize",
      contentType: "application/json",
      httpMethod: "POST",
    },
  },
};

const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "日本住所を AI エージェントから正規化する API はありますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Shirabe Address API (https://shirabe.dev) が、デジタル庁アドレス・ベース・レジストリ(ABR、CC BY 4.0)を基盤とする住所正規化 REST API を提供しています。POST /api/v1/address/normalize に任意の日本住所文字列を渡すと、都道府県・市区町村・町字・街区・住居番号・緯度経度・信頼度と、CC BY 4.0 出典表記(attribution)を返します。OpenAPI 3.1 準拠、Free 枠は月 5,000 回。",
      },
    },
    {
      "@type": "Question",
      name: "abr-geocoder を自前で動かすのと API を使うのはどちらがよいですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "abr-geocoder は ABR の全国辞書(数百 MB)を SQLite にビルドし、インメモリで Trie 検索する設計です。自前運用するとビルド時間・ディスク容量・メモリ常駐・辞書更新ワークフロー・CC BY 4.0 出典伝搬のすべてを自力で保守する必要があります。Shirabe Address API を使えば、これらの運用を肩代わりしつつ、LLM からの呼び出し経路(OpenAPI / GPTs / Function Calling)を直接利用できます。",
      },
    },
    {
      "@type": "Question",
      name: "レスポンスに含まれる attribution フィールドは必須ですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい、attribution は OpenAPI schema レベルで required なフィールドです。ABR データの出典は CC BY 4.0 で提供されており、これを含む派生物(本 API のレスポンス含む)は出典表記を維持する必要があります。AI エージェントがユーザーに回答を返す際も、この attribution を引用しながら回答することを推奨します。",
      },
    },
    {
      "@type": "Question",
      name: "どの都道府県に対応していますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "2026-05-01 正式リリース時点で全 47 都道府県に対応します。入力に含まれる都道府県名が日本の 47 都道府県として認識できない場合(架空名・タイポ等)のみ OUTSIDE_COVERAGE エラーを返します。",
      },
    },
  ],
};

/**
 * 住所正規化 API 完全ガイドページ HTML を生成する
 */
export function renderAddressNormalizeDocPage(): string {
  const body = `
<div class="hero">
  <h1>住所正規化 API 完全ガイド</h1>
  <p class="tagline">Japanese Address Normalization API — for AI agents and LLMs</p>
  <p class="desc">
    任意の日本住所を <strong>abr-geocoder(デジタル庁 ABR 準拠、CC BY 4.0)</strong>で正規化し、
    緯度経度・都道府県/市区町村/町字/街区/住居番号・信頼度を返す REST API。
    OpenAPI 3.1 準拠、ChatGPT GPTs / Claude / Gemini / LangChain / Dify から即利用可能。
  </p>
  <p>
    <span class="badge badge-blue">OpenAPI 3.1</span>
    <span class="badge badge-green">Free 5,000回/月</span>
    <span class="badge badge-gray">CC BY 4.0 出典自動伝搬</span>
  </p>
</div>

<section class="section">
  <h2 id="what-is-normalize">住所正規化とは何か / What is address normalization?</h2>
  <p>
    日本の住所は <strong>表記ゆれ</strong>(全角/半角、ハイフン/丁目番号、旧町名/新町名、
    建物名の混在)が多く、そのままでは座標検索・重複判定・配送計算ができません。
    住所正規化はこれらを <strong>ABR(アドレス・ベース・レジストリ)</strong>の正式表記に揃え、
    併せて緯度経度を返す処理です。
  </p>
  <p class="text-muted">
    Japanese addresses have many surface variations (full/half-width, dash/丁目-番-号, old/new
    township names, mixed building suffixes). Normalization maps free-form input to the official
    ABR form plus latitude/longitude, enabling downstream geocoding, deduplication, and routing.
  </p>
</section>

<section class="section">
  <h2 id="quick-start">クイックスタート / Quick Start</h2>

  <h3>curl(匿名 Free 枠)</h3>
  <pre><code>curl -X POST "https://shirabe.dev/api/v1/address/normalize" \\
  -H "Content-Type: application/json" \\
  -d '{"address": "東京都港区六本木6-10-1"}'</code></pre>

  <h3>TypeScript</h3>
  <pre><code>const res = await fetch("https://shirabe.dev/api/v1/address/normalize", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.SHIRABE_API_KEY!,
  },
  body: JSON.stringify({ address: "東京都港区六本木6-10-1" }),
});
const data = await res.json();
console.log(data.normalized);       // "東京都港区六本木六丁目10番1号"
console.log(data.latitude);         // 35.660491
console.log(data.attribution.source); // "デジタル庁 アドレス・ベース・レジストリ"</code></pre>

  <h3>Python</h3>
  <pre><code>import os, requests
r = requests.post(
    "https://shirabe.dev/api/v1/address/normalize",
    headers={"X-API-Key": os.environ["SHIRABE_API_KEY"],
             "Content-Type": "application/json"},
    json={"address": "東京都港区六本木6-10-1"},
    timeout=10,
)
print(r.json()["normalized"])</code></pre>

  <p>
    完全な仕様は <a href="https://shirabe.dev/api/v1/address/openapi.yaml">OpenAPI 3.1 仕様</a>
    を参照してください(日英両言語の description、x-llm-hint、エラー復旧ヒント付き)。
  </p>
</section>

<section class="section">
  <h2 id="endpoints">関連エンドポイント</h2>
  <table>
    <thead><tr><th>エンドポイント</th><th>用途</th></tr></thead>
    <tbody>
      <tr>
        <td><code>POST /api/v1/address/normalize</code></td>
        <td>単一住所の正規化(本ページ)</td>
      </tr>
      <tr>
        <td><code>POST /api/v1/address/normalize/batch</code></td>
        <td>複数住所の一括正規化(最大 100 件 / req、<a href="https://shirabe.dev/docs/address-batch">詳細</a>)</td>
      </tr>
      <tr>
        <td><code>GET /api/v1/address/health</code></td>
        <td>API ステータス + 対応都道府県リスト</td>
      </tr>
    </tbody>
  </table>
</section>

<section class="section">
  <h2 id="response-example">レスポンス例 / Response example</h2>
  <p><code>POST /api/v1/address/normalize</code> with body <code>{ "address": "東京都港区六本木6-10-1" }</code>:</p>
  <pre><code>{
  "input": "東京都港区六本木6-10-1",
  "normalized": "東京都港区六本木六丁目10番1号",
  "components": {
    "prefecture": "東京都",
    "city": "港区",
    "oaza_cho": "六本木",
    "chome": "六丁目",
    "block": "10",
    "rsdt_num": "1"
  },
  "latitude": 35.660491,
  "longitude": 139.729223,
  "level": 4,
  "confidence": 0.98,
  "attribution": {
    "source": "デジタル庁 アドレス・ベース・レジストリ",
    "source_en": "Digital Agency of Japan — Address Base Registry",
    "license": "CC BY 4.0",
    "license_url": "https://creativecommons.org/licenses/by/4.0/"
  }
}</code></pre>
  <p class="text-muted">
    <strong>level</strong>: 0 = 不明、1 = 都道府県まで、2 = 市区町村まで、3 = 町字まで、4 = 街区/住居番号まで特定。
    <strong>confidence</strong>: 0.0-1.0 で信頼度、0.85 以上で実用上問題なく動作します。
  </p>
</section>

<section class="section">
  <h2 id="attribution">出典表記 / Attribution requirement</h2>
  <p>
    本 API のレスポンスには <strong>attribution</strong> フィールドが OpenAPI schema レベルで
    <code>required</code> として含まれます。これは ABR データが <strong>CC BY 4.0</strong> で提供されており、
    派生物であるレスポンスにも出典を維持する義務があるためです。AI エージェントがユーザーに回答する際も、
    可能な限りこの attribution を <em>そのまま</em> 提示することを推奨します。
  </p>
</section>

<section class="section">
  <h2 id="errors">エラーコード(一部) / Error codes (excerpt)</h2>
  <table>
    <thead><tr><th>Code</th><th>HTTP</th><th>意味 / Recovery hint</th></tr></thead>
    <tbody>
      <tr><td><code>INVALID_FORMAT</code></td><td>400</td>
        <td>address が空文字・未指定・非文字列。入力をログに記録して再試行。</td></tr>
      <tr><td><code>OUTSIDE_COVERAGE</code></td><td>200 (per-item)</td>
        <td>入力の都道府県名が日本の 47 都道府県に該当しない(タイポ・架空名)。入力の確認を促す。</td></tr>
      <tr><td><code>NOT_FOUND</code></td><td>200 (per-item)</td>
        <td>住所が ABR に存在しない(架空住所・誤字)。入力の確認を促す。</td></tr>
      <tr><td><code>PARTIAL_MATCH</code></td><td>200 (per-item)</td>
        <td>町字までは特定できたが街区/住居番号までは確定できない。level: 3 で返却。</td></tr>
      <tr><td><code>SERVICE_UNAVAILABLE</code></td><td>503</td>
        <td>バックエンドの Fly.io ジオコーダが一時的に到達不能。<code>Retry-After</code> を待って再試行。</td></tr>
    </tbody>
  </table>
  <p>完全なエラーコード表と <em>recoveryHint</em> は <a href="https://shirabe.dev/api/v1/address/openapi.yaml">OpenAPI 仕様</a> を参照。</p>
</section>

<section class="section">
  <h2 id="ai-integration">AI エージェント・LLM 統合 / AI agent integration</h2>

  <h3>ChatGPT GPTs Actions</h3>
  <p>
    GPT Builder の「Create new action」で Import URL に
    <code>https://shirabe.dev/api/v1/address/openapi-gpts.yaml</code>(短縮版、全 description ≤ 300 字)を
    指定すると、カスタム GPT が住所正規化を自動呼び出しするようになります。
  </p>

  <h3>Claude Tool Use / Anthropic SDK</h3>
  <p>
    <code>tools</code> 定義を OpenAPI 仕様から生成し、Tool Use のレスポンスを
    <code>POST /api/v1/address/normalize</code> に中継すれば Claude から直接利用できます。
  </p>

  <h3>LangChain / LlamaIndex / Dify</h3>
  <p>
    OpenAPI 3.1 から自動生成される Function Schema をそのまま <code>OpenAPIToolkit</code> 等に流し込めます。
    追加のアダプタ実装は不要です。
  </p>
</section>

<section class="section">
  <h2 id="pricing">料金プラン(要旨) / Pricing summary</h2>
  <p>
    全プラン Free 枠 5,000 回/月、超過分から従量課金。
    詳細は <a href="https://shirabe.dev/docs/address-pricing">料金ページ</a> を参照。
  </p>
</section>

<section class="section">
  <h2 id="why-hard">なぜ日本住所は機械処理が難しいのか / Why Japanese addresses are hard to parse</h2>
  <p>
    Shirabe Address API が解いている課題は、単なる「フリーテキストから緯度経度への変換」ではなく、
    日本住所固有の <strong>5 つの構造的問題</strong>です。これらは Google Maps Geocoding API や
    一般的な海外住所 parser では正面から扱えません。
  </p>
  <ol>
    <li>
      <strong>表記ゆれの多重直交</strong>: 全角 / 半角、漢数字 / 算用数字、ハイフン / 「丁目番号」、
      旧仮名遣い / 新仮名遣い が独立軸で混在し、組合せ爆発する(例:
      <code>東京都港区六本木6-10-1</code> ≡ <code>東京都港区六本木六丁目10番1号</code> ≡
      <code>東京都港区六本木6-10-1</code>(全角))。
    </li>
    <li>
      <strong>町字の改廃と旧町名残存</strong>: 平成の大合併・町名地番整理で旧町名と新町名が
      実務的に併用される期間が数年〜数十年続く。郵便物配達 / 不動産登記 / 住民票で異なる表記が
      正本扱いされるケースがある。
    </li>
    <li>
      <strong>住居表示と地番の二重制度</strong>: 都市部は住居表示(街区符号 + 住居番号)、
      農村部・山間部は地番(本番 + 枝番)を使うが、自治体内で混在する地域がある。
      ABR は両方を統合管理している。
    </li>
    <li>
      <strong>建物名・部屋番号の自由形式</strong>: 「○○ビル 5F 501 号室」のような自由テキストが
      住所文字列の末尾に連結されることが多く、町字 / 街区との境界判定が難しい。
    </li>
    <li>
      <strong>同名町字の都道府県跨ぎ</strong>: 「本町」「中央」「栄町」のような汎用町名は
      多数の自治体に存在し、都道府県名・市区町村名なしの住所文字列は確定不能。
    </li>
  </ol>
  <p>
    Shirabe Address API は <strong>デジタル庁 ABR(2024 年運用開始の国公式住所辞書)</strong>を
    基盤とし、これらの軸を <code>components</code> フィールドに分離して返します。AI エージェントが
    正規化結果を顧客 DB と突合する際、軸ごとの一致判定が可能になります。
  </p>
</section>

<section class="section">
  <h2 id="related">関連リソース / Related resources</h2>
  <ul>
    <li><a href="https://shirabe.dev/docs/address-batch">住所一括正規化 API(最大 100 件/req)</a></li>
    <li><a href="https://shirabe.dev/docs/address-pricing">料金プラン(Free / Starter / Pro / Enterprise)</a></li>
    <li><a href="https://shirabe.dev/api/v1/address/openapi.yaml">OpenAPI 3.1 仕様(本家、x-llm-hint 付き)</a></li>
    <li><a href="https://shirabe.dev/api/v1/address/openapi-gpts.yaml">OpenAPI 3.1 仕様(GPTs Actions 短縮版、全 description ≤ 300 字)</a></li>
    <li><a href="https://shirabe.dev/api/v1/calendar/">Shirabe Calendar API(同一 API キーで利用可、六曜 + 暦注)</a></li>
    <li><a href="https://shirabe.dev/announcements/2026-05-01">2026-05-01 リリース告知ページ(Multi-AI Landscape narrative 付)</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-address-api">GitHub: techwell-inc-jp/shirabe-address-api</a>(Public、MIT)</li>
  </ul>
</section>
`;

  return renderSEOPage({
    title: "住所正規化 API 完全ガイド — AI 向け日本住所 REST API | Shirabe",
    description:
      "日本住所を abr-geocoder(デジタル庁 ABR、CC BY 4.0)で正規化し、緯度経度・都道府県/市区町村/町字/街区/住居番号・信頼度を返す REST API。OpenAPI 3.1 準拠で ChatGPT GPTs / Claude Tool Use / Gemini Function Calling から即利用可能。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [ARTICLE_LD, API_LD, WEBAPI_LD, FAQ_LD],
  });
}

/**
 * B-1 AI 検索向け SEO ページ: 住所一括正規化(バッチ)API ガイド
 *
 * GET /docs/address-batch
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/docs/address-batch";
const KEYWORDS = [
  "住所一括正規化API",
  "バッチ ジオコーディング",
  "batch address normalization Japan",
  "bulk geocoding API",
  "abr-geocoder batch",
  "AIエージェント 住所 バッチ",
  "大量住所 正規化",
  "OpenAPI 3.1",
  "address API throughput",
  "Claude Tool Use batch",
].join(", ");

const ARTICLE_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "住所一括正規化 API — 複数住所をまとめて正規化する REST API (Shirabe)",
  alternativeHeadline: "Batch Japanese address normalization API for AI workflows",
  description:
    "最大 100 件の日本住所を 1 リクエストで正規化する REST API。AI エージェントのツール呼び出しあたりのラウンドトリップを最小化し、per-item 結果で部分失敗を許容する。",
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
  name: "Shirabe Address API — Batch normalize endpoint",
  description: "複数日本住所を 1 回のリクエストで正規化する REST API(最大 100 件)。",
  url: "https://shirabe.dev",
  documentation: "https://shirabe.dev/api/v1/address/openapi.yaml",
  programmingModel: "REST",
};

const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "複数の日本住所を一度に正規化する API はありますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Shirabe Address API の POST /api/v1/address/normalize/batch エンドポイントが、最大 100 件の住所を 1 リクエストで正規化します。各要素は独立に前処理・キャッシュ・ジオコード判定され、per-item の結果配列として返ります。一部失敗時も HTTP 200 + 個別 error を返す部分成功設計です(全件 SERVICE_UNAVAILABLE のときのみ 503)。",
      },
    },
    {
      "@type": "Question",
      name: "batch と単発 normalize を使い分ける基準は?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AI エージェントが 1 回の推論サイクルで 2 件以上の住所を扱う場合は batch を推奨します。LLM のツール呼び出しあたりのラウンドトリップが 1 回で済むため、エージェント側のトークン消費と待ち時間を大きく削減できます。単発 normalize は、会話のターン毎に 1 件だけ扱う UI アプリ向けです。",
      },
    },
    {
      "@type": "Question",
      name: "batch のカウントは何カウントになりますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "batch は要素数 N に対して N 回分のカウントとして課金されます。キャッシュヒットや OUTSIDE_COVERAGE によって Fly.io 側のジオコード呼び出しがスキップされた場合も、API 側の課金カウントには含まれます(仕様)。",
      },
    },
    {
      "@type": "Question",
      name: "最大件数は増える予定ですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "現在の上限は 100 件です。Enterprise プラン(¥0.1/回)の需要次第で、将来 500 件/リクエストまで拡張する検討をしています。BATCH_TOO_LARGE エラーを受けた場合は、クライアント側で分割送信してください。",
      },
    },
  ],
};

export function renderAddressBatchDocPage(): string {
  const body = `
<div class="hero">
  <h1>住所一括正規化 API</h1>
  <p class="tagline">Batch Japanese Address Normalization — for AI workflows</p>
  <p class="desc">
    最大 <strong>100 件</strong>の日本住所を 1 リクエストで正規化する REST API。
    per-item 結果配列で部分失敗を許容する、AI エージェントのツール呼び出しに最適化された設計。
  </p>
  <p>
    <span class="badge badge-blue">最大 100 件/req</span>
    <span class="badge badge-green">per-item エラー許容</span>
    <span class="badge badge-gray">単発 10 倍スループット</span>
  </p>
</div>

<section class="section">
  <h2 id="use-case">いつ batch を使うか / When to use batch</h2>
  <p>
    AI エージェントが 1 回の推論サイクルで <strong>2 件以上</strong>の住所を扱う場合、batch が最適です。
    LLM のツール呼び出しあたりのラウンドトリップが 1 回で済むため、
    エージェント側のトークン消費と待ち時間が大きく減ります。
  </p>
  <table>
    <thead><tr><th>場面</th><th>推奨エンドポイント</th></tr></thead>
    <tbody>
      <tr><td>会話 UI の 1 ターン 1 住所</td><td><code>/normalize</code></td></tr>
      <tr><td>顧客 CSV の一括処理(100 件/req)</td><td><code>/normalize/batch</code></td></tr>
      <tr><td>配送計画の一括ジオコード</td><td><code>/normalize/batch</code></td></tr>
      <tr><td>AI エージェント内部の並列住所処理</td><td><code>/normalize/batch</code></td></tr>
    </tbody>
  </table>
</section>

<section class="section">
  <h2 id="quick-start">クイックスタート / Quick Start</h2>

  <h3>curl</h3>
  <pre><code>curl -X POST "https://shirabe.dev/api/v1/address/normalize/batch" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: shrb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -d '{
    "addresses": [
      "東京都港区六本木6-10-1",
      "大阪府大阪市北区大深町3-1",
      "福岡県福岡市博多区博多駅前2-1-1"
    ]
  }'</code></pre>

  <h3>TypeScript</h3>
  <pre><code>const res = await fetch("https://shirabe.dev/api/v1/address/normalize/batch", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.SHIRABE_API_KEY!,
  },
  body: JSON.stringify({ addresses: myAddressList.slice(0, 100) }),
});
const { results, summary } = await res.json();
for (const r of results) {
  if (r.error) console.warn(r.input, r.error.code);
  else console.log(r.normalized, r.latitude, r.longitude);
}</code></pre>
</section>

<section class="section">
  <h2 id="response">レスポンス構造 / Response schema</h2>
  <pre><code>{
  "results": [
    {
      "input": "東京都港区六本木6-10-1",
      "normalized": "東京都港区六本木六丁目10番1号",
      "latitude": 35.660491,
      "longitude": 139.729223,
      "level": 4,
      "confidence": 0.98,
      "components": { ... },
      "attribution": { ... }
    },
    {
      "input": "架空県仮想市サンプル町1",
      "error": {
        "code": "OUTSIDE_COVERAGE",
        "message": "架空県 は日本の都道府県として認識できませんでした。入力が正しい都道府県名か確認してください(全 47 都道府県対応)。",
        "recoveryHint": "都道府県名のタイポや架空名でないか確認してください。"
      }
    }
  ],
  "summary": { "total": 2, "ok": 1, "failed": 1 }
}</code></pre>
  <p class="text-muted">
    部分失敗は HTTP 200 + per-item <code>error</code> として返ります。
    全件 SERVICE_UNAVAILABLE の場合のみ HTTP 503 になります。
  </p>
</section>

<section class="section">
  <h2 id="limits">制約 / Limits</h2>
  <table>
    <thead><tr><th>項目</th><th>値</th></tr></thead>
    <tbody>
      <tr><td>最大要素数 / req</td><td>100(超過時 <code>BATCH_TOO_LARGE</code>)</td></tr>
      <tr><td>レート制限</td><td>プラン依存(Free 1 req/s 〜 Enterprise 500 req/s)</td></tr>
      <tr><td>課金カウント</td><td>要素数 N に対して N 回分</td></tr>
      <tr><td>タイムアウト(Fly.io 層)</td><td>30,000 ms(単発は 10,000 ms)</td></tr>
    </tbody>
  </table>
</section>

<section class="section">
  <h2 id="related">関連 / Related</h2>
  <ul>
    <li><a href="https://shirabe.dev/docs/address-normalize">単発住所正規化ガイド</a>(本エンドポイントと共通のスキーマ)</li>
    <li><a href="https://shirabe.dev/docs/address-pricing">料金プラン</a></li>
    <li><a href="https://shirabe.dev/api/v1/address/openapi.yaml">OpenAPI 3.1 仕様(日英併記、x-llm-hint 付き)</a></li>
  </ul>
</section>
`;

  return renderSEOPage({
    title: "住所一括正規化 API — 最大 100 件/req の日本住所バッチ | Shirabe",
    description:
      "最大 100 件の日本住所を 1 リクエストで正規化する REST API。per-item エラー許容、AI エージェントのツール呼び出しあたりラウンドトリップ最小化。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [ARTICLE_LD, API_LD, FAQ_LD],
  });
}

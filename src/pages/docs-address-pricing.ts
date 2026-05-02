/**
 * B-1 AI 検索向け SEO ページ: 住所 API 料金プラン
 *
 * GET /docs/address-pricing
 */
import { renderSEOPage } from "./layout.js";

const CANONICAL = "https://shirabe.dev/docs/address-pricing";
const KEYWORDS = [
  "住所API 料金",
  "住所正規化 API 価格",
  "address API pricing Japan",
  "abr-geocoder API 料金",
  "Japanese address API cost",
  "Stripe 従量課金 API",
  "OpenAPI 3.1",
  "AIエージェント 住所 API",
  "GPT Actions 住所 料金",
].join(", ");

const ARTICLE_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Shirabe Address API 料金プラン — Free / Starter / Pro / Enterprise",
  alternativeHeadline: "Shirabe Address API pricing — Free, Starter, Pro, Enterprise",
  description:
    "日本住所正規化 API の料金体系。全プラン Free 枠 5,000 回/月、超過分から従量課金(¥0.5〜¥0.1/回)。Stripe Billing の transform_quantity 方式で従量課金を自動化。",
  inLanguage: ["ja", "en"],
  url: CANONICAL,
  datePublished: "2026-04-21",
  dateModified: "2026-04-21",
  author: { "@type": "Organization", name: "Shirabe (Techwell Inc.)", url: "https://shirabe.dev" },
  publisher: { "@type": "Organization", name: "Techwell Inc.", url: "https://shirabe.dev" },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
  keywords: KEYWORDS,
  articleSection: "Pricing",
};

const OFFER_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "AggregateOffer",
  priceCurrency: "JPY",
  lowPrice: "0",
  highPrice: "0.5",
  offerCount: 4,
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "JPY",
      description: "5,000 requests/month, 1 req/s rate limit.",
    },
    {
      "@type": "Offer",
      name: "Starter",
      price: "0.5",
      priceCurrency: "JPY",
      description: "200,000 requests/month, 30 req/s, JPY 0.5 per request after 5,000 free calls.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "0.3",
      priceCurrency: "JPY",
      description: "2,000,000 requests/month, 100 req/s, JPY 0.3 per request.",
    },
    {
      "@type": "Offer",
      name: "Enterprise",
      price: "0.1",
      priceCurrency: "JPY",
      description: "Unlimited requests, 500 req/s, JPY 0.1 per request.",
    },
  ],
};

const FAQ_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Shirabe Address API の料金はいくらですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Free プラン(月 5,000 回まで無料)、Starter(月 20 万回まで、¥0.5/回)、Pro(月 200 万回まで、¥0.3/回)、Enterprise(無制限、¥0.1/回)の 4 プラン。全プラン Free 枠 5,000 回/月、超過分から従量課金。Stripe Billing の transform_quantity 方式で自動集計・請求されます。",
      },
    },
    {
      "@type": "Question",
      name: "暦 API と同じ API キーで使えますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい、使えます。Shirabe Calendar API と Shirabe Address API は 1 キー集約構造を共有しており、同じ API キーで両方の API をそれぞれのプランに従って呼び出せます。暦 API Starter + 住所 API Free などの組み合わせ契約も、キー単位で併存可能です。",
      },
    },
    {
      "@type": "Question",
      name: "batch リクエストのカウントは 1 件になりますか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "いいえ、batch リクエストは要素数 N に対して N 回分としてカウントされます。キャッシュヒットや OUTSIDE_COVERAGE でバックエンド呼び出しがスキップされた場合も、API のカウントには含まれます。",
      },
    },
    {
      "@type": "Question",
      name: "Enterprise プランの問い合わせ窓口はどこですか?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Enterprise プラン(月 200 万回超、SLA 付き)は個別相談となります。運営元の株式会社テックウェル(https://www.techwell.jp/)までお問い合わせください。",
      },
    },
  ],
};

export function renderAddressPricingDocPage(): string {
  const body = `
<div class="hero">
  <h1>料金プラン — Shirabe Address API</h1>
  <p class="tagline">Pricing — Free / Starter / Pro / Enterprise</p>
  <p class="desc">
    全プラン Free 枠 <strong>5,000 回/月</strong>、超過分から従量課金。
    Stripe Billing の <code>transform_quantity</code> 方式で自動集計・請求。
  </p>
</div>

<section class="section">
  <h2 id="plans">プラン一覧</h2>
  <table>
    <thead>
      <tr><th>プラン</th><th>月間上限</th><th>単価</th><th>レート制限</th><th>想定利用</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Free</strong></td>
        <td>5,000 回</td>
        <td>¥0</td>
        <td>1 req/s</td>
        <td>個人検証、GPTs / Claude / Gemini の動作確認</td>
      </tr>
      <tr>
        <td><strong>Starter</strong></td>
        <td>200,000 回</td>
        <td>¥0.5/回</td>
        <td>30 req/s</td>
        <td>社内 AI エージェントの日常運用</td>
      </tr>
      <tr>
        <td><strong>Pro</strong></td>
        <td>2,000,000 回</td>
        <td>¥0.3/回</td>
        <td>100 req/s</td>
        <td>SaaS 内部、顧客向け AI 機能の本番運用</td>
      </tr>
      <tr>
        <td><strong>Enterprise</strong></td>
        <td>無制限</td>
        <td>¥0.1/回</td>
        <td>500 req/s</td>
        <td>大規模バッチ、物流・不動産等の基盤データ化</td>
      </tr>
    </tbody>
  </table>
  <p class="text-muted">
    超過分のみ従量課金。例: Starter で月 50,000 回 = (50,000 - 5,000) × ¥0.5 = ¥22,500。
  </p>
</section>

<section class="section">
  <h2 id="count-model">カウントモデル / Counting model</h2>
  <ul>
    <li><strong>単発 <code>/normalize</code></strong>: 1 リクエスト = 1 カウント</li>
    <li><strong>バッチ <code>/normalize/batch</code></strong>: 要素数 N = N カウント</li>
    <li><strong>キャッシュヒット / OUTSIDE_COVERAGE</strong>: バックエンド呼び出しがスキップされても API カウントには含まれる</li>
    <li><strong>認証エラー / 400 系エラー</strong>: カウントされない(Free 枠を消費しない)</li>
    <li><strong>503 SERVICE_UNAVAILABLE</strong>: カウントされない(障害時の消費を防ぐ)</li>
  </ul>
</section>

<section class="section">
  <h2 id="keys">API キーの発行 / Obtaining an API key</h2>
  <p>
    匿名 Free 枠(1 req/s)は API キーなしで利用できます。より高いレート制限や使用量を必要とする場合は、
    <code>POST /api/v1/address/checkout</code> で Stripe Checkout を開始し、有料プランの契約と同時に
    API キー(プレフィックス <code>shrb_</code>、37 文字)が自動発行されます。
  </p>
  <p>
    暦 API を既に契約済のユーザーは <strong>同一の API キー</strong>で住所 API を呼び出せます(1 キー集約構造)。
    プランは API ごとに独立です(例: 暦 Starter + 住所 Free)。
  </p>
</section>

<section class="section">
  <h2 id="billing">請求と支払い / Billing</h2>
  <ul>
    <li><strong>決済基盤</strong>: Stripe Billing(従量課金、<code>transform_quantity[divide_by]=1000</code>)</li>
    <li><strong>通貨</strong>: 日本円(JPY)</li>
    <li><strong>請求サイクル</strong>: 毎月初(Stripe の請求期間に準拠)</li>
    <li><strong>未払い時</strong>: Webhook <code>invoice.payment_failed</code> を受信した時点で <code>suspended</code> 状態に自動遷移、<code>invoice.payment_succeeded</code> で自動復帰</li>
    <li><strong>解約</strong>: Customer Portal から即時解約可能、当月末までサービス利用可</li>
  </ul>
</section>

<section class="section">
  <h2 id="scenarios">規模別 月額試算シナリオ / Monthly cost scenarios by scale</h2>
  <p>
    実際の利用ボリューム別に、どのプランが最適か + 月額の概算を示します。<strong>Free 枠 5,000 回 / 月</strong>は
    全プラン共通です(超過分のみ従量)。
  </p>
  <table>
    <thead>
      <tr>
        <th>シナリオ</th>
        <th>月間呼出数</th>
        <th>推奨プラン</th>
        <th>従量分</th>
        <th>月額(税抜)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>個人開発 / PoC</td>
        <td>≤ 5,000 回</td>
        <td>Free</td>
        <td>0 円</td>
        <td><strong>0 円</strong></td>
      </tr>
      <tr>
        <td>小規模 SaaS / 月次 CRM クレンジング</td>
        <td>50,000 回</td>
        <td>Starter</td>
        <td>(50,000 - 5,000) × ¥0.5 = ¥22,500</td>
        <td><strong>¥22,500</strong></td>
      </tr>
      <tr>
        <td>中規模 EC / 不動産物件 dedup</td>
        <td>500,000 回</td>
        <td>Pro</td>
        <td>(500,000 - 5,000) × ¥0.3 = ¥148,500</td>
        <td><strong>¥148,500</strong></td>
      </tr>
      <tr>
        <td>大規模物流 / 全国不動産 inventory</td>
        <td>5,000,000 回</td>
        <td>Enterprise</td>
        <td>(5,000,000 - 5,000) × ¥0.1 = ¥499,500</td>
        <td><strong>¥499,500</strong></td>
      </tr>
      <tr>
        <td>金融 KYC / AML 大規模再 verify</td>
        <td>20,000,000 回</td>
        <td>Enterprise</td>
        <td>(20,000,000 - 5,000) × ¥0.1 = ¥1,999,500</td>
        <td><strong>¥1,999,500</strong></td>
      </tr>
    </tbody>
  </table>
  <p class="text-muted">
    上記は単純試算です。実際の従量カウントは <code>OUTSIDE_COVERAGE</code> / 認証エラー / 503 の扱いで
    若干前後します(本ページ §カウントモデル 参照)。AI エージェント経由の利用では batch endpoint の
    要素数 N がそのままカウントになる点に注意してください。
  </p>
</section>

<section class="section">
  <h2 id="related">関連リソース / Related resources</h2>
  <ul>
    <li><a href="https://shirabe.dev/docs/address-normalize">住所正規化 API 完全ガイド(5 つの構造的課題解説付)</a></li>
    <li><a href="https://shirabe.dev/docs/address-batch">住所一括正規化 API(100 件 batch 実用パターン)</a></li>
    <li><a href="https://shirabe.dev/api/v1/address/openapi.yaml">OpenAPI 3.1 仕様(本家)</a></li>
    <li><a href="https://shirabe.dev/api/v1/address/openapi-gpts.yaml">OpenAPI 3.1 仕様(GPTs Actions 短縮版)</a></li>
    <li><a href="https://shirabe.dev/api/v1/calendar/">Shirabe Calendar API(同一 API キーで利用可、料金は別系統)</a></li>
    <li><a href="https://shirabe.dev/announcements/2026-05-01">2026-05-01 リリース告知ページ</a></li>
    <li><a href="https://github.com/techwell-inc-jp/shirabe-address-api">GitHub: techwell-inc-jp/shirabe-address-api</a>(Public、MIT)</li>
  </ul>
</section>
`;

  return renderSEOPage({
    title: "Shirabe Address API 料金プラン — Free / Starter / Pro / Enterprise",
    description:
      "日本住所正規化 API の料金。全プラン Free 枠 5,000 回/月、超過分 ¥0.5〜¥0.1/回。Stripe Billing transform_quantity 方式、暦 API と API キー共有。",
    body,
    canonicalUrl: CANONICAL,
    keywords: KEYWORDS,
    jsonLd: [ARTICLE_LD, OFFER_LD, FAQ_LD],
  });
}

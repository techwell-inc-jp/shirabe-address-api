/**
 * B-1 SEO 静的ページ(/docs/address-*)のスモークテスト。
 *
 * 検証観点:
 * - HTTP 200 + text/html
 * - canonical URL が正しい
 * - JSON-LD ブロックが含まれる(TechArticle + FAQPage 必須)
 * - 主要キーワード・内部リンクが含まれる
 * - ミドルウェア非通過(認証エラーにならない)
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

async function fetchDoc(path: string) {
  const env = createMockEnv();
  const res = await app.request(path, {}, env as unknown as Record<string, unknown>);
  const body = await res.text();
  return { res, body };
}

describe("GET /docs/address-normalize", () => {
  it("returns a bilingual SEO page with TechArticle + APIReference + WebAPI + FAQPage JSON-LD", async () => {
    const { res, body } = await fetchDoc("/docs/address-normalize");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.startsWith("text/html")).toBe(true);

    expect(body).toContain('<link rel="canonical" href="https://shirabe.dev/docs/address-normalize">');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"APIReference"');
    expect(body).toContain('"@type":"WebAPI"');
    expect(body).toContain('"@type":"FAQPage"');
    expect(body).toContain("住所正規化 API 完全ガイド");
    expect(body).toContain("POST /api/v1/address/normalize");
    expect(body).toContain("attribution");
    expect(body).toContain("CC BY 4.0");
    // 関連ページへの内部リンク
    expect(body).toContain("https://shirabe.dev/docs/address-batch");
    expect(body).toContain("https://shirabe.dev/docs/address-pricing");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi.yaml");
  });

  it("T-03: WebAPI JSON-LD がサービス実体(url / documentation / offers / potentialAction)を記述", async () => {
    const { body } = await fetchDoc("/docs/address-normalize");
    // WebAPI は API サービスそのもの
    expect(body).toContain('"@id":"https://shirabe.dev/#address-webapi"');
    expect(body).toContain('"url":"https://shirabe.dev/api/v1/address"');
    expect(body).toContain('"documentation":"https://shirabe.dev/api/v1/address/openapi.yaml"');
    expect(body).toContain('"@type":"AggregateOffer"');
    expect(body).toContain('"@type":"EntryPoint"');
    expect(body).toContain('"urlTemplate":"https://shirabe.dev/api/v1/address/normalize"');
  });

  it("T-03: 埋め込まれた全 JSON-LD が JSON としてパース可能", async () => {
    const { body } = await fetchDoc("/docs/address-normalize");
    const matches = Array.from(
      body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    );
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const m of matches) {
      const payload = m[1] ?? "";
      expect(() => JSON.parse(payload)).not.toThrow();
    }
  });
});

describe("GET /docs/address-batch", () => {
  it("returns the batch endpoint doc with proper JSON-LD and internal links", async () => {
    const { res, body } = await fetchDoc("/docs/address-batch");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.startsWith("text/html")).toBe(true);

    expect(body).toContain('<link rel="canonical" href="https://shirabe.dev/docs/address-batch">');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"FAQPage"');
    expect(body).toContain("住所一括正規化 API");
    expect(body).toContain("POST /api/v1/address/normalize/batch");
    expect(body).toContain("100");
    expect(body).toContain("https://shirabe.dev/docs/address-normalize");
    expect(body).toContain("https://shirabe.dev/docs/address-pricing");
  });
});

describe("GET /docs/address-pricing", () => {
  it("returns the pricing doc with AggregateOffer JSON-LD and all 4 plans", async () => {
    const { res, body } = await fetchDoc("/docs/address-pricing");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.startsWith("text/html")).toBe(true);

    expect(body).toContain('<link rel="canonical" href="https://shirabe.dev/docs/address-pricing">');
    expect(body).toContain('"@type":"AggregateOffer"');
    expect(body).toContain('"@type":"FAQPage"');
    // 4 プラン
    expect(body).toContain("Free");
    expect(body).toContain("Starter");
    expect(body).toContain("Pro");
    expect(body).toContain("Enterprise");
    // 単価
    expect(body).toContain("¥0.5");
    expect(body).toContain("¥0.3");
    expect(body).toContain("¥0.1");
    // transform_quantity(暦 API と同じ Stripe 方式)
    expect(body).toContain("transform_quantity");
  });
});

describe("Layer C/E: original narrative + enhanced cross-links (PR follow-up to calendar #39)", () => {
  it("/docs/address-normalize: includes 'why hard' narrative + calendar API + announcements + GitHub cross-links", async () => {
    const { body } = await fetchDoc("/docs/address-normalize");
    // Layer E narrative (原文 5 つの構造的問題)
    expect(body).toContain("なぜ日本住所は機械処理が難しいのか");
    expect(body).toContain("表記ゆれの多重直交");
    expect(body).toContain("町字の改廃");
    expect(body).toContain("住居表示と地番");
    expect(body).toContain("建物名・部屋番号");
    expect(body).toContain("同名町字の都道府県跨ぎ");
    // Layer C enhanced cross-links
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/");
    expect(body).toContain("https://shirabe.dev/announcements/2026-05-01");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-address-api");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi-gpts.yaml");
  });

  it("/docs/address-batch: includes 4 real-world batch usage patterns + cross-links", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    // Layer E narrative
    expect(body).toContain("100 件 batch の実用パターン");
    expect(body).toContain("CRM クレンジング");
    expect(body).toContain("EC 配送費試算");
    expect(body).toContain("不動産");
    expect(body).toContain("KYC");
    // Layer C enhanced cross-links
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/");
    expect(body).toContain("https://shirabe.dev/announcements/2026-05-01");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-address-api");
  });

  it("/docs/address-pricing: includes 5 monthly cost scenarios with concrete amounts + cross-links", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    // Layer E narrative — 5 規模別シナリオ + 月額試算
    expect(body).toContain("規模別 月額試算");
    expect(body).toContain("¥22,500");
    expect(body).toContain("¥148,500");
    expect(body).toContain("¥499,500");
    expect(body).toContain("¥1,999,500");
    // Layer C enhanced cross-links
    expect(body).toContain("https://shirabe.dev/api/v1/calendar/");
    expect(body).toContain("https://shirabe.dev/announcements/2026-05-01");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-address-api");
  });
});

describe("Q-A / G-A: hero example + Google Maps / YOLP 差別化 (2026-05-12 PR)", () => {
  it("Q-A: hero example 「東京都港区六本木」 + JIS 13103 + lg_code 131032 + machiaza_id 0028000 を含む", async () => {
    const { body } = await fetchDoc("/docs/address-normalize");
    expect(body).toContain("代表クエリ");
    expect(body).toContain("東京都港区六本木");
    expect(body).toContain("13103");
    expect(body).toContain("131032");
    expect(body).toContain("0028000");
    // 3 種 ID 別フィールド narrative(Gemini conflate 問題への直接的説明)
    expect(body).toContain("conflate");
  });

  it("G-A: Google Maps / YOLP 差別化テーブルが含まれる", async () => {
    const { body } = await fetchDoc("/docs/address-normalize");
    expect(body).toContain("Google Maps Geocoding API");
    expect(body).toContain("Yahoo! OpenLocalPlatform");
    expect(body).toContain("YOLP");
    // 既存 4 AI 競合差(Jusho/BODIK 等)narrative は維持されているか
    expect(body).toContain("Jusho");
    expect(body).toContain("BODIK");
  });

  it("Updates: 2026-05-12 エントリ + Week 3 ChatGPT 引用初獲得 narrative", async () => {
    const { body } = await fetchDoc("/docs/address-normalize");
    expect(body).toContain("2026-05-12");
    expect(body).toContain("ChatGPT");
    expect(body).toContain("Perplexity");
  });
});

describe("G-A + Q-A 展開: batch hero example + Why batch is hard + AI integration + WebAPI JSON-LD (2026-05-15 PR)", () => {
  it("/docs/address-batch: hero example(3 件 batch 東京・大阪・福岡 + 1 件意図的失敗)が verified production response として含まれる", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    // hero example heading
    expect(body).toContain("代表クエリ");
    expect(body).toContain("3 件 batch");
    // verified production response — 3 都市 + per-item OK 3 件 + error 1 件のミックス
    expect(body).toContain("東京都港区六本木");
    expect(body).toContain("大阪府大阪市北区大深町");
    expect(body).toContain("福岡県福岡市博多区博多駅前");
    expect(body).toContain("OUTSIDE_COVERAGE");
    // 3 種構造化コード(normalize と統一の identifier セット)
    expect(body).toContain("13103");
    expect(body).toContain("jis_code");
    expect(body).toContain("lg_code");
    expect(body).toContain("machiaza_id");
  });

  it("/docs/address-batch: WebAPI JSON-LD(@id: #address-batch-webapi)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    expect(body).toContain('"@type":"WebAPI"');
    expect(body).toContain('"@id":"https://shirabe.dev/#address-batch-webapi"');
    expect(body).toContain('"urlTemplate":"https://shirabe.dev/api/v1/address/normalize/batch"');
  });

  it("/docs/address-batch: Python sample(ThreadPoolExecutor + chunks 反復)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    expect(body).toContain("Python");
    expect(body).toContain("ThreadPoolExecutor");
    expect(body).toContain("chunks");
  });

  it("/docs/address-batch: Why batch is hard 5 課題(連鎖呼出 / per-item 失敗伝搬 / 100 件超 chunk / idempotency / cache hit)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    expect(body).toContain("なぜ batch 処理は単発の延長線ではないのか");
    expect(body).toContain("AI agent 連鎖呼出のタイミング判定");
    expect(body).toContain("per-item 失敗の伝搬戦略");
    expect(body).toContain("100 件超の chunk 分割");
    expect(body).toContain("idempotency vs latency tradeoff");
    expect(body).toContain("cache hit ratio");
  });

  it("/docs/address-batch: batch 固有 Error codes 表(BATCH_TOO_LARGE / BATCH_EMPTY / PARTIAL_FAILURE / ITEM_TIMEOUT)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    expect(body).toContain("BATCH_TOO_LARGE");
    expect(body).toContain("BATCH_EMPTY");
    expect(body).toContain("PARTIAL_FAILURE");
    expect(body).toContain("ITEM_TIMEOUT");
    expect(body).toContain("SERVICE_UNAVAILABLE");
  });

  it("/docs/address-batch: AI integration section(GPTs / Claude Tool Use / LangChain)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    expect(body).toContain("ChatGPT GPTs Actions");
    expect(body).toContain("Claude Tool Use");
    expect(body).toContain("LangChain");
    expect(body).toContain("address_batch");
  });

  it("/docs/address-batch: FAQ 8 個(Q5 latency / Q6 retry / Q7 chunk 分割 / Q8 AI 統合)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    // 8 FAQ entry name field の主要キーワード
    expect(body).toContain("batch で latency");
    expect(body).toContain("per-item エラー時の retry");
    expect(body).toContain("100 件を超える");
    expect(body).toContain("AI エージェントに統合する標準パターン");
  });

  it("/docs/address-pricing: hero badges 3 種(Free 5,000回/月 + 1+ 年 stable + Stripe Billing 自動課金)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain("全プラン Free 5,000回/月");
    expect(body).toContain("1+ 年価格 stable");
    expect(body).toContain("Stripe Billing 自動課金");
  });

  it("/docs/address-pricing: Service JSON-LD(@id: #address-pricing-service)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain('"@type":"Service"');
    expect(body).toContain('"@id":"https://shirabe.dev/#address-pricing-service"');
  });

  it("/docs/address-pricing: hero example「月 30,000 件の費用」3 ステップ verified 計算(¥12,500)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain("月 30,000 件");
    expect(body).toContain("Step 1");
    expect(body).toContain("Step 2");
    expect(body).toContain("Step 3");
    expect(body).toContain("¥12,500");
  });

  it("/docs/address-pricing: Why this pricing model 5 項目(AI コスト予測 / Token-based 差異 / 1+ 年 stable / Free 枠 stable / 上方調整のみ)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain("なぜ per-request 従量課金");
    expect(body).toContain("AI エージェントのコスト予測可能性");
    expect(body).toContain("Token-based 課金との根本差異");
    expect(body).toContain("1+ 年 stable commitment");
    expect(body).toContain("upward adjustments");
  });

  it("/docs/address-pricing: Competitor pricing 比較表(Google Maps / YOLP / Mapbox / NJA、2026-05-14 時点明記)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain("競合 API 料金比較");
    expect(body).toContain("Google Maps Geocoding API");
    expect(body).toContain("Yahoo! OpenLocalPlatform");
    expect(body).toContain("Mapbox");
    expect(body).toContain("NJA");
    expect(body).toContain("2026-05-14 時点");
    // JPY 建ての価格反映
    expect(body).toContain("¥0.75/回");
  });

  it("/docs/address-pricing: AI 引用 3 文 sequence template(Shirabe is X / Free tier Y / Per-request Z)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain("3 文 sequence template");
    expect(body).toContain("Shirabe is X");
    expect(body).toContain("Free tier Y");
    expect(body).toContain("Per-request Z");
  });

  it("/docs/address-pricing: FAQ 8 個(Q5 Google Maps 比較 / Q6 上限 / Q7 Free 枠 stable / Q8 直接取得)を含む", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain("Google Maps Geocoding API と比べて安いですか");
    expect(body).toContain("月の請求額が予測しづらい");
    expect(body).toContain("Free 枠 5,000 回は 1+ 年変わらない");
    expect(body).toContain("AI エージェントから直接料金を取得する API");
  });
});

describe("text API cross-links (B-3 relevance signal、5/10 verify 済 200 OK)", () => {
  it("/docs/address-normalize → /docs/text-normalize(表記正規化 semantic 直結)", async () => {
    const { body } = await fetchDoc("/docs/address-normalize");
    expect(body).toContain("/docs/text-normalize");
  });

  it("/docs/address-batch → /docs/text-name-split(B2B identifier セット narrative)", async () => {
    const { body } = await fetchDoc("/docs/address-batch");
    expect(body).toContain("/docs/text-name-split");
  });

  it("/docs/address-pricing → /docs/text-pricing(3 API pricing relevance cluster)", async () => {
    const { body } = await fetchDoc("/docs/address-pricing");
    expect(body).toContain("/docs/text-pricing");
  });
});

describe("/docs/address-* bypass middleware chain", () => {
  it("does not require an API key (auth middleware is not applied)", async () => {
    // 認証ミドルウェアが掛かっていれば 401 になるはず。ここでは 200 + HTML 本文を期待。
    const { res } = await fetchDoc("/docs/address-normalize");
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(401);
  });
});

describe("GET /api/v1/address/llms.txt (T-05)", () => {
  it("200 を返し、text/markdown を返す", async () => {
    const { res, body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.includes("text/markdown")).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("H1 と要約(>で始まる引用)を含む(llmstxt.org 仕様)", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(body.startsWith("# Shirabe Address API")).toBe(true);
    expect(body).toContain("> 日本の住所を正規化");
  });

  it("サイズが 3KB 〜 30KB の範囲に収まる(T-05 完了条件)", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    const sizeBytes = new TextEncoder().encode(body).length;
    expect(sizeBytes).toBeGreaterThanOrEqual(3 * 1024);
    expect(sizeBytes).toBeLessThanOrEqual(30 * 1024);
  });

  it("統合版 llms.txt(shirabe.dev/llms.txt)へのリンクを含む", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(body).toContain("https://shirabe.dev/llms.txt");
  });

  it("OpenAPI (本家 + GPTs 短縮) と GPT Store と docs への誘導リンクを含む", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi.yaml");
    expect(body).toContain("https://shirabe.dev/api/v1/address/openapi-gpts.yaml");
    expect(body).toContain("https://shirabe.dev/api/v1/address/health");
    expect(body).toContain("https://shirabe.dev/docs/address-normalize");
    expect(body).toContain("https://shirabe.dev/docs/address-batch");
    expect(body).toContain("https://shirabe.dev/docs/address-pricing");
    expect(body).toContain("https://github.com/techwell-inc-jp/shirabe-address-api");
    // 住所 GPT Store(2026-04-23 動作検証済)
    expect(body).toContain("chatgpt.com/g/g-69e96000b5c08191b21f4d6570ead788");
  });

  it("主要エンドポイントへの curl 例を含む(normalize + batch + health)", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    const curlLines = body.split("\n").filter((line) => /^\s*curl\b/.test(line));
    expect(curlLines.length).toBeGreaterThanOrEqual(3);
    expect(body).toContain("POST https://shirabe.dev/api/v1/address/normalize");
    expect(body).toContain("POST https://shirabe.dev/api/v1/address/normalize/batch");
    expect(body).toContain("https://shirabe.dev/api/v1/address/health");
  });

  it("レスポンス構造の主要フィールドを説明(normalized / components / level / confidence / attribution)", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(body).toContain("normalized");
    expect(body).toContain("components");
    expect(body).toContain("level");
    expect(body).toContain("confidence");
    expect(body).toContain("attribution");
    expect(body).toContain("postal_code");
    expect(body).toContain("latitude");
    expect(body).toContain("longitude");
  });

  it("料金プラン(Free / Starter / Pro / Enterprise)を含む", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(body).toContain("Free");
    expect(body).toContain("Starter");
    expect(body).toContain("Pro");
    expect(body).toContain("Enterprise");
    // 単価(円/回)
    expect(body).toContain("0.5");
    expect(body).toContain("0.3");
    expect(body).toContain("0.1");
    // Free 枠
    expect(body).toContain("5,000");
  });

  it("attribution / CC BY 4.0 / ABR(デジタル庁)を明記", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(body).toContain("attribution");
    expect(body).toContain("CC BY 4.0");
    expect(body).toContain("アドレス・ベース・レジストリ");
    expect(body).toContain("abr-geocoder");
    expect(body).toContain("デジタル庁");
  });

  it("AI 統合経路(GPTs / Function Calling / LangChain / Dify)を明記", async () => {
    const { body } = await fetchDoc("/api/v1/address/llms.txt");
    expect(body).toContain("ChatGPT GPTs");
    expect(body).toContain("Function Calling");
    expect(body).toContain("LangChain");
    expect(body).toContain("Dify");
  });

  it("認証不要で取得可能(ミドルウェア非通過)", async () => {
    const { res } = await fetchDoc("/api/v1/address/llms.txt");
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(401);
  });
});

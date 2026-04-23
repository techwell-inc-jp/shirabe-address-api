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

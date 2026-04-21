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
  it("returns a bilingual SEO page with TechArticle + APIReference + FAQPage JSON-LD", async () => {
    const { res, body } = await fetchDoc("/docs/address-normalize");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")?.startsWith("text/html")).toBe(true);

    expect(body).toContain('<link rel="canonical" href="https://shirabe.dev/docs/address-normalize">');
    expect(body).toContain('"@type":"TechArticle"');
    expect(body).toContain('"@type":"APIReference"');
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

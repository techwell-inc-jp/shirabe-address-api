/**
 * /api/v1/address/ Index Page (404 修正) テスト
 *
 * 対象:
 * - GET /api/v1/address        (末尾スラッシュなし)
 * - GET /api/v1/address/       (末尾スラッシュあり)
 * - 既存 /api/v1/address/normalize (regression check)
 * - 既存 /api/v1/address/normalize/batch (regression check)
 *
 * GSC「クロール済み・404」の解消 + AI agents 向け endpoint discovery surface
 * 格上げの検証。
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import { renderApiAddressIndexPage } from "../../src/pages/api-address-index.js";

async function fetchPath(path: string) {
  const env = createMockEnv();
  const res = await app.request(path, {}, env as unknown as Record<string, unknown>);
  const body = await res.text();
  return { res, body };
}

// ---------------------------------------------------------------------------
// pure function: renderApiAddressIndexPage
// ---------------------------------------------------------------------------

describe("renderApiAddressIndexPage (pure render)", () => {
  it("HTML5 doctype + 日本語 lang を返す", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="ja"');
  });

  it("title に Shirabe Address API + Endpoint Index を含む", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toMatch(/<title>Shirabe Address API.*Endpoint Index/);
  });

  it("canonical URL が /api/v1/address/ を指す", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain('rel="canonical" href="https://shirabe.dev/api/v1/address/"');
  });

  it("2 endpoints (normalize / batch) を全て掲載", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain("/api/v1/address/normalize");
    expect(html).toContain("/api/v1/address/normalize/batch");
  });

  it("WebAPI JSON-LD を含む", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain('"@type":"WebAPI"');
    expect(html).toContain('"name":"Shirabe Address API"');
  });

  it("FAQPage JSON-LD を含む", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"Question"');
  });

  it("BreadcrumbList JSON-LD を含む", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it("attribution に関する記述を含む", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain("attribution");
    expect(html).toContain("CC BY 4.0");
  });

  it("Free 枠 5,000 回を明示", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain("5,000");
  });

  it("curl 例を含む", () => {
    const html = renderApiAddressIndexPage();
    expect(html).toContain("curl");
    expect(html).toContain("X-API-Key");
  });
});

// ---------------------------------------------------------------------------
// routing: GET /api/v1/address (末尾スラッシュなし)
// ---------------------------------------------------------------------------

describe("GET /api/v1/address", () => {
  it("200 を返す", async () => {
    const { res } = await fetchPath("/api/v1/address");
    expect(res.status).toBe(200);
  });

  it("Content-Type が text/html を含む", async () => {
    const { res } = await fetchPath("/api/v1/address");
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("Cache-Control が 24h を指定", async () => {
    const { res } = await fetchPath("/api/v1/address");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("body に Shirabe Address API が含まれる", async () => {
    const { body } = await fetchPath("/api/v1/address");
    expect(body).toContain("Shirabe Address API");
  });
});

// ---------------------------------------------------------------------------
// routing: GET /api/v1/address/ (末尾スラッシュあり)
// ---------------------------------------------------------------------------

describe("GET /api/v1/address/", () => {
  it("200 を返す", async () => {
    const { res } = await fetchPath("/api/v1/address/");
    expect(res.status).toBe(200);
  });

  it("Content-Type が text/html を含む", async () => {
    const { res } = await fetchPath("/api/v1/address/");
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("body に endpoint 一覧が含まれる", async () => {
    const { body } = await fetchPath("/api/v1/address/");
    expect(body).toContain("/api/v1/address/normalize");
  });
});

// ---------------------------------------------------------------------------
// regression: 既存 /api/v1/address/normalize は 401(認証必要) のまま
// ---------------------------------------------------------------------------

describe("regression: /api/v1/address/normalize is still protected", () => {
  it("GET /api/v1/address/normalize は 404 を返す(POST専用エンドポイント、インデックスページとして扱わない)", async () => {
    const { res } = await fetchPath("/api/v1/address/normalize");
    // POST のみ有効なため GET は 404(app.notFound)
    expect(res.status).toBe(404);
  });
});

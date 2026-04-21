/**
 * normalize / batch エンドポイントのスモークテスト(Phase 1 骨格)
 *
 * Fly.io バックエンド未実装のため 503 SERVICE_UNAVAILABLE を返すことを確認。
 * ミドルウェアチェーン(auth/usage-check/rate-limit/usage-logger/analytics)を通過すること、
 * 入力バリデーションが機能することも併せて検証。
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

describe("POST /api/v1/address/normalize", () => {
  it("returns 400 INVALID_FORMAT for missing address field", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("INVALID_FORMAT");
  });

  it("returns 400 INVALID_FORMAT for non-JSON body", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not a json",
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 INVALID_FORMAT for empty string address", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "   " }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 SERVICE_UNAVAILABLE with attribution while Fly.io is not wired", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都千代田区霞が関3-1-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as {
      error?: { code?: string };
      result: unknown;
      attribution?: { license?: string };
    };
    expect(json.result).toBeNull();
    expect(json.error?.code).toBe("SERVICE_UNAVAILABLE");
    expect(json.attribution?.license).toBe("CC BY 4.0");
  });

  it("sets X-RateLimit-* headers for anonymous Free user", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都千代田区霞が関3-1-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    // Free プランの月間上限は 5,000
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5000");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });
});

describe("POST /api/v1/address/normalize/batch", () => {
  it("returns 400 BATCH_TOO_LARGE for >100 addresses", async () => {
    const env = createMockEnv();
    const addresses = Array.from({ length: 101 }, (_, i) => `東京都千代田区${i}`);
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("BATCH_TOO_LARGE");
  });

  it("returns 400 INVALID_FORMAT for empty array", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: [] }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 with attribution per-item while Fly.io is not wired", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: ["東京都千代田区霞が関3-1-1", "大阪府大阪市北区梅田1-1-3"],
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as {
      results: Array<{
        result: unknown;
        error?: { code?: string };
        attribution?: { license?: string };
      }>;
      summary: { total: number; failed: number };
    };
    expect(json.results).toHaveLength(2);
    expect(json.summary.total).toBe(2);
    expect(json.summary.failed).toBe(2);
    const firstResult = json.results[0];
    expect(firstResult).toBeDefined();
    expect(firstResult?.result).toBeNull();
    expect(firstResult?.error?.code).toBe("SERVICE_UNAVAILABLE");
    expect(firstResult?.attribution?.license).toBe("CC BY 4.0");
  });
});

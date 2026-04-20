/**
 * health エンドポイントのスモークテスト(Phase 1 骨格用)
 *
 * 4/23 以降に本格的なテスト(認証・レート制限・キャッシュ)を追加していく。
 */
import { describe, it, expect } from "vitest";
import app from "../src/index.js";

describe("GET /api/v1/address/health", () => {
  it("returns 200 with phase-1 coverage", async () => {
    const res = await app.request("/api/v1/address/health", {}, {
      API_VERSION: "0.1.0-test",
      FLYIO_GEOCODE_URL: "http://localhost:8080/internal/geocode",
      // KV / AE は health では触らないのでダミー不要
    } as unknown as Record<string, unknown>);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      status: string;
      version: string;
      coverage: string[];
      phase: number;
    };
    expect(json.status).toBe("ok");
    expect(json.version).toBe("0.1.0-test");
    expect(json.phase).toBe(1);
    expect(json.coverage).toContain("東京都");
    expect(json.coverage).toContain("福岡県");
    expect(json.coverage).toHaveLength(6);
  });
});

describe("POST /api/v1/address/normalize (skeleton)", () => {
  it("returns 400 for invalid body", async () => {
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      {
        API_VERSION: "0.1.0-test",
        FLYIO_GEOCODE_URL: "http://localhost:8080/internal/geocode",
      } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 SERVICE_UNAVAILABLE while Fly.io backend is not wired", async () => {
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都千代田区霞が関3-1-1" }),
      },
      {
        API_VERSION: "0.1.0-test",
        FLYIO_GEOCODE_URL: "http://localhost:8080/internal/geocode",
      } as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: { code?: string }; result: unknown };
    expect(json.result).toBeNull();
    expect(json.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});

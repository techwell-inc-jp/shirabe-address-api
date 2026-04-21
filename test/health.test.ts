/**
 * health エンドポイントのスモークテスト
 *
 * /health は認証・rate-limit ミドルウェアを通さないため、モック KV なしでも動作する。
 */
import { describe, it, expect } from "vitest";
import app from "../src/index.js";
import { createMockEnv } from "./helpers/mock-kv.js";

describe("GET /api/v1/address/health", () => {
  it("returns 200 with nationwide coverage (all 47 prefectures)", async () => {
    const env = createMockEnv();
    const res = await app.request("/api/v1/address/health", {}, env as unknown as Record<string, unknown>);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      status: string;
      version: string;
      coverage: string[];
      coverage_mode: string;
    };
    expect(json.status).toBe("ok");
    expect(json.version).toBe("0.1.0-test");
    expect(json.coverage_mode).toBe("nationwide");
    expect(json.coverage).toHaveLength(47);
    // Spot-check: 代表的な都道府県が含まれること
    expect(json.coverage).toContain("北海道");
    expect(json.coverage).toContain("東京都");
    expect(json.coverage).toContain("京都府");
    expect(json.coverage).toContain("大阪府");
    expect(json.coverage).toContain("沖縄県");
  });
});

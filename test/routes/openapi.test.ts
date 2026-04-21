/**
 * OpenAPI 配信ルートのスモークテスト。
 *
 * /api/v1/address/openapi.yaml        : 日英併記本家版(handoff 20260425 §タスクJ)
 * /api/v1/address/openapi-gpts.yaml   : GPT Builder Actions 互換の短縮版(各 description ≤ 300 字)
 *
 * 両ルートとも認証不要(/api/v1/address/normalize*** の完全一致列挙に含まれない)。
 * vitest.config.ts の yamlAsText プラグインで docs/*.yaml が文字列として読み込まれる。
 */
import { describe, it, expect } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

describe("GET /api/v1/address/openapi.yaml", () => {
  it("returns the bilingual OpenAPI 3.1 spec as text/yaml", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/openapi.yaml",
      {},
      env as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const body = await res.text();
    expect(body).toMatch(/^openapi:\s*3\.1\.0/m);
    expect(body).toContain("Shirabe Address API");
    expect(body).toContain("operationId: normalizeAddress");
    expect(body).toContain("operationId: batchNormalizeAddresses");
    // 本家にのみ x-llm-hint フィールドが含まれる(S9 テンプレ)
    expect(body).toMatch(/^\s*x-llm-hint:/m);
  });
});

describe("GET /api/v1/address/openapi-gpts.yaml", () => {
  it("returns the GPTs-shortened OpenAPI spec as text/yaml", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/openapi-gpts.yaml",
      {},
      env as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/yaml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const body = await res.text();
    expect(body).toMatch(/^openapi:\s*3\.1\.0/m);
    expect(body).toContain("operationId: normalizeAddress");
    // GPTs 版は x-llm-hint を OpenAPI フィールドとして持たない
    // (ヘッダーコメント内の参照は許容、実フィールドの有無のみを確認)
    expect(body).not.toMatch(/^\s*x-llm-hint:/m);
  });
});

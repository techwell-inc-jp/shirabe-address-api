/**
 * 住所 API 認証ミドルウェアのテスト
 *
 * KV 1 キー集約構造に対する挙動を網羅:
 * - 新フォーマット `apis.address` あり → そのプランを使う
 * - 新フォーマット `apis.calendar` のみ(住所未契約) → 匿名 Free 扱い
 * - 旧フォーマット(フラット) → 暦の plan として自動変換 → 住所は未契約なので Free
 * - 匿名(X-API-Key なし) → Free
 * - 形式不正キー → 401
 * - 未登録キー → 401
 * - suspended(住所プラン) → 403
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware, hashApiKey } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

/** 認証後の plan/customerId をエコーするテスト用ルート */
function buildTestApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", authMiddleware);
  app.get("/test", (c) => {
    return c.json({
      plan: c.get("plan"),
      customerId: c.get("customerId"),
      apiKeyHash: c.get("apiKeyHash"),
    });
  });
  return app;
}

describe("住所 API authMiddleware", () => {
  it("X-API-Key 未指定は匿名 Free ユーザーとして通す", async () => {
    const env = createMockEnv();
    const app = buildTestApp();
    const res = await app.request("/test", {}, env as unknown as Record<string, unknown>);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: string; customerId: string };
    expect(json.plan).toBe("free");
    expect(json.customerId).toMatch(/^anon_/);
  });

  it("形式不正な APIキーは 401 INVALID_API_KEY を返す", async () => {
    const env = createMockEnv();
    const app = buildTestApp();
    const res = await app.request(
      "/test",
      { headers: { "X-API-Key": "wrong-format-key" } },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("INVALID_API_KEY");
  });

  it("未登録キーは 401 INVALID_API_KEY を返す", async () => {
    const env = createMockEnv();
    const app = buildTestApp();
    const apiKey = "shrb_abcdefghijklmnopqrstuvwxyz012345";
    const res = await app.request(
      "/test",
      { headers: { "X-API-Key": apiKey } },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(401);
  });

  it("新フォーマット `apis.address` ありは住所プランを返す", async () => {
    const env = createMockEnv();
    // shrb_ + 32 chars(API_KEY_PATTERN 準拠)
    const apiKey = "shrb_adrsPRO0000111122223333444455556";
    const hash = await hashApiKey(apiKey);
    await env.API_KEYS.put(
      hash,
      JSON.stringify({
        customerId: "cust_addr_user_1",
        email: "user@example.com",
        createdAt: new Date().toISOString(),
        apis: {
          address: { plan: "pro", status: "active" },
        },
      })
    );
    const app = buildTestApp();
    const res = await app.request(
      "/test",
      { headers: { "X-API-Key": apiKey } },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: string; customerId: string };
    expect(json.plan).toBe("pro");
    expect(json.customerId).toBe("cust_addr_user_1");
  });

  it("新フォーマット calendar のみ(住所未契約)は Free 扱い + customerId 保持", async () => {
    const env = createMockEnv();
    const apiKey = "shrb_calOnly9876543210abcdefghijABCDE";
    const hash = await hashApiKey(apiKey);
    await env.API_KEYS.put(
      hash,
      JSON.stringify({
        customerId: "cust_cal_only",
        createdAt: new Date().toISOString(),
        apis: {
          calendar: { plan: "starter", status: "active" },
        },
      })
    );
    const app = buildTestApp();
    const res = await app.request(
      "/test",
      { headers: { "X-API-Key": apiKey } },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: string; customerId: string };
    expect(json.plan).toBe("free");
    expect(json.customerId).toBe("cust_cal_only");
  });

  it("旧フォーマット(フラット plan)は住所未契約 = Free 扱い", async () => {
    const env = createMockEnv();
    const apiKey = "shrb_legacyFmtKey0123456789abcdefEFGH";
    const hash = await hashApiKey(apiKey);
    await env.API_KEYS.put(
      hash,
      JSON.stringify({
        plan: "pro",
        customerId: "cust_legacy_user",
        status: "active",
        createdAt: new Date().toISOString(),
      })
    );
    const app = buildTestApp();
    const res = await app.request(
      "/test",
      { headers: { "X-API-Key": apiKey } },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: string; customerId: string };
    // legacy は calendar 相当にマップされるため、住所としては未契約 Free
    expect(json.plan).toBe("free");
    expect(json.customerId).toBe("cust_legacy_user");
  });

  it("住所プランが suspended のキーは 403 API_KEY_SUSPENDED を返す", async () => {
    const env = createMockEnv();
    const apiKey = "shrb_suspKey0123456789abcdefghijIJKLM";
    const hash = await hashApiKey(apiKey);
    await env.API_KEYS.put(
      hash,
      JSON.stringify({
        customerId: "cust_suspended",
        createdAt: new Date().toISOString(),
        apis: {
          address: { plan: "starter", status: "suspended" },
        },
      })
    );
    const app = buildTestApp();
    const res = await app.request(
      "/test",
      { headers: { "X-API-Key": apiKey } },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("API_KEY_SUSPENDED");
  });
});

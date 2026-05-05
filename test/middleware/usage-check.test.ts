/**
 * 住所 API 月間利用量チェックミドルウェアのテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  usageCheckMiddleware,
  getMonthlyUsageKey,
  MONTHLY_USAGE_LIMITS,
  UPGRADE_URL,
} from "../../src/middleware/usage-check.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

describe("住所 API usageCheckMiddleware", () => {
  let env: ReturnType<typeof createMockEnv>;

  function buildApp(plan: "free" | "starter" | "pro" | "enterprise", customerId: string) {
    const a = new Hono<AppEnv>();
    a.use("*", async (c, next) => {
      c.set("plan", plan);
      c.set("customerId", customerId);
      await next();
    });
    a.use("*", usageCheckMiddleware);
    a.get("/test", (c) => c.json({ ok: true }));
    return a;
  }

  beforeEach(() => {
    env = createMockEnv();
  });

  it("MONTHLY_USAGE_LIMITS が docs(CLAUDE.md §6 / 実装指示書 §3.5)と一致", () => {
    expect(MONTHLY_USAGE_LIMITS.free).toBe(5_000);
    expect(MONTHLY_USAGE_LIMITS.starter).toBe(200_000);
    expect(MONTHLY_USAGE_LIMITS.pro).toBe(2_000_000);
    expect(MONTHLY_USAGE_LIMITS.enterprise).toBe(-1);
  });

  it("利用量が上限未満なら通過する(Free)", async () => {
    const app = buildApp("free", "anon_abc");
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
  });

  it("Free で 5,000 回到達時(5,001 回目)は 429 + upgrade_url + pricing_url + current_plan + next_plan + Retry-After", async () => {
    const app = buildApp("free", "anon_abc");
    const key = getMonthlyUsageKey("anon_abc");
    await env.USAGE_LOGS.put(key, "5000");

    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(429);

    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const body: any = await res.json();
    expect(body.error.code).toBe("USAGE_LIMIT_EXCEEDED");
    expect(body.error.upgrade_url).toBe(UPGRADE_URL);
    expect(body.error.pricing_url).toBe("https://shirabe.dev/docs/address-pricing");
    expect(body.error.message).toContain("Free");
    expect(body.error.message).toContain("5,000");
    expect(body.error.current_plan).toEqual({
      name: "free",
      monthly_limit: 5_000,
      monthly_used: 5_000,
    });
    expect(body.error.next_plan?.name).toBe("starter");
    expect(body.error.next_plan?.monthly_limit).toBe(200_000);
    expect(body.error.next_plan?.checkout_path).toContain("plan=starter");
    expect(body.error.next_plan?.checkout_path).toContain("api=address");
  });

  it("Free で 4,999 回目は通過する", async () => {
    const app = buildApp("free", "anon_abc");
    const key = getMonthlyUsageKey("anon_abc");
    await env.USAGE_LOGS.put(key, "4999");
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
  });

  it("Starter で 200,000 回到達時は 429 + next_plan(Pro)", async () => {
    const app = buildApp("starter", "cust_starter");
    const key = getMonthlyUsageKey("cust_starter");
    await env.USAGE_LOGS.put(key, "200000");

    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error.message).toContain("Starter");
    expect(body.error.next_plan?.name).toBe("pro");
  });

  it("Pro で 2,000,000 回到達時は 429 + next_plan(Enterprise)", async () => {
    const app = buildApp("pro", "cust_pro");
    const key = getMonthlyUsageKey("cust_pro");
    await env.USAGE_LOGS.put(key, "2000000");

    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error.message).toContain("Pro");
    expect(body.error.next_plan?.name).toBe("enterprise");
  });

  it("Enterprise は上限なし", async () => {
    const app = buildApp("enterprise", "cust_ent");
    const key = getMonthlyUsageKey("cust_ent");
    await env.USAGE_LOGS.put(key, "999999999");
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
  });

  it("auth ミドルウェア未通過(plan 未設定)は素通し", async () => {
    const noAuthApp = new Hono<AppEnv>();
    noAuthApp.use("*", usageCheckMiddleware);
    noAuthApp.get("/test", (c) => c.json({ ok: true }));
    const res = await noAuthApp.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
  });
});

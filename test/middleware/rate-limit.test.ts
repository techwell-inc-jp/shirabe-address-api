/**
 * 住所 API レート制限ミドルウェアのテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimitMiddleware, PLAN_LIMITS } from "../../src/middleware/rate-limit.js";
import type { AppEnv } from "../../src/types/env.js";
import { createMockEnv } from "../helpers/mock-kv.js";

describe("住所 API rateLimitMiddleware", () => {
  let app: Hono<AppEnv>;
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();

    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("plan", "free");
      c.set("customerId", "cust_test");
      await next();
    });
    app.use("*", rateLimitMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));
  });

  it("初回リクエストは通過する", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
  });

  it("レスポンスヘッダーにレート制限情報を含む", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("PLAN_LIMITS が docs(CLAUDE.md §6 / 実装指示書 §3.5、暦の 10 倍レンジ)と一致", () => {
    expect(PLAN_LIMITS.free.perSecond).toBe(1);
    expect(PLAN_LIMITS.free.perMonth).toBe(5_000);
    expect(PLAN_LIMITS.starter.perSecond).toBe(30);
    expect(PLAN_LIMITS.starter.perMonth).toBe(200_000);
    expect(PLAN_LIMITS.pro.perSecond).toBe(100);
    expect(PLAN_LIMITS.pro.perMonth).toBe(2_000_000);
    expect(PLAN_LIMITS.enterprise.perSecond).toBe(500);
    expect(PLAN_LIMITS.enterprise.perMonth).toBe(-1);
  });

  it("月間制限超過時の 429 response に upgrade_url / pricing_url / current_plan / next_plan / Retry-After を含む", async () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyKey = `rate:monthly:cust_test:${ym}`;
    await env.RATE_LIMITS.put(monthlyKey, String(PLAN_LIMITS.free.perMonth));

    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(429);

    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const body: any = await res.json();
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.error.upgrade_url).toBe("https://shirabe.dev/upgrade");
    expect(body.error.pricing_url).toBe("https://shirabe.dev/docs/address-pricing");
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

  it("秒次制限超過時の 429 response にも next_plan + Retry-After: 1 を含む", async () => {
    const sec = Math.floor(Date.now() / 1000);
    const secondKey = `rate:second:cust_test:${sec}`;
    await env.RATE_LIMITS.put(secondKey, String(PLAN_LIMITS.free.perSecond));

    const res = await app.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1");

    const body: any = await res.json();
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.error.upgrade_url).toBe("https://shirabe.dev/upgrade");
    expect(body.error.next_plan?.name).toBe("starter");
  });

  it("Pro プランの 429 で next_plan(Enterprise)を含む", async () => {
    const proApp = new Hono<AppEnv>();
    proApp.use("*", async (c, next) => {
      c.set("plan", "pro");
      c.set("customerId", "cust_pro");
      await next();
    });
    proApp.use("*", rateLimitMiddleware);
    proApp.get("/test", (c) => c.json({ ok: true }));

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await env.RATE_LIMITS.put(
      `rate:monthly:cust_pro:${ym}`,
      String(PLAN_LIMITS.pro.perMonth)
    );

    const res = await proApp.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error.next_plan?.name).toBe("enterprise");
    expect(body.error.current_plan?.name).toBe("pro");
  });

  it("Enterprise は月間無制限", async () => {
    const entApp = new Hono<AppEnv>();
    entApp.use("*", async (c, next) => {
      c.set("plan", "enterprise");
      c.set("customerId", "cust_ent");
      await next();
    });
    entApp.use("*", rateLimitMiddleware);
    entApp.get("/test", (c) => c.json({ ok: true }));

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await env.RATE_LIMITS.put(`rate:monthly:cust_ent:${ym}`, "999999999");

    const res = await entApp.fetch(
      new Request("http://localhost/test"),
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
  });
});

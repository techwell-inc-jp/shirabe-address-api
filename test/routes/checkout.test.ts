/**
 * Stripe Checkout エンドポイントの単体テスト(住所 API 版)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";

function envWithStripe() {
  return {
    ...createMockEnv(),
    STRIPE_SECRET_KEY: "sk_test_abc",
    STRIPE_PRICE_STARTER: "price_starter",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_ENTERPRISE: "price_enterprise",
  };
}

function stubFetch(impl: typeof fetch) {
  const fn = vi.fn<typeof fetch>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/v1/address/checkout — validation", () => {
  it("returns 400 INVALID_REQUEST for non-JSON body", async () => {
    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 for missing email", async () => {
    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed email", async () => {
    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", plan: "starter" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid plan", async () => {
    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", plan: "premium" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for free plan (not a paid checkout)", async () => {
    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", plan: "free" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/address/checkout — config errors", () => {
  it("returns 500 when STRIPE_SECRET_KEY is missing", async () => {
    const env = envWithStripe();
    delete (env as { STRIPE_SECRET_KEY?: string }).STRIPE_SECRET_KEY;
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", plan: "starter" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("INTERNAL_ERROR");
  });

  it("returns 500 when Price ID for the requested plan is missing", async () => {
    const env = envWithStripe();
    delete (env as { STRIPE_PRICE_PRO?: string }).STRIPE_PRICE_PRO;
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", plan: "pro" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/address/checkout — happy path", () => {
  it("returns checkout_url and stores pending key with api=address metadata", async () => {
    let capturedBody: string | undefined;
    stubFetch(async (_url, init) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify({
          id: "cs_test_123",
          url: "https://checkout.stripe.com/c/pay/cs_test_123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "buyer@example.com", plan: "starter" }),
      },
      env as unknown as Record<string, unknown>
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { checkout_url: string };
    expect(json.checkout_url).toBe("https://checkout.stripe.com/c/pay/cs_test_123");

    // Stripe に送った body に住所 API 固有の metadata が含まれている
    const params = new URLSearchParams(capturedBody ?? "");
    expect(params.get("mode")).toBe("subscription");
    expect(params.get("line_items[0][price]")).toBe("price_starter");
    expect(params.get("customer_email")).toBe("buyer@example.com");
    expect(params.get("metadata[api]")).toBe("address");
    expect(params.get("metadata[plan]")).toBe("starter");
    expect(params.get("subscription_data[metadata][api]")).toBe("address");
    expect(params.get("success_url")).toContain("/api/v1/address/checkout/success");
    expect(params.get("cancel_url")).toContain("/api/v1/address/checkout/cancel");
    // apiKeyHash が metadata に含まれている(Webhook が引き当てる)
    expect(params.get("metadata[apiKeyHash]")).toMatch(/^[0-9a-f]{64}$/);

    // USAGE_LOGS に checkout-pending が保存されている
    const hash = params.get("metadata[apiKeyHash]") as string;
    const pendingRaw = await (env.USAGE_LOGS as unknown as KVNamespace).get(
      `checkout-pending:${hash}`
    );
    expect(pendingRaw).not.toBeNull();
    const pending = JSON.parse(pendingRaw!) as {
      apiKey: string;
      plan: string;
      email: string;
      api: string;
    };
    expect(pending.apiKey).toMatch(/^shrb_[A-Za-z0-9]{32}$/);
    expect(pending.plan).toBe("starter");
    expect(pending.email).toBe("buyer@example.com");
    expect(pending.api).toBe("address");
  });

  it("maps each plan to its corresponding Price ID", async () => {
    const sent: string[] = [];
    stubFetch(async (_url, init) => {
      sent.push(init?.body as string);
      return new Response(
        JSON.stringify({ id: "cs", url: "https://example.com" }),
        { status: 200 }
      );
    });

    for (const plan of ["starter", "pro", "enterprise"] as const) {
      const env = envWithStripe();
      const res = await app.request(
        "/api/v1/address/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "u@example.com", plan }),
        },
        env as unknown as Record<string, unknown>
      );
      expect(res.status).toBe(200);
    }

    const starterParams = new URLSearchParams(sent[0] ?? "");
    const proParams = new URLSearchParams(sent[1] ?? "");
    const enterpriseParams = new URLSearchParams(sent[2] ?? "");
    expect(starterParams.get("line_items[0][price]")).toBe("price_starter");
    expect(proParams.get("line_items[0][price]")).toBe("price_pro");
    expect(enterpriseParams.get("line_items[0][price]")).toBe("price_enterprise");
  });
});

describe("POST /api/v1/address/checkout — Stripe failure", () => {
  it("returns 502 CHECKOUT_FAILED when Stripe API errors", async () => {
    stubFetch(
      async () =>
        new Response('{"error":{"message":"invalid price"}}', {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
    );
    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", plan: "starter" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("CHECKOUT_FAILED");
  });

  it("returns 502 when Stripe response is missing url", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ id: "cs_no_url" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    const env = envWithStripe();
    const res = await app.request(
      "/api/v1/address/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", plan: "pro" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(502);
  });
});

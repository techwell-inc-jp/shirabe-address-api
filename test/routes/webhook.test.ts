/**
 * Stripe Webhook エンドポイントの単体テスト(住所 API 版)
 *
 * 署名検証 + 5 種のイベントハンドラ(checkout.session.completed, invoice.payment_*,
 * customer.subscription.updated/deleted)を AggregatedApiKeyInfo 書込まで含めて検証。
 */
import { describe, expect, it } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import type { AggregatedApiKeyInfo } from "../../src/types/api-key.js";

const WEBHOOK_SECRET = "whsec_test";
const PATH = "/api/v1/address/webhook/stripe";

function envWithSecrets() {
  return {
    ...createMockEnv(),
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_STARTER: "price_starter",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_ENTERPRISE: "price_enterprise",
  };
}

async function signPayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = `${timestamp}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signed));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${hex}`;
}

async function postEvent(
  env: ReturnType<typeof envWithSecrets>,
  event: Record<string, unknown>,
  options: { signature?: string | null; timestamp?: number; webhookSecret?: string } = {}
): Promise<Response> {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sigHeader =
    options.signature === null
      ? undefined
      : options.signature ??
        (await signPayload(body, options.webhookSecret ?? WEBHOOK_SECRET, options.timestamp));
  if (sigHeader) headers["Stripe-Signature"] = sigHeader;
  return app.request(
    PATH,
    { method: "POST", headers, body },
    env as unknown as Record<string, unknown>
  );
}

async function readKey(
  env: ReturnType<typeof envWithSecrets>,
  hash: string
): Promise<AggregatedApiKeyInfo | null> {
  const raw = await (env.API_KEYS as unknown as KVNamespace).get(hash);
  return raw ? (JSON.parse(raw) as AggregatedApiKeyInfo) : null;
}

async function seedPending(
  env: ReturnType<typeof envWithSecrets>,
  hash: string,
  data: { apiKey: string; plan: string; email: string; api?: string }
): Promise<void> {
  await (env.USAGE_LOGS as unknown as KVNamespace).put(
    `checkout-pending:${hash}`,
    JSON.stringify({ ...data, api: data.api ?? "address" })
  );
}

async function seedReverse(
  env: ReturnType<typeof envWithSecrets>,
  stripeCustomerId: string,
  customerId: string,
  apiKeyHash: string
): Promise<void> {
  await (env.USAGE_LOGS as unknown as KVNamespace).put(
    `stripe-reverse:${stripeCustomerId}`,
    `${customerId},${apiKeyHash}`
  );
}

// ─── 署名検証 ────────────────────────────────────────────────

describe("POST /api/v1/address/webhook/stripe — signature verification", () => {
  it("returns 500 when STRIPE_WEBHOOK_SECRET is missing", async () => {
    const env = envWithSecrets();
    delete (env as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET;
    const res = await postEvent(env, { type: "checkout.session.completed" });
    expect(res.status).toBe(500);
  });

  it("returns 401 when Stripe-Signature header is missing", async () => {
    const env = envWithSecrets();
    const res = await postEvent(env, { type: "checkout.session.completed" }, {
      signature: null,
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid signature", async () => {
    const env = envWithSecrets();
    const res = await postEvent(env, { type: "checkout.session.completed" }, {
      signature: "t=1,v1=deadbeef",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when signature timestamp is older than tolerance", async () => {
    const env = envWithSecrets();
    const staleTs = Math.floor(Date.now() / 1000) - 10 * 60; // 10 分前
    const res = await postEvent(
      env,
      { type: "checkout.session.completed" },
      { timestamp: staleTs }
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON payload (signed)", async () => {
    const env = envWithSecrets();
    const body = "not a json";
    const sig = await signPayload(body, WEBHOOK_SECRET);
    const res = await app.request(
      PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": sig,
        },
        body,
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 received:true for unknown event type (ACK)", async () => {
    const env = envWithSecrets();
    const res = await postEvent(env, { type: "some.random.event" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);
  });
});

// ─── metadata.api 判別 ─────────────────────────────────────────

describe("POST /api/v1/address/webhook/stripe — metadata.api guard", () => {
  it("skips events whose metadata.api is not 'address'", async () => {
    const env = envWithSecrets();
    const res = await postEvent(env, {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { api: "calendar", plan: "pro", apiKeyHash: "abc123" },
          customer: "cus_x",
          subscription: "sub_x",
        },
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; skipped?: string };
    expect(json.skipped).toBe("api=calendar");

    // 副作用なし: API_KEYS に何も書かれていない
    const raw = await (env.API_KEYS as unknown as KVNamespace).get("abc123");
    expect(raw).toBeNull();
  });
});

// ─── checkout.session.completed ─────────────────────────────────

describe("POST /api/v1/address/webhook/stripe — checkout.session.completed", () => {
  it("creates a new AggregatedApiKeyInfo with apis.address", async () => {
    const env = envWithSecrets();
    const hash = "a".repeat(64);
    await seedPending(env, hash, {
      apiKey: "shrb_test",
      plan: "starter",
      email: "u@example.com",
    });

    const res = await postEvent(env, {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { api: "address", plan: "starter", apiKeyHash: hash },
          customer: "cus_abc",
          subscription: "sub_abc",
        },
      },
    });

    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    expect(info).not.toBeNull();
    expect(info!.stripeCustomerId).toBe("cus_abc");
    expect(info!.email).toBe("u@example.com");
    expect(info!.apis.address).toBeDefined();
    expect(info!.apis.address!.plan).toBe("starter");
    expect(info!.apis.address!.status).toBe("active");
    expect(info!.apis.address!.stripeSubscriptionId).toBe("sub_abc");
    expect(info!.apis.calendar).toBeUndefined();

    // stripe-reverse が設定されている
    const reverse = await (env.USAGE_LOGS as unknown as KVNamespace).get(
      "stripe-reverse:cus_abc"
    );
    expect(reverse).toBeTruthy();
    expect(reverse).toContain(hash);

    // email インデックス
    const emailIdx = await (env.USAGE_LOGS as unknown as KVNamespace).get(
      "email:u@example.com"
    );
    expect(emailIdx).toBe(hash);
  });

  it("merges apis.address onto an existing AggregatedApiKeyInfo without touching apis.calendar", async () => {
    const env = envWithSecrets();
    const hash = "b".repeat(64);
    await seedPending(env, hash, {
      apiKey: "shrb_test",
      plan: "pro",
      email: "u@example.com",
    });

    // 既存の暦 API 契約ありキー
    const existing: AggregatedApiKeyInfo = {
      customerId: "cust_existing",
      stripeCustomerId: "cus_existing",
      email: "u@example.com",
      createdAt: "2026-01-01T00:00:00Z",
      apis: {
        calendar: { plan: "pro", status: "active" },
      },
    };
    await (env.API_KEYS as unknown as KVNamespace).put(
      hash,
      JSON.stringify(existing)
    );

    const res = await postEvent(env, {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { api: "address", plan: "pro", apiKeyHash: hash },
          customer: "cus_existing",
          subscription: "sub_new",
        },
      },
    });

    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    expect(info!.apis.calendar).toEqual({ plan: "pro", status: "active" });
    expect(info!.apis.address!.plan).toBe("pro");
    expect(info!.apis.address!.stripeSubscriptionId).toBe("sub_new");
    expect(info!.createdAt).toBe("2026-01-01T00:00:00Z"); // 既存の createdAt を保持
  });

  it("migrates a legacy flat key into aggregated form when apis.address is added", async () => {
    const env = envWithSecrets();
    const hash = "c".repeat(64);
    await seedPending(env, hash, {
      apiKey: "shrb_test",
      plan: "starter",
      email: "u@example.com",
    });

    // 旧フォーマット(暦 API 単独時代)
    await (env.API_KEYS as unknown as KVNamespace).put(
      hash,
      JSON.stringify({
        plan: "pro",
        customerId: "cust_legacy",
        stripeCustomerId: "cus_legacy",
        stripeSubscriptionId: "sub_legacy",
        email: "legacy@example.com",
        status: "active",
        createdAt: "2025-12-01T00:00:00Z",
      })
    );

    const res = await postEvent(env, {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { api: "address", plan: "starter", apiKeyHash: hash },
          customer: "cus_legacy",
          subscription: "sub_addr",
        },
      },
    });

    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    // 旧→新フォーマット化されている
    expect(info!.apis.calendar).toBeDefined();
    expect(info!.apis.calendar!.plan).toBe("pro");
    expect(info!.apis.address!.plan).toBe("starter");
  });

  it("ignores events when checkout-pending is missing", async () => {
    const env = envWithSecrets();
    const hash = "d".repeat(64);
    const res = await postEvent(env, {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { api: "address", plan: "starter", apiKeyHash: hash },
          customer: "cus_nopending",
        },
      },
    });
    expect(res.status).toBe(200);
    const raw = await (env.API_KEYS as unknown as KVNamespace).get(hash);
    expect(raw).toBeNull();
  });
});

// ─── invoice.payment_* ───────────────────────────────────────

describe("POST /api/v1/address/webhook/stripe — invoice events", () => {
  async function seedAddressKey(
    env: ReturnType<typeof envWithSecrets>,
    hash: string,
    status: "active" | "suspended"
  ): Promise<void> {
    const info: AggregatedApiKeyInfo = {
      customerId: "cust_1",
      stripeCustomerId: "cus_1",
      createdAt: "2026-04-01T00:00:00Z",
      apis: {
        address: {
          plan: "starter",
          status,
          stripeSubscriptionId: "sub_1",
        },
      },
    };
    await (env.API_KEYS as unknown as KVNamespace).put(hash, JSON.stringify(info));
    await seedReverse(env, "cus_1", "cust_1", hash);
  }

  it("suspends apis.address on invoice.payment_failed", async () => {
    const env = envWithSecrets();
    const hash = "e".repeat(64);
    await seedAddressKey(env, hash, "active");

    const res = await postEvent(env, {
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_1",
          subscription_details: { metadata: { api: "address" } },
        },
      },
    });
    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    expect(info!.apis.address!.status).toBe("suspended");
  });

  it("re-activates apis.address on invoice.payment_succeeded when previously suspended", async () => {
    const env = envWithSecrets();
    const hash = "f".repeat(64);
    await seedAddressKey(env, hash, "suspended");

    const res = await postEvent(env, {
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_1",
          subscription_details: { metadata: { api: "address" } },
        },
      },
    });
    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    expect(info!.apis.address!.status).toBe("active");
  });

  it("skips invoice events whose subscription_details.metadata.api is 'calendar'", async () => {
    const env = envWithSecrets();
    const hash = "e".repeat(64);
    await seedAddressKey(env, hash, "active");

    const res = await postEvent(env, {
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_1",
          subscription_details: { metadata: { api: "calendar" } },
        },
      },
    });
    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    // 住所 API のステータスは変わらない
    expect(info!.apis.address!.status).toBe("active");
  });
});

// ─── customer.subscription.updated / deleted ──────────────────

describe("POST /api/v1/address/webhook/stripe — subscription events", () => {
  async function seed(
    env: ReturnType<typeof envWithSecrets>,
    hash: string,
    overrides?: Partial<AggregatedApiKeyInfo["apis"]["address"]>
  ): Promise<void> {
    const info: AggregatedApiKeyInfo = {
      customerId: "cust_1",
      stripeCustomerId: "cus_1",
      createdAt: "2026-04-01T00:00:00Z",
      apis: {
        address: {
          plan: "starter",
          status: "active",
          stripeSubscriptionId: "sub_1",
          ...overrides,
        },
      },
    };
    await (env.API_KEYS as unknown as KVNamespace).put(hash, JSON.stringify(info));
    await seedReverse(env, "cus_1", "cust_1", hash);
  }

  it("updates plan on subscription.updated when price id changes to STRIPE_PRICE_PRO", async () => {
    const env = envWithSecrets();
    const hash = "g".repeat(64);
    await seed(env, hash);

    const res = await postEvent(env, {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          metadata: { api: "address" },
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    expect(info!.apis.address!.plan).toBe("pro");
  });

  it("does nothing when subscription.updated price id is unknown (defensive)", async () => {
    const env = envWithSecrets();
    const hash = "h".repeat(64);
    await seed(env, hash);

    const res = await postEvent(env, {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          metadata: { api: "address" },
          items: { data: [{ price: { id: "price_unknown" } }] },
        },
      },
    });
    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    expect(info!.apis.address!.plan).toBe("starter"); // 変化なし
  });

  it("downgrades apis.address to free on subscription.deleted when subscription id matches", async () => {
    const env = envWithSecrets();
    const hash = "i".repeat(64);
    await seed(env, hash);

    const res = await postEvent(env, {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          metadata: { api: "address" },
        },
      },
    });
    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    expect(info!.apis.address!.plan).toBe("free");
    expect(info!.apis.address!.status).toBe("active");
    // stripeSubscriptionId はクリアされている(free プラン化)
    expect(info!.apis.address!.stripeSubscriptionId).toBeUndefined();
  });

  it("does not downgrade when the deleted subscription id does not match apis.address's subscription", async () => {
    const env = envWithSecrets();
    const hash = "j".repeat(64);
    await seed(env, hash); // sub_1 が住所の subscription

    const res = await postEvent(env, {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_other", // 別の(暦などの)subscription
          customer: "cus_1",
          metadata: { api: "address" }, // ラベルだけ address だが実態は別
        },
      },
    });
    expect(res.status).toBe(200);
    const info = await readKey(env, hash);
    // 変化なし
    expect(info!.apis.address!.plan).toBe("starter");
    expect(info!.apis.address!.stripeSubscriptionId).toBe("sub_1");
  });
});

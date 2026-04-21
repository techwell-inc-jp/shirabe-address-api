/**
 * Stripe Checkout Session 作成(住所 API 用)
 *
 * POST /api/v1/address/checkout
 *   Request:  { email: string, plan: "starter" | "pro" | "enterprise" }
 *   Response: { checkout_url: string }
 *
 * 暦 API 側 `shirabe-calendar/src/routes/checkout.ts` を住所 API 用に移植。
 *
 * 相違点:
 * - Price ID は住所 API 用(starter/pro/enterprise、impl-order §3.5 + wrangler.toml)
 * - session.metadata に `api="address"` を付与(Webhook 側で対象 API 判別に使用)
 * - success_url / cancel_url は住所 API 専用パス
 * - 生 API キーは USAGE_LOGS に `checkout-pending:{hash}` として 1 時間保存。
 *   暦 API と KV は別 namespace(住所 API 専用)なので暦 API と競合しない
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";

export const checkout = new Hono<AppEnv>();

/** 有料プラン名 */
const VALID_PLANS = ["starter", "pro", "enterprise"] as const;
type PaidPlan = (typeof VALID_PLANS)[number];

/** メールアドレスの簡易バリデーション */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** API キーに使うランダム英数字の文字セット */
const CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** checkout-pending の TTL(1時間 = 3600 秒) */
const PENDING_TTL = 3600;

/** 住所 API の checkout で識別用に付与する metadata.api 値 */
export const API_MARKER = "address" as const;

/**
 * SHA-256 ハッシュを 16 進文字列で返す。
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `shrb_` + 32文字ランダム英数字の API キーを生成する(暦 API と同形式)。
 */
function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let key = "shrb_";
  for (let i = 0; i < 32; i++) {
    const idx = bytes[i] as number;
    key += CHARSET[idx % CHARSET.length];
  }
  return key;
}

/**
 * プラン名に対応する Stripe Price ID を env から取得する。
 */
function getPriceId(
  plan: PaidPlan,
  env: AppEnv["Bindings"]
): string | undefined {
  const map: Record<PaidPlan, string | undefined> = {
    starter: env.STRIPE_PRICE_STARTER,
    pro: env.STRIPE_PRICE_PRO,
    enterprise: env.STRIPE_PRICE_ENTERPRISE,
  };
  return map[plan];
}

export type CreateSessionParams = {
  priceId: string;
  apiKeyHash: string;
  plan: PaidPlan;
  email: string;
  stripeSecretKey: string;
  /** テスト用 fetch 差し替え */
  fetchImpl?: typeof fetch;
};

/**
 * Stripe Checkout Session を作成する(fetch で REST API 直接呼出)。
 *
 * metadata.api = "address" + subscription_data[metadata][api] = "address" の両方を付与する:
 * - session.metadata: checkout.session.completed イベントで参照
 * - subscription_data[metadata]: 後続の invoice / subscription 系イベントで参照
 */
export async function createStripeCheckoutSession(
  params: CreateSessionParams
): Promise<{ url: string }> {
  const body = new URLSearchParams();
  body.append("mode", "subscription");
  body.append("line_items[0][price]", params.priceId);
  // Meter 方式では quantity は送らない(Meter Events から算出)。
  body.append("customer_email", params.email);
  body.append("metadata[apiKeyHash]", params.apiKeyHash);
  body.append("metadata[plan]", params.plan);
  body.append("metadata[api]", API_MARKER);
  // subscription にも同じ metadata を継承させる(invoice.* / subscription.* 側で参照)
  body.append("subscription_data[metadata][api]", API_MARKER);
  body.append("subscription_data[metadata][apiKeyHash]", params.apiKeyHash);
  body.append("subscription_data[metadata][plan]", params.plan);
  body.append(
    "success_url",
    "https://shirabe.dev/api/v1/address/checkout/success?session_id={CHECKOUT_SESSION_ID}"
  );
  body.append("cancel_url", "https://shirabe.dev/api/v1/address/checkout/cancel");

  const doFetch = params.fetchImpl ?? fetch;
  const res = await doFetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(params.stripeSecretKey + ":")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const session = (await res.json()) as { url?: string };
  if (!session.url) {
    throw new Error("Stripe checkout session response missing url");
  }
  return { url: session.url };
}

checkout.post("/", async (c) => {
  // Parse body
  let body: { email?: string; plan?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON with email and plan.",
        },
      },
      400
    );
  }

  const { email, plan } = body;

  // Validate
  if (!email || !EMAIL_PATTERN.test(email)) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "A valid email address is required.",
        },
      },
      400
    );
  }

  if (!plan || !VALID_PLANS.includes(plan as PaidPlan)) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: `plan must be one of: ${VALID_PLANS.join(", ")}`,
        },
      },
      400
    );
  }

  const paidPlan = plan as PaidPlan;
  const priceId = getPriceId(paidPlan, c.env);
  if (!priceId) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `Stripe Price ID for plan "${paidPlan}" is not configured.`,
        },
      },
      500
    );
  }

  const stripeSecretKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Payment system is not configured (STRIPE_SECRET_KEY missing).",
        },
      },
      500
    );
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await sha256Hex(apiKey);

  let checkoutUrl: string;
  try {
    const session = await createStripeCheckoutSession({
      priceId,
      apiKeyHash,
      plan: paidPlan,
      email,
      stripeSecretKey,
    });
    checkoutUrl = session.url;
  } catch (err) {
    console.error("[checkout] Stripe Checkout Session creation failed:", err);
    return c.json(
      {
        error: {
          code: "CHECKOUT_FAILED",
          message: "Failed to create checkout session. Please try again.",
        },
      },
      502
    );
  }

  // 生 API キー + email + plan を一時保存(Webhook が apiKeyHash で引き当てる)。
  // 住所 API の USAGE_LOGS は暦 API とは別 namespace なので競合しない。
  const pendingKey = `checkout-pending:${apiKeyHash}`;
  const pendingData = JSON.stringify({
    apiKey,
    plan: paidPlan,
    email,
    api: API_MARKER,
  });
  await c.env.USAGE_LOGS.put(pendingKey, pendingData, {
    expirationTtl: PENDING_TTL,
  });

  return c.json({ checkout_url: checkoutUrl });
});

// テスト用 export
export { generateApiKey, sha256Hex, VALID_PLANS };

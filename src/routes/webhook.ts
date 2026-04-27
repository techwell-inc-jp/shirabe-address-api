/**
 * Stripe Webhook 処理(住所 API 用)
 *
 * POST /api/v1/address/webhook/stripe
 * - auth / rate-limit ミドルウェアは適用しない(署名検証のみ)
 * - Stripe Webhook Secret で署名検証(Web Crypto HMAC-SHA256、暦 API と同ロジック)
 *
 * 処理対象イベント(住所 API 関連のみ。metadata.api === "address" で判別):
 *   - checkout.session.completed         → 新規契約、AggregatedApiKeyInfo.apis.address を設定
 *   - invoice.payment_failed             → apis.address.status = "suspended"
 *   - invoice.payment_succeeded          → apis.address.status を "active" に復帰
 *   - customer.subscription.updated      → plan 変更を apis.address.plan に反映
 *   - customer.subscription.deleted      → apis.address.plan = "free"(キーは残す)
 *
 * KV は **1 キー集約構造**(`types/api-key.ts`)で書き込む:
 *   - 既存キーがあれば apis.address のみマージして他の API(calendar)情報を保持
 *   - 既存が無ければ新規 AggregatedApiKeyInfo を作成
 *   - 旧フォーマット(暦 API 単独時代の flat)を見つけた場合は migrate してから apis.address を追加
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  isAggregatedApiKeyInfo,
  migrateToAggregated,
  type AggregatedApiKeyInfo,
  type ApiPlanInfo,
  type StoredApiKeyInfo,
} from "../types/api-key.js";

export const webhook = new Hono<AppEnv>();

/** 住所 API を示す metadata.api 値(checkout.ts と共有) */
const API_MARKER = "address" as const;

/** 署名許容範囲(5分) */
const SIGNATURE_TOLERANCE_SEC = 300;

// ─── 署名検証 ────────────────────────────────────────────────

function parseStripeSignature(header: string): {
  timestamp: string;
  signatures: string[];
} {
  const parts = header.split(",");
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  return { timestamp, signatures };
}

async function computeHmacSha256(
  secret: string,
  payload: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return result === 0;
}

export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): Promise<boolean> {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SIGNATURE_TOLERANCE_SEC) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = await computeHmacSha256(webhookSecret, signedPayload);
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

// ─── metadata ガード ──────────────────────────────────────────

/**
 * イベントが住所 API 関連かを判定する。
 *
 * - checkout.session.completed: session.metadata.api をチェック
 * - invoice.* / customer.subscription.*:
 *     invoice.subscription_details.metadata か subscription.metadata の api をチェック
 * - metadata が取れない場合は、stripe-reverse で引いた apiKeyHash の AggregatedApiKeyInfo に
 *   apis.address が存在するかでフォールバック判定する(Webhook ハンドラ内で対応)
 */
function extractApiMarker(event: Record<string, unknown>): string | undefined {
  const data = event.data as { object?: Record<string, unknown> } | undefined;
  const obj = data?.object ?? {};

  // checkout.session.completed 等
  const directMeta = (obj as { metadata?: Record<string, string> }).metadata;
  if (directMeta && typeof directMeta.api === "string") return directMeta.api;

  // invoice.* — invoice.subscription_details.metadata
  const subDetails = (obj as { subscription_details?: { metadata?: Record<string, string> } })
    .subscription_details;
  if (subDetails?.metadata && typeof subDetails.metadata.api === "string") {
    return subDetails.metadata.api;
  }

  // customer.subscription.* — subscription オブジェクトそのものに metadata
  // (event.data.object が subscription の場合、上の directMeta でカバー済)
  return undefined;
}

// ─── KV ヘルパ ─────────────────────────────────────────────────

/** API_KEYS から AggregatedApiKeyInfo を読む。旧フォーマットは migrate する。 */
async function readAggregated(
  apiKeysKV: KVNamespace,
  apiKeyHash: string
): Promise<AggregatedApiKeyInfo | null> {
  const raw = await apiKeysKV.get(apiKeyHash);
  if (!raw) return null;
  let stored: StoredApiKeyInfo;
  try {
    stored = JSON.parse(raw) as StoredApiKeyInfo;
  } catch {
    return null;
  }
  return isAggregatedApiKeyInfo(stored) ? stored : migrateToAggregated(stored);
}

/** AggregatedApiKeyInfo を API_KEYS に書く(apis.address のみ更新する想定) */
async function writeAggregated(
  apiKeysKV: KVNamespace,
  apiKeyHash: string,
  info: AggregatedApiKeyInfo
): Promise<void> {
  await apiKeysKV.put(apiKeyHash, JSON.stringify(info));
}

/** stripe-reverse で stripeCustomerId から apiKeyHash を引く */
async function lookupByStripeCustomer(
  stripeCustomerId: string,
  usageLogsKV: KVNamespace
): Promise<{ customerId: string; apiKeyHash: string } | null> {
  const reverseStr = await usageLogsKV.get(`stripe-reverse:${stripeCustomerId}`);
  if (!reverseStr) return null;
  const parts = reverseStr.split(",", 2);
  const customerId = parts[0];
  const apiKeyHash = parts[1];
  if (!customerId || !apiKeyHash) return null;
  return { customerId, apiKeyHash };
}

// ─── イベントハンドラ ─────────────────────────────────────────

async function handleCheckoutCompleted(
  event: Record<string, unknown>,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const session = (event.data as { object?: Record<string, unknown> }).object ?? {};
  const metadata = (session as { metadata?: Record<string, string> }).metadata ?? {};
  const apiKeyHash = metadata.apiKeyHash;
  const plan = metadata.plan;
  const stripeCustomerId = (session as { customer?: string }).customer;
  const stripeSubscriptionId = (session as { subscription?: string }).subscription;

  if (!apiKeyHash || !plan) {
    console.error("[webhook:address] checkout.session.completed missing metadata");
    return;
  }

  // checkout-pending から生 API キーと email を引く
  const pendingStr = await usageLogsKV.get(`checkout-pending:${apiKeyHash}`);
  if (!pendingStr) {
    console.error(
      "[webhook:address] checkout-pending not found for hash:",
      apiKeyHash
    );
    return;
  }
  const pending = JSON.parse(pendingStr) as { email?: string; api?: string };
  if (pending.api && pending.api !== API_MARKER) {
    // 他 API の pending を誤って掴んだ場合は無視
    return;
  }

  const customerId = `cust_${apiKeyHash.slice(0, 16)}`;
  const now = new Date().toISOString();

  // 1. API_KEYS: 既存があればマージ、無ければ新規作成
  const existing = await readAggregated(apiKeysKV, apiKeyHash);
  const addressPlanInfo: ApiPlanInfo = {
    plan: plan as ApiPlanInfo["plan"],
    status: "active",
    stripeSubscriptionId,
    updatedAt: now,
  };
  const info: AggregatedApiKeyInfo = existing
    ? {
        ...existing,
        stripeCustomerId: stripeCustomerId ?? existing.stripeCustomerId,
        email: pending.email ?? existing.email,
        apis: {
          ...existing.apis,
          address: addressPlanInfo,
        },
      }
    : {
        customerId,
        stripeCustomerId,
        email: pending.email,
        createdAt: now,
        apis: { address: addressPlanInfo },
      };
  await writeAggregated(apiKeysKV, apiKeyHash, info);

  // 2. stripe-reverse 登録
  if (stripeCustomerId) {
    await usageLogsKV.put(
      `stripe-reverse:${stripeCustomerId}`,
      `${customerId},${apiKeyHash}`
    );
  }

  // 3. email インデックス(存在すれば更新、無ければ作成)
  if (pending.email) {
    await usageLogsKV.put(`email:${pending.email}`, apiKeyHash);
  }

  // checkout-pending は TTL(1h)で自然失効に任せる。success ページが競合で読める余地を残す。
}

async function handlePaymentFailed(
  event: Record<string, unknown>,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const obj = (event.data as { object?: Record<string, unknown> }).object ?? {};
  const stripeCustomerId = (obj as { customer?: string }).customer;
  if (!stripeCustomerId) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) return;

  const info = await readAggregated(apiKeysKV, lookup.apiKeyHash);
  if (!info || !info.apis.address) return; // 住所 API 未契約なら無視
  info.apis.address = {
    ...info.apis.address,
    status: "suspended",
    updatedAt: new Date().toISOString(),
  };
  await writeAggregated(apiKeysKV, lookup.apiKeyHash, info);
}

async function handlePaymentSucceeded(
  event: Record<string, unknown>,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const obj = (event.data as { object?: Record<string, unknown> }).object ?? {};
  const stripeCustomerId = (obj as { customer?: string }).customer;
  if (!stripeCustomerId) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) return;

  const info = await readAggregated(apiKeysKV, lookup.apiKeyHash);
  if (!info || !info.apis.address) return;
  if (info.apis.address.status === "suspended") {
    info.apis.address = {
      ...info.apis.address,
      status: "active",
      updatedAt: new Date().toISOString(),
    };
    await writeAggregated(apiKeysKV, lookup.apiKeyHash, info);
  }
}

async function handleSubscriptionUpdated(
  event: Record<string, unknown>,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace,
  env: AppEnv["Bindings"]
): Promise<void> {
  const subscription = (event.data as { object?: Record<string, unknown> }).object ?? {};
  const stripeCustomerId = (subscription as { customer?: string }).customer;
  const stripeSubscriptionId = (subscription as { id?: string }).id;
  if (!stripeCustomerId || !stripeSubscriptionId) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) return;

  const info = await readAggregated(apiKeysKV, lookup.apiKeyHash);
  if (!info || !info.apis.address) return;

  // plan 変更検出: subscription.items.data[0].price.id を住所 API 用 Price ID と照合
  const items = (subscription as { items?: { data?: Array<{ price?: { id?: string } }> } })
    .items;
  const priceId = items?.data?.[0]?.price?.id;
  let plan: ApiPlanInfo["plan"] | null = null;
  if (priceId === env.STRIPE_PRICE_STARTER) plan = "starter";
  else if (priceId === env.STRIPE_PRICE_PRO) plan = "pro";
  else if (priceId === env.STRIPE_PRICE_ENTERPRISE) plan = "enterprise";

  if (plan && plan !== info.apis.address.plan) {
    info.apis.address = {
      ...info.apis.address,
      plan,
      stripeSubscriptionId,
      updatedAt: new Date().toISOString(),
    };
    await writeAggregated(apiKeysKV, lookup.apiKeyHash, info);
  }
}

async function handleSubscriptionDeleted(
  event: Record<string, unknown>,
  apiKeysKV: KVNamespace,
  usageLogsKV: KVNamespace
): Promise<void> {
  const subscription = (event.data as { object?: Record<string, unknown> }).object ?? {};
  const stripeCustomerId = (subscription as { customer?: string }).customer;
  const stripeSubscriptionId = (subscription as { id?: string }).id;
  if (!stripeCustomerId || !stripeSubscriptionId) return;

  const lookup = await lookupByStripeCustomer(stripeCustomerId, usageLogsKV);
  if (!lookup) return;

  const info = await readAggregated(apiKeysKV, lookup.apiKeyHash);
  if (!info || !info.apis.address) return;

  // 対象 subscription が住所 API のものか確認(暦 API の subscription なら無視)
  if (
    info.apis.address.stripeSubscriptionId &&
    info.apis.address.stripeSubscriptionId !== stripeSubscriptionId
  ) {
    return;
  }

  info.apis.address = {
    plan: "free",
    status: "active",
    updatedAt: new Date().toISOString(),
  };
  await writeAggregated(apiKeysKV, lookup.apiKeyHash, info);

  // 住所専用の Stripe customer だった場合のみ reverse を削除する。
  // 他 API(暦)がまだ同じ stripe customer を使っている可能性を保守的に考慮し、
  // 本 Phase では reverse を残す(スタックは少量、害なし)。
}

// ─── エントリポイント ─────────────────────────────────────────

/**
 * Issue #17: dedupe キー TTL(秒)。
 * Stripe webhook の最大 retry window は 3 日(指数バックオフ)。
 * 余裕を持たせて 7 日保持し、再送 event を確実に重複検出する。
 * shirabe-calendar PR #31 と同値。
 */
const DEDUPE_TTL_SEC = 7 * 24 * 60 * 60;

/** Issue #17: dedupe キー prefix(USAGE_LOGS namespace 内、shirabe-calendar と同一)。 */
const DEDUPE_KEY_PREFIX = "webhook-dedupe:";

webhook.post("/", async (c) => {
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook:address] STRIPE_WEBHOOK_SECRET is not configured");
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Webhook not configured." } },
      500
    );
  }

  const signatureHeader = c.req.header("Stripe-Signature");
  if (!signatureHeader) {
    return c.json(
      {
        error: {
          code: "INVALID_SIGNATURE",
          message: "Missing Stripe-Signature header.",
        },
      },
      401
    );
  }

  const rawBody = await c.req.text();

  const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    return c.json(
      {
        error: {
          code: "INVALID_SIGNATURE",
          message: "Invalid webhook signature.",
        },
      },
      401
    );
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid JSON body." } },
      400
    );
  }

  const eventType = typeof event.type === "string" ? event.type : "";
  const eventId = typeof event.id === "string" ? event.id : undefined;

  // metadata.api が指定されている場合は住所 API 以外を弾く(早期リターン)。
  // 指定されていないイベント(invoice.* 等で subscription_details が空)は
  // 個別ハンドラ内で apis.address の存在チェックで判別する。
  // 注: 他 API skip は dedupe より前に行い、住所 API 以外の event.id を
  // 住所 API 側 KV に書き込まないようにする(暦 API 側 webhook で別途 dedupe される)。
  const marker = extractApiMarker(event);
  if (marker && marker !== API_MARKER) {
    return c.json({ received: true, skipped: `api=${marker}` });
  }

  // Issue #17 Step 1: Idempotency check (event.id ベース重複検出)
  // Stripe は 2xx 返却後でも同じ event を再送する可能性があり(retry / 重複配信)、
  // 重複処理されると以下の risk が発生する(shirabe-calendar #28 と同値):
  //   (a) email キー上書き衝突(別顧客が同 email を後で登録した場合)
  //   (b) payment_failed → payment_succeeded → retry payment_failed の順序逆転
  //   (c) subscription.updated 古い plan の巻き戻し
  // event.id 不在(独自テスト等)の場合は dedupe をスキップして従来通り処理する。
  if (eventId) {
    const dedupeKey = `${DEDUPE_KEY_PREFIX}${eventId}`;
    const existing = await c.env.USAGE_LOGS.get(dedupeKey);
    if (existing) {
      return c.json({ received: true, deduped: true });
    }
  }

  switch (eventType) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event, c.env.API_KEYS, c.env.USAGE_LOGS, c.env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event, c.env.API_KEYS, c.env.USAGE_LOGS);
      break;
    default:
      // 未対応イベントは 200 で ACK(Stripe のリトライを止めるため)
      break;
  }

  // Issue #17 Step 2: Mark as processed (handler 成功後、return 直前)
  // 例外発生時は本行に到達せず dedupe キーが書かれない →
  // Stripe の retry で再処理される(意図通り、処理失敗時は冪等性より retry を優先)。
  // 未対応イベントも mark しておくことで Stripe retry を抑制する。
  if (eventId) {
    const dedupeKey = `${DEDUPE_KEY_PREFIX}${eventId}`;
    await c.env.USAGE_LOGS.put(dedupeKey, new Date().toISOString(), {
      expirationTtl: DEDUPE_TTL_SEC,
    });
  }

  return c.json({ received: true });
});

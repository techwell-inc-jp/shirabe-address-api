/**
 * Stripe Meter Events 送信
 *
 * 実装指示書 §3.5:
 * - Product: Shirabe Address API
 * - Meter ID: mtr_61UXv0btCvll6mOOV41DV2wkNs8tV9Ro
 * - Event Name: address_api_requests
 *
 * Stripe Billing Meter Events API:
 *   POST https://api.stripe.com/v1/billing/meter_events
 *   event_name=address_api_requests
 *   payload[stripe_customer_id]=cus_...
 *   payload[value]=1
 *   identifier=<unique> (optional、冪等性キー)
 *   timestamp=<unix>   (optional、省略時は Stripe が now() で埋める)
 *
 * Free プラン契約者および匿名ユーザーには送らない。
 * 送信失敗はログのみ(レスポンスに影響させない)。usage-logger から waitUntil 経由で呼ぶ。
 */

/** 住所 API の Meter Event 名(経営者が Stripe ダッシュボードで設定済) */
export const METER_EVENT_NAME = "address_api_requests" as const;

/** Meter ID(参考値、Stripe 側の紐付けに使用。ここからは event_name が一次識別子) */
export const METER_ID = "mtr_61UXv0btCvll6mOOV41DV2wkNs8tV9Ro" as const;

/** Stripe 有料プラン(Meter Event 送信対象) */
export const METERED_PLANS: ReadonlySet<string> = new Set([
  "starter",
  "pro",
  "enterprise",
]);

export type MeterEventResult =
  | { success: true }
  | { success: false; error: string };

export type SendMeterEventParams = {
  stripeSecretKey: string;
  stripeCustomerId: string;
  /** 省略時は 1 を送る */
  value?: number;
  /** 省略時は送らない(Stripe が now() を埋める) */
  timestamp?: number;
  /** 冪等性キー(推奨: request id など)。省略時は送らない */
  identifier?: string;
  /** テスト用 fetch 差し替え */
  fetchImpl?: typeof fetch;
};

/**
 * Stripe Meter Events API に 1 イベント送る。
 * Free / 匿名の判定は呼び出し側(usage-logger)で行う。
 */
export async function sendMeterEvent(
  params: SendMeterEventParams
): Promise<MeterEventResult> {
  if (!params.stripeSecretKey) {
    return { success: false, error: "STRIPE_SECRET_KEY is not configured" };
  }
  if (!params.stripeCustomerId) {
    return { success: false, error: "stripeCustomerId is empty" };
  }

  const body = new URLSearchParams();
  body.append("event_name", METER_EVENT_NAME);
  body.append("payload[stripe_customer_id]", params.stripeCustomerId);
  body.append("payload[value]", String(params.value ?? 1));
  if (typeof params.timestamp === "number" && Number.isFinite(params.timestamp)) {
    body.append("timestamp", String(Math.floor(params.timestamp)));
  }
  if (params.identifier) {
    body.append("identifier", params.identifier);
  }

  const doFetch = params.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch("https://api.stripe.com/v1/billing/meter_events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `network: ${message}` };
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "<unreadable body>";
    }
    return {
      success: false,
      error: `Stripe API ${response.status}: ${detail.slice(0, 200)}`,
    };
  }

  return { success: true };
}

/**
 * plan が metered(有料)かを判定する。usage-logger の発火判定に使う。
 */
export function isMeteredPlan(plan: string | undefined): boolean {
  return typeof plan === "string" && METERED_PLANS.has(plan);
}

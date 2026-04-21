/**
 * Stripe Meter Events 送信の単体テスト(実装指示書 §3.5)
 */
import { describe, it, expect } from "vitest";
import {
  sendMeterEvent,
  isMeteredPlan,
  METER_EVENT_NAME,
  METER_ID,
  METERED_PLANS,
} from "../../src/services/meter.js";

describe("sendMeterEvent — happy path", () => {
  it("POSTs event_name + payload + Bearer auth to Stripe Meter Events API", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ id: "evt_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await sendMeterEvent({
      stripeSecretKey: "sk_test_abc",
      stripeCustomerId: "cus_abc",
      value: 1,
      fetchImpl,
    });

    expect(result.success).toBe(true);
    expect(capturedUrl).toBe("https://api.stripe.com/v1/billing/meter_events");
    expect(capturedInit?.method).toBe("POST");

    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer sk_test_abc");
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(capturedInit?.body as string);
    expect(params.get("event_name")).toBe(METER_EVENT_NAME);
    expect(params.get("payload[stripe_customer_id]")).toBe("cus_abc");
    expect(params.get("payload[value]")).toBe("1");
    expect(params.get("timestamp")).toBeNull();
    expect(params.get("identifier")).toBeNull();
  });

  it("defaults value to 1 when omitted", async () => {
    let capturedBody: string | undefined;
    const fetchImpl: typeof fetch = async (_u, init) => {
      capturedBody = init?.body as string;
      return new Response("{}", { status: 200 });
    };
    await sendMeterEvent({
      stripeSecretKey: "sk_test",
      stripeCustomerId: "cus_x",
      fetchImpl,
    });
    const params = new URLSearchParams(capturedBody ?? "");
    expect(params.get("payload[value]")).toBe("1");
  });

  it("includes timestamp and identifier when provided", async () => {
    let capturedBody: string | undefined;
    const fetchImpl: typeof fetch = async (_u, init) => {
      capturedBody = init?.body as string;
      return new Response("{}", { status: 200 });
    };
    await sendMeterEvent({
      stripeSecretKey: "sk_test",
      stripeCustomerId: "cus_x",
      value: 5,
      timestamp: 1_712_000_000,
      identifier: "req_abc123",
      fetchImpl,
    });
    const params = new URLSearchParams(capturedBody ?? "");
    expect(params.get("payload[value]")).toBe("5");
    expect(params.get("timestamp")).toBe("1712000000");
    expect(params.get("identifier")).toBe("req_abc123");
  });

  it("floors non-integer timestamps", async () => {
    let capturedBody: string | undefined;
    const fetchImpl: typeof fetch = async (_u, init) => {
      capturedBody = init?.body as string;
      return new Response("{}", { status: 200 });
    };
    await sendMeterEvent({
      stripeSecretKey: "sk_test",
      stripeCustomerId: "cus_x",
      timestamp: 1_712_000_000.9,
      fetchImpl,
    });
    const params = new URLSearchParams(capturedBody ?? "");
    expect(params.get("timestamp")).toBe("1712000000");
  });
});

describe("sendMeterEvent — error handling", () => {
  it("returns success=false with message on Stripe 4xx response", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('{"error":{"message":"No such meter"}}', {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    const result = await sendMeterEvent({
      stripeSecretKey: "sk_test",
      stripeCustomerId: "cus_x",
      fetchImpl,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Stripe API 400/);
      expect(result.error).toMatch(/No such meter/);
    }
  });

  it("returns success=false on network error", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const result = await sendMeterEvent({
      stripeSecretKey: "sk_test",
      stripeCustomerId: "cus_x",
      fetchImpl,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/network: fetch failed/);
    }
  });

  it("returns error when stripeSecretKey is empty", async () => {
    const result = await sendMeterEvent({
      stripeSecretKey: "",
      stripeCustomerId: "cus_x",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/STRIPE_SECRET_KEY/);
    }
  });

  it("returns error when stripeCustomerId is empty", async () => {
    const result = await sendMeterEvent({
      stripeSecretKey: "sk_test",
      stripeCustomerId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/stripeCustomerId is empty/);
    }
  });
});

describe("isMeteredPlan", () => {
  it.each([
    ["starter", true],
    ["pro", true],
    ["enterprise", true],
    ["free", false],
    ["", false],
    [undefined, false],
    ["unknown", false],
  ])("isMeteredPlan(%s) → %s", (plan, expected) => {
    expect(isMeteredPlan(plan as string | undefined)).toBe(expected);
  });
});

describe("constants", () => {
  it("exposes the event name used in Stripe dashboard", () => {
    expect(METER_EVENT_NAME).toBe("address_api_requests");
  });

  it("exposes the provisioned meter id for traceability", () => {
    expect(METER_ID).toBe("mtr_61UXv0btCvll6mOOV41DV2wkNs8tV9Ro");
  });

  it("lists only paid plans as metered", () => {
    expect(METERED_PLANS.has("free")).toBe(false);
    expect(METERED_PLANS.has("starter")).toBe(true);
    expect(METERED_PLANS.has("pro")).toBe(true);
    expect(METERED_PLANS.has("enterprise")).toBe(true);
  });
});

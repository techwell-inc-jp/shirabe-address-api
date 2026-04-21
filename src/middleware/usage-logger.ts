/**
 * 利用量ログミドルウェア(住所 API 版)
 *
 * 2 つの責務:
 * 1. KV(`USAGE_LOGS`)に利用量を記録 — 顧客ID + 日付でカウント、月次インデックスも更新。
 *    後方互換のため暦 API と同じキー形式を維持(住所 API は専用 KV namespace)
 * 2. 有料プランについて Stripe Meter Event を送信(実装指示書 §3.5) —
 *    waitUntil でファイア&フォーゲット、失敗はログのみ
 *
 * どちらもレスポンス後に非同期で実行する。失敗は握りつぶしてクライアントに影響させない。
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";
import { isMeteredPlan, sendMeterEvent } from "../services/meter.js";

/**
 * 利用量ログの KV キーを生成する
 * 形式: usage:{customerId}:{YYYY-MM-DD}
 */
function getUsageKey(customerId: string): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `usage:${customerId}:${date}`;
}

/**
 * 日付インデックスの KV キーを生成する
 * 形式: usage-index:{YYYY-MM-DD}
 */
function getIndexKey(): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `usage-index:${date}`;
}

/**
 * 月間利用量カウントの KV キーを生成する
 * 形式: usage-monthly:{customerId}:{YYYY-MM}
 */
function getMonthlyUsageKey(customerId: string): string {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage-monthly:${customerId}:${ym}`;
}

/** 月間利用量カウンターの TTL(35日 = 月またぎの余裕込み) */
const MONTHLY_USAGE_TTL = 35 * 24 * 60 * 60;

export async function usageLoggerMiddleware(c: Context<AppEnv>, next: Next) {
  await next();

  // レスポンスが正常の場合のみカウント
  if (c.res.status >= 200 && c.res.status < 400) {
    const customerId = c.get("customerId") as string | undefined;
    if (!customerId) return;

    const usageKV = c.env.USAGE_LOGS;
    const usageKey = getUsageKey(customerId);

    const recordUsage = async () => {
      // 利用量カウントを加算
      const currentStr = await usageKV.get(usageKey);
      const current = currentStr ? parseInt(currentStr, 10) : 0;
      await usageKV.put(usageKey, String(current + 1), {
        expirationTtl: 7 * 24 * 60 * 60,
      });

      // 月間利用量カウントを加算
      const monthlyKey = getMonthlyUsageKey(customerId);
      const monthlyStr = await usageKV.get(monthlyKey);
      const monthlyCurrent = monthlyStr ? parseInt(monthlyStr, 10) : 0;
      await usageKV.put(monthlyKey, String(monthlyCurrent + 1), {
        expirationTtl: MONTHLY_USAGE_TTL,
      });

      // 日付インデックスに customerId を追加
      const indexKey = getIndexKey();
      const indexStr = await usageKV.get(indexKey);
      const customerIds = indexStr ? new Set(indexStr.split(",")) : new Set<string>();
      if (!customerIds.has(customerId)) {
        customerIds.add(customerId);
        await usageKV.put(indexKey, Array.from(customerIds).join(","), {
          expirationTtl: 7 * 24 * 60 * 60,
        });
      }
    };

    // 有料プランかつ Stripe Customer ID が紐付いている場合のみ Meter Event を送る。
    // Free / 匿名ユーザーには送らない(課金対象外)。
    const plan = c.get("plan") as string | undefined;
    const stripeCustomerId = c.get("stripeCustomerId") as string | undefined;
    const stripeSecretKey = c.env.STRIPE_SECRET_KEY;
    const shouldMeter =
      isMeteredPlan(plan) &&
      typeof stripeCustomerId === "string" &&
      stripeCustomerId.length > 0 &&
      typeof stripeSecretKey === "string" &&
      stripeSecretKey.length > 0;

    const recordMeter = async () => {
      if (!shouldMeter) return;
      const result = await sendMeterEvent({
        stripeSecretKey: stripeSecretKey as string,
        stripeCustomerId: stripeCustomerId as string,
        value: 1,
      });
      if (!result.success) {
        console.warn("[usage-logger] meter event failed:", result.error);
      }
    };

    try {
      const ctx = c.executionCtx;
      if (ctx && "waitUntil" in ctx) {
        ctx.waitUntil(recordUsage());
        ctx.waitUntil(recordMeter());
      } else {
        await recordUsage();
        await recordMeter();
      }
    } catch {
      await recordUsage();
      await recordMeter();
    }
  }
}

export { getUsageKey, getIndexKey, getMonthlyUsageKey };

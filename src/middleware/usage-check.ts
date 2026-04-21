/**
 * 月間利用量チェックミドルウェア(住所 API 版)
 *
 * 住所 API プランごとの月間上限(実装指示書 §3.5):
 * - Free:        5,000回
 * - Starter:   200,000回
 * - Pro:     2,000,000回
 * - Enterprise: 無制限
 *
 * 月間カウントは `usage-monthly:{customerId}:{YYYY-MM}` から読み取る。
 * カウントのインクリメントは usage-logger ミドルウェアで実施する。
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";

/** プランごとの月間利用量上限(-1 = 無制限) */
export const MONTHLY_USAGE_LIMITS = {
  free: 5_000,
  starter: 200_000,
  pro: 2_000_000,
  enterprise: -1,
} as const;

export type UsagePlanType = keyof typeof MONTHLY_USAGE_LIMITS;

/** アップグレード導線 URL */
export const UPGRADE_URL = "https://shirabe.dev/upgrade";

/**
 * 月間利用量カウントの KV キーを生成する
 * 形式: usage-monthly:{customerId}:{YYYY-MM}
 */
export function getMonthlyUsageKey(customerId: string, now: Date = new Date()): string {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage-monthly:${customerId}:${ym}`;
}

function buildLimitMessage(plan: UsagePlanType, limit: number): string {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  return `${planLabel} plan limit (${limit.toLocaleString("en-US")} requests/month) reached. Upgrade to continue.`;
}

export async function usageCheckMiddleware(c: Context<AppEnv>, next: Next) {
  const plan = c.get("plan") as UsagePlanType | undefined;
  const customerId = c.get("customerId") as string | undefined;

  if (!plan || !customerId) {
    await next();
    return;
  }

  const limit = MONTHLY_USAGE_LIMITS[plan];

  // Enterprise(-1)は無制限
  if (limit < 0) {
    await next();
    return;
  }

  const usageKV = c.env.USAGE_LOGS;
  const key = getMonthlyUsageKey(customerId);
  const currentStr = await usageKV.get(key);
  const current = currentStr ? parseInt(currentStr, 10) : 0;

  if (current >= limit) {
    return c.json(
      {
        error: {
          code: "USAGE_LIMIT_EXCEEDED",
          message: buildLimitMessage(plan, limit),
          upgrade_url: UPGRADE_URL,
        },
      },
      429
    );
  }

  await next();
}

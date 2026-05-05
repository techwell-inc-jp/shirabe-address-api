/**
 * プラン別料金 / 上限情報と「次のプラン」マップ(住所 API 版)。
 *
 * AI agent が 429 response から 1 hop で「次に upgrade すべきプラン名 / 料金 /
 * checkout URL」を取得できるようにする(C-1 paid 突破経路 ergonomics)。
 *
 * 値は `shirabe-address-api/CLAUDE.md` §6 料金プラン(暦 API の 10 倍レンジ)と
 * 一致させる(canonical source は docs)。
 */

export type PlanName = "free" | "starter" | "pro" | "enterprise";

export type CurrentPlanSummary = {
  name: PlanName;
  monthly_limit: number; // -1 = 無制限
  monthly_used: number;
};

export type NextPlanSummary = {
  name: PlanName;
  monthly_limit: number;
  price_per_request_jpy: number;
  monthly_price_example_jpy: number;
  example_monthly_requests: number;
  checkout_path: string;
};

export const PRICING_URL = "https://shirabe.dev/docs/address-pricing";
export const UPGRADE_URL = "https://shirabe.dev/upgrade";

/**
 * プラン別の月間上限(canonical、docs と一致)。
 *
 * rate-limit.ts と usage-check.ts はこの map を single source of truth として
 * 参照する。
 */
export const PLAN_MONTHLY_LIMITS: Record<PlanName, number> = {
  free: 5_000,
  starter: 200_000,
  pro: 2_000_000,
  enterprise: -1,
} as const;

/**
 * 次のプラン map。Enterprise には next_plan なし。
 * 例示価格は CLAUDE.md §6 の月額例(住所 API、暦 API の 10 倍単価)。
 */
export const NEXT_PLAN_MAP: Partial<Record<PlanName, NextPlanSummary>> = {
  free: {
    name: "starter",
    monthly_limit: 200_000,
    price_per_request_jpy: 0.5,
    monthly_price_example_jpy: 100_000,
    example_monthly_requests: 200_000,
    checkout_path: "/upgrade?plan=starter&api=address&from=429",
  },
  starter: {
    name: "pro",
    monthly_limit: 2_000_000,
    price_per_request_jpy: 0.3,
    monthly_price_example_jpy: 600_000,
    example_monthly_requests: 2_000_000,
    checkout_path: "/upgrade?plan=pro&api=address&from=429",
  },
  pro: {
    name: "enterprise",
    monthly_limit: -1,
    price_per_request_jpy: 0.1,
    monthly_price_example_jpy: 1_000_000,
    example_monthly_requests: 10_000_000,
    checkout_path: "/upgrade?plan=enterprise&api=address&from=429",
  },
} as const;

/**
 * 翌月 1 日 UTC 0 時(月次 reset 時刻)。
 */
export function getMonthlyResetDate(now: Date = new Date()): Date {
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  return new Date(year, month, 1);
}

/**
 * 月次 reset までの残秒数(`Retry-After` header 用)。
 */
export function secondsUntilMonthlyReset(now: Date = new Date()): number {
  const reset = getMonthlyResetDate(now);
  return Math.max(0, Math.ceil((reset.getTime() - now.getTime()) / 1000));
}

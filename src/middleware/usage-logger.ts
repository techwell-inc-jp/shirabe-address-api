/**
 * 利用量ログミドルウェア(住所 API 版)
 *
 * リクエストごとに Cloudflare KV(住所 API 専用 `USAGE_LOGS`)に利用量を記録する。
 * 顧客ID + 日付をキーとしてカウントし、日次バッチで Stripe に報告するためのデータを蓄積する。
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";

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

    try {
      const ctx = c.executionCtx;
      if (ctx && "waitUntil" in ctx) {
        ctx.waitUntil(recordUsage());
      } else {
        await recordUsage();
      }
    } catch {
      await recordUsage();
    }
  }
}

export { getUsageKey, getIndexKey, getMonthlyUsageKey };

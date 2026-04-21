/**
 * APIキー認証ミドルウェア(住所 API 版)
 *
 * - X-API-Key ヘッダーからキーを取得
 * - SHA-256 ハッシュ化して Cloudflare KV(共有 `API_KEYS` namespace)と照合
 * - キー形式: shrb_ + 32文字ランダム
 * - ヘッダー未指定の場合は匿名 Free ユーザーとして通す
 * - キーは指定されているが形式不正/未登録なら 401 Unauthorized を返す
 * - 認証成功時、住所 API のプラン情報を c.set() でコンテキストに格納
 *
 * 1 キー集約構造(`src/types/api-key.ts`)対応:
 *   - `resolveApiPlan(stored, "address")` で住所 API のプランを抽出
 *   - 旧フォーマット(暦 API 単独時代のフラット形式)は in-memory で自動変換されるが、
 *     その場合 `apis.address` は未設定となるため、住所 API としては匿名 Free 扱いとなる
 *   - 暦 API との共通顧客属性(customerId 等)は `stored.customerId` を参照
 */
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";
import {
  resolveApiPlan,
  type StoredApiKeyInfo,
} from "../types/api-key.js";

/** APIキーの形式: shrb_ + 32文字の英数字 */
const API_KEY_PATTERN = /^shrb_[a-zA-Z0-9]{32}$/;

/**
 * APIキーをSHA-256でハッシュ化する
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 任意文字列を SHA-256 でハッシュ化し、16 進文字列として返す
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 匿名ユーザーの customerId を生成する
 *
 * `CF-Connecting-IP` ヘッダーから IP アドレスを取得し、SHA-256 ハッシュ化した
 * 先頭 16 文字を `anon_` プレフィックスに付けて返す。
 */
export async function getAnonymousId(c: Context<AppEnv>): Promise<string> {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const hash = await sha256Hex(ip);
  return `anon_${hash.slice(0, 16)}`;
}

/**
 * APIキー認証ミドルウェア
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const apiKey = c.req.header("X-API-Key");

  // APIキーヘッダー未指定は匿名 Free ユーザーとして通す
  if (!apiKey) {
    c.set("plan", "free");
    c.set("customerId", await getAnonymousId(c));
    c.set("apiKeyHash", "");
    c.set("apiKeyIdHash", "");
    await next();
    return;
  }

  // 形式チェック
  if (!API_KEY_PATTERN.test(apiKey)) {
    return c.json(
      {
        error: {
          code: "INVALID_API_KEY",
          message: "Invalid or missing API key. Include X-API-Key header.",
        },
      },
      401
    );
  }

  // SHA-256 ハッシュ化して KV 検索
  const hash = await hashApiKey(apiKey);
  const keyInfoStr = await c.env.API_KEYS.get(hash);

  if (!keyInfoStr) {
    return c.json(
      {
        error: {
          code: "INVALID_API_KEY",
          message: "Invalid or missing API key. Include X-API-Key header.",
        },
      },
      401
    );
  }

  // 1 キー集約構造(新・旧両対応)
  const stored: StoredApiKeyInfo = JSON.parse(keyInfoStr);
  const planInfo = resolveApiPlan(stored, "address");

  // 住所 API のプラン未設定なら匿名 Free 扱い(暦 API 単独契約の顧客がアクセスしたケース)
  // ただし、顧客識別は API キーに紐づいた customerId を使う(匿名 IP ベースではない)
  if (!planInfo) {
    c.set("plan", "free");
    c.set("customerId", stored.customerId);
    c.set("apiKeyHash", hash);
    c.set("apiKeyIdHash", hash.slice(0, 16));
    await next();
    return;
  }

  // suspended 状態は 403 を返す
  if (planInfo.status === "suspended") {
    return c.json(
      {
        error: {
          code: "API_KEY_SUSPENDED",
          message:
            "API key suspended due to payment failure. Update payment at: https://shirabe.dev/billing",
        },
      },
      403
    );
  }

  // プラン情報をコンテキストに格納
  c.set("plan", planInfo.plan);
  c.set("customerId", stored.customerId);
  c.set("apiKeyHash", hash);
  c.set("apiKeyIdHash", hash.slice(0, 16));
  // Stripe Customer ID は AggregatedApiKeyInfo トップレベルに保持される。
  // 旧フォーマット経由(migrateToAggregated)でも stripeCustomerId は保持される。
  const stripeCustomerId = (stored as { stripeCustomerId?: string }).stripeCustomerId;
  if (typeof stripeCustomerId === "string" && stripeCustomerId.length > 0) {
    c.set("stripeCustomerId", stripeCustomerId);
  }

  await next();
}

// hashApiKey をテスト用にエクスポート
export { hashApiKey };

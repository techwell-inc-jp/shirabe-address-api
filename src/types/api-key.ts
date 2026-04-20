/**
 * KV API_KEYS に保存されるデータ構造定義
 *
 * 実装指示書 §5.2 + docs/kv-api-keys-design.md に基づく「1キー集約構造」。
 * 同一 APIキーで暦 API と住所 API の両方を利用可能にするための
 * マルチ API 対応フォーマット。
 *
 * 後方互換性: 旧フォーマット(フラット `plan`)を読み取り時に検出し、
 * 暦 API 相当として解釈する。暦 API 側のミドルウェアは本ファイルの
 * 型とは独立だが、同じ変換ロジックを共有する必要がある。
 */

/** 単一 API 内のプラン状態 */
export type ApiPlanInfo = {
  plan: "free" | "starter" | "pro" | "enterprise";
  /** 未設定は "active" 扱い */
  status?: "active" | "suspended";
  /** Stripe Subscription ID(該当プランが有償の場合) */
  stripeSubscriptionId?: string;
  /** 該当 API のプランが最後に更新された時刻(ISO8601) */
  updatedAt?: string;
};

/**
 * 【新フォーマット】1キー集約構造
 *
 * 例:
 * ```json
 * {
 *   "customerId": "cus_abc123",
 *   "stripeCustomerId": "cus_abc123",
 *   "email": "user@example.com",
 *   "createdAt": "2026-04-22T...",
 *   "apis": {
 *     "calendar": { "plan": "pro", "status": "active", ... },
 *     "address":  { "plan": "starter", "status": "active", ... }
 *   }
 * }
 * ```
 */
export type AggregatedApiKeyInfo = {
  customerId: string;
  stripeCustomerId?: string;
  email?: string;
  createdAt: string;
  apis: {
    calendar?: ApiPlanInfo;
    address?: ApiPlanInfo;
    /** 将来の API 追加時はここにキーを増やす */
    [apiName: string]: ApiPlanInfo | undefined;
  };
};

/**
 * 【旧フォーマット】暦 API 単独時代のフラット形式
 *
 * 読み取り時にのみ認識し、ミドルウェア内で暫定的に集約形に変換する。
 * 書き込み(新規発行・Webhook 更新)は必ず新フォーマットで行う。
 *
 * 旧フォーマットの検出条件: トップレベルに `apis` プロパティが存在せず、
 * `plan` プロパティが存在する。
 */
export type LegacyApiKeyInfo = {
  plan: "free" | "starter" | "pro" | "enterprise";
  customerId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  email?: string;
  status?: "active" | "suspended";
  createdAt: string;
};

/**
 * KV から読み取る際の Union 型
 * ミドルウェアは isAggregatedApiKeyInfo で分岐する。
 */
export type StoredApiKeyInfo = AggregatedApiKeyInfo | LegacyApiKeyInfo;

/** 新フォーマット判定(type guard) */
export function isAggregatedApiKeyInfo(
  info: StoredApiKeyInfo
): info is AggregatedApiKeyInfo {
  return "apis" in info && typeof (info as AggregatedApiKeyInfo).apis === "object";
}

/**
 * 旧フォーマット → 新フォーマット への読み取り時変換
 *
 * 旧フォーマットは暦 API のプランを表していたため、`apis.calendar` に
 * マップする。住所 API のプランは未設定扱い(= `apis.address` なし)。
 *
 * 本関数は **読み取り専用の in-memory 変換** であり、KV への書き戻しは
 * 行わない(後方互換性維持のため)。完全移行は別タスクで段階的に実施する。
 */
export function migrateToAggregated(
  legacy: LegacyApiKeyInfo
): AggregatedApiKeyInfo {
  return {
    customerId: legacy.customerId,
    stripeCustomerId: legacy.stripeCustomerId,
    email: legacy.email,
    createdAt: legacy.createdAt,
    apis: {
      calendar: {
        plan: legacy.plan,
        status: legacy.status ?? "active",
        stripeSubscriptionId: legacy.stripeSubscriptionId,
      },
    },
  };
}

/**
 * 特定 API の ApiPlanInfo を取得するヘルパ
 *
 * - 新フォーマットならそのまま `apis[apiName]` を返す
 * - 旧フォーマットなら `migrateToAggregated` を通して `calendar` 相当を返す
 * - 対象 API が未契約なら undefined を返す(呼び出し側で匿名 Free 扱い)
 */
export function resolveApiPlan(
  stored: StoredApiKeyInfo,
  apiName: "calendar" | "address"
): ApiPlanInfo | undefined {
  const aggregated = isAggregatedApiKeyInfo(stored)
    ? stored
    : migrateToAggregated(stored);
  return aggregated.apis[apiName];
}

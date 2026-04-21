/**
 * Cloudflare Workers 環境変数・バインディングの型定義
 *
 * 実装指示書 §8.1 の Worker Secrets 一覧と対応。
 * 暦 API(../../shirabe-calendar/src/types/env.ts)と形を揃えつつ、
 * 住所 API 固有の ADDRESS_CACHE / FLYIO_GEOCODE_URL / FLY_INTERNAL_TOKEN を追加。
 */

/**
 * Analytics Engine データセット(最小インターフェース)
 * 暦 API と互換の形状。テスト時のモック差し替え用。
 */
export type AnalyticsEngineDataPoint = {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
};

export type AnalyticsEngineDataset = {
  writeDataPoint: (point: AnalyticsEngineDataPoint) => void;
};

/**
 * Workers Bindings(wrangler.toml と整合)
 */
export type Env = {
  // === KV Namespace ===
  /** APIキーのハッシュ → プラン情報(暦・住所共有、1キー集約構造) */
  API_KEYS: KVNamespace;
  /** レート制限カウンター(住所 API 専用) */
  RATE_LIMITS: KVNamespace;
  /** 利用量ログ(住所 API 専用) */
  USAGE_LOGS: KVNamespace;
  /** 住所正規化結果キャッシュ(TTL 3600秒、実装指示書 §3.4) */
  ADDRESS_CACHE: KVNamespace;

  // === Analytics Engine ===
  /** 住所 API 専用 Dataset(shirabe_address_events) */
  ANALYTICS?: AnalyticsEngineDataset;

  // === Vars ===
  /** APIバージョン */
  API_VERSION: string;
  /** Fly.io 側内部エンドポイント URL */
  FLYIO_GEOCODE_URL: string;
  /** Stripe Price ID — Starter(後日設定) */
  STRIPE_PRICE_STARTER?: string;
  /** Stripe Price ID — Pro(後日設定) */
  STRIPE_PRICE_PRO?: string;
  /** Stripe Price ID — Enterprise(後日設定) */
  STRIPE_PRICE_ENTERPRISE?: string;

  // === Secrets(wrangler secret put で投入) ===
  /** Stripe Secret Key(暦 API と共有可) */
  STRIPE_SECRET_KEY?: string;
  /** Stripe Webhook Secret(住所 API 用、新規) */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Workers → Fly.io 内部通信用共有シークレット */
  FLY_INTERNAL_TOKEN?: string;
  /** Cloudflare Account ID(Analytics Engine SQL API 用) */
  CF_ACCOUNT_ID?: string;
  /** Account Analytics:Read のみ付与した最小権限トークン */
  CF_AE_READ_TOKEN?: string;
  /** /internal/stats Basic認証ユーザー名 */
  INTERNAL_STATS_USER?: string;
  /** /internal/stats Basic認証パスワード */
  INTERNAL_STATS_PASS?: string;
};

/**
 * ミドルウェアが Context に設定する変数の型定義
 *
 * 暦 API と同形状だが、1キー集約構造における「住所 API としての plan」
 * を住所 API 側で抽出したものを `plan` に格納する。
 *
 * 住所 API 固有フィールド(`address*`)は normalize / batch のルートハンドラが
 * Fly.io 応答を受けた後に `c.set()` し、analytics ミドルウェアがそれを読んで
 * AE に記録する(実装指示書 §7.2)。
 */
export type AppVariables = {
  /** 住所 API に対して解決されたプラン */
  plan: "free" | "starter" | "pro" | "enterprise";
  /** 顧客識別子(匿名時は anon_<ip_hash>) */
  customerId: string;
  /** APIキーの SHA-256 ハッシュ全文(64 hex)。匿名時は空 */
  apiKeyHash: string;
  /** 計測用識別子(SHA-256 先頭16文字)。匿名時は空 */
  apiKeyIdHash: string;
  /**
   * Stripe Customer ID(`cus_...`)。課金プラン契約済の顧客のみ設定される。
   * usage-logger から Meter Events を送る際に使う。匿名/Free は undefined。
   */
  stripeCustomerId?: string;

  // === 住所 API 固有(normalize/batch ハンドラがセット) ===
  /** AE blob9 相当: success / ambiguous / error */
  addressResponseType?: "success" | "ambiguous" | "error";
  /** AE blob10 相当: in_coverage / out_of_coverage */
  addressCoverage?: "in_coverage" | "out_of_coverage";
  /** AE double2 相当: batch 件数(単一リクエストは 1) */
  addressBatchSize?: number;
  /** AE double3 相当: level 0-4 */
  addressLevel?: 0 | 1 | 2 | 3 | 4;
  /** AE double4 相当: confidence 0.0-1.0 */
  addressConfidence?: number;
};

/**
 * Honoアプリケーションの型パラメータ
 */
export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};

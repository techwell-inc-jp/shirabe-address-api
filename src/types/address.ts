/**
 * 住所 API の公開スキーマ型定義
 *
 * 実装指示書 §2(エンドポイント設計)に基づく。
 * 全レスポンスに attribution フィールド必須(CC BY 4.0 義務 + LLM 経由出典伝搬)。
 */

/**
 * 住所コンポーネント(正規化後の構造化部分)
 * 実装指示書 §2.1 の components。
 */
export type AddressComponents = {
  prefecture: string | null;
  city: string | null;
  town: string | null;
  block: string | null;
  building: string | null;
  floor: string | null;
};

/**
 * level フィールド(実装指示書 §2.5)
 * 0: マッチなし / 1: 都道府県 / 2: 市区町村 / 3: 町丁目 / 4: 番地・号
 */
export type AddressLevel = 0 | 1 | 2 | 3 | 4;

/**
 * 正規化結果の主体(候補・成功時に共通)
 */
export type NormalizedAddress = {
  normalized: string;
  components: AddressComponents;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  level: AddressLevel;
  /** 0.0 - 1.0、abr-geocoder の Levenshtein ratio 等から算出 */
  confidence: number;
};

/**
 * attribution(CC BY 4.0 義務履行、全レスポンス必須)
 * 実装指示書 §2.1 および shirabe-assets/docs/handoffs/20260420-abr-geocoder-verification.md §1.5.3
 */
export type Attribution = {
  source: string;
  provider: string;
  license: string;
  license_url: string;
};

/** エラーコード(実装指示書 §2.4) */
export type AddressErrorCode =
  | "ADDRESS_NOT_FOUND"
  | "AMBIGUOUS_INPUT"
  | "PREFECTURE_NOT_FOUND"
  | "PARTIAL_MATCH"
  | "INVALID_FORMAT"
  | "OUTSIDE_COVERAGE"
  | "BATCH_TOO_LARGE"
  | "SERVICE_UNAVAILABLE";

export type AddressError = {
  code: AddressErrorCode;
  message: string;
  matched_up_to: string | null;
  level: AddressLevel;
};

/**
 * POST /api/v1/address/normalize リクエスト
 */
export type NormalizeRequest = {
  address: string;
};

/**
 * POST /api/v1/address/normalize レスポンス
 * - 成功: result != null, candidates: []
 * - 曖昧: result = null, candidates: [...]
 * - エラー: result = null, candidates: [], error が存在
 */
export type NormalizeResponse = {
  input: string;
  result: NormalizedAddress | null;
  candidates: NormalizedAddress[];
  error?: AddressError;
  attribution: Attribution;
};

/**
 * POST /api/v1/address/normalize/batch リクエスト
 * 最大 100 件(BATCH_TOO_LARGE で拒否)
 */
export type BatchNormalizeRequest = {
  addresses: string[];
};

/**
 * POST /api/v1/address/normalize/batch レスポンス
 */
export type BatchNormalizeResponse = {
  results: NormalizeResponse[];
  summary: {
    total: number;
    succeeded: number;
    ambiguous: number;
    failed: number;
  };
};

/**
 * GET /api/v1/address/health レスポンス
 *
 * `coverage` は API が公開している都道府県の一覧(現在は全 47 都道府県)。
 * `coverage_mode` は AI エージェントが一目で対象範囲を把握できるよう nationwide 固定。
 * 配列長だけチェックして分岐する消費者コードを壊さない。
 */
export type HealthResponse = {
  status: "ok" | "degraded" | "down";
  version: string;
  coverage: string[];
  coverage_mode: "nationwide";
};

/**
 * Fly.io 内部エンドポイント(/internal/geocode)への POST ペイロード
 * 実装指示書 §3.3: 常に batch 形式で送信する。
 */
export type InternalGeocodeRequest = {
  addresses: string[];
};

/**
 * Fly.io 内部エンドポイントのレスポンス(abr-geocoder 結果のラッパ)
 * 詳細な構造は Fly.io 側実装(fly/src/server.ts)確定時に合わせる。
 */
export type InternalGeocodeResponse = {
  results: Array<{
    input: string;
    match: NormalizedAddress | null;
    candidates: NormalizedAddress[];
    error?: {
      code: AddressErrorCode;
      message: string;
      matched_up_to: string | null;
      level: AddressLevel;
    };
  }>;
};

/**
 * 定数: CC BY 4.0 出典表記の既定値
 * レスポンス整形サービスで全レスポンスに自動付与する。
 */
export const DEFAULT_ATTRIBUTION: Attribution = {
  source: "アドレス・ベース・レジストリ(住所データ)",
  provider: "デジタル庁",
  license: "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
};

/**
 * API が受け付ける都道府県一覧(47 件、全国対応)。
 *
 * 2026-04-21 の E2E 検証で abr-geocoder v2.2.1 の prefecture-level lg_code 絞り込み
 * が oaza_cho Trie を空にしてしまう挙動が判明し、辞書を全国フルに切り替えた。
 * 同時に Phase 1(6 都道府県)/ Phase 2(全国)の分離を解消し、5/1 正式リリース時点で
 * 全国対応をアナウンスする方針に統一。
 *
 * `checkCoverage` は入力から都道府県名を抽出し、本配列と照合する(事前フィルタ)。
 * 本配列に含まれない文字列(例: "架空県" といった誤入力)は OUTSIDE_COVERAGE で即時拒否する。
 */
export const SUPPORTED_PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

export type SupportedPrefecture = (typeof SUPPORTED_PREFECTURES)[number];

/** batch の最大件数(実装指示書 §2.2) */
export const BATCH_MAX_SIZE = 100;

/**
 * abr-geocoder 統合ラッパー(スタブ)
 *
 * 実装指示書 §4.2 の「起動シーケンス」の実体を担う。
 *
 * 設計メモ(shirabe-assets/docs/research/20260422-abr-geocoder-search-algorithm-analysis.md 参照):
 * - abr-geocoder は SQLite を KV ストアとして使い、検索はインメモリ Trie
 * - 起動時に Fly Volumes の SQLite DB を読み込み Trie を構築する
 * - 1 リクエストあたり Node streams Transform パイプラインで処理される
 *
 * Phase 1 骨格: 実装は 4/24 以降。
 */

export type GeocodeInput = {
  input: string;
};

export type GeocodeMatch = {
  normalized: string;
  prefecture: string | null;
  city: string | null;
  town: string | null;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  level: 0 | 1 | 2 | 3 | 4;
  confidence: number;
};

export type GeocodeResult = {
  input: string;
  match: GeocodeMatch | null;
  candidates: GeocodeMatch[];
  error?: { code: string; message: string; matched_up_to: string | null; level: 0 | 1 | 2 | 3 | 4 };
};

/**
 * abr-geocoder を初期化する。
 * 起動時に 1 回呼び出し、Trie を構築する。
 *
 * TODO(4/24):
 * - @digital-go-jp/abr-geocoder の AbrGeocoder / AbrGeocoderStream を import
 * - Fly Volume 上の SQLite DB(/data/address-db)を指定して初期化
 * - Trie 構築完了まで await
 */
export async function initGeocoder(_dbPath: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.warn("[geocoder] stub: initGeocoder not yet implemented");
}

/**
 * 単一住所を正規化する。
 *
 * TODO(4/24):
 * - 初期化済み geocoder インスタンスで非同期呼出
 * - 結果を GeocodeResult 形式に整形して返す
 */
export async function geocodeOne(input: GeocodeInput): Promise<GeocodeResult> {
  return {
    input: input.input,
    match: null,
    candidates: [],
    error: {
      code: "NOT_IMPLEMENTED",
      message: "abr-geocoder integration pending (Phase 1 skeleton)",
      matched_up_to: null,
      level: 0,
    },
  };
}

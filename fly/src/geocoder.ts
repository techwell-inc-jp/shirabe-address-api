/**
 * abr-geocoder 統合ラッパー
 *
 * 実装指示書 §4.2 の起動シーケンス(Fly Volume SQLite 辞書読込 → インメモリ
 * Trie 構築)と geocodeOne API を担う。
 *
 * 設計メモ(shirabe-assets/docs/research/20260422-abr-geocoder-search-algorithm-analysis.md):
 * - abr-geocoder v2.2.1 は SQLite を KV ストアとして使い、検索はインメモリ Trie
 * - `AbrGeocoder.create({ container, numOfThreads, isSilentMode })` で初期化
 * - `geocoder.geocode({ address, tag, searchTarget, fuzzy })` は Query を返す
 *
 * 注意: @digital-go-jp/abr-geocoder@2.2.1 は package.json に main/exports が
 * 無いため、必ず /build/index.js の subpath から import する。
 */
// 型は src/abr-geocoder.d.ts のモジュール宣言で補完。v2.2.1 は build/ 以下のみ。
import {
  AbrGeocoder,
  AbrGeocoderDiContainer,
  SearchTarget,
  type AbrQueryJson,
} from "@digital-go-jp/abr-geocoder/build/index.js";
import path from "node:path";
import os from "node:os";

export type GeocodeInput = {
  address: string;
};

export type GeocodeMatch = {
  normalized: string;
  prefecture: string | null;
  city: string | null;
  ward: string | null;
  county: string | null;
  oaza_cho: string | null;
  chome: string | null;
  block: string | null;
  rsdt_num: string | null;
  rsdt_num2: string | null;
  latitude: number | null;
  longitude: number | null;
  level: 0 | 1 | 2 | 3 | 4;
  abr_match_level: number;
  confidence: number;
  lg_code: string | null;
  machiaza_id: string | null;
};

export type GeocodeError = {
  code: string;
  message: string;
  matched_up_to: string | null;
  level: 0 | 1 | 2 | 3 | 4;
};

export type GeocodeResult = {
  input: string;
  match: GeocodeMatch | null;
  candidates: GeocodeMatch[];
  error?: GeocodeError;
};

/**
 * abr-geocoder の match_level(0-7, -1=error)を公開 API の level(0-4)へ縮約する。
 *
 * 実装指示書 §2.5 の level 定義:
 * 0=マッチなし, 1=都道府県, 2=市区町村, 3=町丁目, 4=番地・号
 */
export function mapMatchLevel(abrLevel: number): 0 | 1 | 2 | 3 | 4 {
  if (abrLevel <= 0) return 0;
  if (abrLevel === 1) return 1;
  if (abrLevel === 2) return 2;
  if (abrLevel <= 4) return 3;
  return 4;
}

/**
 * abr-geocoder の match_level から confidence を算出する。
 * Phase 1 はシンプルマッピング。Phase 2 で coordinate_level や ambiguousCnt を考慮。
 */
function computeConfidence(abrLevel: number, coordLevel: number): number {
  if (abrLevel <= 0) return 0;
  if (abrLevel >= 6) return 0.98;
  if (abrLevel === 5) return 0.93;
  if (abrLevel === 4) return 0.88;
  if (abrLevel === 3) return 0.82;
  if (abrLevel === 2) return 0.65 + (coordLevel > 0 ? 0.05 : 0);
  return 0.5;
}

function buildNormalized(q: AbrQueryJson): string {
  if (typeof q.formatted === "string" && q.formatted.length > 0) {
    return q.formatted;
  }
  return [q.pref, q.county, q.city, q.ward, q.oaza_cho, q.chome, q.koaza, q.block]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("");
}

let geocoderInstance: AbrGeocoder | null = null;
let dictionaryPath: string | null = null;
let lastInitError: string | null = null;

/**
 * Geocoder を初期化する。サーバー起動時に 1 回のみ呼び出す。
 *
 * @param dbPath abr-geocoder のデータディレクトリ(`abrg download -d` で指定した場所)。
 *   内部で `${dbPath}/database/` と `${dbPath}/cache/` が使われる。
 *
 * 辞書 DB が未構築の場合は例外を throw せず、`isGeocoderReady()=false` の状態で
 * 戻る。/internal/health は "loading" を返し、Fly Machine は起動のまま
 * build-dictionary の完了を待てる設計。
 */
export async function initGeocoder(dbPath: string): Promise<void> {
  if (geocoderInstance) {
    return;
  }
  dictionaryPath = dbPath;

  try {
    const container = new AbrGeocoderDiContainer({
      database: {
        type: "sqlite3",
        dataDir: path.join(dbPath, "database"),
      },
      cacheDir: path.join(dbPath, "cache"),
      debug: false,
    });

    const numOfThreads = Math.max(1, Math.min(os.availableParallelism(), 4));

    geocoderInstance = await AbrGeocoder.create({
      container,
      numOfThreads,
      isSilentMode: true,
    });
    lastInitError = null;
  } catch (err) {
    lastInitError = err instanceof Error ? err.message : String(err);
    console.error(
      `[geocoder] initialization failed (dictionary not ready?): ${lastInitError}`
    );
  }
}

export function isGeocoderReady(): boolean {
  return geocoderInstance !== null;
}

export function getDictionaryPath(): string | null {
  return dictionaryPath;
}

export function getLastInitError(): string | null {
  return lastInitError;
}

/**
 * テスト終了時やシャットダウン時に worker pool を閉じる。
 */
export async function closeGeocoder(): Promise<void> {
  if (geocoderInstance) {
    await geocoderInstance.close();
    geocoderInstance = null;
  }
}

/**
 * 単一住所を正規化する。abr-geocoder の Query をこの API の公開スキーマへ変換する。
 */
export async function geocodeOne(input: GeocodeInput): Promise<GeocodeResult> {
  if (!geocoderInstance) {
    return {
      input: input.address,
      match: null,
      candidates: [],
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "geocoder not initialized",
        matched_up_to: null,
        level: 0,
      },
    };
  }

  const raw = await geocoderInstance.geocode({
    address: input.address,
    searchTarget: SearchTarget.ALL,
  });
  const q = raw.toJSON();

  const abrLevel = q.match_level?.num ?? 0;
  const coordLevel = q.coordinate_level?.num ?? 0;
  const level = mapMatchLevel(abrLevel);

  if (abrLevel <= 0) {
    return {
      input: input.address,
      match: null,
      candidates: [],
      error: {
        code: "ADDRESS_NOT_FOUND",
        message: "住所を特定できませんでした",
        matched_up_to: null,
        level: 0,
      },
    };
  }

  const match: GeocodeMatch = {
    normalized: buildNormalized(q),
    prefecture: q.pref ?? null,
    city: q.city ?? null,
    ward: q.ward ?? null,
    county: q.county ?? null,
    oaza_cho: q.oaza_cho ?? null,
    chome: q.chome ?? null,
    block: q.block ?? q.block_id ?? null,
    rsdt_num: q.rsdt_num ?? null,
    rsdt_num2: q.rsdt_num2 ?? null,
    latitude: typeof q.rep_lat === "number" ? q.rep_lat : null,
    longitude: typeof q.rep_lon === "number" ? q.rep_lon : null,
    level,
    abr_match_level: abrLevel,
    confidence: computeConfidence(abrLevel, coordLevel),
    lg_code: q.lg_code ?? null,
    machiaza_id: q.machiaza_id ?? null,
  };

  if (abrLevel < 3) {
    return {
      input: input.address,
      match: null,
      candidates: [match],
      error: {
        code: abrLevel === 1 ? "PREFECTURE_NOT_FOUND" : "PARTIAL_MATCH",
        message:
          abrLevel === 1
            ? "都道府県までしか特定できませんでした"
            : "市区町村までしか特定できませんでした",
        matched_up_to: match.normalized,
        level,
      },
    };
  }

  return {
    input: input.address,
    match,
    candidates: [],
  };
}

export async function geocodeBatch(inputs: GeocodeInput[]): Promise<GeocodeResult[]> {
  const results = await Promise.all(inputs.map((i) => geocodeOne(i)));
  return results;
}

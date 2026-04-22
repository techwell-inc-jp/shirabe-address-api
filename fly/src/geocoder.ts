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
import Database from "better-sqlite3";
import fs from "node:fs";
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
let lastPatchReport: {
  city_null_before: number;
  ward_null_before: number;
  city_updated: number;
  ward_updated: number;
} | null = null;

/**
 * common.sqlite の `city` テーブルの NULL 列を空文字に置換する冪等パッチ。
 *
 * ## なぜ必要か
 *
 * abr-geocoder v2.2.1 の Trie キャッシュ構築で、
 * `build/drivers/database/sqlite3/geocode/common-db-geocode-sqlite3.js:888` が
 *
 *   if (city.city.endsWith('区')) { continue; }
 *
 * を実行する。この `city.city` は SQLite の `city` テーブルの `city` 列(エイリアス
 * 解決後)で、ABR の原データに NULL が入っている行があると
 * `Cannot read properties of null (reading 'endsWith')` で TypeError を投げる。
 *
 * v2.2.1 同ファイルの line 892(`city.city || ''`)と line 922(`!= '' AND IS NOT NULL`)
 * は NULL と空文字を同等扱いしており、本パッチの `'' 正規化` は意味論を保つ。
 *
 * ## 冪等性
 *
 * NULL でない行は触らない。再起動のたびに再実行しても安全。
 * 適用後に abr-geocoder の内部キャッシュ(cache/city-and-ward_*.abrg2 ほか)は
 * 自動的に作り直される(CityAndWardTrieFinder.createDictionaryFile が
 * 先頭で `removeFiles` を呼ぶため)。
 *
 * ## 注意
 *
 * 辞書 DB が未構築(common.sqlite が存在しない)の場合は黙ってスキップする。
 * build-dictionary.sh が走っている途中で呼ばれても、SQLite の WAL により
 * 整合性は保たれる(better-sqlite3 の WAL モード既定挙動)。
 */
async function patchCommonSqliteNulls(dbPath: string): Promise<void> {
  const commonDbPath = path.join(dbPath, "database", "common.sqlite");

  if (!fs.existsSync(commonDbPath)) {
    console.log(
      `[geocoder] common.sqlite not yet built at ${commonDbPath}; skipping null-patch`,
    );
    lastPatchReport = null;
    return;
  }

  const db = new Database(commonDbPath);
  try {
    const beforeRow = db
      .prepare(
        `SELECT
           SUM(CASE WHEN city IS NULL THEN 1 ELSE 0 END) AS city_null,
           SUM(CASE WHEN ward IS NULL THEN 1 ELSE 0 END) AS ward_null
         FROM city`,
      )
      .get() as { city_null: number | null; ward_null: number | null };

    const cityNullBefore = beforeRow.city_null ?? 0;
    const wardNullBefore = beforeRow.ward_null ?? 0;

    let cityUpdated = 0;
    let wardUpdated = 0;

    if (cityNullBefore > 0 || wardNullBefore > 0) {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (cityNullBefore > 0) {
          const r = db.prepare("UPDATE city SET city = '' WHERE city IS NULL").run();
          cityUpdated = r.changes;
        }
        if (wardNullBefore > 0) {
          const r = db.prepare("UPDATE city SET ward = '' WHERE ward IS NULL").run();
          wardUpdated = r.changes;
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }

    lastPatchReport = {
      city_null_before: cityNullBefore,
      ward_null_before: wardNullBefore,
      city_updated: cityUpdated,
      ward_updated: wardUpdated,
    };

    console.log(
      `[geocoder] null-patch: city_null_before=${cityNullBefore} ward_null_before=${wardNullBefore} ` +
        `city_updated=${cityUpdated} ward_updated=${wardUpdated}`,
    );
  } finally {
    db.close();
  }
}

/**
 * 破棄された / 破損した city-and-ward の Trie キャッシュを削除する。
 *
 * パッチ適用で DB 側の NULL 問題を解消した後、既存の cache/city-and-ward_*.abrg2
 * が過去の失敗した半端書込のまま残っていると `new CityAndWardTrieFinder(first100bytes)`
 * で検証コケの可能性がある。事前に消しておけば abr-geocoder の
 * `createDictionaryFile` が確実に作り直す。
 */
function clearStaleCacheFiles(dbPath: string): void {
  const cacheDir = path.join(dbPath, "cache");
  if (!fs.existsSync(cacheDir)) return;
  const entries = fs.readdirSync(cacheDir);
  const targets = entries.filter((e) => e.startsWith("city-and-ward_") && e.endsWith(".abrg2"));
  for (const f of targets) {
    const p = path.join(cacheDir, f);
    try {
      fs.unlinkSync(p);
      console.log(`[geocoder] removed stale cache file: ${p}`);
    } catch (e) {
      console.warn(`[geocoder] failed to remove stale cache ${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

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
    // 1. common.sqlite の city.city / city.ward NULL を空文字化する
    //    (abr-geocoder v2.2.1 common-db-geocode-sqlite3.js:888 の null.endsWith クラッシュ回避)
    await patchCommonSqliteNulls(dbPath);

    // 2. 過去に失敗した city-and-ward Trie キャッシュの半端書込を掃除
    clearStaleCacheFiles(dbPath);

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

export function getLastPatchReport(): typeof lastPatchReport {
  return lastPatchReport;
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

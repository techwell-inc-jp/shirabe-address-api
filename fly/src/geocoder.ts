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
  incomplete_rows_before: number;
  incomplete_rows_deleted: number;
  city_updated: number;
  ward_updated: number;
} | null = null;

/**
 * common.sqlite の `city` テーブルを Trie 構築可能な状態に整える冪等パッチ。
 *
 * ## 背景
 *
 * abr-geocoder v2.2.1 の Trie キャッシュ構築で
 * `build/drivers/database/sqlite3/geocode/common-db-geocode-sqlite3.js:888` が
 *
 *   if (city.city.endsWith('区')) { continue; }
 *
 * を呼び、`city.city` が NULL のときに TypeError を投げる(→ 初回は `/internal/health`
 * が永続 "loading" に張り付く)。これを避けるため PR #7(commit 628435f)で
 * NULL を空文字 '' に置換する単純なパッチを入れた。
 *
 * ## PR #7 で顕在化した二次バグ(本 PR の対象)
 *
 * 同 `getCityAndWardList` は line 891-900 で
 *
 *   results.push({
 *     key: [(city.city || ''), (city.ward || '')].join(''),
 *     ...city,
 *   });
 *
 * と Trie 行を生成する。`city='' AND ward=''` の行は key = '' + '' = '' となり、
 * 295 件すべてが Trie ルートに `key=""` で挿入され **catch-all フォールバック** を
 * 形成する。結果、入力が深くマッチしなかったとき 295 件の先頭(北海道の不完全行が
 * 多数)が返り、「東京都港区六本木 → 北海道松前」のような致命的誤マッチを起こす。
 *
 * 仮説検証(2026-04-22 SSH 調査)で、295 件の全てが以下の特徴を持つことを確認:
 *
 *   - city = NULL(PR #7 適用後は '' )
 *   - ward = NULL(PR #7 適用後は '' )
 *   - lg_code IS NULL
 *   - county IS NULL
 *
 * つまり市区町村としての識別子(lg_code)を持たない「不完全な行政行」で、
 * ABR 原データの CSV で欠損していた行。正規の市区町村データではないため、
 * Trie から除外すべき行である。
 *
 * ## 本パッチの方針(DELETE ファースト)
 *
 * 1. 不完全行 `(city IS NULL OR city = '') AND (ward IS NULL OR ward = '') AND lg_code IS NULL`
 *    を DELETE する(Trie catch-all の根絶)
 * 2. 単独 NULL(city だけ / ward だけ NULL)が残った場合は `''` に正規化し、
 *    `endsWith` クラッシュの再発を防ぐ(防御層)
 * 3. DELETE / UPDATE 件数を `/internal/health.last_patch_report` に公開
 *
 * ## 冪等性
 *
 * DELETE は WHERE 条件一致が 0 件なら no-op。UPDATE も NULL 行が無ければ 0 件。
 * 2 回目以降の起動では全部 0 件のはず。
 *
 * ## 辞書未構築時
 *
 * `common.sqlite` が存在しない場合は黙ってスキップ(loading 状態維持)。
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
    // Step 1: 計測 — 不完全行・単独 NULL の件数を事前集計
    const beforeRow = db
      .prepare(
        `SELECT
           SUM(CASE WHEN city IS NULL THEN 1 ELSE 0 END) AS city_null,
           SUM(CASE WHEN ward IS NULL THEN 1 ELSE 0 END) AS ward_null,
           SUM(CASE
             WHEN (city IS NULL OR city = '')
              AND (ward IS NULL OR ward = '')
              AND lg_code IS NULL
             THEN 1 ELSE 0 END) AS incomplete_rows
         FROM city`,
      )
      .get() as {
      city_null: number | null;
      ward_null: number | null;
      incomplete_rows: number | null;
    };

    const cityNullBefore = beforeRow.city_null ?? 0;
    const wardNullBefore = beforeRow.ward_null ?? 0;
    const incompleteBefore = beforeRow.incomplete_rows ?? 0;

    let incompleteDeleted = 0;
    let cityUpdated = 0;
    let wardUpdated = 0;

    if (incompleteBefore > 0 || cityNullBefore > 0 || wardNullBefore > 0) {
      db.exec("BEGIN IMMEDIATE");
      try {
        // Step 2: 不完全行を DELETE(Trie catch-all の根絶)
        if (incompleteBefore > 0) {
          const r = db
            .prepare(
              `DELETE FROM city
               WHERE (city IS NULL OR city = '')
                 AND (ward IS NULL OR ward = '')
                 AND lg_code IS NULL`,
            )
            .run();
          incompleteDeleted = r.changes;
        }

        // Step 3: 単独 NULL 行(city のみ NULL / ward のみ NULL)を '' 化
        //         endsWith クラッシュの再発防止。DELETE 後に残る NULL のみ対象。
        const remainingCityNull = db
          .prepare("SELECT COUNT(*) AS n FROM city WHERE city IS NULL")
          .get() as { n: number };
        const remainingWardNull = db
          .prepare("SELECT COUNT(*) AS n FROM city WHERE ward IS NULL")
          .get() as { n: number };

        if (remainingCityNull.n > 0) {
          const r = db.prepare("UPDATE city SET city = '' WHERE city IS NULL").run();
          cityUpdated = r.changes;
        }
        if (remainingWardNull.n > 0) {
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
      incomplete_rows_before: incompleteBefore,
      incomplete_rows_deleted: incompleteDeleted,
      city_updated: cityUpdated,
      ward_updated: wardUpdated,
    };

    console.log(
      `[geocoder] patch: incomplete_rows_before=${incompleteBefore} deleted=${incompleteDeleted} ` +
        `city_null_before=${cityNullBefore} ward_null_before=${wardNullBefore} ` +
        `city_updated=${cityUpdated} ward_updated=${wardUpdated}`,
    );
  } finally {
    db.close();
  }
}

/**
 * city テーブルに依存する Trie キャッシュを削除する。
 *
 * ## 対象
 *
 * - `city-and-ward_*.abrg2` — CityAndWardTrieFinder のキャッシュ。
 *   PR #7 で catch-all 汚染を生じさせた本命の Trie。本 PR の DELETE が反映された
 *   クリーンな状態で再構築させる必要がある。
 * - `county-and-city_*.abrg2` — CountyAndCityTrieFinder のキャッシュ。
 *   同じ city テーブルから `getCountyAndCityList` 系のクエリで生成される。
 *   不完全行削除後は内容が変わる可能性があるため同時にクリアして整合性を保つ。
 *
 * ## 残す対象(削除しない)
 *
 * - `pref_*.abrg2` — pref テーブルのみから生成、city テーブル変更に無影響
 * - `oaza-cho_*.abrg2` / `chome-*.abrg2` / `rsdt-*.abrg2` 等の lg_code 依存キャッシュ
 *   — 個別都道府県の辞書構築時間が 2-3h になるため、壊す必要がないなら残す
 *
 * ## abr-geocoder 側の自律再構築
 *
 * CityAndWardTrieFinder.createDictionaryFile が内部で `removeFiles` を呼ぶため
 * 半端書込の残滓にも強いが、本関数は「DELETE 後に古い内容のキャッシュが使われる」
 * リスクを確実に避けるための明示的前処理。
 */
function clearStaleCacheFiles(dbPath: string): void {
  const cacheDir = path.join(dbPath, "cache");
  if (!fs.existsSync(cacheDir)) return;

  const prefixes = ["city-and-ward_", "county-and-city_"] as const;
  const entries = fs.readdirSync(cacheDir);
  const targets = entries.filter(
    (e) => prefixes.some((p) => e.startsWith(p)) && e.endsWith(".abrg2"),
  );

  if (targets.length === 0) {
    console.log("[geocoder] no stale city-dependent cache files to remove");
    return;
  }

  for (const f of targets) {
    const p = path.join(cacheDir, f);
    try {
      fs.unlinkSync(p);
      console.log(`[geocoder] removed stale cache file: ${p}`);
    } catch (e) {
      console.warn(
        `[geocoder] failed to remove stale cache ${p}: ${e instanceof Error ? e.message : String(e)}`,
      );
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
    // 1. common.sqlite の不完全行 (city/ward/lg_code 全 NULL) を DELETE し、
    //    残存する単独 NULL を '' 化する。PR #7 の null.endsWith クラッシュ回避と
    //    PR #8 の Trie catch-all 根絶を両立させる冪等パッチ。
    await patchCommonSqliteNulls(dbPath);

    // 2. city テーブルに依存する Trie キャッシュ (city-and-ward_*, county-and-city_*)
    //    を消して、DELETE 結果が反映された状態で再構築させる。
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

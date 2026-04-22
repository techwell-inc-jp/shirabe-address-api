/**
 * common.sqlite の city テーブルで city / ward 列が NULL の行を列挙する診断スクリプト。
 *
 * 実行方法(Fly.io SSH):
 *   flyctl ssh console -a shirabe-address-api
 *   node /app/scripts/diagnose-city-nulls.mjs
 *
 * 目的:
 * - abr-geocoder v2.2.1 の `common-db-geocode-sqlite3.js:888` で
 *   `city.city.endsWith('区')` が NULL.endsWith で TypeError を投げる原因調査。
 * - NULL 行の件数と lg_code / pref / county / ward の分布を把握する。
 */
import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH =
  process.env.ABR_COMMON_DB_PATH ??
  path.join(process.env.ABR_DICTIONARY_DIR ?? "/data/address-db", "database", "common.sqlite");

console.log(`[diagnose] opening ${DB_PATH}`);
const db = new Database(DB_PATH, { readonly: true });

const totals = db
  .prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN city IS NULL THEN 1 ELSE 0 END) AS city_null,
       SUM(CASE WHEN ward IS NULL THEN 1 ELSE 0 END) AS ward_null,
       SUM(CASE WHEN city IS NULL AND ward IS NULL THEN 1 ELSE 0 END) AS both_null,
       SUM(CASE WHEN city = '' THEN 1 ELSE 0 END) AS city_empty,
       SUM(CASE WHEN ward = '' THEN 1 ELSE 0 END) AS ward_empty
     FROM city`,
  )
  .get();

console.log("[diagnose] totals:", JSON.stringify(totals, null, 2));

const nullCityRows = db
  .prepare(
    `SELECT c.city_key, c.lg_code, c.county, c.city, c.ward, p.pref
     FROM city c
     JOIN pref p ON p.pref_key = c.pref_key
     WHERE c.city IS NULL
     ORDER BY c.lg_code
     LIMIT 50`,
  )
  .all();

console.log(`[diagnose] first up to 50 rows with city IS NULL (total=${totals.city_null}):`);
for (const r of nullCityRows) {
  console.log(
    `  lg_code=${r.lg_code} pref=${r.pref} county=${r.county ?? "(null)"} ward=${r.ward ?? "(null)"}`,
  );
}

const nullWardRows = db
  .prepare(
    `SELECT c.city_key, c.lg_code, c.county, c.city, c.ward, p.pref
     FROM city c
     JOIN pref p ON p.pref_key = c.pref_key
     WHERE c.ward IS NULL
     ORDER BY c.lg_code
     LIMIT 20`,
  )
  .all();

console.log(`[diagnose] first up to 20 rows with ward IS NULL (total=${totals.ward_null}):`);
for (const r of nullWardRows) {
  console.log(
    `  lg_code=${r.lg_code} pref=${r.pref} county=${r.county ?? "(null)"} city=${r.city ?? "(null)"}`,
  );
}

db.close();
console.log("[diagnose] done");

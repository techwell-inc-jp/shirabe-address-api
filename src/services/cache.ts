/**
 * ADDRESS_CACHE KV レイヤ(実装指示書 §3.4)
 *
 * 住所正規化レスポンスのキャッシュ。
 *
 * 設計:
 * - キー形式: `addr:{sha256(前処理済み入力)}`(64hex)
 *   - sha256 の衝突リスクは実用上ゼロ。TTL が短いため先頭 16 桁に切り詰める動機は無い
 * - 前処理: NFKC + 連続空白の単一スペース化 + trim + ASCII 部分の lowercase
 *   - "六本木ヒルズ森タワー" vs "六本木ヒルズ森タワー " のような表記揺れを吸収
 * - TTL: 既定 3600 秒。親 CLAUDE.md §技術スタックの最小 60 秒クランプに従う
 * - 値: `NormalizeResponse` を JSON.stringify したもの
 * - 破損エントリ(JSON パース失敗)は delete して `null` を返す
 *
 * ヒット率は低前提(ユニーク住所が大半)。保険的位置付け。
 */
import type { NormalizeResponse } from "../types/address.js";

export const CACHE_KEY_PREFIX = "addr:";
export const CACHE_DEFAULT_TTL_SECONDS = 3600;
export const CACHE_MIN_TTL_SECONDS = 60;

/**
 * 入力文字列を前処理してキャッシュキーを生成する。
 * 返り値: `"addr:" + sha256 hex`
 */
export async function cacheKey(input: string): Promise<string> {
  const normalized = normalizeForKey(input);
  const hash = await sha256Hex(normalized);
  return `${CACHE_KEY_PREFIX}${hash}`;
}

/**
 * キャッシュから取得する。ヒットしない / 破損している場合は `null` を返す。
 * 破損(JSON パース失敗)検知時はキーを削除する(自己修復)。
 */
export async function cacheGet(
  kv: KVNamespace,
  input: string
): Promise<NormalizeResponse | null> {
  const key = await cacheKey(input);
  const raw = await kv.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as NormalizeResponse;
  } catch {
    await kv.delete(key);
    return null;
  }
}

/**
 * キャッシュに書き込む。TTL は `CACHE_MIN_TTL_SECONDS` (60s)未満の場合
 * クランプする(親 CLAUDE.md §技術スタック)。
 */
export async function cachePut(
  kv: KVNamespace,
  input: string,
  response: NormalizeResponse,
  ttlSeconds: number = CACHE_DEFAULT_TTL_SECONDS
): Promise<void> {
  const key = await cacheKey(input);
  const ttl = Math.max(CACHE_MIN_TTL_SECONDS, ttlSeconds);
  await kv.put(key, JSON.stringify(response), { expirationTtl: ttl });
}

/** テスト / 運用ツール向けの明示削除 */
export async function cacheDelete(kv: KVNamespace, input: string): Promise<void> {
  const key = await cacheKey(input);
  await kv.delete(key);
}

/**
 * 前処理: NFKC で全角英数を半角に揃え、数字に挟まれたダッシュ類を `-` に揃え、
 * 空白を正規化し、ASCII 文字は小文字化する。
 *
 * digit-context のダッシュ正規化は postal-code-parser / building-separator と同一の
 * 規則(U+2212 MINUS SIGN は NFKC 対象外のため明示、`ー` は建物名でも出現しうるので
 * 数字間のみ)。英字建物名("Roppongi Hills" 等)の表記揺れは toLowerCase で吸収する。
 */
export function normalizeForKey(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/(?<=\d)[ー−‐‑‒–—―](?=\d)/g, "-")
    .replace(/[\s　]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * SHA-256 を 64 桁の hex 文字列として返す。
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

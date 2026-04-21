/**
 * Workers → Fly.io 内部通信クライアント
 *
 * 実装指示書 §3.3:
 * - エンドポイント: POST {env.FLYIO_GEOCODE_URL}(例: https://shirabe-address-api.fly.dev/internal/geocode)
 * - リクエスト: 常に batch 形式 `{ addresses: string[] }`。単一リクエストは呼び出し側で 1 件配列に畳む
 * - 認証: X-Internal-Token ヘッダー(`env.FLY_INTERNAL_TOKEN`、Fly.io 側 `INTERNAL_TOKEN` と同値)
 * - タイムアウト: 単一 10 秒 / batch 30 秒(呼び出し側が渡す)
 * - Fly.io ダウン時: 呼び出し側で SERVICE_UNAVAILABLE 503 を返す(本クライアントは構造化エラーを返すのみ)
 *
 * 設計原則:
 * - 本クライアントは Fly.io の生レスポンス(フラットな `pref`/`city`/`ward`/`oaza_cho`/`chome`/`block`)
 *   をそのまま返す。公開 API スキーマ(`components` ネスト形式)への変換は
 *   `src/services/response-formatter.ts`(後続タスク、4/27 予定)で行う
 * - 例外は throw せず discriminated union `FlyClientResult` で返す
 *   → 呼び出し側が型安全にエラー種別ごとのハンドリングを記述できる
 */
import type { Env } from "../types/env.js";
import type { AddressErrorCode, AddressLevel } from "../types/address.js";

/**
 * Fly.io 側 `fly/src/geocoder.ts GeocodeMatch` と対称。
 * 公開スキーマの NormalizedAddress とは別物。Workers 側の formatter が変換する。
 */
export type FlyGeocodeMatch = {
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
  level: AddressLevel;
  abr_match_level: number;
  confidence: number;
  lg_code: string | null;
  machiaza_id: string | null;
};

export type FlyGeocodeError = {
  code: AddressErrorCode | string;
  message: string;
  matched_up_to: string | null;
  level: AddressLevel;
};

export type FlyGeocodeResult = {
  input: string;
  match: FlyGeocodeMatch | null;
  candidates: FlyGeocodeMatch[];
  error?: FlyGeocodeError;
};

export type FlyGeocodeResponse = {
  results: FlyGeocodeResult[];
};

/**
 * クライアントが返すエラー種別の discriminated union。
 * 呼び出し側は `kind` を分岐して 4xx/5xx を組み立てる。
 */
export type FlyClientError =
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "network"; message: string }
  | { kind: "auth"; status: number }
  | { kind: "service_unavailable"; status: number }
  | { kind: "bad_request"; status: number; message: string }
  | { kind: "invalid_response"; message: string }
  | { kind: "config_missing"; field: "FLYIO_GEOCODE_URL" | "FLY_INTERNAL_TOKEN" };

export type FlyClientResult =
  | { ok: true; data: FlyGeocodeResponse }
  | { ok: false; error: FlyClientError };

export type FlyClientOptions = {
  /** リクエスト単位のタイムアウト。単一 10s / batch 30s は呼び出し側が選択 */
  timeoutMs: number;
  /** テスト用 fetch 差し替え。省略時は globalThis.fetch */
  fetchImpl?: typeof fetch;
};

/** 単一リクエスト(normalize)のタイムアウト(実装指示書 §3.3) */
export const FLY_TIMEOUT_SINGLE_MS = 10_000;
/** batch リクエストのタイムアウト(実装指示書 §3.3) */
export const FLY_TIMEOUT_BATCH_MS = 30_000;

/**
 * Fly.io `/internal/geocode` に POST して結果を取得する。
 *
 * Fly.io 側の仕様(fly/src/server.ts):
 * - 200: `{ results: [...] }`(正常 / per-item error を含む)
 * - 400: `{ error: { code: "INVALID_FORMAT" | "BATCH_TOO_LARGE" } }`(入力不正)
 * - 403: `{ error: { code: "FORBIDDEN" } }`(X-Internal-Token 不一致)
 * - 503: `{ error: { code: "SERVICE_UNAVAILABLE" } }`(辞書未構築 or 初期化中)
 */
export async function callFlyGeocode(
  env: Env,
  addresses: string[],
  options: FlyClientOptions
): Promise<FlyClientResult> {
  const url = env.FLYIO_GEOCODE_URL;
  if (!url) {
    return { ok: false, error: { kind: "config_missing", field: "FLYIO_GEOCODE_URL" } };
  }
  // Secret 投入経路(PowerShell の Get-Content パイプ等)で末尾 CR/LF が
  // 紛れ込みやすいため、送信直前に trim する。Fly.io 側は `!==` 厳密一致で
  // 比較するため、ここで揃えないと認証が常に失敗する。
  const token = env.FLY_INTERNAL_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: { kind: "config_missing", field: "FLY_INTERNAL_TOKEN" } };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify({ addresses }),
      signal: controller.signal,
    });
  } catch (err) {
    if (
      err instanceof DOMException && err.name === "AbortError" ||
      (err as { name?: string })?.name === "AbortError"
    ) {
      return { ok: false, error: { kind: "timeout", timeoutMs: options.timeoutMs } };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: "network", message } };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 403 || response.status === 401) {
    return { ok: false, error: { kind: "auth", status: response.status } };
  }
  if (response.status === 400) {
    const message = await safeReadErrorMessage(response);
    return {
      ok: false,
      error: { kind: "bad_request", status: 400, message },
    };
  }
  if (response.status >= 500 || response.status === 503) {
    return { ok: false, error: { kind: "service_unavailable", status: response.status } };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: { kind: "invalid_response", message: `unexpected status ${response.status}` },
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: "invalid_response", message: `json parse failed: ${message}` } };
  }

  if (!isFlyGeocodeResponse(parsed)) {
    return {
      ok: false,
      error: { kind: "invalid_response", message: "body is not { results: [...] }" },
    };
  }

  return { ok: true, data: parsed };
}

async function safeReadErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json<{ error?: { message?: string } }>();
    return body?.error?.message ?? `status ${response.status}`;
  } catch {
    return `status ${response.status}`;
  }
}

function isFlyGeocodeResponse(value: unknown): value is FlyGeocodeResponse {
  if (!value || typeof value !== "object") return false;
  const results = (value as { results?: unknown }).results;
  return Array.isArray(results);
}

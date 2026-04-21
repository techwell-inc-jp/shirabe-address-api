/**
 * レスポンス整形 + attribution 付与(Workers 側後処理)
 *
 * 実装指示書 §2.1 / §3.2:
 * > レスポンス整形: Fly.io の生レスポンスを公開 API スキーマに変換 + attribution 付与
 *
 * Fly.io 側(`fly/src/geocoder.ts` GeocodeMatch)はフラットな構造で返す:
 *   { prefecture, city, ward, oaza_cho, chome, block, rsdt_num, ... }
 * 公開 API(`types/address.ts` NormalizedAddress)はネスト構造:
 *   { normalized, components: { prefecture, city, town, block, building, floor }, ... }
 *
 * 変換規則:
 * - components.city = city + ward(政令指定都市で ward あり)、そうでなければ city
 * - components.town = oaza_cho + chome(例: "六本木" + "六丁目" = "六本木六丁目")
 * - components.block = block + "番" + rsdt_num + "号" を既定に、欠落分を動的に省略
 * - components.building / floor = 呼び出し側(building-separator 出力)から渡す
 * - postal_code = 呼び出し側(postal-code-parser 出力)から渡す
 *
 * attribution は全レスポンスに `DEFAULT_ATTRIBUTION` を自動付与(CC BY 4.0 義務)。
 */
import {
  DEFAULT_ATTRIBUTION,
  type AddressError,
  type AddressErrorCode,
  type AddressLevel,
  type BatchNormalizeResponse,
  type NormalizedAddress,
  type NormalizeResponse,
} from "../types/address.js";
import type {
  FlyGeocodeError,
  FlyGeocodeMatch,
  FlyGeocodeResult,
} from "./flyio-client.js";

/**
 * postal_code / building / floor の後付けコンテキスト。
 * 呼び出し側(normalize / batch ルート)が Fly.io 呼び出し前に前処理した結果を渡す。
 */
export type EnrichmentContext = {
  postalCode: string | null;
  building: string | null;
  floor: string | null;
};

const EMPTY_ENRICHMENT: EnrichmentContext = {
  postalCode: null,
  building: null,
  floor: null,
};

const VALID_ERROR_CODES: ReadonlySet<AddressErrorCode> = new Set<AddressErrorCode>([
  "ADDRESS_NOT_FOUND",
  "AMBIGUOUS_INPUT",
  "PREFECTURE_NOT_FOUND",
  "PARTIAL_MATCH",
  "INVALID_FORMAT",
  "OUTSIDE_COVERAGE",
  "BATCH_TOO_LARGE",
  "SERVICE_UNAVAILABLE",
]);

/**
 * Fly.io 1 件分の結果を公開 API の `NormalizeResponse` に整形する。
 */
export function formatNormalizeResponse(params: {
  input: string;
  flyResult: FlyGeocodeResult;
  enrichment?: EnrichmentContext;
}): NormalizeResponse {
  const enrichment = params.enrichment ?? EMPTY_ENRICHMENT;
  const { flyResult } = params;

  const response: NormalizeResponse = {
    input: params.input,
    result: flyResult.match ? toNormalizedAddress(flyResult.match, enrichment) : null,
    candidates: flyResult.candidates.map((c) => toNormalizedAddress(c, enrichment)),
    attribution: DEFAULT_ATTRIBUTION,
  };

  if (flyResult.error) {
    response.error = toAddressError(flyResult.error);
  }

  return response;
}

/**
 * batch 結果を整形する。`results` と `summary` を返す。
 */
export function formatBatchResponse(params: {
  inputs: readonly string[];
  flyResults: readonly FlyGeocodeResult[];
  enrichments?: readonly EnrichmentContext[];
}): BatchNormalizeResponse {
  if (params.inputs.length !== params.flyResults.length) {
    throw new Error(
      `inputs and flyResults length mismatch: ${params.inputs.length} vs ${params.flyResults.length}`
    );
  }

  const results: NormalizeResponse[] = params.inputs.map((input, i) =>
    formatNormalizeResponse({
      input,
      flyResult: params.flyResults[i] as FlyGeocodeResult,
      enrichment: params.enrichments?.[i] ?? EMPTY_ENRICHMENT,
    })
  );

  const summary = {
    total: results.length,
    succeeded: 0,
    ambiguous: 0,
    failed: 0,
  };
  for (const r of results) {
    if (r.result) {
      summary.succeeded += 1;
    } else if (r.candidates.length > 0) {
      summary.ambiguous += 1;
    } else {
      summary.failed += 1;
    }
  }

  return { results, summary };
}

/**
 * 公開 API の `NormalizedAddress` を組み立てる純粋関数。
 */
function toNormalizedAddress(
  match: FlyGeocodeMatch,
  enrichment: EnrichmentContext
): NormalizedAddress {
  return {
    normalized: match.normalized,
    components: {
      prefecture: match.prefecture,
      city: composeCity(match.city, match.ward),
      town: composeTown(match.oaza_cho, match.chome),
      block: composeBlock(match.block, match.rsdt_num, match.rsdt_num2),
      building: enrichment.building,
      floor: enrichment.floor,
    },
    postal_code: enrichment.postalCode,
    latitude: match.latitude,
    longitude: match.longitude,
    level: match.level,
    confidence: clampConfidence(match.confidence),
  };
}

function composeCity(city: string | null, ward: string | null): string | null {
  if (city && ward) return `${city}${ward}`;
  return city ?? ward ?? null;
}

function composeTown(oazaCho: string | null, chome: string | null): string | null {
  const parts = [oazaCho, chome].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  return parts.length > 0 ? parts.join("") : null;
}

/**
 * block / rsdt_num / rsdt_num2 を日本語表記 "N番M号" / "N番M号 副号" に組み立てる。
 * いずれも null なら null を返す。
 */
function composeBlock(
  block: string | null,
  rsdtNum: string | null,
  rsdtNum2: string | null
): string | null {
  if (!block && !rsdtNum && !rsdtNum2) return null;
  const segments: string[] = [];
  if (block) segments.push(`${block}番`);
  if (rsdtNum) segments.push(`${rsdtNum}号`);
  if (rsdtNum2) segments.push(`-${rsdtNum2}`);
  return segments.join("") || null;
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function toAddressError(err: FlyGeocodeError): AddressError {
  const code = coerceErrorCode(err.code);
  const level = clampLevel(err.level);
  return {
    code,
    message: err.message,
    matched_up_to: err.matched_up_to,
    level,
  };
}

function coerceErrorCode(code: string): AddressErrorCode {
  if (VALID_ERROR_CODES.has(code as AddressErrorCode)) {
    return code as AddressErrorCode;
  }
  // 未知のコード(例: Fly.io 側 NOT_IMPLEMENTED 等)は SERVICE_UNAVAILABLE にフォールバック
  return "SERVICE_UNAVAILABLE";
}

function clampLevel(level: number): AddressLevel {
  if (level <= 0) return 0;
  if (level === 1) return 1;
  if (level === 2) return 2;
  if (level === 3) return 3;
  return 4;
}

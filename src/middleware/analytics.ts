/**
 * S1 計測基盤: Analytics Engine 記録ミドルウェア(住所 API 版)
 *
 * 全ルートのレスポンス後に 1req=1書込で Analytics Engine(`shirabe_address_events` Dataset)
 * に記録する。AE書込失敗時はレスポンスに影響させない。
 *
 * 記録スキーマ(暦 API と共通部分 + 住所 API 固有フィールド):
 *   blobs(順序固定、SQL 上は blob1〜blob12 に対応):
 *     0: UA category           ai/human/bot
 *     1: AI vendor             openai/anthropic/perplexity/...
 *     2: Referrer type         ai_search/other
 *     3: Referrer vendor       perplexity/chatgpt/claude/... or none
 *     4: Endpoint kind         api_call/openapi_view/docs_view/health/...
 *     5: Normalized pathname
 *     6: Plan                  free/starter/pro/enterprise/anonymous
 *     7: API key hash          16文字hex または "none"
 *     8: Tool hint             gpts/langchain/dify/llamaindex/none
 *     9: Content platform      qiita/zenn/github/devto/medium/note/other/none
 *                              ← 2026-04-22 追加、暦 API と対称
 *    10: Response type         success/ambiguous/error/(空) — 住所 API 固有
 *    11: Coverage status       in_coverage/out_of_coverage/(空) — 住所 API 固有
 *   doubles:
 *     0: HTTP status
 *     1: Success flag          (2xxなら1、それ以外0)
 *     2: Response time (ms)    — 実装指示書 §7.2 double1
 *     3: Batch size            — 実装指示書 §7.2 double2(単一リクエストは 1)
 *     4: Level                 — 実装指示書 §7.2 double3(0-4、未判定は NaN → 0)
 *     5: Confidence            — 実装指示書 §7.2 double4(0.0-1.0、未判定は 0)
 *   indexes: [endpoint_kind]
 *
 * 4/22 時点では response_type / coverage_status / level / confidence は
 * Fly.io 側レスポンスから Context に設定される想定。スタブ段階では未定義 → 空/0。
 *
 * blob 配置の再設計(2026-04-22): 暦 API の content_platform (blob10, index 9) と
 * 対称にするため、住所 API 固有の response_type / coverage_status を index 10/11 に
 * シフト。shirabe_address_events Dataset にはまだ本番データが存在しないため、
 * この再配置による既存データ影響はゼロ。
 */
import type { Context, Next } from "hono";
import type { AppEnv, AnalyticsEngineDataset } from "../types/env.js";
import {
  categorizeUserAgent,
  detectAIVendor,
  categorizeReferrer,
  detectReferrerVendor,
  categorizeEndpoint,
  normalizePath,
  detectToolHint,
  detectContentPlatform,
} from "../analytics/classifier.js";

/** 有効なプラン値 */
const VALID_PLANS = new Set(["free", "starter", "pro", "enterprise"]);

/**
 * 計測ミドルウェア。計測失敗はユーザーに影響させない。
 */
export async function analyticsMiddleware(c: Context<AppEnv>, next: Next) {
  const startedAt = Date.now();
  await next();

  try {
    const dataset = c.env.ANALYTICS;
    if (!dataset || typeof dataset.writeDataPoint !== "function") {
      return;
    }
    recordDataPoint(c, dataset, Date.now() - startedAt);
  } catch (err) {
    console.error("[analytics] writeDataPoint failed", err);
  }
}

function recordDataPoint(
  c: Context<AppEnv>,
  dataset: AnalyticsEngineDataset,
  elapsedMs: number
): void {
  const ua = c.req.header("User-Agent") ?? null;
  const referrer = c.req.header("Referer") ?? c.req.header("Referrer") ?? null;
  const xSource = c.req.header("X-Source") ?? null;
  const xClient = c.req.header("X-Client") ?? null;

  const url = new URL(c.req.url);
  const pathNormalized = normalizePath(url.pathname);

  const uaCategory = categorizeUserAgent(ua);
  const aiVendor = detectAIVendor(ua);
  const refType = categorizeReferrer(referrer);
  const refVendor = detectReferrerVendor(referrer);
  const endpointKind = categorizeEndpoint(pathNormalized);
  const toolHint = detectToolHint({ userAgent: ua, xSource, xClient });
  const contentPlatform = detectContentPlatform(referrer);

  const rawPlan = c.get("plan");
  const plan = typeof rawPlan === "string" && VALID_PLANS.has(rawPlan) ? rawPlan : "anonymous";
  const rawIdHash = c.get("apiKeyIdHash");
  const apiKeyIdHash =
    typeof rawIdHash === "string" && rawIdHash.length > 0 ? rawIdHash : "none";

  // 住所 API 固有フィールド(Context 未設定時は空/0 で送出)
  // 4/25 以降の Fly.io 連携時に各ルートハンドラから c.set() される想定
  const responseType = c.get("addressResponseType") ?? "";
  const coverage = c.get("addressCoverage") ?? "";
  const rawBatchSize = c.get("addressBatchSize");
  const batchSize = typeof rawBatchSize === "number" && Number.isFinite(rawBatchSize) ? rawBatchSize : 1;
  const rawLevel = c.get("addressLevel");
  const level = typeof rawLevel === "number" && Number.isFinite(rawLevel) ? rawLevel : 0;
  const rawConfidence = c.get("addressConfidence");
  const confidence = typeof rawConfidence === "number" && Number.isFinite(rawConfidence) ? rawConfidence : 0;

  const status = c.res.status;
  const success = status >= 200 && status < 300 ? 1 : 0;

  dataset.writeDataPoint({
    blobs: [
      uaCategory,
      aiVendor,
      refType,
      refVendor,
      endpointKind,
      pathNormalized,
      plan,
      apiKeyIdHash,
      toolHint,
      contentPlatform,
      responseType,
      coverage,
    ],
    doubles: [status, success, elapsedMs, batchSize, level, confidence],
    indexes: [endpointKind],
  });
}

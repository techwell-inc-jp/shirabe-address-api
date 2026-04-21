/**
 * GET /api/v1/address/health
 *
 * - 認証不要
 * - AI エージェント / モニタリングが API の対応範囲を一目で把握できるよう、
 *   `coverage_mode: "nationwide"` を返す(47 都道府県対応)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import { SUPPORTED_PREFECTURES, type HealthResponse } from "../types/address.js";

export const health = new Hono<AppEnv>();

health.get("/", (c) => {
  const body: HealthResponse = {
    status: "ok",
    version: c.env.API_VERSION,
    coverage: [...SUPPORTED_PREFECTURES],
    coverage_mode: "nationwide",
  };
  return c.json(body);
});

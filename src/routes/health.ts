/**
 * GET /api/v1/address/health
 *
 * 実装指示書 §2.3:
 * - 認証不要
 * - Fly.io 側のヘルスも将来的に確認する(骨格では Workers 単体の健全性のみ)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/env.js";
import { PHASE_1_COVERAGE, type HealthResponse } from "../types/address.js";

export const health = new Hono<AppEnv>();

health.get("/", (c) => {
  const body: HealthResponse = {
    status: "ok",
    version: c.env.API_VERSION,
    coverage: [...PHASE_1_COVERAGE],
    phase: 1,
  };
  return c.json(body);
});

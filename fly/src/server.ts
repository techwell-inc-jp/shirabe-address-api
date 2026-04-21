/**
 * Fly.io NRT 側 HTTP サーバー — shirabe-address-api
 *
 * 実装指示書 §3.3 / §4.2 の内部サービス。
 * エンドポイント:
 * - GET  /internal/health        — 認証不要のヘルスチェック
 * - POST /internal/geocode       — X-Internal-Token 検証後、abr-geocoder で正規化
 *
 * 起動シーケンス:
 * 1. 環境変数 INTERNAL_TOKEN を必須検証(未設定なら起動停止)
 * 2. ABR_DICTIONARY_DIR(既定: /data/address-db)から辞書をロード
 *    → abr-geocoder のインメモリ Trie 構築完了を await
 * 3. HTTP サーバー起動(既定: 0.0.0.0:8080)
 *
 * 受付は常に batch 形式(Workers 側で単一/batch を吸収)。
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  initGeocoder,
  geocodeBatch,
  isGeocoderReady,
  getDictionaryPath,
  getLastInitError,
  closeGeocoder,
  type GeocodeResult,
} from "./geocoder.js";

type FlyEnv = {
  INTERNAL_TOKEN?: string;
  ABR_DICTIONARY_DIR?: string;
  PORT?: string;
  HOST?: string;
};

const env = process.env as FlyEnv;

const INTERNAL_TOKEN = env.INTERNAL_TOKEN;
const DICTIONARY_DIR = env.ABR_DICTIONARY_DIR ?? "/data/address-db";
const PORT = Number(env.PORT ?? "8080");
const HOST = env.HOST ?? "0.0.0.0";

if (!INTERNAL_TOKEN) {
  console.error(
    "[shirabe-address-api fly] FATAL: INTERNAL_TOKEN is required. Set it via `flyctl secrets set INTERNAL_TOKEN=...`."
  );
  process.exit(1);
}

const BATCH_MAX = 100;

type GeocodeRequestBody = {
  addresses?: unknown;
};

const app = new Hono();

app.get("/internal/health", (c) => {
  return c.json({
    status: "ok",
    abr_geocoder: isGeocoderReady() ? "ready" : "loading",
    dictionary_dir: getDictionaryPath(),
    last_init_error: getLastInitError(),
    phase: 1,
  });
});

app.use("/internal/geocode", async (c, next) => {
  const token = c.req.header("X-Internal-Token");
  if (!token || token !== INTERNAL_TOKEN) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Invalid X-Internal-Token" } },
      403
    );
  }
  await next();
});

app.post("/internal/geocode", async (c) => {
  if (!isGeocoderReady()) {
    return c.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "geocoder is still loading dictionary",
        },
      },
      503
    );
  }

  let body: GeocodeRequestBody;
  try {
    body = await c.req.json<GeocodeRequestBody>();
  } catch {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message: "request body must be valid JSON",
        },
      },
      400
    );
  }

  const addresses = body.addresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message: "`addresses` must be a non-empty array of strings",
        },
      },
      400
    );
  }
  if (addresses.length > BATCH_MAX) {
    return c.json(
      {
        error: {
          code: "BATCH_TOO_LARGE",
          message: `\`addresses\` must contain at most ${BATCH_MAX} items`,
        },
      },
      400
    );
  }
  if (!addresses.every((a) => typeof a === "string" && a.trim().length > 0)) {
    return c.json(
      {
        error: {
          code: "INVALID_FORMAT",
          message: "every item in `addresses` must be a non-empty string",
        },
      },
      400
    );
  }

  const results: GeocodeResult[] = await geocodeBatch(
    (addresses as string[]).map((a) => ({ address: a }))
  );

  return c.json({ results });
});

async function main(): Promise<void> {
  console.log(
    `[shirabe-address-api fly] loading dictionary from ${DICTIONARY_DIR} ...`
  );
  const started = Date.now();
  await initGeocoder(DICTIONARY_DIR);
  if (isGeocoderReady()) {
    console.log(
      `[shirabe-address-api fly] dictionary loaded in ${Date.now() - started}ms`
    );
  } else {
    console.warn(
      `[shirabe-address-api fly] dictionary NOT ready; /internal/geocode will 503 until build-dictionary completes`
    );
  }

  serve({ fetch: app.fetch, port: PORT, hostname: HOST });
  console.log(`[shirabe-address-api fly] listening on ${HOST}:${PORT}`);
}

function shutdown(signal: string): void {
  console.log(`[shirabe-address-api fly] received ${signal}, shutting down...`);
  closeGeocoder()
    .catch((err) => console.error("[shirabe-address-api fly] close error:", err))
    .finally(() => process.exit(0));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  console.error("[shirabe-address-api fly] fatal startup error:", err);
  process.exit(1);
});

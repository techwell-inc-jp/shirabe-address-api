/**
 * Fly.io NRT 側 HTTP サーバー — shirabe-address-api
 *
 * 実装指示書 §4 のスタブ。
 * エンドポイント:
 * - GET  /internal/health        — 認証不要のヘルスチェック
 * - POST /internal/geocode       — X-Internal-Token 検証後、abr-geocoder で正規化
 *
 * 起動シーケンス(4.2 §):
 * 1. Fly Volume 上の SQLite 辞書を読み込み
 * 2. abr-geocoder のインメモリ Trie を構築
 * 3. HTTP サーバー起動
 *
 * Phase 1 骨格: abr-geocoder 統合は未実装、構造のみ。
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";

type FlyEnv = {
  INTERNAL_TOKEN?: string;
  PORT?: string;
};

const env = process.env as FlyEnv;

const app = new Hono();

app.get("/internal/health", (c) => {
  return c.json({
    status: "ok",
    abr_geocoder: "not-loaded", // TODO(4/24): 辞書ロード状態を反映
    phase: 1,
  });
});

// X-Internal-Token 検証(実装指示書 §3.3)
app.use("/internal/geocode", async (c, next) => {
  const token = c.req.header("X-Internal-Token");
  if (!token || token !== env.INTERNAL_TOKEN) {
    return c.json({ error: { code: "FORBIDDEN", message: "Invalid X-Internal-Token" } }, 403);
  }
  await next();
});

app.post("/internal/geocode", async (c) => {
  // TODO(4/24-4/25):
  // 1. body: { addresses: string[] } をバリデート
  // 2. abr-geocoder の Reader/Stream API で各住所を正規化
  // 3. results: [{ input, match, candidates, error? }] を返却
  return c.json(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "abr-geocoder integration pending (Phase 1 skeleton)",
      },
    },
    503
  );
});

const port = Number(env.PORT ?? "8080");
// eslint-disable-next-line no-console
console.log(`[shirabe-address-api fly] listening on :${port}`);
serve({ fetch: app.fetch, port });

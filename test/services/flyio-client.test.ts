/**
 * Workers → Fly.io 通信クライアントの単体テスト
 *
 * 実装指示書 §3.3 の要件:
 * - X-Internal-Token 認証
 * - 単一 10s / batch 30s のタイムアウト
 * - Fly.io 5xx 時のフォールバック(`service_unavailable` 種別)
 * - 常に batch 形式 `{ addresses: string[] }` で送信
 */
import { describe, it, expect } from "vitest";
import {
  callFlyGeocode,
  FLY_TIMEOUT_SINGLE_MS,
  FLY_TIMEOUT_BATCH_MS,
  type FlyGeocodeResponse,
} from "../../src/services/flyio-client.js";
import type { Env } from "../../src/types/env.js";

const BASE_URL = "http://test.internal/internal/geocode";
const TOKEN = "test-token";

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    API_KEYS: {} as KVNamespace,
    RATE_LIMITS: {} as KVNamespace,
    USAGE_LOGS: {} as KVNamespace,
    ADDRESS_CACHE: {} as KVNamespace,
    API_VERSION: "test",
    FLYIO_GEOCODE_URL: BASE_URL,
    FLY_INTERNAL_TOKEN: TOKEN,
    ...overrides,
  };
}

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("callFlyGeocode — happy path", () => {
  it("posts JSON with X-Internal-Token and returns parsed body", async () => {
    const expected: FlyGeocodeResponse = {
      results: [
        {
          input: "東京都港区六本木6-10-1",
          match: {
            normalized: "東京都港区六本木六丁目10番1号",
            prefecture: "東京都",
            city: "港区",
            ward: null,
            county: null,
            oaza_cho: "六本木",
            chome: "六丁目",
            block: "10",
            rsdt_num: "1",
            rsdt_num2: null,
            latitude: 35.660491,
            longitude: 139.729223,
            level: 4,
            abr_match_level: 6,
            confidence: 0.98,
            lg_code: "131032",
            machiaza_id: "0003000",
          },
          candidates: [],
        },
      ],
    };

    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return mockJsonResponse(200, expected);
    };

    const result = await callFlyGeocode(buildEnv(), ["東京都港区六本木6-10-1"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(expected);
    }
    expect(capturedUrl).toBe(BASE_URL);
    expect(capturedInit?.method).toBe("POST");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("X-Internal-Token")).toBe(TOKEN);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(capturedInit?.body).toBe(JSON.stringify({ addresses: ["東京都港区六本木6-10-1"] }));
  });

  it("sends multiple addresses in batch form", async () => {
    let capturedBody: string | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = init?.body as string;
      return mockJsonResponse(200, { results: [] });
    };

    await callFlyGeocode(buildEnv(), ["a", "b", "c"], {
      timeoutMs: FLY_TIMEOUT_BATCH_MS,
      fetchImpl,
    });

    expect(JSON.parse(capturedBody ?? "{}")).toEqual({ addresses: ["a", "b", "c"] });
  });
});

describe("callFlyGeocode — error mapping", () => {
  it("maps Fly.io 403 to auth error", async () => {
    const fetchImpl: typeof fetch = async () =>
      mockJsonResponse(403, { error: { code: "FORBIDDEN" } });

    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("auth");
    }
  });

  it("maps Fly.io 503 to service_unavailable", async () => {
    const fetchImpl: typeof fetch = async () =>
      mockJsonResponse(503, {
        error: { code: "SERVICE_UNAVAILABLE", message: "dict loading" },
      });

    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("service_unavailable");
      if (result.error.kind === "service_unavailable") {
        expect(result.error.status).toBe(503);
      }
    }
  });

  it("maps Fly.io 500 to service_unavailable", async () => {
    const fetchImpl: typeof fetch = async () => new Response("boom", { status: 500 });
    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("service_unavailable");
  });

  it("maps Fly.io 400 to bad_request with upstream message", async () => {
    const fetchImpl: typeof fetch = async () =>
      mockJsonResponse(400, {
        error: { code: "BATCH_TOO_LARGE", message: "too many items" },
      });

    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("bad_request");
      if (result.error.kind === "bad_request") {
        expect(result.error.message).toBe("too many items");
      }
    }
  });

  it("maps fetch rejection to network error", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };

    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
    }
  });

  it("maps aborted fetch to timeout error", async () => {
    const fetchImpl: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new DOMException("aborted", "AbortError");
            reject(err);
          });
        }
      });

    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: 20,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("timeout");
      if (result.error.kind === "timeout") {
        expect(result.error.timeoutMs).toBe(20);
      }
    }
  });

  it("maps non-JSON body to invalid_response", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });

    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_response");
    }
  });

  it("maps body missing `results` key to invalid_response", async () => {
    const fetchImpl: typeof fetch = async () => mockJsonResponse(200, { foo: "bar" });

    const result = await callFlyGeocode(buildEnv(), ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_response");
  });
});

describe("callFlyGeocode — config guards", () => {
  it("returns config_missing when FLYIO_GEOCODE_URL is empty", async () => {
    const env = buildEnv({ FLYIO_GEOCODE_URL: "" });
    const result = await callFlyGeocode(env, ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl: async () => mockJsonResponse(200, { results: [] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config_missing");
      if (result.error.kind === "config_missing") {
        expect(result.error.field).toBe("FLYIO_GEOCODE_URL");
      }
    }
  });

  it("returns config_missing when FLY_INTERNAL_TOKEN is unset", async () => {
    const env = buildEnv({ FLY_INTERNAL_TOKEN: undefined });
    const result = await callFlyGeocode(env, ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl: async () => mockJsonResponse(200, { results: [] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config_missing");
      if (result.error.kind === "config_missing") {
        expect(result.error.field).toBe("FLY_INTERNAL_TOKEN");
      }
    }
  });

  it("trims whitespace from FLY_INTERNAL_TOKEN before sending", async () => {
    // Secret 投入経路(PowerShell Get-Content パイプ等)で紛れ込む CR/LF/空白を吸収する。
    // Fly.io 側は `!==` 厳密一致のため、Workers 側で事前 trim しないと認証が落ちる。
    const env = buildEnv({ FLY_INTERNAL_TOKEN: `  ${TOKEN}\r\n` });
    let capturedToken: string | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedToken = new Headers(init?.headers).get("X-Internal-Token") ?? undefined;
      return mockJsonResponse(200, { results: [] });
    };
    const result = await callFlyGeocode(env, ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(capturedToken).toBe(TOKEN);
  });

  it("returns config_missing when FLY_INTERNAL_TOKEN is only whitespace", async () => {
    const env = buildEnv({ FLY_INTERNAL_TOKEN: "   \r\n  " });
    const result = await callFlyGeocode(env, ["x"], {
      timeoutMs: FLY_TIMEOUT_SINGLE_MS,
      fetchImpl: async () => mockJsonResponse(200, { results: [] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config_missing");
      if (result.error.kind === "config_missing") {
        expect(result.error.field).toBe("FLY_INTERNAL_TOKEN");
      }
    }
  });
});

describe("callFlyGeocode — timeout constants", () => {
  it("exposes 10s single-request timeout", () => {
    expect(FLY_TIMEOUT_SINGLE_MS).toBe(10_000);
  });
  it("exposes 30s batch timeout", () => {
    expect(FLY_TIMEOUT_BATCH_MS).toBe(30_000);
  });
});

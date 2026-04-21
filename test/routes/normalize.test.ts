/**
 * POST /api/v1/address/normalize と /api/v1/address/normalize/batch の統合テスト。
 *
 * 検証観点:
 * - 入力バリデーション(INVALID_FORMAT, BATCH_TOO_LARGE)
 * - ミドルウェアチェーン通過(X-RateLimit-* ヘッダー)
 * - 配線パイプライン: postal-code-parser / building-separator / checkCoverage /
 *   cacheGet → callFlyGeocode → response-formatter → cachePut → response
 * - Fly.io 応答を vi.stubGlobal("fetch", ...) で差し替え、ネットワーク非依存
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../src/index.js";
import { createMockEnv } from "../helpers/mock-kv.js";
import { DEFAULT_ATTRIBUTION } from "../../src/types/address.js";
import type { FlyGeocodeResponse } from "../../src/services/flyio-client.js";
import { cacheKey } from "../../src/services/cache.js";

type MockedFetch = ReturnType<typeof vi.fn<typeof fetch>>;

function stubFetch(impl: typeof fetch): MockedFetch {
  const fn = vi.fn<typeof fetch>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function successFlyResponse(input: string): FlyGeocodeResponse {
  return {
    results: [
      {
        input,
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
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/v1/address/normalize — validation", () => {
  it("returns 400 INVALID_FORMAT for missing address field", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("INVALID_FORMAT");
  });

  it("returns 400 INVALID_FORMAT for non-JSON body", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not a json",
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 INVALID_FORMAT for empty string address", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "   " }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("sets X-RateLimit-* headers for anonymous Free user", async () => {
    // Fly.io 呼び出し失敗でも middleware ヘッダーは返る
    stubFetch(async () => {
      throw new Error("network unreachable");
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都千代田区霞が関3-1-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5000");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });
});

describe("POST /api/v1/address/normalize — happy path", () => {
  it("returns 200 with formatted response when Fly.io succeeds", async () => {
    const fetchFn = stubFetch(async () => {
      return new Response(JSON.stringify(successFlyResponse("東京都港区六本木6-10-1")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "〒106-0032 東京都港区六本木6-10-1 六本木ヒルズ森タワー42F",
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      input: string;
      result: {
        normalized: string;
        components: Record<string, string | null>;
        postal_code: string | null;
        latitude: number | null;
        level: number;
        confidence: number;
      } | null;
      attribution: { license: string };
    };
    expect(json.result).not.toBeNull();
    expect(json.result!.normalized).toBe("東京都港区六本木六丁目10番1号");
    expect(json.result!.postal_code).toBe("106-0032");
    expect(json.result!.components).toEqual({
      prefecture: "東京都",
      city: "港区",
      town: "六本木六丁目",
      block: "10番1号",
      building: "六本木ヒルズ森タワー",
      floor: "42F",
    });
    expect(json.attribution.license).toBe("CC BY 4.0");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("strips building/floor from the street_address sent to Fly.io", async () => {
    let capturedBody: string | undefined;
    stubFetch(async (_url, init) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(successFlyResponse("東京都港区六本木6-10-1")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const env = createMockEnv();
    await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "〒106-0032 東京都港区六本木6-10-1 森タワー42F",
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!) as { addresses: string[] };
    expect(parsed.addresses).toEqual(["東京都港区六本木6-10-1"]);
  });
});

describe("POST /api/v1/address/normalize — cache", () => {
  it("returns cached response without calling Fly.io on second request", async () => {
    const fetchFn = stubFetch(async () => {
      return new Response(JSON.stringify(successFlyResponse("東京都港区六本木6-10-1")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const env = createMockEnv();
    // 1回目: Fly.io 呼び出し + キャッシュ書込
    await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都港区六本木6-10-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // 匿名 Free の秒間レート制限(1 req/s)を回避するため RATE_LIMITS KV をクリア
    const rateLimitsStore = (env.RATE_LIMITS as unknown as { store: Map<string, unknown> })
      .store;
    rateLimitsStore.clear();

    // 2回目: キャッシュヒット → Fly.io は呼ばれない
    const res2 = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都港区六本木6-10-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res2.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1); // 増えていない
  });
});

describe("POST /api/v1/address/normalize — OUTSIDE_COVERAGE", () => {
  it("returns 200 with OUTSIDE_COVERAGE for invalid/fabricated prefecture name without calling Fly.io", async () => {
    const fetchFn = stubFetch(async () => {
      throw new Error("should not be called");
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "架空県仮想市サンプル町1-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result: unknown;
      error?: { code?: string; matched_up_to?: string };
      attribution: { license: string };
    };
    expect(json.result).toBeNull();
    expect(json.error?.code).toBe("OUTSIDE_COVERAGE");
    expect(json.error?.matched_up_to).toBe("架空県");
    expect(json.attribution.license).toBe("CC BY 4.0");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/address/normalize — SERVICE_UNAVAILABLE paths", () => {
  it("returns 503 SERVICE_UNAVAILABLE when Fly.io network fails", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都港区六本木6-10-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when Fly.io returns 5xx", async () => {
    stubFetch(async () => new Response("boom", { status: 502 }));
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "東京都港区六本木6-10-1" }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(503);
  });
});

describe("POST /api/v1/address/normalize/batch — validation", () => {
  it("returns 400 BATCH_TOO_LARGE for >100 addresses", async () => {
    const env = createMockEnv();
    const addresses = Array.from({ length: 101 }, (_, i) => `東京都千代田区${i}`);
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("BATCH_TOO_LARGE");
  });

  it("returns 400 INVALID_FORMAT for empty array", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: [] }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 INVALID_FORMAT when any item is blank", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: ["東京都", "   "] }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/address/normalize/batch — happy + mixed", () => {
  it("returns 200 with per-item results and summary when Fly.io handles everything", async () => {
    stubFetch(async () => {
      const body: FlyGeocodeResponse = {
        results: [
          successFlyResponse("東京都港区六本木6-10-1").results[0]!,
          {
            input: "大阪府大阪市北区梅田1-1-3",
            match: {
              normalized: "大阪府大阪市北区梅田一丁目1番3号",
              prefecture: "大阪府",
              city: "大阪市",
              ward: "北区",
              county: null,
              oaza_cho: "梅田",
              chome: "一丁目",
              block: "1",
              rsdt_num: "3",
              rsdt_num2: null,
              latitude: 34.70111,
              longitude: 135.49778,
              level: 4,
              abr_match_level: 6,
              confidence: 0.97,
              lg_code: "271004",
              machiaza_id: "0002000",
            },
            candidates: [],
          },
        ],
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: ["東京都港区六本木6-10-1", "大阪府大阪市北区梅田1-1-3"],
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      results: Array<{
        result: { components: { city: string | null } } | null;
      }>;
      summary: { total: number; succeeded: number; ambiguous: number; failed: number };
    };
    expect(json.summary).toEqual({ total: 2, succeeded: 2, ambiguous: 0, failed: 0 });
    expect(json.results[0]!.result).not.toBeNull();
    expect(json.results[1]!.result!.components.city).toBe("大阪市北区");
  });

  it("handles mixed OUTSIDE_COVERAGE + succeeded without sending out-of-coverage to Fly.io", async () => {
    let capturedBody: string | undefined;
    stubFetch(async (_url, init) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(successFlyResponse("東京都港区六本木6-10-1")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: ["東京都港区六本木6-10-1", "架空県仮想市サンプル町1-1"],
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      results: Array<{ result: unknown; error?: { code?: string } }>;
      summary: { total: number; succeeded: number; failed: number };
    };
    expect(json.summary.total).toBe(2);
    expect(json.summary.succeeded).toBe(1);
    expect(json.summary.failed).toBe(1);
    expect(json.results[0]!.result).not.toBeNull();
    expect(json.results[1]!.error?.code).toBe("OUTSIDE_COVERAGE");

    // Fly.io には 1 件だけ送られている
    const parsed = JSON.parse(capturedBody!) as { addresses: string[] };
    expect(parsed.addresses).toHaveLength(1);
    expect(parsed.addresses[0]).toBe("東京都港区六本木6-10-1");
  });

  it("returns 200 and skips Fly.io entirely when ALL items are OUTSIDE_COVERAGE", async () => {
    const fetchFn = stubFetch(async () => {
      throw new Error("should not be called");
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: ["架空県仮想市", "テスト都新宿区"],
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { summary: { total: number; failed: number } };
    expect(json.summary).toEqual({ total: 2, succeeded: 0, ambiguous: 0, failed: 2 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 503 only when ALL items became SERVICE_UNAVAILABLE (Fly.io down)", async () => {
    stubFetch(async () => {
      throw new TypeError("network down");
    });
    const env = createMockEnv();
    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: ["東京都港区六本木6-10-1", "大阪府大阪市北区梅田1-1-3"],
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as {
      results: Array<{ error?: { code?: string }; attribution: { license: string } }>;
      summary: { failed: number; total: number };
    };
    expect(json.summary.failed).toBe(2);
    expect(json.results[0]!.error?.code).toBe("SERVICE_UNAVAILABLE");
    expect(json.results[0]!.attribution.license).toBe("CC BY 4.0");
  });

  it("uses cache for pre-populated items and only calls Fly.io for misses", async () => {
    const env = createMockEnv();
    // キャッシュに 1 件事前投入
    const cached = {
      input: "東京都港区六本木6-10-1",
      result: successFlyResponse("x").results[0]!.match,
      candidates: [],
      attribution: DEFAULT_ATTRIBUTION,
    };
    const key = await cacheKey("東京都港区六本木6-10-1");
    await (env.ADDRESS_CACHE as unknown as KVNamespace).put(
      key,
      JSON.stringify({ ...cached, input: "東京都港区六本木6-10-1" })
    );

    let capturedBody: string | undefined;
    stubFetch(async (_url, init) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(successFlyResponse("愛知県名古屋市中区栄3-1")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await app.request(
      "/api/v1/address/normalize/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: ["東京都港区六本木6-10-1", "愛知県名古屋市中区栄3-1"],
        }),
      },
      env as unknown as Record<string, unknown>
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(capturedBody!) as { addresses: string[] };
    expect(parsed.addresses).toHaveLength(1);
    expect(parsed.addresses[0]).toBe("愛知県名古屋市中区栄3-1");
  });
});

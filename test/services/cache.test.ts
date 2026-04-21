/**
 * ADDRESS_CACHE KV ラッパの単体テスト(実装指示書 §3.4)
 */
import { describe, it, expect } from "vitest";
import {
  cacheKey,
  cacheGet,
  cachePut,
  cacheDelete,
  normalizeForKey,
  CACHE_KEY_PREFIX,
  CACHE_DEFAULT_TTL_SECONDS,
  CACHE_MIN_TTL_SECONDS,
  sha256Hex,
} from "../../src/services/cache.js";
import { MockKV } from "../helpers/mock-kv.js";
import { DEFAULT_ATTRIBUTION, type NormalizeResponse } from "../../src/types/address.js";

function sampleResponse(input = "東京都港区六本木6-10-1"): NormalizeResponse {
  return {
    input,
    result: {
      normalized: "東京都港区六本木六丁目10番1号",
      components: {
        prefecture: "東京都",
        city: "港区",
        town: "六本木六丁目",
        block: "10番1号",
        building: null,
        floor: null,
      },
      postal_code: null,
      latitude: 35.660491,
      longitude: 139.729223,
      level: 4,
      confidence: 0.98,
    },
    candidates: [],
    attribution: DEFAULT_ATTRIBUTION,
  };
}

describe("cacheKey", () => {
  it("starts with the addr: prefix and a 64-char hex suffix", async () => {
    const key = await cacheKey("東京都港区六本木6-10-1");
    expect(key.startsWith(CACHE_KEY_PREFIX)).toBe(true);
    expect(key.slice(CACHE_KEY_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for identical inputs", async () => {
    const a = await cacheKey("東京都港区六本木6-10-1");
    const b = await cacheKey("東京都港区六本木6-10-1");
    expect(a).toBe(b);
  });

  it("differs between different inputs", async () => {
    const a = await cacheKey("東京都港区六本木6-10-1");
    const b = await cacheKey("大阪府大阪市北区梅田1-1");
    expect(a).not.toBe(b);
  });

  it("collapses fullwidth vs halfwidth variants to the same key", async () => {
    const halfwidth = await cacheKey("東京都港区六本木6-10-1");
    const fullwidth = await cacheKey("東京都港区六本木６−１０−１");
    expect(halfwidth).toBe(fullwidth);
  });

  it("collapses multiple whitespace into a single space", async () => {
    const a = await cacheKey("東京都港区   六本木  6-10-1");
    const b = await cacheKey("東京都港区 六本木 6-10-1");
    expect(a).toBe(b);
  });

  it("is case-insensitive for ASCII portions", async () => {
    const upper = await cacheKey("東京都港区六本木6-10-1 Roppongi Hills");
    const lower = await cacheKey("東京都港区六本木6-10-1 roppongi hills");
    expect(upper).toBe(lower);
  });

  it("ignores leading/trailing whitespace", async () => {
    const a = await cacheKey("  東京都港区六本木6-10-1  ");
    const b = await cacheKey("東京都港区六本木6-10-1");
    expect(a).toBe(b);
  });
});

describe("sha256Hex", () => {
  it("returns a 64-char lowercase hex string", async () => {
    const hex = await sha256Hex("hello");
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hex).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });
});

describe("normalizeForKey", () => {
  it("NFKC normalizes fullwidth digits", () => {
    expect(normalizeForKey("１２３")).toBe("123");
  });
  it("lowercases ASCII", () => {
    expect(normalizeForKey("Mori TOWER")).toBe("mori tower");
  });
  it("collapses whitespace and trims", () => {
    expect(normalizeForKey("  a   b  ")).toBe("a b");
  });
});

describe("cacheGet / cachePut", () => {
  it("round-trips a NormalizeResponse", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    const resp = sampleResponse();
    await cachePut(kv, "東京都港区六本木6-10-1", resp);
    const got = await cacheGet(kv, "東京都港区六本木6-10-1");
    expect(got).toEqual(resp);
  });

  it("returns null for cache miss", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    const got = await cacheGet(kv, "miss-key");
    expect(got).toBeNull();
  });

  it("applies default TTL of 3600 seconds when omitted", async () => {
    const kv = new MockKV();
    await cachePut(kv as unknown as KVNamespace, "x", sampleResponse());
    const key = await cacheKey("x");
    // MockKV stores expiration as absolute seconds from now
    const now = Date.now() / 1000;
    const entry = (kv as unknown as { store: Map<string, { expiration?: number }> }).store.get(key);
    expect(entry?.expiration).toBeDefined();
    expect((entry?.expiration ?? 0) - now).toBeGreaterThan(CACHE_DEFAULT_TTL_SECONDS - 5);
    expect((entry?.expiration ?? 0) - now).toBeLessThan(CACHE_DEFAULT_TTL_SECONDS + 5);
  });

  it("clamps TTL below 60 up to 60", async () => {
    const kv = new MockKV();
    // Cloudflare KV rejects expirationTtl < 60 with 400 (MockKV mirrors this behaviour).
    // Our cachePut must clamp so the put succeeds.
    await expect(
      cachePut(kv as unknown as KVNamespace, "x", sampleResponse(), 10)
    ).resolves.toBeUndefined();
  });

  it("self-heals corrupted cache entry by deleting and returning null", async () => {
    const kv = new MockKV();
    const key = await cacheKey("東京都港区六本木6-10-1");
    await (kv as unknown as KVNamespace).put(key, "not-json");
    const got = await cacheGet(kv as unknown as KVNamespace, "東京都港区六本木6-10-1");
    expect(got).toBeNull();
    const afterDelete = (kv as unknown as { store: Map<string, unknown> }).store.has(key);
    expect(afterDelete).toBe(false);
  });

  it("cacheDelete removes an existing entry", async () => {
    const kv = new MockKV();
    await cachePut(kv as unknown as KVNamespace, "x", sampleResponse());
    await cacheDelete(kv as unknown as KVNamespace, "x");
    const got = await cacheGet(kv as unknown as KVNamespace, "x");
    expect(got).toBeNull();
  });

  it("hits cache regardless of input whitespace or case variation", async () => {
    const kv = new MockKV() as unknown as KVNamespace;
    await cachePut(kv, "  東京都港区六本木6-10-1  ", sampleResponse());
    const got = await cacheGet(kv, "東京都港区六本木6-10-1");
    expect(got).not.toBeNull();
  });
});

describe("constants", () => {
  it("exposes the minimum TTL clamp", () => {
    expect(CACHE_MIN_TTL_SECONDS).toBe(60);
  });
  it("exposes the default TTL (matches impl-order §3.4 = 3600s)", () => {
    expect(CACHE_DEFAULT_TTL_SECONDS).toBe(3600);
  });
});

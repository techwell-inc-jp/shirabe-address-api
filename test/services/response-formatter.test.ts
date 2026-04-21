/**
 * レスポンス整形の単体テスト
 *
 * 実装指示書 §2.1 / §3.2:
 * - attribution 必須(全レスポンスに DEFAULT_ATTRIBUTION)
 * - Fly.io フラット構造 → 公開 API ネスト構造への変換
 * - match_level(AddressLevel)と confidence(0-1 範囲)の整形
 */
import { describe, it, expect } from "vitest";
import {
  formatNormalizeResponse,
  formatBatchResponse,
  type EnrichmentContext,
} from "../../src/services/response-formatter.js";
import type {
  FlyGeocodeMatch,
  FlyGeocodeResult,
} from "../../src/services/flyio-client.js";
import { DEFAULT_ATTRIBUTION } from "../../src/types/address.js";

function makeFlyMatch(overrides: Partial<FlyGeocodeMatch> = {}): FlyGeocodeMatch {
  return {
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
    ...overrides,
  };
}

describe("formatNormalizeResponse — success case", () => {
  it("produces public schema with enrichment-supplied postal/building/floor", () => {
    const result = formatNormalizeResponse({
      input: "〒106-0032 東京都港区六本木6-10-1 六本木ヒルズ森タワー42F",
      flyResult: {
        input: "東京都港区六本木6-10-1",
        match: makeFlyMatch(),
        candidates: [],
      },
      enrichment: {
        postalCode: "106-0032",
        building: "六本木ヒルズ森タワー",
        floor: "42F",
      },
    });

    expect(result.result).not.toBeNull();
    expect(result.result!.normalized).toBe("東京都港区六本木六丁目10番1号");
    expect(result.result!.components).toEqual({
      prefecture: "東京都",
      city: "港区",
      town: "六本木六丁目",
      block: "10番1号",
      building: "六本木ヒルズ森タワー",
      floor: "42F",
    });
    expect(result.result!.postal_code).toBe("106-0032");
    expect(result.result!.latitude).toBe(35.660491);
    expect(result.result!.longitude).toBe(139.729223);
    expect(result.result!.level).toBe(4);
    expect(result.result!.confidence).toBe(0.98);
    expect(result.candidates).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(result.attribution).toEqual(DEFAULT_ATTRIBUTION);
    expect(result.input).toBe("〒106-0032 東京都港区六本木6-10-1 六本木ヒルズ森タワー42F");
  });

  it("defaults enrichment fields to null when omitted", () => {
    const result = formatNormalizeResponse({
      input: "東京都港区六本木6-10-1",
      flyResult: {
        input: "東京都港区六本木6-10-1",
        match: makeFlyMatch(),
        candidates: [],
      },
    });
    expect(result.result!.postal_code).toBeNull();
    expect(result.result!.components.building).toBeNull();
    expect(result.result!.components.floor).toBeNull();
  });

  it("combines city + ward for 政令指定都市", () => {
    const result = formatNormalizeResponse({
      input: "横浜市中区本町1-1",
      flyResult: {
        input: "横浜市中区本町1-1",
        match: makeFlyMatch({
          prefecture: "神奈川県",
          city: "横浜市",
          ward: "中区",
          oaza_cho: "本町",
          chome: null,
          block: "1",
          rsdt_num: "1",
        }),
        candidates: [],
      },
    });
    expect(result.result!.components.city).toBe("横浜市中区");
  });

  it("handles town composed only of oaza_cho (no chome)", () => {
    const result = formatNormalizeResponse({
      input: "北海道網走郡",
      flyResult: {
        input: "北海道",
        match: makeFlyMatch({
          prefecture: "北海道",
          city: null,
          county: "網走郡",
          oaza_cho: "津別町",
          chome: null,
          block: null,
          rsdt_num: null,
        }),
        candidates: [],
      },
    });
    expect(result.result!.components.town).toBe("津別町");
  });

  it("omits block composition when neither block nor rsdt_num are present", () => {
    const result = formatNormalizeResponse({
      input: "東京都港区六本木",
      flyResult: {
        input: "東京都港区六本木",
        match: makeFlyMatch({ block: null, rsdt_num: null, rsdt_num2: null }),
        candidates: [],
      },
    });
    expect(result.result!.components.block).toBeNull();
  });

  it("composes block from block only when rsdt_num is null", () => {
    const result = formatNormalizeResponse({
      input: "...",
      flyResult: {
        input: "...",
        match: makeFlyMatch({ block: "10", rsdt_num: null }),
        candidates: [],
      },
    });
    expect(result.result!.components.block).toBe("10番");
  });

  it("includes rsdt_num2 as '-N' suffix when present", () => {
    const result = formatNormalizeResponse({
      input: "...",
      flyResult: {
        input: "...",
        match: makeFlyMatch({ block: "10", rsdt_num: "1", rsdt_num2: "3" }),
        candidates: [],
      },
    });
    expect(result.result!.components.block).toBe("10番1号-3");
  });
});

describe("formatNormalizeResponse — ambiguous case", () => {
  it("returns result=null with candidates populated", () => {
    const result = formatNormalizeResponse({
      input: "港区六本木6",
      flyResult: {
        input: "港区六本木6",
        match: null,
        candidates: [
          makeFlyMatch({ level: 2, confidence: 0.82, rsdt_num: null, rsdt_num2: null }),
        ],
        error: {
          code: "PARTIAL_MATCH",
          message: "市区町村までしか特定できませんでした",
          matched_up_to: "東京都港区",
          level: 2,
        },
      },
    });

    expect(result.result).toBeNull();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.level).toBe(2);
    expect(result.candidates[0]!.confidence).toBe(0.82);
    expect(result.error?.code).toBe("PARTIAL_MATCH");
    expect(result.attribution).toEqual(DEFAULT_ATTRIBUTION);
  });
});

describe("formatNormalizeResponse — error case", () => {
  it("emits ADDRESS_NOT_FOUND error + empty candidates", () => {
    const result = formatNormalizeResponse({
      input: "存在しない町",
      flyResult: {
        input: "存在しない町",
        match: null,
        candidates: [],
        error: {
          code: "ADDRESS_NOT_FOUND",
          message: "住所を特定できませんでした",
          matched_up_to: null,
          level: 0,
        },
      },
    });
    expect(result.result).toBeNull();
    expect(result.candidates).toEqual([]);
    expect(result.error?.code).toBe("ADDRESS_NOT_FOUND");
    expect(result.error?.level).toBe(0);
    expect(result.attribution).toEqual(DEFAULT_ATTRIBUTION);
  });

  it("coerces unknown error code to SERVICE_UNAVAILABLE", () => {
    const result = formatNormalizeResponse({
      input: "x",
      flyResult: {
        input: "x",
        match: null,
        candidates: [],
        error: {
          code: "NOT_IMPLEMENTED",
          message: "stub",
          matched_up_to: null,
          level: 0,
        },
      },
    });
    expect(result.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("formatNormalizeResponse — confidence clamping", () => {
  it("clamps confidence > 1 down to 1", () => {
    const result = formatNormalizeResponse({
      input: "x",
      flyResult: {
        input: "x",
        match: makeFlyMatch({ confidence: 1.5 }),
        candidates: [],
      },
    });
    expect(result.result!.confidence).toBe(1);
  });

  it("clamps negative confidence up to 0", () => {
    const result = formatNormalizeResponse({
      input: "x",
      flyResult: {
        input: "x",
        match: makeFlyMatch({ confidence: -0.2 }),
        candidates: [],
      },
    });
    expect(result.result!.confidence).toBe(0);
  });

  it("handles NaN confidence as 0", () => {
    const result = formatNormalizeResponse({
      input: "x",
      flyResult: {
        input: "x",
        match: makeFlyMatch({ confidence: Number.NaN }),
        candidates: [],
      },
    });
    expect(result.result!.confidence).toBe(0);
  });
});

describe("formatBatchResponse", () => {
  it("summarizes succeeded/ambiguous/failed correctly", () => {
    const enrichments: EnrichmentContext[] = [
      { postalCode: null, building: null, floor: null },
      { postalCode: null, building: null, floor: null },
      { postalCode: null, building: null, floor: null },
    ];
    const flyResults: FlyGeocodeResult[] = [
      { input: "a", match: makeFlyMatch(), candidates: [] },
      {
        input: "b",
        match: null,
        candidates: [makeFlyMatch({ level: 2, rsdt_num: null, rsdt_num2: null })],
        error: {
          code: "PARTIAL_MATCH",
          message: "partial",
          matched_up_to: "xxx",
          level: 2,
        },
      },
      {
        input: "c",
        match: null,
        candidates: [],
        error: {
          code: "ADDRESS_NOT_FOUND",
          message: "none",
          matched_up_to: null,
          level: 0,
        },
      },
    ];

    const batch = formatBatchResponse({
      inputs: ["a", "b", "c"],
      flyResults,
      enrichments,
    });

    expect(batch.summary).toEqual({
      total: 3,
      succeeded: 1,
      ambiguous: 1,
      failed: 1,
    });
    expect(batch.results).toHaveLength(3);
    batch.results.forEach((r) => {
      expect(r.attribution).toEqual(DEFAULT_ATTRIBUTION);
    });
  });

  it("throws when inputs and flyResults lengths mismatch", () => {
    expect(() =>
      formatBatchResponse({
        inputs: ["a", "b"],
        flyResults: [{ input: "a", match: null, candidates: [] }],
      })
    ).toThrow(/length mismatch/);
  });
});

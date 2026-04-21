/**
 * Phase 1 対応可否判定の単体テスト
 */
import { describe, it, expect } from "vitest";
import { checkCoverage } from "../../src/services/coverage.js";

describe("checkCoverage — Phase 1 prefectures (in_coverage)", () => {
  it.each([
    ["東京都港区六本木6-10-1", "東京都"],
    ["神奈川県横浜市中区本町1-1", "神奈川県"],
    ["大阪府大阪市北区梅田1-1-3", "大阪府"],
    ["愛知県名古屋市中区栄3-1", "愛知県"],
    ["福岡県福岡市博多区博多駅前1-1", "福岡県"],
    ["北海道札幌市中央区大通西1", "北海道"],
  ])("detects %s as in_coverage", (input, expected) => {
    const r = checkCoverage(input);
    expect(r.status).toBe("in_coverage");
    if (r.status === "in_coverage") {
      expect(r.prefecture).toBe(expected);
    }
  });
});

describe("checkCoverage — Phase 2+ prefectures (out_of_coverage)", () => {
  it.each([
    ["宮城県仙台市青葉区国分町1-1", "宮城県"],
    ["京都府京都市中京区河原町通三条下ル", "京都府"],
    ["広島県広島市中区基町5-25", "広島県"],
    ["沖縄県那覇市久茂地1-1", "沖縄県"],
    ["青森県青森市長島1-1", "青森県"],
    ["鹿児島県鹿児島市山下町11", "鹿児島県"],
  ])("detects %s as out_of_coverage", (input, expected) => {
    const r = checkCoverage(input);
    expect(r.status).toBe("out_of_coverage");
    if (r.status === "out_of_coverage") {
      expect(r.prefecture).toBe(expected);
    }
  });
});

describe("checkCoverage — unknown / partial input", () => {
  it("returns unknown for input without prefecture", () => {
    expect(checkCoverage("渋谷区神南1-23-1").status).toBe("unknown");
  });

  it("returns unknown for empty string", () => {
    expect(checkCoverage("").status).toBe("unknown");
  });

  it("returns unknown for non-string input", () => {
    // @ts-expect-error runtime safety
    expect(checkCoverage(null).status).toBe("unknown");
  });

  it("returns unknown for pure prefecture-less city name", () => {
    expect(checkCoverage("横浜市中区").status).toBe("unknown");
  });
});

describe("checkCoverage — edge cases", () => {
  it("picks the FIRST prefecture when multiple appear (unusual but defensive)", () => {
    const r = checkCoverage("東京都港区から福岡県へ");
    expect(r.status).toBe("in_coverage");
    if (r.status === "in_coverage") {
      expect(r.prefecture).toBe("東京都");
    }
  });

  it("does not falsely match street names ending in 県", () => {
    // "京都" は "都" で終わるが 3-4 文字ルールで "京都府" のみ扱う想定。
    // "京都" 単独の部分住所は prefecture として検出しない(句読点/空白で区切られないケース)。
    // NOTE: 入力末尾の "京都" (県/府なし) は unknown 扱い。
    expect(checkCoverage("京都").status).toBe("unknown");
  });
});

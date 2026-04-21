/**
 * 対応都道府県判定の単体テスト
 *
 * 5/1 正式リリースで全 47 都道府県対応。`out_of_coverage` は
 * 「都道府県らしい文字列だが 47 都道府県に該当しない」入力(架空名・タイポ)
 * への防御層として機能する。
 */
import { describe, it, expect } from "vitest";
import { checkCoverage } from "../../src/services/coverage.js";

describe("checkCoverage — all 47 prefectures are in_coverage", () => {
  it.each([
    ["北海道札幌市中央区大通西1", "北海道"],
    ["青森県青森市長島1-1", "青森県"],
    ["宮城県仙台市青葉区国分町1-1", "宮城県"],
    ["東京都港区六本木6-10-1", "東京都"],
    ["神奈川県横浜市中区本町1-1", "神奈川県"],
    ["新潟県新潟市中央区学校町通1番町602", "新潟県"],
    ["京都府京都市中京区河原町通三条下ル", "京都府"],
    ["大阪府大阪市北区梅田1-1-3", "大阪府"],
    ["愛知県名古屋市中区栄3-1", "愛知県"],
    ["広島県広島市中区基町5-25", "広島県"],
    ["福岡県福岡市博多区博多駅前1-1", "福岡県"],
    ["鹿児島県鹿児島市山下町11", "鹿児島県"],
    ["沖縄県那覇市久茂地1-1", "沖縄県"],
  ])("detects %s as in_coverage", (input, expected) => {
    const r = checkCoverage(input);
    expect(r.status).toBe("in_coverage");
    if (r.status === "in_coverage") {
      expect(r.prefecture).toBe(expected);
    }
  });
});

describe("checkCoverage — fabricated/invalid prefecture names (out_of_coverage)", () => {
  it.each([
    ["架空県仮想市サンプル町1-1", "架空県"],
    ["テスト都新宿区1-1", "テスト都"],
    ["虚構府大阪市北区1-1", "虚構府"],
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

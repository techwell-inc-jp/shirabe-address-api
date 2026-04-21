/**
 * 建物名・階数分離の単体テスト(実装指示書 §3.2)
 */
import { describe, it, expect } from "vitest";
import { separateBuilding } from "../../src/services/building-separator.js";

describe("separateBuilding — full happy path", () => {
  it("splits building + floor after hyphenated block", () => {
    const r = separateBuilding("東京都港区六本木6-10-1 六本木ヒルズ森タワー42F");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBe("六本木ヒルズ森タワー");
    expect(r.floor).toBe("42F");
  });

  it("splits building + floor after Japanese ordinal block", () => {
    const r = separateBuilding(
      "東京都港区六本木六丁目10番1号 六本木ヒルズ森タワー42F"
    );
    expect(r.streetAddress).toBe("東京都港区六本木六丁目10番1号");
    expect(r.building).toBe("六本木ヒルズ森タワー");
    expect(r.floor).toBe("42F");
  });

  it("splits building + room number", () => {
    const r = separateBuilding("東京都港区六本木6-10-1 パークマンション101号室");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBe("パークマンション");
    expect(r.floor).toBe("101号室");
  });

  it("handles basement floor notation B1F", () => {
    const r = separateBuilding("東京都港区六本木6-10-1 森タワーB1F");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBe("森タワー");
    expect(r.floor).toBe("B1F");
  });

  it("handles 階 kanji notation", () => {
    const r = separateBuilding("東京都港区六本木6-10-1 森タワー3階");
    expect(r.building).toBe("森タワー");
    expect(r.floor).toBe("3階");
  });
});

describe("separateBuilding — fullwidth & normalization", () => {
  it("normalizes fullwidth digits and fullwidth hyphens in block", () => {
    const r = separateBuilding("東京都港区六本木６−１０−１ 森タワー４２Ｆ");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBe("森タワー");
    expect(r.floor).toBe("42F");
  });

  it("treats katakana chōon as hyphen", () => {
    const r = separateBuilding("東京都港区六本木6ー10ー1 森タワー42F");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
  });
});

describe("separateBuilding — partial", () => {
  it("returns only streetAddress when no building is present", () => {
    const r = separateBuilding("東京都港区六本木6-10-1");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBeNull();
    expect(r.floor).toBeNull();
  });

  it("returns building without floor when only a name follows the block", () => {
    const r = separateBuilding("東京都港区六本木6-10-1 森タワー");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBe("森タワー");
    expect(r.floor).toBeNull();
  });

  it("returns floor without building when only a floor follows the block", () => {
    const r = separateBuilding("東京都港区六本木6-10-1 42F");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBeNull();
    expect(r.floor).toBe("42F");
  });

  it("handles extra whitespace between block and building", () => {
    const r = separateBuilding("東京都港区六本木6-10-1   森タワー  42F");
    expect(r.streetAddress).toBe("東京都港区六本木6-10-1");
    expect(r.building).toBe("森タワー");
    expect(r.floor).toBe("42F");
  });
});

describe("separateBuilding — no block detection", () => {
  it("returns input as streetAddress when only prefecture is present", () => {
    const r = separateBuilding("東京都");
    expect(r.streetAddress).toBe("東京都");
    expect(r.building).toBeNull();
    expect(r.floor).toBeNull();
  });

  it("returns input as streetAddress when only city is present", () => {
    const r = separateBuilding("東京都港区");
    expect(r.streetAddress).toBe("東京都港区");
    expect(r.building).toBeNull();
  });
});

describe("separateBuilding — edge cases", () => {
  it("returns empty for empty input", () => {
    const r = separateBuilding("");
    expect(r.streetAddress).toBe("");
    expect(r.building).toBeNull();
    expect(r.floor).toBeNull();
  });

  it("picks the LAST block match when multiple candidates exist", () => {
    // "1-2" が先頭付近、"5-6" が末尾近くにある → 末尾の 5-6 を採用
    const r = separateBuilding("大通1-2交差点付近の5-6 大きなビル");
    expect(r.streetAddress).toBe("大通1-2交差点付近の5-6");
    expect(r.building).toBe("大きなビル");
  });

  it("handles Japanese ordinal with 号室", () => {
    const r = separateBuilding("東京都港区六本木六丁目10番地1 タワー301号室");
    expect(r.building).toBe("タワー");
    expect(r.floor).toBe("301号室");
  });
});

/**
 * 郵便番号パーサの単体テスト
 *
 * 実装指示書 §3.2 に基づく:
 * - 全角/半角、ハイフン有無、〒マーク有無を吸収する
 * - 見つからない場合は null(エラーではない)
 * - 住所中の番地との誤抽出は避ける
 */
import { describe, it, expect } from "vitest";
import { extractPostalCode } from "../../src/services/postal-code-parser.js";

describe("extractPostalCode — 〒 prefix", () => {
  it("parses 〒 + hyphenated halfwidth", () => {
    const r = extractPostalCode("〒106-0032 東京都港区六本木6-10-1");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木6-10-1");
  });

  it("parses 〒 + non-hyphenated halfwidth", () => {
    const r = extractPostalCode("〒1060032 東京都港区六本木6-10-1");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木6-10-1");
  });

  it("parses 〒 + fullwidth digits and fullwidth hyphen", () => {
    const r = extractPostalCode("〒１０６−００３２ 東京都港区六本木");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木");
  });

  it("parses 〒 + katakana chōon as hyphen", () => {
    const r = extractPostalCode("〒106ー0032 東京都港区六本木");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木");
  });

  it("tolerates whitespace between 〒 and digits", () => {
    const r = extractPostalCode("〒 106-0032 東京都港区");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区");
  });
});

describe("extractPostalCode — boundary position (no 〒)", () => {
  it("parses leading 7 digits followed by space", () => {
    const r = extractPostalCode("106-0032 東京都港区六本木6-10-1");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木6-10-1");
  });

  it("parses leading 7 digits without hyphen", () => {
    const r = extractPostalCode("1060032 東京都港区六本木");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木");
  });

  it("parses trailing 7 digits", () => {
    const r = extractPostalCode("東京都港区六本木6-10-1 106-0032");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木6-10-1");
  });
});

describe("extractPostalCode — no-match cases", () => {
  it("returns null when no postal code is present", () => {
    const r = extractPostalCode("東京都港区六本木6-10-1");
    expect(r.postalCode).toBeNull();
    expect(r.remainder).toBe("東京都港区六本木6-10-1");
  });

  it("ignores 7-digit sequence inside block number (not at boundary)", () => {
    // 番地 "1-234567" のような稀な形式は郵便番号と見なさない
    const r = extractPostalCode("東京都港区六本木1-234567何か");
    expect(r.postalCode).toBeNull();
  });

  it("returns null for empty string", () => {
    const r = extractPostalCode("");
    expect(r.postalCode).toBeNull();
    expect(r.remainder).toBe("");
  });

  it("returns null for 6-digit (too short)", () => {
    const r = extractPostalCode("〒106003 東京都");
    // 〒 パターンは \d{3}-?\d{4} 固定のため 6 桁はマッチしない
    expect(r.postalCode).toBeNull();
  });

  it("returns null for 8-digit (too long, no hyphen)", () => {
    const r = extractPostalCode("10600321 東京都");
    expect(r.postalCode).toBeNull();
  });
});

describe("extractPostalCode — non-string input", () => {
  it("handles non-string gracefully", () => {
    // @ts-expect-error runtime safety
    const r = extractPostalCode(null);
    expect(r.postalCode).toBeNull();
  });
});

describe("extractPostalCode — remainder trimming", () => {
  it("collapses surrounding whitespace to a single space", () => {
    const r = extractPostalCode("東京都港区六本木   〒106-0032   ビル名");
    expect(r.postalCode).toBe("106-0032");
    expect(r.remainder).toBe("東京都港区六本木 ビル名");
  });

  it("leaves leading-only remainder without trailing space", () => {
    const r = extractPostalCode("〒106-0032 東京都");
    expect(r.remainder).toBe("東京都");
  });
});

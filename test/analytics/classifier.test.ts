/**
 * analytics/classifier.ts の単体テスト(住所 API 版)
 *
 * 暦 API (shirabe-calendar-api/test/analytics/classifier.test.ts) の
 * detectContentPlatform テストと同一シナリオを再現。両 API で同じ分類ロジックが
 * 動作することを担保する(cross-API SQL クエリの整合性保証)。
 *
 * 住所 API 側では Phase 1 骨格段階のため、暦 API の分類関数セット全体ではなく
 * 住所 API 側で新規に関心を持つ detectContentPlatform に限定して網羅する。
 * 他の分類関数(categorizeUserAgent / detectAIVendor / normalizePath 等)は
 * 暦 API のテストスイートで既に検証済み。
 */
import { describe, it, expect } from "vitest";
import { detectContentPlatform } from "../../src/analytics/classifier.js";

describe("detectContentPlatform (住所 API)", () => {
  it("Qiita(qiita.com)は qiita として分類される", () => {
    expect(detectContentPlatform("https://qiita.com/yosikawa-techwell/items/abc123")).toBe(
      "qiita"
    );
  });

  it("Qiita のサブドメイン(www.qiita.com)も qiita として分類される", () => {
    expect(detectContentPlatform("https://www.qiita.com/yosikawa-techwell")).toBe("qiita");
  });

  it("Zenn(zenn.dev)は zenn として分類される", () => {
    expect(detectContentPlatform("https://zenn.dev/some-author/articles/xyz")).toBe("zenn");
  });

  it("GitHub(github.com)は github として分類される", () => {
    expect(detectContentPlatform("https://github.com/techwell-inc-jp/shirabe-address-api")).toBe(
      "github"
    );
  });

  it("GitHub Pages(*.github.io)も github として分類される", () => {
    expect(detectContentPlatform("https://techwell-inc-jp.github.io/docs")).toBe("github");
  });

  it("Dev.to(dev.to)は devto として分類される", () => {
    expect(detectContentPlatform("https://dev.to/someuser/article-slug-123")).toBe("devto");
  });

  it("Medium(medium.com + パブリケーション)は medium として分類される", () => {
    expect(detectContentPlatform("https://medium.com/@user/article")).toBe("medium");
    expect(detectContentPlatform("https://engineering.medium.com/some-post")).toBe("medium");
  });

  it("note(note.com)は note として分類される", () => {
    expect(detectContentPlatform("https://note.com/someuser/n/abc123")).toBe("note");
  });

  it("未知のプラットフォーム(google.com 等)は other", () => {
    expect(detectContentPlatform("https://www.google.com/search?q=shirabe")).toBe("other");
    expect(detectContentPlatform("https://example.com/page")).toBe("other");
  });

  it("AI 検索ドメインは content_platform 観点では other(別 blob で判定)", () => {
    expect(detectContentPlatform("https://www.perplexity.ai/search?q=shirabe")).toBe("other");
    expect(detectContentPlatform("https://chatgpt.com/g/g-xxx")).toBe("other");
  });

  it("null / undefined / 空文字は none", () => {
    expect(detectContentPlatform(null)).toBe("none");
    expect(detectContentPlatform(undefined)).toBe("none");
    expect(detectContentPlatform("")).toBe("none");
  });

  it("不正な URL(URL parse 失敗)は none", () => {
    expect(detectContentPlatform("not-a-url")).toBe("none");
    expect(detectContentPlatform("qiita.com/no-scheme")).toBe("none");
  });

  it("ドメイン偽装に騙されない(qiita.evil.com は other)", () => {
    expect(detectContentPlatform("https://qiita.evil.com/phishing")).toBe("other");
    expect(detectContentPlatform("https://notqiita.com/xx")).toBe("other");
  });

  it("ホスト部のみ判定し、パス・クエリに影響されない", () => {
    expect(detectContentPlatform("https://qiita.com/?q=github.com")).toBe("qiita");
    expect(detectContentPlatform("https://zenn.dev/articles/medium.com-alternatives")).toBe(
      "zenn"
    );
  });
});

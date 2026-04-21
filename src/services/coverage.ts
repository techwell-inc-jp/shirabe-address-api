/**
 * Phase 1 対応可否判定(OUTSIDE_COVERAGE 事前チェック)
 *
 * 実装指示書 §2.4 + §4.2:
 * - Phase 1 の辞書には 6 都道府県(東京/神奈川/大阪/愛知/福岡/北海道)のみ収録
 * - それ以外の都道府県が入力された場合、Fly.io 呼び出し前に Workers で判定して
 *   `OUTSIDE_COVERAGE` エラーを返す(レイテンシと Fly.io 負荷の削減)
 *
 * 判定できない入力(都道府県名が含まれない部分住所 "渋谷区..." 等)は
 * `unknown` を返し、ルートハンドラが Fly.io に判断を委ねる。
 */
import {
  PHASE_1_COVERAGE,
  type Phase1Prefecture,
} from "../types/address.js";

/**
 * 都道府県名を検出する正規表現。
 * - `北海道` はリテラルで優先マッチ(2 文字 + 道 の一般形と紛れるため)
 * - それ以外は 2-3 文字 + `都/府/県`(青森県〜鹿児島県までカバー)
 *
 * 前後の文字は空白・数字・句読点以外を許容する(例: "東京都千代田区…" の東京都を検出)。
 */
const PREFECTURE_PATTERN = /(北海道|[^\s\d,.、。]{2,3}[都府県])/;

export type CoverageCheck =
  | { status: "in_coverage"; prefecture: Phase1Prefecture }
  | { status: "out_of_coverage"; prefecture: string }
  | { status: "unknown" };

const PHASE_1_SET: ReadonlySet<string> = new Set<string>(PHASE_1_COVERAGE);

/**
 * 入力住所の Phase 1 対応可否を返す。副作用なし。
 */
export function checkCoverage(input: string): CoverageCheck {
  if (typeof input !== "string" || input.length === 0) {
    return { status: "unknown" };
  }
  const match = input.match(PREFECTURE_PATTERN);
  if (!match) {
    return { status: "unknown" };
  }
  const prefecture = match[1] ?? "";
  if (PHASE_1_SET.has(prefecture)) {
    return {
      status: "in_coverage",
      prefecture: prefecture as Phase1Prefecture,
    };
  }
  return { status: "out_of_coverage", prefecture };
}

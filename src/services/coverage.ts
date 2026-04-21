/**
 * 対応都道府県判定(OUTSIDE_COVERAGE 事前チェック)
 *
 * 5/1 正式リリース以降は全 47 都道府県が対応範囲。
 * 本チェックは「都道府県らしい文字列が入力されたが、実在する都道府県名ではない」
 * ケース(例: "架空県", "テスト都")を Fly.io に流す前に OUTSIDE_COVERAGE で弾く
 * 防御層として機能する。
 *
 * 都道府県が検出できない入力("渋谷区..." 等の部分住所)は `unknown` を返し、
 * ルートハンドラが Fly.io に判断を委ねる(abr-geocoder の fuzzy match で拾える可能性)。
 */
import {
  SUPPORTED_PREFECTURES,
  type SupportedPrefecture,
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
  | { status: "in_coverage"; prefecture: SupportedPrefecture }
  | { status: "out_of_coverage"; prefecture: string }
  | { status: "unknown" };

const SUPPORTED_SET: ReadonlySet<string> = new Set<string>(SUPPORTED_PREFECTURES);

/**
 * 入力住所の対応可否を返す。副作用なし。
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
  if (SUPPORTED_SET.has(prefecture)) {
    return {
      status: "in_coverage",
      prefecture: prefecture as SupportedPrefecture,
    };
  }
  return { status: "out_of_coverage", prefecture };
}

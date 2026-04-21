/**
 * 郵便番号パーサ(Workers 側前処理)
 *
 * 実装指示書 §3.2:
 * > 入力文字列から `〒XXX-XXXX` を抽出・分離(Workers側で前処理)
 *
 * 日本の郵便番号は 7 桁(`XXX-XXXX`)。本モジュールは以下を吸収する:
 * - 〒 記号の有無(全角 U+3012)
 * - ハイフンの有無、半角 `-` / 全角 `−`(U+2212) / ダッシュ類 / `ー`(カタカナ長音)
 * - 全角数字 `０-９`
 * - 住所本体の前後どちらに郵便番号があっても抽出する(ただし 1 件目のみ)
 *
 * 見つからない場合は `postalCode: null` を返す(エラーではない)。
 * 見つかった場合は 1 箇所目を削除した残り文字列を `remainder` に返す。
 *
 * 誤抽出(住所中の番地 7 桁など)を避けるため、以下いずれかの条件を満たすものだけを採用する:
 * - 〒 記号が直前にある
 * - 入力文字列の **先頭 or 末尾**(前後は空白・句読点のみ)
 */

export type PostalCodeExtractResult = {
  /** "XXX-XXXX" 形式に正規化した郵便番号。見つからない場合は null */
  postalCode: string | null;
  /** 元の入力から郵便番号部分(および直前の〒と直後の空白 1 つ)を取り除いた残り文字列 */
  remainder: string;
};

const POSTAL_MARK = "〒";

/**
 * 全角英数・全角記号を半角に揃え、**数字に挟まれたダッシュ類のみ** 半角ハイフンに正規化する。
 *
 * NFKC は `６` や `−`(U+2212) を半角化するが、`ー`(U+30FC カタカナ長音)や
 * en/em ダッシュは対象外。これらは建物名 "タワー" 等で正当に出現するため、
 * 数字に挟まれた場合にのみ置換することで住所本体と建物名の双方を破壊しない。
 */
function normalizeInput(input: string): string {
  const nfkc = input.normalize("NFKC");
  // U+2212 MINUS SIGN は NFKC の対象外のため明示的に含める。
  return nfkc.replace(/(?<=\d)[ー−‐‑‒–—―](?=\d)/g, "-");
}

/**
 * 入力文字列から郵便番号を抽出する。副作用なし。
 */
export function extractPostalCode(input: string): PostalCodeExtractResult {
  if (typeof input !== "string" || input.length === 0) {
    return { postalCode: null, remainder: input };
  }

  const normalized = normalizeInput(input);

  // 〒 プレフィックス付きパターンを最優先で検出
  const markedPattern = /〒\s*(\d{3})-?(\d{4})/;
  const marked = normalized.match(markedPattern);
  if (marked) {
    const postal = `${marked[1]}-${marked[2]}`;
    const remainder = stripMatch(normalized, marked[0]);
    return { postalCode: postal, remainder };
  }

  // 先頭・末尾境界の 7 桁パターン(周囲が空白・句読点・記号のみ)
  const boundaryPattern = /(?:^|[\s、,.。])(\d{3})-?(\d{4})(?=[\s、,.。]|$)/;
  const boundary = normalized.match(boundaryPattern);
  if (boundary) {
    const postal = `${boundary[1]}-${boundary[2]}`;
    // 先頭マッチは match[0] に先頭の空白が含まれる(あれば)ため、
    // 数字部分だけを削除して先頭/末尾の区切り文字は残す
    const numeric = boundary[0].replace(/^[\s、,.。]/, "");
    const remainder = stripMatch(normalized, numeric);
    return { postalCode: postal, remainder };
  }

  return { postalCode: null, remainder: input };
}

function stripMatch(source: string, needle: string): string {
  const index = source.indexOf(needle);
  if (index === -1) return source;
  const before = source.slice(0, index);
  const after = source.slice(index + needle.length);
  // 郵便番号の前後にあった単一の空白 / 全角スペース / `-` を 1 つだけ吸収して結合する
  const beforeTrimmed = before.replace(/[\s　]+$/, "");
  const afterTrimmed = after.replace(/^[\s　]+/, "");
  if (beforeTrimmed.length > 0 && afterTrimmed.length > 0) {
    return `${beforeTrimmed} ${afterTrimmed}`;
  }
  return `${beforeTrimmed}${afterTrimmed}`;
}

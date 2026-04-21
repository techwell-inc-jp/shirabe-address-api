/**
 * 建物名・階数分離(Workers 側前処理)
 *
 * 実装指示書 §3.2:
 * > 番地以降のテキストを building / floor に分割(Workers側で後処理)
 *
 * 用途:
 * - 生ユーザー入力 "東京都港区六本木6-10-1 六本木ヒルズ森タワー42F" を
 *   - Fly.io(abr-geocoder)に渡す住所部分 "東京都港区六本木6-10-1"
 *   - レスポンス合成に使う building "六本木ヒルズ森タワー" / floor "42F"
 *   に分離する。abr-geocoder は建物名を扱わないため、前処理で取り除く
 *
 * 分離できない(建物名らしき部分が無い)場合は入力をそのまま `streetAddress` に
 * 返す(エラーではない)。
 *
 * 対応する番地表現:
 *   - アラビア数字 + ハイフン: "6-10-1", "1-2"
 *   - 日本語形式: "6丁目10番地1号", "六丁目10番1号", "1丁目1番1"
 *   - 混在: "6丁目10-1", "10番地1号"
 *
 * 対応する階数・部屋表現:
 *   - "42F", "42階", "B1F", "B1階"
 *   - "101号室", "303号"
 */

export type BuildingSeparationResult = {
  /** 建物名より前の住所部分(番地まで)。分離不能時は入力そのもの */
  streetAddress: string;
  /** 建物名。抽出不能 / 未指定時は null */
  building: string | null;
  /** 階数・部屋番号。抽出不能 / 未指定時は null */
  floor: string | null;
};

function normalizeInput(input: string): string {
  // NFKC は全角数字 `６` → `6` や `−`(U+2212) → `-` を吸収する。
  // ただしカタカナ長音 `ー` や en/em ダッシュは NFKC 対象外 かつ
  // 建物名 "タワー" 等の正当な出現もあるため、**数字に挟まれた場合のみ** 置換する。
  const nfkc = input.normalize("NFKC");
  // U+2212 MINUS SIGN は NFKC の対象外のため明示的に含める。
  return nfkc.replace(/(?<=\d)[ー−‐‑‒–—―](?=\d)/g, "-");
}

/**
 * 番地パターン(最後のヒットが番地の終端と見なす)。
 * アラビア数字 + ハイフン区切りと、日本語ファミリ("丁目", "番", "番地", "号")の両形式を許容する。
 */
const BLOCK_PATTERNS: readonly RegExp[] = [
  // 日本語形式: \d+丁目\d+番(地)?(\d+号?)?
  /\d+丁目\d+番地?(?:\d+号?)?/g,
  // 混在: \d+番地\d+号 または \d+番\d+(?:号)?
  /\d+番地?\d+号?/g,
  // アラビア数字 + ハイフン: \d+(-\d+){1,2}
  /\d+(?:-\d+){1,2}/g,
];

const FLOOR_PATTERN =
  /(?:[Bb]?\d+\s*(?:F|階)|[Bb]\d+\s*(?:F|階)|\d+\s*号室?)/;

/**
 * 住所文字列から建物・階数を分離する。副作用なし。
 */
export function separateBuilding(input: string): BuildingSeparationResult {
  if (typeof input !== "string" || input.length === 0) {
    return { streetAddress: input, building: null, floor: null };
  }

  const normalized = normalizeInput(input).trim();

  // 最後尾に最も近い番地パターンを探す
  const lastBlock = findLastBlockMatch(normalized);
  if (!lastBlock) {
    return { streetAddress: normalized, building: null, floor: null };
  }

  const splitIndex = lastBlock.end;
  const streetAddress = normalized.slice(0, splitIndex).trimEnd();
  const tail = normalized.slice(splitIndex).trim();

  if (tail.length === 0) {
    return { streetAddress, building: null, floor: null };
  }

  // 末尾の階数・部屋番号を抽出
  const floorMatch = tail.match(FLOOR_PATTERN);
  if (floorMatch && floorMatch.index !== undefined) {
    const floor = normalizeFloor(floorMatch[0]);
    const building = tail.slice(0, floorMatch.index).trim();
    return {
      streetAddress,
      building: building.length > 0 ? building : null,
      floor,
    };
  }

  return { streetAddress, building: tail, floor: null };
}

type BlockMatch = { start: number; end: number; text: string };

function findLastBlockMatch(input: string): BlockMatch | null {
  let best: BlockMatch | null = null;
  for (const pattern of BLOCK_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(input)) !== null) {
      const candidate: BlockMatch = {
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
      };
      if (!best || candidate.end > best.end) {
        best = candidate;
      }
    }
  }
  return best;
}

function normalizeFloor(raw: string): string {
  // "42 F" / "42Ｆ" / "42階" → 空白除去、大文字化、階/F の揃え
  const compact = raw.replace(/\s+/g, "");
  // 表記は入力の雰囲気を尊重(F / 階 / 号室 のまま)。大文字化のみ。
  return compact.replace(/f/g, "F").replace(/ｂ/gi, "B").replace(/b/g, "B");
}

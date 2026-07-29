/**
 * How much room a string needs.
 *
 * Two jobs, both arithmetic that Excel would normally do for us and cannot:
 *
 * - **Column widths** are measured in characters of the default font, so sizing a column means
 *   counting characters — and an East Asian glyph occupies about two of them. A label translated
 *   into Korean in a column sized for its English original is clipped.
 * - **Row heights** for wrapped text. Excel autofits a wrapped cell, but **not a merged one**, and
 *   a laid-out sheet merges almost every prose cell. So the height has to be computed before the
 *   file is written, and if it is short the text is silently cut off with nothing to notice.
 *
 * Both err generous. A row half a line taller than it needed costs a little whitespace; a row half a
 * line short loses a sentence, invisibly.
 */

/** Points per line of 11pt text, which is Excel's own default row height. */
export const LINE_HEIGHT = 15;

/**
 * A margin on the computed height, as a fraction of a line.
 *
 * A genuine margin now, not a fudge: the count below wraps the way Excel does, so this covers the
 * remaining difference between our character widths and the font's real advance widths rather than a
 * systematic under-count.
 */
const SLACK_LINES = 0.35;

/**
 * Excel's tallest row, in points.
 *
 * A larger `ht` is not honoured — Excel reinterprets it, so writing one trades an honest tall row for
 * a silently clipped one plus a value the file should not contain. Prose that needs more than this
 * cannot be shown in full in any single row, whatever we write.
 */
export const MAX_ROW_HEIGHT = 409;

/**
 * Ranges whose characters occupy two columns rather than one — East Asian Wide and Fullwidth, per
 * Unicode's East Asian Width property. Not exhaustive over every plane, but it covers the scripts
 * this workbook is translated into: Chinese, Japanese, Korean, and fullwidth Latin.
 *
 * Emoji are approximate and deliberately so. A single pictograph counts as wide, but a sequence that
 * renders as one glyph — a flag built from two regional indicators, a family joined by ZWJ — is
 * counted per code point. Being a column out on an emoji in a deal review is not worth a grapheme
 * segmenter; being a column out on a Korean label is, which is what the ranges below are for.
 */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo initial consonants
  [0x2e80, 0x303e], // CJK Radicals, Kangxi, CJK Symbols and Punctuation
  [0x3041, 0x33ff], // Hiragana, Katakana, Bopomofo, Hangul Compatibility Jamo, CJK Compatibility
  [0x3400, 0x4dbf], // CJK Unified Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical forms
  [0xfe30, 0xfe6f], // CJK Compatibility Forms
  [0xff00, 0xff60], // Fullwidth forms — NB: excludes halfwidth Katakana at FF61-FFDC
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f300, 0x1f64f], // Pictographs and emoticons
  [0x1f900, 0x1f9ff], // Supplemental symbols and pictographs
  [0x20000, 0x3fffd], // CJK Unified Extensions B and beyond
];

function isWide(codePoint: number): boolean {
  for (const [low, high] of WIDE_RANGES) {
    if (codePoint >= low && codePoint <= high) return true;
  }
  return false;
}

/**
 * Width in column-units: one per ordinary character, two per East Asian wide one.
 *
 * Iterates code points, not UTF-16 units, so a character outside the BMP counts once rather than
 * twice for being a surrogate pair.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

/**
 * How many lines `text` takes in a cell `columnWidth` characters wide.
 *
 * Wraps **on word boundaries**, which is what Excel does, filling each line greedily and breaking a
 * single word that is too long for a line of its own. Dividing the total width by the column width
 * instead — which this did at first — systematically under-counts whenever words cannot share a line:
 * twenty thirty-character tokens in a forty-two-character cell need twenty lines and that arithmetic
 * allocates fifteen, so five lines of somebody's evidence are hidden in a merged cell that cannot
 * autofit to reveal them.
 *
 * Explicit newlines break lines of their own — including empty ones, which a deal's close plan uses
 * to separate milestones and which would otherwise vanish from the count.
 */
export function wrappedLineCount(text: string, columnWidth: number): number {
  const perLine = Math.max(1, Math.floor(columnWidth));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    if (displayWidth(paragraph) === 0) {
      lines += 1;
      continue;
    }
    let used = 0;
    for (const word of paragraph.split(/[ \t]+/).filter((w) => w !== '')) {
      const width = displayWidth(word);
      if (width > perLine) {
        // Too long for any line: finish the current one, then break the word across whole lines.
        if (used > 0) lines += 1;
        const full = Math.floor(width / perLine);
        lines += full;
        // What is left of the broken word sits at the start of the current line; the space before the
        // next word is charged by the ordinary path below, not twice here.
        used = width % perLine;
        continue;
      }
      const needed = used === 0 ? width : used + 1 + width;
      if (needed > perLine) {
        lines += 1;
        used = width;
      } else {
        used = needed;
      }
    }
    if (used > 0) lines += 1;
  }
  // No `Math.max(1, …)`: splitting on newlines always yields at least one paragraph and every
  // paragraph adds at least one line, so a floor here would be unreachable code pretending to guard.
  return lines;
}

/**
 * Row height in points for `text` wrapped into `columnWidth` characters, never below `floor`.
 *
 * Generous up to {@link MAX_ROW_HEIGHT} and no further. Prose in a deal review runs to paragraphs and
 * a tall row is honest where a short one hides the end of a sentence — but past Excel's own ceiling
 * there is no taller row to ask for, only a value it reinterprets.
 */
export function estimateRowHeight(text: string, columnWidth: number, floor: number): number {
  const lines = wrappedLineCount(text, columnWidth);
  const needed = Math.ceil((lines + SLACK_LINES) * LINE_HEIGHT);
  return Math.min(MAX_ROW_HEIGHT, Math.max(floor, needed));
}

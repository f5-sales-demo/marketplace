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
 * Excel wraps on word boundaries; this counts characters. A long word pushed to the next line makes
 * the real line count higher than the arithmetic predicts, and the arithmetic is what gets written.
 */
const SLACK_LINES = 0.35;

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
 * Explicit newlines break lines of their own — including empty ones, which a deal's close plan uses
 * to separate milestones and which would otherwise vanish from the count.
 */
export function wrappedLineCount(text: string, columnWidth: number): number {
  const perLine = Math.max(1, Math.floor(columnWidth));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    const width = displayWidth(paragraph);
    lines += width === 0 ? 1 : Math.ceil(width / perLine);
  }
  // No `Math.max(1, …)`: splitting on newlines always yields at least one paragraph and every
  // paragraph adds at least one line, so a floor here would be unreachable code pretending to guard.
  return lines;
}

/**
 * Row height in points for `text` wrapped into `columnWidth` characters, never below `floor`.
 *
 * Deliberately uncapped. Prose in a deal review runs to paragraphs, and a tall row is honest where a
 * capped one hides the end of a sentence.
 */
export function estimateRowHeight(text: string, columnWidth: number, floor: number): number {
  const lines = wrappedLineCount(text, columnWidth);
  const needed = Math.ceil((lines + SLACK_LINES) * LINE_HEIGHT);
  return Math.max(floor, needed);
}

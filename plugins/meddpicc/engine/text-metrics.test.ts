import { describe, expect, test } from 'bun:test';
import { displayWidth, estimateRowHeight, LINE_HEIGHT, MAX_ROW_HEIGHT, wrappedLineCount } from './text-metrics';

describe('displayWidth', () => {
  test('counts a Latin string by its characters', () => {
    expect(displayWidth('Account Name')).toBe(12);
    expect(displayWidth('')).toBe(0);
  });

  test('counts an East Asian character as two', () => {
    // Column widths are measured in characters of the default font, and a CJK glyph occupies about
    // two of them. Counting them as one is why a translated label would be clipped by a column
    // sized for its English original.
    expect(displayWidth('고객사명')).toBe(8);
    expect(displayWidth('顧客名')).toBe(6);
    expect(displayWidth('日本語')).toBe(6);
  });

  test('counts a mixed string by parts', () => {
    expect(displayWidth('ACV 금액')).toBe(4 + 4);
  });

  test('counts a character outside the BMP once, not once per surrogate', () => {
    // U+1D400 is a NARROW character stored as two UTF-16 units. A wide astral character cannot
    // show this bug: iterating units would give 1+1 = 2, which is the right answer by accident.
    expect('𝐀'.length).toBe(2);
    expect(displayWidth('𝐀')).toBe(1);
    expect(displayWidth('a𝐀b')).toBe(3);
    // And a wide one still counts two, from one code point rather than two surrogates.
    expect(displayWidth('𠀋')).toBe(2);
  });

  test('half-width Katakana stays narrow, full-width Latin does not', () => {
    expect(displayWidth('ｱｲｳ')).toBe(3);
    expect(displayWidth('ＡＢＣ')).toBe(6);
  });
});

describe('wrappedLineCount', () => {
  test('a short string is one line', () => {
    expect(wrappedLineCount('Example Corp', 20)).toBe(1);
  });

  test('wraps on the column width', () => {
    expect(wrappedLineCount('a'.repeat(40), 20)).toBe(2);
    expect(wrappedLineCount('a'.repeat(41), 20)).toBe(3);
  });

  test('an explicit newline starts a line, even mid-paragraph', () => {
    expect(wrappedLineCount('one\ntwo\nthree', 20)).toBe(3);
    expect(wrappedLineCount(`${'a'.repeat(30)}\nshort`, 20)).toBe(3);
  });

  test('a blank line still occupies a line', () => {
    expect(wrappedLineCount('one\n\ntwo', 20)).toBe(3);
  });

  test('an empty string is one line, not zero', () => {
    expect(wrappedLineCount('', 20)).toBe(1);
  });

  test('a CJK string wraps at half as many characters', () => {
    // Ten wide glyphs occupy twenty columns, so they fill a 20-wide cell exactly.
    expect(wrappedLineCount('고'.repeat(10), 20)).toBe(1);
    expect(wrappedLineCount('고'.repeat(11), 20)).toBe(2);
  });

  test('a width of zero or less does not divide by zero', () => {
    // `> 0` was not enough: dividing by zero gives Infinity, which is greater than zero and would
    // then be written into the file as a row height of "Infinity".
    for (const width of [0, -5]) {
      const lines = wrappedLineCount('anything', width);
      expect(Number.isFinite(lines), `width ${width}`).toBe(true);
      expect(lines).toBeGreaterThan(0);
      expect(lines).toBeLessThanOrEqual('anything'.length);
    }
    expect(Number.isFinite(estimateRowHeight('anything', 0, 15))).toBe(true);
  });
});

describe('estimateRowHeight', () => {
  test('one line is the single-line height', () => {
    expect(estimateRowHeight('Example Corp', 20, 24)).toBe(24);
  });

  test('never returns less than the floor, however short the text', () => {
    expect(estimateRowHeight('', 20, 24)).toBe(24);
    expect(estimateRowHeight('x', 200, 30)).toBe(30);
  });

  test('grows a line at a time', () => {
    const two = estimateRowHeight('a'.repeat(40), 20, 24);
    const three = estimateRowHeight('a'.repeat(60), 20, 24);
    expect(three - two).toBe(LINE_HEIGHT);
  });

  test('rounds up rather than down', () => {
    // Excel does not autofit a merged cell, so an underestimate clips the text and there is no
    // second chance. A blank half-line costs nothing; a missing word is invisible.
    const height = estimateRowHeight('a'.repeat(21), 20, 15);
    expect(height).toBeGreaterThanOrEqual(2 * LINE_HEIGHT);
  });

  test('leaves headroom above the bare line count', () => {
    // Wrapping is word-aware in Excel and character-count here, so a line break can land earlier
    // than this arithmetic predicts. The estimate carries a margin for that.
    const words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet';
    const bare = wrappedLineCount(words, 20) * LINE_HEIGHT;
    expect(estimateRowHeight(words, 20, 15)).toBeGreaterThan(bare);
  });

  test('a long paragraph gets a genuinely tall row, up to what Excel allows', () => {
    // This asserted "not capped" while the estimator promised to be uncapped. Excel's own maximum row
    // height is 409.5 points, so a taller `ht` was never honoured — it was reinterpreted, trading an
    // honest tall row for a silently clipped one. Generous up to the ceiling is the keepable promise.
    const long = estimateRowHeight('a'.repeat(4000), 20, 24);
    expect(long).toBeGreaterThan(24 * 4);
    expect(long).toBeLessThanOrEqual(MAX_ROW_HEIGHT);
  });
});

describe('wrapping happens on word boundaries, as Excel does it', () => {
  test('words that cannot share a line each take one', () => {
    // Twenty 30-character tokens in a 42-character cell. Character arithmetic says
    // ceil(619 / 42) = 15 lines; Excel puts each token on its own line, because two of them plus a
    // space do not fit. Five lines of evidence hidden in a merged cell that cannot autofit.
    const token = 'x'.repeat(30);
    const text = Array.from({ length: 20 }, () => token).join(' ');
    expect(wrappedLineCount(text, 42)).toBe(20);
  });

  test('words that do share a line are packed, not counted one each', () => {
    // The opposite error: a line per word would make every ordinary paragraph enormous.
    expect(wrappedLineCount('a b c d e f g h', 20)).toBe(1);
    expect(wrappedLineCount('aaaa bbbb cccc dddd', 10)).toBe(2);
  });

  test('a single word longer than the line is broken across lines', () => {
    // Excel breaks it rather than overflowing, so the count has to as well.
    expect(wrappedLineCount('x'.repeat(100), 10)).toBe(10);
    expect(wrappedLineCount('x'.repeat(101), 10)).toBe(11);
  });

  test('a wide character still counts as two columns when wrapping by word', () => {
    // Ten Hangul syllables are twenty columns wide, so they need two lines of ten.
    expect(wrappedLineCount('가'.repeat(10), 10)).toBe(2);
  });

  test('a narrower column never needs fewer lines', () => {
    // The property that has to hold whatever the wrapping rule is. Character arithmetic is NOT the
    // floor, incidentally: two forty-character words in an eight-wide cell take ten lines, while
    // dividing eighty-one characters by eight says eleven — a space at a line break costs nothing.
    const samples = [
      'short',
      'a somewhat longer sentence with several ordinary words in it',
      `${'y'.repeat(40)} ${'z'.repeat(40)}`,
      'one\ntwo\nthree',
      '가'.repeat(30),
    ];
    for (const text of samples) {
      const widths = [80, 42, 20, 13, 8];
      for (let i = 1; i < widths.length; i++) {
        expect(
          wrappedLineCount(text, widths[i]),
          `${text.slice(0, 20)} at ${widths[i]} vs ${widths[i - 1]}`,
        ).toBeGreaterThanOrEqual(wrappedLineCount(text, widths[i - 1]));
      }
    }
  });
});

describe('estimateRowHeight and Excel’s own ceiling', () => {
  test('a row never asks for more than Excel can give', () => {
    // Excel's maximum row height is 409.5 points. A larger `ht` is not honoured — the promise to err
    // generous stops being keepable there, so the value written has to be one Excel accepts rather
    // than one it silently reinterprets.
    const huge = 'word '.repeat(4000);
    expect(estimateRowHeight(huge, 20, 24)).toBeLessThanOrEqual(MAX_ROW_HEIGHT);
    expect(estimateRowHeight(huge, 20, 24)).toBe(MAX_ROW_HEIGHT);
  });

  test('an ordinary prose cell is nowhere near the ceiling', () => {
    // Otherwise the cap above would be doing the work in the normal case, and the estimate would be
    // meaningless rather than merely bounded.
    const ordinary = 'CTO confirmed the MTTR target in email 2026-04-15. Baseline data shared from the dashboard.';
    expect(estimateRowHeight(ordinary, 42, 24)).toBeLessThan(MAX_ROW_HEIGHT / 2);
  });
});

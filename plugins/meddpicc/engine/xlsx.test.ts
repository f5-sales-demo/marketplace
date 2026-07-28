import { describe, expect, test } from 'bun:test';
import { A1, buildWorkbook, columnLetter, STYLE_IDS } from './xlsx';
import { readZip } from './zip';

const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** The parts every .xlsx must carry for Excel to open it without offering to repair. */
const REQUIRED_PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/styles.xml',
  'xl/worksheets/sheet1.xml',
];

const minimal = () =>
  buildWorkbook([
    {
      name: 'Deal',
      rows: [
        { row: 1, cells: [{ ref: 'A1', value: 'MEDDPICC', style: 'title' }] },
        {
          row: 2,
          cells: [
            { ref: 'A2', value: 'Account', style: 'label' },
            { ref: 'B2', value: 'Visa, Inc.', style: 'text' },
          ],
        },
      ],
    },
  ]);

describe('columnLetter / A1', () => {
  test('maps 1-based indexes to spreadsheet columns', () => {
    expect([1, 26, 27, 52, 53].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA']);
  });
  test('A1 composes a reference', () => {
    expect(A1(2, 3)).toBe('B3');
  });
});

describe('buildWorkbook — container', () => {
  test('emits every part Excel requires', () => {
    const parts = readZip(minimal());
    for (const p of REQUIRED_PARTS) expect(parts.has(p)).toBe(true);
  });

  test('[Content_Types] declares an override for every sheet it ships', () => {
    // A sheet present in the zip but missing from [Content_Types] is the single most
    // common way a hand-written xlsx makes Excel offer to repair it.
    const parts = readZip(
      buildWorkbook([
        { name: 'Deal', rows: [] },
        { name: 'Scorecard', rows: [] },
      ]),
    );
    const ct = dec(parts.get('[Content_Types].xml')?.data as Uint8Array);
    expect(ct).toContain('/xl/worksheets/sheet1.xml');
    expect(ct).toContain('/xl/worksheets/sheet2.xml');
    expect(parts.has('xl/worksheets/sheet2.xml')).toBe(true);
  });

  test('every sheet in workbook.xml has a matching relationship id', () => {
    const parts = readZip(
      buildWorkbook([
        { name: 'Deal', rows: [] },
        { name: 'Scorecard', rows: [] },
      ]),
    );
    const wb = dec(parts.get('xl/workbook.xml')?.data as Uint8Array);
    const rels = dec(parts.get('xl/_rels/workbook.xml.rels')?.data as Uint8Array);
    for (const id of [...wb.matchAll(/r:id="(rId\d+)"/g)].map((m) => m[1])) {
      expect(rels).toContain(`Id="${id}"`);
    }
  });

  test('sheet names are XML-escaped, not injected raw', () => {
    const parts = readZip(buildWorkbook([{ name: 'A & B <deal>', rows: [] }]));
    const wb = dec(parts.get('xl/workbook.xml')?.data as Uint8Array);
    expect(wb).toContain('A &amp; B &lt;deal&gt;');
    expect(wb).not.toContain('<deal>');
  });
});

describe('buildWorkbook — cells', () => {
  test('writes a string as an inline string, so sharedStrings is never needed', () => {
    const sheet = dec(readZip(minimal()).get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('<t xml:space="preserve">Visa, Inc.</t>');
  });

  test('writes a number bare, so the sheet can compute on it', () => {
    const sheet = dec(
      readZip(
        buildWorkbook([{ name: 'S', rows: [{ row: 1, cells: [{ ref: 'A1', value: 473687, style: 'currency' }] }] }]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    expect(sheet).toContain('<v>473687</v>');
    expect(sheet).not.toContain('inlineStr');
  });

  test('writes a formula as <f> with no cached value', () => {
    // No <v>: Excel computes on open. A stale cached value would be worse than none.
    const sheet = dec(
      readZip(buildWorkbook([{ name: 'S', rows: [{ row: 1, cells: [{ ref: 'A1', formula: 'SUM(B1:B8)' }] }] }])).get(
        'xl/worksheets/sheet1.xml',
      )?.data as Uint8Array,
    );
    expect(sheet).toContain('<f>SUM(B1:B8)</f>');
    expect(sheet).not.toMatch(/<f>SUM\(B1:B8\)<\/f><v>/);
  });

  test('escapes text and formulas that contain XML metacharacters', () => {
    const sheet = dec(
      readZip(
        buildWorkbook([
          {
            name: 'S',
            rows: [
              {
                row: 1,
                cells: [
                  { ref: 'A1', value: 'A & B <x>' },
                  { ref: 'B1', formula: 'IF(A1<5,"lo","hi")' },
                ],
              },
            ],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    expect(sheet).toContain('A &amp; B &lt;x&gt;');
    expect(sheet).toContain('IF(A1&lt;5,&quot;lo&quot;,&quot;hi&quot;)');
  });

  test('a named style resolves to its index in styles.xml', () => {
    const sheet = dec(
      minimal().length ? (readZip(minimal()).get('xl/worksheets/sheet1.xml')?.data as Uint8Array) : new Uint8Array(),
    );
    expect(sheet).toContain(`s="${STYLE_IDS.title}"`);
    expect(sheet).toContain(`s="${STYLE_IDS.label}"`);
  });

  test('rejects an unknown style name rather than emitting a wrong index', () => {
    // A bad index silently mis-styles a cell, or makes Excel reject the file — the one
    // failure mode of a hand-written styles.xml, so it fails loudly at build time.
    expect(() =>
      buildWorkbook([{ name: 'S', rows: [{ row: 1, cells: [{ ref: 'A1', value: 'x', style: 'nope' as never }] }] }]),
    ).toThrow(/nope/);
  });
});

describe('styles.xml', () => {
  test('declares exactly as many cellXfs as the palette names', () => {
    // The mapping from name to index is positional; a mismatch here means every style
    // after the gap is silently wrong.
    const styles = dec(readZip(minimal()).get('xl/styles.xml')?.data as Uint8Array);
    const count = Number(styles.match(/<cellXfs count="(\d+)"/)?.[1]);
    expect(count).toBe(Object.keys(STYLE_IDS).length);
    expect([...styles.matchAll(/<xf /g)].length).toBeGreaterThanOrEqual(count);
  });

  test('every custom numFmtId referenced by a cellXf is defined', () => {
    const styles = dec(readZip(minimal()).get('xl/styles.xml')?.data as Uint8Array);
    const defined = new Set([...styles.matchAll(/<numFmt numFmtId="(\d+)"/g)].map((m) => m[1]));
    const cellXfs = styles.slice(styles.indexOf('<cellXfs'));
    for (const m of cellXfs.matchAll(/numFmtId="(\d+)"/g)) {
      const id = Number(m[1]);
      if (id >= 164) expect(defined.has(String(id))).toBe(true); // 164+ is the custom range
    }
  });
});

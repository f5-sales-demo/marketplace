import { describe, expect, test } from 'bun:test';
import { enumLabel } from './labels';
import { A1, buildWorkbook, type CfPreset, columnIndex, columnLetter, DXF_IDS, expandMerges, STYLE_IDS } from './xlsx';
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

  test("refuses a formula past Excel's own limit", () => {
    // Past 8192 characters Excel does not warn: it prompts to repair the file and the cell comes back
    // empty. A compiled rule is the realistic way to reach it — the completion statuses are already a
    // third of the way there — so the writer refuses rather than shipping a file that opens broken.
    const long = `IF(${'A1+'.repeat(3000)}0,1,2)`;
    expect(long.length).toBeGreaterThan(8192);
    expect(() => buildWorkbook([{ name: 'S', rows: [{ row: 1, cells: [{ ref: 'B1', formula: long }] }] }])).toThrow(
      /8192/,
    );
    // And one inside the limit is written without complaint.
    const short = `IF(${'A1+'.repeat(100)}0,1,2)`;
    expect(() =>
      buildWorkbook([{ name: 'S', rows: [{ row: 1, cells: [{ ref: 'B1', formula: short }] }] }]),
    ).not.toThrow();
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

describe('buildWorkbook — conditional formatting and validation', () => {
  const withExtras = () =>
    buildWorkbook([
      {
        name: 'Data',
        rows: [
          {
            row: 1,
            cells: [
              { ref: 'A1', value: 'Name', style: 'columnHeader' },
              { ref: 'B1', value: 'Score', style: 'columnHeader' },
            ],
          },
          {
            row: 2,
            cells: [
              { ref: 'A2', value: 'x' },
              { ref: 'B2', value: 1, style: 'score' },
            ],
          },
          { row: 3, cells: [{ ref: 'A3' }, { ref: 'B3', style: 'score' }] },
        ],
        conditionalFormats: [{ sqref: 'B2:B3', preset: 'score' }],
        validations: [{ sqref: 'B2:B3', values: ['0', '1', '2', '3', '4'] }],
        print: { orientation: 'landscape', fitToWidth: true },
      },
    ]);

  // CT_Worksheet is a SEQUENCE: sheetData, then conditionalFormatting, then dataValidations, then
  // the print group. Out of order is not a warning — Excel offers to repair the file.
  test('emits the worksheet children in the order the schema demands', () => {
    const sheet = dec(readZip(withExtras()).get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    const order = ['<sheetData>', '<conditionalFormatting', '<dataValidations', '<pageSetup'];
    const positions = order.map((tag) => sheet.indexOf(tag));
    for (const [i, p] of positions.entries()) expect(p, order[i]).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  // No Excel Tables, by design and not by omission: Excel silently DROPS a table whose range
  // contains a merged cell, and every span over one column on the laid-out sheet is a merge. So the
  // writer has no table support at all, and a workbook that grew one would be a workbook whose data
  // quietly stopped extending.
  test('ships no table part, relationship or content type', () => {
    const parts = readZip(withExtras());
    expect([...parts.keys()].filter((name) => /tables?/i.test(name))).toEqual([]);
    expect(parts.has('xl/worksheets/_rels/sheet1.xml.rels')).toBe(false);
    const ct = dec(parts.get('[Content_Types].xml')?.data as Uint8Array);
    expect(ct).not.toContain('spreadsheetml.table');
    const sheet = dec(parts.get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    expect(sheet).not.toContain('tableParts');
    expect(sheet).not.toContain('autoFilter');
  });

  test('every dxfId a rule cites is defined in styles.xml', () => {
    const parts = readZip(withExtras());
    const sheet = dec(parts.get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    const styles = dec(parts.get('xl/styles.xml')?.data as Uint8Array);
    const declared = Number(/<dxfs count="(\d+)"/.exec(styles)?.[1] ?? 0);
    expect(declared).toBeGreaterThan(0);
    const used = [...sheet.matchAll(/dxfId="(\d+)"/g)].map((m) => Number(m[1]));
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(id).toBeLessThan(declared);
  });

  test('a validation list is quoted the way Excel expects', () => {
    const sheet = dec(readZip(withExtras()).get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    expect(sheet).toContain('type="list"');
    expect(sheet).toContain('<formula1>&quot;0,1,2,3,4&quot;</formula1>');
  });

  test('a sheet with no extras emits none of those elements', () => {
    const sheet = dec(readZip(minimal()).get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    expect(sheet).not.toContain('conditionalFormatting');
    expect(sheet).not.toContain('dataValidations');
  });
});

describe('the delta preset colours a step backwards and nothing else', () => {
  // A change since the last review. Up used to be green and it is now unpainted, along with every
  // other piece of good news on the sheet: nought is not a warning either, so one rule is the whole
  // preset and a column of improvements reads as quiet.
  const rules = () => {
    const xml = dec(
      readZip(
        buildWorkbook([
          {
            name: 'Data',
            rows: [
              { row: 1, cells: [{ ref: 'A1', value: 2, style: 'score' }] },
              { row: 2, cells: [{ ref: 'A2', value: 0, style: 'score' }] },
            ],
            conditionalFormats: [{ sqref: 'A1:A2', preset: 'delta' }],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    return [...xml.matchAll(/<cfRule[^>]*operator="([a-zA-Z]+)"[^>]*>\s*<formula>([^<]*)<\/formula>/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
  };

  test('one rule, for movement downwards', () => {
    expect(rules()).toEqual(['lessThan 0']);
  });
});

describe('buildWorkbook — merges', () => {
  const merged = (merges: string[], extra: Parameters<typeof buildWorkbook>[0][number]['rows'] = []) =>
    dec(
      readZip(
        buildWorkbook([
          {
            name: 'Deal',
            merges,
            rows: [{ row: 2, cells: [{ ref: 'B2', value: 'MEDDPICC Deal Review', style: 'sectionHeader' }] }, ...extra],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );

  test('declares the range once, with a count', () => {
    const sheet = merged(['B2:Q2']);
    expect(sheet).toContain('<mergeCells count="1"><mergeCell ref="B2:Q2"/></mergeCells>');
  });

  test('every covered cell carries the anchor style, and only the anchor carries the value', () => {
    // Excel paints a merged range from the styles of all its cells, not the top-left alone:
    // style only the anchor and the banner's fill stops after one column and its border box
    // is left open. The sample workbook writes all sixteen cells of B2:Q2 with the same s=.
    const sheet = merged(['B2:E2']);
    const row = /<row r="2".*?<\/row>/s.exec(sheet)?.[0] ?? '';
    const cells = [...row.matchAll(/<c r="([A-Z]+2)"([^>]*?)(\/>|>(.*?)<\/c>)/g)].map((m) => ({
      ref: m[1],
      attrs: m[2],
      body: m[4] ?? '',
    }));
    expect(cells.map((c) => c.ref)).toEqual(['B2', 'C2', 'D2', 'E2']);
    const anchorStyle = `s="${STYLE_IDS.sectionHeader}"`;
    for (const c of cells) expect(c.attrs).toContain(anchorStyle);
    expect(cells[0].body).toContain('MEDDPICC Deal Review');
    for (const c of cells.slice(1)) expect(c.body).toBe('');
  });

  test('a vertical merge fills the rows below, creating them if the caller did not', () => {
    const sheet = merged(['B2:B4']);
    expect(sheet).toContain('<row r="3"');
    expect(sheet).toContain('<row r="4"');
    for (const ref of ['B3', 'B4']) expect(sheet).toContain(`<c r="${ref}" s="${STYLE_IDS.sectionHeader}"/>`);
  });

  test('rows stay in ascending order once a merge has created some', () => {
    // sheetData is a sequence: Excel repairs a file whose rows descend.
    const sheet = merged(['B2:B6'], [{ row: 9, cells: [{ ref: 'B9', value: 'later' }] }]);
    const order = [...sheet.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order).toContain(9);
  });

  test('cells stay in ascending column order once merges have added some', () => {
    // A merge declared after one further right appends its filled cells behind them, so the
    // row ends up C after D unless it is re-sorted. Excel repairs a row whose cells descend.
    const sheet = dec(
      readZip(
        buildWorkbook([
          {
            name: 'Deal',
            merges: ['D2:E2', 'B2:C2'],
            rows: [
              {
                row: 2,
                cells: [
                  { ref: 'B2', value: 'left', style: 'fieldLabel' },
                  { ref: 'D2', value: 'right', style: 'fieldLabel' },
                ],
              },
            ],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    const row = /<row r="2".*?<\/row>/s.exec(sheet)?.[0] ?? '';
    const cols = [...row.matchAll(/<c r="([A-Z]+)2"/g)].map((m) => columnIndex(m[1]));
    expect(cols).toEqual([2, 3, 4, 5]);
  });

  test('refuses a merge with no cell to anchor it', () => {
    expect(() => merged(['D8:F8'])).toThrow(/D8:F8/);
  });

  test('refuses two merges that overlap, naming both', () => {
    expect(() => merged(['B2:E2', 'D2:G2'])).toThrow(/B2:E2[\s\S]*D2:G2|D2:G2[\s\S]*B2:E2/);
  });

  test('refuses a merge that would hide a value the caller wrote', () => {
    // A value in a covered cell is invisible once merged. Silently dropping it is how two
    // sections that overlap by one row look fine and lose a field.
    expect(() => merged(['B2:B3'], [{ row: 3, cells: [{ ref: 'B3', value: 'hidden' }] }])).toThrow(/B3/);
  });

  test('refuses a malformed range', () => {
    for (const bad of ['B2', 'B2:', 'not-a-ref', '2B:4C']) {
      expect(() => merged([bad])).toThrow(/is not a range/);
    }
  });

  test('refuses a range written bottom-right first', () => {
    // Assert the REASON, not merely that it threw: an inverted range whose anchor happens to
    // be absent throws the anchor error instead, which let a missing bounds check survive.
    for (const bad of ['B2:A2', 'B2:B1']) {
      expect(() => merged([bad])).toThrow(/runs backwards/);
    }
  });

  test("refuses a range outside Excel's grid", () => {
    // Syntax and direction are not enough: A0, XFE and row 1048577 are all well-formed and
    // are not cells, and the writer would materialise them into a file Excel must repair.
    for (const bad of ['A0:B0', 'XFE1:XFF1', 'A1048576:A1048577']) {
      expect(() => merged([bad]), bad).toThrow(/outside Excel's grid/);
    }
  });

  test('refuses a merge too large to materialise, rather than not responding', () => {
    // A1:XFD1048576 is valid, in bounds, and seventeen billion cells. Without a cap the writer
    // does not fail — it stops responding, which is the one failure mode with no message.
    expect(() => merged(['A1:XFD1048576'])).toThrow(/covers 17179869184 cells/);
  });

  test('refuses a sheet that declares the same row twice', () => {
    expect(() =>
      buildWorkbook([
        {
          name: 'S',
          merges: ['A1:B1'],
          rows: [
            { row: 1, cells: [{ ref: 'A1', value: 'x' }] },
            { row: 1, cells: [{ ref: 'C1', value: 'y' }] },
          ],
        },
      ]),
    ).toThrow(/row 1 twice/);
  });

  test("leaves the caller's cells untouched", () => {
    // The rows and their arrays are copied; the cell objects are not, so a fill that mutated
    // one in place would edit the spec the caller still holds.
    const anchor = { ref: 'B2', value: 'Banner', style: 'sectionHeader' as const };
    const blank = { ref: 'C2', style: 'default' as const };
    const spec = { name: 'Deal', merges: ['B2:C2'], rows: [{ row: 2, cells: [anchor, blank] }] };
    expandMerges(spec);
    expect(blank).toStrictEqual({ ref: 'C2', style: 'default' });
    expect(spec.rows[0].cells).toHaveLength(2);
  });

  test('a single-cell range is not a merge', () => {
    expect(() => merged(['B2:B2'])).toThrow(/B2:B2/);
  });
});

describe('buildWorkbook — presentation', () => {
  const presented = (extra: Partial<Parameters<typeof buildWorkbook>[0][number]>) =>
    dec(
      readZip(
        buildWorkbook([
          {
            name: 'Deal',
            rows: [{ row: 1, cells: [{ ref: 'B1', value: 'Deal Review', style: 'sectionHeader' }] }],
            ...extra,
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );

  test('hides the grid on request, and leaves it alone otherwise', () => {
    expect(presented({ hideGridlines: true })).toContain('showGridLines="0"');
    expect(presented({})).not.toContain('showGridLines');
  });

  test('opens at the requested zoom so the full width is visible', () => {
    const sheet = presented({ zoom: 75 });
    expect(sheet).toContain('zoomScale="75"');
    expect(sheet).toContain('zoomScaleNormal="75"');
    expect(presented({})).not.toContain('zoomScale');
  });

  test('refuses a zoom Excel would reject', () => {
    for (const bad of [0, 9, 401, 1.5]) expect(() => presented({ zoom: bad })).toThrow(/zoom/i);
  });

  test('emits print setup, escaping the header text', () => {
    const sheet = presented({ print: { orientation: 'landscape', fitToWidth: true, header: ['Visa & Co'] } });
    expect(sheet).toContain('<pageSetup');
    expect(sheet).toContain('orientation="landscape"');
    expect(sheet).toContain('fitToWidth="1"');
    expect(sheet).toContain('<pageMargins');
    // "&" opens a format code in a header (&D is the date), so a literal ampersand has to be
    // doubled before the usual XML escaping — otherwise Excel eats the " C" after it.
    expect(sheet).toContain('Visa &amp;&amp; Co');
    expect(presented({})).not.toContain('pageSetup');
  });

  test('fit-to-width needs the sheet-level flag Excel actually reads', () => {
    // pageSetup fitToWidth is ignored unless sheetPr says the page setup is fit-to-page.
    const sheet = presented({ print: { orientation: 'landscape', fitToWidth: true } });
    expect(sheet).toContain('fitToPage="1"');
  });

  test("a header over Excel's limit is truncated, not dropped", () => {
    // Excel does not complain about a header past 255 characters — it drops it, so a printout
    // comes out unidentified while generation reports success. Nothing bounds a deal name.
    const headerOf = (text: string) => {
      const odd =
        /<oddHeader>(.*?)<\/oddHeader>/s.exec(
          presented({ print: { orientation: 'landscape', header: [text] } }),
        )?.[1] ?? '';
      // Count what Excel counts: the header string itself, format codes included.
      return odd.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    };

    const long = `${'A'.repeat(130)} — ${'B'.repeat(130)}`;
    const truncated = headerOf(long);
    expect(truncated.length).toBeLessThanOrEqual(255);
    expect(truncated).toContain('…');
    expect(truncated.startsWith('&L' + 'A'.repeat(50))).toBe(true);

    // An ampersand encodes to two characters, so 200 of them would emit a 406-character header.
    const amps = headerOf('&'.repeat(200));
    expect(amps.length).toBeLessThanOrEqual(255);
    // Every literal ampersand must still be a pair: a lone trailing & would eat the &R after it.
    const body = amps.replace(/^&L/, '').replace(/&R&D$/, '').replace(/…$/, '');
    expect(body.length % 2).toBe(0);
    expect(/(^|[^&])&([^&]|$)/.test(body)).toBe(false);
  });

  test('every header part survives truncation, however long an earlier one is', () => {
    // Composed account-first, a 300-character account name would consume the whole budget and
    // emit a header with no deal name in it — so two deals for that account print identically.
    const odd =
      /<oddHeader>(.*?)<\/oddHeader>/s.exec(
        presented({ print: { orientation: 'landscape', header: ['A'.repeat(300), 'DISTINCT-DEAL'] } }),
      )?.[1] ?? '';
    const header = odd.replace(/&amp;/g, '&');
    expect(header.length).toBeLessThanOrEqual(255);
    expect(header).toContain('DISTINCT-DEAL');
    expect(header).toContain('…');
  });

  test('an empty part is dropped rather than leaving a dangling separator', () => {
    const oddOf = (header: string[]) =>
      /<oddHeader>(.*?)<\/oddHeader>/s.exec(presented({ print: { orientation: 'landscape', header } }))?.[1];
    expect(oddOf(['Visa', ''])).toBe('&amp;LVisa&amp;R&amp;D');
    expect(oddOf(['', 'XC WAF-API'])).toBe('&amp;LXC WAF-API&amp;R&amp;D');
    // Nothing to say: no header element at all, rather than an empty one.
    expect(presented({ print: { orientation: 'landscape', header: ['', ''] } })).not.toContain('headerFooter');
    expect(presented({ print: { orientation: 'landscape', header: [] } })).not.toContain('headerFooter');
  });

  test('a part short enough to fit gives its surplus budget to the others', () => {
    const odd =
      /<oddHeader>(.*?)<\/oddHeader>/s.exec(
        presented({ print: { orientation: 'landscape', header: ['Visa', 'D'.repeat(300)] } }),
      )?.[1] ?? '';
    const header = odd.replace(/&amp;/g, '&');
    expect(header.length).toBeLessThanOrEqual(255);
    expect(header).toContain('Visa');
    // Visa needed 4 of its ~124 share, so the deal name should get far more than half.
    expect((/D+/.exec(header)?.[0] ?? '').length).toBeGreaterThan(200);
  });

  test('a header inside the limit is emitted whole', () => {
    const odd = /<oddHeader>(.*?)<\/oddHeader>/s.exec(
      presented({ print: { orientation: 'landscape', header: ['Visa, Inc.', 'XC WAF-API'] } }),
    )?.[1];
    expect(odd).toBe('&amp;LVisa, Inc. — XC WAF-API&amp;R&amp;D');
  });

  test('parts appear in CT_Worksheet sequence order', () => {
    // CT_Worksheet is a sequence, not a bag. Out of order, Excel offers to repair the file
    // and names nothing useful — so assert the ORDER, not merely the presence.
    const sheet = dec(
      readZip(
        buildWorkbook([
          {
            name: 'Deal',
            hideGridlines: true,
            zoom: 75,
            freezeAtRow: 1,
            merges: ['B1:D1'],
            print: { orientation: 'landscape', fitToWidth: true, header: ['Deal'] },
            rows: [
              { row: 1, cells: [{ ref: 'B1', value: 'Element', style: 'columnHeader' }] },
              { row: 2, cells: [{ ref: 'B2', value: 1, style: 'score' }] },
            ],
            conditionalFormats: [{ sqref: 'B2:B2', preset: 'score' }],
            validations: [{ sqref: 'B2:B2', values: ['0', '1'] }],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    const expected = [
      '<sheetPr',
      '<sheetViews',
      '<sheetFormatPr',
      '<sheetData',
      '<mergeCells',
      '<conditionalFormatting',
      '<dataValidations',
      '<printOptions',
      '<pageMargins',
      '<pageSetup',
      '<headerFooter',
    ];
    const found = expected.map((tag) => ({ tag, at: sheet.indexOf(tag) }));
    for (const { tag, at } of found) expect(at, `${tag} missing`).toBeGreaterThan(-1);
    expect(found.map(({ at }) => at)).toEqual([...found.map(({ at }) => at)].sort((a, b) => a - b));
  });
});

describe('styles.xml — a named style resolves to the look it promises', () => {
  /** The font and fill XML that a style name actually lands on, via its cellXf. */
  const lookOf = (name: keyof typeof STYLE_IDS) => {
    const styles = dec(readZip(minimal()).get('xl/styles.xml')?.data as Uint8Array);
    const fonts = [...styles.matchAll(/<font>.*?<\/font>/gs)].map((m) => m[0]);
    const fills = [...styles.matchAll(/<fill>.*?<\/fill>/gs)].map((m) => m[0]);
    const xfs = [...styles.slice(styles.indexOf('<cellXfs')).matchAll(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/gs)].map(
      (m) => m[0],
    );
    const xf = xfs[STYLE_IDS[name]];
    const fontId = Number(/fontId="(\d+)"/.exec(xf)?.[1]);
    const fillId = Number(/fillId="(\d+)"/.exec(xf)?.[1]);
    expect(fonts[fontId], `${name} fontId ${fontId} is past the end of <fonts>`).toBeDefined();
    expect(fills[fillId], `${name} fillId ${fillId} is past the end of <fills>`).toBeDefined();
    return { xf, font: fonts[fontId], fill: fills[fillId] };
  };

  // Indexes into <fonts> and <fills> are positional, so a renumber that misses one silently
  // paints a banner in italic grey and no other test notices. Bind each name to what a person
  // would SEE, not to a number.
  test('the banner styles are white bold text on the dark fill', () => {
    for (const name of ['title', 'sectionHeader'] as const) {
      const { font, fill } = lookOf(name);
      expect(font, name).toContain('<b/>');
      expect(font, name).toContain('FFFFFFFF');
      expect(fill, name).toContain('FF0E2841');
    }
  });

  test('the header and label styles are white bold on teal or light blue', () => {
    expect(lookOf('columnHeader').fill).toContain('FF156082');
    expect(lookOf('fieldLabel').fill).toContain('FF156082');
    expect(lookOf('groupHeader').fill).toContain('FF0F9ED5');
    for (const name of ['columnHeader', 'fieldLabel', 'groupHeader'] as const) {
      expect(lookOf(name).font, name).toContain('FFFFFFFF');
    }
  });

  test('plain styles carry no fill, so they do not paint over the page', () => {
    for (const name of ['default', 'text', 'label', 'currency', 'date'] as const) {
      expect(lookOf(name).fill, name).toContain('patternType="none"');
    }
  });

  test('every declared font and fill is reachable from some style', () => {
    // An entry nothing points at is either a mistake or a leftover; the two reserved
    // placeholders Excel requires are the only exceptions.
    const styles = dec(readZip(minimal()).get('xl/styles.xml')?.data as Uint8Array);
    const cellXfs = styles.slice(styles.indexOf('<cellXfs'));
    const usedFonts = new Set([...cellXfs.matchAll(/fontId="(\d+)"/g)].map((m) => Number(m[1])));
    const usedFills = new Set([...cellXfs.matchAll(/fillId="(\d+)"/g)].map((m) => Number(m[1])));
    const fontCount = Number(/<fonts count="(\d+)"/.exec(styles)?.[1]);
    const fillCount = Number(/<fills count="(\d+)"/.exec(styles)?.[1]);
    for (let i = 0; i < fontCount; i++) expect(usedFonts.has(i), `font ${i} is unreachable`).toBe(true);
    // Fill 1 is the format-reserved gray125 placeholder, which nothing may use.
    for (let i = 0; i < fillCount; i++) {
      if (i === 1) continue;
      expect(usedFills.has(i), `fill ${i} is unreachable`).toBe(true);
    }
  });
});

describe('buildWorkbook — provenance properties', () => {
  const propsOf = (props: Record<string, string>) =>
    new TextDecoder().decode(
      readZip(buildWorkbook([{ name: 'Deal', rows: [{ row: 1, cells: [{ ref: 'A1', value: 'x' }] }] }], props)).get(
        'docProps/custom.xml',
      )?.data as Uint8Array,
    );

  test('writes every property with a distinct pid', () => {
    // Two properties sharing a pid make Excel repair the file, and pids start at 2.
    const xml = propsOf({ MeddpiccFingerprint: 'abc', MeddpiccSchemaHash: 'def', MeddpiccLocale: 'ko' });
    const pids = [...xml.matchAll(/pid="(\d+)"/g)].map((m) => Number(m[1]));
    expect(pids).toEqual([2, 3, 4]);
    expect(new Set(pids).size).toBe(pids.length);
    for (const name of ['MeddpiccFingerprint', 'MeddpiccSchemaHash', 'MeddpiccLocale']) {
      expect(xml).toContain(`name="${name}"`);
    }
  });

  test('escapes a property value rather than injecting it', () => {
    expect(propsOf({ MeddpiccLocale: 'a & b <c>' })).toContain('a &amp; b &lt;c&gt;');
  });

  test('a workbook with no properties ships no custom.xml at all', () => {
    const parts = readZip(buildWorkbook([{ name: 'Deal', rows: [] }]));
    expect(parts.has('docProps/custom.xml')).toBe(false);
    const ct = new TextDecoder().decode(parts.get('[Content_Types].xml')?.data as Uint8Array);
    expect(ct).not.toContain('custom-properties');
  });

  test('an empty property set ships no custom.xml either', () => {
    // An empty <Properties/> is legal but pointless, and it would make the reader report a
    // workbook as stamped when it carries nothing.
    expect(readZip(buildWorkbook([{ name: 'Deal', rows: [] }], {})).has('docProps/custom.xml')).toBe(false);
  });
});

describe('buildWorkbook — notes', () => {
  /** A sheet whose B2 says "Metrics", with whatever notes and merges the test wants. */
  const withNotes = (notes: { ref: string; text: string }[] | undefined, merges?: string[]) =>
    readZip(
      buildWorkbook([
        {
          name: 'Deal',
          rows: [
            {
              row: 2,
              cells: [
                { ref: 'B2', value: 'Metrics', style: 'fieldLabel' },
                { ref: 'D2', value: 3, style: 'score' },
              ],
            },
          ],
          merges,
          notes,
        },
      ]),
    );

  const NOTE = { ref: 'B2', text: 'The quantified business outcome the customer is buying.' };

  test('a note ships every part a classic note needs, and the text is in the comments part', () => {
    // A note is not one part but four: the text, a legacy VML shape to position it, the
    // worksheet's own relationships, and the two content-type declarations. Miss any one and
    // Excel either drops the note or offers to repair the file.
    const parts = withNotes([NOTE]);
    expect(parts.has('xl/comments1.xml')).toBe(true);
    expect(parts.has('xl/drawings/vmlDrawing1.vml')).toBe(true);
    expect(parts.has('xl/worksheets/_rels/sheet1.xml.rels')).toBe(true);

    const comments = dec(parts.get('xl/comments1.xml')?.data as Uint8Array);
    expect(comments).toContain('ref="B2"');
    expect(comments).toContain(NOTE.text);

    const ct = dec(parts.get('[Content_Types].xml')?.data as Uint8Array);
    expect(ct).toContain('Extension="vml"');
    expect(ct).toContain('/xl/comments1.xml');
  });

  test('the worksheet points at the drawing, and the id resolves to the vml part', () => {
    const parts = withNotes([NOTE]);
    const sheet = dec(parts.get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    const rels = dec(parts.get('xl/worksheets/_rels/sheet1.xml.rels')?.data as Uint8Array);
    const id = /<legacyDrawing r:id="(rId\d+)"\/>/.exec(sheet)?.[1];
    expect(id, 'the worksheet must declare a legacyDrawing').toBeDefined();
    // The relationship that id names has to be the VML one; pointing it at the comments part
    // leaves the notes present in the file and invisible in Excel.
    const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
    expect(target).toBe('../drawings/vmlDrawing1.vml');
    expect(rels).toContain('../comments1.xml');
  });

  test('legacyDrawing comes last, after the print group', () => {
    // It sits at the END of the CT_Worksheet sequence — after headerFooter. Put it beside
    // mergeCells, where it reads as if it belonged, and Excel offers to repair the file.
    const sheet = dec(
      readZip(
        buildWorkbook([
          {
            name: 'Deal',
            rows: [{ row: 2, cells: [{ ref: 'B2', value: 'Metrics', style: 'fieldLabel' }] }],
            print: { orientation: 'landscape', fitToWidth: true, header: ['Deal'] },
            notes: [NOTE],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    for (const before of ['<sheetData', '<pageSetup', '<headerFooter']) {
      expect(sheet.indexOf('<legacyDrawing')).toBeGreaterThan(sheet.indexOf(before));
    }
  });

  test('the shape names the cell it hangs on, counting from zero', () => {
    // VML counts rows and columns from zero while an A1 reference counts from one. Off by one
    // and the note appears on the row above, still hoverable, pointing at the wrong element.
    const vml = dec(withNotes([NOTE]).get('xl/drawings/vmlDrawing1.vml')?.data as Uint8Array);
    expect(vml).toContain('<x:Row>1</x:Row>');
    expect(vml).toContain('<x:Column>1</x:Column>');
    expect(vml).toContain('ObjectType="Note"');
    expect(vml).toContain('<x:Anchor>');
  });

  test('each note gets its own shape id', () => {
    const vml = dec(
      withNotes([NOTE, { ref: 'D2', text: 'A 0-4 score.' }]).get('xl/drawings/vmlDrawing1.vml')?.data as Uint8Array,
    );
    const ids = [...vml.matchAll(/<v:shape id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });

  test('a workbook with no notes ships no note parts at all', () => {
    const parts = withNotes(undefined);
    expect(parts.has('xl/comments1.xml')).toBe(false);
    expect(parts.has('xl/drawings/vmlDrawing1.vml')).toBe(false);
    expect(parts.has('xl/worksheets/_rels/sheet1.xml.rels')).toBe(false);
    expect(dec(parts.get('xl/worksheets/sheet1.xml')?.data as Uint8Array)).not.toContain('legacyDrawing');
    expect(dec(parts.get('[Content_Types].xml')?.data as Uint8Array)).not.toContain('vml');
    // An empty list is the same as none: an empty commentList would be a part Excel has to
    // read for nothing.
    expect(withNotes([]).has('xl/comments1.xml')).toBe(false);
  });

  test('note parts are numbered by their sheet, not by how many carry notes', () => {
    // sheet2's note part must be comments2.xml: named comments1.xml it would collide with the
    // first sheet's the moment that one has a note too, and Excel resolves parts by name.
    const parts = readZip(
      buildWorkbook([
        { name: 'Deal', rows: [] },
        {
          name: 'Qualification',
          rows: [{ row: 1, cells: [{ ref: 'B1', value: 'Metrics' }] }],
          notes: [{ ref: 'B1', text: 'x' }],
        },
      ]),
    );
    expect(parts.has('xl/comments2.xml')).toBe(true);
    expect(parts.has('xl/comments1.xml')).toBe(false);
    expect(parts.has('xl/worksheets/_rels/sheet2.xml.rels')).toBe(true);
    expect(dec(parts.get('xl/worksheets/_rels/sheet2.xml.rels')?.data as Uint8Array)).toContain(
      '../drawings/vmlDrawing2.vml',
    );
  });

  test('escapes the note text rather than injecting it', () => {
    const comments = dec(
      withNotes([{ ref: 'B2', text: 'Metrics & <targets>' }]).get('xl/comments1.xml')?.data as Uint8Array,
    );
    expect(comments).toContain('Metrics &amp; &lt;targets&gt;');
    expect(comments).not.toContain('<targets>');
  });

  test('refuses two notes on one cell', () => {
    // Excel keeps one of them, so the other text is simply gone with nothing to say so.
    expect(() => withNotes([NOTE, { ref: 'B2', text: 'something else' }])).toThrow(/B2/);
  });

  test('refuses a note with no text', () => {
    // A red triangle with nothing behind it is worse than no note: it invites a hover that
    // shows an empty box.
    expect(() => withNotes([{ ref: 'B2', text: '' }])).toThrow(/text/i);
    expect(() => withNotes([{ ref: 'B2', text: '   ' }])).toThrow(/text/i);
  });

  test('refuses a note on a cell a merge hides', () => {
    // Only the top-left cell of a merge is visible, and a note on any of the others cannot be
    // hovered — the definition would be in the file and unreachable.
    expect(() => withNotes([{ ref: 'C2', text: 'hidden' }], ['B2:C2'])).toThrow(/merge/i);
    // The anchor of that same merge is fine, and is where the notes actually go.
    expect(() => withNotes([NOTE], ['B2:C2'])).not.toThrow();
  });

  test('refuses anything that is not a single cell reference', () => {
    for (const ref of ['B2:C2', '2B', 'B', '', 'b2']) {
      expect(() => withNotes([{ ref, text: 'x' }]), ref).toThrow();
    }
  });
});

describe('buildWorkbook — a note at the edge of the grid', () => {
  /** The eight numbers of the VML anchor: left column, offset, top row, offset, then the same again. */
  const anchorOf = (ref: string) => {
    const vml = dec(
      readZip(
        buildWorkbook([
          { name: 'Deal', rows: [{ row: 1, cells: [{ ref, value: 'edge' }] }], notes: [{ ref, text: 'x' }] },
        ]),
      ).get('xl/drawings/vmlDrawing1.vml')?.data as Uint8Array,
    );
    const numbers = /<x:Anchor>([^<]+)<\/x:Anchor>/.exec(vml)?.[1] ?? '';
    return numbers.split(',').map((n) => Number(n.trim()));
  };

  test('the box stays inside the grid, however close to the edge the cell is', () => {
    // The note box is anchored a few columns and rows on from its cell, and Excel's grid ends at
    // column XFD and row 1048576. An anchor past either is not clipped — it is a malformed drawing,
    // and Excel's answer to that is to offer to repair the file.
    const [left, , top, , right, , bottom] = anchorOf('XFD1048576');
    expect(right).toBeLessThanOrEqual(16383);
    expect(bottom).toBeLessThanOrEqual(1048575);
    // Still a box, not a line: the anchor has to keep some width and height or there is nothing to show.
    expect(right).toBeGreaterThan(left);
    expect(bottom).toBeGreaterThan(top);
  });

  test('an ordinary cell gets the full-size box', () => {
    const [left, , top, , right, , bottom] = anchorOf('B20');
    expect(right - left).toBe(4);
    expect(bottom - top).toBe(5);
  });
});

describe('the colour rules paint only what needs attention', () => {
  /** Every rule of one preset, as `operator formula -> dxfName`. */
  const rulesOf = (preset: CfPreset) => {
    const xml = dec(
      readZip(
        buildWorkbook([
          {
            name: 'Data',
            rows: [{ row: 1, cells: [{ ref: 'A1', value: 1 }] }],
            conditionalFormats: [{ sqref: 'A1:A2', preset }],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    const byId = Object.fromEntries(Object.entries(DXF_IDS).map(([name, id]) => [String(id), name]));
    return [
      ...xml.matchAll(/<cfRule type="([a-zA-Z]+)"(?: operator="([a-zA-Z]+)")? dxfId="(\d+)"[^>]*>(.*?)<\/cfRule>/g),
    ].map((m) => ({
      type: m[1],
      operator: m[2] ?? '',
      formula: /<formula>([^<]*)<\/formula>/.exec(m[4])?.[1] ?? '',
      dxf: byId[m[3]],
    }));
  };

  test('the score column is a ladder that runs out before the good scores', () => {
    // 0 is nothing, 1 is barely, 2 is nearly — and 3 or 4 is done, so it carries no fill at all.
    // Colouring the top of the range meant a well-qualified deal was the loudest thing on the sheet.
    expect(rulesOf('score')).toEqual([
      { type: 'cellIs', operator: 'equal', formula: '0', dxf: 'urgent' },
      { type: 'cellIs', operator: 'equal', formula: '1', dxf: 'warn' },
      { type: 'cellIs', operator: 'equal', formula: '2', dxf: 'watch' },
    ]);
  });

  test('no preset paints a fill for a value that is finished, good, or improved', () => {
    // The whole rule of the palette, asserted once: nothing in any preset may fire on the words and
    // numbers that mean "done". A green fill anywhere is what this is here to catch.
    const good = [enumLabel('complete'), 'Green', '3', '4'];
    for (const preset of ['score', 'delta', 'ragText', 'statusText', 'completionText', 'missing'] as CfPreset[]) {
      for (const rule of rulesOf(preset)) {
        for (const word of good) {
          expect(rule.formula, `${preset}: ${rule.operator} ${rule.formula}`).not.toContain(word);
        }
      }
    }
    // Movement upwards is not painted either, so only a step backwards draws the eye.
    expect(rulesOf('delta').map((r) => r.operator)).toEqual(['lessThan']);
  });

  test('a blank cell a rule needs is shaded, and the rule is about emptiness alone', () => {
    const [rule, ...rest] = rulesOf('missing');
    expect(rest).toEqual([]);
    expect(rule.type).toBe('expression');
    expect(rule.dxf).toBe('urgent');
    // Whitespace is not content: a cell holding a space is as empty as one holding nothing.
    expect(rule.formula).toContain('TRIM');
    expect(rule.formula).toContain('A1');
  });

  test('all three fills are faint and warm, and none of them is green', () => {
    // "Subtle" and "warm" are the two properties worth asserting; the exact hexes are a matter of
    // taste and belong in the render the operator looks at. Red at least green at least blue is what
    // makes a wash warm — and it is what fails if somebody reaches for green again.
    const styles = dec(readZip(minimal()).get('xl/styles.xml')?.data as Uint8Array);
    const dxfs = styles.slice(styles.indexOf('<dxfs'), styles.indexOf('</dxfs>'));
    const colours = [...dxfs.matchAll(/bgColor rgb="FF([0-9A-F]{6})"/g)].map((m) => m[1]);
    expect(colours).toHaveLength(Object.keys(DXF_IDS).length);
    expect(new Set(colours).size).toBe(colours.length);
    for (const hex of colours) {
      const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      expect(r, `${hex} is warm`).toBeGreaterThanOrEqual(g);
      expect(g, `${hex} is warm`).toBeGreaterThanOrEqual(b);
      // Faint: every channel near white, so the wash sits under the text rather than over it.
      expect(b, `${hex} is faint`).toBeGreaterThanOrEqual(0xd0);
    }
  });

  test('no cell style carries a status fill — the conditional formats own the colouring', () => {
    // ragRed/ragAmber/ragGreen were cell styles nothing referenced: the presets had taken the job
    // over, and three unreferenced fills is three chances to paint a cell by accident.
    expect(Object.keys(STYLE_IDS)).not.toContain('ragRed');
    expect(Object.keys(STYLE_IDS)).not.toContain('ragAmber');
    expect(Object.keys(STYLE_IDS)).not.toContain('ragGreen');
  });
});

describe('a rule and its row range have to agree', () => {
  const build = (format: { sqref: string; preset: CfPreset; rowRange?: string }) =>
    buildWorkbook([
      {
        name: 'Data',
        rows: [{ row: 2, cells: [{ ref: 'B2', value: 'x' }] }],
        conditionalFormats: [format],
      },
    ]);

  test('a rule that asks about the row cannot be emitted without one', () => {
    // Left to resolve to nothing it would emit `COUNTA()>0`, which Excel takes as a formula error and
    // shows as a rule that simply never fires — a wash that is missing with nothing to say why.
    expect(() => build({ sqref: 'B2:B5', preset: 'missingInRow' })).toThrow(/rowRange/);
  });

  test('a row range on a rule that does not use it is refused', () => {
    // Data nothing reads is data that lies: it would look as though the rule had been scoped.
    expect(() => build({ sqref: 'B2:B5', preset: 'missing', rowRange: '$B2:$Q2' })).toThrow(/rowRange/);
  });

  test('given one, it is substituted into the formula as written', () => {
    const xml = dec(
      readZip(build({ sqref: 'B2:B5', preset: 'missingInRow', rowRange: '$B2:$Q2' })).get('xl/worksheets/sheet1.xml')
        ?.data as Uint8Array,
    );
    expect(xml).toContain('COUNTA($B2:$Q2)');
    expect(xml).not.toContain('%ROW%');
  });
});

describe('the two levels of an empty-cell wash', () => {
  const dxfOf = (preset: CfPreset) => {
    const xml = dec(
      readZip(
        buildWorkbook([
          {
            name: 'Data',
            rows: [{ row: 2, cells: [{ ref: 'B2', value: 'x' }] }],
            conditionalFormats: [{ sqref: 'B2:B5', preset, rowRange: '$B2:$Q2' }],
          },
        ]),
      ).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    const id = Number(/dxfId="(\d+)"/.exec(xml)?.[1]);
    return Object.entries(DXF_IDS).find(([, v]) => v === id)?.[0];
  };

  test('a cell something requires is urgent; one merely wanted is a level down', () => {
    // A blank evidence cell blocks the element from ever being complete. An unanswered question does
    // not — any one answer satisfies the rule — so the two cannot ask for the same attention.
    expect(dxfOf('missingInRow')).toBe('urgent');
    expect(dxfOf('wantedInRow')).toBe('watch');
  });
});

describe('text the writer does not control', () => {
  /** The smallest sheet that carries one dropdown. */
  const withDropdown = (values: string[]): SheetSpec => ({
    name: 'S',
    rows: [{ row: 1, cells: [{ ref: 'A1', value: 'x' }] }],
    validations: [{ sqref: 'A1', values }],
  });

  test('a comma in a dropdown value is refused, because Excel would read it as two entries', () => {
    // The inline list is a quoted, comma-joined string and Excel's form has no escape for a comma, so
    // `Yes, please` offers `Yes` and ` please`. Refusing beats escaping: there is nothing to escape with.
    // Localisation is what makes this live — a comma is ordinary in prose, and 192 strings per locale are
    // model-authored.
    expect(() => buildWorkbook([withDropdown(['Yes, please', 'No'])], {})).toThrow(/comma/i);
    // The message has to name the offender, or the author cannot find it among 199 strings.
    expect(() => buildWorkbook([withDropdown(['Yes, please', 'No'])], {})).toThrow(/Yes, please/);
  });

  test('a quote in a dropdown value is doubled, not refused', () => {
    // Unlike a comma, a quote IS representable: doubled, as in any Excel string. Verified in Excel — a list
    // written `"He said ""yes"",No"` reads back as `He said "yes",No` and offers the two entries intended.
    // My first version refused it, which would have been an avoidable outage the first time a translation
    // used ordinary punctuation.
    const parts = readZip(buildWorkbook([withDropdown(['He said "yes"', 'No'])], {}));
    const xml = dec(parts.get('xl/worksheets/sheet1.xml')?.data as Uint8Array);
    // The emitted payload carries the doubled form, XML-escaped on top of that.
    expect(xml).toContain('He said &quot;&quot;yes&quot;&quot;,No');
  });

  test('the 255-character budget is measured on what Excel receives', () => {
    // Escaping happens first, so a value full of quotation marks costs twice what it looks like. Measuring
    // the unescaped text would let a list through that Excel then drops.
    const quoteHeavy = Array.from({ length: 8 }, (_, i) => `${'"'.repeat(16)}value${i}`);
    expect(quoteHeavy.join(',').length).toBeLessThanOrEqual(255);
    expect(quoteHeavy.map((v) => v.replace(/"/g, '""')).join(',').length).toBeGreaterThan(255);
    expect(() => buildWorkbook([withDropdown(quoteHeavy)], {})).toThrow(/255/);
  });

  test('an ordinary dropdown is unaffected', () => {
    // The refusal must not become indiscriminate: spaces, slashes and hyphens all appear in real values.
    expect(() =>
      buildWorkbook([withDropdown(['Best Case', 'Economic buyer', 'Negotiation/Review'])], {}),
    ).not.toThrow();
  });

  test('a validation list past 255 characters is refused', () => {
    // Enforced already, but nothing covered it — the other `255` assertions in this file are about the
    // print header. CJK and Devanagari translations are what will start pushing lists toward the cap.
    const long = Array.from({ length: 30 }, (_, i) => `value-number-${i}-padded-out`);
    expect(long.join(',').length).toBeGreaterThan(255);
    expect(() => buildWorkbook([withDropdown(long)], {})).toThrow(/255/);
  });
});

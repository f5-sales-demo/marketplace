import { describe, expect, test } from 'bun:test';
import { applyFill, planFill, setCellValue } from './fill';
import { readZip } from './zip';

const mapping = {
  sheetName: 'MEDDPICC Deal Review Sheet',
  cells: [
    { jsonPath: 'metadata.accountName', cell: 'C4' },
    { jsonPath: 'metadata.revenue.acv', cell: 'N7', format: 'currency' },
    { jsonPath: 'metadata.winProbability', cell: 'I5', format: 'percentage' },
    { jsonPath: 'qualification.metrics.responses[0]', cell: 'H14' },
  ],
  textBlocks: [{ jsonPath: 'closePlan.milestones', cell: 'B67', line: '{description} — {targetDate} ({status})' }],
  mirrored: [{ jsonPath: 'threeWhys.partner.name', cells: ['J33', 'J80'] }],
  tables: [
    {
      jsonPath: 'stakeholders',
      startRow: 41,
      maxRows: 2,
      columns: { name: 'B', mustSayYes: 'H' },
      booleanFormat: { true: 'Yes', false: 'No' },
    },
  ],
};

const deal = {
  metadata: { accountName: 'Visa, Inc.', winProbability: 0.6, revenue: { acv: 473687 } },
  qualification: { metrics: { responses: ['Uptime and latency'] } },
  threeWhys: { partner: { name: 'CDW' } },
  closePlan: {
    milestones: [
      { description: 'POC tenant live', targetDate: '2026-08-01', status: 'complete' },
      { description: 'EUSA signed', targetDate: '2026-08-20', status: 'in_progress' },
    ],
  },
  stakeholders: [
    { name: 'Matthew Davy', mustSayYes: true },
    { name: 'Gary Slater', mustSayYes: false },
  ],
};

const at = (plan: ReturnType<typeof planFill>, addr: string) => plan.cells.find((c) => c.address === addr);

describe('planFill', () => {
  test('places each scalar at its mapped cell', () => {
    const p = planFill(deal, mapping);
    expect(at(p, 'C4')?.value).toBe('Visa, Inc.');
    expect(at(p, 'H14')?.value).toBe('Uptime and latency');
  });

  test('numbers stay numbers so the template can still compute', () => {
    // I7 is =N4*I5 in the template. A currency written as "$473,687" breaks it.
    const p = planFill(deal, mapping);
    expect(at(p, 'N7')?.value).toBe(473687);
    expect(at(p, 'I5')?.value).toBe(0.6);
  });

  test('omits fields the deal has not filled — a blank template cell stays blank', () => {
    const p = planFill({ metadata: { accountName: 'X' } }, mapping);
    expect(at(p, 'C4')).toBeDefined();
    expect(at(p, 'H14')).toBeUndefined();
    expect(at(p, 'N7')).toBeUndefined();
  });

  test('flattens an array into its merged text block, one line per item', () => {
    const p = planFill(deal, mapping);
    expect(at(p, 'B67')?.value).toBe('POC tenant live — 2026-08-01 (complete)\nEUSA signed — 2026-08-20 (in_progress)');
  });

  test('a mirrored value reaches every one of its cells', () => {
    const p = planFill(deal, mapping);
    expect(at(p, 'J33')?.value).toBe('CDW');
    expect(at(p, 'J80')?.value).toBe('CDW');
  });

  test('expands a table one row per item, applying booleanFormat', () => {
    const p = planFill(deal, mapping);
    expect(at(p, 'B41')?.value).toBe('Matthew Davy');
    expect(at(p, 'H41')?.value).toBe('Yes');
    expect(at(p, 'B42')?.value).toBe('Gary Slater');
    expect(at(p, 'H42')?.value).toBe('No');
  });

  test('never writes past the table region the template formats', () => {
    // maxRows is the template's real extent. Writing past it lands on unformatted cells
    // and looks broken, so extra items are dropped rather than spilling.
    const many = { ...deal, stakeholders: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };
    const p = planFill(many, mapping);
    expect(at(p, 'B43')).toBeUndefined();
  });

  test('escapes text that Excel would execute as a formula', () => {
    const hostile = { metadata: { accountName: '=cmd|/c calc' } };
    const p = planFill(hostile, mapping);
    expect(String(at(p, 'C4')?.value).startsWith("'")).toBe(true);
  });

  test('is deterministic', () => {
    expect(JSON.stringify(planFill(deal, mapping))).toBe(JSON.stringify(planFill(deal, mapping)));
  });
});

describe('setCellValue (sheet XML surgery)', () => {
  const xml = '<row r="4"><c r="B4" s="6" t="s"><v>2</v></c><c r="C4" s="18"/><c r="N7" s="43"><v>0</v></c></row>';

  test('fills a self-closing empty cell, keeping its style index', () => {
    const out = setCellValue(xml, 'C4', 'Visa');
    expect(out).toContain('<c r="C4" s="18" t="inlineStr"><is><t xml:space="preserve">Visa</t></is></c>');
  });

  test('replaces an existing placeholder value', () => {
    // N6/N7 ship holding 0, not blank — a fill has to overwrite, not skip them.
    const out = setCellValue(xml, 'N7', 473687);
    expect(out).toContain('<c r="N7" s="43"><v>473687</v></c>');
    expect(out).not.toContain('<v>0</v>');
  });

  test('leaves every other cell untouched', () => {
    const out = setCellValue(xml, 'C4', 'Visa');
    expect(out).toContain('<c r="B4" s="6" t="s"><v>2</v></c>');
  });

  test('escapes XML metacharacters', () => {
    const out = setCellValue(xml, 'C4', 'A & B <tag> "q" \'s\'');
    expect(out).toContain('A &amp; B &lt;tag&gt; &quot;q&quot; &apos;s&apos;');
    expect(out).not.toContain('<tag>');
  });

  test('keeps newlines inside the cell rather than splitting it', () => {
    const out = setCellValue(xml, 'C4', 'line one\nline two');
    expect(out).toContain('line one\nline two');
  });

  test('throws on an address the sheet does not define', () => {
    // Silently doing nothing would produce a report with missing fields and no signal.
    expect(() => setCellValue(xml, 'ZZ99', 'x')).toThrow(/ZZ99/);
  });

  test('does not confuse a cell with one whose address is a prefix', () => {
    const wide = '<c r="B4" s="1"/><c r="B41" s="2"/>';
    const out = setCellValue(wide, 'B4', 'hit');
    expect(out).toContain('<c r="B41" s="2"/>');
    expect(out).toContain('r="B4" s="1" t="inlineStr"');
  });
});

describe('applyFill against the shipped template', () => {
  const TPL = new URL('../skills/deal-qualification/references/meddpicc-template.xlsx', import.meta.url).pathname;

  test('produces a workbook whose non-sheet parts are byte-identical to the template', async () => {
    const original = new Uint8Array(await Bun.file(TPL).arrayBuffer());
    const filled = applyFill(original, planFill(deal, mapping));
    const a = readZip(original);
    const b = readZip(filled);
    expect([...b.keys()]).toEqual([...a.keys()]);
    let changed = 0;
    for (const [name, e] of a) {
      const same = Buffer.from(b.get(name)?.compressed as Uint8Array).equals(Buffer.from(e.compressed));
      if (!same) changed++;
    }
    // Exactly one part differs: the worksheet we filled.
    expect(changed).toBe(1);
    expect(
      Buffer.from(b.get('xl/worksheets/sheet1.xml')?.compressed as Uint8Array).equals(
        Buffer.from(a.get('xl/worksheets/sheet1.xml')?.compressed as Uint8Array),
      ),
    ).toBe(false);
  });

  test('the filled worksheet keeps the template formula and gains the values', async () => {
    const original = new Uint8Array(await Bun.file(TPL).arrayBuffer());
    const sheet = new TextDecoder().decode(
      readZip(applyFill(original, planFill(deal, mapping))).get('xl/worksheets/sheet1.xml')?.data as Uint8Array,
    );
    expect(sheet).toContain('Visa, Inc.');
    expect(sheet).toContain('N4*I5'); // the Factored Pipe formula survives

    // N7 ships as <c r="N7" s="37"><v>0</v></c>. Assert the value replaced the placeholder
    // AND that whatever style index the template carries came through — reading it from
    // the template rather than hardcoding one, since a guessed literal tests nothing.
    const templateStyle = new TextDecoder()
      .decode(readZip(original).get('xl/worksheets/sheet1.xml')?.data as Uint8Array)
      .match(/<c r="N7"([^>]*?)(?:\/>|>)/)?.[1];
    expect(templateStyle).toBeTruthy();
    expect(sheet).toContain(`<c r="N7"${templateStyle}><v>473687</v></c>`);
  });
});

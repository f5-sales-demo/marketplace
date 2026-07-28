import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeCompletion } from './completion';
import { dateToSerial, generateWorkbook, planWorkbook } from './generate';
import { QUALIFICATION_ELEMENTS, SECTION_ORDER } from './sections';
import type { WorkbookSpec } from './workbook-spec';
import { COMPLETION_STATUSES } from './xlsx';
import { readZip } from './zip';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'workbook-spec.json'), 'utf8')) as WorkbookSpec;
const deal = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'example-deal.json'), 'utf8'));

const plan = planWorkbook(schema, spec, deal);
const sheet = (name: string) => {
  const found = plan.sheets.find((s) => s.name === name);
  if (!found) throw new Error(`no sheet ${name}`);
  return found;
};
const cellAt = (sheetName: string, ref: string) => {
  for (const row of sheet(sheetName).rows) {
    const c = row.cells.find((x) => x.ref === ref);
    if (c) return c;
  }
  return undefined;
};
/** Every cell of every sheet, flattened, for whole-workbook assertions. */
const allCells = () => plan.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.map((c) => ({ sheet: s.name, ...c }))));

describe('dateToSerial', () => {
  // 1899-12-30 is serial 0 in the 1900 date system Excel actually implements.
  test('maps known dates to the serials Excel uses', () => {
    expect(dateToSerial('1900-01-01')).toBe(2);
    expect(dateToSerial('2026-06-30')).toBe(46203);
  });

  test('returns null for a value that is not a date', () => {
    expect(dateToSerial('')).toBeNull();
    expect(dateToSerial('not-a-date')).toBeNull();
  });
});

describe('planWorkbook — every sheet in the spec is emitted', () => {
  test('one sheet per spec sheet, in order', () => {
    expect(plan.sheets.map((s) => s.name)).toEqual(spec.sheets.map((s) => s.name));
  });
});

describe('planWorkbook — form layout', () => {
  test('a field puts its label in column A and its value in column B on one row', () => {
    const input = plan.inputCells.find((c) => c.jsonPath === 'metadata.accountName');
    expect(input).toBeDefined();
    expect(input?.sheet).toBe('Deal');
    const [, col, row] = /^([A-Z]+)(\d+)$/.exec(input?.address ?? '') ?? [];
    expect(col).toBe('B');
    expect(cellAt('Deal', `A${row}`)?.value).toBe('Account name');
    expect(cellAt('Deal', `B${row}`)?.value).toBe('Acme Corporation');
  });

  test('the title is the first row and section headers appear as their own rows', () => {
    expect(cellAt('Deal', 'A1')?.value).toBe('MEDDPICC Deal Review');
    const labels = sheet('Deal')
      .rows.flatMap((r) => r.cells)
      .filter((c) => c.ref.startsWith('A'))
      .map((c) => c.value);
    expect(labels).toContain('Revenue');
    expect(labels).toContain('Three Whys — F5');
  });

  test('rows are unique and ascending — nothing lands on top of anything else', () => {
    for (const s of plan.sheets) {
      const rows = s.rows.map((r) => r.row);
      expect(rows, `${s.name} rows ascending`).toEqual([...rows].sort((a, b) => a - b));
      expect(new Set(rows).size, `${s.name} rows unique`).toBe(rows.length);
      for (const r of s.rows) {
        const refs = r.cells.map((c) => c.ref);
        expect(new Set(refs).size, `${s.name} row ${r.row} refs unique`).toBe(refs.length);
      }
    }
  });
});

describe('planWorkbook — values by type', () => {
  test('a date becomes a serial, so the sheet can subtract it from TODAY()', () => {
    const closeDate = plan.inputCells.find((c) => c.jsonPath === 'metadata.closeDate');
    const cell = cellAt('Deal', closeDate?.address ?? '');
    expect(cell?.value).toBe(dateToSerial('2026-06-30'));
    expect(typeof cell?.value).toBe('number');
  });

  test('a percent stays the underlying fraction', () => {
    const win = plan.inputCells.find((c) => c.jsonPath === 'metadata.winProbability');
    expect(cellAt('Deal', win?.address ?? '')?.value).toBe(0.5);
  });

  test('currency is a bare number', () => {
    const acv = plan.inputCells.find((c) => c.jsonPath === 'metadata.revenue.acv');
    expect(cellAt('Deal', acv?.address ?? '')?.value).toBe(85000);
  });

  test('a boolean stays a boolean', () => {
    const mustSayYes = plan.inputCells.filter((c) => c.jsonPath.endsWith('mustSayYes'));
    expect(mustSayYes.length).toBeGreaterThan(0);
    const values = mustSayYes.map((c) => cellAt('Stakeholders', c.address)?.value).filter((v) => v !== undefined);
    expect(values.some((v) => typeof v === 'boolean')).toBe(true);
  });

  test('an absent value leaves the cell empty rather than writing "undefined"', () => {
    for (const c of allCells()) {
      expect(typeof c.value === 'string' ? c.value : '').not.toBe('undefined');
    }
  });
});

describe('planWorkbook — derived cells come from the schema, not from prose', () => {
  test('each element row carries the definition the schema declares', () => {
    const definition = cellAt('Qualification', 'B2')?.value;
    expect(typeof definition).toBe('string');
    expect(definition).toContain('Quantified business outcomes');
  });

  test('the rubric cell shows the wording for that element at its own score', () => {
    // metrics scores 3 in the example deal; the schema's level-3 text must be what shows.
    const metricsScore = (deal.qualification.metrics as { score: number }).score;
    const rubric = schema.properties.qualification.properties.metrics.properties.scoreDefinition.default[
      String(metricsScore)
    ] as string;
    const row = QUALIFICATION_ELEMENTS.indexOf('metrics') + 2;
    expect(cellAt('Qualification', `F${row}`)?.value).toBe(rubric);
  });

  test('every element gets a row, in the canonical order', () => {
    const names = QUALIFICATION_ELEMENTS.map((_, i) => cellAt('Qualification', `A${i + 2}`)?.value);
    expect(names).toEqual([...QUALIFICATION_ELEMENTS]);
  });

  test('the completion sheet lists every tracked section with its computed status', () => {
    const names = SECTION_ORDER.map((_, i) => cellAt('Completion', `A${i + 2}`)?.value);
    expect(names).toEqual([...SECTION_ORDER]);
    const metricsStatus = cellAt('Completion', 'B2')?.value;
    expect(['not_started', 'partial', 'complete']).toContain(metricsStatus);
  });

  test('questions come from the schema and pair with the responses in the deal', () => {
    const q = cellAt('Questions', 'C2')?.value;
    const a = cellAt('Questions', 'D2')?.value;
    expect(q).toBe(schema.properties.qualification.properties.metrics.properties.questions.default[0]);
    expect(a).toBe((deal.qualification.metrics as { responses: string[] }).responses[0]);
  });
});

describe('planWorkbook — collections are not capped', () => {
  test('every stakeholder in the deal gets a row', () => {
    const names = (deal.stakeholders as Array<{ name: string }>).map((s) => s.name);
    const written = names.map((_, i) => cellAt('Stakeholders', `A${i + 2}`)?.value);
    expect(written).toEqual(names);
  });

  test('a team larger than the legacy sheet formatted still fits', () => {
    // The F5 template formats 8 team rows and silently drops the rest.
    const big = JSON.parse(JSON.stringify(deal));
    big.team.f5 = Array.from({ length: 14 }, (_, i) => ({ name: `Person ${i + 1}`, role: 'SE' }));
    const p = planWorkbook(schema, spec, big);
    const team = p.sheets.find((s) => s.name === 'Team');
    const written = Array.from(
      { length: 14 },
      (_, i) => team?.rows.find((r) => r.row === i + 2)?.cells.find((c) => c.ref === `A${i + 2}`)?.value,
    );
    expect(written).toEqual(big.team.f5.map((m: { name: string }) => m.name));
  });

  test('an empty collection still leaves the header and the blank rows the spec asks for', () => {
    const empty = JSON.parse(JSON.stringify(deal));
    empty.stakeholders = [];
    const p = planWorkbook(schema, spec, empty);
    const sh = p.sheets.find((s) => s.name === 'Stakeholders');
    expect(sh?.rows.find((r) => r.row === 1)?.cells[0]?.value).toBe('Name');
  });
});

describe('planWorkbook — formula references resolve to addresses', () => {
  test('no placeholder survives into any formula', () => {
    for (const c of allCells()) {
      expect(c.formula ?? '').not.toContain('{{');
      expect(c.formula ?? '').not.toContain('}}');
    }
  });

  test('a column reference becomes the data range of that column', () => {
    const total = plan.namedCells.scoreTotal;
    const cell = cellAt('Scorecard', total.split('!')[1] ?? total);
    // Eight elements starting at row 2.
    expect(cell?.formula).toBe('SUM(Qualification!C2:C9)');
  });

  test('a keyed row reference looks the key up in the table', () => {
    // Not the key's row ADDRESS: see "a keyed reference survives the user sorting the table".
    const cell = cellAt('Scorecard', plan.namedCells.championScore.split('!')[1] ?? '');
    expect(cell?.formula).toBe('INDEX(Qualification!C2:C9,MATCH("champion",Qualification!A2:A9,0))');
  });

  test('a same-sheet reference is not sheet-qualified, a cross-sheet one is', () => {
    const percent = cellAt('Scorecard', plan.namedCells.scorePercent.split('!')[1] ?? '');
    // scoreTotal and scoreMaximum are on the Scorecard too, so no prefix.
    expect(percent?.formula).not.toContain('Scorecard!');
    expect(percent?.formula).toMatch(/^IF\(B\d+=0,0,B\d+\/B\d+\)$/);
  });

  test('a sheet name containing a space is quoted', () => {
    const overdue = cellAt('Scorecard', plan.namedCells.actionsOverdue.split('!')[1] ?? '');
    expect(overdue?.formula).toContain("'Close Plan'!");
  });

  test('{{this:…}} resolves to the same row of the same table', () => {
    // Qualification's `change` column is score - previousScore, per row.
    expect(cellAt('Qualification', 'E2')?.formula).toBe('C2-D2');
    expect(cellAt('Qualification', 'E9')?.formula).toBe('C9-D9');
  });
});

describe('planWorkbook — the input map stage 3 will read back', () => {
  test('reports one entry per input cell, with its address and type', () => {
    expect(plan.inputCells.length).toBeGreaterThan(50);
    for (const c of plan.inputCells) {
      expect(c.address).toMatch(/^[A-Z]+\d+$/);
      expect(plan.sheets.some((s) => s.name === c.sheet)).toBe(true);
    }
  });

  test('never reports a computed or derived cell as an input', () => {
    // A derived value must not flow back into the deal as if a human typed it.
    const scorecard = plan.inputCells.filter((c) => c.sheet === 'Scorecard');
    expect(scorecard).toEqual([]);
    const addresses = new Set(plan.inputCells.map((c) => `${c.sheet}!${c.address}`));
    for (const c of allCells()) {
      if (c.formula !== undefined) expect(addresses.has(`${c.sheet}!${c.ref}`)).toBe(false);
    }
  });

  test('no two input cells claim the same address', () => {
    const keys = plan.inputCells.map((c) => `${c.sheet}!${c.address}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('generateWorkbook', () => {
  test('produces a zip carrying every part and one worksheet per sheet', () => {
    const parts = readZip(generateWorkbook(schema, spec, deal));
    expect(parts.has('[Content_Types].xml')).toBe(true);
    expect(parts.has('xl/workbook.xml')).toBe(true);
    for (let i = 0; i < spec.sheets.length; i++) {
      expect(parts.has(`xl/worksheets/sheet${i + 1}.xml`)).toBe(true);
    }
  });

  test('is deterministic — the same deal twice gives the same bytes', () => {
    const a = generateWorkbook(schema, spec, deal);
    const b = generateWorkbook(schema, spec, deal);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('a partly-qualified deal is not flattered by the workbook', () => {
  // Excel's COUNT ignores blanks, so a denominator of COUNT(score)*4 shrank with the data:
  // one element scored 4 and seven unscored displayed 4/4 = 100% next to a Red rating, while
  // the engine said 12.5%. MEDDPICC scores out of 32 whether or not anyone has looked yet.
  const partial = (() => {
    const d = JSON.parse(JSON.stringify(deal));
    for (const el of QUALIFICATION_ELEMENTS) {
      if (el !== 'metrics') delete d.qualification[el].score;
    }
    d.qualification.metrics.score = 4;
    d.scoring = { elementScores: { metrics: 4 } };
    return d;
  })();

  test('an unscored element is written as 0, matching how the engine counts it', () => {
    const p = planWorkbook(schema, spec, partial);
    const q = p.sheets.find((s) => s.name === 'Qualification');
    const scores = QUALIFICATION_ELEMENTS.map(
      (_, i) => q?.rows.find((r) => r.row === i + 2)?.cells.find((c) => c.ref === `C${i + 2}`)?.value,
    );
    expect(scores).toEqual([4, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('the maximum does not shrink when scores are missing', () => {
    // Counting the element-name column keeps the denominator at the number of elements.
    const maximum = cellAt('Scorecard', plan.namedCells.scoreMaximum.split('!')[1] ?? '');
    expect(maximum?.formula).toBe('COUNTA(Qualification!A2:A9)*4');
  });
});

describe('dateToSerial rejects what is not a date', () => {
  test('refuses an impossible calendar date instead of rolling it forward', () => {
    // Date.UTC turns 2026-02-31 into 2026-03-03 — a close date silently three days late.
    expect(dateToSerial('2026-02-31')).toBeNull();
    expect(dateToSerial('2026-04-31')).toBeNull();
    expect(dateToSerial('2026-13-01')).toBeNull();
    expect(dateToSerial('2026-00-10')).toBeNull();
  });

  test('accepts a real leap day and rejects a fake one', () => {
    expect(dateToSerial('2024-02-29')).not.toBeNull();
    expect(dateToSerial('2026-02-29')).toBeNull();
  });

  test('refuses trailing garbage', () => {
    expect(dateToSerial('2026-06-30XYZ')).toBeNull();
    expect(dateToSerial('2026-06-30-01')).toBeNull();
  });

  test('still accepts the date-time form the schema uses for lastSyncDate', () => {
    expect(dateToSerial('2026-05-05T14:30:00Z')).toBe(dateToSerial('2026-05-05'));
  });
});

describe('a keyed reference survives the user sorting the table', () => {
  // Putting a Table on Qualification hands the user a sort button. A formula written as
  // `Qualification!C8` means "champion" only while the rows are in their original order —
  // after a sort by score it silently reports a different element under the Champion label.
  // So a keyed reference has to look the key up, not remember where it was.
  test('resolves through MATCH on the key column rather than a fixed row', () => {
    const champion = cellAt('Scorecard', plan.namedCells.championScore.split('!')[1] ?? '')?.formula ?? '';
    expect(champion).toContain('MATCH("champion"');
    expect(champion).toMatch(/^INDEX\(Qualification!C\$?2:C\$?9,MATCH\("champion",Qualification!A\$?2:A\$?9,0\)\)$/);
  });

  test('the economic buyer reference is looked up the same way', () => {
    const eb = cellAt('Scorecard', plan.namedCells.economicBuyerScore.split('!')[1] ?? '')?.formula ?? '';
    expect(eb).toContain('MATCH("economicBuyer"');
    expect(eb).not.toMatch(/Qualification!C\d+$/);
  });
});

describe('the Completion sheet is coloured with its own vocabulary', () => {
  // computeCompletion emits not_started / partial / complete. The closePlan status enum is
  // pending / in_progress / complete. One preset cannot serve both, and pointing the
  // Completion column at the closePlan preset left two of its three states uncoloured.
  test('uses a preset that matches the statuses it actually writes', () => {
    const completion = spec.sheets.find((s) => s.name === 'Completion');
    if (completion?.kind !== 'table') throw new Error('Completion must be a table sheet');
    const status = completion.tables[0].columns.find((c) => c.id === 'status');
    expect(status?.conditionalFormat).toBe('completionText');
  });

  test('every status the engine can emit is one the preset colours', () => {
    const emitted = new Set(Object.values(computeCompletion(deal).completionStatus));
    for (const status of emitted) {
      expect(COMPLETION_STATUSES).toContain(status);
    }
  });
});

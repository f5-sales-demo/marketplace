import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeCompletion } from './completion';
import type { WorkbookPlan } from './generate';
import { BOOLEAN_NO, BOOLEAN_YES, dateToSerial, FORMULA_WORDS, generateWorkbook, planWorkbook } from './generate';
import { ENUM_LABELS, enumLabel } from './labels';
import { QUALIFICATION_ELEMENTS, SECTION_LABELS, SECTION_ORDER, sectionLabel, statusLabel } from './sections';
import { estimateRowHeight, MAX_ROW_HEIGHT } from './text-metrics';
import { specTables, type WorkbookSpec } from './workbook-spec';
import { A1, COMPLETION_STATUSES, columnIndex, columnLetter } from './xlsx';
import { readZip } from './zip';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'workbook-spec.json'), 'utf8')) as WorkbookSpec;
const deal = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'example-deal.json'), 'utf8'));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const plan = planWorkbook(schema, spec, deal);
/** The workbook is one laid-out sheet, so there is nothing to choose between. */
const theSheet = () => {
  if (plan.sheets.length !== 1) throw new Error(`expected one sheet, got ${plan.sheets.length}`);
  return plan.sheets[0];
};
const cellAt = (ref: string) => {
  for (const row of theSheet().rows) {
    const c = row.cells.find((x) => x.ref === ref);
    if (c) return c;
  }
  return undefined;
};
/** Every cell of every sheet, flattened, for whole-workbook assertions. */
const allCells = () => plan.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.map((c) => ({ sheet: s.name, ...c }))));
/** The one sheet's name, from the spec, so a rename cannot leave the tests behind. */
const SHEET = spec.sheets[0].name;

/**
 * A table's geometry, from the plan rather than from counting rows.
 *
 * Nothing on one laid-out sheet has a fixed address: inserting a block above a table moves it, and
 * widening a column moves every column after it. Tests name a cell by table, column id and row
 * offset, so a layout change relocates them instead of breaking them.
 */
function table(id: string, of: WorkbookPlan = plan) {
  const found = of.tables.find((t) => t.id === id);
  if (!found) throw new Error(`no table "${id}" in the plan — have ${of.tables.map((t) => t.id).join(', ')}`);
  const column = (columnId: string) => {
    const col = found.columns[columnId];
    if (col === undefined) throw new Error(`table "${id}" has no column "${columnId}"`);
    return col;
  };
  return {
    ...found,
    column,
    /** `A1` of one column at one data-row offset. */
    ref: (columnId: string, offset: number) => A1(column(columnId), found.firstDataRow + offset),
    /** `A1` of one column's header. */
    headerRef: (columnId: string) => A1(column(columnId), found.headerRow),
  };
}
/** The character width of one table column's span, from the spec's own column sizes. */
function spanWidthOf(column: number, columnId: string): number {
  const declared = spec.sheets
    .flatMap(specTables)
    .flatMap((t) => t.columns)
    .find((c) => c.id === columnId);
  const span = declared?.span ?? 1;
  const sizes = spec.sheets[0].columns;
  let total = 0;
  for (let c = column; c < column + span; c++) {
    total += sizes.find((x) => c >= x.min && c <= x.max)?.width ?? 8.43;
  }
  return total;
}

/** The 1-based column of an A1 reference. */
const colOf = (ref: string) => columnIndex((/^([A-Z]+)/.exec(ref) as RegExpExecArray)[1]);
/** A cell of any plan, by address. */
const cellOf = (of: WorkbookPlan, ref: string) => {
  for (const s of of.sheets) for (const row of s.rows) for (const c of row.cells) if (c.ref === ref) return c;
  return undefined;
};

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
  test('a field sits on the same row as its label, to the right of it', () => {
    const input = plan.inputCells.find((c) => c.jsonPath === 'metadata.accountName');
    expect(input).toBeDefined();
    expect(input?.sheet).toBe(SHEET);
    const [, col, row] = /^([A-Z]+)(\d+)$/.exec(input?.address ?? '') ?? [];
    expect(cellAt(input?.address ?? '')?.value).toBe('Acme Corporation');
    // The label is the nearest `fieldLabel` to its left on the same row — a value with no label
    // beside it is a value nobody can read.
    const labels = theSheet()
      .rows.find((r) => r.row === Number(row))
      ?.cells.filter((c) => c.style === 'fieldLabel' && colOf(c.ref) < colOf(`${col}${row}`));
    expect(labels?.length).toBeGreaterThan(0);
    expect(labels?.at(-1)?.value).toBe('Account Name');
  });

  test('the title is the first row and every section banner is its own row', () => {
    // Column A is a gutter, so content starts at B and a banner spans B to the last content column.
    expect(cellAt('B1')?.value).toBe('MEDDPICC Deal Review');
    expect(cellAt('B1')?.style).toBe('title');
    const banners = theSheet()
      .rows.flatMap((r) => r.cells)
      .filter((c) => c.style === 'sectionHeader')
      .map((c) => c.value);
    for (const section of ['Deal', 'Revenue', 'Qualification', 'Stakeholder Analysis', 'Scorecard']) {
      expect(banners, section).toContain(section);
    }
    // Each banner is alone on its row: a section header sharing a row with a field would read as
    // a label for it.
    const bannerRows = theSheet().rows.filter((r) => r.cells.some((c) => c.style === 'sectionHeader'));
    for (const row of bannerRows) {
      expect(new Set(row.cells.map((c) => c.style)), `row ${row.row}`).toEqual(new Set(['sectionHeader']));
    }
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
    const cell = cellAt(closeDate?.address ?? '');
    expect(cell?.value).toBe(dateToSerial('2026-06-30'));
    expect(typeof cell?.value).toBe('number');
  });

  test('a percent stays the underlying fraction', () => {
    const win = plan.inputCells.find((c) => c.jsonPath === 'metadata.winProbability');
    expect(cellAt(win?.address ?? '')?.value).toBe(0.5);
  });

  test('currency is a bare number', () => {
    const acv = plan.inputCells.find((c) => c.jsonPath === 'metadata.revenue.acv');
    expect(cellAt(acv?.address ?? '')?.value).toBe(85000);
  });

  test('a boolean reads as Yes or No, not as TRUE or FALSE', () => {
    // Excel renders a real boolean in shouting capitals, which is not how a deal review answers
    // "Must say yes?". The reader accepts either spelling, so nothing is lost by writing the
    // readable one.
    const mustSayYes = plan.inputCells.filter((c) => c.jsonPath.endsWith('mustSayYes'));
    expect(mustSayYes.length).toBeGreaterThan(0);
    const values = mustSayYes.map((c) => cellAt(c.address)?.value).filter((v) => v !== undefined);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(['Yes', 'No']).toContain(v);
  });

  test('an absent value leaves the cell empty rather than writing "undefined"', () => {
    for (const c of allCells()) {
      expect(typeof c.value === 'string' ? c.value : '').not.toBe('undefined');
    }
  });
});

describe('planWorkbook — derived cells come from the schema, not from prose', () => {
  test('the element column carries the name, and no column repeats static reference text', () => {
    // The per-element definition used to sit here. It is the same eight paragraphs in every workbook,
    // and it was taking three columns from Evidence and Notes — where a rep's own words, measured at
    // up to 543 characters, were being squeezed into the narrowest column on the sheet and wrapping to
    // twenty lines. `engine hint <element>` still returns the definitions; see the follow-up issue for
    // putting them back as hover notes, which cost no height at all.
    const elements = table('elements');
    expect(Object.keys(elements.columns)).not.toContain('definition');
    const row = QUALIFICATION_ELEMENTS.indexOf('metrics');
    expect(cellAt(elements.ref('element', row))?.value).toBe(sectionLabel('metrics'));
  });

  test('the rubric cell selects the wording for that element at its own score', () => {
    // metrics scores 3 in the example deal, so the branch that fires for a 3 must carry the schema's
    // level-3 text. Asserted through the FORMULA, because the cell is a lookup now — the wording
    // follows the score in Excel rather than being frozen at generation time.
    const metricsScore = (deal.qualification.metrics as { score: number }).score;
    const rubric = schema.properties.qualification.properties.metrics.properties.scoreDefinition.default[
      String(metricsScore)
    ] as string;
    const elements = table('elements');
    const row = QUALIFICATION_ELEMENTS.indexOf('metrics');
    const formula = cellAt(elements.ref('rubric', row))?.formula ?? '';
    expect(formula).toContain(`=${metricsScore},"${rubric.replace(/"/g, '""')}"`);
  });

  test('every element gets a row, in the canonical order', () => {
    const elements = table('elements');
    const names = QUALIFICATION_ELEMENTS.map((_, i) => cellAt(elements.ref('element', i))?.value);
    expect(names).toEqual(QUALIFICATION_ELEMENTS.map(sectionLabel));
  });

  test('the completion block lists every tracked section, and each status is a live formula', () => {
    // The statuses used to be written as literals, computed from the deal at generation time: fill in
    // the missing evidence during a review and the sheet went on calling the section not started. They
    // are the engine's own rules compiled now, so Excel answers as the engine would.
    const completion = table('sections');
    const names = SECTION_ORDER.map((_, i) => cellAt(completion.ref('section', i))?.value);
    expect(names).toEqual(SECTION_ORDER.map(sectionLabel));

    for (const [row, section] of SECTION_ORDER.entries()) {
      const cell = cellAt(completion.ref('status', row));
      expect(cell?.value, section).toBeUndefined();
      const formula = cell?.formula ?? '';
      // It can only ever answer one of the three words the column is coloured by.
      for (const status of COMPLETION_STATUSES) expect(formula, section).toContain(`"${statusLabel(status)}"`);
    }
  });

  test("an element's status formula reads that element's own cells", () => {
    // Compiled against the wrong row it would be well-formed and wrong — the failure mode a formula
    // cannot show you. So the cells it names have to be the ones the plan gave that element.
    const completion = table('sections');
    const formula = cellAt(completion.ref('status', SECTION_ORDER.indexOf('champion')))?.formula ?? '';
    const address = (jsonPath: string) => plan.inputCells.find((c) => c.jsonPath === jsonPath)?.address ?? 'MISSING';
    const absolute = (ref: string) => ref.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
    expect(formula).toContain(absolute(address('qualification.champion.score')));
    expect(formula).toContain(absolute(address('qualification.champion.evidence')));
    // ...and not another element's.
    expect(formula).not.toContain(absolute(address('qualification.metrics.evidence')));
  });

  test('questions come from the schema and pair with the responses in the deal', () => {
    const questions = table('responses');
    expect(cellAt(questions.ref('question', 0))?.value).toBe(
      schema.properties.qualification.properties.metrics.properties.questions.default[0],
    );
    expect(cellAt(questions.ref('response', 0))?.value).toBe(
      (deal.qualification.metrics as { responses: string[] }).responses[0],
    );
  });
});

describe('planWorkbook — collections are not capped', () => {
  test('every stakeholder in the deal gets a row', () => {
    const names = (deal.stakeholders as Array<{ name: string }>).map((s) => s.name);
    const stakeholders = table('stakeholders');
    const written = names.map((_, i) => cellAt(stakeholders.ref('name', i))?.value);
    expect(written).toEqual(names);
  });

  test('a team larger than the legacy sheet formatted still fits', () => {
    // The F5 template formats 8 team rows and silently drops the rest. `minRows` is a floor, not a
    // ceiling, so a longer list pushes everything below it down rather than losing its tail.
    const big = JSON.parse(JSON.stringify(deal));
    big.team.internal = Array.from({ length: 14 }, (_, i) => ({ name: `Person ${i + 1}`, role: 'SE' }));
    const p = planWorkbook(schema, spec, big);
    const team = table('teamInternal', p);
    expect(team.rows).toBe(14);
    const written = Array.from({ length: 14 }, (_, i) => cellOf(p, team.ref('name', i))?.value);
    expect(written).toEqual(big.team.internal.map((m: { name: string }) => m.name));
  });

  test('an empty collection still leaves the header and the blank rows the spec asks for', () => {
    const empty = JSON.parse(JSON.stringify(deal));
    empty.stakeholders = [];
    const p = planWorkbook(schema, spec, empty);
    const stakeholders = table('stakeholders', p);
    const declared = spec.sheets.flatMap(specTables).find((t) => t.id === 'stakeholders')?.minRows;
    expect(stakeholders.rows).toBe(declared);
    expect(cellOf(p, stakeholders.headerRef('name'))?.value).toBe('Name');
    // Every padded row exists and is empty — a row that is not there cannot be typed into.
    for (let i = 0; i < stakeholders.rows; i++) {
      const cell = cellOf(p, stakeholders.ref('name', i));
      expect(cell, `row ${i}`).toBeDefined();
      expect(cell?.value, `row ${i}`).toBeUndefined();
    }
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
    const elements = table('elements');
    const cell = cellAt(plan.namedCells.scoreTotal.split('!')[1] ?? '');
    const first = elements.ref('score', 0);
    const last = elements.ref('score', elements.rows - 1);
    expect(cell?.formula).toBe(`SUM(${first}:${last})`);
  });

  test('a keyed row reference looks the key up in the table', () => {
    // Not the key's row ADDRESS: see "a keyed reference survives the user sorting the table".
    const elements = table('elements');
    const cell = cellAt(plan.namedCells.championScore.split('!')[1] ?? '');
    const scores = `${elements.ref('score', 0)}:${elements.ref('score', elements.rows - 1)}`;
    const keys = `${elements.ref('element', 0)}:${elements.ref('element', elements.rows - 1)}`;
    expect(cell?.formula).toBe(`INDEX(${scores},MATCH("${sectionLabel('champion')}",${keys},0))`);
  });

  test('one sheet means no formula needs a sheet prefix at all', () => {
    // Every reference is same-sheet now, so a prefix would be noise — and a wrong one would break
    // silently the moment the sheet were renamed.
    for (const c of allCells()) {
      expect(c.formula ?? '', c.ref).not.toContain('!');
    }
    const percent = cellAt(plan.namedCells.scorePercent.split('!')[1] ?? '');
    expect(percent?.formula).toMatch(/^IF\([A-Z]+\d+=0,0,[A-Z]+\d+\/[A-Z]+\d+\)$/);
  });

  test('{{this:…}} resolves to the same row of the same table', () => {
    // The elements table's `change` column used to be the case for this — score minus previousScore,
    // per row. Both columns are gone from the display: a reader comparing two adjacent single digits
    // does not need a third column to do it for them, and the width went to their own evidence and
    // notes instead. So this is asserted on the rubric, which still resolves `{{this:score}}` to its
    // own row's score cell — the property that matters, whichever column exercises it.
    const elements = table('elements');
    for (const offset of [0, elements.rows - 1]) {
      expect(cellAt(elements.ref('rubric', offset))?.formula).toContain(elements.ref('score', offset));
      // …and NOT another row's score, which is the mistake `{{this:…}}` exists to prevent.
      const otherRow = offset === 0 ? 1 : 0;
      expect(cellAt(elements.ref('rubric', offset))?.formula).not.toContain(elements.ref('score', otherRow));
    }
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
    const elements = table('elements', p);
    const scores = QUALIFICATION_ELEMENTS.map((_, i) => cellOf(p, elements.ref('score', i))?.value);
    expect(scores).toEqual([4, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('the maximum does not shrink when scores are missing', () => {
    // Counting the element-name column keeps the denominator at the number of elements.
    const elements = table('elements');
    const maximum = cellAt(plan.namedCells.scoreMaximum.split('!')[1] ?? '');
    const keys = `${elements.ref('element', 0)}:${elements.ref('element', elements.rows - 1)}`;
    expect(maximum?.formula).toBe(`COUNTA(${keys})*4`);
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

describe('a keyed reference survives the user re-ordering the rows', () => {
  // A formula written as `C8` means "champion" only while the rows are in their original order.
  // Sorting or re-typing them silently reports a different element under the Champion label, so a
  // keyed reference has to look the key up rather than remember where it was.
  test('resolves through MATCH on the key column rather than a fixed row', () => {
    const elements = table('elements');
    const champion = cellAt(plan.namedCells.championScore.split('!')[1] ?? '')?.formula ?? '';
    // The label as displayed, because that is what MATCH compares against: relabelling the element
    // column without relabelling the lookup fills the Scorecard with #N/A.
    expect(champion).toContain(`MATCH("${sectionLabel('champion')}"`);
    const scores = `${elements.ref('score', 0)}:${elements.ref('score', elements.rows - 1)}`;
    const keys = `${elements.ref('element', 0)}:${elements.ref('element', elements.rows - 1)}`;
    expect(champion).toBe(`INDEX(${scores},MATCH("${sectionLabel('champion')}",${keys},0))`);
  });

  test('the economic buyer reference is looked up the same way', () => {
    const elements = table('elements');
    const eb = cellAt(plan.namedCells.economicBuyerScore.split('!')[1] ?? '')?.formula ?? '';
    expect(eb).toContain(`MATCH("${sectionLabel('economicBuyer')}"`);
    // Not a bare cell in the score column, which is what "remembered where it was" looks like.
    expect(eb).not.toMatch(new RegExp(`${A1(elements.column('score'), elements.firstDataRow)}\\)?$`));
  });
});

describe('the completion block is coloured with its own vocabulary', () => {
  // computeCompletion emits not_started / partial / complete. The closePlan status enum is
  // pending / in_progress / complete. One preset cannot serve both, and pointing the
  // completion column at the closePlan preset left two of its three states uncoloured.
  test('uses a preset that matches the statuses it actually writes', () => {
    const sections = spec.sheets.flatMap(specTables).find((t) => t.id === 'sections');
    if (!sections) throw new Error('no sections table in the spec');
    const status = sections.columns.find((c) => c.id === 'status');
    expect(status?.conditionalFormat).toBe('completionText');
  });

  test('every status the engine can emit is one the preset colours', () => {
    const emitted = new Set(Object.values(computeCompletion(deal).completionStatus));
    for (const status of emitted) {
      expect(COMPLETION_STATUSES).toContain(status);
    }
  });
});

describe('a formula never compares against a spelling the cells do not use', () => {
  // A boolean cell holds the TEXT "Yes", not a logical TRUE, so `COUNTIF(range,TRUE)` counts nothing
  // and the scorecard reports 0 where the deal has 2. The count is well-formed, silently wrong, and
  // agrees with nothing — exactly the class of defect a unit test on the writer cannot see.
  test('no formula in the spec compares a boolean column against TRUE or FALSE', () => {
    const offenders: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (typeof record.formula === 'string' && /\b(TRUE|FALSE)\b/.test(record.formula)) {
        offenders.push(`${String(record.id)}: ${record.formula}`);
      }
      Object.values(record).forEach(walk);
    };
    walk(spec);
    expect(offenders).toEqual([]);
  });

  test('no formula quotes a word the label map owns', () => {
    // `COUNTIF(range,"complete")` happens to work, because Excel compares text without regard to
    // case and the cell reads "Complete". It stops working the moment that word is translated, and
    // it is a second spelling of something `labels.ts` already decides. Name the word instead.
    const owned = new Set([...Object.keys(ENUM_LABELS), ...Object.values(ENUM_LABELS)].map((w) => w.toLowerCase()));
    const offenders: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (typeof record.formula === 'string') {
        for (const m of record.formula.matchAll(/"([^"]*)"/g)) {
          if (owned.has(m[1].toLowerCase())) offenders.push(`${String(record.id)}: ${record.formula}`);
        }
      }
      Object.values(record).forEach(walk);
    };
    walk(spec);
    expect(offenders).toEqual([]);
  });

  test('every boolean input cell offers the two words as a dropdown', () => {
    // Without it Excel accepts anything, and the reader is deliberately lenient — TRUE, Y and 1 all
    // read as true. So a rep can type TRUE, have it applied to the deal, and watch the count beside
    // it stay wrong until the workbook is regenerated: a plausible-looking, incorrect deal review.
    // The dropdown is what makes the cell and the count agree in the first place.
    const declared = spec.sheets
      .flatMap(specTables)
      .flatMap((t) => t.columns.map((c) => ({ table: t.id, column: c })))
      .filter(({ column }) => column.valueType === 'boolean' && column.role === 'input');
    expect(declared.length).toBeGreaterThan(0);
    for (const { table, column } of declared) {
      expect(column.validate, `${table}.${column.id} offers no dropdown`).toBe(true);
    }

    // And the dropdown Excel is handed really is the pair the cells hold.
    const sheet = theSheet();
    const cell = plan.inputCells.find((c) => c.jsonPath.endsWith('.mustSayYes'));
    const validation = sheet.validations?.find((v) => v.sqref.split(':')[0] === cell?.address);
    expect(validation?.values).toEqual([BOOLEAN_YES, BOOLEAN_NO]);
  });

  test('every boolean count resolves to the word the cells actually hold', () => {
    const counts: Array<{ id: string; expected: number }> = [
      {
        id: 'mustSayYesCount',
        expected: (deal.stakeholders as Array<{ mustSayYes?: boolean }>).filter((s) => s.mustSayYes).length,
      },
      {
        id: 'canSayNoCount',
        expected: (deal.stakeholders as Array<{ canSayNo?: boolean }>).filter((s) => s.canSayNo).length,
      },
      {
        id: 'teamInternalAssigned',
        expected: (deal.team.internal as Array<{ assignedToDeal?: boolean }>).filter((m) => m.assignedToDeal).length,
      },
    ];
    for (const { id, expected } of counts) {
      // A count of zero would make the assertion below hold for a formula that counts nothing.
      expect(expected, id).toBeGreaterThan(0);
      const cell = cellAt(plan.namedCells[id]?.split('!')[1] ?? '');
      expect(cell?.formula, id).toBeDefined();
      expect(cell?.formula, id).toContain(`"${BOOLEAN_YES}"`);
      expect(cell?.formula, id).not.toMatch(/\bTRUE\b/);
    }
  });
});

describe('an enum reads as words, and the dropdown offers the same words', () => {
  // `in_progress` is a JSON token. The sheet is read by people in a deal review, and a status column
  // showing tokens is the defect; the deal JSON keeps the token, because it is the source of truth.
  const statusOf = (offset: number) => cellAt(table('milestones').ref('status', offset))?.value;

  test('a snake_case status is shown as words', () => {
    const statuses = (deal.closePlan.milestones as Array<{ status: string }>).map((m) => m.status);
    expect(statuses.some((v) => /_/.test(v))).toBe(true);
    for (const [i, status] of statuses.entries()) {
      expect(statusOf(i), `milestone ${i}`).toBe(enumLabel(status));
      expect(String(statusOf(i)), `milestone ${i}`).not.toMatch(/_/);
    }
  });

  test('the dropdown offers exactly what the cells show', () => {
    // Excel refuses a value that is not in the list — including one it wrote itself. A cell reading
    // "In progress" under a dropdown offering `in_progress` is a validation error on open.
    const declared = schema.properties.closePlan.properties.milestones.items.properties.status.enum as string[];
    const sheet = theSheet();
    const cell = table('milestones').ref('status', 0);
    const validation = sheet.validations?.find((v) => v.sqref.split(':')[0] === cell);
    expect(validation, `no dropdown at ${cell}`).toBeDefined();
    expect(validation?.values).toEqual(declared.map(enumLabel));
    expect(validation?.values).toContain(String(statusOf(0)));
  });

  test('free text is not relabelled, even when it reads like a status', () => {
    // The label table is applied to enum MEMBERS only. Mapping every string through it would turn a
    // note that happens to say "pending" into "Pending" — prose is not a status.
    const withProse = clone(deal);
    withProse.qualification.metrics.evidence = 'pending';
    const p = planWorkbook(schema, spec, withProse);
    const evidence = p.inputCells.find((c) => c.jsonPath === 'qualification.metrics.evidence');
    expect(cellOf(p, evidence?.address ?? '')?.value).toBe('pending');
  });
});

describe('the rubric follows the score in Excel, not just at generation time', () => {
  // A derived value written once as a literal goes stale the moment somebody changes what it derives
  // from. Change a score from 2 to 4 in the middle of a review and the cell beside it still explains
  // what a 2 means — a contradiction on the screen, in the one column whose job is to explain the
  // number next to it.
  //
  // This is a LOOKUP, not a rule: five fixed strings per element, chosen by the score. Excel can do
  // that itself. The completion statuses are deliberately left alone, because those are the engine's
  // rules and reimplementing them in formulas would be a second opinion that could disagree.
  const elements = () => table('elements');

  test('the rubric cell is a formula, not a copy of one score’s wording', () => {
    const cell = cellAt(elements().ref('rubric', QUALIFICATION_ELEMENTS.indexOf('metrics')));
    expect(cell?.formula).toBeDefined();
    expect(cell?.value).toBeUndefined();
  });

  test('it switches on that row’s own score cell', () => {
    const t = elements();
    const row = QUALIFICATION_ELEMENTS.indexOf('champion');
    const formula = cellAt(t.ref('rubric', row))?.formula ?? '';
    expect(formula).toContain(t.ref('score', row));
    // Not another row's score, which is the mistake that would look right in one place and be wrong
    // in the other seven.
    expect(formula).not.toContain(t.ref('score', row === 0 ? 1 : 0));
  });

  test('every wording the schema declares for that element is in the formula', () => {
    const t = elements();
    const row = QUALIFICATION_ELEMENTS.indexOf('metrics');
    const formula = cellAt(t.ref('rubric', row))?.formula ?? '';
    const wordings = schema.properties.qualification.properties.metrics.properties.scoreDefinition.default as Record<
      string,
      string
    >;
    expect(Object.keys(wordings).length).toBeGreaterThan(1);
    for (const [score, text] of Object.entries(wordings)) {
      // Doubled quotes: a formula string literal escapes them that way, and Excel repairs a file that
      // gets it wrong.
      expect(formula, `score ${score}`).toContain(text.replace(/"/g, '""'));
    }
  });

  test('the row is tall enough for the longest wording, not just the current one', () => {
    // The height cannot follow a formula, so it has to fit whatever the formula might show. Sizing it
    // to the current score's text clips the row the moment a longer wording is selected.
    const t = elements();
    const row = QUALIFICATION_ELEMENTS.indexOf('metrics');
    const wordings = Object.values(
      schema.properties.qualification.properties.metrics.properties.scoreDefinition.default as Record<string, string>,
    );
    const longest = wordings.reduce((a, b) => (b.length > a.length ? b : a));
    const current = wordings[String((deal.qualification.metrics as { score: number }).score) as unknown as number];
    expect(longest.length).toBeGreaterThan((current ?? '').length);
    const width = spanWidthOf(t.column('rubric'), 'rubric');
    const height = theSheet().rows.find((r) => r.row === t.firstDataRow + row)?.height ?? 0;
    expect(height).toBeGreaterThanOrEqual(estimateRowHeight(longest, width, 24));
  });
});

describe('the elements table shows the score and nothing the reader could work out', () => {
  // Previous and Change were both on display: eight previous scores and eight deltas, taking two
  // columns across the table so that a reader could see 3 beside 1 and be told the difference is 2.
  // The score itself, colour-coded, is the at-a-glance signal; the arithmetic is not. Those two columns
  // went to Evidence and Notes, which hold a rep's own words and were the narrowest on the sheet.
  test('no per-element previous score or delta column', () => {
    const columns = Object.keys(table('elements').columns);
    expect(columns).not.toContain('previousScore');
    expect(columns).not.toContain('change');
    expect(columns).toEqual(['element', 'score', 'rubric', 'evidence', 'notes']);
  });

  test('the score column is still colour-coded, which is the part worth keeping', () => {
    const declared = spec.sheets.flatMap(specTables).find((t) => t.id === 'elements');
    expect(declared?.columns.find((c) => c.id === 'score')?.conditionalFormat).toBe('score');
  });

  test('movement survives as one summary cell, and agrees with the deal', () => {
    // The previous total used to be a SUM over the column that is now gone, so the generator works it
    // out. Compared against the deal by a different route: summing the scores the engine recorded.
    const previous = deal.scoring.previousElementScores as Record<string, number>;
    const expected = QUALIFICATION_ELEMENTS.reduce((n, el) => n + (previous[el] ?? 0), 0);
    expect(expected).toBeGreaterThan(0);
    expect(cellAt(plan.namedCells.scorePreviousTotal.split('!')[1] ?? '')?.value).toBe(expected);
  });

  test('a stray key in the previous scores cannot inflate the total', () => {
    // Summed over the elements MEDDPICC scores, not over whatever keys the object happens to carry. A
    // retired element left behind by an older engine, or a typo, would otherwise be added to a total
    // the sheet presents as the last review's — and it is compared against the current score, so an
    // inflated one reads as a regression that never happened.
    const withStray = clone(deal);
    withStray.scoring.previousElementScores.retiredElement = 4;
    const p = planWorkbook(schema, spec, withStray);
    expect(cellOf(p, p.namedCells.scorePreviousTotal.split('!')[1] ?? '')?.value).toBe(
      cellAt(plan.namedCells.scorePreviousTotal.split('!')[1] ?? '')?.value,
    );
  });

  test('a deal with no previous scores leaves the cell empty rather than claiming zero', () => {
    // Nought is a real total — every element unscored last time. "We have never scored this" is not,
    // and a 0 there would read as a regression from nothing.
    const fresh = clone(deal);
    delete fresh.scoring.previousElementScores;
    const p = planWorkbook(schema, spec, fresh);
    expect(cellOf(p, p.namedCells.scorePreviousTotal.split('!')[1] ?? '')?.value).toBeUndefined();
  });

  test('the change cell is coloured by its sign', () => {
    const sheet = theSheet();
    const ref = plan.namedCells.scoreChange.split('!')[1] ?? '';
    expect(sheet.conditionalFormats?.some((f) => f.sqref === ref && f.preset === 'delta')).toBe(true);
  });
});

describe('a blank prose row has room to type into', () => {
  // A padded row is there to be typed into, and a prose cell in one is merged — so Excel cannot
  // autofit it afterwards. Left at the standard 24 points, the first sentence somebody enters is
  // clipped, with no error and nothing to click.
  //
  // There is no way to know what they will type, so the room comes from the rows above: as tall as the
  // tallest filled cell in the same column. A list of four stakeholders with two-line answers gives
  // its spare rows two lines each, which is both a better guess than one line and a tidier grid.
  test('a padded prose row is as tall as the tallest filled one in its column', () => {
    const t = table('stakeholders');
    const filled = (deal.stakeholders as unknown[]).length;
    expect(t.rows).toBeGreaterThan(filled);
    const rowHeight = (offset: number) => theSheet().rows.find((r) => r.row === t.firstDataRow + offset)?.height ?? 0;
    const tallestFilled = Math.max(...Array.from({ length: filled }, (_, i) => rowHeight(i)));
    // The filled rows have to be taller than the default, or this asserts nothing.
    expect(tallestFilled).toBeGreaterThan(24);
    for (let i = filled; i < t.rows; i++) {
      expect(rowHeight(i), `padded row ${i}`).toBe(tallestFilled);
    }
  });

  test('a list with nothing in it still gets more than one line', () => {
    const empty = clone(deal);
    empty.stakeholders = [];
    const p = planWorkbook(schema, spec, empty);
    const t = table('stakeholders', p);
    for (let i = 0; i < t.rows; i++) {
      const height = p.sheets[0].rows.find((r) => r.row === t.firstDataRow + i)?.height ?? 0;
      expect(height, `padded row ${i}`).toBeGreaterThanOrEqual(24);
    }
  });
});

describe('prose too tall for any row is reported, not clipped in silence', () => {
  // Excel's tallest row is 409.5 points, so text needing more cannot be shown in full in one row —
  // and the cell is merged, so it cannot autofit to reveal the rest either. Nothing about that is
  // fixable at generation time. What is fixable is saying so: the schema bounds none of the prose
  // fields, and a note somebody wrote at length would otherwise end mid-sentence with no indication.
  const aVeryLongNote = () => {
    const deal2 = clone(deal);
    deal2.qualification.metrics.evidence = `${'word '.repeat(600)}end`;
    return deal2;
  };

  test('an ordinary deal reports nothing', () => {
    expect(planWorkbook(schema, spec, deal).clippedCells).toEqual([]);
  });

  test('a cell that cannot fit names itself, with what it would have needed', () => {
    const plan = planWorkbook(schema, spec, aVeryLongNote());
    expect(plan.clippedCells).toHaveLength(1);
    const clipped = plan.clippedCells[0];
    expect(clipped.address).toBe(plan.inputCells.find((c) => c.jsonPath === 'qualification.metrics.evidence')?.address);
    expect(clipped.needed).toBeGreaterThan(MAX_ROW_HEIGHT);
    // The row is still written at the tallest height Excel accepts, not at the impossible one.
    const row = plan.sheets[0].rows.find((r) => r.row === clipped.row);
    expect(row?.height).toBe(MAX_ROW_HEIGHT);
  });

  test('generation still succeeds — a long note is not a reason to refuse a workbook', () => {
    expect(() => generateWorkbook(schema, spec, aVeryLongNote())).not.toThrow();
  });
});

describe('planWorkbook — a list holds exactly its padded rows', () => {
  /** The list index and row of every input cell of one list. */
  const entriesOf = (jsonPath: string, of: WorkbookPlan = plan) =>
    of.inputCells
      .filter((c) => c.jsonPath.startsWith(`${jsonPath}[`))
      .map((c) => ({
        index: Number((/\[(\d+)\]/.exec(c.jsonPath) as RegExpExecArray)[1]),
        row: Number((/(\d+)$/.exec(c.address) as RegExpExecArray)[1]),
      }));

  test('every padded row is mapped, and no row beyond them is', () => {
    // This is the whole of a list's capacity: there is no scan below the table, because the rows
    // below it belong to the next section. Overflow is reported, not read.
    const stakeholders = table('stakeholders');
    const rows = [...new Set(entriesOf('stakeholders').map((e) => e.row))].sort((a, b) => a - b);
    expect(rows).toEqual(Array.from({ length: stakeholders.rows }, (_, i) => stakeholders.firstDataRow + i));
  });

  test('the padded rows carry the list indices that follow the deal', () => {
    const stakeholders = table('stakeholders');
    const indices = [...new Set(entriesOf('stakeholders').map((e) => e.index))].sort((a, b) => a - b);
    expect(indices).toEqual(Array.from({ length: stakeholders.rows }, (_, i) => i));
    // The deal has fewer stakeholders than the table shows, so `minRows` is what set the capacity
    // and the spare rows really are spare.
    const declared = spec.sheets.flatMap(specTables).find((t) => t.id === 'stakeholders')?.minRows;
    expect((deal.stakeholders as unknown[]).length).toBeLessThan(declared as number);
    expect(stakeholders.rows).toBe(declared);
  });

  test('a computed column in a list table is NOT offered as somewhere to write', () => {
    // No shipped list table has one today, so this is the guard against adding one and having the
    // reader take its formula result as a human's entry — the one thing `read` must never do.
    const synthetic = {
      version: 1,
      sheets: [
        {
          kind: 'grid',
          name: 'People',
          columns: [
            { min: 1, max: 1, width: 3.5 },
            { min: 2, max: 3, width: 14 },
          ],
          blocks: [
            {
              kind: 'table',
              table: {
                id: 'people',
                source: { kind: 'list', jsonPath: 'stakeholders' },
                anchorColumn: 2,
                minRows: 2,
                columns: [
                  { id: 'name', header: 'Name', role: 'input', valueType: 'string', jsonPath: 'name' },
                  {
                    id: 'shout',
                    header: 'Shout',
                    role: 'computed',
                    valueType: 'string',
                    formula: 'UPPER({{this:name}})',
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as WorkbookSpec;
    const p = planWorkbook(schema, synthetic, deal);
    const people = table('people', p);
    // toStrictEqual, not toEqual: toEqual ignores undefined, so ['name', undefined] would compare
    // equal to ['name'] and this assertion could not fail if the computed column slipped through.
    expect([...new Set(p.inputCells.map((c) => c.jsonPath.replace(/\[\d+\]/, '[]')))]).toStrictEqual([
      'stakeholders[].name',
    ]);
    // And the computed column really is on the sheet — otherwise the assertion above passes for
    // the wrong reason, because nothing was rendered at all.
    expect(cellOf(p, people.ref('shout', 0))?.formula).toBeDefined();
  });
});

describe('planWorkbook — presentation', () => {
  test('every sheet hides the grid and carries a print setup', () => {
    for (const s of plan.sheets) {
      expect(s.hideGridlines, `${s.name} shows the grid`).toBe(true);
      expect(s.print?.orientation, `${s.name} print orientation`).toBe('landscape');
      expect(s.print?.fitToWidth, `${s.name} fit-to-width`).toBe(true);
    }
  });

  test('the print header names the deal, so a printout is identifiable', () => {
    // Parts, so the writer can budget each one: a joined string lets a long account name crowd
    // the deal name out entirely.
    expect(plan.sheets[0].print?.header).toStrictEqual([
      String(deal.metadata.accountName),
      String(deal.metadata.dealName),
      String(deal.metadata.dealId),
    ]);
  });

  test('the header falls back to the deal id, then to a constant, so it is never absent', () => {
    // The schema requires accountName, dealName and dealId but bounds none of them, so all three
    // can be empty strings and still validate. A printout with no header cannot be filed.
    const nameless = { ...deal, metadata: { ...deal.metadata, accountName: '', dealName: '' } };
    expect(planWorkbook(schema, spec, nameless).sheets[0].print?.header).toStrictEqual([String(deal.metadata.dealId)]);

    const anonymous = { ...deal, metadata: { ...deal.metadata, accountName: '', dealName: '', dealId: '' } };
    expect(planWorkbook(schema, spec, anonymous).sheets[0].print?.header).toStrictEqual(['MEDDPICC Deal Review']);
  });

  test('a title and every section banner span the full content width', () => {
    // A banner that stops at the label column reads as a mislabelled cell, not a heading. It spans
    // the content columns and leaves the gutter alone, so nothing touches the left edge.
    const sheet = theSheet();
    const gutter = sheet.columns?.[0];
    expect(gutter?.min).toBe(1);
    const contentStart = (gutter?.max ?? 0) + 1;
    const contentEnd = sheet.columns?.reduce((w, c) => Math.max(w, c.max), 0) ?? 0;
    expect(contentEnd).toBeGreaterThan(contentStart);
    const banners = sheet.rows.filter((r) => r.cells.some((c) => c.style === 'title' || c.style === 'sectionHeader'));
    expect(banners.length).toBeGreaterThan(1);
    for (const row of banners) {
      expect(sheet.merges ?? [], `row ${row.row}`).toContain(`${A1(contentStart, row.row)}:${A1(contentEnd, row.row)}`);
    }
  });

  test('a table sheet declares no merges, because a merge would break its table', () => {
    // Excel drops a table whose range contains a merged cell, and repairs the file to say so.
    for (const s of plan.sheets.filter((x) => x.tables?.length)) {
      expect(s.merges, `${s.name} merges`).toBeUndefined();
    }
  });
});

describe('planWorkbook — the element definitions ride along as hover notes', () => {
  /** The note on one cell of the one sheet, by address. */
  const noteAt = (ref: string, of: WorkbookPlan = plan) => of.notes.find((n) => n.sheet === SHEET && n.address === ref);

  test('every element name carries its schema definition as a note', () => {
    // The definitions are what a rep without MEDDPICC training needs and everyone else has read
    // eight times. As a column they cost three grid columns and twenty lines of height; as a note
    // they cost nothing and are still one hover away.
    const elements = table('elements');
    for (const [row, element] of QUALIFICATION_ELEMENTS.entries()) {
      const definition = schema.properties.qualification.properties[element].properties.definition.const as string;
      expect(definition, `${element} has no definition in the schema`).not.toBe('');
      expect(noteAt(elements.ref('element', row))?.text, element).toBe(definition);
    }
    expect(plan.notes.length).toBe(QUALIFICATION_ELEMENTS.length);
  });

  test('the note text is nowhere in a cell', () => {
    // The whole point is that it is not on the sheet. Written into a cell as well, it would take
    // the width and the height back — and disagree with itself the moment one copy changed.
    const definition = schema.properties.qualification.properties.metrics.properties.definition.const as string;
    for (const cell of allCells()) expect(cell.value).not.toBe(definition);
    expect(plan.proseCells.map((c) => c.text)).not.toContain(definition);
  });

  test('no row is any taller for carrying a note', () => {
    // The acceptance criterion of the issue, asserted directly: the same spec with the note flag
    // removed must produce exactly the same geometry.
    const bare = clone(spec);
    for (const sheet of bare.sheets) {
      for (const block of sheet.blocks) {
        if (block.kind !== 'table') continue;
        for (const column of block.table.columns) delete (column as { note?: string }).note;
      }
    }
    const without = planWorkbook(schema, bare, deal);
    expect(without.notes).toEqual([]);
    const heights = (of: WorkbookPlan) => of.sheets[0].rows.map((r) => `${r.row}:${r.height}`);
    expect(heights(plan)).toEqual(heights(without));
  });

  test('the workbook ships the notes Excel can show', () => {
    const parts = readZip(generateWorkbook(schema, spec, deal));
    const comments = new TextDecoder().decode(parts.get('xl/comments1.xml')?.data as Uint8Array);
    const elements = table('elements');
    const row = QUALIFICATION_ELEMENTS.indexOf('paperProcess');
    expect(comments).toContain(`ref="${elements.ref('element', row)}"`);
    expect(parts.has('xl/drawings/vmlDrawing1.vml')).toBe(true);
  });

  test('a note kind the generator does not know fails loudly', () => {
    // A silent skip would produce a workbook missing exactly the reference text this exists for,
    // and nothing on the sheet would say so.
    const broken = clone(spec);
    const elements = broken.sheets
      .flatMap((s) => s.blocks)
      .find((b) => b.kind === 'table' && b.table.id === 'elements');
    if (elements?.kind !== 'table') throw new Error('no elements table in the spec');
    const column = elements.table.columns.find((c) => c.id === 'element');
    (column as { note?: string }).note = 'somethingElse';
    expect(() => planWorkbook(schema, broken, deal)).toThrow(/somethingElse/);
  });
});

describe('planWorkbook — a blank cell something depends on is shaded', () => {
  const formatsOn = (ref: string, of: WorkbookPlan = plan) =>
    (of.sheets[0].conditionalFormats ?? []).filter((f) => f.sqref.split(':')[0] === ref);

  test('an unanswered question is wanted, not missing', () => {
    // `qualStatus` calls an element complete when ANY of its responses is non-empty, so with two
    // questions and one answer the element IS complete — and washing the blank sibling row the same red
    // as a missing evidence cell claims something mandatory is absent when nothing requires it. The row
    // is still worth seeing, so it drops a level rather than disappearing: "needs more information"
    // rather than "nothing there".
    const oneOfTwo = clone(deal);
    const metrics = oneOfTwo.qualification.metrics as { responses: string[] };
    metrics.responses = [metrics.responses[0], ''];
    expect(computeCompletion(oneOfTwo).completionStatus.metrics).toBe('complete');

    const p = planWorkbook(schema, spec, oneOfTwo);
    const responses = table('responses', p);
    const [format] = (p.sheets[0].conditionalFormats ?? []).filter(
      (f) => f.sqref.split(':')[0] === responses.ref('response', 0),
    );
    expect(format?.preset).toBe('wantedInRow');
  });

  test('the evidence column carries the wash, and the notes column does not', () => {
    const elements = table('elements');
    const evidence = formatsOn(elements.ref('evidence', 0));
    expect(evidence.map((f) => f.preset)).toEqual(['missingInRow']);
    // The row range is the table's own columns, not the sheet's width: two tables share a band of rows,
    // and a range spanning the page would let one decide whether the other's row had been started.
    const elementsSpec = spec.sheets.flatMap(specTables).find((t) => t.id === 'elements');
    const width = (elementsSpec?.columns ?? []).reduce((n, c) => n + (c.span ?? 1), 0);
    const last = columnLetter((elementsSpec?.anchorColumn ?? 0) + width - 1);
    expect(evidence[0]?.rowRange).toBe(`$B${elements.firstDataRow}:$${last}${elements.firstDataRow}`);
    expect(formatsOn(elements.ref('notes', 0))).toEqual([]);
  });

  test('a stakeholder typed into a spare row is warned about its blank required fields', () => {
    // The pre-allocated rows are the supported way to add somebody, and a conditional-format range does
    // not grow when a person starts typing in one. Stopping the range at the last existing entry meant
    // the wash was missing in exactly the case it is most use: a half-entered row, whose blank title is
    // then refused on read-back with a schema error instead of shown as a gap while it is being typed.
    const stakeholders = table('stakeholders');
    const entries = (deal.stakeholders as unknown[]).length;
    expect(stakeholders.rows).toBeGreaterThan(entries);
    const [format] = formatsOn(stakeholders.ref('name', 0));
    expect(format?.sqref).toBe(`${stakeholders.ref('name', 0)}:${stakeholders.ref('name', stakeholders.rows - 1)}`);
  });

  test('a spare row nobody has touched is left alone', () => {
    // Both things have to be true at once: the rule reaches the spare rows, and it does not fire until
    // the row has been started. Otherwise a new deal opens as a column of washes asking for work that is
    // not owed yet.
    const stakeholders = table('stakeholders');
    const [format] = formatsOn(stakeholders.ref('name', 0));
    expect(format?.preset).toBe('missingInRow');
    expect(format?.rowRange).toBeDefined();
  });

  test('an empty list is covered, and still shows nothing', () => {
    const empty = clone(deal);
    empty.stakeholders = [];
    const p = planWorkbook(schema, spec, empty);
    const stakeholders = table('stakeholders', p);
    const [format] = formatsOn(stakeholders.ref('name', 0), p);
    expect(format?.preset).toBe('missingInRow');
  });

  test('a form field the schema requires is shaded when empty', () => {
    const address = plan.namedCells.accountName?.split('!')[1] ?? '';
    expect(address).not.toBe('');
    expect(formatsOn(address).map((f) => f.preset)).toEqual(['missing']);
  });

  test('no cell carries two washes', () => {
    // Two rules over one cell means one paints over the other, decided by a priority nobody chose.
    const byCell = new Map<string, number>();
    for (const format of plan.sheets[0].conditionalFormats ?? []) {
      const first = format.sqref.split(':')[0];
      byCell.set(first, (byCell.get(first) ?? 0) + 1);
    }
    expect([...byCell.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });
});

describe('planWorkbook — a completion block can sit anywhere in the spec', () => {
  test('a Completion sheet placed BEFORE the inputs still compiles', () => {
    // The statuses used to be compiled at the end of each sheet, against the input cells known so far —
    // so a two-sheet spec that passes check-spec failed to generate when the Completion block came
    // first, with "the sheet has no cell for qualification.metrics.score". Loud rather than silent, but
    // a valid spec should not depend on the order its sheets happen to be written in.
    //
    // Built by MOVING the shipped Completion block onto its own sheet and putting that sheet first, so
    // every cell the thirteen rules name exists exactly as it does today and the only thing that
    // changes is the order.
    const reordered = clone(spec);
    const blocks = reordered.sheets[0].blocks;
    const at = blocks.findIndex((b) => b.kind === 'table' && b.table.id === 'sections');
    expect(at, 'the shipped spec has a sections table').toBeGreaterThan(-1);
    const [completionBlock] = blocks.splice(at, 1);
    reordered.sheets.unshift({
      name: 'Completion',
      kind: 'grid',
      columns: reordered.sheets[0].columns,
      blocks: [completionBlock],
    });

    const p = planWorkbook(schema, reordered, deal);
    const statuses = p.sheets[0].rows.flatMap((r) => r.cells).filter((c) => c.formula?.includes('Not started'));
    expect(statuses).toHaveLength(SECTION_ORDER.length);
    // And each one names the sheet the cells are on, since that is no longer its own.
    for (const cell of statuses) expect(cell.formula).toContain(`${spec.sheets[0].name}'!`);
  });
});

describe('planWorkbook — the row a wash asks about is its own table’s row', () => {
  /** A sheet with two narrow lists side by side, the way the Close Plan and the Team are laid out. */
  const sideBySide = (): WorkbookSpec =>
    ({
      version: 1,
      sheets: [
        {
          kind: 'grid',
          name: 'Lists',
          columns: [
            { min: 1, max: 1, width: 3.5 },
            { min: 2, max: 17, width: 14 },
          ],
          blocks: [
            {
              kind: 'table',
              table: {
                id: 'left',
                source: { kind: 'list', jsonPath: 'closePlan.milestones' },
                anchorColumn: 2,
                minRows: 3,
                columns: [
                  { id: 'title', header: 'Milestone', role: 'input', valueType: 'string', jsonPath: 'title', span: 4 },
                  {
                    id: 'owner',
                    header: 'Owner',
                    role: 'input',
                    valueType: 'string',
                    jsonPath: 'owner',
                    span: 4,
                    shadeWhenEmpty: true,
                  },
                ],
              },
            },
            {
              kind: 'table',
              table: {
                id: 'right',
                source: { kind: 'list', jsonPath: 'team.internal' },
                anchorColumn: 10,
                minRows: 3,
                columns: [
                  { id: 'name', header: 'Name', role: 'input', valueType: 'string', jsonPath: 'name', span: 4 },
                  {
                    id: 'role',
                    header: 'Role',
                    role: 'input',
                    valueType: 'string',
                    jsonPath: 'role',
                    span: 4,
                    shadeWhenEmpty: true,
                  },
                ],
              },
            },
          ],
        },
      ],
    }) as unknown as WorkbookSpec;

  test('a narrow table asks about its own columns, not the width of the sheet', () => {
    // Two lists share a band of rows. A row range spanning the page would let the milestones decide
    // whether a team member's row had been started — and they are different lists, so a milestone
    // typed on that row would suppress the wash on an empty name beside it, or raise one on a row
    // nobody had touched.
    const p = planWorkbook(schema, sideBySide(), deal);
    const formats = p.sheets[0].conditionalFormats ?? [];
    const left = table('left', p);
    const right = table('right', p);
    const rangeOf = (ref: string) => formats.find((f) => f.sqref.startsWith(`${ref}:`))?.rowRange;
    expect(rangeOf(left.ref('owner', 0))).toBe(`$B${left.firstDataRow}:$I${left.firstDataRow}`);
    expect(rangeOf(right.ref('role', 0))).toBe(`$J${right.firstDataRow}:$Q${right.firstDataRow}`);
  });
});

describe('a formula word carries text the writer does not control', () => {
  test('a literal quote is doubled, as Excel requires', () => {
    // `"He said "yes""` closes the string at the first inner quote; Excel needs `"He said ""yes"""`. Latent
    // while every FORMULA_WORDS value is one plain word, and live once #925 supplies translations, where a
    // quotation mark is unremarkable.
    //
    // Exercised through the real resolver by giving a spec formula a word whose value contains a quote —
    // asserting balance over today's formulas would pass with the bug present, since none has a quote in it.
    const quoted = clone(spec);
    const block = quoted.sheets[0].blocks.find((b) => b.cells?.some((c) => typeof c.formula === 'string'));
    const cell = block?.cells?.find((c) => typeof c.formula === 'string');
    if (!cell) throw new Error('no formula cell in the spec — the fixture needs revisiting');
    cell.formula = 'IF(1=1,{{word:statusComplete}},"")';
    const emitted = planWorkbook(schema, quoted, deal)
      .sheets.flatMap((sh) => sh.rows)
      .flatMap((r) => r.cells)
      .map((c) => c.formula)
      .filter((f): f is string => typeof f === 'string');
    // Every emitted formula must have balanced quotes: an odd count means one ended a string it should not.
    for (const formula of emitted) {
      expect((formula.match(/"/g) ?? []).length % 2, formula).toBe(0);
    }
  });

  test('a word whose value contains a quote is emitted doubled', () => {
    const withQuote = clone(spec);
    const block = withQuote.sheets[0].blocks.find((b) => b.cells?.some((c) => typeof c.formula === 'string'));
    const cell = block?.cells?.find((c) => typeof c.formula === 'string');
    if (!cell) throw new Error('no formula cell in the spec');
    cell.formula = 'IF(1=1,{{word:quoteCarrier}},"")';
    FORMULA_WORDS.quoteCarrier = 'He said "yes"';
    try {
      const emitted = planWorkbook(schema, withQuote, deal)
        .sheets.flatMap((sh) => sh.rows)
        .flatMap((r) => r.cells)
        .map((c) => c.formula)
        .filter((f): f is string => typeof f === 'string')
        .find((f) => f.includes('He said'));
      expect(emitted).toContain('"He said ""yes"""');
    } finally {
      delete FORMULA_WORDS.quoteCarrier;
    }
  });

  test('a completion status carrying a quote is doubled in the compiled formula', () => {
    // The second of four sinks, and the one my first attempt missed. That attempt asserted "some formula
    // contains a doubled quote", which the WORD sink satisfied on its own — so reverting this sink left the
    // test green. The assertion has to name this sink's own text.
    ENUM_LABELS.complete = 'Done "fully"';
    try {
      const formulas = planWorkbook(schema, clone(spec), deal)
        .sheets.flatMap((sh) => sh.rows)
        .flatMap((r) => r.cells)
        .map((c) => c.formula)
        .filter((f): f is string => typeof f === 'string')
        .filter((f) => f.includes('Done'));
      expect(formulas.length).toBeGreaterThan(0);
      for (const f of formulas) expect(f, f).toContain('"Done ""fully"""');
    } finally {
      ENUM_LABELS.complete = 'Complete';
    }
  });

  test('every conditional-format rule builds its literal with excelString', () => {
    // The third sink cannot be reached at runtime: CF_PRESETS is a module constant built at import from
    // `enumLabel`, so mutating a label afterwards cannot change it — and a hand-quoted literal and an
    // excelString one are the same bytes for today's quote-free labels. There is nothing to observe.
    //
    // So this reads the source, narrowly: every `formulas:` entry inside the CF_PRESETS block must call
    // excelString. A source check is the honest tool for "this construction must not appear", and scoping it
    // to one block keeps it from being brittle.
    const src = fs.readFileSync(path.join(here, 'xlsx.ts'), 'utf8');
    const start = src.indexOf('export const CF_PRESETS');
    const block = src.slice(start, src.indexOf('\n};', start));
    // Every rule that interpolates a LABEL must go through excelString. A rule with a literal Excel string
    // in it — `overdueDate` compares against `""`, the empty string — is not a label and is out of scope.
    const labelRules = block.split('\n').filter((l) => l.includes('formulas:') && l.includes('enumLabel('));
    expect(labelRules.length).toBeGreaterThan(0);
    for (const line of labelRules) expect(line.trim(), line.trim()).toContain('excelString(');
  });

  test('the INDEX/MATCH section-label sink is not reachable from the shipped spec', () => {
    // Stated rather than claimed covered. `sectionLabel` reaches a formula only through the keyed-table
    // INDEX/MATCH path, and the shipped spec never takes it — a quote injected into SECTION_LABELS appears in
    // zero formulas. It goes through excelString like the others, but nothing here exercises it, and saying
    // so beats a test that looks like coverage and is not.
    (SECTION_LABELS as Record<string, string>).metrics = 'Met "rics"';
    try {
      const formulas = planWorkbook(schema, clone(spec), deal)
        .sheets.flatMap((sh) => sh.rows)
        .flatMap((r) => r.cells)
        .map((c) => c.formula)
        .filter((f): f is string => typeof f === 'string');
      expect(formulas.filter((f) => f.includes('Met ')).length).toBe(0);
    } finally {
      (SECTION_LABELS as Record<string, string>).metrics = 'Metrics';
    }
  });
});

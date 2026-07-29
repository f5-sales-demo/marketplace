import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOOLEAN_NO, BOOLEAN_YES, dateToSerial, generateWorkbook, planWorkbook } from './generate';
import { readPath } from './json-path';
import { readWorkbook, readWorkbookCells, readWorkbookProperty, serialToDate } from './read-workbook';
import { validateDeal } from './validate';
import { specTables, type WorkbookSpec } from './workbook-spec';
import { buildWorkbook } from './xlsx';
import { readZip, writeZip } from './zip';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'workbook-spec.json'), 'utf8')) as WorkbookSpec;
const exampleDeal = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'example-deal.json'), 'utf8'));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The workbook's one sheet. Read from the spec so a rename cannot leave the tests behind. */
const SHEET = spec.sheets[0].name;

/**
 * Where a sheet's part lives, derived from the spec's own order rather than by asking the
 * reader. The test has to locate parts independently, or a reader that resolved the wrong
 * sheet would agree with a helper making the same mistake.
 */
function sheetPart(sheetName: string): string {
  const index = spec.sheets.findIndex((s) => s.name === sheetName);
  if (index < 0) throw new Error(`no sheet "${sheetName}" in the spec`);
  return `xl/worksheets/sheet${index + 1}.xml`;
}

/** The address of the input cell for a jsonPath, as the generator placed it. */
function addressOf(deal: unknown, jsonPath: string): { sheet: string; address: string } {
  const found = planWorkbook(schema, spec, deal).inputCells.find((c) => c.jsonPath === jsonPath);
  if (!found) throw new Error(`no input cell for ${jsonPath}`);
  return { sheet: found.sheet, address: found.address };
}

/** Rewrite one `<c>` element in a generated workbook — a hand edit, without Excel. */
function withCell(bytes: Uint8Array, sheetName: string, ref: string, cellXml: string): Uint8Array {
  const entries = readZip(bytes);
  const part = sheetPart(sheetName);
  const entry = entries.get(part);
  if (!entry) throw new Error(`no part ${part}`);
  const xml = new TextDecoder().decode(entry.data);
  // The attribute run is **lazy**. Greedy, `[^>]*` swallows the `/` of a self-closing
  // `<c r="B60" s="0"/>`, the `/>` branch then cannot match, and `>.*?</c>` runs on to the next
  // cell's closing tag — so the replacement silently deletes every cell in between. Blank cells
  // carried no attributes before this layout gave each one a style, which is why it went unseen.
  const pattern = new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>.*?</c>)`);
  if (!pattern.test(xml)) throw new Error(`cell ${ref} not found in ${part}`);
  const updated = xml.replace(pattern, cellXml);
  const count = (s: string) => (s.match(/<c /g) ?? []).length;
  if (count(updated) !== count(xml)) {
    throw new Error(`rewriting ${ref} changed the cell count ${count(xml)} -> ${count(updated)}`);
  }
  return writeZip(
    [...entries.values()].map((e) =>
      e.name === part ? { name: e.name, data: new TextEncoder().encode(updated) } : { name: e.name, raw: e },
    ),
  );
}

/** Type into a cell that does not exist yet — what Excel does when a Table grows. */
function addCell(bytes: Uint8Array, sheetName: string, ref: string, cellXml: string): Uint8Array {
  const entries = readZip(bytes);
  const part = sheetPart(sheetName);
  const entry = entries.get(part);
  if (!entry) throw new Error(`no part ${part}`);
  const xml = new TextDecoder().decode(entry.data);
  if (new RegExp(`<c r="${ref}"`).test(xml)) throw new Error(`cell ${ref} already exists in ${part}`);
  const row = /(\d+)$/.exec(ref)?.[1];
  const existingRow = new RegExp(`<row r="${row}"(?: [^>]*)?>`).exec(xml);
  const updated = existingRow
    ? xml.replace(existingRow[0], `${existingRow[0]}${cellXml}`)
    : xml.replace('</sheetData>', `<row r="${row}">${cellXml}</row></sheetData>`);
  return writeZip(
    [...entries.values()].map((e) =>
      e.name === part ? { name: e.name, data: new TextEncoder().encode(updated) } : { name: e.name, raw: e },
    ),
  );
}

const setNumber = (bytes: Uint8Array, sheet: string, ref: string, value: number) =>
  withCell(bytes, sheet, ref, `<c r="${ref}"><v>${value}</v></c>`);
const setText = (bytes: Uint8Array, sheet: string, ref: string, text: string) =>
  withCell(bytes, sheet, ref, `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`);
const setBlank = (bytes: Uint8Array, sheet: string, ref: string) => withCell(bytes, sheet, ref, `<c r="${ref}"/>`);

/**
 * Re-save the way Excel does: every inline string moves into `xl/sharedStrings.xml` and the
 * cell becomes `t="s"` with an index.
 *
 * This is the difference between a reader that works on its own output and one that works on
 * the only file that matters — the one a human edited and saved.
 */
function asExcelWouldSave(bytes: Uint8Array): Uint8Array {
  const entries = readZip(bytes);
  const strings: string[] = [];
  const rewritten = new Map<string, string>();

  for (const entry of entries.values()) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)) continue;
    const xml = new TextDecoder().decode(entry.data);
    rewritten.set(
      entry.name,
      xml.replace(
        /<c r="([A-Z]+\d+)"((?: [^>]*)?) t="inlineStr">.*?<t[^>]*>(.*?)<\/t>.*?<\/c>/g,
        (_m, ref, attrs, text) => {
          let index = strings.indexOf(text);
          if (index < 0) {
            strings.push(text);
            index = strings.length - 1;
          }
          return `<c r="${ref}"${attrs} t="s"><v>${index}</v></c>`;
        },
      ),
    );
  }

  const sharedStrings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    // Excel splits a string into runs; the reader has to join every <t> inside one <si>.
    strings.map((s) => `<si><r><t>${s.slice(0, 1)}</t></r><r><t>${s.slice(1)}</t></r></si>`).join('') +
    `</sst>`;

  const relsName = 'xl/_rels/workbook.xml.rels';
  const rels = new TextDecoder().decode(entries.get(relsName)?.data ?? new Uint8Array());
  const withRel = rels.replace(
    '</Relationships>',
    `<Relationship Id="rIdShared" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  const types = new TextDecoder().decode(entries.get('[Content_Types].xml')?.data ?? new Uint8Array());
  const withType = types.replace(
    '</Types>',
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
  );

  const enc = (s: string) => new TextEncoder().encode(s);
  return writeZip([
    ...[...entries.values()].map((e) => {
      if (rewritten.has(e.name)) return { name: e.name, data: enc(rewritten.get(e.name) as string) };
      if (e.name === relsName) return { name: e.name, data: enc(withRel) };
      if (e.name === '[Content_Types].xml') return { name: e.name, data: enc(withType) };
      return { name: e.name, raw: e };
    }),
    { name: 'xl/sharedStrings.xml', data: enc(sharedStrings) },
  ]);
}

const read = (deal: unknown, bytes: Uint8Array) => readWorkbook(schema, spec, deal, bytes);

describe('serialToDate', () => {
  test('inverts dateToSerial', () => {
    for (const iso of ['1900-01-01', '2026-06-30', '2026-02-28', '2099-12-31']) {
      expect(serialToDate(dateToSerial(iso) as number)).toBe(iso);
    }
  });

  test('a serial carrying a time of day still names its day', () => {
    expect(serialToDate(46203.75)).toBe('2026-06-30');
  });

  test('refuses a serial that is not a date', () => {
    expect(serialToDate(-1)).toBeNull();
    expect(serialToDate(Number.NaN)).toBeNull();
    expect(serialToDate(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('readWorkbookCells', () => {
  test('finds cells by sheet name, not by part order', () => {
    const cells = readWorkbookCells(generateWorkbook(schema, spec, exampleDeal));
    expect([...cells.keys()]).toEqual(spec.sheets.map((s) => s.name));
    const { sheet, address } = addressOf(exampleDeal, 'metadata.accountName');
    expect(cells.get(sheet)?.get(address)?.text).toBe('Acme Corporation');
  });

  test('a formula cell is reported as a formula, with no value to mistake for one', () => {
    const cells = readWorkbookCells(generateWorkbook(schema, spec, exampleDeal));
    const scorecard = cells.get(SHEET);
    const formulas = [...(scorecard?.values() ?? [])].filter((c) => c.formula !== undefined);
    expect(formulas.length).toBeGreaterThan(0);
    for (const cell of formulas) expect(cell.text).toBeUndefined();
  });
});

describe('round-trip identity', () => {
  test('generate then read the same deal proposes nothing', () => {
    const report = read(exampleDeal, generateWorkbook(schema, spec, exampleDeal));
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.cellsRead).toBeGreaterThan(100);
  });

  test('survives the save Excel performs — shared strings, not inline', () => {
    const saved = asExcelWouldSave(generateWorkbook(schema, spec, exampleDeal));
    const report = read(exampleDeal, saved);
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toEqual([]);
  });

  test('a date whose JSON value carries a time is not reported as an edit', () => {
    // A date cell can only hold a day. Comparing the cell's `2026-06-30` against the JSON's
    // `2026-06-30T09:15:00Z` as strings would report a phantom edit on every single read.
    const deal = clone(exampleDeal);
    deal.metadata.closeDate = '2026-06-30T09:15:00Z';
    expect(validateDeal(deal, schema).valid).toBe(true);
    const report = read(deal, generateWorkbook(schema, spec, deal));
    expect(report.proposals).toEqual([]);
  });

  test('an element with no score reads back as unchanged, not as a proposal to set 0', () => {
    // The generator writes an unscored element as 0 on purpose, so a 0 in the sheet cannot be
    // told apart from "not assessed" — and must not become a proposal on every read.
    const deal = clone(exampleDeal);
    delete deal.qualification.champion.score;
    const report = read(deal, generateWorkbook(schema, spec, deal));
    expect(report.proposals).toEqual([]);
  });
});

describe('proposals', () => {
  test('a changed string cell proposes exactly that change', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.accountName');
    const edited = setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Globex Corporation');
    const report = read(exampleDeal, edited);
    expect(report.proposals).toEqual([
      {
        jsonPath: 'metadata.accountName',
        sheet,
        address,
        valueType: 'string',
        kind: 'set',
        from: 'Acme Corporation',
        to: 'Globex Corporation',
      },
    ]);
    expect(report.rejections).toEqual([]);
  });

  test('a changed score proposes the new number', () => {
    const { sheet, address } = addressOf(exampleDeal, 'qualification.champion.score');
    expect(exampleDeal.qualification.champion.score).toBe(4);
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, 2));
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({
      jsonPath: 'qualification.champion.score',
      from: 4,
      to: 2,
      kind: 'set',
    });
  });

  test('a changed date comes back as an ISO date, not a serial', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.closeDate');
    const serial = dateToSerial('2026-09-15') as number;
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, serial));
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ from: '2026-06-30', to: '2026-09-15' });
  });

  test('a score added where the JSON had none is an addition', () => {
    const deal = clone(exampleDeal);
    delete deal.qualification.champion.score;
    const { sheet, address } = addressOf(deal, 'qualification.champion.score');
    const report = read(deal, setNumber(generateWorkbook(schema, spec, deal), sheet, address, 3));
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ kind: 'add', from: undefined, to: 3 });
  });

  test('a blanked cell proposes clearing the value', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.reviewer');
    const report = read(exampleDeal, setBlank(generateWorkbook(schema, spec, exampleDeal), sheet, address));
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ kind: 'clear', from: 'Jane Smith', to: null });
    expect((report.deal as { metadata: Record<string, unknown> }).metadata.reviewer).toBeUndefined();
  });

  test('an edit lands in the returned deal, and the original is untouched', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.dealName');
    const edited = setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Renewal FY27');
    const report = read(exampleDeal, edited);
    expect((report.deal as { metadata: { dealName: string } }).metadata.dealName).toBe('Renewal FY27');
    expect(exampleDeal.metadata.dealName).not.toBe('Renewal FY27');
    expect(report.valid).toBe(true);
  });
});

describe('cells that are not inputs are never read', () => {
  test('a hand-edited computed cell proposes nothing', () => {
    // The Scorecard total is a formula. Typing over it in Excel replaces the formula with a
    // number; the engine recomputes it, so taking that number into the JSON would be a lie.
    const cells = readWorkbookCells(generateWorkbook(schema, spec, exampleDeal));
    const formulaRef = [...(cells.get(SHEET)?.entries() ?? [])].find(([, c]) => c.formula !== undefined)?.[0];
    expect(formulaRef).toBeDefined();
    const edited = setNumber(generateWorkbook(schema, spec, exampleDeal), SHEET, formulaRef as string, 999);
    expect(read(exampleDeal, edited).proposals).toEqual([]);
  });

  test('a derived cell — the rubric text — proposes nothing', () => {
    const cells = readWorkbookCells(generateWorkbook(schema, spec, exampleDeal));
    const qualification = cells.get(SHEET);
    const derived = [...(qualification?.entries() ?? [])].find(([, c]) => c.text?.startsWith('Quantified'))?.[0];
    expect(derived).toBeDefined();
    const edited = setText(generateWorkbook(schema, spec, exampleDeal), SHEET, derived as string, 'nonsense');
    expect(read(exampleDeal, edited).proposals).toEqual([]);
  });
});

describe('rejections name the cell, and never reach the deal', () => {
  test('a formula typed into an input cell is refused', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.revenue.acv');
    const edited = withCell(
      generateWorkbook(schema, spec, exampleDeal),
      sheet,
      address,
      `<c r="${address}"><f>B10*2</f><v>500000</v></c>`,
    );
    const report = read(exampleDeal, edited);
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0]).toMatchObject({ sheet, address, jsonPath: 'metadata.revenue.acv' });
    expect(report.rejections[0].reason).toMatch(/formula/i);
    expect(report.ok).toBe(false);
  });

  test('a score outside the schema range is refused', () => {
    const { sheet, address } = addressOf(exampleDeal, 'qualification.champion.score');
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, 7));
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0]).toMatchObject({ sheet, address });
    expect(report.rejections[0].reason).toMatch(/4/);
  });

  test('a value outside an enum is refused, and the enum is quoted back', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.dealStatus');
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Maybe'));
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0].reason).toMatch(/Discovery/);
    expect((report.deal as { metadata: { dealStatus: string } }).metadata.dealStatus).toBe(
      exampleDeal.metadata.dealStatus,
    );
  });

  test('prose in a currency cell is refused rather than coerced to NaN', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.revenue.acv');
    const report = read(
      exampleDeal,
      setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'about 500k'),
    );
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0].reason).toMatch(/number/i);
    expect(report.proposals).toEqual([]);
  });

  test('a fractional score is refused — 0-4 is an integer scale', () => {
    const { sheet, address } = addressOf(exampleDeal, 'qualification.champion.score');
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, 2.5));
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0].reason).toMatch(/whole number/i);
  });

  test('the returned deal still validates when a cell was rejected', () => {
    const { sheet, address } = addressOf(exampleDeal, 'qualification.champion.score');
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, 7));
    expect(report.valid).toBe(true);
    expect(validateDeal(report.deal, schema).valid).toBe(true);
  });
});

describe('list rows', () => {
  const listPath = (index: number, field: string) => `stakeholders[${index}].${field}`;

  test('filling the first padded row appends a new item', () => {
    const count = exampleDeal.stakeholders.length;
    const { sheet, address } = addressOf(exampleDeal, listPath(count, 'name'));
    const report = read(
      exampleDeal,
      setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Dana Reyes'),
    );
    expect(report.rejections).toEqual([]);
    const stakeholders = (report.deal as { stakeholders: Array<{ name: string }> }).stakeholders;
    expect(stakeholders).toHaveLength(count + 1);
    expect(stakeholders[count].name).toBe('Dana Reyes');
  });

  test('two fields of the same new row make one item, not two', () => {
    const count = exampleDeal.stakeholders.length;
    let bytes = generateWorkbook(schema, spec, exampleDeal);
    const name = addressOf(exampleDeal, listPath(count, 'name'));
    const title = addressOf(exampleDeal, listPath(count, 'title'));
    bytes = setText(bytes, name.sheet, name.address, 'Dana Reyes');
    bytes = setText(bytes, title.sheet, title.address, 'VP Platform');
    const report = read(exampleDeal, bytes);
    const stakeholders = (report.deal as { stakeholders: Array<{ name: string; title: string }> }).stakeholders;
    expect(stakeholders).toHaveLength(count + 1);
    expect(stakeholders[count]).toMatchObject({ name: 'Dana Reyes', title: 'VP Platform' });
  });

  test('skipping a row is refused — an array cannot have a hole', () => {
    const count = exampleDeal.stakeholders.length;
    const { sheet, address } = addressOf(exampleDeal, listPath(count + 1, 'name'));
    const report = read(
      exampleDeal,
      setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Dana Reyes'),
    );
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0]).toMatchObject({ sheet, address });
    expect(report.rejections[0].reason).toMatch(/row/i);
    expect((report.deal as { stakeholders: unknown[] }).stakeholders).toHaveLength(count);
  });

  test('consecutive new rows are both appended', () => {
    const count = exampleDeal.stakeholders.length;
    let bytes = generateWorkbook(schema, spec, exampleDeal);
    for (const [offset, who] of [
      [0, 'Dana Reyes'],
      [1, 'Sam Okafor'],
    ] as const) {
      const at = addressOf(exampleDeal, listPath(count + offset, 'name'));
      bytes = setText(bytes, at.sheet, at.address, who);
    }
    const report = read(exampleDeal, bytes);
    expect(report.rejections).toEqual([]);
    const stakeholders = (report.deal as { stakeholders: Array<{ name: string }> }).stakeholders;
    expect(stakeholders.map((s) => s.name).slice(count)).toEqual(['Dana Reyes', 'Sam Okafor']);
  });

  test('answering the last question first is refused — the answers before it are still blank', () => {
    // The Questions sheet has a row per question the schema declares, so an element with no
    // answers yet still shows two rows. Filling the second would write responses[1] into an
    // empty array, and `["", "answer"]` reads as "question one was answered blankly".
    const deal = clone(exampleDeal);
    deal.qualification.metrics.responses = [];
    const { sheet, address } = addressOf(deal, 'qualification.metrics.responses[1]');
    const report = read(deal, setText(generateWorkbook(schema, spec, deal), sheet, address, 'Second answer'));
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0]).toMatchObject({ sheet, address });
    expect(report.rejections[0].reason).toMatch(/row/i);
  });

  test('answering the first question appends to an empty answer list', () => {
    const deal = clone(exampleDeal);
    deal.qualification.metrics.responses = [];
    const { sheet, address } = addressOf(deal, 'qualification.metrics.responses[0]');
    const report = read(deal, setText(generateWorkbook(schema, spec, deal), sheet, address, 'First answer'));
    expect(report.rejections).toEqual([]);
    expect(
      (report.deal as { qualification: { metrics: { responses: string[] } } }).qualification.metrics.responses,
    ).toEqual(['First answer']);
  });

  test('an edit to an existing row changes that row and no other', () => {
    const { sheet, address } = addressOf(exampleDeal, listPath(1, 'name'));
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Renamed'));
    const stakeholders = (report.deal as { stakeholders: Array<{ name: string }> }).stakeholders;
    expect(stakeholders[1].name).toBe('Renamed');
    expect(stakeholders[0].name).toBe(exampleDeal.stakeholders[0].name);
    expect(stakeholders).toHaveLength(exampleDeal.stakeholders.length);
  });
});

describe('what Excel does to a value on the way back', () => {
  test('a date whose type Excel spelled out as "n" is still a date', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.closeDate');
    const serial = dateToSerial('2026-09-15') as number;
    const edited = withCell(
      generateWorkbook(schema, spec, exampleDeal),
      sheet,
      address,
      `<c r="${address}" t="n"><v>${serial}</v></c>`,
    );
    const report = read(exampleDeal, edited);
    expect(report.rejections).toEqual([]);
    expect(report.proposals[0]).toMatchObject({ to: '2026-09-15' });
  });

  test('a number a rounding step away from the deal is not an edit', () => {
    // Excel re-saves 85000 as 85000.000000000001 often enough that comparing exactly would
    // propose a change to a figure nobody touched.
    const { sheet, address } = addressOf(exampleDeal, 'metadata.revenue.acv');
    const drifted = (exampleDeal.metadata.revenue.acv as number) * (1 + 1e-13);
    expect(drifted).not.toBe(exampleDeal.metadata.revenue.acv);
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, drifted));
    expect(report.proposals).toEqual([]);
  });

  test('a number that really moved is an edit', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.revenue.acv');
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, 85001));
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ from: 85000, to: 85001 });
  });

  test('XML entities come back as the characters they stand for', () => {
    const { sheet, address } = addressOf(exampleDeal, 'metadata.dealName');
    const edited = setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'R&amp;D &lt;Phase 3&gt;');
    const report = read(exampleDeal, edited);
    expect(report.proposals[0]).toMatchObject({ to: 'R&D <Phase 3>' });
  });

  test('a cell holding an Excel error is refused, not read as text', () => {
    // On a text cell this is the only thing standing between `#REF!` and the deal JSON:
    // nothing else about the string "#REF!" is invalid.
    const { sheet, address } = addressOf(exampleDeal, 'metadata.reviewer');
    const edited = withCell(
      generateWorkbook(schema, spec, exampleDeal),
      sheet,
      address,
      `<c r="${address}" t="e"><v>#REF!</v></c>`,
    );
    const report = read(exampleDeal, edited);
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0].reason).toMatch(/#REF!/);
  });
});

describe('clearing a value', () => {
  test('a cleared response keeps the positions of the answers around it', () => {
    // Responses answer questions by position, so removing the element would silently
    // re-attach every later answer to the wrong question.
    const responses = exampleDeal.qualification.metrics.responses as string[];
    expect(responses.length).toBeGreaterThan(1);
    const { sheet, address } = addressOf(exampleDeal, 'qualification.metrics.responses[0]');
    const report = read(exampleDeal, setBlank(generateWorkbook(schema, spec, exampleDeal), sheet, address));
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ kind: 'clear' });
    const after = (report.deal as { qualification: { metrics: { responses: string[] } } }).qualification.metrics
      .responses;
    expect(after).toHaveLength(responses.length);
    expect(after[0]).toBe('');
    expect(after[1]).toBe(responses[1]);
  });
});

describe('a list holds exactly its padded rows — anything below is reported', () => {
  /**
   * One laid-out sheet has no free rows under a table: the row below the last padded stakeholder is
   * the gap before the next section's banner, and the banner itself is two rows down. So a list's
   * capacity is the rows the generator pre-allocated, and content typed past them is reported with
   * what to do about it rather than read as a new entry.
   *
   * The eight-tab workbook read those rows, because an Excel Table auto-extended when you typed
   * under it and each table owned the tail of its own sheet. Neither is true here — a table whose
   * range contains a merged cell is dropped by Excel, so there are no Tables left to extend — and a
   * downward scan on one sheet would eventually read the next section's own text as a list row.
   */
  function fullDeal(): Record<string, unknown> {
    const deal = clone(exampleDeal);
    const table = spec.sheets.flatMap(specTables).find((x) => x.id === 'stakeholders');
    if (!table) throw new Error('no stakeholders table in the spec');
    const padded = table.minRows;
    if (typeof padded !== 'number') throw new Error('the stakeholders table declares no minRows');
    deal.stakeholders = Array.from({ length: padded }, (_, i) => ({
      name: `Person ${i + 1}`,
      title: 'VP',
      roleInDeal: 'Influencer',
    }));
    return deal;
  }

  /** The address one row below the last row the plan maps, for a given stakeholder column. */
  function firstUnmappedCell(deal: unknown, relativePath: string): { sheet: string; address: string; column: string } {
    const cells = planWorkbook(schema, spec, deal).inputCells.filter(
      (c) => c.jsonPath.startsWith('stakeholders[') && c.jsonPath.endsWith(`.${relativePath}`),
    );
    const parsed = cells.map((c) => /^([A-Z]+)(\d+)$/.exec(c.address) as RegExpExecArray);
    const column = parsed[0][1];
    const lastRow = Math.max(...parsed.map((m) => Number(m[2])));
    return { sheet: cells[0].sheet, address: `${column}${lastRow + 1}`, column };
  }

  const text = (ref: string, value: string) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;

  test('the last padded row is still a new item — that is where the room is', () => {
    const deal = clone(exampleDeal);
    const table = spec.sheets.flatMap(specTables).find((x) => x.id === 'stakeholders');
    const padded = table?.minRows as number;
    const count = (deal.stakeholders as unknown[]).length;
    expect(count).toBeLessThan(padded);
    // Fill every padded row, the last one included: capacity is real and reaches the bottom.
    let bytes = generateWorkbook(schema, spec, deal);
    for (let i = count; i < padded; i++) {
      for (const [field, value] of [
        ['name', `Person ${i + 1}`],
        ['title', 'VP'],
        ['roleInDeal', 'Influencer'],
      ] as const) {
        const at = addressOf(deal, `stakeholders[${i}].${field}`);
        bytes = setText(bytes, at.sheet, at.address, value);
      }
    }
    const report = read(deal, bytes);
    expect(report.rejections).toEqual([]);
    expect((report.deal as { stakeholders: unknown[] }).stakeholders).toHaveLength(padded);
  });

  test('a filled row below the padded ones is reported, never read', () => {
    const deal = fullDeal();
    const count = (deal.stakeholders as unknown[]).length;
    const at = firstUnmappedCell(deal, 'name');
    const edited = addCell(generateWorkbook(schema, spec, deal), at.sheet, at.address, text(at.address, 'Dana Reyes'));

    const report = read(deal, edited);
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0]).toMatchObject({ sheet: at.sheet, address: at.address });
    // The message has to say what to do, because there is nothing the reader can do for them.
    expect(report.rejections[0].reason).toMatch(/regenerate/i);
    expect((report.deal as { stakeholders: unknown[] }).stakeholders).toHaveLength(count);
  });

  test('every column of that row is reported, so nothing is lost quietly', () => {
    const deal = fullDeal();
    let bytes = generateWorkbook(schema, spec, deal);
    const refs: string[] = [];
    for (const [field, value] of [
      ['name', 'Dana Reyes'],
      ['title', 'VP Platform'],
      ['roleInDeal', 'Influencer'],
    ] as const) {
      const at = firstUnmappedCell(deal, field);
      refs.push(at.address);
      bytes = addCell(bytes, at.sheet, at.address, text(at.address, value));
    }
    const report = read(deal, bytes);
    expect(report.proposals).toEqual([]);
    expect(report.rejections.map((r) => r.address).sort()).toEqual([...refs].sort());
  });

  test('the section banner below a list is never taken for a list row', () => {
    // The blocks under a table are the sheet's own content. Reading downward from a table would
    // reach the next banner and append its title as a stakeholder — silent corruption of the deal.
    const deal = fullDeal();
    const report = read(deal, generateWorkbook(schema, spec, deal));
    const names = (report.deal as { stakeholders: Array<{ name: string }> }).stakeholders.map((s) => s.name);
    const banners = spec.sheets
      .flatMap((s) => s.blocks)
      .filter((b) => b.kind === 'section' || b.kind === 'title')
      .map((b) => (b as { text: string }).text);
    expect(banners.length).toBeGreaterThan(0);
    for (const banner of banners) expect(names).not.toContain(banner);
  });

  test('an untouched full workbook still proposes nothing', () => {
    const deal = fullDeal();
    expect(read(deal, generateWorkbook(schema, spec, deal)).proposals).toEqual([]);
  });
});

describe('a rejected cell changes nothing at all', () => {
  test('a refused write leaves the deal byte-identical', () => {
    // Writing `responses[1]` into a deal with no `responses` key at all has to build the array
    // on the way to the leaf. Building it and then refusing the leaf would leave an empty
    // array nobody asked for in a deal reported as having no proposals.
    const deal = clone(exampleDeal);
    delete deal.qualification.metrics.responses;
    const { sheet, address } = addressOf(deal, 'qualification.metrics.responses[1]');
    const report = read(deal, setText(generateWorkbook(schema, spec, deal), sheet, address, 'Second answer'));
    expect(report.rejections).toHaveLength(1);
    expect(report.proposals).toEqual([]);
    expect(report.deal).toEqual(deal);
  });
});

describe('rows below a table that cannot grow', () => {
  /**
   * The Qualification table has one row per MEDDPICC element and no padding: its rows are not a
   * list anyone can extend, so a cell typed under it maps to nothing and has to be reported. This
   * is where the guard still earns its keep now that list tables read their grown rows instead.
   */
  function belowQualification(relativePath: string): { sheet: string; address: string } {
    const cells = planWorkbook(schema, spec, exampleDeal).inputCells.filter(
      (c) => c.jsonPath.startsWith('qualification.') && c.jsonPath.endsWith(`.${relativePath}`),
    );
    const parsed = cells.map((c) => /^([A-Z]+)(\d+)$/.exec(c.address) as RegExpExecArray);
    const column = parsed[0][1];
    const lastRow = Math.max(...parsed.map((m) => Number(m[2])));
    return { sheet: cells[0].sheet, address: `${column}${lastRow + 1}` };
  }

  test('a row below it is reported, not silently dropped', () => {
    const { sheet, address } = belowQualification('evidence');
    const edited = addCell(
      generateWorkbook(schema, spec, exampleDeal),
      sheet,
      address,
      `<c r="${address}" t="inlineStr"><is><t>One Row Too Far</t></is></c>`,
    );
    const report = read(exampleDeal, edited);
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0]).toMatchObject({ sheet, address });
    expect(report.rejections[0].reason).toMatch(/does not map/i);
    expect(report.ok).toBe(false);
  });

  test('a formula below it is reported too — it is still content', () => {
    const { sheet, address } = belowQualification('evidence');
    const edited = addCell(
      generateWorkbook(schema, spec, exampleDeal),
      sheet,
      address,
      `<c r="${address}"><f>CONCATENATE(A1," extra")</f></c>`,
    );
    const report = read(exampleDeal, edited);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0].reason).toMatch(/CONCATENATE/);
  });

  test('a blank cell below it is not reported', () => {
    const { sheet, address } = belowQualification('evidence');
    const edited = addCell(generateWorkbook(schema, spec, exampleDeal), sheet, address, `<c r="${address}"/>`);
    expect(read(exampleDeal, edited).rejections).toEqual([]);
  });

  test('a pristine workbook reports nothing anywhere', () => {
    expect(read(exampleDeal, generateWorkbook(schema, spec, exampleDeal)).rejections).toEqual([]);
  });
});

describe('booleans', () => {
  test('a boolean cell round-trips both ways', () => {
    const { sheet, address } = addressOf(exampleDeal, 'stakeholders[0].mustSayYes');
    expect(exampleDeal.stakeholders[0].mustSayYes).toBe(true);
    const edited = withCell(
      generateWorkbook(schema, spec, exampleDeal),
      sheet,
      address,
      `<c r="${address}" t="b"><v>0</v></c>`,
    );
    const report = read(exampleDeal, edited);
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ from: true, to: false });
  });

  test('a boolean typed as a word is understood', () => {
    const { sheet, address } = addressOf(exampleDeal, 'stakeholders[0].mustSayYes');
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'FALSE'));
    expect(report.rejections).toEqual([]);
    expect(report.proposals[0]).toMatchObject({ to: false });
  });

  test('a word that is not a boolean is refused', () => {
    const { sheet, address } = addressOf(exampleDeal, 'stakeholders[0].mustSayYes');
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'sort of'));
    expect(report.rejections).toHaveLength(1);
    // The words the dropdown itself offers, not a literal: renaming them must not leave the
    // message describing a choice the workbook no longer presents.
    expect(report.rejections[0].reason).toContain(BOOLEAN_YES);
    expect(report.rejections[0].reason).toContain(BOOLEAN_NO);
  });
});

describe('a status typed as words reads back as the JSON value', () => {
  const statusPath = 'closePlan.milestones[0].status';

  test('the label the sheet shows maps back to the token the deal holds', () => {
    const { sheet, address } = addressOf(exampleDeal, statusPath);
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Complete'));
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ jsonPath: statusPath, to: 'complete' });
  });

  test('the JSON spelling is accepted too, because a rep may type either', () => {
    // A different value from the one already there, or "unchanged" would be the outcome whether or
    // not the token was understood — and this test could not fail.
    const before = readPath(exampleDeal, statusPath);
    expect(before).not.toBe('complete');
    const { sheet, address } = addressOf(exampleDeal, statusPath);
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'complete'));
    expect(report.rejections).toEqual([]);
    expect(report.proposals[0]?.to).toBe('complete');
  });

  test('typing the token already there is not an edit', () => {
    const before = readPath(exampleDeal, statusPath) as string;
    const { sheet, address } = addressOf(exampleDeal, statusPath);
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, before));
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toEqual([]);
  });

  test('a word that is neither is still refused, and the enum is quoted back', () => {
    const { sheet, address } = addressOf(exampleDeal, statusPath);
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Halfway'));
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
    expect(report.rejections[0].reason).toMatch(/must be one of/);
  });

  test('an untouched workbook does not report its own status labels as edits', () => {
    // Without the translation every generated workbook would propose rewriting each status cell,
    // which is the failure that would make the whole feature unusable rather than merely wrong.
    const report = read(exampleDeal, generateWorkbook(schema, spec, exampleDeal));
    expect(report.proposals).toEqual([]);
    const statuses = (exampleDeal.closePlan.milestones as Array<{ status: string }>).map((m) => m.status);
    expect(statuses.some((v) => /_/.test(v))).toBe(true);
  });
});

describe('readWorkbookProperty', () => {
  test('reads back each property the writer put in', () => {
    const bytes = buildWorkbook([{ name: SHEET, rows: [{ row: 1, cells: [{ ref: 'A1', value: 'x' }] }] }], {
      MeddpiccFingerprint: 'the-stamp',
      MeddpiccSchemaHash: 'the-hash',
      MeddpiccLocale: 'ko',
    });
    expect(readWorkbookProperty(bytes, 'MeddpiccFingerprint')).toBe('the-stamp');
    expect(readWorkbookProperty(bytes, 'MeddpiccSchemaHash')).toBe('the-hash');
    expect(readWorkbookProperty(bytes, 'MeddpiccLocale')).toBe('ko');
  });

  test('a name that is not there reads null, not the wrong property', () => {
    // The properties sit in one XML file, so a loose pattern happily returns a neighbour's value.
    const bytes = buildWorkbook([{ name: SHEET, rows: [{ row: 1, cells: [{ ref: 'A1', value: 'x' }] }] }], {
      MeddpiccFingerprint: 'the-stamp',
    });
    expect(readWorkbookProperty(bytes, 'MeddpiccSchemaHash')).toBeNull();
    expect(readWorkbookProperty(bytes, 'Meddpicc')).toBeNull();
  });

  test('an unstamped workbook reads null for everything', () => {
    const bytes = buildWorkbook([{ name: SHEET, rows: [] }]);
    expect(readWorkbookProperty(bytes, 'MeddpiccFingerprint')).toBeNull();
  });
});

describe('schema drift', () => {
  test('a workbook generated against a different schema is noted, not refused', () => {
    // Additive schema changes are the common case and harmless, so this must not refuse. But it is
    // the only explanation for the symptom that looks like a bug: the sheet offering a dropdown
    // value the schema no longer allows, then the read rejecting it by cell address.
    const bytes = generateWorkbook(schema, spec, exampleDeal);
    const moved = JSON.parse(JSON.stringify(schema));
    moved.description = `${moved.description} (changed)`;

    const before = readWorkbook(schema, spec, exampleDeal, bytes);
    expect(before.notes).toEqual([]);
    expect(before.ok).toBe(true);

    const after = readWorkbook(moved, spec, exampleDeal, bytes);
    expect(after.notes.length).toBe(1);
    expect(after.notes[0]).toMatch(/different schema/);
    // Still read, still fine: a note is not a refusal.
    expect(after.rejections).toEqual([]);
    expect(after.cellsRead).toBe(before.cellsRead);
  });

  test('a workbook carrying no schema hash is not accused of drift', () => {
    // An older workbook, or one built by a caller that passed no properties.
    const bytes = buildWorkbook([{ name: SHEET, rows: [{ row: 1, cells: [{ ref: 'A1', value: 'x' }] }] }]);
    expect(readWorkbook(schema, spec, exampleDeal, bytes).notes).toEqual([]);
  });
});

describe('metadata.locale', () => {
  test('the workbook records the language it was generated in', () => {
    expect(readWorkbookProperty(generateWorkbook(schema, spec, exampleDeal), 'MeddpiccLocale')).toBe('en');
    const korean = {
      ...(exampleDeal as object),
      metadata: { ...(exampleDeal as { metadata: object }).metadata, locale: 'ko' },
    };
    expect(readWorkbookProperty(generateWorkbook(schema, spec, korean), 'MeddpiccLocale')).toBe('ko');
  });

  test('a exampleDeal naming a language the fleet does not have is refused by the schema', () => {
    const bogus = {
      ...(exampleDeal as object),
      metadata: { ...(exampleDeal as { metadata: object }).metadata, locale: 'kr' },
    };
    expect(validateDeal(bogus, schema).valid).toBe(false);
  });

  test('the locale enum matches the fleet registry in shape and size', () => {
    // Read from the schema rather than restated here, so the two cannot disagree — and so this file
    // does not become the hardcoded locale list that scripts/locale-lint.sh exists to forbid.
    const locales = (schema as { properties: { metadata: { properties: { locale: { enum: string[] } } } } }).properties
      .metadata.properties.locale.enum;
    expect(locales.length).toBe(13);
    expect(locales[0]).toBe('en');
    expect(locales).toContain('ko');
    for (const slug of locales) expect(slug).toMatch(/^[a-z]{2}(-[a-z]{2})?$/);
    expect(new Set(locales).size).toBe(locales.length);
  });
});

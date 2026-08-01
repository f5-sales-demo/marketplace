import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  anchorTextHash,
  BOOLEAN_NO,
  BOOLEAN_YES,
  dateToSerial,
  generateWorkbook,
  planWorkbook,
  workbookFingerprint,
} from './generate';
import { readPath } from './json-path';
import { enumLabel } from './labels';
import { readWorkbook, readWorkbookCells, readWorkbookProperty, serialToDate } from './read-workbook';
import { sectionLabel } from './sections';
import { validateDeal } from './validate';
import { specTables, type WorkbookSpec } from './workbook-spec';
import { ANCHOR_TEXT_PROPERTY, buildWorkbook, columnLetter } from './xlsx';
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
    expect(cells.get(sheet)?.get(address)?.text).toBe('Example Corp');
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
        from: 'Example Corp',
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

  test('a derived cell — an element name — proposes nothing, and says so', () => {
    // It proposes nothing because the workbook is REFUSED: a derived cell is an anchor, so text that
    // is not the text the generator wrote means either the rows moved or somebody typed over it.
    // Asserting only "no proposals" would go on passing if the cell were quietly ignored instead.
    const cells = readWorkbookCells(generateWorkbook(schema, spec, exampleDeal));
    const derived = [...(cells.get(SHEET)?.entries() ?? [])].find(([, c]) => c.text === sectionLabel('metrics'))?.[0];
    expect(derived).toBeDefined();
    const edited = setText(generateWorkbook(schema, spec, exampleDeal), SHEET, derived as string, 'nonsense');
    const report = read(exampleDeal, edited);
    expect(report.proposals).toEqual([]);
    expect(report.ok).toBe(false);
    expect(report.rejections.some((r) => r.address === derived)).toBe(true);
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
  test('a boolean cell round-trips both ways, through the words the sheet shows', () => {
    // The `t="b"` form this used to exercise is now REFUSED — see "a real Excel boolean is refused
    // too". A logical value in the cell disagrees with the formula that counts the word, and nothing
    // Excel does on its own turns our text into one, so it can only be somebody typing or pasting.
    const { sheet, address } = addressOf(exampleDeal, 'stakeholders[0].mustSayYes');
    expect(exampleDeal.stakeholders[0].mustSayYes).toBe(true);
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, BOOLEAN_NO));
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ from: true, to: false });

    // …and back again, from the deal that produced.
    const back = read(report.deal, setText(generateWorkbook(schema, spec, report.deal), sheet, address, BOOLEAN_YES));
    expect(back.proposals).toHaveLength(1);
    expect(back.proposals[0]).toMatchObject({ from: false, to: true });
  });

  test('the two words the dropdown offers are understood, in any case', () => {
    const { sheet, address } = addressOf(exampleDeal, 'stakeholders[0].mustSayYes');
    for (const [typed, expected] of [
      [BOOLEAN_NO, false],
      [BOOLEAN_NO.toUpperCase(), false],
      [` ${BOOLEAN_NO.toLowerCase()} `, false],
    ] as const) {
      const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, typed));
      expect(report.rejections, typed).toEqual([]);
      expect(report.proposals[0], typed).toMatchObject({ to: expected });
    }
  });

  test('a spelling the sheet cannot show is refused, not quietly accepted', () => {
    // TRUE, Y and 1 all used to read as true. The scorecard counts the WORD, so accepting one of them
    // put the deal and the sheet in front of it into disagreement: the cell said TRUE, the count
    // beside it did not include it, and neither would say so until the workbook was regenerated. A
    // dropdown stops it being typed; paste goes around a dropdown. So the reader refuses it and names
    // the cell, which is what it does with every other value it cannot show.
    const { sheet, address } = addressOf(exampleDeal, 'stakeholders[0].mustSayYes');
    for (const typed of ['TRUE', 'FALSE', 'Y', 'N', '1', '0']) {
      const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, typed));
      expect(report.proposals, typed).toEqual([]);
      expect(report.rejections, typed).toHaveLength(1);
      expect(report.rejections[0].reason, typed).toContain(BOOLEAN_YES);
    }
  });

  test('a real Excel boolean is refused too — that is what typing TRUE becomes', () => {
    // Excel converts a typed TRUE into a logical value stored as `t="b"`, so refusing only the text
    // form would leave the whole case open through the door Excel itself opens.
    const { sheet, address } = addressOf(exampleDeal, 'stakeholders[0].mustSayYes');
    const edited = withCell(
      generateWorkbook(schema, spec, exampleDeal),
      sheet,
      address,
      `<c r="${address}" t="b"><v>1</v></c>`,
    );
    const report = read(exampleDeal, edited);
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toHaveLength(1);
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

describe('a workbook whose rows have moved is refused, not read', () => {
  /**
   * The stamp proves "this workbook came from this deal, laid out this way". It cannot see a change
   * made INSIDE the workbook: re-order two element rows and every address still resolves, so the
   * reader hands each element its neighbour's score, reports no rejection, and `--apply` writes it.
   *
   * Measured before this guard existed: swapping the first and last element rows produced exactly two
   * proposals — metrics 3 → 2 and competition 2 → 3 — with `ok` true. Silent corruption of the source
   * of truth, from an edit a person tidying a sheet would think nothing of.
   */
  /** Move one cell's whole `<c>` element to another address, keeping its value and style. */
  function moveCells(bytes: Uint8Array, sheetName: string, pairs: Array<[string, string]>): Uint8Array {
    const entries = readZip(bytes);
    const part = sheetPart(sheetName);
    let xml = new TextDecoder().decode(entries.get(part)?.data as Uint8Array);
    const cellOf = (ref: string) => {
      const found = new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>.*?</c>)`).exec(xml);
      if (!found) throw new Error(`cell ${ref} not found`);
      return found[0];
    };
    const taken = pairs.map(([from, to]) => ({ from, to, xml: cellOf(from) }));
    for (const { from, to, xml: cell } of taken) {
      xml = xml.replace(cellOf(to), cell.replace(`r="${from}"`, `r="${to}"`));
    }
    return writeZip(
      [...entries.values()].map((e) =>
        e.name === part ? { name: e.name, data: new TextEncoder().encode(xml) } : { name: e.name, raw: e },
      ),
    );
  }

  const elements = () => {
    const found = planWorkbook(schema, spec, exampleDeal).tables.find((t) => t.id === 'elements');
    if (!found) throw new Error('no elements table');
    return found;
  };

  test('two element rows swapped are refused, and no score moves', () => {
    const t = elements();
    const first = t.firstDataRow;
    const last = t.firstDataRow + t.rows - 1;
    const nameCol = columnLetter(t.columns.element);
    const scoreCol = columnLetter(t.columns.score);
    const swapped = moveCells(generateWorkbook(schema, spec, exampleDeal), SHEET, [
      [`${nameCol}${first}`, `${nameCol}${last}`],
      [`${nameCol}${last}`, `${nameCol}${first}`],
      [`${scoreCol}${first}`, `${scoreCol}${last}`],
      [`${scoreCol}${last}`, `${scoreCol}${first}`],
    ]);
    const report = read(exampleDeal, swapped);
    expect(report.ok).toBe(false);
    expect(report.proposals).toEqual([]);
    expect(report.rejections.length).toBeGreaterThan(0);
    expect(report.rejections[0].reason).toMatch(/moved|regenerate/i);
    // And the deal is untouched, which is the whole point.
    expect(report.deal).toEqual(exampleDeal);
  });

  test('the refusal names the cell that no longer holds what the plan wrote', () => {
    const t = elements();
    const nameCol = columnLetter(t.columns.element);
    const first = `${nameCol}${t.firstDataRow}`;
    const edited = setText(generateWorkbook(schema, spec, exampleDeal), SHEET, first, 'Something Else');
    const report = read(exampleDeal, edited);
    expect(report.ok).toBe(false);
    expect(report.rejections.some((r) => r.address === first)).toBe(true);
  });

  test('two question rows swapped are refused — an answer must not change question', () => {
    // The `responses` table declares no key column, so anchoring only key columns left its question
    // cells unchecked. Measured before the fix: swapping the first two question rows proposed
    // exchanging `qualification.metrics.responses[0]` and `[1]` with `ok` true — each answer attached
    // to the wrong question, which is worse than losing it.
    const t = planWorkbook(schema, spec, exampleDeal).tables.find((x) => x.id === 'responses');
    if (!t) throw new Error('no responses table');
    const first = t.firstDataRow;
    const second = t.firstDataRow + 1;
    const qCol = columnLetter(t.columns.question);
    const aCol = columnLetter(t.columns.response);
    const swapped = moveCells(generateWorkbook(schema, spec, exampleDeal), SHEET, [
      [`${qCol}${first}`, `${qCol}${second}`],
      [`${qCol}${second}`, `${qCol}${first}`],
      [`${aCol}${first}`, `${aCol}${second}`],
      [`${aCol}${second}`, `${aCol}${first}`],
    ]);
    const report = read(exampleDeal, swapped);
    expect(report.ok).toBe(false);
    expect(report.proposals).toEqual([]);
    expect(report.deal).toEqual(exampleDeal);
  });

  test('every derived cell is an anchor unless it follows an input', () => {
    // Stated as the rule rather than as a list, so a derived column added later is covered the day it
    // is added and not the day somebody remembers.
    const plan = planWorkbook(schema, spec, exampleDeal);
    const anchored = new Set(plan.anchors.map((a) => `${a.sheet}!${a.address}`));
    let checked = 0;
    let exempt = 0;
    for (const table of plan.tables) {
      const declared = spec.sheets.flatMap(specTables).find((t) => t.id === table.id);
      for (const column of declared?.columns ?? []) {
        if (column.role !== 'derived') continue;
        const ref = `${columnLetter(table.columns[column.id])}${table.firstDataRow}`;
        const key = `${table.sheet}!${ref}`;
        if (column.followsInput) {
          expect(anchored.has(key), `${table.id}.${column.id} follows an input and must not anchor`).toBe(false);
          exempt++;
          continue;
        }
        expect(anchored.has(key), `${table.id}.${column.id} at ${ref}`).toBe(true);
        checked++;
      }
    }
    // Otherwise the loop above passes by finding nothing to check, either way.
    expect(checked).toBeGreaterThan(3);
    expect(exempt).toBeGreaterThan(0);
  });

  test('typing over a derived cell that anchors its row is refused, not dropped in silence', () => {
    // A derived cell holds text, so Excel lets anyone overtype it, and nothing about it flows back to
    // the deal. Passing over it without a word would be this plugin's oldest bug in a new place.
    const t = planWorkbook(schema, spec, exampleDeal).tables.find((x) => x.id === 'elements');
    if (!t) throw new Error('no elements table');
    const definition = `${columnLetter(t.columns.element)}${t.firstDataRow}`;
    const report = read(
      exampleDeal,
      setText(generateWorkbook(schema, spec, exampleDeal), SHEET, definition, 'My own words'),
    );
    expect(report.ok).toBe(false);
    expect(report.proposals).toEqual([]);
    expect(report.rejections.some((r) => r.address === definition)).toBe(true);
  });

  test('reading again after applying a score change does not refuse the same workbook', () => {
    // The sequence a rep actually performs: change a score in Excel, apply it, read once more to be
    // sure nothing is left. The rubric wording follows that score, so the plan for the applied deal
    // expects the new wording while the file still holds the old one — anchoring it would refuse this.
    //
    // The Excel acceptance test is what caught this when the exemption was briefly removed. A unit
    // test belongs here so the next person does not need Excel to find out.
    const { sheet, address } = addressOf(exampleDeal, 'qualification.champion.score');
    const bytes = setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, 2);
    const first = read(exampleDeal, bytes);
    expect(first.rejections).toEqual([]);
    expect(first.proposals).toHaveLength(1);

    // Now read the SAME workbook against the deal that edit produced.
    const second = read(first.deal, bytes);
    expect(second.rejections).toEqual([]);
    expect(second.proposals).toEqual([]);
    expect(second.ok).toBe(true);
  });

  test('a section banner nobody may retype is an anchor too', () => {
    // Inserting a row shifts every banner and label below it, which is how a person makes room.
    const plan = planWorkbook(schema, spec, exampleDeal);
    const banner = plan.sheets[0].rows.flatMap((r) => r.cells).find((c) => c.style === 'sectionHeader');
    expect(banner?.ref).toBeDefined();
    const edited = setText(generateWorkbook(schema, spec, exampleDeal), SHEET, banner?.ref as string, 'Renamed');
    expect(read(exampleDeal, edited).ok).toBe(false);
  });

  test('an ordinary edit is still an ordinary edit', () => {
    // The guard must not turn every read into a refusal: a changed input cell is the normal case,
    // and a derived cell holding a stale value is what Excel leaves behind after one.
    const { sheet, address } = addressOf(exampleDeal, 'metadata.accountName');
    const report = read(exampleDeal, setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Globex'));
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toHaveLength(1);
  });

  test('a score changed in Excel does not trip the anchor on its own rubric', () => {
    // The rubric text is derived FROM the score, and Excel leaves the old text in the cell after an
    // edit. Treating it as an anchor would refuse the most ordinary edit there is.
    const { sheet, address } = addressOf(exampleDeal, 'qualification.metrics.score');
    const report = read(exampleDeal, setNumber(generateWorkbook(schema, spec, exampleDeal), sheet, address, 1));
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toHaveLength(1);
  });
});

describe('one column of a list, re-ordered, is refused', () => {
  /**
   * A list row has no identity beyond its position, so nothing anchors it — and that is correct, since
   * row one is simply the first stakeholder. But it leaves a real hazard: sorting or pasting a single
   * column detaches its values from the rest of their rows, and the reader, reading faithfully, writes
   * the scrambled pairing into the deal. `--apply` then loses the original.
   *
   * There is a signal, though, and it is a precise one. A column whose values are the SAME SET in a
   * DIFFERENT ORDER has been re-ordered; nobody edits two people's names into each other's. So that
   * pattern is refused by name, while any ordinary edit — which changes the set — passes.
   *
   * Measured before this guard: swapping B56 and B57 gave `ok: true`, no rejections, two proposals, and
   * David Park ended up with Sarah Chen's title.
   */
  function swapCells(bytes: Uint8Array, sheetName: string, a: string, b: string): Uint8Array {
    const entries = readZip(bytes);
    const part = sheetPart(sheetName);
    let xml = new TextDecoder().decode(entries.get(part)?.data as Uint8Array);
    const cellOf = (ref: string) => {
      const found = new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>.*?</c>)`).exec(xml);
      if (!found) throw new Error(`cell ${ref} not found`);
      return found[0];
    };
    const [ca, cb] = [cellOf(a), cellOf(b)];
    xml = xml.replace(ca, cb.replace(`r="${b}"`, `r="${a}"`)).replace(cb, ca.replace(`r="${a}"`, `r="${b}"`));
    return writeZip(
      [...entries.values()].map((e) =>
        e.name === part ? { name: e.name, data: new TextEncoder().encode(xml) } : { name: e.name, raw: e },
      ),
    );
  }

  const nameCell = (index: number) => addressOf(exampleDeal, `stakeholders[${index}].name`);

  test('two names swapped are refused, and the deal is untouched', () => {
    const first = nameCell(0);
    const second = nameCell(1);
    const report = read(
      exampleDeal,
      swapCells(generateWorkbook(schema, spec, exampleDeal), SHEET, first.address, second.address),
    );
    expect(report.ok).toBe(false);
    expect(report.proposals).toEqual([]);
    expect(report.deal).toEqual(exampleDeal);
    expect(report.rejections.length).toBeGreaterThan(0);
    expect(report.rejections[0].reason).toMatch(/order/i);
  });

  test('the refusal names the column, not just a cell', () => {
    const report = read(
      exampleDeal,
      swapCells(generateWorkbook(schema, spec, exampleDeal), SHEET, nameCell(0).address, nameCell(1).address),
    );
    expect(report.rejections[0].jsonPath).toContain('stakeholders');
    expect(report.rejections[0].jsonPath).toContain('name');
  });

  test('a whole-column sort is refused too, not only a pair', () => {
    // Three rows rotated: no two values are in each other's places, so a pairwise check would miss it.
    const rotated = swapCells(
      swapCells(generateWorkbook(schema, spec, exampleDeal), SHEET, nameCell(0).address, nameCell(1).address),
      SHEET,
      nameCell(1).address,
      nameCell(2).address,
    );
    expect(read(exampleDeal, rotated).ok).toBe(false);
  });

  test('an ordinary edit to one of those cells is still an ordinary edit', () => {
    // The set of values changes, so this is somebody renaming a stakeholder — the normal case, and the
    // one the guard must not touch.
    const { sheet, address } = nameCell(0);
    const report = read(
      exampleDeal,
      setText(generateWorkbook(schema, spec, exampleDeal), sheet, address, 'Dana Reyes'),
    );
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toHaveLength(1);
  });

  test('two cells given the SAME new value is an edit, not a re-order', () => {
    // Both changed, and the multiset differs, so there is nothing to mistake for a permutation.
    let bytes = generateWorkbook(schema, spec, exampleDeal);
    for (const index of [0, 1]) {
      const { sheet, address } = nameCell(index);
      bytes = setText(bytes, sheet, address, 'Dana Reyes');
    }
    const report = read(exampleDeal, bytes);
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toHaveLength(2);
  });

  test('an untouched workbook is not accused of being re-ordered', () => {
    expect(read(exampleDeal, generateWorkbook(schema, spec, exampleDeal)).ok).toBe(true);
  });

  test('a column whose cells LOOK different from the deal is checked too', () => {
    // The first version of this guard compared the cell's raw text against the deal's value, so every
    // column the workbook displays differently was silently exempt: "In progress" against
    // `in_progress`, "Yes" against `true`, a date serial against an ISO date. Their multisets could
    // never match, so a re-ordered status column sailed through.
    //
    // Measured before the fix: swapping two milestone statuses gave `ok` true, no rejections, and each
    // status attached to the wrong milestone — while still validating against the schema.
    const statuses = (exampleDeal.closePlan.milestones as Array<{ status: string }>).map((m) => m.status);
    expect(new Set(statuses).size).toBeGreaterThan(1);
    const first = statuses.indexOf(statuses[0]);
    const other = statuses.findIndex((v) => v !== statuses[0]);
    const a = addressOf(exampleDeal, `closePlan.milestones[${first}].status`);
    const b = addressOf(exampleDeal, `closePlan.milestones[${other}].status`);
    const report = read(
      exampleDeal,
      swapCells(generateWorkbook(schema, spec, exampleDeal), SHEET, a.address, b.address),
    );
    expect(report.ok).toBe(false);
    expect(report.proposals).toEqual([]);
    expect(report.rejections[0].jsonPath).toContain('status');
  });

  test('two dates swapped are caught, serials and all', () => {
    const dates = (exampleDeal.closePlan.milestones as Array<{ targetDate: string }>).map((m) => m.targetDate);
    expect(new Set(dates).size).toBeGreaterThan(1);
    const a = addressOf(exampleDeal, 'closePlan.milestones[0].targetDate');
    const b = addressOf(exampleDeal, 'closePlan.milestones[1].targetDate');
    expect(
      read(exampleDeal, swapCells(generateWorkbook(schema, spec, exampleDeal), SHEET, a.address, b.address)).ok,
    ).toBe(false);
  });

  test('a re-order plus one edit is still caught, where a coincidence is implausible', () => {
    // Exact multiset equality is defeated by sorting a column and then editing one of the moved
    // values. So a value that has landed on ANOTHER row's former value counts as displaced, and two
    // displaced values in one column is a rearrangement — for a free-text column, where two people
    // swapping into each other's names by coincidence does not happen.
    const names = (exampleDeal.stakeholders as Array<{ name: string }>).map((s) => s.name);
    let bytes = swapCells(
      generateWorkbook(schema, spec, exampleDeal),
      SHEET,
      addressOf(exampleDeal, 'stakeholders[0].name').address,
      addressOf(exampleDeal, 'stakeholders[1].name').address,
    );
    // …and then rename a third, which breaks the multiset.
    const third = addressOf(exampleDeal, 'stakeholders[2].name');
    bytes = setText(bytes, third.sheet, third.address, 'Dana Reyes');
    expect(names[2]).not.toBe('Dana Reyes');
    const report = read(exampleDeal, bytes);
    expect(report.ok).toBe(false);
    expect(report.proposals).toEqual([]);
    expect(report.rejections[0].reason).toMatch(/order|another row/i);
  });

  test('ONE displaced value is an edit — copying a value into another row is allowed', () => {
    // Somebody duplicating a description, or correcting a name to one another row already had. A
    // rearrangement moves at least two values, so two is the threshold; refusing at one would block
    // an ordinary copy.
    // TWO cells have to change, or `differing < 2` skips the column and the threshold is never
    // consulted — which is how the first version of this test passed either way.
    const names = (exampleDeal.stakeholders as Array<{ name: string }>).map((s) => s.name);
    let bytes = generateWorkbook(schema, spec, exampleDeal);
    const copied = addressOf(exampleDeal, 'stakeholders[2].name');
    bytes = setText(bytes, copied.sheet, copied.address, names[0]);
    const renamed = addressOf(exampleDeal, 'stakeholders[3].name');
    bytes = setText(bytes, renamed.sheet, renamed.address, 'Dana Reyes');
    expect(names).not.toContain('Dana Reyes');
    const report = read(exampleDeal, bytes);
    expect(report.rejections).toEqual([]);
    expect(report.proposals).toHaveLength(2);
  });

  test('an enum column is NOT judged by that rule, because a coincidence there is ordinary', () => {
    // Three milestones, two of them set to the status a third already had. Every changed cell "landed
    // on another row's former value" — and it is a perfectly ordinary edit, because a status column
    // has three possible values. Applying the displaced-value rule here would refuse real work.
    const statuses = (exampleDeal.closePlan.milestones as Array<{ status: string }>).map((m) => m.status);
    const target = statuses.find((v) => v !== statuses[0]);
    expect(target).toBeDefined();
    let bytes = generateWorkbook(schema, spec, exampleDeal);
    for (const index of [0, 1]) {
      const at = addressOf(exampleDeal, `closePlan.milestones[${index}].status`);
      bytes = setText(bytes, at.sheet, at.address, enumLabel(target as string));
    }
    const report = read(exampleDeal, bytes);
    expect(report.rejections).toEqual([]);
    expect(report.proposals.length).toBeGreaterThan(0);
  });

  test('a column holding a value nobody can read is left to the main loop', () => {
    // Otherwise this guard reports on a column it only partly understood: it would compare the cells
    // above the unreadable one, and if those happened to be a permutation it would blame a re-order
    // while the real problem was the value it could not read. The run still fails and still writes
    // nothing — it fails with the message that names the actual cell.
    // The swapped pair has to come BEFORE the unreadable cell, or the scan stops before it has seen
    // two differing values and `differing < 2` would skip the column either way — which is how the
    // first version of this test passed with the guard removed.
    const flags = (exampleDeal.stakeholders as Array<{ canSayNo?: boolean }>).map((s) => s.canSayNo);
    const pair = [flags.findIndex((v) => v === true), flags.findIndex((v) => v === false)].sort((a, b) => a - b);
    const spoiled = flags.findIndex((_, i) => i > pair[1]);
    expect(spoiled).toBeGreaterThan(pair[1]);
    let bytes = swapCells(
      generateWorkbook(schema, spec, exampleDeal),
      SHEET,
      addressOf(exampleDeal, `stakeholders[${pair[0]}].canSayNo`).address,
      addressOf(exampleDeal, `stakeholders[${pair[1]}].canSayNo`).address,
    );
    const bad = addressOf(exampleDeal, `stakeholders[${spoiled}].canSayNo`);
    bytes = setText(bytes, bad.sheet, bad.address, 'sort of');
    const report = read(exampleDeal, bytes);
    expect(report.ok).toBe(false);
    expect(report.rejections.some((r) => r.address === bad.address)).toBe(true);
    expect(report.rejections.every((r) => !/order/i.test(r.reason))).toBe(true);
  });

  test('two booleans swapped are caught, Yes and No and all', () => {
    const flags = (exampleDeal.stakeholders as Array<{ mustSayYes?: boolean }>).map((s) => s.mustSayYes);
    const yes = flags.indexOf(true);
    const no = flags.indexOf(false);
    expect(yes).toBeGreaterThanOrEqual(0);
    expect(no).toBeGreaterThanOrEqual(0);
    const a = addressOf(exampleDeal, `stakeholders[${yes}].mustSayYes`);
    const b = addressOf(exampleDeal, `stakeholders[${no}].mustSayYes`);
    expect(
      read(exampleDeal, swapCells(generateWorkbook(schema, spec, exampleDeal), SHEET, a.address, b.address)).ok,
    ).toBe(false);
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
  const inLocale = (locale: string) => ({
    ...(exampleDeal as object),
    metadata: { ...(exampleDeal as { metadata: object }).metadata, locale },
  });

  test('the workbook records the language it is actually in', () => {
    expect(readWorkbookProperty(generateWorkbook(schema, spec, exampleDeal), 'MeddpiccLocale')).toBe('en');
    expect(readWorkbookProperty(generateWorkbook(schema, spec, inLocale('en')), 'MeddpiccLocale')).toBe('en');
  });

  test('a deal asking for a language the workbook cannot be written in is refused, not stamped', () => {
    // Arabic requires the separately tracked right-to-left layout. Emitting a left-to-right workbook
    // and stamping it `ar` would make the provenance property lie about its own file — worse than not
    // having it, because the stamp is what a reader trusts. So say what is actually shipped instead.
    expect(() => generateWorkbook(schema, spec, inLocale('ar'))).toThrow(/ar/);
    expect(() => generateWorkbook(schema, spec, inLocale('ar'))).toThrow(/not translated.*written in/i);
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

/**
 * A retranslation is not a moved row.
 *
 * `workbookFingerprint` covers the deal's identity and the input-cell LAYOUT, and nothing else — by
 * design, so a workbook on someone's desk survives an edit to the JSON that moves no cell. Revising a
 * translation moves no cell either: every address is identical and the stamp matches, while every
 * anchor now reads different words. Measured on the example deal before this: 115 revised spec strings,
 * the same fingerprint to the character, and five rejections all saying "the rows appear to have
 * moved". Nothing had moved, and the advice that follows from that reading — regenerate, then redo the
 * edit — is right by accident while the diagnosis is wrong.
 *
 * So the workbook records a hash of the text it rendered INTO THE ANCHORS — exactly the strings the
 * reader compares, no more — and an anchor failure is explained by comparing it. Scoping it to the
 * anchors is what makes the three states exhaustive: if the hash differs then some anchor's text
 * differs, so the anchor check must fail, and there is no fourth case where the hash disagrees while
 * the workbook still reads back. A workbook generated before the property existed cannot answer the
 * question at all, and says so rather than guessing.
 */
describe('telling a retranslation from a moved row', () => {
  /** The spec with every displayed string revised, as a re-translation would leave it. */
  function retranslated(): WorkbookSpec {
    const revised = clone(spec) as unknown;
    let changed = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        for (const key of ['text', 'header', 'label']) {
          const value = record[key];
          if (typeof value === 'string' && value.length > 3) {
            record[key] = `${value} (rev)`;
            changed++;
          }
        }
        for (const value of Object.values(record)) walk(value);
      }
    };
    walk(revised);
    if (changed < 50)
      throw new Error(`only ${changed} strings revised — the fixture is not exercising a retranslation`);
    return revised as WorkbookSpec;
  }

  /** Strip one provenance property, as a workbook generated before it existed would lack it. */
  function withoutProperty(bytes: Uint8Array, name: string): Uint8Array {
    const part = 'docProps/custom.xml';
    const entries = readZip(bytes);
    const entry = entries.get(part);
    if (!entry) throw new Error(`no ${part}`);
    const xml = new TextDecoder().decode(entry.data);
    const pattern = new RegExp(`<property\\b[^>]*name="${name}"[^>]*>[\\s\\S]*?</property>`);
    // Removing something absent would leave the fixture identical and the test vacuous.
    if (!pattern.test(xml)) throw new Error(`property ${name} not present, so removing it proves nothing`);
    const stripped = xml.replace(pattern, '');
    const rewritten = writeZip(
      [...entries.values()].map((e) =>
        e.name === part ? { name: e.name, data: new TextEncoder().encode(stripped) } : { name: e.name, raw: e },
      ),
    );
    if (readWorkbookProperty(rewritten, name) !== null) throw new Error(`${name} survived removal`);
    return rewritten;
  }

  const reasons = (bytes: Uint8Array, withSpec: WorkbookSpec): string =>
    readWorkbook(schema, withSpec, exampleDeal, bytes)
      .rejections.map((r) => r.reason)
      .join(' | ');

  test('the fixture really is a retranslation: same stamp, same addresses, different words', () => {
    const revised = retranslated();
    const before = planWorkbook(schema, spec, exampleDeal);
    const after = planWorkbook(schema, revised, exampleDeal);
    // If either of these stopped being true the rest of this block would be testing nothing.
    expect(workbookFingerprint(after, exampleDeal)).toBe(workbookFingerprint(before, exampleDeal));
    expect(after.anchors.map((a) => a.address)).toEqual(before.anchors.map((a) => a.address));
    expect(after.anchors.map((a) => a.text)).not.toEqual(before.anchors.map((a) => a.text));
  });

  test('a workbook is stamped with the anchor text it rendered', () => {
    const bytes = generateWorkbook(schema, spec, exampleDeal, '0.0.0');
    const stamped = readWorkbookProperty(bytes, ANCHOR_TEXT_PROPERTY);
    expect(stamped).toBe(anchorTextHash(planWorkbook(schema, spec, exampleDeal)));
    expect(stamped).not.toBe(anchorTextHash(planWorkbook(schema, retranslated(), exampleDeal)));
  });

  test('revised labels are reported as a retranslation, not as moved rows', () => {
    const bytes = generateWorkbook(schema, spec, exampleDeal, '0.0.0');
    const said = reasons(bytes, retranslated());
    expect(said).toMatch(/labels were revised/i);
    expect(said).not.toMatch(/rows appear to have moved/);
    // It must COMMIT to the retranslation, not hedge. Hedging is the pre-stamp answer, and it would
    // otherwise satisfy a looser assertion even with the stamp removed entirely.
    expect(said).not.toMatch(/predates|either the rows/i);
  });

  test('genuinely moved rows are still reported as moved rows', () => {
    // Same spec both sides, so the text hash agrees and only the sheet has changed: two element
    // rows swapped, which is what tidying a sheet looks like.
    const bytes = generateWorkbook(schema, spec, exampleDeal, '0.0.0');
    const plan = planWorkbook(schema, spec, exampleDeal);
    const anchor = plan.anchors.find((a) => a.text === sectionLabel('metrics'));
    if (!anchor) throw new Error('no anchor for the metrics element');
    const moved = withCell(
      bytes,
      anchor.sheet,
      anchor.address,
      `<c r="${anchor.address}" t="inlineStr"><is><t>Economic Buyer</t></is></c>`,
    );
    const said = reasons(moved, spec);
    expect(said).toMatch(/rows appear to have moved/);
    expect(said).not.toMatch(/revised|predates/i);
  });

  test('a retranslation does not claim the rows are still in place — it cannot know that', () => {
    // Version skew and a tidy-up in the same file: the labels were revised AND a row was moved. The
    // hash proves the label sets differ and nothing more, so any claim about where the cells are is
    // unsupported — which is the same overclaim, pointed the other way, that this change exists to
    // remove. It may only say what the labels can no longer do.
    const bytes = generateWorkbook(schema, spec, exampleDeal, '0.0.0');
    const plan = planWorkbook(schema, spec, exampleDeal);
    const anchor = plan.anchors.find((a) => a.text === sectionLabel('metrics'));
    if (!anchor) throw new Error('no anchor for the metrics element');
    const alsoMoved = withCell(
      bytes,
      anchor.sheet,
      anchor.address,
      `<c r="${anchor.address}" t="inlineStr"><is><t>Economic Buyer</t></is></c>`,
    );
    const said = reasons(alsoMoved, retranslated());
    expect(said).toMatch(/labels were revised/i);
    expect(said).not.toMatch(/probably still|still where you left/i);
    expect(said).toMatch(/no longer confirm|cannot confirm/i);
  });

  test('a workbook predating the stamp says it cannot tell which happened', () => {
    const bytes = withoutProperty(generateWorkbook(schema, spec, exampleDeal, '0.0.0'), ANCHOR_TEXT_PROPERTY);
    const said = reasons(bytes, retranslated());
    // Honest about the ambiguity: it names both possibilities and asserts neither.
    expect(said).toMatch(/either the rows have moved/i);
    expect(said).toMatch(/labels were revised/i);
    expect(said).toMatch(/predates/i);
  });

  test('an unchanged workbook still reads back, so the new stamp gates nothing on its own', () => {
    const bytes = generateWorkbook(schema, spec, exampleDeal, '0.0.0');
    const report = readWorkbook(schema, spec, exampleDeal, bytes);
    expect(report.rejections).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { FALLBACK_HEADER, planWorkbook } from './generate';
import { isNonProse, translatableSet, translatableStrings } from './translatable';
import type { WorkbookSpec } from './workbook-spec';

const dir = path.join(import.meta.dir, '..');
const spec = JSON.parse(await Bun.file(path.join(dir, 'engine', 'workbook-spec.json')).text()) as WorkbookSpec;
const schema = JSON.parse(await Bun.file(path.join(dir, 'schema', 'meddpicc-schema.json')).text());
const example = JSON.parse(await Bun.file(path.join(dir, 'schema', 'example-deal.json')).text());

/**
 * Every string a generated workbook shows that the ENGINE chose, not the deal.
 *
 * The exclusion is the whole difficulty. A workbook renders the rep's account name, deal name, prose,
 * evidence and notes, and translating any of them would be corruption rather than localisation. So the
 * subtraction is `plan.inputCells`, the map whose entire purpose is to say which cells hold a person's
 * value — asked rather than guessed at.
 */
const renderedByEngine = (deal: unknown): Set<string> => {
  const plan = planWorkbook(schema, spec, deal);
  const dealCells = new Set(plan.inputCells.map((c) => `${c.sheet}!${c.address}`));
  const out = new Set<string>();
  const keep = (text: unknown): void => {
    if (typeof text !== 'string' || text.trim() === '' || isNonProse(text)) return;
    out.add(text);
  };
  for (const sheet of plan.sheets) {
    keep(sheet.name);
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        if (dealCells.has(`${sheet.name}!${cell.ref}`)) continue;
        // A formula's own string literals are rendered text, and skipping them was wrong. The rubric
        // column is `IF(D20=4,"Committed — …",IF(D20=3,"Quantified — …",…))`: all five lines of every
        // element's rubric live inside a formula so the cell follows the score live in Excel. They are
        // the most prose-heavy text on the sheet and none of them is a cell value anywhere.
        if (cell.formula !== undefined) {
          for (const match of cell.formula.matchAll(/"((?:[^"]|"")*)"/g)) keep(match[1]?.replace(/""/g, '"'));
          continue;
        }
        keep(cell.value);
      }
    }
    for (const validation of sheet.validations ?? []) for (const value of validation.values) keep(value);
  }
  // The print header, whose parts are mostly the deal's own — account name, deal name, id. Position
  // cannot separate those from the engine's fallback the way `inputCells` separates cells, so they are
  // excluded by value: a header part equal to something a deal-derived cell holds is the deal's.
  const dealValues = new Set<string>();
  for (const sheet of plan.sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        if (dealCells.has(`${sheet.name}!${cell.ref}`) && typeof cell.value === 'string') dealValues.add(cell.value);
      }
    }
  }
  for (const sheet of plan.sheets) {
    for (const part of sheet.print?.header ?? []) if (!dealValues.has(part)) keep(part);
  }
  for (const note of plan.notes) keep(note.text);
  return out;
};

/** A deal that names nothing, so the engine's fallback header is the one that prints. */
const anonymousDeal = (): unknown => {
  const deal = structuredClone(example);
  deal.metadata.accountName = '';
  deal.metadata.dealName = '';
  deal.metadata.dealId = '';
  return deal;
};

/**
 * Everything reachable across the deals that between them exercise each branch.
 *
 * One deal is not enough, and pretending otherwise would make the surplus check lie. The header is the
 * clearest case: it prints the deal's own identifiers, and the engine's fallback only when the deal names
 * nothing. Two deals cover both.
 */
const reachable = (): Set<string> => {
  const out = new Set<string>();
  for (const deal of [example, anonymousDeal()]) for (const text of renderedByEngine(deal)) out.add(text);
  return out;
};

describe('the catalogue is proven against a workbook, not against my reading of the code', () => {
  test('every string the engine renders is in the catalogue', () => {
    // The check that cannot miss a source, because it does not depend on knowing what the sources are.
    // Three hand-written enumerations of this list were wrong before it existed.
    const catalogue = translatableSet(spec, schema);
    const missing = [...reachable()].filter((text) => !catalogue.has(text));
    expect(missing).toEqual([]);
  });

  test('the catalogue holds nothing the workbook does not show', () => {
    // The other direction, so the catalogue cannot pass the first test by containing everything. A
    // surplus entry is a translation nobody reads, and it looks exactly like coverage.
    const rendered = reachable();
    const surplus = [...translatableSet(spec, schema)].filter((text) => !rendered.has(text));
    expect(surplus).toEqual([]);
  });

  test("the printed header the engine falls back to is catalogued, and the deal's own parts are not", () => {
    // Another string masked by a coincidence: FALLBACK_HEADER is spelled exactly like the title and the
    // sheet name, so the checks above passed without ever scanning a print header. Review caught it after
    // the same bug in the tab name — one instance fixed is not the class swept.
    const anonymous = renderedByEngine(anonymousDeal());
    expect(anonymous.has(FALLBACK_HEADER)).toBe(true);
    // Asserted on the SOURCE, not on presence. `FALLBACK_HEADER` is spelled exactly like the title and
    // the sheet name, so the string is in the catalogue whether or not the header is a source — a
    // presence check here passes with the header source deleted, which is how the same coincidence
    // defeated this test's first version. The source set is what distinguishes them.
    expect([...(translatableStrings(spec, schema).get(FALLBACK_HEADER) ?? [])]).toContain('header');
    // With identifiers present the header is the deal's, and none of it is the engine's to translate.
    const named = structuredClone(example);
    named.metadata.accountName = 'Zzyzx Holdings';
    named.metadata.dealName = 'Qwertyuiop Refresh';
    expect(renderedByEngine(named).has('Zzyzx Holdings')).toBe(false);
    expect(renderedByEngine(named).has('Qwertyuiop Refresh')).toBe(false);
  });

  test('a deal-supplied value is never in the catalogue', () => {
    // Localising an account name would be corrupting the deal, not translating the sheet.
    const deal = structuredClone(example);
    deal.metadata.accountName = 'Zzyzx Holdings Kommanditgesellschaft';
    deal.metadata.dealName = 'Qwertyuiop Platform Refresh';
    deal.qualification.metrics.evidence = 'Xyzzy plugh, per the CTO';
    const catalogue = translatableSet(spec, schema);
    for (const value of [deal.metadata.accountName, deal.metadata.dealName, deal.qualification.metrics.evidence]) {
      expect(catalogue.has(value), value).toBe(false);
    }
    // And the oracle agrees: those strings are rendered, but not by the engine.
    const rendered = renderedByEngine(deal);
    for (const value of [deal.metadata.accountName, deal.qualification.metrics.evidence]) {
      expect(rendered.has(value), value).toBe(false);
    }
  });

  test("a sheet's tab name is catalogued even when it does not match its title", () => {
    // The shipped spec names its sheet exactly what its title block says, so the two checks above passed
    // whether or not tab names were collected — the oracle found the string, having been handed it by the
    // title. That is a coincidence, not coverage, and review caught it. Breaking the coincidence is the
    // only way to test the thing.
    const renamed = structuredClone(spec) as WorkbookSpec;
    renamed.sheets[0].name = 'Revue de transaction';
    expect(translatableSet(renamed, schema).has('Revue de transaction')).toBe(true);
    // And the shipped one still holds its own name, by that route rather than by the title's.
    const titleless = structuredClone(spec) as WorkbookSpec;
    titleless.sheets[0].blocks = titleless.sheets[0].blocks.filter((b) => b.kind !== 'title');
    expect(translatableSet(titleless, schema).has('MEDDPICC Deal Review')).toBe(true);
  });

  test('prose inside a spec formula is catalogued', () => {
    // The shipped spec has none — #929 moved the last three onto `{{word:…}}` — so this cannot be tested
    // against it, and a guard nothing exercises is a guard nobody knows is broken. Feed it one.
    const withProse = structuredClone(spec) as WorkbookSpec;
    const scorecard = withProse.sheets[0].blocks.find((b) => b.cells?.some((c) => c.formula));
    const cell = scorecard?.cells?.find((c) => c.formula);
    if (!cell) throw new Error('no formula cell in the spec to extend — the fixture needs revisiting');
    cell.formula = 'IF(1=1,"On track","At risk")';
    const catalogue = translatableSet(withProse, schema);
    expect(catalogue.has('On track')).toBe(true);
    expect(catalogue.has('At risk')).toBe(true);
    // And the operators around them are not mistaken for prose.
    expect(catalogue.has('1=1')).toBe(false);
  });

  test('a NoteSource discriminator is not prose', () => {
    // `note: "elementDefinition"` names which note to hang. My first extraction counted it, which would
    // have produced a locale entry for a type tag — invisible, and indistinguishable from coverage.
    expect(translatableSet(spec, schema).has('elementDefinition')).toBe(false);
  });

  test('the count comes from the function, and every source contributes', () => {
    // Published numbers get stale; this one is computed. The per-source tally is here because each of the
    // six was a miss at some point, and a source silently contributing nothing is how it would recur.
    const catalogue = translatableStrings(spec, schema);
    const bySource = new Map<string, number>();
    for (const sources of catalogue.values()) {
      for (const source of sources) bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }
    for (const source of ['spec', 'schema', 'enum', 'label', 'boolean', 'section']) {
      expect(bySource.get(source) ?? 0, source).toBeGreaterThan(0);
    }
    // The schema-derived strings were the largest miss: 8 definitions, 16 questions, 40 rubric lines.
    expect(bySource.get('schema')).toBe(64);
    expect(catalogue.size).toBe(199);
  });
});

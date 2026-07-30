import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { planWorkbook } from './generate';
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
  for (const note of plan.notes) keep(note.text);
  return out;
};

describe('the catalogue is proven against a workbook, not against my reading of the code', () => {
  test('every string the engine renders is in the catalogue', () => {
    // The check that cannot miss a source, because it does not depend on knowing what the sources are.
    // Three hand-written enumerations of this list were wrong before it existed.
    const catalogue = translatableSet(spec, schema);
    const missing = [...renderedByEngine(example)].filter((text) => !catalogue.has(text));
    expect(missing).toEqual([]);
  });

  test('the catalogue holds nothing the workbook does not show', () => {
    // The other direction, so the catalogue cannot pass the first test by containing everything. A
    // surplus entry is a translation nobody reads, and it looks exactly like coverage.
    const rendered = renderedByEngine(example);
    const surplus = [...translatableSet(spec, schema)].filter((text) => !rendered.has(text));
    expect(surplus).toEqual([]);
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

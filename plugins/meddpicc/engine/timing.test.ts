import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateWorkbook, planWorkbook } from './generate';
import { computeElementHint, computeHintOverview } from './hint';
import { readPath } from './json-path';
import { readWorkbook } from './read-workbook';
import { computeScore } from './score';
import { validateDeal } from './validate';
import type { WorkbookSpec } from './workbook-spec';

const root = path.resolve(import.meta.dir, '../../..');
const plugin = path.join(root, 'plugins/meddpicc');
const schema = JSON.parse(fs.readFileSync(path.join(plugin, 'schema/meddpicc-schema.json'), 'utf8'));
const example = JSON.parse(fs.readFileSync(path.join(plugin, 'schema/example-deal.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(plugin, 'engine/workbook-spec.json'), 'utf8')) as WorkbookSpec;
const neutral = 'Customer-confirmed business problem and its impact';
const legacy = 'The compelling business pain that creates urgency to act';

function markdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(file) : entry.name.endsWith('.md') ? [file] : [];
  });
}

describe('customer timing boundary across marketplace guidance', () => {
  test('all 22 active plugins are inspected for the identified imposed schedules', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, '.xcsh-plugin/marketplace.json'), 'utf8'));
    expect(catalog.plugins).toHaveLength(22);
    const forbidden =
      /Day 0[–-]7|\bthis week\b|\blast week'?s commitment\b|\blast 2 weeks\b|\b2\+ weeks\b|\bnext 90 days\b|\b30-day success review\b|\bhard end date\b|Specific date, not "TBD"|Concrete date, not "ASAP"|weekly inspections|structured weekly|weekly deal reviews must/i;
    const violations: string[] = [];
    for (const { name } of catalog.plugins) {
      for (const subtree of ['skills', 'commands', 'agents']) {
        for (const file of markdownFiles(path.join(root, 'plugins', name, subtree))) {
          fs.readFileSync(file, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              if (forbidden.test(line)) violations.push(`${path.relative(root, file)}:${index + 1}: ${line}`);
            });
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('each independently invoked MEDDPICC and sales-engineer skill carries the timing boundary', () => {
    for (const name of ['meddpicc', 'sales-engineer']) {
      for (const file of markdownFiles(path.join(root, 'plugins', name, 'skills')).filter((f) =>
        f.endsWith('SKILL.md'),
      )) {
        const text = fs.readFileSync(file, 'utf8');
        expect(text, file).toContain('Honor explicit user or customer dates');
        expect(text, file).toContain('only when explicitly requested');
        expect(text, file).toContain('unknown or unagreed');
      }
    }
  });
});

describe('neutral engine guidance with existing-record compatibility', () => {
  test('English hints reward attributable business evidence and champion action without deadlines', () => {
    const hint = computeElementHint(schema, 'implicateThePain');
    expect(hint.definition).toBe(neutral);
    expect(hint.scoreDefinition['4']).toContain('Multiple stakeholders confirm quantified impact');
    expect(hint.scoreDefinition['4']).toContain('attributable evidence');
    expect(hint.scoreDefinition['4']).not.toMatch(/urgent|deadline|trigger/i);
    expect(computeElementHint(schema, 'champion').scoreDefinition['4']).not.toContain('weekly');
    expect(computeHintOverview(schema).elements.find((e) => e.element === 'implicateThePain')?.definition).toBe(
      neutral,
    );
  });

  test('both definitions validate; validation does not change saved evidence, scores or supplied dates', () => {
    for (const definition of [legacy, neutral]) {
      const deal = structuredClone(example);
      deal.qualification.implicateThePain.definition = definition;
      const before = JSON.stringify(deal);
      expect(validateDeal(deal, schema).valid).toBe(true);
      expect(JSON.stringify(deal)).toBe(before);
      expect(computeScore(deal)).toEqual(computeScore(example));
    }
    const invalid = structuredClone(example);
    invalid.qualification.implicateThePain.definition = 'invented rubric';
    expect(validateDeal(invalid, schema).valid).toBe(false);
  });

  test('English workbook uses the current rubric even for a legacy deal and preserves its data', () => {
    const deal = structuredClone(example);
    deal.qualification.implicateThePain.definition = legacy;
    deal.qualification.implicateThePain.scoreDefinition['4'] =
      'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver';
    const plan = planWorkbook(schema, spec, deal);
    expect(plan.notes.some((n) => n.text === neutral)).toBe(true);
    const formulas = plan.sheets.flatMap((s) => s.rows.flatMap((r) => r.cells.map((c) => c.formula ?? ''))).join('\n');
    expect(formulas).toContain('Multiple stakeholders confirm quantified impact');
    expect(formulas).not.toMatch(/clear deadline driver|taking concrete actions weekly/);
    const report = readWorkbook(schema, spec, deal, generateWorkbook(schema, spec, deal));
    expect(report.ok).toBe(true);
    expect(report.deal).toEqual(deal);
  });

  test('every absent date remains blank in the workbook and absent after round trip', () => {
    const deal = structuredClone(example);
    function removeDates(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (/date/i.test(key)) delete (value as Record<string, unknown>)[key];
        else removeDates(child);
      }
    }
    removeDates(deal);
    expect(validateDeal(deal, schema).valid).toBe(true);
    const plan = planWorkbook(schema, spec, deal);
    const dates = plan.inputCells.filter((c) => c.valueType === 'date');
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      const cell = plan.sheets
        .find((s) => s.name === date.sheet)
        ?.rows.flatMap((r) => r.cells)
        .find((c) => c.ref === date.address);
      expect(cell?.value, date.jsonPath).toBeUndefined();
      expect(readPath(deal, date.jsonPath)).toBeUndefined();
    }
    const report = readWorkbook(schema, spec, deal, generateWorkbook(schema, spec, deal));
    expect(report.ok).toBe(true);
    expect(report.deal).toEqual(deal);
  });
});

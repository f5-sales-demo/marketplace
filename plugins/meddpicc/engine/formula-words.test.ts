import { expect, test } from 'bun:test';
import * as path from 'node:path';
import { BOOLEAN_NO, BOOLEAN_YES, FORMULA_WORDS } from './generate';
import { enumLabel } from './labels';
import { CF_PRESETS } from './xlsx';

const dir = path.join(import.meta.dir, '..');
const spec = JSON.parse(await Bun.file(path.join(dir, 'engine', 'workbook-spec.json')).text());
const schema = JSON.parse(await Bun.file(path.join(dir, 'schema', 'meddpicc-schema.json')).text());

/**
 * Every word a dropdown can show, as the sheet spells it.
 *
 * `metadata.locale` is excluded: its members are locale identifiers, not prose, and a formula naming
 * one would be naming an identifier rather than repeating a displayed word.
 */
const displayedEnumWords = (): Set<string> => {
  const out = new Set<string>();
  const walk = (node: unknown, dotted: string): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.enum) && dotted !== 'metadata.locale') {
      for (const value of n.enum) if (typeof value === 'string') out.add(enumLabel(value));
    }
    for (const [key, value] of Object.entries(n)) {
      if (key === 'enum' || key === 'const' || key === 'default') continue;
      if (key === 'properties' || key === '$defs') {
        if (value && typeof value === 'object')
          for (const [name, sub] of Object.entries(value)) walk(sub, dotted ? `${dotted}.${name}` : name);
        continue;
      }
      if (key === 'items') walk(value, dotted);
      else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, dotted);
    }
  };
  walk(schema, '');
  return out;
};

/** Every quoted literal in every formula the spec carries, with the id of the cell that carries it. */
const specFormulaLiterals = (): Array<{ id: string; literal: string }> => {
  const out: Array<{ id: string; literal: string }> = [];
  const walk = (node: unknown, fallbackId: string): void => {
    if (Array.isArray(node)) {
      for (const [i, item] of node.entries()) walk(item, `${fallbackId}[${i}]`);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const id = typeof n.id === 'string' ? n.id : fallbackId;
    if (typeof n.formula === 'string') {
      for (const match of n.formula.matchAll(/"([^"]*)"/g)) out.push({ id, literal: match[1] ?? '' });
    }
    for (const [key, value] of Object.entries(n)) if (typeof value === 'object') walk(value, `${id}.${key}`);
  };
  walk(spec, '$');
  return out;
};

test('no formula in the spec spells an enum word by hand', () => {
  // FORMULA_WORDS exists so that a word appearing in both a cell and the formula that counts it has one
  // source. A literal in the JSON is one file away from the constant that decides what the cell says:
  // rename the enum value and the COUNTIF silently returns nought, with no error and nothing to notice
  // it. Use `{{word:…}}` instead, and add the word to FORMULA_WORDS if it is not there yet.
  const words = displayedEnumWords();
  const offenders = specFormulaLiterals().filter((l) => words.has(l.literal));
  expect(offenders.map((o) => `${o.id}: "${o.literal}"`)).toEqual([]);
});

test('every word a conditional format compares is one a dropdown still offers', () => {
  // Named for what it checks. It cannot tell a hand-spelled `"Red"` from `enumLabel('Red')`, because both
  // produce the same string — and `enumLabel` falls through for a value it has no entry for, so routing
  // through it is presentation, not coupling. What it does catch is the failure that matters: a preset
  // comparing against a word no dropdown offers any more is a colour that never appears, and nothing
  // else in the suite would notice.
  const words = displayedEnumWords();
  const offenders: string[] = [];
  for (const [preset, rules] of Object.entries(CF_PRESETS)) {
    for (const rule of rules) {
      for (const formula of rule.formulas) {
        const literal = /^"(.*)"$/.exec(formula)?.[1];
        if (literal !== undefined && !words.has(literal)) offenders.push(`${preset}: ${formula}`);
      }
    }
  }
  // Every quoted word a preset compares against must still be a word some dropdown offers. Renaming an
  // enum value in the schema without following it here fails this.
  expect(offenders).toEqual([]);
});

test('every word the formulas can name is one the sheet still shows', () => {
  // The rename guard for the other direction. FORMULA_WORDS entries that no enum offers any more are
  // formulas comparing against a word that cannot appear.
  const words = displayedEnumWords();
  const booleans = new Set([BOOLEAN_YES, BOOLEAN_NO]);
  const orphans = Object.entries(FORMULA_WORDS)
    .filter(([, value]) => !words.has(value) && !booleans.has(value))
    .map(([key, value]) => `${key} -> "${value}"`);
  expect(orphans).toEqual([]);
});

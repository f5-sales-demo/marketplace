import { expect, test } from 'bun:test';
import * as path from 'node:path';
import { BOOLEAN_NO, BOOLEAN_YES, FORMULA_WORDS } from './generate';
import { enumLabel } from './labels';
import { schemaConstraint } from './schema-path';
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

/** Every formula the spec carries, with the id of the cell carrying it. */
const specFormulas = (): Array<{ id: string; formula: string }> => {
  const out: Array<{ id: string; formula: string }> = [];
  const walk = (node: unknown, fallbackId: string): void => {
    if (Array.isArray(node)) {
      for (const [i, item] of node.entries()) walk(item, `${fallbackId}[${i}]`);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const id = typeof n.id === 'string' ? n.id : fallbackId;
    if (typeof n.formula === 'string') out.push({ id, formula: n.formula });
    for (const [key, value] of Object.entries(n)) if (typeof value === 'object') walk(value, `${id}.${key}`);
  };
  walk(spec, '$');
  return out;
};

/** Every table in the spec, by id. */
const specTables = (): Map<string, Record<string, unknown>> => {
  const out = new Map<string, Record<string, unknown>>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const table = n.table as Record<string, unknown> | undefined;
    if (table && typeof table.id === 'string') out.set(table.id, table);
    for (const value of Object.values(n)) if (typeof value === 'object') walk(value);
  };
  walk(spec);
  return out;
};

/** The labels a schema enum at this dotted path offers, or undefined when it has none. */
const enumLabelsAt = (dotted: string): Set<string> | undefined => {
  const values = schemaConstraint(schema, dotted)?.enum;
  return values ? new Set(values.map(enumLabel)) : undefined;
};

/**
 * Columns whose values are not a deal field, so their enum cannot be read from a `jsonPath`.
 *
 * `sections.status` is computed by `computeCompletion`, which emits the members of
 * `$defs.sectionStatus` — the one place the sheet shows a value no deal field holds.
 */
const DERIVED_COLUMN_ENUMS: Record<string, readonly string[]> = {
  'sections.status': (schema.$defs?.sectionStatus?.enum ?? []) as readonly string[],
};

/**
 * Words a formula writes INTO a cell rather than comparing against a column, with the enum that cell
 * holds. `scoreRating` emits a rating; nothing in its formula names the rating column, so the binding
 * cannot be derived from the formula and is stated here instead.
 */
const EMITTED_WORD_ENUMS: Record<string, string> = {
  ratingRed: 'scoring.overallRating',
  ratingYellow: 'scoring.overallRating',
  ratingGreen: 'scoring.overallRating',
};

/** The enum behind `{{col:table.column}}`, or undefined when that column has none. */
const columnEnumOf = (reference: string): { path: string; labels: Set<string> } | undefined => {
  const derived = DERIVED_COLUMN_ENUMS[reference];
  if (derived) return { path: reference, labels: new Set(derived.map(enumLabel)) };
  const [tableId, columnId] = reference.split('.');
  const table = tableId === undefined ? undefined : specTables().get(tableId);
  if (!table) return undefined;
  const source = table.source as { kind?: string; jsonPath?: string } | undefined;
  const column = (table.columns as Array<Record<string, unknown>> | undefined)?.find((c) => c.id === columnId);
  if (source?.kind !== 'list' || !source.jsonPath || typeof column?.jsonPath !== 'string') return undefined;
  const path = `${source.jsonPath}.${column.jsonPath}`;
  const labels = enumLabelsAt(path);
  return labels ? { path, labels } : undefined;
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

test('every word is checked against the enum of the column it is actually compared with', () => {
  // The global set above is too weak on its own, and `statusComplete` is why. One word is compared
  // against THREE independently-renameable enums — `sections.status` from `$defs.sectionStatus`,
  // `milestones.status` from `closePlan.milestones[]`, and `actions.status` from
  // `closePlan.criticalActions[]`. Rename `complete` to `done` under milestones alone and
  // `milestonesComplete` counts a word that column no longer shows, silently returning nought — while a
  // check that only asks "does this word exist somewhere in the schema" still passes, because
  // `sectionStatus` kept it.
  //
  // So each word is checked against the enum of each column its own formula names. The pairing is read
  // out of the spec rather than declared here, so it cannot drift from the formulas it describes.
  const failures: string[] = [];
  for (const { id, formula } of specFormulas()) {
    const wordKeys = [...formula.matchAll(/\{\{word:([^}]+)\}\}/g)].map((m) => m[1] ?? '');
    if (wordKeys.length === 0) continue;
    const columnEnums = [...formula.matchAll(/\{\{col:([^}]+)\}\}/g)]
      .map((m) => columnEnumOf(m[1] ?? ''))
      .filter((e): e is { path: string; labels: Set<string> } => e !== undefined);
    for (const key of wordKeys) {
      const value = FORMULA_WORDS[key];
      if (value === undefined) {
        failures.push(`${id}: {{word:${key}}} names no word`);
        continue;
      }
      for (const { path, labels } of columnEnums) {
        if (!labels.has(value)) failures.push(`${id}: "${value}" is not a value ${path} offers`);
      }
      // A word a formula EMITS is compared with nothing, so the receiving cell's own enum is the binding.
      const emitted = EMITTED_WORD_ENUMS[key];
      if (emitted) {
        const labels = enumLabelsAt(emitted);
        if (!labels?.has(value)) failures.push(`${id}: "${value}" is not a value ${emitted} offers`);
      }
    }
  }
  expect(failures).toEqual([]);
});

test('every word in the table is bound to an enum by something', () => {
  // Otherwise the check above is satisfied by a word no formula uses, or by one whose formula names no
  // enumerated column — and an unbound word is back to being spelled by hand, just in TypeScript.
  const booleans = new Set([BOOLEAN_YES, BOOLEAN_NO]);
  const bound = new Set<string>(Object.keys(EMITTED_WORD_ENUMS));
  for (const { formula } of specFormulas()) {
    const hasEnumeratedColumn = [...formula.matchAll(/\{\{col:([^}]+)\}\}/g)].some(
      (m) => columnEnumOf(m[1] ?? '') !== undefined,
    );
    if (!hasEnumeratedColumn) continue;
    for (const m of formula.matchAll(/\{\{word:([^}]+)\}\}/g)) bound.add(m[1] ?? '');
  }
  const unbound = Object.entries(FORMULA_WORDS)
    // The two boolean words are bound by the Yes/No pair itself: a boolean column has no enum to read.
    .filter(([key, value]) => !bound.has(key) && !booleans.has(value))
    .map(([key, value]) => `${key} -> "${value}"`);
  expect(unbound).toEqual([]);
});

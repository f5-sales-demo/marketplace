import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { canonicalEnumValue, ENUM_LABELS, enumLabel, enumLabels } from './labels';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));

/** Every enum the schema declares, by the path that owns it. */
function schemaEnums(node: unknown, at = ''): Array<{ at: string; values: string[] }> {
  if (Array.isArray(node)) return node.flatMap((v, i) => schemaEnums(v, `${at}[${i}]`));
  if (node === null || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  const found: Array<{ at: string; values: string[] }> = [];
  if (Array.isArray(record.enum)) found.push({ at, values: record.enum.map(String) });
  for (const [key, value] of Object.entries(record)) found.push(...schemaEnums(value, at ? `${at}.${key}` : key));
  return found;
}

describe('enumLabel', () => {
  test('a snake_case JSON value reads as words', () => {
    expect(enumLabel('in_progress')).toBe('In progress');
    expect(enumLabel('not_started')).toBe('Not started');
  });

  test('a value with no entry is shown as it stands', () => {
    // Most of the schema's enums are already written for a reader — "Best Case", "Influencer" —
    // and inventing a label for them would be a second spelling to keep in step.
    expect(enumLabel('Best Case')).toBe('Best Case');
    expect(enumLabel('Influencer')).toBe('Influencer');
  });
});

describe('canonicalEnumValue', () => {
  test('a label maps back to the JSON value it stands for', () => {
    expect(canonicalEnumValue('In progress')).toBe('in_progress');
    expect(canonicalEnumValue('Not started')).toBe('not_started');
  });

  test('the JSON value maps to itself, so either spelling can be typed', () => {
    // A rep may type what the dropdown offers or what they have seen in the JSON. Both are the
    // same intent, and refusing one of them would be pedantry.
    for (const value of Object.keys(ENUM_LABELS)) expect(canonicalEnumValue(value)).toBe(value);
  });

  test('a word that is neither is not invented into one', () => {
    expect(canonicalEnumValue('Halfway')).toBeUndefined();
  });

  test('matching ignores case and surrounding space, because typing does', () => {
    expect(canonicalEnumValue('  in progress ')).toBe('in_progress');
    expect(canonicalEnumValue('IN PROGRESS')).toBe('in_progress');
  });
});

describe('no two values may share a label', () => {
  // The reverse map is what read-back stands on. Two enum values labelled the same string would
  // make it ambiguous, and the reader would silently write whichever one the map happened to keep.
  // This is the guard the localisation work needs as well: machine translation across thirteen
  // locales makes a collision likely rather than hypothetical.
  test('the shipped map has no collision', () => {
    const seen = new Map<string, string>();
    for (const [value, label] of Object.entries(ENUM_LABELS)) {
      const key = label.trim().toLowerCase();
      expect(seen.has(key), `"${label}" labels both ${seen.get(key)} and ${value}`).toBe(false);
      seen.set(key, value);
    }
  });

  test('enumLabels refuses a set whose labels collide', () => {
    // Applied to one enum's values, not to the whole map: two DIFFERENT enums may legitimately
    // share a label, and only members of the same dropdown have to be told apart.
    expect(() => enumLabels(['pending', 'in_progress', 'complete'])).not.toThrow();
    expect(() => enumLabels(['metrics', 'Metrics'])).toThrow(/both read as/);
  });
});

describe('every snake_case enum value the schema can hold has a label', () => {
  // A value like `in_progress` shown as it stands is the defect this closes — the sheet is read by
  // people in a deal review, and `in_progress` is a JSON token.
  test('no enum member reaches a cell still in snake_case', () => {
    const unlabelled: string[] = [];
    for (const { at, values } of schemaEnums(schema)) {
      for (const value of values) {
        if (!/_/.test(value)) continue;
        if (enumLabel(value) === value) unlabelled.push(`${at}: ${value}`);
      }
    }
    expect(unlabelled).toEqual([]);
  });

  test('the search itself finds the enums it is meant to police', () => {
    // Otherwise the assertion above passes on an empty list, which it did while the walk returned
    // nothing at all.
    const all = schemaEnums(schema);
    expect(all.length).toBeGreaterThan(5);
    expect(all.flatMap((e) => e.values)).toContain('in_progress');
  });
});

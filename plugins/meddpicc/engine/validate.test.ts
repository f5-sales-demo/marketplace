import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
  ANNOTATION_KEYWORDS,
  DATA_VALUED_KEYWORDS,
  ENFORCED_KEYWORDS,
  LENIENT_KEYWORDS,
  validateDeal,
} from './validate';

const dir = path.join(import.meta.dir, '..', 'schema');
const schema = JSON.parse(await Bun.file(path.join(dir, 'meddpicc-schema.json')).text());
const example = JSON.parse(await Bun.file(path.join(dir, 'example-deal.json')).text());

describe('validateDeal', () => {
  test('the example deal is valid', () => {
    const r = validateDeal(example, schema);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
  test('missing required metadata is invalid', () => {
    const r = validateDeal({ qualification: {} }, schema);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  test('an out-of-range score is invalid', () => {
    const bad = structuredClone(example);
    bad.qualification.metrics.score = 9;
    const r = validateDeal(bad, schema);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.instancePath.includes('/qualification/metrics/score'))).toBe(true);
  });
});

describe('a deal has to say which deal it is', () => {
  // Present-but-empty is the gap: `required` asks whether the key is there, not whether it says
  // anything. So `{"dealId": ""}` satisfied it, and the engine went on to name the file and the
  // round-trip stamp after nothing at all.
  for (const field of ['dealId', 'accountName', 'dealName']) {
    test(`an empty ${field} is refused, and the error names it`, () => {
      const bad = structuredClone(example);
      bad.metadata[field] = '';
      const r = validateDeal(bad, schema);
      expect(r.valid).toBe(false);
      const named = r.errors.filter((e) => e.instancePath === `/metadata/${field}`);
      expect(named.length).toBeGreaterThan(0);
      expect(named[0]?.keyword).toBe('minLength');
    });
  }

  test('a stakeholder has a name and a title, or is not a stakeholder', () => {
    // Both are already `required`, so an entry carrying them empty is a row that claims to describe a
    // person while naming none.
    for (const field of ['name', 'title']) {
      const bad = structuredClone(example);
      bad.stakeholders[0][field] = '';
      const r = validateDeal(bad, schema);
      expect(r.valid, field).toBe(false);
      expect(
        r.errors.some((e) => e.instancePath === `/stakeholders/0/${field}`),
        field,
      ).toBe(true);
    }
  });

  test('a whitespace-only identity still validates, and that is a decision', () => {
    // `minLength` counts what the specification says it counts, so a single space passes. Left that way
    // deliberately: the alternative is either giving a standard keyword a private trimmed meaning, or
    // implementing `pattern`, which would newly enforce three Salesforce-ID patterns no deal has ever
    // been checked against. Neither belongs in #901. The engine's own `isFilled` trims, so the sheet
    // and the completion rules still read a space as empty; only `validate` is this permissive.
    const spaced = structuredClone(example);
    spaced.metadata.dealId = ' ';
    expect(validateDeal(spaced, schema).valid).toBe(true);
  });

  test('the fields that are legitimately empty stay that way', () => {
    // A deal is worked over weeks: prose, evidence and notes are blank until somebody learns the
    // answer, and the completion rules depend on being able to tell blank from filled. Bounding those
    // would refuse every deal in progress, which is the opposite of the point.
    const working = structuredClone(example);
    working.qualification.metrics.evidence = '';
    working.qualification.metrics.notes = '';
    working.threeWhys = { whyChange: '', whyNow: '', whyUs: '' };
    const r = validateDeal(working, schema);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });
});

describe('a constraint the validator ignores is worse than no constraint', () => {
  /** Every keyword the schema uses, skipping the keys that are field names or plain data. */
  const keywordsUsedBy = (root: unknown): Set<string> => {
    const seen = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        // The keys under these are field names, not keywords — their values are subschemas.
        if (key === 'properties' || key === '$defs' || key === 'definitions' || key === 'patternProperties') {
          seen.add(key);
          if (value && typeof value === 'object') for (const sub of Object.values(value)) walk(sub);
          continue;
        }
        seen.add(key);
        // `default: {"0": "..."}` is an example score table, not a schema with a "0" keyword.
        if (!DATA_VALUED_KEYWORDS.has(key)) walk(value);
      }
    };
    walk(root);
    return seen;
  };

  test('every keyword the schema uses is one the validator has heard of', () => {
    // #901 was exactly this bug: `minLength` in the schema, unimplemented in the validator, would have
    // read as a constraint and enforced nothing.
    const unknown = [...keywordsUsedBy(schema)].filter(
      (k) => !ENFORCED_KEYWORDS.has(k) && !LENIENT_KEYWORDS.has(k) && !ANNOTATION_KEYWORDS.has(k),
    );
    expect(unknown).toEqual([]);
  });

  test('every keyword claimed as enforced really does reject something', () => {
    // Otherwise the test above is satisfied by adding a name to a list, which is how a declaration
    // starts lying. One counterexample per keyword; the structural ones are proved by the error their
    // subschema raises.
    const counterexamples: Array<[string, Record<string, unknown>, unknown]> = [
      ['type', { type: 'string' }, 42],
      ['required', { type: 'object', required: ['a'] }, {}],
      ['properties', { type: 'object', properties: { a: { type: 'string' } } }, { a: 1 }],
      ['items', { type: 'array', items: { type: 'string' } }, [1]],
      ['enum', { enum: ['a', 'b'] }, 'c'],
      ['const', { const: 'a' }, 'b'],
      ['minimum', { type: 'number', minimum: 3 }, 2],
      ['maximum', { type: 'number', maximum: 3 }, 4],
      ['minLength', { type: 'string', minLength: 1 }, ''],
      ['additionalProperties', { type: 'object', properties: {}, additionalProperties: false }, { x: 1 }],
      ['allOf', { allOf: [{ type: 'string' }] }, 1],
      ['$ref', { $defs: { s: { type: 'string' } }, $ref: '#/$defs/s' }, 1],
      ['$defs', { $defs: { s: { type: 'string' } }, $ref: '#/$defs/s' }, 1],
    ];
    expect(new Set(counterexamples.map(([k]) => k))).toEqual(new Set(ENFORCED_KEYWORDS));
    for (const [keyword, sub, instance] of counterexamples) {
      expect(validateDeal(instance, sub).valid, keyword).toBe(false);
    }
  });
});

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

  // A space is not a name. `minLength` alone could not say so — it counts what the specification says
  // it counts — and giving a standard keyword a private trimmed meaning would mislead every reader of
  // the schema. `pattern: "\\S"` says it in the vocabulary the specification already has.
  //
  // Worth closing rather than documenting, because the consequence is concrete: a deal with
  // `dealId: " "` used to validate, generate, and then fail on read-back of its own unchanged
  // workbook, because the reader trims and proposes clearing the id. A file that cannot survive its
  // own round trip is exactly what an identity field is supposed to prevent.
  //
  // Space, tab, newline and the non-breaking space: every character `\s` matches is a character
  // `String.prototype.trim` removes, so `\S` and the engine's own `isFilled` draw the line in the same
  // place. That agreement is the point — a validator stricter than the reader is its own bug.
  for (const value of [' ', '\t', '\n', '   ', '\u00a0', ' \t\n ']) {
    test(`a dealId of ${JSON.stringify(value)} is not a name`, () => {
      const bad = structuredClone(example);
      bad.metadata.dealId = value;
      const r = validateDeal(bad, schema);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.instancePath === '/metadata/dealId')).toBe(true);
    });
  }

  test('a zero-width character is content, to the validator and the reader alike', () => {
    // U+200B is not matched by `\s` and `trim` does not remove it, so the engine reads it as filled and
    // the round trip keeps it. Refusing it here would make `validate` stricter than every other reader —
    // the same mismatch this bound exists to remove, pointing the other way.
    const zeroWidth = structuredClone(example);
    zeroWidth.metadata.dealId = '\u200b';
    expect('\u200b'.trim()).toBe('\u200b');
    expect(validateDeal(zeroWidth, schema).valid).toBe(true);
  });

  test('the round trip a whitespace identity used to break is now unreachable', () => {
    // The reader trims, so the cell holding " " reads as empty and the id is proposed for clearing —
    // leaving a deal that fails `required`. Refusing the deal up front is what makes that unreachable,
    // so this asserts the refusal and the reason together.
    const spaced = structuredClone(example);
    spaced.metadata.dealId = ' ';
    expect(validateDeal(spaced, schema).valid).toBe(false);
    const cleared = structuredClone(spaced);
    delete cleared.metadata.dealId;
    expect(validateDeal(cleared, schema).valid).toBe(false);
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

  test('a pattern the engine cannot compile is reported, not thrown and not skipped', () => {
    // The failure mode to avoid is a crash mid-validation, and the one after that is a silent skip,
    // which is #901 all over again: the schema would look like it constrained something.
    const r = validateDeal('anything', { type: 'string', pattern: '[' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.keyword).toBe('pattern');
    expect(r.errors[0]?.message).toContain('not a valid regular expression');
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
      ['pattern', { type: 'string', pattern: '\\S' }, '   '],
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

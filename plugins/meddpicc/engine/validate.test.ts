import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { validateDeal } from './validate';

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

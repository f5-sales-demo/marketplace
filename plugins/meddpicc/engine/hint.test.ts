import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { computeElementHint, computeHintOverview } from './hint';
import { QUALIFICATION_ELEMENTS } from './sections';

const schema = JSON.parse(
  await Bun.file(path.join(import.meta.dir, '..', 'schema', 'meddpicc-schema.json')).text(),
);

describe('computeHintOverview (L2)', () => {
  test('lists the 8 elements in canonical order with their definitions', () => {
    const o = computeHintOverview(schema);
    expect(o.elements.map((e) => e.element)).toEqual([...QUALIFICATION_ELEMENTS]);
    const metrics = o.elements.find((e) => e.element === 'metrics');
    expect(metrics?.definition).toContain('Quantified business outcomes');
    expect(o.workflow.length).toBeGreaterThan(0);
    expect(o.deeper).toContain('hint <element>');
  });
});

describe('computeElementHint (L3)', () => {
  test('metrics returns schema-derived definition, questions and 0-4 rubric', () => {
    const h = computeElementHint(schema, 'metrics');
    expect(h.definition).toContain('Quantified business outcomes');
    expect(h.questions).toEqual([
      'What goals is the client trying to accomplish?',
      'What KPIs are they using to measure the goals?',
    ]);
    expect(Object.keys(h.scoreDefinition)).toEqual(['0', '1', '2', '3', '4']);
    expect(h.scoreDefinition['4']).toContain('Committed');
  });
  test('unknown element throws listing valid keys', () => {
    expect(() => computeElementHint(schema, 'bogus')).toThrow(/Unknown MEDDPICC element/);
  });
});

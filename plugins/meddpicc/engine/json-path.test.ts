import { describe, expect, test } from 'bun:test';
import { readPath, writePath } from './json-path';

const deal = () => ({
  metadata: { accountName: 'Acme', revenue: { acv: 85000 } },
  stakeholders: [{ name: '<HISTORICAL_IDENTITY_7E8C729E4E>' }, { name: 'Marcus' }],
  qualification: { metrics: { responses: ['first', 'second'] } },
});

describe('readPath', () => {
  test('follows properties and indexes', () => {
    expect(readPath(deal(), 'metadata.revenue.acv')).toBe(85000);
    expect(readPath(deal(), 'stakeholders[1].name')).toBe('Marcus');
    expect(readPath(deal(), 'qualification.metrics.responses[0]')).toBe('first');
  });

  test('returns undefined rather than throwing on a path that is not there', () => {
    expect(readPath(deal(), 'metadata.nope')).toBeUndefined();
    expect(readPath(deal(), 'metadata.nope.deeper')).toBeUndefined();
    expect(readPath(deal(), 'stakeholders[9].name')).toBeUndefined();
    // A property read through an array, and an index read through an object: both are the
    // wrong shape, and neither may throw — the caller is asking about a cell, not asserting.
    expect(readPath(deal(), 'stakeholders.name')).toBeUndefined();
    expect(readPath(deal(), 'metadata[0]')).toBeUndefined();
  });
});

describe('writePath', () => {
  test('sets a value that is already there', () => {
    const d = deal();
    expect(writePath(d, 'metadata.accountName', 'Globex')).toBeNull();
    expect(d.metadata.accountName).toBe('Globex');
  });

  test('builds the objects on the way to a new leaf', () => {
    const d = deal();
    expect(writePath(d, 'metadata.lastClientInteraction.outcome', 'Agreed next steps')).toBeNull();
    expect(readPath(d, 'metadata.lastClientInteraction.outcome')).toBe('Agreed next steps');
  });

  test('appends at the end of a list', () => {
    const d = deal();
    expect(writePath(d, 'stakeholders[2].name', 'Dana')).toBeNull();
    expect(d.stakeholders.map((s) => s.name)).toEqual(['<HISTORICAL_IDENTITY_7E8C729E4E>', 'Marcus', 'Dana']);
  });

  test('builds a list that does not exist yet, but only from its first row', () => {
    const d = deal();
    expect(writePath(d, 'closePlan.milestones[0].description', 'Signed')).toBeNull();
    expect(readPath(d, 'closePlan.milestones[0].description')).toBe('Signed');

    const other = deal();
    expect(writePath(other, 'closePlan.milestones[2].description', 'Signed')).toMatch(/row 3.*row 1/);
    // And the refusal built nothing: a `closePlan` left behind would be a change nobody asked
    // for, in a deal reported as unchanged.
    expect(other).toEqual(deal());
  });

  test('refuses to leave a hole in a list', () => {
    const d = deal();
    expect(writePath(d, 'stakeholders[4].name', 'Dana')).toMatch(/row 5.*row 3/);
    expect(d).toEqual(deal());
  });

  test('refuses a path whose shape is wrong, and changes nothing', () => {
    const d = deal();
    expect(writePath(d, 'metadata.accountName.deeper', 'x')).toMatch(/expects an object/);
    expect(writePath(d, 'metadata[0]', 'x')).toMatch(/expects a list/);
    expect(writePath(d, '', 'x')).toMatch(/names nothing/);
    expect(d).toEqual(deal());
  });

  test('clearing deletes a property outright', () => {
    const d = deal();
    expect(writePath(d, 'metadata.accountName', undefined)).toBeNull();
    expect('accountName' in d.metadata).toBe(false);
  });

  test('clearing a list element keeps the positions of the others', () => {
    // A response's position is which question it answers, so removing the element would
    // re-attach every later answer to the wrong question.
    const d = deal();
    expect(writePath(d, 'qualification.metrics.responses[0]', undefined)).toBeNull();
    expect(d.qualification.metrics.responses).toEqual(['', 'second']);
  });

  test('clearing something that is not there is a no-op, not a construction', () => {
    const d = deal();
    expect(writePath(d, 'metadata.nextClientInteraction.objective', undefined)).toBeNull();
    expect(d).toEqual(deal());
  });
});

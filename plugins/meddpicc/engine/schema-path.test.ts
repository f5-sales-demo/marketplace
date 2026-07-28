import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { resolveSchemaPath, schemaConstraint } from './schema-path';

const schema = JSON.parse(await Bun.file(path.join(import.meta.dir, '..', 'schema', 'meddpicc-schema.json')).text());

describe('resolveSchemaPath', () => {
  test('resolves simple nested object paths', () => {
    expect(resolveSchemaPath(schema, 'metadata.accountName')).toBe(true);
    expect(resolveSchemaPath(schema, 'metadata.revenue.subscription')).toBe(true);
  });
  test('resolves through allOf + $ref + array items', () => {
    expect(resolveSchemaPath(schema, 'qualification.metrics.responses[0]')).toBe(true);
    expect(resolveSchemaPath(schema, 'qualification.champion.score')).toBe(true);
  });
  test('auto-descends arrays for column-style paths', () => {
    expect(resolveSchemaPath(schema, 'stakeholders.name')).toBe(true);
    expect(resolveSchemaPath(schema, 'closePlan.milestones.description')).toBe(true);
  });
  test('returns false for a non-existent path', () => {
    expect(resolveSchemaPath(schema, 'metadata.revenue.pAndIplusAcvxTYPO')).toBe(false);
    expect(resolveSchemaPath(schema, 'qualification.metrics.bogusField')).toBe(false);
  });
  test('returns false for an empty path', () => {
    expect(resolveSchemaPath(schema, '')).toBe(false);
  });
});

describe('schemaConstraint', () => {
  const schema = JSON.parse(
    require('node:fs').readFileSync(`${import.meta.dir}/../schema/meddpicc-schema.json`, 'utf8'),
  );

  test('reads an enum off a scalar property', () => {
    expect(schemaConstraint(schema, 'metadata.dealStatus')?.enum).toEqual([
      'Discovery',
      'Validated',
      'Qualified',
      'Proposal',
    ]);
  });

  test('reads an enum through an array item', () => {
    expect(schemaConstraint(schema, 'stakeholders.roleInDeal')?.enum).toEqual([
      'Economic buyer',
      'Decision maker',
      'Influencer',
    ]);
    expect(schemaConstraint(schema, 'closePlan.criticalActions.status')?.enum).toEqual([
      'pending',
      'in_progress',
      'complete',
    ]);
  });

  test('reads numeric bounds, which is what a 0-4 score needs', () => {
    const score = schemaConstraint(schema, 'qualification.metrics.score');
    expect(score?.minimum).toBe(0);
    expect(score?.maximum).toBe(4);
    expect(score?.type).toBe('integer');
  });

  test('reads an enum reached through a $ref', () => {
    // completionStatus.* is a $ref to #/$defs/sectionStatus.
    expect(schemaConstraint(schema, 'metadata.completionStatus.metrics')?.enum).toEqual([
      'not_started',
      'partial',
      'complete',
    ]);
  });

  test('returns undefined for a path that does not resolve', () => {
    expect(schemaConstraint(schema, 'metadata.nope')).toBeUndefined();
  });

  test('returns a node with no enum rather than inventing one', () => {
    expect(schemaConstraint(schema, 'metadata.accountName')?.enum).toBeUndefined();
    expect(schemaConstraint(schema, 'metadata.accountName')?.type).toBe('string');
  });
});

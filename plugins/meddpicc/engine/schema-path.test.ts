import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { resolveSchemaPath } from './schema-path';

const schema = JSON.parse(await Bun.file(path.join(import.meta.dir, '..', 'schema', 'meddpicc-schema.json')).text());

describe('resolveSchemaPath', () => {
  test('resolves simple nested object paths', () => {
    expect(resolveSchemaPath(schema, 'metadata.accountName')).toBe(true);
    expect(resolveSchemaPath(schema, 'metadata.revenue.pAndIplusAcvx')).toBe(true);
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

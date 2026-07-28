import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { checkSfdcMapping } from './mappings';

const dir = path.join(import.meta.dir, '..');
const schema = JSON.parse(await Bun.file(path.join(dir, 'schema', 'meddpicc-schema.json')).text());
const refs = path.join(dir, 'skills', 'deal-qualification', 'references');
const sfdc = JSON.parse(await Bun.file(path.join(refs, 'sfdc-field-mapping.json')).text());

describe('checkSfdcMapping', () => {
  test('the shipped Salesforce mapping resolves against the schema', () => {
    const r = checkSfdcMapping(schema, sfdc);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    // Every declared mapping is checked — counted from the file rather than a literal, so
    // dropping mappings from it cannot quietly reduce what this asserts.
    expect(r.checked).toBe(sfdc.fieldMappings.length);
    expect(r.checked).toBeGreaterThan(0);
  });

  test('detects a schemaPath that resolves nowhere', () => {
    const broken = structuredClone(sfdc);
    broken.fieldMappings[0].schemaPath = `${broken.fieldMappings[0].schemaPath}TYPO`;
    const r = checkSfdcMapping(schema, broken);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f: string) => f.endsWith('TYPO'))).toBe(true);
  });

  test('a mapping with no fieldMappings checks nothing and says so', () => {
    // Passing rather than reporting zero would make an empty or misnamed file look verified.
    const r = checkSfdcMapping(schema, {});
    expect(r.checked).toBe(0);
    expect(r.ok).toBe(true);
  });
});

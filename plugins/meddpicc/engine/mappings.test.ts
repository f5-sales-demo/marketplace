import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { checkMappings } from './mappings';
import { readTemplateText } from './template';

const dir = path.join(import.meta.dir, '..');
const schema = JSON.parse(await Bun.file(path.join(dir, 'schema', 'meddpicc-schema.json')).text());
const refs = path.join(dir, 'skills', 'deal-qualification', 'references');
const cell = JSON.parse(await Bun.file(path.join(refs, 'cell-mapping.json')).text());
const sfdc = JSON.parse(await Bun.file(path.join(refs, 'sfdc-field-mapping.json')).text());
const templateBytes = new Uint8Array(await Bun.file(path.join(refs, 'meddpicc-template.xlsx')).arrayBuffer());
const cellText = readTemplateText(templateBytes);

describe('readTemplateText', () => {
  test('reads a shared-string label', () => {
    expect(cellText('B4')).toBe('Account Name');
    expect(cellText('M4')).toBe('P&I+ACVx ($)');
  });

  test('reads the question text the qualification rows carry', () => {
    expect(cellText('C14')).toBe('What goals is the client trying to accomplish?');
  });

  test('returns null for a blank data cell', () => {
    expect(cellText('C4')).toBeNull();
    expect(cellText('H14')).toBeNull();
  });

  test('returns null for a numeric placeholder — 0 is data, not a label', () => {
    // N6/N7 ship holding 0. If these read as text the mapping check would reject two
    // perfectly good revenue targets.
    expect(cellText('N6')).toBeNull();
    expect(cellText('N7')).toBeNull();
  });
});

describe('checkMappings', () => {
  test('the shipped mapping is schema-valid and aimed at data cells', () => {
    const r = checkMappings(schema, cell, sfdc, cellText);
    expect(r.cell.failures).toEqual([]);
    expect(r.targets.failures).toEqual([]);
    expect(r.sfdc.failures).toEqual([]);
    expect(r.ok).toBe(true);
    // Every scalar, block, mirror and table cell is checked, not just the scalars.
    expect(r.cell.checked).toBeGreaterThan(150);
    expect(r.targets.checked).toBe(r.cell.checked);
    expect(r.sfdc.checked).toBe(10);
  });

  test('detects a broken jsonPath', () => {
    const broken = structuredClone(cell);
    broken.cells[0].jsonPath = `${broken.cells[0].jsonPath}TYPO`;
    const r = checkMappings(schema, broken, sfdc, cellText);
    expect(r.ok).toBe(false);
    expect(r.cell.failures.some((f: string) => f.endsWith('TYPO'))).toBe(true);
  });

  test('REJECTS a target aimed at a label cell', () => {
    // This is the regression that shipped for months: `metadata.accountName` pointed at
    // B4, the words "Account Name", instead of C4. Schema-valid, and wrong.
    const broken = structuredClone(cell);
    broken.cells.find((c: { jsonPath: string }) => c.jsonPath === 'metadata.accountName').cell = 'B4';
    const r = checkMappings(schema, broken, sfdc, cellText);
    expect(r.ok).toBe(false);
    expect(r.targets.failures.some((f: string) => f.startsWith('B4 holds'))).toBe(true);
  });

  test('REJECTS a target aimed at a question cell', () => {
    const broken = structuredClone(cell);
    broken.cells.find((c: { jsonPath: string }) => c.jsonPath === 'qualification.metrics.responses[0]').cell = 'C14';
    const r = checkMappings(schema, broken, sfdc, cellText);
    expect(r.ok).toBe(false);
    expect(r.targets.failures.some((f: string) => f.startsWith('C14 holds'))).toBe(true);
  });

  test('REJECTS a table whose maxRows runs past the formatted region', () => {
    // The previous mapping claimed 12 stakeholder rows; the template formats 11. Row 52
    // is where the next section's styling begins.
    const broken = structuredClone(cell);
    broken.tables.find((t: { jsonPath: string }) => t.jsonPath === 'stakeholders').maxRows = 20;
    const r = checkMappings(schema, broken, sfdc, cellText);
    expect(r.ok).toBe(false);
  });

  test('REJECTS writing over the templateformula at I7', () => {
    const broken = structuredClone(cell);
    broken.cells.push({ jsonPath: 'metadata.winProbability', cell: 'I7' });
    const r = checkMappings(schema, broken, sfdc, cellText);
    expect(r.ok).toBe(false);
    expect(r.targets.failures.some((f: string) => f.includes('I7 is reserved'))).toBe(true);
  });

  test('without a template reader the target check is skipped, not silently passed', () => {
    const r = checkMappings(schema, cell, sfdc);
    expect(r.targets.checked).toBe(0);
  });
});

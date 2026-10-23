import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ledger from '../benchmarks/ce-uat-ledger.json';
import { type TSchema, Type } from '../plugins/aws/node_modules/@sinclair/typebox';
import { assertCePublicInventory, registeredCePublicInterfaces } from './ce-uat-public-inventory';

// Ledger parameters are partial execution constraints, not complete executable requests.
function assertConstraints(parameters: Record<string, unknown>, schema: TSchema, path = '') {
  for (const [key, value] of Object.entries(parameters)) {
    const property = schema.properties?.[key];
    if (!property) throw Error(`Unsupported public parameter ${path}${key}`);
    if (value && typeof value === 'object' && !Array.isArray(value))
      assertConstraints(value as Record<string, unknown>, property, `${path}${key}.`);
  }
}
test('every ledger execution constraint exists in the actual public tool schema', async () => {
  const schemas = new Map<string, TSchema>();
  for (const row of ledger.rows) {
    const api = row.publicInterface;
    let schema = schemas.get(api.tool);
    if (!schema) {
      const source = new URL(`../${api.source}`, import.meta.url);
      const text = await readFile(source, 'utf8');
      const factory = text.match(/export function (create\w+Tool)\(/)?.[1];
      if (!factory) throw Error(`Missing public factory: ${api.tool}`);
      const module = await import(pathToFileURL(source.pathname).href);
      const tool = module[factory]({ typebox: { Type } });
      expect(tool.name).toBe(api.tool);
      schema = tool.parameters;
      if (!schema) throw Error(`Missing public schema: ${api.tool}`);
      schemas.set(api.tool, schema);
    }
    if (!schema) throw Error(`Missing public schema: ${api.tool}`);
    assertConstraints(api.parameters, schema);
  }
});
test('rejects invented top-level and nested engine parameters', () => {
  expect(() => assertConstraints({ engine: 'native' }, { properties: { planId: {} } })).toThrow('engine');
  expect(() =>
    assertConstraints({ intent: { engine: 'native' } }, { properties: { intent: { properties: {} } } }),
  ).toThrow('intent.engine');
});

test('ledger inventories every actually registered CE public tool', async () => {
  const registered = await registeredCePublicInterfaces();
  expect(registered.some((entry) => entry.tool === 'aws_ce_power')).toBe(true);
  assertCePublicInventory(ledger.publicInterfaces, registered);
});
test('public inventory rejects omission, duplicate entries and mismatched factory sources', async () => {
  const registered = await registeredCePublicInterfaces();
  const power = registered.find((entry) => entry.tool === 'aws_ce_power');
  if (!power) throw Error('Registered power tool missing');
  expect(() =>
    assertCePublicInventory(
      registered.filter((entry) => entry.tool !== power.tool),
      registered,
    ),
  ).toThrow('Missing');
  expect(() => assertCePublicInventory([...registered, power], registered)).toThrow('Duplicate');
  expect(() =>
    assertCePublicInventory(
      registered.map((entry) => (entry.tool === power.tool ? { ...entry, source: 'wrong.ts' } : entry)),
      registered,
    ),
  ).toThrow('mapping differs');
});

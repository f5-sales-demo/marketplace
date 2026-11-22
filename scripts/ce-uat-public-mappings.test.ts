import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { type TSchema, Type } from '../plugins/aws/node_modules/@sinclair/typebox';
import { ceUatLedger as ledger } from './ce-uat-ledger';
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
    const api = row.publicInterface as typeof row.publicInterface & { engineSelection?: string };
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
    const requirements = api as typeof api & {
      executionIdentifierRequirements?: string[];
      executionParameterRequirements?: string[];
    };
    for (const key of [
      ...(requirements.executionIdentifierRequirements ?? []),
      ...(requirements.executionParameterRequirements ?? []),
    ]) {
      expect(schema.properties?.[key]).toBeDefined();
    }
  }
});
test('rejects invented top-level and nested engine parameters', () => {
  expect(() => assertConstraints({ engine: 'native' }, Type.Object({ planId: Type.String() }))).toThrow('engine');
  expect(() => assertConstraints({ intent: { engine: 'native' } }, Type.Object({ intent: Type.Object({}) }))).toThrow(
    'intent.engine',
  );
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

test('ledger site execution constraints preserve row action, cloud and engine', () => {
  const sites = ledger.rows.filter((row) => ['site-create', 'site-read', 'site-update'].includes(row.feature));
  expect(sites).toHaveLength(36);
  for (const row of sites) {
    const api = row.publicInterface as typeof row.publicInterface & { engineSelection?: string };
    const params = api.parameters as {
      action?: string;
      namespace?: string;
      binding?: { owner?: { engine?: string; provider?: string } };
    };
    expect(params.action).toBe(row.feature.slice('site-'.length));
    expect(params.namespace).toBe('system');
    expect(params.binding?.owner?.engine).toBe(row.engine);
    expect(params.binding?.owner?.provider).toBe(row.cloud);
    expect(api.engineSelection).toBe('binding.owner.engine');
  }
  for (const row of ledger.rows.filter((row) => row.feature === 'bootstrap')) {
    expect(row.publicInterface.parameters.namespace).toBe('system');
    expect((row.publicInterface as typeof row.publicInterface & { engineSelection?: string }).engineSelection).toBe(
      'trusted-site-binding.owner.engine',
    );
  }
});

test('ledger cleanup execution constraints require coordinated teardown apply', () => {
  const cleanup = ledger.rows.filter((row) => ['empty-state', 'final-no-change'].includes(row.feature));
  expect(cleanup).toHaveLength(24);
  for (const row of cleanup) {
    const api = row.publicInterface as typeof row.publicInterface & { executionIdentifierRequirements?: string[] };
    expect(api.tool).toBe(`${row.cloud}_ce_teardown`);
    expect(api.parameters.operation).toBe('apply');
    expect(api.executionIdentifierRequirements).toEqual([
      'basePlanId',
      'basePlanSha256',
      'teardownPlanId',
      'teardownPlanSha256',
    ]);
  }
});

import { describe, expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { PluginInterface } from '../../src/az/types';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import type { AzureCeIntent } from '../../src/ce/types';
import { createAzureCePlanTool } from '../../src/tools/azure-ce-plan';
import { intent, observation } from './fixtures';

const versions = { software: 'crt-20260201-0178', os: '9.2026.14' };
describe('Azure create-time version binding', () => {
  for (const engine of ['native', 'terraform'] as const) {
    test(`${engine} freezes the explicit pair in the site binding`, () => {
      const input = { ...structuredClone(intent), engine, initialVersions: { ...versions } };
      const plan = compileAzureCePlan(input, observation);
      input.initialVersions.software = 'crt-20260801-0209';
      expect((plan.intent as AzureCeIntent & { initialVersions: typeof versions }).initialVersions).toEqual(versions);
      const binding = azureUpgradeBinding(plan);
      expect(binding.initialVersions).toEqual(versions);
      if (!binding.initialVersions) throw new Error("Missing initial version binding");
      binding.initialVersions.os = '9.2026.20';
      expect(azureUpgradeBinding(plan).initialVersions).toEqual(versions);
      expect(plan.planSha256).not.toBe(compileAzureCePlan({ ...intent, engine }, observation).planSha256);
    });
    test(`${engine} preserves the omitted default`, () => {
      expect(azureUpgradeBinding(compileAzureCePlan({ ...intent, engine }, observation))).not.toHaveProperty(
        'initialVersions',
      );
    });
  }
  for (const pair of [
    null,
    [],
    {},
    { software: versions.software },
    { ...versions, extra: 'value' },
    { ...versions, os: 'latest' },
    { ...versions, software: 'latest' },
  ]) {
    test(`rejects malformed pair ${JSON.stringify(pair)} before planning`, () => {
      expect(() =>
        compileAzureCePlan({ ...intent, initialVersions: pair } as unknown as AzureCeIntent, observation),
      ).toThrow('Initial software and OS versions');
    });
  }
  test('public plan schema exposes the exact version pair', () => {
    const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface);
    const schema = tool.parameters.properties.intent.properties.initialVersions;
    expect(schema.properties.software.type).toBe('string');
    expect(schema.properties.os.type).toBe('string');
    expect(schema.required).toEqual(['software', 'os']);
  });
});

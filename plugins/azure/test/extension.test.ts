import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import factory from '../src/index';

const installed = Bun.spawnSync([process.platform === 'win32' ? 'where' : 'which', 'az']).exitCode === 0;
test.skipIf(!installed)(
  'registers every public CE lifecycle tool once through the current integration API',
  async () => {
    const tools: Array<{ name: string; execute: unknown; parameters: unknown }> = [];
    const definitions: Array<{ id: string; setup: unknown; probe: unknown }> = [];
    const pi = {
      typebox: { Type },
      setLabel() {},
      logger: { debug() {} },
      on() {},
      exec: async () => ({ stdout: '', stderr: '', code: 0 }),
      presentation: { withPresentation: (tool: unknown) => tool },
      integrations: {
        register: (definition: (typeof definitions)[number]) => {
          definitions.push(definition);
          return { get: async () => ({ state: 'setup_required' }) };
        },
      },
      registerTool: (tool: (typeof tools)[number]) => tools.push(tool),
    };
    await factory(pi as unknown as Parameters<typeof factory>[0]);
    expect(definitions).toHaveLength(1);
    expect(definitions[0].id).toBe('azure');
    expect(definitions[0].setup).toBeDefined();
    expect(typeof definitions[0].probe).toBe('function');
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of [
      'azure_compute_discover',
      'azure_ce_plan',
      'azure_ce_apply',
      'azure_ce_inventory',
      'azure_ce_status',
      'azure_ce_diagnose',
      'azure_ce_upgrade',
      'azure_ce_failover',
      'azure_ce_teardown',
    ]) {
      const tool = tools.find((tool) => tool.name === name);
      expect(tool).toBeDefined();
      expect(typeof tool?.execute).toBe('function');
      expect(tool?.parameters).toBeDefined();
    }
  },
);

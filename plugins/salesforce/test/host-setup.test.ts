import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import * as typebox from '@sinclair/typebox';
import {
  configurePersonProfile,
  configureSalesforceExecutor,
  discoverSalesforceContext,
} from '../src/context/salesforce-context';
import factory from '../src/index';
import { makeExecApi } from '../src/tools/shared';

afterEach(() => {
  configureSalesforceExecutor();
  configurePersonProfile();
});
describe('Salesforce host setup', () => {
  it('prepares the shared plan at review time and keeps browser authentication', async () => {
    const definitions: Array<{
      id: string;
      prepareSetup?: () => Promise<unknown>;
      setup: { steps: Array<{ argv: string[] }> };
    }> = [];
    const calls: unknown[] = [];
    await factory({
      setLabel() {},
      personProfile: { get: async () => ({ facts: {} }) },
      host: { findExecutable: () => undefined },
      software: {
        prepareSetup: async (recipe: unknown, plan: unknown) => {
          calls.push(recipe);
          return plan;
        },
      },
      integrations: {
        register: (definition: never) => {
          definitions.push(definition);
          return { get: async () => ({ state: 'setup_required' }) };
        },
      },
      on() {},
      logger: { debug() {} },
    } as never);
    expect(calls).toHaveLength(0);
    expect(definitions[0].prepareSetup).toBeFunction();
    await definitions[0].prepareSetup?.();
    expect(calls[0]).toMatchObject({ executable: 'sf', brew: { package: 'sf' }, archive: { executable: 'bin/sf' } });
    expect(calls[0]).not.toHaveProperty('winget');
    expect(definitions[0].setup.steps).toHaveLength(1);
    expect(definitions[0].setup.steps[0].argv).toEqual([
      'sf',
      'org',
      'login',
      'web',
      '--set-default',
      '--alias',
      'SFDC',
    ]);
  });
  it('discovers identity and optional context through the injected resolved executor', async () => {
    const calls: string[][] = [];
    configurePersonProfile(async () => ({}));
    configureSalesforceExecutor(async (argv, signal) => {
      expect(signal).toBeDefined();
      calls.push(argv);
      const result =
        argv[0] === 'org'
          ? { username: 'user@example.com', instanceUrl: 'https://example.com', alias: 'SFDC' }
          : argv[0] === 'sobject'
            ? { fields: [] }
            : {
                records: argv.includes("SELECT Id, UserType FROM User WHERE Username = 'user@example.com' LIMIT 1")
                  ? [{ Id: '005000000000001', UserType: 'Standard' }]
                  : [],
              };
      return { stdout: JSON.stringify({ status: 0, result }), stderr: '', exitCode: 0 };
    });
    expect(await discoverSalesforceContext()).toMatchObject({ userId: '005000000000001', orgAlias: 'SFDC' });
    expect(calls).toContainEqual(['org', 'display', '--json']);
  });
  it('cancellation prevents context discovery from launching commands', async () => {
    let calls = 0;
    configureSalesforceExecutor(async () => {
      calls++;
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    await expect(discoverSalesforceContext(AbortSignal.abort())).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it('tools launch the host-resolved executable with a bounded signal', async () => {
    const child = { stdout: new Blob(['{}']).stream(), stderr: new Blob(['']).stream(), exited: Promise.resolve(0) };
    const spawn = spyOn(Bun, 'spawn').mockReturnValue(child as never);
    try {
      await makeExecApi('/tmp', () => '/opt/homebrew/bin/sf').exec('sf', ['org', 'display']);
      expect(spawn.mock.calls[0][0]).toEqual(['/opt/homebrew/bin/sf', 'org', 'display']);
      expect(spawn.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
    } finally {
      spawn.mockRestore();
    }
  });
});

it('an unavailable discovery executor never starts commands', async () => {
  configureSalesforceExecutor();
  expect(await discoverSalesforceContext()).toBeNull();
});

it('in-flight context cancellation reaches every child and rejects discovery', async () => {
  const controller = new AbortController();
  let launched = 0;
  configureSalesforceExecutor(async (_argv, signal) => {
    launched++;
    return new Promise((resolve) => {
      signal?.addEventListener('abort', () => resolve({ stdout: '', stderr: '', exitCode: -1 }));
      if (launched === 3) controller.abort();
    });
  });
  await expect(discoverSalesforceContext(controller.signal)).rejects.toThrow();
  expect(launched).toBe(3);
});

it('registers six tools with the resolved executable', async () => {
  const names: string[] = [];
  await factory({
    typebox,
    host: { findExecutable: () => '/opt/homebrew/bin/sf' },
    software: { prepareSetup: async (_recipe, plan) => plan },
    personProfile: { get: async () => ({ facts: {} }) },
    integrations: { register: () => ({ get: async () => ({ state: 'setup_required' }) }) },
    exec: async () => {
      throw new Error('Factory must not authenticate');
    },
    setLabel() {},
    registerTool: (tool) => names.push((tool as { name: string }).name),
    on() {},
    logger: { debug() {} },
  });
  expect(names).toEqual(['sf_query', 'sf_describe', 'sf_org_display', 'sf_pipeline_report', 'sf_help', 'sf_exec']);
});

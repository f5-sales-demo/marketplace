import { afterEach, beforeEach, expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import platformExtension from '../src/index';

const originalFetch = globalThis.fetch;

const previousUrl = process.env.XCSH_API_URL;
const previousToken = process.env.XCSH_API_TOKEN;
const previousTenant = process.env.XCSH_TENANT;
const previousGithubToken = process.env.GH_TOKEN;
beforeEach(() => {
  // The release transport is simulated; never consult workstation GitHub auth.
  process.env.GH_TOKEN = 'fixture-contract-credential';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries({
    XCSH_API_URL: previousUrl,
    XCSH_API_TOKEN: previousToken,
    XCSH_TENANT: previousTenant,
    GH_TOKEN: previousGithubToken,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('native capability execution reads the active context from its session, not registration', async () => {
  delete process.env.XCSH_API_URL;
  delete process.env.XCSH_API_TOKEN;
  delete process.env.XCSH_TENANT;
  globalThis.fetch = (async () => {
    throw new Error('simulated public release transport failure');
  }) as unknown as typeof fetch;
  let capabilities:
    | {
        execute(
          id: string,
          params: object,
          signal?: unknown,
          update?: unknown,
          context?: unknown,
        ): Promise<{ details: { failure: { category: string } } }>;
      }
    | undefined;
  await platformExtension({
    presentation,
    typebox: { Type: new Proxy({}, { get: () => () => ({}) }) as never },
    setLabel: () => {},
    registerTool: (tool: unknown) => {
      if ((tool as { name: string }).name === 'f5xc_ce_v2_capabilities') capabilities = tool as typeof capabilities;
    },
    integrations: { register: (definition: unknown) => definition },
  });
  let active = { XCSH_API_URL: 'https://active-context.test', XCSH_API_TOKEN: 'fixture', XCSH_TENANT: 'active' };
  const settings = { get: () => active };
  expect((await capabilities?.execute('id', {}, undefined, undefined, { settings }))?.details.failure.category).toBe(
    'public_contract_transport',
  );
  active = { ...active, XCSH_API_URL: 'http://unsafe-context.test' };
  expect((await capabilities?.execute('id', {}, undefined, undefined, { settings }))?.details.failure.category).toBe(
    'context',
  );
  process.env.XCSH_API_URL = 'https://explicit-override.test';
  expect((await capabilities?.execute('id', {}, undefined, undefined, { settings }))?.details.failure.category).toBe(
    'public_contract_transport',
  );
});

test('platform readiness reads the active xcsh context contract', async () => {
  let integration: { probe(): Promise<{ state: string; value?: { tenantConfigured: boolean } }> } | undefined;
  const environment = {
    XCSH_API_URL: 'https://tenant.example.test',
    XCSH_API_TOKEN: 'secret',
    XCSH_TENANT: 'tenant',
  };
  const Type = new Proxy({}, { get: () => () => ({}) });
  await platformExtension({
    presentation,
    typebox: { Type: Type as never },
    settings: { get: (key: string) => (key === 'bash.environment' ? environment : undefined) },
    setLabel: () => {},
    registerTool: () => {},
    integrations: {
      register: (definition: unknown) => {
        integration = definition as typeof integration;
        return definition;
      },
    },
  });
  expect(await integration?.probe()).toEqual({ state: 'ready', value: { tenantConfigured: true } });
});

test('platform observes active context switches and explicit environment precedence', async () => {
  delete process.env.XCSH_API_URL;
  delete process.env.XCSH_API_TOKEN;
  delete process.env.XCSH_TENANT;
  let active: Record<string, string> = {};
  let probe: (() => Promise<{ state: string }>) | undefined;
  await platformExtension({
    presentation,
    typebox: { Type: new Proxy({}, { get: () => () => ({}) }) as never },
    settings: { get: () => active },
    setLabel: () => {},
    registerTool: () => {},
    integrations: {
      register: (definition: unknown) => {
        probe = (definition as { probe: typeof probe }).probe;
        return definition;
      },
    },
  });
  expect((await probe?.())?.state).toBe('setup_required');
  active = { XCSH_API_URL: 'https://context-one.test', XCSH_API_TOKEN: 'fixture', XCSH_TENANT: 'one' };
  expect((await probe?.())?.state).toBe('ready');
  active = {};
  expect((await probe?.())?.state).toBe('setup_required');
  process.env.XCSH_API_URL = 'https://explicit.test';
  process.env.XCSH_API_TOKEN = 'fixture';
  process.env.XCSH_TENANT = 'explicit';
  active = { XCSH_API_URL: 'not-a-url', XCSH_API_TOKEN: 'ignored', XCSH_TENANT: 'ignored' };
  expect((await probe?.())?.state).toBe('ready');
});

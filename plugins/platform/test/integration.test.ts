import { afterEach, expect, test } from 'bun:test';
import platformExtension from '../src/index';

const previousUrl = process.env.XCSH_API_URL;
const previousToken = process.env.XCSH_API_TOKEN;
const previousTenant = process.env.XCSH_TENANT;
afterEach(() => {
  for (const [name, value] of Object.entries({
    XCSH_API_URL: previousUrl,
    XCSH_API_TOKEN: previousToken,
    XCSH_TENANT: previousTenant,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
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

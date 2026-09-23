import { expect, test } from 'bun:test';
import platformExtension from '../src/index';

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

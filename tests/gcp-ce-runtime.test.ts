import { afterEach, expect, it } from 'bun:test';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
it('bundled Platform and Terraform services load from isolated plugin directories without neighboring source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-runtime-'));
  roots.push(root);
  const platform = join(root, 'platform.js'),
    terraform = join(root, 'terraform.js');
  await copyFile(new URL('../plugins/platform/runtime/index.js', import.meta.url), platform);
  await copyFile(new URL('../plugins/terraform/runtime/index.js', import.meta.url), terraform);
  const handlers = new Map<string, (data: unknown) => void>();
  const events = {
    on: (name: string, handler: (data: unknown) => void) => {
      handlers.set(name, handler);
      return () => {};
    },
    emit: (name: string, data: unknown) => handlers.get(name)?.(data),
  };
  const platformFactory = (await import(platform)).default;
  await platformFactory({
    events,
    setLabel: () => {},
    integrations: { register: () => {} },
    presentation: { withPresentation: (tool: unknown) => tool },
    typebox: { Type: new Proxy({}, { get: () => () => ({}) }) },
  });
  const terraformFactory = (await import(terraform)).default;
  terraformFactory({ events, setLabel: () => {} });
  expect(handlers.has('xcsh:ce-platform:v2:service')).toBe(true);
  let platformService: { gcpObservations?: unknown; gcpLifecycle?: unknown } | undefined;
  events.emit('xcsh:ce-platform:v2:service', {
    version: 2,
    resolve: (service: { gcpObservations?: unknown }) => {
      platformService = service;
    },
  });
  expect(typeof platformService?.gcpObservations).toBe('function');
  expect(typeof platformService?.gcpLifecycle).toBe('function');
  expect(handlers.has('xcsh:ce-terraform:v1:service')).toBe(true);
});

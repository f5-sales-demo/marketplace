import { afterEach, expect, it, spyOn } from 'bun:test';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});

it('isolated Terraform bundle retains original CE trust and scan capability refusals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-capture-runtime-'));
  roots.push(root);
  const runtime = join(root, 'terraform.js');
  await copyFile(new URL('../plugins/terraform/runtime/index.js', import.meta.url), runtime);
  const module = await import(runtime);
  const callback = {} as never;
  await expect(module.openOriginalGcpCeKeyScanCommand({}, callback)).rejects.toThrow('Original');
  await expect(module.readOriginalGcpCeWireKeys({})).rejects.toThrow('Original');
  await expect(module.openGcpCeWireKeyReader({})).rejects.toThrow('Original');
  await expect(module.compileOriginalGcpCeTrustMaterial({}, {}, {}, callback)).rejects.toThrow('Original');
  await expect(module.openGcpCeHostTrustReader({}, callback)).rejects.toThrow('Original');
  await expect(module.readOriginalGcpCeHostTrust({})).rejects.toThrow('Original');
  await expect(module.openOriginalGcpObserverClientAbiCommand({}, callback)).rejects.toThrow('Original');
  await expect(module.openGcpObserverClientAbi({})).rejects.toThrow('Original');
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

it('isolated installed GCloud tools expose deploy review and refuse unapproved or wrong-engine launch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gcp-deploy-runtime-'));
  roots.push(root);
  const runtime = join(root, 'gcloud.js');
  await copyFile(new URL('../plugins/gcloud/runtime/index.js', import.meta.url), runtime);
  const tools = new Map<
    string,
    {
      parameters: { properties: { operation: unknown } };
      execute: (...args: unknown[]) => Promise<{ isError?: boolean; details: { mutationAttempted?: boolean } }>;
    }
  >();
  const presence = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
    expect([...argv]).toEqual(['which', 'gcloud']);
    return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() } as ReturnType<typeof Bun.spawnSync>;
  });
  try {
    await (await import(runtime)).default({
      events: {
        on: () => () => {},
        emit: () => {
          throw new Error('must not request cloud service');
        },
      },
      setLabel: () => {},
      registerTool: (tool: { name: string } & Parameters<typeof tools.set>[1]) => tools.set(tool.name, tool),
      integrations: { register: () => ({ get: async () => ({ state: 'ready' }) }) },
      presentation: { withPresentation: (tool: unknown) => tool },
      typebox: {
        Type: new Proxy(
          {},
          {
            get:
              () =>
              (...args: unknown[]) => ({ properties: args[0] }),
          },
        ),
      },
    });
    const apply = tools.get('gcp_ce_apply');
    expect(apply?.parameters.properties.operation).toBeDefined();
    const { intent } = await import('../plugins/gcloud/test/ce/fixtures');
    const i = structuredClone(intent());
    i.routing.destinationCidrs = [];
    for (const engine of ['native', 'terraform']) {
      const result = await apply?.execute(
        'unapproved',
        { project: i.project, region: i.region, operation: 'deploy', engine, intent: { ...i, engine } },
        undefined,
        null,
        { cwd: root },
      );
      expect(result?.isError).toBe(true);
      expect(result?.details.mutationAttempted).toBe(false);
    }
    expect(presence).toHaveBeenCalledTimes(1);
  } finally {
    presence.mockRestore();
  }
});

it('isolated current Terraform bundle ships the current bootstrap evidence API and rejects copied bodies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-current-runtime-'));
  roots.push(root);
  const runtime = join(root, 'terraform.js');
  await copyFile(new URL('../plugins/terraform/runtime/index.js', import.meta.url), runtime);
  const module = await import(runtime);
  expect(typeof module.collectOriginalGcpTerraformBootstrapV3).toBe('function');
  expect(typeof module.readOriginalXcshCreationBodyProviderProfile).toBe('function');
  await expect(module.readOriginalXcshCreationBodyProviderProfile({})).rejects.toThrow('Original');
});

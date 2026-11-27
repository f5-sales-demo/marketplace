import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { acquireProcessLock } from '../../src/ce/process-lock';
import type { SiteBinding } from '../../src/ce/runtime';
import type { CePlatformService, CeStoredSiteBinding } from '../../src/ce/service';
import { buildWireSite, type WireSiteIntent } from '../../src/ce/wire-site';
import { createF5xcCeV2BootstrapTool } from '../../src/tools/f5xc-ce-v2-bootstrap';
import { createF5xcCeV2CapabilitiesTool } from '../../src/tools/f5xc-ce-v2-capabilities';
import { createF5xcCeV2SiteTool, createSitePlan } from '../../src/tools/f5xc-ce-v2-site';
import { createF5xcCeV2StatusTool } from '../../src/tools/f5xc-ce-v2-status';
import type { PlatformToolApi } from '../../src/types';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import schemaCompact from '../fixtures/smsv2-create-schema.json';

const schema = resolveCeSchemaFixture(schemaCompact);

const pi = { typebox: { Type } } as unknown as PlatformToolApi;
const binding: SiteBinding = {
  owner: { deploymentId: 'ce-test', engine: 'native', provider: 'aws', account: 'demo', region: 'us-east-1' },
  siteName: 'ce-test',
  nodes: ['node-one'],
};
const config: WireSiteIntent = {
  schemaVersion: 2,
  provider: 'aws',
  haMode: 'one-node',
  settings: {},
  nodes: [
    {
      hostname: 'node-one',
      interfaces: [
        {
          name: 'slo',
          ethernet_interface: { mac: '02:00:00:00:00:01', device: 'ens5' },
          network_option: { site_local_network: {} },
          dhcp_client: {},
        },
      ],
    },
  ],
};
const known: CeStoredSiteBinding = {
  schemaVersion: 2,
  binding,
  siteUid: 'owned-site-uid',
  contractFingerprint: 'fingerprint',
  tenantOrigin: 'https://tenant.example.test',
  expectedInterfaces: [{ node: 'node-one', role: 'slo', mac: '02:00:00:00:00:01' }],
};
const roots: string[] = [];
const originalHeadless = process.env.XCSH_CE_HEADLESS_MUTATIONS;
afterEach(async () => {
  if (originalHeadless === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
  else process.env.XCSH_CE_HEADLESS_MUTATIONS = originalHeadless;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const context = (hasUI = true, approved = true) => ({
  hasUI,
  ui: { confirm: async () => approved },
  sessionManager: { getSessionId: () => 'session-a', saveArtifact: async () => 'artifact-a' },
});
function fixture(testBinding: SiteBinding = binding, testConfig: WireSiteIntent = config) {
  const testKnown = { ...known, binding: testBinding };
  const calls: string[] = [];
  const privateRecords: unknown[] = [];
  const jwt = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 1200 })).toString('base64url')}.fixture-signature`;
  const runtime = {
    contract: {
      fingerprint: 'fingerprint',
      buildSite: (intent: WireSiteIntent) => buildWireSite(intent, schema.schemas),
    },
    observeOwnedSite: async () => ({
      system_metadata: { uid: 'owned-site-uid' },
      resource_version: 'version-one',
      spec: buildWireSite(testConfig, schema.schemas),
    }),
    ensureSite: async (_binding: SiteBinding, _config: WireSiteIntent) => {
      calls.push('create');
    },
    replaceSite: async (
      _binding: SiteBinding,
      _config: WireSiteIntent,
      _identity: { uid: string; resourceVersion: string },
    ) => {
      calls.push('update');
    },
    deleteSiteExact: async () => {
      calls.push('delete');
    },
    bootstrap: async (
      _binding: unknown,
      _node: unknown,
      _token: unknown,
      persist: (value: unknown) => Promise<void>,
    ) => {
      calls.push('bootstrap');
      await persist({ jwt });
      return '#cloud-config';
    },
    observeAwsInterfaces: async () => ({
      status: 'observed',
      interfaces: [
        {
          ...known.expectedInterfaces[0],
          device: 'ens5',
          interfaceName: 'generated-a',
          mtu: 1500,
          linkUp: true,
          ipv4: null,
        },
      ],
      observedAt: new Date().toISOString(),
    }),
    observeAzureInterfaces: async () => ({ status: 'unknown', interfaces: [], observedAt: new Date().toISOString() }),
  };
  let stored: Promise<CeDeploymentStore> | undefined;
  const service = {
    capabilities: async () => ({
      smsv2ContractVersion: 'v2',
      supportedProviders: ['aws', 'azure'],
      bootstrapDrivers: ['api'],
      providerNetworkingProfiles: {},
      awsSmsv2TgwConnect: { supported: true, schemaVersion: 'telemetry' },
      tenantOrigin: 'https://tenant.example.test',
    }),
    siteBinding: async () => structuredClone(testKnown),
    runtime: async (engine: string, context?: string) => {
      calls.push(`runtime:${engine}:${context ?? 'active'}`);
      return runtime;
    },
    storage: async () => {
      if (!stored)
        stored = (async () => {
          const root = await mkdtemp(join(tmpdir(), 'ce-tool-storage-'));
          roots.push(root);
          const store = await CeDeploymentStore.open(root, testBinding.owner);
          const write = store.write.bind(store);
          store.write = async (name, value, signal) => {
            privateRecords.push(value);
            await write(name, value, signal);
          };
          return store;
        })();
      return stored;
    },
  };
  return { service: service as unknown as CePlatformService, rawService: service, runtime, calls, privateRecords, jwt };
}
test('plans resolved writable site configuration, rejects a mismatched hash, and executes the exact public create path', async () => {
  const f = fixture();
  const tool = createF5xcCeV2SiteTool(pi, () => f.service);
  const params = {
    action: 'create' as const,
    namespace: 'system',
    siteName: binding.siteName,
    binding,
    config,
    platformContext: 'demo',
  };
  const planned = await tool.execute('id', params, undefined, undefined, context());
  expect(planned.isError).toBeUndefined();
  expect(f.calls).not.toContain('create');
  const plan = planned.details.plan;
  if (!plan) throw Error('missing plan');
  const bad = await tool.execute('id', { ...params, planSha256: 'f'.repeat(64) }, undefined, undefined, context());
  expect(bad.isError).toBe(true);
  expect(f.calls).not.toContain('create');
  const result = await tool.execute('id', { ...params, planSha256: plan.planSha256 }, undefined, undefined, context());
  expect(result.isError).toBeUndefined();
  expect(f.calls).toContain('runtime:native:demo');
  expect(f.calls).toContain('create');
});
test('rejects unresolved physical identifiers before public site execution', async () => {
  const f = fixture();
  const invalid = structuredClone(config);
  delete (invalid.nodes[0].interfaces[0].ethernet_interface as Record<string, unknown>).device;
  const result = await createF5xcCeV2SiteTool(pi, () => f.service).execute(
    'id',
    { action: 'create', namespace: 'system', siteName: binding.siteName, binding, config: invalid },
    undefined,
    undefined,
    context(),
  );
  expect(result.isError).toBe(true);
  expect(f.calls).not.toContain('create');
});
test('binds update and delete plans to exact UID, resource version, engine, and tenant', async () => {
  const params = {
    action: 'update' as const,
    namespace: 'system',
    siteName: binding.siteName,
    binding,
    config,
    expectedUid: 'owned-site-uid',
    expectedResourceVersion: 'version-one',
  };
  expect(() => createSitePlan({ ...params, expectedUid: undefined })).toThrow();
  expect(() => createSitePlan({ ...params, expectedResourceVersion: undefined })).toThrow();
  const plan = createSitePlan(params, 'https://tenant.example.test');
  expect(createSitePlan(params, 'https://other.example.test').planSha256).not.toBe(plan.planSha256);
  const f = fixture();
  const tool = createF5xcCeV2SiteTool(pi, () => f.service);
  const result = await tool.execute('id', { ...params, planSha256: plan.planSha256 }, undefined, undefined, context());
  expect(result.isError).toBeUndefined();
  expect(f.calls).toContain('update');
});
test('does not mutate when interactive approval is declined', async () => {
  const f = fixture();
  const params = { action: 'create' as const, namespace: 'system', siteName: binding.siteName, binding, config };
  const plan = createSitePlan(params, 'https://tenant.example.test');
  const result = await createF5xcCeV2SiteTool(pi, () => f.service).execute(
    'id',
    { ...params, planSha256: plan.planSha256 },
    undefined,
    undefined,
    context(true, false),
  );
  expect(result.isError).toBe(true);
  expect(f.calls).not.toContain('create');
});
for (const hasUI of [true, false])
  test(`public API bootstrap returns only a private opaque reference (${hasUI ? 'interactive' : 'headless'})`, async () => {
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = fixture();
    const root = await mkdtemp(join(tmpdir(), 'ce-public-test-'));
    roots.push(root);
    const result = await createF5xcCeV2BootstrapTool(pi, () => f.service, root).execute(
      'id',
      { namespace: 'system', siteName: binding.siteName, nodeName: 'node-one', expiresInSeconds: 60 },
      undefined,
      undefined,
      context(hasUI),
    );
    expect(result.isError).toBeUndefined();
    expect('reference' in result.details ? result.details.reference : undefined).toMatch(/^f5xc-ce:\/\/session-a\//);
    expect(JSON.stringify(result)).not.toContain(f.jwt);
    expect(f.privateRecords[0]).toEqual({ jwt: f.jwt });
    expect(f.privateRecords).toHaveLength(2);
    expect(f.privateRecords[1]).toMatchObject({
      schemaVersion: 1,
      owner: binding.owner,
      binding,
      node: 'node-one',
      siteUid: 'owned-site-uid',
      checkout: { reference: 'reference' in result.details ? result.details.reference : undefined },
    });
    expect(JSON.stringify(f.privateRecords[1])).not.toContain(f.jwt);
    expect(f.calls).toContain('bootstrap');
  });
test('rejects foreign bootstrap nodes and invalid expiry before issuing a token', async () => {
  const f = fixture();
  const tool = createF5xcCeV2BootstrapTool(pi, () => f.service);
  for (const params of [
    { nodeName: 'foreign-node', expiresInSeconds: 60 },
    { nodeName: 'node-one', expiresInSeconds: 0 },
  ]) {
    const result = await tool.execute(
      'id',
      { namespace: 'system', siteName: binding.siteName, ...params },
      undefined,
      undefined,
      context(),
    );
    expect(result.isError).toBe(true);
  }
  expect(f.calls).not.toContain('bootstrap');
});
test('returns real unknown for absent, ambiguous, rebuilt, incomplete, or unauthorized deployment bindings', async () => {
  for (const failure of ['absent', 'ambiguous', 'rebuilt', 'partial', 'authorization']) {
    const f = fixture();
    if (failure === 'partial') f.rawService.siteBinding = async () => ({ ...known, expectedInterfaces: [] });
    else if (failure === 'rebuilt') f.rawService.siteBinding = async () => ({ ...known, siteUid: 'retired-site-uid' });
    else
      f.rawService.siteBinding = async () => {
        throw Error(failure);
      };
    const result = await createF5xcCeV2StatusTool(pi, () => f.service).execute(
      'id',
      { namespace: 'system', siteName: binding.siteName },
      undefined,
      undefined,
      context(),
    );
    expect(result.details.status).toBe('unknown');
    expect(result.details.interfaces).toEqual([]);
    expect(result.details.canSatisfyMutationGate).toBe(false);
  }
});
test('preserves reported down while keeping unqualified freshness unknown and healthy observed unchanged', async () => {
  for (const status of ['observed', 'down', 'unknown']) {
    const f = fixture();
    f.runtime.observeAwsInterfaces = async () => ({
      status,
      interfaces:
        status === 'unknown'
          ? []
          : [
              {
                ...known.expectedInterfaces[0],
                device: 'ens5',
                interfaceName: 'generated-a',
                interfaceUid: '00000000-0000-4000-8000-000000000001',
                mtu: 1500,
                linkUp: status === 'observed',
                ipv4: null,
              },
            ],
      observedAt: new Date().toISOString(),
    });
    const result = await createF5xcCeV2StatusTool(pi, () => f.service).execute(
      'id',
      { namespace: 'system', siteName: binding.siteName },
      undefined,
      undefined,
      context(),
    );
    expect(result.details.status).toBe(status === 'down' ? 'unknown' : status);
    if (status === 'down') {
      expect(result.details.reportedLinkState).toBe('down');
      expect(result.details.reason).toBe('interface-sample-freshness-unqualified');
      expect(result.details.interfaces[0].linkUp).toBe(false);
    }
    expect(result.details.ceSampleAge).toBe('unknown');
    expect(result.details.canSatisfyMutationGate).toBe(false);
  }
});
test('advertises the executable API bootstrap service through the public capability path', async () => {
  const f = fixture();
  const result = await createF5xcCeV2CapabilitiesTool(pi, () => f.service).execute(
    'id',
    {},
    undefined,
    undefined,
    context(),
  );
  expect(result.isError).toBeUndefined();
  expect(result.details.capabilities?.bootstrapDrivers).toEqual(['api']);
});

test('does not report a partial HA binding set as a complete public status observation', async () => {
  const f = fixture();
  const original = f.runtime.observeOwnedSite;
  f.runtime.observeOwnedSite = async () => {
    const site = await original();
    const node = (site.spec.aws as { not_managed: { node_list: unknown[] } }).not_managed.node_list[0];
    (site.spec.aws as { not_managed: { node_list: unknown[] } }).not_managed.node_list.push(node);
    return site;
  };
  const result = await createF5xcCeV2StatusTool(pi, () => f.service).execute(
    'id',
    { namespace: 'system', siteName: binding.siteName },
    undefined,
    undefined,
    context(),
  );
  expect(result.details.status).toBe('unknown');
  expect(result.details.interfaces).toEqual([]);
});

test('public bootstrap rejects a retired deployment before token issuance', async () => {
  const f = fixture();
  f.rawService.storage = async () =>
    ({
      read: async () => ({ schemaVersion: 1 }),
      write: async () => {
        throw Error('unexpected write');
      },
    }) as unknown as CeDeploymentStore;
  const tool = createF5xcCeV2BootstrapTool(pi, () => f.service);
  const result = await tool.execute(
    'id',
    { namespace: 'system', siteName: binding.siteName, nodeName: 'node-one', expiresInSeconds: 60 },
    undefined,
    undefined,
    context(),
  );
  expect(result.isError).toBe(true);
  expect(f.calls).not.toContain('bootstrap');
});

for (const provider of ['aws', 'azure'] as const) {
  for (const hasUI of [true, false])
    test(`native ${provider} retirement rejects ${hasUI ? 'interactive' : 'headless'} checkout`, async () => {
      process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
      const f = fixture(),
        root = await mkdtemp(join(tmpdir(), 'native-bootstrap-retired-'));
      roots.push(root);
      const owned = { ...binding, owner: { ...binding.owner, provider } };
      const store = await CeDeploymentStore.open(join(root, 'deployments'), owned.owner);
      await store.write(`${provider}-native-lifecycle-retirement.json`, { schemaVersion: 1, owner: owned.owner });
      f.rawService.storage = async () => store;
      f.rawService.siteBinding = async () => ({ ...known, binding: owned });
      const result = await createF5xcCeV2BootstrapTool(pi, () => f.service, join(root, 'opaque')).execute(
        'retired',
        { namespace: 'system', siteName: owned.siteName, nodeName: 'node-one', expiresInSeconds: 60 },
        undefined,
        undefined,
        context(hasUI),
      );
      expect(result.isError).toBe(true);
      expect(f.calls).not.toContain('bootstrap');
      const release = await acquireProcessLock(
        join(store.directory, provider === 'aws' ? '.aws-native-teardown-lock' : '.azure-relay-native-mutation-lock'),
      );
      await release();
    });
  test(`native ${provider} checkout excludes the owning live retirement lock`, async () => {
    const f = fixture(),
      root = await mkdtemp(join(tmpdir(), 'native-bootstrap-locked-'));
    roots.push(root);
    const owned = { ...binding, owner: { ...binding.owner, provider } };
    const store = await CeDeploymentStore.open(join(root, 'deployments'), owned.owner);
    f.rawService.storage = async () => store;
    f.rawService.siteBinding = async () => ({ ...known, binding: owned });
    const lock = join(
      store.directory,
      provider === 'aws' ? '.aws-native-teardown-lock' : '.azure-relay-native-mutation-lock',
    );
    const release = await acquireProcessLock(lock);
    try {
      const result = await createF5xcCeV2BootstrapTool(pi, () => f.service, join(root, 'opaque')).execute(
        'locked',
        { namespace: 'system', siteName: owned.siteName, nodeName: 'node-one', expiresInSeconds: 60 },
        undefined,
        undefined,
        context(),
      );
      expect(result.isError).toBe(true);
      expect(f.calls).not.toContain('bootstrap');
    } finally {
      await release();
    }
  });
}

for (const provider of ['aws', 'azure'] as const) {
  test(`native ${provider} cancelled checkout releases custody without issuing`, async () => {
    const f = fixture(),
      root = await mkdtemp(join(tmpdir(), 'native-bootstrap-cancelled-'));
    roots.push(root);
    const owned = { ...binding, owner: { ...binding.owner, provider } };
    const store = await CeDeploymentStore.open(join(root, 'deployments'), owned.owner);
    f.rawService.storage = async () => store;
    f.rawService.siteBinding = async () => ({ ...known, binding: owned });
    const controller = new AbortController();
    controller.abort(Error('cancelled fixture'));
    await expect(
      createF5xcCeV2BootstrapTool(pi, () => f.service, join(root, 'opaque')).execute(
        'cancelled',
        { namespace: 'system', siteName: owned.siteName, nodeName: 'node-one', expiresInSeconds: 60 },
        controller.signal,
        undefined,
        context(),
      ),
    ).rejects.toThrow('cancelled fixture');
    expect(f.calls).not.toContain('bootstrap');
    const release = await acquireProcessLock(
      join(store.directory, provider === 'aws' ? '.aws-native-teardown-lock' : '.azure-relay-native-mutation-lock'),
    );
    await release();
  });
  test(`native ${provider} malformed retirement evidence rejects without exposing parser context`, async () => {
    const f = fixture(),
      root = await mkdtemp(join(tmpdir(), 'native-bootstrap-malformed-'));
    roots.push(root);
    const owned = { ...binding, owner: { ...binding.owner, provider } };
    const store = await CeDeploymentStore.open(join(root, 'deployments'), owned.owner);
    await writeFile(
      join(store.directory, `${provider}-native-lifecycle-retirement.json`),
      '{"private":"synthetic-parser-context',
      { mode: 0o600 },
    );
    f.rawService.storage = async () => store;
    f.rawService.siteBinding = async () => ({ ...known, binding: owned });
    const result = await createF5xcCeV2BootstrapTool(pi, () => f.service, join(root, 'opaque')).execute(
      'malformed',
      { namespace: 'system', siteName: owned.siteName, nodeName: 'node-one', expiresInSeconds: 60 },
      undefined,
      undefined,
      context(),
    );
    expect(result.isError).toBe(true);
    expect(f.calls).not.toContain('bootstrap');
    expect(JSON.stringify(result)).not.toContain('synthetic-parser-context');
  });
}

for (const provider of ['aws', 'azure'] as const)
  for (const engine of ['native', 'terraform'] as const)
    for (const profile of ['single-site', 'independent-sites', 'three-node-ha'] as const)
      test(`public site and bootstrap dispatch preserves ${provider}/${engine}/${profile} ownership and interfaces`, async () => {
        process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
        const siteNumbers = profile === 'independent-sites' ? [1, 2, 3] : [1];
        const issuedReferences = new Set<string>();
        for (const siteNumber of siteNumbers) {
          const siteName = `ce-${provider}-${engine}-${profile}-${siteNumber}`;
          const nodeNumbers = profile === 'three-node-ha' ? [1, 2, 3] : [siteNumber];
          const selectedConfig: WireSiteIntent = {
            schemaVersion: 2,
            provider,
            haMode: profile === 'three-node-ha' ? 'three-node' : 'one-node',
            settings: {},
            nodes: nodeNumbers.map((number) => ({
              hostname: `node-${number}`,
              interfaces: (['slo', 'sli'] as const).map((role, index) => ({
                name: role,
                ethernet_interface: { mac: `02:00:00:00:0${number}:0${index + 1}`, device: `ens${index + 5}` },
                network_option: role === 'slo' ? { site_local_network: {} } : { site_local_inside_network: {} },
                dhcp_client: {},
              })),
            })),
          };
          const selectedBinding: SiteBinding = {
            owner: {
              deploymentId: siteName,
              provider,
              engine,
              account: 'demo',
              region: provider === 'aws' ? 'us-east-1' : 'eastus',
            },
            siteName,
            nodes: selectedConfig.nodes.map((node) => node.hostname),
          };
          const f = fixture(selectedBinding, selectedConfig);
          const ensured = f.runtime.ensureSite;
          f.runtime.ensureSite = async (actualBinding: SiteBinding, actualConfig: WireSiteIntent) => {
            expect(actualBinding).toEqual(selectedBinding);
            expect(actualConfig).toEqual(selectedConfig);
            await ensured(selectedBinding, selectedConfig);
          };
          const replaced = f.runtime.replaceSite;
          f.runtime.replaceSite = async (
            actualBinding: SiteBinding,
            actualConfig: WireSiteIntent,
            identity: { uid: string; resourceVersion: string },
          ) => {
            expect(actualBinding).toEqual(selectedBinding);
            expect(actualConfig).toEqual(selectedConfig);
            expect(identity).toEqual({ uid: 'owned-site-uid', resourceVersion: 'version-one' });
            await replaced(selectedBinding, selectedConfig, { uid: 'owned-site-uid', resourceVersion: 'version-one' });
          };
          const tool = createF5xcCeV2SiteTool(pi, () => f.service);
          const common = {
            namespace: 'system',
            siteName,
            binding: selectedBinding,
            config: selectedConfig,
            platformContext: 'matrix-context',
          };
          for (const action of ['create', 'update'] as const) {
            const params = {
              ...common,
              action,
              ...(action === 'update' ? { expectedUid: 'owned-site-uid', expectedResourceVersion: 'version-one' } : {}),
            };
            const before = f.calls.filter((call) => call === action).length;
            const planned = await tool.execute('id', params, undefined, undefined, context());
            expect(planned.isError).toBeUndefined();
            expect(f.calls.filter((call) => call === action)).toHaveLength(before);
            const plan = planned.details.plan;
            if (!plan) throw Error('missing public matrix plan');
            expect(plan.binding).toEqual(selectedBinding);
            expect(plan.config).toEqual(selectedConfig);
            const result = await tool.execute(
              'id',
              { ...params, planSha256: plan.planSha256 },
              undefined,
              undefined,
              context(),
            );
            expect(result.isError).toBeUndefined();
            expect(f.calls.filter((call) => call === action)).toHaveLength(before + 1);
          }
          const wire = buildWireSite(selectedConfig, schema.schemas);
          expect(Object.hasOwn(wire, profile === 'three-node-ha' ? 'enable_ha' : 'disable_ha')).toBe(true);
          expect(wire[provider]).toMatchObject({
            not_managed: {
              node_list: selectedConfig.nodes.map((node) => ({
                hostname: node.hostname,
                interface_list: node.interfaces,
              })),
            },
          });
          const root = await mkdtemp(join(tmpdir(), 'ce-public-matrix-'));
          roots.push(root);
          for (const nodeName of selectedBinding.nodes)
            for (const hasUI of [true, false]) {
              const originalBootstrap = f.runtime.bootstrap;
              f.runtime.bootstrap = async (actualBinding, actualNode, token, persist) => {
                expect(actualBinding).toEqual(selectedBinding);
                expect(actualNode).toBe(nodeName);
                return originalBootstrap(actualBinding, actualNode, token, persist);
              };
              const result = await createF5xcCeV2BootstrapTool(pi, () => f.service, root).execute(
                'id',
                {
                  namespace: 'system',
                  siteName,
                  nodeName,
                  expiresInSeconds: 60,
                  platformContext: 'matrix-context',
                },
                undefined,
                undefined,
                context(hasUI),
              );
              f.runtime.bootstrap = originalBootstrap;
              expect(result.isError).toBeUndefined();
              if (!('reference' in result.details)) throw Error('missing public matrix checkout');
              expect(result.details.reference).toMatch(/^f5xc-ce:\/\/session-a\//);
              expect(issuedReferences.has(result.details.reference)).toBe(false);
              issuedReferences.add(result.details.reference);
              expect(JSON.stringify(result)).not.toContain(f.jwt);
              expect(Date.parse(result.details.expiresAt) - Date.now()).toBeLessThanOrEqual(60000);
              expect(f.privateRecords.at(-1)).toMatchObject({
                owner: selectedBinding.owner,
                binding: selectedBinding,
                node: nodeName,
                siteUid: 'owned-site-uid',
              });
            }
          expect(
            f.calls
              .filter((call) => call.startsWith('runtime:'))
              .every((call) => call === `runtime:${engine}:matrix-context`),
          ).toBe(true);
        }
        expect(issuedReferences.size).toBe((profile === 'single-site' ? 1 : 3) * 2);
      });

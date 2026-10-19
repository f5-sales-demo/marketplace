import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import type { SiteBinding } from '../../src/ce/runtime';
import type { CePlatformService, CeStoredSiteBinding } from '../../src/ce/service';
import { buildWireSite, type WireSiteIntent } from '../../src/ce/wire-site';
import { createF5xcCeV2BootstrapTool } from '../../src/tools/f5xc-ce-v2-bootstrap';
import { createF5xcCeV2CapabilitiesTool } from '../../src/tools/f5xc-ce-v2-capabilities';
import { createF5xcCeV2SiteTool, createSitePlan } from '../../src/tools/f5xc-ce-v2-site';
import { createF5xcCeV2StatusTool } from '../../src/tools/f5xc-ce-v2-status';
import type { PlatformToolApi } from '../../src/types';
import schema from '../fixtures/smsv2-create-schema.json';

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
  schemaVersion: 1,
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
function fixture() {
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
      spec: buildWireSite(config, schema.schemas),
    }),
    ensureSite: async () => {
      calls.push('create');
    },
    replaceSite: async () => {
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
  const service = {
    capabilities: async () => ({
      smsv2ContractVersion: 'v2',
      supportedProviders: ['aws', 'azure'],
      bootstrapDrivers: ['api'],
      providerNetworkingProfiles: {},
      awsSmsv2TgwConnect: { supported: true, schemaVersion: 'telemetry' },
      tenantOrigin: 'https://tenant.example.test',
    }),
    siteBinding: async () => structuredClone(known),
    runtime: async (engine: string, context?: string) => {
      calls.push(`runtime:${engine}:${context ?? 'active'}`);
      return runtime;
    },
    storage: async () => ({
      write: async (_name: string, value: unknown) => {
        privateRecords.push(value);
      },
    }),
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
    expect(f.privateRecords).toEqual([{ jwt: f.jwt }]);
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
test('preserves explicit down and healthy observed status without inventing CE heartbeat age', async () => {
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
    expect(result.details.status).toBe(status);
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

import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { ExpectedCeInterface } from '../../src/ce/interface-evidence';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import type { CePlatformService, CeStoredSiteBinding } from '../../src/ce/service';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import { createF5xcCeV2StatusTool } from '../../src/tools/f5xc-ce-v2-status';
import type { PlatformToolApi } from '../../src/types';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contract from '../fixtures/smsv2-contract-v7.json';
import schemaCompact from '../fixtures/smsv2-create-schema.json';
import replaceSchemaCompact from '../fixtures/smsv2-replace-schema.json';

const schema = resolveCeSchemaFixture(schemaCompact);
const replaceSchema = resolveCeSchemaFixture(replaceSchemaCompact);

type Constructor = new (
  commit: string,
  fingerprint: string,
  contract: Record<string, unknown>,
  schemas: Record<string, unknown>,
  networking: undefined,
  publication: 'published-release',
) => VerifiedCeContract;
const makeContract = () =>
  new (VerifiedCeContract as unknown as Constructor)(
    schema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    contract,
    { ...schema.schemas, ...replaceSchema.schemas },
    undefined,
    'published-release',
  );
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const context = {
  hasUI: false,
  ui: { confirm: async () => false },
  sessionManager: { getSessionId: () => 'initial-binding', saveArtifact: async () => 'fixture' },
};
function fixture(provider: 'aws' | 'azure', engine: 'native' | 'terraform') {
  const binding: SiteBinding = {
    owner: { deploymentId: 'initial-binding', engine, provider, account: 'demo', region: 'demo-region' },
    siteName: 'initial-binding',
    nodes: ['node-one'],
  };
  const expected: ExpectedCeInterface[] = [
    { node: 'node-one', role: 'slo', mac: '02:00:00:00:00:01' },
    { node: 'node-one', role: 'sli', mac: '02:00:00:00:00:02' },
  ];
  const instance = provider === 'aws' ? 'i-1234567890abcdef0' : '00000000-0000-4000-8000-000000000001';
  const devices = provider === 'aws' ? ['ens5', 'ens6'] : ['eth0', 'eth1'];
  const labels = Object.fromEntries(
    Object.entries({ deployment: 'initial-binding', engine, provider, account: 'demo', region: 'demo-region' }).map(
      ([k, v]) => [`xcsh-ce-${k}`, v],
    ),
  );
  const site = {
    metadata: { name: binding.siteName, namespace: 'system', labels },
    system_metadata: { uid: 'logical-site-one' },
    spec: {
      [provider]: {
        not_managed: {
          node_list: [
            {
              hostname: 'node-one',
              interface_list: expected.map((item, index) => ({
                ethernet_interface: { mac: item.mac, device: devices[index] },
                network_option: { [item.role === 'slo' ? 'site_local_network' : 'site_local_inside_network']: {} },
                dhcp_client: {},
              })),
            },
          ],
        },
      },
    },
  };
  const registrations = {
    items: [
      {
        get_spec: {
          passport: { cluster_name: binding.siteName, cluster_size: 1 },
          infra: {
            hostname: 'node-one',
            instance_id: instance,
            hw_info: { network: expected.map((item, index) => ({ name: devices[index], mac_address: item.mac })) },
          },
        },
        object: { status: { current_state: 'ADMITTED' } },
      },
    ],
    errors: [],
  };
  const artifact = makeContract();
  let known: CeStoredSiteBinding = {
    schemaVersion: 1,
    binding,
    siteUid: 'logical-site-one',
    contractFingerprint: artifact.fingerprint,
    tenantOrigin: 'https://tenant.test',
    expectedInterfaces: [],
  };
  const recorded: Array<{ binding: SiteBinding; uid: string; expected?: ExpectedCeInterface[] }> = [];
  const requests: string[] = [];
  let failPersistence = false;
  let apiStatus = 200;
  const runtime = new CeRuntime(
    artifact,
    engine,
    'https://tenant.test',
    'fixture-token',
    async (url) => {
      const path = new URL(url).pathname;
      requests.push(path);
      if (apiStatus !== 200) return json({}, apiStatus);
      if (path.includes('registrations_by_site')) return json(registrations);
      if (path.endsWith('/network_interfaces')) return json({ items: [], errors: [] });
      return json(site);
    },
    undefined,
    async (b, uid, interfaces) => {
      if (failPersistence) throw new Error('storage unavailable');
      recorded.push({ binding: structuredClone(b), uid, expected: structuredClone(interfaces) });
      known = {
        ...known,
        binding: structuredClone(b),
        siteUid: uid,
        expectedInterfaces: structuredClone(interfaces ?? []),
      };
    },
  );
  const service = {
    siteBinding: async () => structuredClone(known),
    runtime: async () => runtime,
  } as unknown as CePlatformService;
  const tool = createF5xcCeV2StatusTool({ typebox: { Type } } as unknown as PlatformToolApi, () => service);
  return {
    binding,
    expected,
    devices,
    instances: { 'node-one': instance },
    site,
    registrations,
    runtime,
    recorded,
    requests,
    tool,
    persistFailure: () => {
      failPersistence = true;
    },
    apiFailure: (status: number) => {
      apiStatus = status;
    },
  };
}

for (const provider of ['aws', 'azure'] as const)
  for (const engine of ['native', 'terraform'] as const) {
    test(`${provider}/${engine}: verified initial identities let public status reach the observer without inventing freshness`, async () => {
      const f = fixture(provider, engine);
      const params = { namespace: 'system', siteName: f.binding.siteName };
      const before = await f.tool.execute('before', params, undefined, undefined, context);
      expect(before.details).toMatchObject({ status: 'unknown', reason: 'binding-or-evidence-unavailable' });
      expect(f.requests).toHaveLength(0);
      const result = await f.runtime.observeRegisteredConfiguration(f.binding, f.instances, f.expected);
      expect(result.status).toBe('configured');
      expect(f.recorded).toEqual([
        {
          binding: f.binding,
          uid: 'logical-site-one',
          expected: f.expected.map((item, index) => ({ ...item, device: f.devices[index] })),
        },
      ]);
      for (const item of f.recorded[0].expected ?? []) {
        expect(item).not.toHaveProperty('linkUp');
        expect(item).not.toHaveProperty('observedAt');
      }
      const after = await f.tool.execute('after', params, undefined, undefined, context);
      expect(f.requests).toContain('/api/config/namespaces/system/network_interfaces');
      expect(after.details).toMatchObject({
        status: 'unknown',
        ceSampleAge: 'unknown',
        freshnessQualification: 'pending-1930',
        canSatisfyMutationGate: false,
      });
    });
  }

for (const mode of [
  'foreign-owner',
  'missing-uid',
  'wrong-device',
  'missing-interface',
  'duplicate-registration',
  'partial-registration',
  'foreign-instance',
  'unauthorized',
  'unavailable',
  'persistence',
] as const) {
  test(`untrusted initial configuration (${mode}) cannot persist bindings or return configured`, async () => {
    const f = fixture('aws', 'native');
    if (mode === 'foreign-owner') f.site.metadata.labels['xcsh-ce-deployment'] = 'foreign';
    if (mode === 'missing-uid') f.site.system_metadata.uid = '';
    if (mode === 'wrong-device')
      f.site.spec.aws.not_managed.node_list[0].interface_list[0].ethernet_interface.device = 'foreign';
    if (mode === 'missing-interface') f.site.spec.aws.not_managed.node_list[0].interface_list.pop();
    if (mode === 'duplicate-registration') f.registrations.items.push(structuredClone(f.registrations.items[0]));
    if (mode === 'partial-registration') Object.assign(f.registrations, { next_page_token: 'more' });
    if (mode === 'foreign-instance') f.registrations.items[0].get_spec.infra.instance_id = 'i-00000000000000000';
    if (mode === 'unauthorized') f.apiFailure(403);
    if (mode === 'unavailable') f.apiFailure(503);
    if (mode === 'persistence') f.persistFailure();
    const result = await f.runtime.observeRegisteredConfiguration(f.binding, f.instances, f.expected);
    expect(result.status).toBe('unknown');
    expect(f.recorded).toHaveLength(0);
  });
}

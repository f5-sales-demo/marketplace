import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correlateCeInterfaces, type ExpectedCeInterface } from '../../src/ce/interface-evidence';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { createCePlatformService } from '../../src/ce/service';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import six from '../fixtures/aws-ha-six-interface-links.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contract from '../fixtures/smsv2-contract-v7.json';
import compact from '../fixtures/smsv2-create-schema.json';
import replaceCompact from '../fixtures/smsv2-replace-schema.json';

const schema = resolveCeSchemaFixture(compact);
const replace = resolveCeSchemaFixture(replaceCompact);
type Constructor = new (
  commit: string,
  fingerprint: string,
  contract: Record<string, unknown>,
  schemas: Record<string, unknown>,
  networking: undefined,
  publication: 'published-release',
) => VerifiedCeContract;
const artifact = (fingerprint = 'f') =>
  new (VerifiedCeContract as unknown as Constructor)(
    schema.provenance.commit,
    `sha256:${fingerprint.repeat(64)}`,
    contract,
    { ...schema.schemas, ...replace.schemas },
    undefined,
    'published-release',
  );
const otherUid = '00000000-0000-4000-8000-000000000099';
const fixture = () => structuredClone(six);

test('control: the recorded six-interface owned join remains readable', () => {
  const f = fixture();
  expect(
    correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected as ExpectedCeInterface[]),
  ).toHaveLength(6);
});
test('six authoritative generated UIDs are returned without deriving names or IDs', () => {
  const f = fixture();
  const rows = correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected as ExpectedCeInterface[]);
  expect(rows.map((row) => row.interfaceUid)).toEqual(f.objects.items.map((item) => item.uid));
  expect(new Set(rows.map((row) => row.interfaceUid)).size).toBe(6);
});
for (const mode of [
  'missing',
  'malformed',
  'nil',
  'duplicate',
  'case-duplicate',
  'metadata-mismatch',
  'bound-change',
] as const) {
  test(`generated UID ${mode} is rejected`, () => {
    const f = fixture();
    const expected = f.expected as ExpectedCeInterface[];
    if (mode === 'missing') delete (f.objects.items[0] as Partial<(typeof f.objects.items)[0]>).uid;
    if (mode === 'malformed') f.objects.items[0].uid = 'not-a-uuid';
    if (mode === 'nil') f.objects.items[0].uid = '00000000-0000-0000-0000-000000000000';
    if (mode === 'duplicate') f.objects.items[1].uid = f.objects.items[0].uid;
    if (mode === 'case-duplicate') {
      f.objects.items[0].uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      f.objects.items[1].uid = f.objects.items[0].uid.toUpperCase();
    }
    if (mode === 'metadata-mismatch') Object.assign(f.objects.items[0], { system_metadata: { uid: otherUid } });
    if (mode === 'bound-change') Object.assign(expected[0], { interfaceUid: otherUid });
    expect(() => correlateCeInterfaces(f.configuration, f.objects, f.physical, expected)).toThrow();
  });
}

function runtimeFixture(mode = 'healthy') {
  const f = fixture();
  const binding: SiteBinding = {
    owner: { deploymentId: 'generated-uid', engine: 'native', provider: 'aws', account: 'demo', region: 'us-east-2' },
    siteName: f.configuration.metadata.name,
    nodes: [...new Set(f.expected.map((row) => row.node))],
  };
  Object.assign(f.configuration.metadata, {
    labels: Object.fromEntries(
      Object.entries({
        deployment: binding.owner.deploymentId,
        engine: 'native',
        provider: 'aws',
        account: 'demo',
        region: 'us-east-2',
      }).map(([key, value]) => [`xcsh-ce-${key}`, value]),
    ),
  });
  const originalSiteUid = f.configuration.system_metadata.uid;
  if (mode === 'logical-site-change') {
    f.configuration.system_metadata.uid = otherUid;
    for (const item of f.objects.items) item.owner_view.uid = otherUid;
  }
  const calls: string[] = [];
  const records: ExpectedCeInterface[][] = [];
  const runtime = new CeRuntime(
    artifact(),
    'native',
    'https://tenant.test',
    'synthetic-token',
    async (url) => {
      const path = new URL(url).pathname;
      calls.push(path);
      if (path.endsWith('/network_interfaces')) return Response.json(f.objects);
      if (path.includes('/network_interfaces/')) {
        if (mode === 'get-unavailable') return Response.json({}, { status: 503 });
        if (mode === 'get-unauthorized') return Response.json({}, { status: 403 });
        if (mode === 'get-deleted') return Response.json({}, { status: 404 });
        const name = path.split('/').at(-1);
        const item = f.objects.items.find((item) => item.name === name);
        if (!item) return Response.json({}, { status: 404 });
        const exact = {
          metadata: { name: item.name, namespace: item.namespace },
          system_metadata: { uid: item.uid, owner_view: structuredClone(item.owner_view) },
          spec: structuredClone(item.get_spec),
        };
        if (mode === 'get-recreated') exact.system_metadata.uid = otherUid;
        if (mode === 'get-owner') exact.system_metadata.owner_view.uid = otherUid;
        if (mode === 'get-name') exact.metadata.name = 'foreign-interface';
        if (mode === 'get-namespace') exact.metadata.namespace = 'example-foreign';
        if (mode === 'get-device') exact.spec.ethernet_interface.device = 'foreign0';
        if (mode === 'get-mtu') exact.spec.ethernet_interface.mtu = 8000;
        if (mode === 'get-node') exact.spec.ethernet_interface.node = 'foreign-node';
        if (mode === 'get-role') {
          delete (exact.spec.ethernet_interface as Record<string, unknown>).site_local_network;
          delete (exact.spec.ethernet_interface as Record<string, unknown>).site_local_inside_network;
        }
        return Response.json(exact);
      }
      if (path.includes('/securemesh_site_v2s/')) return Response.json(f.configuration);
      if (path.includes('/sites/')) return Response.json(f.physical);
      throw Error('Unexpected fixture request');
    },
    undefined,
    async (_binding, _uid, expected) => {
      calls.push('persist');
      records.push(structuredClone(expected ?? []));
    },
  );
  return { f, binding, runtime, calls, records, originalSiteUid };
}
test('runtime reobserves six exact generated objects after publication and persists complete identity', async () => {
  const f = runtimeFixture();
  const result = await f.runtime.observeAwsInterfaces(
    f.binding,
    f.f.expected as ExpectedCeInterface[],
    undefined,
    f.originalSiteUid,
  );
  expect(result.status).toBe('observed');
  const physicalIndex = f.calls.findIndex((path) => path.includes('/sites/'));
  const exactIndices = f.calls.flatMap((path, index) => (path.includes('/network_interfaces/') ? [index] : []));
  expect(exactIndices).toHaveLength(6);
  expect(exactIndices.every((index) => index > physicalIndex)).toBe(true);
  expect(f.calls.at(-1)).toBe('persist');
  expect(f.records[0].map((row) => row.interfaceUid)).toEqual(f.f.objects.items.map((item) => item.uid));
  expect(f.records[0].map((row) => row.interfaceName)).toEqual(f.f.objects.items.map((item) => item.name));
  expect(f.records[0].every((row) => !('linkUp' in row) && !('observedAt' in row))).toBe(true);
});
for (const mode of [
  'get-recreated',
  'get-owner',
  'get-name',
  'get-namespace',
  'get-device',
  'get-mtu',
  'get-node',
  'get-role',
  'get-unavailable',
  'get-unauthorized',
  'get-deleted',
  'logical-site-change',
]) {
  test(`runtime ${mode} remains unknown without persisting new identity`, async () => {
    const f = runtimeFixture(mode);
    const result = await f.runtime.observeAwsInterfaces(
      f.binding,
      f.f.expected as ExpectedCeInterface[],
      undefined,
      f.originalSiteUid,
    );
    expect(result.status).toBe('unknown');
    expect(result.interfaces).toEqual([]);
    expect(f.records).toHaveLength(0);
  });
}
test('reported up/down/up retains generated UID, name, MAC and device without manufacturing freshness', async () => {
  const f = runtimeFixture();
  const initial = await f.runtime.observeAwsInterfaces(
    f.binding,
    f.f.expected as ExpectedCeInterface[],
    undefined,
    f.originalSiteUid,
  );
  const selectedIndex = initial.interfaces.findIndex((row) => row.role === 'sli');
  if (selectedIndex < 0) throw Error('Fixture SLI is missing');
  const selected = initial.interfaces[selectedIndex];
  const link = f.f.physical.status
    .flatMap((status) => status.ver_status.intf_status)
    .find((link) => link.name === selected.device && link.mac.toLowerCase() === selected.mac);
  if (!link) throw Error('Fixture physical interface is missing');
  link.link_state = false;
  const down = await f.runtime.observeAwsInterfaces(f.binding, initial.interfaces, undefined, f.originalSiteUid);
  link.link_state = true;
  const restored = await f.runtime.observeAwsInterfaces(f.binding, initial.interfaces, undefined, f.originalSiteUid);
  expect([initial.status, down.status, restored.status]).toEqual(['observed', 'down', 'observed']);
  for (const observation of [initial, down, restored]) {
    expect(observation.interfaces[selectedIndex]).toMatchObject({
      interfaceUid: f.f.objects.items[selectedIndex].uid,
      interfaceName: f.f.objects.items[selectedIndex].name,
      mac: selected.mac,
      device: selected.device,
    });
    expect(observation.interfaces.filter((row) => row.role === 'slo').every((row) => row.linkUp)).toBe(true);
    expect(observation.freshness).toBe('unqualified');
    expect(observation.canSatisfyInterfaceMutationGate).toBe(false);
  }
});

for (const mode of [
  'registration-preserves',
  'changed-uid',
  'malformed-uid',
  'null-uid',
  'null-name',
  'changed-name',
  'producer-repin-preserves',
] as const) {
  test(`actual binding storage ${mode}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'generated-uid-storage-'));
    try {
      const f = runtimeFixture();
      const env = {
        XCSH_API_URL: 'https://tenant.test',
        XCSH_API_TOKEN: 'synthetic-token',
        XCSH_CE_DEPLOYMENTS_DIR: root,
      };
      const service = createCePlatformService(env, async () => artifact());
      const runtime = await service.runtime('native');
      const ids = f.f.expected.map((row, i) => ({
        ...row,
        interfaceUid: f.f.objects.items[i].uid,
        interfaceName: f.f.objects.items[i].name,
      })) as ExpectedCeInterface[];
      await runtime.recordBinding!(f.binding, f.originalSiteUid, ids);
      if (mode === 'registration-preserves') {
        await runtime.recordBinding!(f.binding, f.originalSiteUid, f.f.expected as ExpectedCeInterface[]);
      } else if (mode === 'producer-repin-preserves') {
        const newService = createCePlatformService(env, async () => artifact('e'));
        const newRuntime = await newService.runtime('native');
        await newRuntime.recordBinding!(f.binding, f.originalSiteUid);
      } else {
        const incoming = structuredClone(ids);
        if (mode === 'changed-uid') incoming[0].interfaceUid = otherUid;
        if (mode === 'malformed-uid') incoming[0].interfaceUid = 'not-a-uuid';
        if (mode === 'changed-name') incoming[0].interfaceName = 'foreign-interface';
        if (mode === 'null-uid') Object.assign(incoming[0], { interfaceUid: null });
        if (mode === 'null-name') Object.assign(incoming[0], { interfaceName: null });
        await expect(runtime.recordBinding!(f.binding, f.originalSiteUid, incoming)).rejects.toThrow();
      }
      const known = await service.siteBinding!(f.binding.siteName);
      expect(known.expectedInterfaces.map((row) => row.interfaceUid)).toEqual(ids.map((row) => row.interfaceUid));
      expect(known.expectedInterfaces.map((row) => row.interfaceName)).toEqual(ids.map((row) => row.interfaceName));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

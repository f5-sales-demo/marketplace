import { expect, test } from 'bun:test';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeOwner } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAzureNetworkOperationalIdentity } from '../../src/ce/network-operational-identity';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkUpdateFixture } from './network-update-fixture';

type TestLinks = { status: string; interfaces: Record<string, unknown>[] };
type TestRegistrations = { owner: CeOwner; siteName: string; status: string; nodes: Record<string, unknown>[] };
type TestSite = {
  metadata: { name: string; namespace: string };
  system_metadata: { uid: string };
  spec: Record<string, unknown>;
};
type Runtime = Parameters<typeof collectAzureNetworkOperationalIdentity>[2];
async function fixture(ha = false) {
  const f = networkUpdateFixture(ha, 'terraform', true, false);
  const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const binding = azureUpgradeBinding(f.plan);
  const spec = { azure: { synthetic: true } };
  const identity = {
    owner: binding.owner,
    planSha256: f.plan.planSha256,
    node: 1,
    siteName: f.plan.siteName,
    siteUid: 'site-uid',
    siteConfigurationSha256: canonicalSha256({ metadata: { name: f.plan.siteName, namespace: 'system' }, spec }),
    configurationSha256: 'c'.repeat(64),
    inventory,
  };
  const state = {
    down: false,
    unknownLinks: false,
    unknownRegistration: false,
    calls: [] as string[],
    linkMutate: undefined as undefined | ((value: TestLinks, call: number) => void),
    registrationMutate: undefined as undefined | ((value: TestRegistrations, call: number) => void),
    siteMutate: undefined as undefined | ((value: TestSite, call: number) => void),
  };
  let links = 0,
    registrations = 0,
    sites = 0;
  const runtime = {
    engine: 'terraform' as const,
    ownedSiteConfiguration(_binding: unknown, value: TestSite) {
      return { metadata: value.metadata, spec: value.spec };
    },
    async observeOwnedSite() {
      state.calls.push('site');
      const value = {
        metadata: { name: f.plan.siteName, namespace: 'system' },
        system_metadata: { uid: 'site-uid' },
        spec,
      };
      state.siteMutate?.(value, ++sites);
      return value;
    },
    async observeRegistrations(_binding: unknown, expected: Record<string, string>) {
      state.calls.push('registrations');
      expect(expected).toEqual(
        Object.fromEntries(binding.nodes.map((node, i) => [node, inventory.nodes[String(i + 1)].vmId])),
      );
      const value = {
        owner: binding.owner,
        siteName: binding.siteName,
        status: state.unknownRegistration ? 'unknown' : 'healthy',
        nodes: binding.nodes.map((node, i) => ({
          node,
          instanceId: expected[node],
          state: 'ONLINE',
          status: 'healthy',
          registration: `r-node-${i + 1}`,
          privateRaw: 'SECRET_SENTINEL',
        })),
      };
      state.registrationMutate?.(value, ++registrations);
      return value;
    },
    async observeAzureInterfaces(_binding: unknown, expected: ExpectedCeInterface[]) {
      state.calls.push('interfaces');
      expect(expected).toHaveLength((ha ? 3 : 1) * 2);
      const value = {
        status: state.unknownLinks ? 'unknown' : state.down ? 'down' : 'observed',
        observedAt: '2020-01-01T00:00:00Z',
        interfaces: state.unknownLinks
          ? []
          : expected.map((row) => ({
              ...row,
              device: row.role === 'slo' ? 'eth0' : 'eth1',
              interfaceName: `${row.node}-${row.role}`,
              mtu: 1500,
              linkUp: !(state.down && row.role === 'sli' && row.node === binding.nodes[0]),
              ipv4: null,
              privateRaw: 'SECRET_SENTINEL',
            })),
      };
      state.linkMutate?.(value, ++links);
      return value;
    },
  } as unknown as Runtime;
  const run = (signal?: AbortSignal) =>
    collectAzureNetworkOperationalIdentity(f.plan, identity, runtime, f.api, signal);
  return { ...f, identity, runtime, state, run };
}
for (const ha of [false, true])
  test(`network operational identity joins ${ha ? 'six' : 'two'} current interfaces and retains unqualified operational scope`, async () => {
    const f = await fixture(ha),
      result = await f.run();
    expect(result.status).toBe('observed');
    expect(result.interfaceState).toBe('observed');
    expect(result.interfaces).toHaveLength((ha ? 3 : 1) * 2);
    expect(result).toMatchObject({
      scope: 'node-registration-interface-identity',
      operationalAcceptance: 'unknown',
      nodeHealth: 'unknown',
      freshness: 'unqualified',
      routing: 'unknown',
      traffic: 'unknown',
    });
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(JSON.stringify(result)).not.toContain('2020-01-01');
    expect(f.mutations()).toBe(0);
  });
test('same SLI up/down/restored-up observations retain device/MAC/object identity and never qualify operational acceptance', async () => {
  const f = await fixture(true),
    up = await f.run();
  f.state.down = true;
  const down = await f.run();
  f.state.down = false;
  const restored = await f.run();
  expect([up.interfaceState, down.interfaceState, restored.interfaceState]).toEqual(['observed', 'down', 'observed']);
  const selected = (r: typeof up) => {
    const row = r.interfaces.find((row) => row.node === `${f.plan.deploymentName}-1` && row.role === 'sli');
    if (!row) throw Error('Expected SLI interface is missing');
    return row;
  };
  expect(selected(down)).toEqual({ ...selected(up), linkUp: false });
  expect(selected(restored)).toEqual(selected(up));
  expect(down.operationalAcceptance).toBe('unknown');
  expect(f.mutations()).toBe(0);
});
test('unavailable registration evidence preserves independently explicit down interface state', async () => {
  const f = await fixture();
  f.state.down = true;
  f.state.unknownRegistration = true;
  expect(await f.run()).toMatchObject({
    status: 'unknown',
    interfaceState: 'down',
    reason: 'registrations-unverified',
  });
});
test('missing interface evidence remains unknown', async () => {
  const f = await fixture();
  f.state.unknownLinks = true;
  expect(await f.run()).toMatchObject({
    status: 'unknown',
    interfaceState: 'unknown',
    reason: 'interfaces-unverified',
  });
});
for (const fault of [
  'partial',
  'duplicate',
  'foreign-node',
  'foreign-mac',
  'foreign-role',
  'missing-link',
  'false-status',
  'duplicate-device',
  'duplicate-object',
  'malformed-ip',
  'missing-mtu',
  'changed-final',
])
  test(`network identity rejects ${fault} interface evidence`, async () => {
    const f = await fixture(true);
    f.state.linkMutate = (value, call) => {
      const rows = value.interfaces;
      if (fault === 'partial') rows.pop();
      if (fault === 'duplicate') rows[1] = rows[0];
      if (fault === 'foreign-node') rows[0].node = 'foreign';
      if (fault === 'foreign-mac') rows[0].mac = '00:00:00:00:00:99';
      if (fault === 'foreign-role') rows[0].role = 'data';
      if (fault === 'missing-link') delete rows[0].linkUp;
      if (fault === 'false-status') rows[0].linkUp = false;
      if (fault === 'duplicate-device') rows[1].device = rows[0].device;
      if (fault === 'duplicate-object') rows[1].interfaceName = rows[0].interfaceName;
      if (fault === 'malformed-ip') rows[0].ipv4 = { address: 'bad', prefixLength: 24 };
      if (fault === 'missing-mtu') delete rows[0].mtu;
      if (fault === 'changed-final' && call === 2) rows[0].interfaceName += '-changed';
    };
    expect(await f.run()).toMatchObject({ status: 'unknown', interfaceState: 'unknown', interfaces: [] });
    expect(f.mutations()).toBe(0);
  });
for (const fault of [
  'foreign-owner',
  'wrong-uuid',
  'duplicate',
  'partial',
  'wrong-state',
  'missing-registration',
  'changed-final',
])
  test(`network identity rejects ${fault} registrations`, async () => {
    const f = await fixture(true);
    f.state.registrationMutate = (value, call) => {
      if (fault === 'foreign-owner') value.owner = { ...value.owner, account: 'example-foreign' };
      if (fault === 'wrong-uuid') value.nodes[0].instanceId = 'foreign';
      if (fault === 'duplicate') value.nodes[1] = value.nodes[0];
      if (fault === 'partial') value.nodes.pop();
      if (fault === 'wrong-state') value.nodes[0].state = 'ADMITTED';
      if (fault === 'missing-registration') delete value.nodes[0].registration;
      if (fault === 'changed-final' && call === 2) value.nodes[0].registration += '-changed';
    };
    expect((await f.run()).status).toBe('unknown');
    expect(f.mutations()).toBe(0);
  });
for (const fault of ['wrong-uid', 'wrong-spec', 'foreign-name', 'wrong-namespace', 'changed-final'])
  test(`network identity rejects ${fault} owned site`, async () => {
    const f = await fixture();
    f.state.siteMutate = (value, call) => {
      if (fault === 'wrong-uid' || (fault === 'changed-final' && call === 2)) value.system_metadata.uid = 'foreign';
      if (fault === 'wrong-spec') value.spec = { changed: true };
      if (fault === 'foreign-name') value.metadata.name = 'foreign';
      if (fault === 'wrong-namespace') value.metadata.namespace = 'example-foreign';
    };
    expect((await f.run()).status).toBe('unknown');
    expect(f.mutations()).toBe(0);
  });
test('network identity rejects changed final cloud UUID and foreign initial cloud ownership', async () => {
  const f = await fixture();
  f.state.siteMutate = (_value, call) => {
    if (call === 2) f.vms[0].vmId = '00000000-0000-4000-8000-000000000099';
  };
  expect(await f.run()).toMatchObject({ status: 'unknown', reason: 'final-cloud-identity-unverified' });
  const g = await fixture();
  g.vms[0].tags['xcsh-plan-sha256'] = 'f'.repeat(64);
  expect(await g.run()).toMatchObject({ status: 'unknown', reason: 'cloud-identity-unverified' });
  expect(g.state.calls).toEqual([]);
});
test('network identity accepts configured MTU zero without interpreting it as operational health', async () => {
  const f = await fixture();
  f.state.linkMutate = (v) => {
    v.interfaces[0].mtu = 0;
  };
  expect((await f.run()).status).toBe('observed');
});
test('network identity rejects wrong engine and unresolved identities before cloud/platform observation', async () => {
  const f = await fixture();
  Object.defineProperty(f.runtime, 'engine', { value: 'native' });
  await expect(f.run()).rejects.toThrow(/owning resolved/);
  expect(f.state.calls).toEqual([]);
  Object.defineProperty(f.runtime, 'engine', { value: 'terraform' });
  f.identity.configurationSha256 = '__UNRESOLVED__';
  await expect(f.run()).rejects.toThrow(/owning resolved/);
  expect(f.state.calls).toEqual([]);
});
test('network identity bounds caller cancellation ignored by platform observation', async () => {
  const f = await fixture();
  const controller = new AbortController();
  f.runtime.observeOwnedSite = () => new Promise(() => {});
  const pending = f.run(controller.signal);
  const timer = setTimeout(() => controller.abort(Error('cancelled')), 20);
  try {
    await expect(pending).rejects.toThrow('cancelled');
  } finally {
    clearTimeout(timer);
  }
  expect(f.mutations()).toBe(0);
});
test('network identity keeps platform authorization/service failures unknown without exposing error text', async () => {
  const f = await fixture();
  f.runtime.observeAzureInterfaces = async () => {
    throw Error('SECRET_SENTINEL');
  };
  const result = await f.run();
  expect(result).toMatchObject({ status: 'unknown', reason: 'interfaces-unverified' });
  expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
});

test('network identity binds the owning projected configuration rather than a spec-only digest', async () => {
  const f = await fixture();
  f.identity.siteConfigurationSha256 = canonicalSha256({ azure: { synthetic: true } });
  expect(await f.run()).toMatchObject({ status: 'unknown', reason: 'site-identity-unverified' });
});
test('network identity keeps owned configuration projection failures unknown', async () => {
  const f = await fixture();
  f.runtime.ownedSiteConfiguration = () => {
    throw Error('SECRET_SENTINEL');
  };
  expect(await f.run()).toMatchObject({ status: 'unknown', reason: 'site-identity-unverified' });
});

for (const node of [2, 3])
  test(`network identity retains selected HA node ${node} with all six authoritative interface joins`, async () => {
    const f = await fixture(true);
    f.identity.node = node;
    const result = await f.run();
    expect(result).toMatchObject({ node, status: 'observed', operationalAcceptance: 'unknown' });
    expect(result.interfaces).toHaveLength(6);
  });
test('network identity rejects foreign expected owner and out-of-range selected node before observation', async () => {
  const f = await fixture(true);
  f.identity.node = 4;
  await expect(f.run()).rejects.toThrow(/owning resolved/);
  f.identity.node = 1;
  f.identity.owner = { ...f.identity.owner, account: 'example-foreign' };
  await expect(f.run()).rejects.toThrow(/owning resolved/);
  expect(f.state.calls).toEqual([]);
});

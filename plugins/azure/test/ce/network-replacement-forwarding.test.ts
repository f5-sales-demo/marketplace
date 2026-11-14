import { expect } from 'bun:test';
import type { ExpectedCeForwardingRoutes } from '../../../platform/src/ce/forwarding-route';
import {
  collectAzureReplacementForwarding,
  resolveAzureReplacementForwardingExpectations,
} from '../../src/ce/network-replacement-forwarding';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

function physicalRole(role: string): 'slo' | 'sli' {
  if (role !== 'slo' && role !== 'sli') throw Error('Synthetic forwarding requires physical SLO/SLI roles');
  return role;
}

async function fixture(ha = false, fault = '') {
  const f = await replacementOperationalIdentityFixture(ha),
    count = f.plan.topology.nodeCount;
  const rows = (after: boolean) =>
    Array.from({ length: count }, (_, index) =>
      (['slo', 'sli'] as const).map((role) => ({
        node: index + 1,
        role,
        prefix:
          role === 'slo' ? (after ? '203.0.113.0/24' : '192.0.2.0/24') : after ? '10.0.0.0/24' : '198.51.100.0/24',
        routeType: 'LOCAL_ROUTE' as const,
      })),
    ).flat();
  const desired = { before: rows(false), after: rows(true) };
  const retained = compileAzureTerraformNetworkUpdatePlan(
    compileAzureCePlan(
      { ...f.network.intent, routing: { ...f.network.intent.routing, forwardingRoutes: desired } },
      f.birth.current,
    ),
    f.birth.original,
    f.birth.original,
  );
  const plan = compileAzureTerraformNetworkReplacementPlan(
    compileAzureCePlan({ ...retained.intent, operation: 'replace-node', replacementNode: ha ? 2 : 1 }, f.birth.current),
    retained,
    f.birth.original,
  );
  const identity = { ...structuredClone(f.identity), planSha256: plan.planSha256 },
    binding = azureUpgradeBinding(plan);
  const interfaces = binding.nodes.flatMap((node, index) =>
    plan.nics.map((nic) => ({
      node,
      role: physicalRole(nic.role),
      mac: identity.nodes[String(index + 1)].nics[String(nic.index)].mac,
      device: nic.role === 'slo' ? 'eth0' : 'eth1',
      interfaceName: node + '-' + nic.role,
      linkUp: true,
      mtu: 1500,
      ipv4: null,
    })),
  );
  let calls = 0;
  const runtime = {
    async observeForwardingRoutes(_binding: unknown, wanted: ExpectedCeForwardingRoutes) {
      calls++;
      if (fault === 'service') throw Error('FORWARDING_PRIVATE_SENTINEL');
      const reads = wanted.interfaces.map((row) => ({
        method: 'POST' as const,
        path: '/api/operate/namespaces/system/sites/' + binding.siteName + '/ver/simplified_routes',
        body: {
          namespace: 'system' as const,
          site: binding.siteName,
          node: row.node,
          family: 'INET4' as const,
          [row.role]: {},
        },
      }));
      const routes = wanted.routes.map((route) => {
        const iface = wanted.interfaces.find((row) => row.node === route.node && row.role === route.role);
        if (!iface) throw Error('Synthetic expected interface missing');
        return {
          ...route,
          flags: ['ACTIVE'],
          interfaces: [
            { ...iface, kind: 'local' as const, reportedInterface: iface.device, matchedFields: ['device'] },
          ],
        };
      });
      if (fault === 'partial') routes.pop();
      if (fault === 'duplicate' && routes[0]) routes.push(routes[0]);
      if (fault === 'wrong-device' && routes[0]) routes[0].interfaces[0].reportedInterface = 'foreign';
      if (fault === 'late-change' && calls === 2 && routes[0]) routes[0].flags = ['CHANGED'];
      return {
        status: 'observed' as const,
        owner: fault === 'owner' ? { ...binding.owner, account: 'example-foreign' } : binding.owner,
        siteName: binding.siteName,
        siteUid: wanted.siteUid,
        scope: 'reported-forwarding-interface' as const,
        interfaceNamespace: 'unqualified' as const,
        freshness: 'unqualified' as const,
        operationalAcceptance: 'unknown' as const,
        contractFingerprint: 'sha256:' + 'a'.repeat(64),
        reads,
        routes,
        collectedAt: new Date().toISOString(),
        privateRaw: 'FORWARDING_PRIVATE_SENTINEL',
      };
    },
  };
  return { plan, retained, identity, interfaces, runtime, desired, calls: () => calls };
}

for (const ha of [false, true])
  test(`replacement ${ha ? 'HA' : 'single'} resolves completed after routes for both boundaries and collects reported forwarding only`, async () => {
    const f = await fixture(ha),
      wanted = resolveAzureReplacementForwardingExpectations(f.plan, f.retained, f.identity, f.interfaces);
    expect(wanted?.routes.map((row) => row.prefix)).toEqual(f.desired.after.map((row) => row.prefix));
    const result = await collectAzureReplacementForwarding(f.plan, f.retained, f.identity, f.interfaces, f.runtime);
    expect(result).toMatchObject({
      status: 'observed',
      scope: 'replacement-reviewed-forwarding',
      freshness: 'unqualified',
      interfaceNamespace: 'unqualified',
      operationalAcceptance: 'unknown',
      observations: { routeCount: ha ? 6 : 2, observationRequests: ha ? 12 : 4 },
    });
    expect(f.calls()).toBe(2);
    expect(JSON.stringify(result)).not.toContain('FORWARDING_PRIVATE_SENTINEL');
  }, 60000);

for (const fault of ['owner', 'partial', 'duplicate', 'wrong-device', 'late-change', 'service'])
  test(`replacement forwarding retains unknown for ${fault}`, async () => {
    const f = await fixture(false, fault),
      result = await collectAzureReplacementForwarding(f.plan, f.retained, f.identity, f.interfaces, f.runtime);
    expect(result.status).toBe('unknown');
    expect(result.operationalAcceptance).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('FORWARDING_PRIVATE_SENTINEL');
  }, 60000);

test('replacement route names cannot be derived from a foreign physical MAC', async () => {
  const f = await fixture();
  f.interfaces[0].mac = '02:00:00:00:00:99';
  expect(() => resolveAzureReplacementForwardingExpectations(f.plan, f.retained, f.identity, f.interfaces)).toThrow();
  expect(f.calls()).toBe(0);
}, 60000);

test('replacement forwarding rejects a foreign source binding before reading', async () => {
  const f = await fixture();
  f.identity.planSha256 = 'f'.repeat(64);
  await expect(
    collectAzureReplacementForwarding(f.plan, f.retained, f.identity, f.interfaces, f.runtime),
  ).rejects.toThrow();
  expect(f.calls()).toBe(0);
}, 60000);

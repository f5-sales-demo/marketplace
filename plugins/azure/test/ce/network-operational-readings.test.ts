import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { ExpectedCeNodeHealthIdentity } from '../../../platform/src/ce/node-health';
import { CeRuntime } from '../../../platform/src/ce/runtime';
import { VerifiedCeContract } from '../../../platform/src/ce/verified-contract';
import nodeApi from '../../../platform/test/fixtures/node-health-schema.json';
import { resolveCeSchemaFixture } from '../../../platform/test/fixtures/resolve-schema-fixture';
import smsContract from '../../../platform/test/fixtures/smsv2-contract-v7.json';
import compactSchema from '../../../platform/test/fixtures/smsv2-create-schema.json';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAzureNetworkOperationalReadings } from '../../src/ce/network-operational-readings';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { createIngressHistoryFixture, ingressIntent } from './ingress-history-fixture';
import { networkUpdateFixture } from './network-update-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
type Runtime = Parameters<typeof collectAzureNetworkOperationalReadings>[2];
async function fixture(ha = false, ingress = false, routeServer = false) {
  const f = networkUpdateFixture(
    ha,
    'terraform',
    true,
    false,
    routeServer ? { mode: 'route-server', localAsn: 64512, destinationCidrs: ['10.250.0.10/32'] } : undefined,
  );
  const input = structuredClone(f.plan.intent),
    current = structuredClone(f.current);
  if (ingress) {
    const http = ingressIntent(f.plan.subscription.id);
    if (http.mode !== 'platform-http') throw Error('HTTP fixture missing');
    http.listener.privateAddress = '10.20.2.10';
    input.ingress = http;
    input.brownfield.resourceIds.push(http.probe.sourceVmResourceId);
    current.resources.push({ id: http.probe.sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} });
  }
  const plan = ingress ? compileAzureCePlan(input, current) : f.plan;
  const inventory = await captureAzureNetworkUpdateInventory(plan, f.api),
    binding = azureUpgradeBinding(plan);
  const root = await mkdtemp(join(tmpdir(), 'network-readings-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  const spec = { azure: { fixture: true } };
  const identity = {
    owner: binding.owner,
    planSha256: plan.planSha256,
    node: 1,
    siteName: plan.siteName,
    siteUid: 'site-uid',
    configurationSha256: 'b'.repeat(64),
    inventory,
    siteConfigurationSha256: canonicalSha256({ metadata: { name: plan.siteName, namespace: 'system' }, spec }),
  };
  const state = {
    down: false,
    qualified: false,
    writes: 0,
    healthCalls: 0,
    healthFault: '',
    changedFinal: false,
    routeFault: false,
    sessionsFault: false,
    bgpCalls: 0,
    nodeCalls: 0,
    nodeFault: '',
  };
  const exec = f.api.exec;
  if (routeServer)
    f.api.exec = async (command, args, options) => {
      let value: unknown;
      if (args[0] === 'vm' && args[1] === 'show') {
        value = f.vms.find((vm) => vm.id === args[args.indexOf('--ids') + 1]);
      } else if (args[0] === 'network' && args[1] === 'routeserver') {
        const server = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`;
        const name = args[args.indexOf('--name') + 1],
          node = Number(name.split('-').at(-1));
        const slo = [...f.nics.values()].find((nic) => String(nic.id).endsWith(`-${node}-nic0`));
        const configs = slo?.ipConfigurations as Array<{ privateIPAddress: string }> | undefined;
        const peerIp = configs?.[0].privateIPAddress;
        if (args.includes('list-learned-routes'))
          value = {
            RouteServiceRole_IN_0: state.routeFault ? [] : [{ network: '10.250.0.10/32', nextHop: peerIp }],
            RouteServiceRole_IN_1: [{ network: '10.250.0.10/32', nextHop: peerIp }],
          };
        else if (args.includes('peering'))
          value = {
            id: `${server}/bgpConnections/${name}`,
            name,
            provisioningState: 'Succeeded',
            peerAsn: 64512,
            peerIp,
          };
        else
          value = {
            id: server,
            location: plan.region,
            provisioningState: 'Succeeded',
            virtualRouterAsn: 65515,
            virtualRouterIps: ['10.255.0.4', '10.255.0.5'],
            tags: {
              'xcsh-managed-by': 'azure-ce',
              'xcsh-execution-engine': 'terraform',
              'xcsh-deployment-id': plan.deploymentName,
              'xcsh-plan-sha256': f.original.planSha256,
            },
          };
      } else return exec.call(f.api, command, args, options);
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    };
  const write = store.write.bind(store);
  store.write = async (...args) => {
    state.writes++;
    return write(...args);
  };
  const runtime = {
    engine: 'terraform',
    ownedSiteConfiguration(_binding: unknown, value: { metadata: unknown; spec: unknown }) {
      return { metadata: value.metadata, spec: value.spec };
    },
    async observeOwnedSite() {
      return { metadata: { name: plan.siteName, namespace: 'system' }, system_metadata: { uid: 'site-uid' }, spec };
    },
    async observeRegistrations(_binding: unknown, expected: Record<string, string>) {
      return {
        owner: binding.owner,
        siteName: plan.siteName,
        status: 'healthy',
        nodes: binding.nodes.map((node, i) => ({
          node,
          instanceId: expected[node],
          registration: `r-${i}`,
          status: 'healthy',
          state: 'ONLINE',
        })),
      };
    },
    async observeAzureInterfaces(_binding: unknown, expected: ExpectedCeInterface[]) {
      return {
        status: state.down ? 'down' : 'observed',
        observedAt: '2020-01-01T00:00:00Z',
        freshness: state.qualified ? 'verified' : 'unqualified',
        canSatisfyInterfaceMutationGate: state.qualified,
        interfaces: expected.map((row) => ({
          ...row,
          device: row.role === 'slo' ? 'eth0' : 'eth1',
          interfaceName: `${row.node}-${row.role}`,
          linkUp: !(state.down && row.role === 'sli'),
          mtu: 1500,
          ipv4: null,
          privateRaw: 'SECRET_SENTINEL',
        })),
      };
    },
    async observeHealth() {
      state.healthCalls++;
      if (state.changedFinal) f.vms[0].vmId = '00000000-0000-4000-8000-000000000099';
      if (state.healthFault === 'service') throw Error('SECRET_SENTINEL');
      return {
        owner: state.healthFault === 'owner' ? { ...binding.owner, account: 'example-foreign-account' } : binding.owner,
        siteName: plan.siteName,
        siteUid: state.healthFault === 'uid' ? 'foreign' : 'site-uid',
        scope: state.healthFault === 'scope' ? 'every-node' : 'site-global-only',
        nodeHealth: 'unknown',
        representativeNode: binding.nodes[0],
        state: 'PROVISIONED',
        status: state.healthFault === 'state' ? 'degraded' : 'healthy',
        privateRaw: 'SECRET_SENTINEL',
      };
    },
    async observeNodeReadiness(_binding: unknown, expected: ExpectedCeNodeHealthIdentity) {
      state.nodeCalls++;
      if (!state.nodeFault) return { status: 'unknown', readiness: 'unknown' };
      if (state.nodeFault === 'service') throw Error('SECRET_SENTINEL');
      return {
        status: 'observed',
        readiness: state.nodeFault === 'not-ready' ? 'not-ready' : 'ready',
        state: state.nodeFault === 'not-ready' ? 'FAILED' : 'PROVISIONED',
        owner: state.nodeFault === 'owner' ? { ...binding.owner, account: 'example-foreign-account' } : binding.owner,
        siteName: binding.siteName,
        siteUid: state.nodeFault === 'uid' ? 'foreign' : expected.siteUid,
        node: state.nodeFault === 'node' ? 'foreign' : expected.node,
        instanceId: state.nodeFault === 'instance' ? 'foreign' : expected.instances[expected.node],
        registration: state.nodeFault === 'registration' ? 'foreign' : `r-${binding.nodes.indexOf(expected.node)}`,
        scope: state.nodeFault === 'scope' ? 'every-node' : 'selected-node-vpm-readiness',
        fqdn: `${expected.node}.ce.example.test`,
        roles: ['k8s-master-primary'],
        softwareVersion: 'software-example',
        osVersion: 'os-example',
        vpmVersion: 'vpm-example',
        originalSampleFreshness: state.nodeFault === 'freshness' ? 'verified' : 'unqualified',
        allNodeHealthQualified: false,
        routingTrafficQualified: false,
        canSatisfyInterfaceMutationGate: state.nodeFault === 'gate',
        source: `/api/operate/namespaces/system/sites/${binding.siteName}/vpm/debug/${expected.node}/exec-user`,
        outputSha256: 'c'.repeat(64),
        bindingOutputSha256: 'd'.repeat(64),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        privateRaw: 'SECRET_SENTINEL',
      };
    },
    async observeBgpSessions(
      _binding: unknown,
      expected: Array<{ node: string; interfaceName: string; peerAddress: string }>,
    ) {
      state.bgpCalls++;
      const sessions = expected.map((row) => ({
        ...row,
        state: 'Established',
        receivedPrefixCount: 1,
        advertisedPrefixCount: 1,
        stateChangedAt: '2020-01-01T00:00:00Z',
        privateRaw: 'SECRET_SENTINEL',
      }));
      if (state.sessionsFault) sessions[0].interfaceName = 'foreign';
      return {
        owner: binding.owner,
        siteName: binding.siteName,
        status: 'healthy',
        establishedSessions: sessions.length,
        expectedSessions: expected.length,
        sessions,
        privateRaw: 'SECRET_SENTINEL',
      };
    },
    async observeBgpRoutes() {
      return {
        owner: binding.owner,
        siteName: binding.siteName,
        status: 'observed',
        nodes: binding.nodes.map((node) => ({
          node,
          routingInstances: [
            { name: 'global', tables: [{ name: 'inet', imported: ['10.250.0.10/32'], exported: [] }] },
          ],
        })),
        privateRaw: 'SECRET_SENTINEL',
      };
    },
  } as unknown as Runtime;
  const run = (active = false, signal?: AbortSignal) =>
    collectAzureNetworkOperationalReadings(plan, identity, runtime, f.api, store, signal, active);
  return { ...f, plan, identity, runtime, store, state, run };
}

for (const ha of [false, true])
  test(`Azure selected-node readiness joins ${ha ? 'HA' : 'single'} current VM/registration identity without promoting whole-site acceptance`, async () => {
    const f = await fixture(ha);
    f.state.nodeFault = 'ready';
    const result = await f.run();
    expect(result.nodeReadiness).toMatchObject({
      status: 'observed',
      readiness: 'ready',
      node: `${f.plan.deploymentName}-1`,
      scope: 'selected-node-vpm-readiness',
    });
    expect(result.nodeHealth).toBe('unknown');
    expect(f.state.nodeCalls).toBe(1);
    expect(f.state.writes).toBe(0);
    expect(f.mutations()).toBe(0);
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
  });

for (const fault of ['owner', 'uid', 'node', 'instance', 'registration', 'scope', 'freshness', 'gate', 'service'])
  test(`Azure ${fault} selected-node evidence remains unknown and cannot authorize traffic`, async () => {
    const f = await fixture(true, true);
    f.state.nodeFault = fault;
    const result = await f.run(true);
    expect(result.nodeReadiness.status).toBe('unknown');
    expect(result.traffic.status).toBe('unknown');
    expect(f.state.writes).toBe(0);
    expect(f.mutations()).toBe(0);
  });

test('Azure explicit selected-node not-ready state is preserved separately from interface state', async () => {
  const f = await fixture();
  f.state.nodeFault = 'not-ready';
  const result = await f.run();
  expect(result.nodeReadiness).toMatchObject({ status: 'observed', readiness: 'not-ready', state: 'FAILED' });
  expect(result.identity.status).toBe('observed');
  expect(result.nodeHealth).toBe('unknown');
});

test('Azure readings execute the real two-command node readiness observer with current inventory and registration bindings', async () => {
  const f = await fixture(true);
  const C = VerifiedCeContract as unknown as new (...args: unknown[]) => VerifiedCeContract;
  const schema = resolveCeSchemaFixture(compactSchema);
  const contract = new C(
    schema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    smsContract,
    schema.schemas,
    undefined,
    'published-release',
    undefined,
    nodeApi,
  );
  const commands: unknown[] = [];
  const node = `${f.plan.deploymentName}-1`;
  const runtime = new CeRuntime(contract, 'terraform', 'https://tenant.test', 'test-credential', async (url, init) => {
    expect(new URL(url).pathname).toBe(
      `/api/operate/namespaces/system/sites/${f.plan.siteName}/vpm/debug/${node}/exec-user`,
    );
    expect(init?.method).toBe('POST');
    const command = JSON.parse(String(init?.body));
    expect(command).toEqual({ command: ['health'] });
    commands.push(command);
    return Response.json({
      return_code: 0,
      output: JSON.stringify({
        hostname: node,
        fqdn: `${node}.ce.example.test`,
        state: 'PROVISIONED',
        roles: ['k8s-master-primary'],
        software_version: 'software-example',
        os_version: 'os-example',
        version: 'vpm-example',
      }),
    });
  });
  runtime.observeOwnedSite = f.runtime.observeOwnedSite.bind(f.runtime);
  runtime.observeRegistrations = f.runtime.observeRegistrations.bind(f.runtime);
  f.runtime.observeNodeReadiness = runtime.observeNodeReadiness.bind(runtime);
  const result = await f.run();
  expect(commands).toHaveLength(2);
  expect(result.nodeReadiness).toMatchObject({
    status: 'observed',
    readiness: 'ready',
    node,
    instanceId: f.identity.inventory.nodes['1'].vmId,
    registration: 'r-0',
    fqdn: `${node}.ce.example.test`,
  });
  expect(result.nodeHealth).toBe('unknown');
  expect(f.state.writes).toBe(0);
  expect(f.mutations()).toBe(0);
});
for (const ha of [false, true])
  test(`operational readings retain ${ha ? 'six' : 'two'} interfaces and genuine site-global scope without cloud or storage mutation`, async () => {
    const f = await fixture(ha),
      result = await f.run();
    expect(result.identity.interfaces).toHaveLength(ha ? 6 : 2);
    expect(result.siteHealth).toMatchObject({ status: 'healthy', scope: 'site-global-only', nodeHealth: 'unknown' });
    expect(result.nodeHealth).toBe('unknown');
    expect(result.routeExchange.status).toBe('not-applicable');
    expect(result.traffic).toEqual({ status: 'unknown', reason: 'active-probe-not-requested' });
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(JSON.stringify(result)).not.toContain('2020-01-01');
    expect(f.state.writes).toBe(0);
    expect(f.mutations()).toBe(0);
  });
test('operational readings preserve explicit interface down independently of healthy site-global health', async () => {
  const f = await fixture(true);
  f.state.down = true;
  f.state.qualified = true;
  const result = await f.run();
  expect(result.identity).toMatchObject({
    status: 'down',
    freshness: 'verified',
    canSatisfyInterfaceMutationGate: false,
  });
  expect(result.siteHealth.status).toBe('healthy');
  expect(result.nodeHealth).toBe('unknown');
});
for (const fault of ['owner', 'uid', 'scope', 'state', 'service'])
  test(`operational readings keep ${fault} site health unknown while preserving independent interfaces`, async () => {
    const f = await fixture();
    f.state.healthFault = fault;
    const result = await f.run();
    expect(result.identity.status).toBe('observed');
    expect(result.siteHealth.status).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(f.state.writes).toBe(0);
  });
for (const down of [false, true])
  test(`active traffic collection cannot bypass ${down ? 'down' : 'unqualified up'} interface admission`, async () => {
    const f = await fixture(true, true);
    f.state.down = down;
    f.state.qualified = down;
    const result = await f.run(true);
    expect(result.traffic).toEqual({ status: 'unknown', reason: 'interface-up-admission-unverified' });
    expect(f.state.writes).toBe(0);
    expect(f.mutations()).toBe(0);
  });
test('operational readings reject changed final cloud identity after component collection', async () => {
  const f = await fixture();
  f.state.changedFinal = true;
  await expect(f.run()).rejects.toThrow('Operational reading identity differs');
  expect(f.state.writes).toBe(0);
});
test('operational readings reject wrong engine before observation and bound cancellation even when health ignores it', async () => {
  const f = await fixture();
  Object.defineProperty(f.runtime, 'engine', { value: 'native' });
  await expect(f.run()).rejects.toThrow('Operational reading identity differs');
  expect(f.state.healthCalls).toBe(0);
  Object.defineProperty(f.runtime, 'engine', { value: 'terraform' });
  f.runtime.observeHealth = () => new Promise(() => {});
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(Error('cancelled')), 20);
  try {
    await expect(f.run(false, controller.signal)).rejects.toThrow('cancelled');
  } finally {
    clearTimeout(timer);
  }
});
for (const ha of [false, true])
  test(`operational readings join ${ha ? 'six' : 'two'} generated-interface BGP peers and both Route Server roles`, async () => {
    const f = await fixture(ha, false, true),
      result = await f.run();
    expect(result.routeExchange.status).toBe('healthy');
    expect(result.sessions).toMatchObject({
      status: 'healthy',
      expectedSessions: ha ? 6 : 2,
      establishedSessions: ha ? 6 : 2,
      originalSampleFreshness: 'unqualified',
    });
    expect(result.routes).toMatchObject({
      status: 'observed',
      scope: 'bgp-route-inventory',
      forwardingAcceptance: 'unknown',
    });
    expect(result.nodeHealth).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(f.mutations()).toBe(0);
  });
test('partial Route Server exchange and foreign generated BGP interfaces cannot produce healthy session readings', async () => {
  const f = await fixture(true, false, true);
  f.state.routeFault = true;
  const partial = await f.run();
  expect(partial.routeExchange.status).toBe('unknown');
  expect(partial.sessions.status).toBe('unknown');
  expect(f.state.bgpCalls).toBe(0);
  f.state.routeFault = false;
  f.state.sessionsFault = true;
  expect((await f.run()).sessions.status).toBe('unknown');
});
test('qualified complete up readings execute the actual current traffic collector and retain its challenged private receipt', async () => {
  const f = await fixture(false, true),
    probe = await createIngressHistoryFixture('terraform', f.plan);
  f.state.qualified = true;
  const exec = f.api.exec;
  const http = f.plan.intent.ingress;
  if (http?.mode !== 'platform-http') throw Error('HTTP fixture missing');
  const sourceNic =
    `/subscriptions/${f.plan.subscription.id}/resourceGroups/rg-app/providers/Microsoft.Network/networkInterfaces/probe-nic`.toLowerCase();
  f.api.exec = (command, args, options) =>
    args.includes(http.probe.sourceVmResourceId) ||
    args.includes(sourceNic) ||
    (args[0] === 'vm' && args[1] === 'run-command')
      ? probe.api.exec(command, args)
      : exec.call(f.api, command, args, options);
  try {
    const result = await f.run(true);
    expect(result.traffic).toMatchObject({
      status: 'healthy',
      scope: 'reviewed-vm-http-content-probe',
      planSha256: f.plan.planSha256,
    });
    const key = String(result.traffic.checkpointKey),
      receipt = await f.store.read(`${key}-current-sample.json`);
    expect(receipt).toMatchObject({ status: 'healthy', owner: f.store.owner, planSha256: f.plan.planSha256 });
    expect(f.state.writes).toBeGreaterThan(0);
    expect(result.nodeHealth).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('never-retain');
  } finally {
    await probe.cleanup();
  }
});
test('changed runtime callbacks during collection reject before active traffic or storage writes', async () => {
  const f = await fixture(false, true);
  f.state.qualified = true;
  const health = f.runtime.observeHealth.bind(f.runtime);
  f.runtime.observeHealth = async (...args) => {
    const value = await health(...args);
    f.runtime.observeAzureInterfaces = async () => {
      throw Error('replacement must not execute');
    };
    return value;
  };
  await expect(f.run(true)).rejects.toThrow('Operational reading identity differs');
  expect(f.state.writes).toBe(0);
  expect(f.mutations()).toBe(0);
});

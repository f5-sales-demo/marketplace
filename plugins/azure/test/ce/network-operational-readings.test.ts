import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeForwardingRoutes } from '../../../platform/src/ce/forwarding-route';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { ExpectedCeNodeHealthIdentity } from '../../../platform/src/ce/node-health';
import { CeRuntime } from '../../../platform/src/ce/runtime';
import { VerifiedCeContract } from '../../../platform/src/ce/verified-contract';
import forwardingApi from '../../../platform/test/fixtures/forwarding-route-schema.json';
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
    forwardingCalls: 0,
    forwardingFault: '',
    effectiveCalls: 0,
    effectiveFault: '',
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
  const cloudExec = f.api.exec;
  f.api.exec = async (command, args, options) => {
    if (args.includes('show-effective-route-table')) {
      state.effectiveCalls++;
      const resourceId = args[args.indexOf('--ids') + 1];
      expect(command).toBe('az');
      expect(
        Object.values(identity.inventory.nodes[String(identity.node)].nics).some(
          (nic) => nic.resourceId === resourceId,
        ),
      ).toBe(true);
      if (state.effectiveFault === 'service') return { exitCode: 1, stdout: '', stderr: 'SECRET_SENTINEL' };
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          value: [
            {
              source: 'User',
              state: state.effectiveFault === 'invalid' ? 'Invalid' : 'Active',
              addressPrefix: ['10.253.0.0/24'],
              nextHopIpAddress: ['10.20.1.5'],
              nextHopType: 'VirtualAppliance',
            },
          ],
        }),
      };
    }
    return cloudExec.call(f.api, command, args, options);
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
    async observeForwardingRoutes(_binding: unknown, wanted: ExpectedCeForwardingRoutes) {
      state.forwardingCalls++;
      if (state.forwardingFault === 'service') throw Error('SECRET_SENTINEL');
      const routes = wanted.routes.map((row) => {
        const iface = wanted.interfaces.find((v) => v.node === row.node && v.role === row.role);
        if (!iface) throw Error('Forwarding fixture interface missing');
        return {
          ...row,
          flags: [] as string[],
          interfaces: [
            {
              ...iface,
              kind: 'local',
              reportedInterface: iface.device,
              matchedFields: ['device'],
              privateRaw: 'SECRET_SENTINEL',
            },
          ],
          privateRaw: 'SECRET_SENTINEL',
        };
      });
      const reads = wanted.interfaces.map((v) => ({
        method: 'POST',
        path: `/api/operate/namespaces/system/sites/${binding.siteName}/ver/simplified_routes`,
        body: { namespace: 'system', site: binding.siteName, node: v.node, family: 'INET4', [v.role]: {} },
      }));
      const value = {
        owner: binding.owner,
        siteName: binding.siteName,
        siteUid: wanted.siteUid,
        contractFingerprint: `sha256:${'f'.repeat(64)}`,
        status: 'observed',
        scope: 'reported-forwarding-interface',
        interfaceNamespace: 'unqualified',
        freshness: 'unqualified',
        operationalAcceptance: 'unknown',
        collectedAt: '2020-01-01T00:00:00Z',
        routes,
        reads,
        privateRaw: 'SECRET_SENTINEL',
      };
      const fault = state.forwardingFault;
      if (fault === 'owner') value.owner = { ...binding.owner, account: 'example-foreign-account' };
      if (fault === 'uid') value.siteUid = 'foreign';
      if (fault === 'fingerprint') value.contractFingerprint = 'not-a-digest';
      if (fault === 'scope') value.scope = 'qualified-forwarding';
      if (fault === 'namespace') value.interfaceNamespace = 'verified';
      if (fault === 'freshness') value.freshness = 'verified';
      if (fault === 'acceptance') value.operationalAcceptance = 'verified';
      if (fault === 'partial') value.routes.pop();
      if (fault === 'duplicate') value.routes[1] = value.routes[0];
      if (['node', 'role', 'prefix', 'routeType'].includes(fault))
        Object.assign(value.routes[0], { [fault]: 'foreign' });
      if (['mac', 'device', 'interfaceName', 'reportedInterface', 'kind'].includes(fault))
        Object.assign(value.routes[0].interfaces[0], { [fault]: 'foreign' });
      if (fault === 'matchedFields') value.routes[0].interfaces[0].matchedFields = ['interfaceName'];
      if (fault === 'request') value.reads[0].body.node = 'foreign';
      if (fault === 'change' && state.forwardingCalls > 1) value.routes[0].flags = ['changed'];
      return value;
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
  const forwarding = (): ExpectedCeForwardingRoutes => {
    const interfaces = binding.nodes.flatMap((node, index) =>
      (['slo', 'sli'] as const).map((role, nicIndex) => ({
        node,
        role,
        mac: identity.inventory.nodes[String(index + 1)].nics[String(nicIndex)].mac,
        device: nicIndex ? 'eth1' : 'eth0',
        interfaceName: `${node}-${role}`,
      })),
    );
    return {
      siteUid: identity.siteUid,
      interfaces,
      routes: interfaces.map((v, index) => ({
        node: v.node,
        role: v.role,
        prefix: `10.${index + 1}.0.0/16`,
        routeType: 'STATIC_ROUTE',
      })),
    };
  };
  const run = (active = false, signal?: AbortSignal, reviewed?: ExpectedCeForwardingRoutes) =>
    collectAzureNetworkOperationalReadings(plan, identity, runtime, f.api, store, signal, active, reviewed);
  return { ...f, plan, identity, runtime, store, state, run, forwarding };
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

for (const ha of [false, true])
  test(`operational readings acquire ${ha ? 'six' : 'two'} reviewed CE forwarding identities and selected-node NIC route inventories without qualifying forwarding`, async () => {
    const f = await fixture(ha),
      result = await f.run(false, undefined, f.forwarding());
    expect(result.forwarding).toMatchObject({
      status: 'observed',
      scope: 'reported-forwarding-interface',
      interfaceNamespace: 'unqualified',
      freshness: 'unqualified',
      operationalAcceptance: 'unknown',
      routeCount: ha ? 6 : 2,
    });
    expect(result.effectiveRoutes).toMatchObject({
      status: 'observed',
      scope: 'selected-node-azure-effective-route-inventories',
      node: 1,
      forwarding: 'unknown',
      freshness: 'unqualified',
    });
    expect(result.effectiveRoutes.nics).toHaveLength(2);
    expect(f.state.forwardingCalls).toBe(2);
    expect(f.state.effectiveCalls).toBe(4);
    expect(result.nodeHealth).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(JSON.stringify(result)).not.toContain('2020-01-01');
    expect(f.state.writes).toBe(0);
    expect(f.mutations()).toBe(0);
  });
for (const fault of [
  'owner',
  'uid',
  'scope',
  'namespace',
  'fingerprint',
  'freshness',
  'acceptance',
  'partial',
  'duplicate',
  'node',
  'role',
  'prefix',
  'routeType',
  'mac',
  'device',
  'interfaceName',
  'reportedInterface',
  'kind',
  'matchedFields',
  'request',
  'service',
  'change',
])
  test(`operational readings reject ${fault} forwarding evidence independently of NIC inventory`, async () => {
    const f = await fixture(true);
    f.state.forwardingFault = fault;
    const result = await f.run(false, undefined, f.forwarding());
    expect(result.forwarding.status).toBe('unknown');
    expect(result.effectiveRoutes.status).toBe('observed');
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(f.state.writes).toBe(0);
    expect(f.mutations()).toBe(0);
  });
test('missing reviewed route expectations cannot be synthesized from returned routes', async () => {
  const f = await fixture(true),
    result = await f.run();
  expect(result.forwarding).toEqual({ status: 'unknown', reason: 'reviewed-forwarding-expectations-unavailable' });
  expect(f.state.forwardingCalls).toBe(0);
  expect(result.effectiveRoutes.status).toBe('observed');
});
for (const fault of ['siteUid', 'mac', 'partial'])
  test(`reviewed ${fault} scope must match complete current interfaces before any forwarding request`, async () => {
    const f = await fixture(true),
      reviewed = f.forwarding();
    if (fault === 'siteUid') reviewed.siteUid = 'foreign';
    else if (fault === 'mac') reviewed.interfaces[0].mac = '02:00:00:00:00:99';
    else reviewed.interfaces.pop();
    expect((await f.run(false, undefined, reviewed)).forwarding.status).toBe('unknown');
    expect(f.state.forwardingCalls).toBe(0);
  });
for (const fault of ['service', 'invalid'])
  test(`effective-route ${fault} stays distinct from CE forwarding and link state`, async () => {
    const f = await fixture();
    f.state.effectiveFault = fault;
    const result = await f.run(false, undefined, f.forwarding());
    expect(result.forwarding.status).toBe('observed');
    expect(result.effectiveRoutes.status).toBe(fault === 'service' ? 'unknown' : 'observed');
    if (fault === 'invalid')
      expect(
        result.effectiveRoutes.nics.every(
          (row) => 'invalidRoutes' in row && row.invalidRoutes === 1 && row.activeRoutes === 0,
        ),
      ).toBe(true);
    expect(result.identity.status).toBe('observed');
    expect(result.nodeHealth).toBe('unknown');
  });
test('Azure forwarding readings execute the actual mapped public CE observation requests', async () => {
  const f = await fixture(true),
    expected = f.forwarding(),
    binding = azureUpgradeBinding(f.plan),
    schema = resolveCeSchemaFixture(compactSchema);
  const C = VerifiedCeContract as unknown as new (...args: unknown[]) => VerifiedCeContract;
  const contract = new C(
    schema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    smsContract,
    schema.schemas,
    undefined,
    'published-release',
    undefined,
    forwardingApi,
  );
  const requests: unknown[] = [];
  const real = new CeRuntime(
    contract,
    'terraform',
    'https://tenant.example.test',
    'fixture-credential',
    async (url, init) => {
      const path = new URL(url).pathname;
      if (path.includes('securemesh_site_v2s'))
        return Response.json({
          metadata: {
            name: binding.siteName,
            namespace: 'system',
            labels: {
              'xcsh-ce-deployment': binding.owner.deploymentId,
              'xcsh-ce-engine': 'terraform',
              'xcsh-ce-provider': 'azure',
              'xcsh-ce-account': binding.owner.account,
              'xcsh-ce-region': binding.owner.region,
            },
          },
          system_metadata: { uid: expected.siteUid },
        });
      expect(init?.method).toBe('POST');
      expect(path).toBe(`/api/operate/namespaces/system/sites/${binding.siteName}/ver/simplified_routes`);
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const role = body.slo ? 'slo' : 'sli',
        wanted = expected.routes.find((row) => row.node === body.node && row.role === role),
        iface = expected.interfaces.find((row) => row.node === body.node && row.role === role);
      if (!wanted || !iface) throw Error('Forwarding fixture route or interface missing');
      return Response.json({
        ver_routes: [
          {
            node: body.node,
            route: [
              {
                prefix: wanted.prefix,
                route_type: wanted.routeType,
                flags: [],
                nexthop: { local: { interface: iface.device } },
              },
            ],
          },
        ],
      });
    },
  );
  f.runtime.observeForwardingRoutes = real.observeForwardingRoutes.bind(real);
  const result = await f.run(false, undefined, expected);
  expect(result.forwarding.status).toBe('observed');
  expect(requests).toHaveLength(12);
  expect(result.forwarding.operationalAcceptance).toBe('unknown');
  expect(f.mutations()).toBe(0);
});

test('changed reviewed route expectations reject before traffic or storage writes', async () => {
  const f = await fixture(false, true),
    reviewed = f.forwarding(),
    observe = f.runtime.observeForwardingRoutes.bind(f.runtime);
  f.state.qualified = true;
  f.runtime.observeForwardingRoutes = async (...args) => {
    const result = await observe(...args);
    reviewed.routes[0].prefix = '10.99.0.0/16';
    return result;
  };
  await expect(f.run(true, undefined, reviewed)).rejects.toThrow('Operational reading identity differs');
  expect(f.state.writes).toBe(0);
});
for (const component of ['forwarding', 'effective-routes'])
  test(`caller cancellation bounds a ${component} transport that ignores cancellation`, async () => {
    const f = await fixture(),
      controller = new AbortController();
    if (component === 'forwarding')
      f.runtime.observeForwardingRoutes = () => {
        controller.abort(Error('cancel-forwarding'));
        return new Promise(() => {});
      };
    else {
      const exec = f.api.exec;
      f.api.exec = (command, args, options) => {
        if (args.includes('show-effective-route-table')) {
          controller.abort(Error('cancel-effective'));
          return new Promise(() => {});
        }
        return exec.call(f.api, command, args, options);
      };
    }
    await expect(f.run(false, controller.signal, f.forwarding())).rejects.toThrow(
      component === 'forwarding' ? 'cancel-forwarding' : 'cancel-effective',
    );
    expect(f.state.writes).toBe(0);
    expect(f.mutations()).toBe(0);
  });

import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import {
  azureFailoverOwner,
  buildAzureCeFailoverPlan,
  requireAzureFailoverExecutionContract,
  runAzureCeFailover,
} from '../../src/ce/failover';
import { compileAzureCePlan } from '../../src/ce/planner';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

function fixture(engine: 'native' | 'terraform' = 'native') {
  const sourceVmResourceId =
    `/subscriptions/${intent.subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const selected = structuredClone(intent);
  selected.engine = engine;
  selected.topology.ha = true;
  selected.routing = { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 };
  selected.nics = ['slo', 'data', 'sli'].map((role, index) => ({
    name: ['mgmt', 'external', 'internal'][index],
    role: role as 'slo' | 'data' | 'sli',
    subnet: { mode: 'greenfield', name: `nic${index}`, cidr: `10.20.${index}.0/24` },
  }));
  selected.ingress = {
    mode: 'platform-http',
    port: 8080,
    listener: {
      name: 'ce-listener',
      namespace: 'system',
      domain: 'ce.example.invalid',
      privateAddress: '10.20.2.10',
      originPool: { name: 'ce-origin', namespace: 'system' },
    },
    probe: { sourceVmResourceId, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
  };
  selected.brownfield.resourceIds = [sourceVmResourceId];
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  observed.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  const plan = compileAzureCePlan(selected, observed);
  const vmResourceId = plan.actions.find((action) => action.kind === 'vm-create' && action.node === 1)?.resourceId;
  if (!vmResourceId) throw new Error('missing failover VM');
  const failover = buildAzureCeFailoverPlan(plan, {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: plan.subscription.id,
    region: plan.region,
    engine,
    deploymentId: plan.deploymentName,
    sourcePlanSha256: plan.planSha256,
    nodeIndex: 1,
    vmResourceId,
    vmId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    powerState: 'running',
    observedAt: '2026-09-10T12:00:00Z',
  });
  const routing = {
    kind: 'bgp' as const,
    name: 'ce-demo-route-server-bgp',
    uid: 'routing-uid',
    siteName: plan.siteName,
    siteUid: 'site-uid',
    owner: azureFailoverOwner(plan),
    localAsn: 64512,
    remoteAsn: 65515 as const,
    interfaces: [1, 2, 3].map((node) => ({ node: `${plan.deploymentName}-${node}`, interfaceName: `slo-${node}` })),
    expectedSessions: 6 as const,
    routeServerAddresses: ['10.255.0.4', '10.255.0.5'] as [string, string],
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
  };
  return { plan, failover, routing };
}

test('binds failover to the exact six-session routing checkpoint', () => {
  const f = fixture();
  expect(requireAzureFailoverExecutionContract(f.plan, f.failover, f.routing)).toEqual(f.routing);
  for (const change of [
    (value: typeof f.routing) => value.interfaces.reverse(),
    (value: typeof f.routing) => value.routeServerAddresses.splice(1, 1),
    (value: typeof f.routing) => (value.owner.engine = 'terraform'),
    (value: typeof f.routing) => (value.expectedSessions = 4 as never),
  ]) {
    const value = structuredClone(f.routing);
    change(value);
    expect(() => requireAzureFailoverExecutionContract(f.plan, f.failover, value)).toThrow(/routing checkpoint/);
  }
});

test('persists baseline, mutation intent, outage and recovery in exact order', async () => {
  const f = fixture();
  const root = await mkdtemp(join(tmpdir(), 'azure-failover-core-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
  let state: 'running' | 'deallocated' = 'running';
  const events: string[] = [];
  const result = await runAzureCeFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    storage,
    async () => {
      events.push(`observe:${state}`);
      return state;
    },
    async (phase) => {
      events.push(`mutate:${phase}`);
      state = phase === 'stop' ? 'deallocated' : 'running';
    },
    async (phase) => {
      events.push(`collect:${phase}`);
      return { acceptance: 'passed' };
    },
    async () => {
      events.push('release');
    },
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {} },
  );
  expect(result).toMatchObject({ status: 'failover-complete', sessionSequence: [6, 4, 6], traffic: 'healthy' });
  expect(events).toEqual([
    'collect:baseline',
    'observe:running',
    'mutate:stop',
    'observe:deallocated',
    'collect:outage',
    'observe:deallocated',
    'mutate:start',
    'observe:running',
    'collect:recovered',
    'release',
  ]);
});

test('reconciles a crash after mutation without replaying an already-complete request', async () => {
  const f = fixture();
  const root = await mkdtemp(join(tmpdir(), 'azure-failover-crash-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
  let state: 'running' | 'deallocated' = 'running';
  let stops = 0;
  let fail = true;
  const run = () =>
    runAzureCeFailover(
      f.plan,
      f.failover,
      f.failover.planSha256,
      storage,
      async () => state,
      async (phase) => {
        state = phase === 'stop' ? 'deallocated' : 'running';
        if (phase === 'stop') stops++;
        if (phase === 'stop' && fail) {
          fail = false;
          throw new Error('lost response');
        }
      },
      async () => ({ acceptance: 'passed' }),
      async () => {},
      undefined,
      { attempts: 1, intervalMs: 0, wait: async () => {} },
    );
  await expect(run()).rejects.toThrow('lost response');
  await expect(run()).resolves.toMatchObject({ status: 'failover-complete' });
  expect(stops).toBe(1);
});

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
  validateAzureFailoverCheckpoint,
  validateAzureFailoverReceipt,
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

for (const boundary of ['before-receipt', 'after-receipt', 'before-complete', 'after-complete'] as const)
  test(`failover completion resumes ${boundary} publication without replacing its receipt`, async () => {
    const f = fixture();
    const root = await mkdtemp(join(tmpdir(), 'azure-failover-publish-'));
    directories.push(root);
    const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
    let state: 'running' | 'deallocated' = 'running',
      releases = 0,
      failed = false;
    const write = storage.write.bind(storage);
    storage.write = async (name, value) => {
      const target = boundary.includes('receipt')
        ? name.endsWith('-receipt.json')
        : (value as { phase?: string }).phase === 'complete';
      if (target && !failed) {
        failed = true;
        if (boundary.startsWith('after-')) await write(name, value);
        throw Error('interrupted publication');
      }
      return write(name, value);
    };
    const run = () =>
      runAzureCeFailover(
        f.plan,
        f.failover,
        f.failover.planSha256,
        storage,
        async () => state,
        async (phase) => {
          state = phase === 'stop' ? 'deallocated' : 'running';
        },
        async () => ({ acceptance: 'passed' }),
        async () => {
          releases++;
        },
        undefined,
        { attempts: 1, intervalMs: 0, wait: async () => {} },
      );
    await expect(run()).rejects.toThrow('interrupted publication');
    let original: unknown;
    try {
      original = await storage.read(`${f.failover.planId}-receipt.json`);
    } catch {}
    const result = await run();
    const repeated = await run();
    expect(repeated).toEqual(result);
    if (original) expect(result as unknown).toEqual(original);
    expect(releases).toBe(boundary === 'before-receipt' ? 2 : 1);
    expect(((await storage.read(`${f.failover.planId}-checkpoint.json`)) as { phase: string }).phase).toBe('complete');
  });

for (const boundary of ['collect', 'observe', 'mutate', 'release'] as const)
  test(`ignored failover ${boundary} cancellation cannot advance publication`, async () => {
    const f = fixture();
    const root = await mkdtemp(join(tmpdir(), 'azure-failover-cancel-'));
    directories.push(root);
    const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
    const abort = new AbortController();
    let state: 'running' | 'deallocated' = 'running',
      mutations = 0;
    await expect(
      runAzureCeFailover(
        f.plan,
        f.failover,
        f.failover.planSha256,
        storage,
        async () => {
          if (boundary === 'observe') abort.abort(Error('ignored cancellation'));
          return state;
        },
        async (phase) => {
          mutations++;
          state = phase === 'stop' ? 'deallocated' : 'running';
          if (boundary === 'mutate') abort.abort(Error('ignored cancellation'));
        },
        async () => {
          if (boundary === 'collect') abort.abort(Error('ignored cancellation'));
          return { acceptance: 'passed' };
        },
        async () => {
          if (boundary === 'release') abort.abort(Error('ignored cancellation'));
        },
        abort.signal,
        { attempts: 1, intervalMs: 0, wait: async () => {} },
      ),
    ).rejects.toThrow('ignored cancellation');
    await expect(storage.read(`${f.failover.planId}-receipt.json`)).rejects.toThrow();
    if (['collect', 'observe'].includes(boundary)) expect(mutations).toBe(0);
    const checkpoint = (await storage.read(`${f.failover.planId}-checkpoint.json`)) as { phase: string };
    expect(checkpoint.phase).not.toBe('complete');
  });

test('failover checkpoint and receipt validators reject extra, foreign, future and impossible records', () => {
  const f = fixture();
  const checkpoint = {
    schemaVersion: 1,
    engine: 'native',
    sourcePlanSha256: f.plan.planSha256,
    failoverPlanSha256: f.failover.planSha256,
    phase: 'baseline',
  };
  const receipt = {
    status: 'failover-complete',
    engine: 'native',
    planId: f.failover.planId,
    planSha256: f.failover.planSha256,
    nodeIndex: f.failover.nodeIndex,
    sessionSequence: [6, 4, 6],
    traffic: 'healthy',
    observedAt: new Date().toISOString(),
  };
  expect(checkpoint).toEqual(validateAzureFailoverCheckpoint(f.plan, f.failover, checkpoint));
  expect(receipt as unknown).toEqual(validateAzureFailoverReceipt(f.plan, f.failover, receipt));
  for (const changed of [
    { ...checkpoint, extra: true },
    { ...checkpoint, engine: 'terraform' },
    { ...checkpoint, pending: { phase: 'baseline', requestSha256: 'f'.repeat(64) } },
    { ...checkpoint, phase: 'release', pending: { phase: 'stop', requestSha256: 'f'.repeat(64) } },
  ])
    expect(() => validateAzureFailoverCheckpoint(f.plan, f.failover, changed)).toThrow();
  for (const changed of [
    { ...receipt, extra: true },
    { ...receipt, nodeIndex: 3 },
    { ...receipt, observedAt: '2999-01-01T00:00:00Z' },
    { ...receipt, sessionSequence: [4, 4, 4] },
  ])
    expect(() => validateAzureFailoverReceipt(f.plan, f.failover, changed)).toThrow();
});

test('failover resume re-observes baseline before an unsubmitted stop mutation', async () => {
  const f = fixture();
  const root = await mkdtemp(join(tmpdir(), 'azure-failover-baseline-resume-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
  const write = storage.write.bind(storage);
  let failed = false,
    baselineCalls = 0,
    mutations = 0;
  storage.write = async (name, value) => {
    await write(name, value);
    if (!failed && (value as { phase?: string }).phase === 'stop') {
      failed = true;
      throw Error('interrupt before stop');
    }
  };
  const run = () =>
    runAzureCeFailover(
      f.plan,
      f.failover,
      f.failover.planSha256,
      storage,
      async () => 'running',
      async () => {
        mutations++;
      },
      async (phase) => {
        if (phase === 'baseline') baselineCalls++;
        return { acceptance: baselineCalls === 1 ? 'passed' : 'unknown' };
      },
      undefined,
      undefined,
      { attempts: 1, intervalMs: 0, wait: async () => {} },
    );
  await expect(run()).rejects.toThrow('interrupt before stop');
  await expect(run()).rejects.toThrow('baseline convergence');
  expect(baselineCalls).toBe(2);
  expect(mutations).toBe(0);
});

for (const mode of ['missing-receipt', 'foreign-receipt', 'receipt-before-release'] as const)
  test(`failover resume rejects ${mode} without cloud mutation`, async () => {
    const f = fixture();
    const root = await mkdtemp(join(tmpdir(), 'azure-failover-forged-completion-'));
    directories.push(root);
    const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
    await storage.write(`${f.failover.planId}-checkpoint.json`, {
      schemaVersion: 1,
      engine: 'native',
      sourcePlanSha256: f.plan.planSha256,
      failoverPlanSha256: f.failover.planSha256,
      phase: mode === 'receipt-before-release' ? 'baseline' : 'complete',
    });
    if (mode !== 'missing-receipt')
      await storage.write(`${f.failover.planId}-receipt.json`, {
        status: 'failover-complete',
        engine: mode === 'foreign-receipt' ? 'terraform' : 'native',
        planId: f.failover.planId,
        planSha256: f.failover.planSha256,
        nodeIndex: f.failover.nodeIndex,
        sessionSequence: [6, 4, 6],
        traffic: 'healthy',
        observedAt: new Date().toISOString(),
      });
    let mutations = 0;
    await expect(
      runAzureCeFailover(
        f.plan,
        f.failover,
        f.failover.planSha256,
        storage,
        async () => 'running',
        async () => {
          mutations++;
        },
        async () => ({ acceptance: 'passed' }),
        undefined,
        undefined,
        { attempts: 1, intervalMs: 0, wait: async () => {} },
      ),
    ).rejects.toThrow();
    expect(mutations).toBe(0);
  });

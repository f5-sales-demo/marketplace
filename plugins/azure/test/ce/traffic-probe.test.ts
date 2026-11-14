import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBgpSessions } from '../../../platform/src/ce/bgp-evidence';
import { parseBgpRoutePaths, parseBgpRoutes } from '../../../platform/src/ce/bgp-route-evidence';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ArtifactRetirementReceipt } from '../../../terraform/src/artifact-retirement';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { independentRetirementFixture } from '../../../terraform/test/fixtures/independent-retirement';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureFailoverOwner, buildAzureCeFailoverPlan, runAzureCeFailover } from '../../src/ce/failover';
import {
  isAzureFailoverHistoricalArtifact,
  verifyAzureFailoverHistoricalArtifacts,
} from '../../src/ce/failover-artifact-provenance';
import { collectAzureFailoverTraffic, validateAzureFailoverTrafficHistory } from '../../src/ce/failover-traffic';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformFailoverDeployment } from '../../src/ce/terraform-failover';
import {
  qualifiedAzureTerraformFailoverStages,
  retireAzureTerraformFailoverStage,
} from '../../src/ce/terraform-failover-retirement';
import { retireAzureTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { validateAzureTrafficCheckpoint } from '../../src/ce/traffic-artifact-provenance';
import { collectAzureCurrentTrafficProbe, collectAzureTrafficProbe } from '../../src/ce/traffic-probe';
import { intent as baseIntent, observation as baseObservation, subscriptionId } from './fixtures';
import { prepareRelayParentRetirement } from './relay-parent-retirement-fixture';

function fixture(engine: 'native' | 'terraform' = 'native', ha = false) {
  const sourceVmResourceId =
    `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const nicResourceId =
    `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Network/networkInterfaces/probe-nic`.toLowerCase();
  const intent = structuredClone(baseIntent);
  intent.engine = engine;
  intent.topology.ha = ha;
  if (ha) intent.routing = { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 65010 };
  intent.nics = [
    { name: 'slo', role: 'slo', subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'slo' } },
    { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli' } },
  ];
  intent.ingress = {
    mode: 'platform-http',
    port: 8080,
    listener: {
      name: 'ce-listener',
      namespace: 'system',
      domain: 'ce.example.invalid',
      privateAddress: '10.20.1.10',
      originPool: { name: 'ce-origin', namespace: 'system' },
    },
    probe: {
      sourceVmResourceId,
      path: '/healthz',
      expectedStatus: 200,
      expectedBodySha256: '4'.repeat(64),
    },
  };
  intent.brownfield.resourceIds = [sourceVmResourceId];
  const observation = structuredClone(baseObservation);
  if (ha) observation.regions[0].quotaAvailable = 64;
  observation.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  const plan = compileAzureCePlan(intent, observation);
  const values = new Map<string, unknown>();
  const calls: string[][] = [];
  let probeOutput = `200 ${'4'.repeat(64)}\n`;
  let probeError = '';
  const api = {
    async exec(_command: string, args: string[]) {
      calls.push(args);
      const response =
        args[0] === 'account'
          ? {
              id: subscriptionId,
              tenantId: observation.subscription.tenantId,
              environmentName: 'AzureCloud',
              state: 'Enabled',
            }
          : args[0] === 'vm' && args[1] === 'show'
            ? {
                id: sourceVmResourceId,
                customData: 'secret-bootstrap-content',
                vmId: '33333333-3333-4333-8333-333333333333',
                location: plan.region,
                provisioningState: 'Succeeded',
                powerState: 'VM running',
                networkProfile: { networkInterfaces: [{ id: nicResourceId, primary: true }] },
              }
            : args[0] === 'network'
              ? {
                  id: nicResourceId,
                  provisioningState: 'Succeeded',
                  virtualMachine: { id: sourceVmResourceId },
                  ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.30.0.4' }],
                }
              : {
                  value: [
                    { code: 'ComponentStatus/StdOut/succeeded', message: probeOutput },
                    { code: 'ComponentStatus/StdErr/succeeded', message: probeError },
                  ],
                };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(response) };
    },
  };
  const storage = {
    async verify() {},
    async read(name: string) {
      if (!values.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(values.get(name));
    },
    async write(name: string, value: unknown) {
      values.set(name, structuredClone(value));
    },
  } as unknown as CeDeploymentStore;
  return {
    plan,
    values,
    calls,
    api,
    storage,
    setProbe(output: string, error = '') {
      probeOutput = output;
      probeError = error;
    },
  };
}

test('collects sanitized content-bound Azure Run Command evidence and resumes without another probe', async () => {
  const f = fixture();
  const first = await collectAzureTrafficProbe(f.plan, f.storage, f.api);
  const second = await collectAzureTrafficProbe(f.plan, f.storage, f.api);
  expect(first).toEqual(second);
  expect(first.status).toBe('healthy');
  const invokes = f.calls.filter((args) => args[0] === 'vm' && args[1] === 'run-command');
  expect(invokes).toHaveLength(1);
  expect(invokes[0]).toContain('RunShellScript');
  const saved = JSON.stringify(f.values.get('azure-traffic-probe.json'));
  expect(saved).not.toContain('curl');
  expect(saved).not.toContain('ComponentStatus');
});

test('retains only sanitized failed-attempt evidence and retries without manual repair', async () => {
  const f = fixture();
  f.setProbe(`503 ${'5'.repeat(64)}\n`, 'upstream unavailable');
  await expect(collectAzureTrafficProbe(f.plan, f.storage, f.api)).rejects.toThrow(/has not converged/i);
  const pending = f.values.get('azure-traffic-probe.json') as Record<string, unknown>;
  expect(pending.phase).toBe('ready');
  expect(JSON.stringify(pending)).not.toContain('upstream unavailable');
  f.setProbe(`200 ${'4'.repeat(64)}\n`);
  expect((await collectAzureTrafficProbe(f.plan, f.storage, f.api)).status).toBe('healthy');
  expect(f.calls.filter((args) => args[0] === 'vm' && args[1] === 'run-command')).toHaveLength(2);
});

test('rejects malformed Run Command output and forged persisted evidence', async () => {
  const malformed = fixture();
  malformed.setProbe('not-a-receipt');
  await expect(collectAzureTrafficProbe(malformed.plan, malformed.storage, malformed.api)).rejects.toThrow(
    /has not converged/i,
  );

  const forged = fixture();
  await collectAzureTrafficProbe(forged.plan, forged.storage, forged.api);
  const state = forged.values.get('azure-traffic-probe.json') as Record<string, unknown>;
  forged.values.set('azure-traffic-probe.json', {
    ...state,
    evidence: { ...(state.evidence as Record<string, unknown>), bodySha256: '5'.repeat(64) },
  });
  await expect(collectAzureTrafficProbe(forged.plan, forged.storage, forged.api)).rejects.toThrow(
    /Persisted Azure traffic evidence/i,
  );
});

test('retains replayable sanitized source attachment provenance', async () => {
  const f = fixture();
  await collectAzureTrafficProbe(f.plan, f.storage, f.api);
  const state = f.values.get('azure-traffic-probe.json') as Record<string, unknown>;
  expect(state.schemaVersion).toBe(2);
  expect(state.sourceIdentity).toBeDefined();
  const identity = state.sourceIdentity as Record<string, unknown>;
  expect((identity.account as Record<string, unknown>).id).toBe(f.plan.subscription.id);
  expect(state.sourceNicResourceId).toBe(
    (identity.vm as { networkProfile: { networkInterfaces: { id: string }[] } }).networkProfile.networkInterfaces[0].id,
  );
  expect(state.sourceVmResourceId).toBe((identity.nic as { virtualMachine: { id: string } }).virtualMachine.id);
});

for (const [label, mutate] of [
  [
    'secret field',
    (attempt: Record<string, unknown>) => {
      attempt.stderr = 'sensitive-content';
    },
  ],
  [
    'missing stderr flag',
    (attempt: Record<string, unknown>) => {
      delete attempt.stderrPresent;
    },
  ],
  [
    'invalid status',
    (attempt: Record<string, unknown>) => {
      attempt.httpStatus = 9999;
    },
  ],
  [
    'invalid digest',
    (attempt: Record<string, unknown>) => {
      attempt.bodySha256 = 'not-a-digest';
    },
  ],
  [
    'future timestamp',
    (attempt: Record<string, unknown>) => {
      attempt.observedAt = '2999-01-01T00:00:00Z';
    },
  ],
] as const) {
  test(`rejects persisted failed-attempt ${label} before another Run Command`, async () => {
    const f = fixture();
    f.setProbe(`503 ${'5'.repeat(64)}\n`, 'upstream unavailable');
    await expect(collectAzureTrafficProbe(f.plan, f.storage, f.api)).rejects.toThrow(/has not converged/i);
    const state = f.values.get('azure-traffic-probe.json') as Record<string, unknown>;
    mutate((state.attempts as Record<string, unknown>[])[0]);
    f.setProbe(`200 ${'4'.repeat(64)}\n`);
    await expect(collectAzureTrafficProbe(f.plan, f.storage, f.api)).rejects.toThrow(/checkpoint|traffic evidence/i);
    expect(f.calls.filter((args) => args[0] === 'vm' && args[1] === 'run-command')).toHaveLength(1);
  });
}

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} traffic checkpoint can revalidate historical joins without a cloud call`, async () => {
    const f = fixture(engine);
    const evidence = await collectAzureTrafficProbe(f.plan, f.storage, f.api);
    const checkpoint = f.values.get('azure-traffic-probe.json');
    const callCount = f.calls.length;
    expect(validateAzureTrafficCheckpoint(f.plan, checkpoint)).toEqual(evidence);
    expect(f.calls.length).toBe(callCount);
    expect(JSON.stringify(checkpoint)).not.toContain('secret-bootstrap-content');
    expect(JSON.stringify(checkpoint)).not.toContain('customData');
  });
}

for (const [label, mutate] of [
  [
    'foreign tenant',
    (s: Record<string, unknown>) => {
      (s.account as Record<string, unknown>).tenantId = 'example-foreign';
    },
  ],
  [
    'foreign NIC back reference',
    (s: Record<string, unknown>) => {
      (s.nic as { virtualMachine: { id: string } }).virtualMachine.id = 'foreign';
    },
  ],
  [
    'duplicate VM attachment',
    (s: Record<string, unknown>) => {
      const rows = (s.vm as { networkProfile: { networkInterfaces: Record<string, unknown>[] } }).networkProfile
        .networkInterfaces;
      rows.push({ ...rows[0], primary: false });
    },
  ],
  [
    'duplicate IP configuration',
    (s: Record<string, unknown>) => {
      const rows = (s.nic as { ipConfigurations: Record<string, unknown>[] }).ipConfigurations;
      rows.push({ ...rows[0], primary: false });
    },
  ],
  [
    'unexpected VM secret',
    (s: Record<string, unknown>) => {
      (s.vm as Record<string, unknown>).customData = 'secret';
    },
  ],
  [
    'foreign private address',
    (s: Record<string, unknown>) => {
      (s.nic as { ipConfigurations: { privateIPAddress: string }[] }).ipConfigurations[0].privateIPAddress =
        '10.30.0.5';
    },
  ],
] as const) {
  test(`rejects historical traffic source ${label}`, async () => {
    const f = fixture();
    await collectAzureTrafficProbe(f.plan, f.storage, f.api);
    const checkpoint = f.values.get('azure-traffic-probe.json') as Record<string, unknown>;
    mutate(checkpoint.sourceIdentity as Record<string, unknown>);
    expect(() => validateAzureTrafficCheckpoint(f.plan, checkpoint)).toThrow();
  });
}

test('rejects legacy, foreign-engine, missing identity and oversized attempt checkpoints', async () => {
  const f = fixture();
  await collectAzureTrafficProbe(f.plan, f.storage, f.api);
  const checkpoint = f.values.get('azure-traffic-probe.json') as Record<string, unknown>;
  for (const changed of [
    { ...checkpoint, schemaVersion: 1 },
    { ...checkpoint, engine: 'terraform' },
    { ...checkpoint, sourceIdentity: undefined },
    {
      ...checkpoint,
      attempts: Array.from({ length: 41 }, () => ({ stderrPresent: true, observedAt: checkpoint.sourceObservedAt })),
    },
    { ...checkpoint, phase: 'ready' },
    {
      ...checkpoint,
      evidence: { ...(checkpoint.evidence as Record<string, unknown>), observedAt: '2999-01-01T00:00:00Z' },
    },
  ])
    expect(() => validateAzureTrafficCheckpoint(f.plan, changed)).toThrow();
});

test('preserves curl no-response attempts without treating them as HTTP success', async () => {
  const f = fixture();
  f.setProbe(`000 ${'5'.repeat(64)}\n`, 'connection refused');
  await expect(collectAzureTrafficProbe(f.plan, f.storage, f.api)).rejects.toThrow(/has not converged/i);
  const checkpoint = f.values.get('azure-traffic-probe.json') as Record<string, unknown>;
  expect(validateAzureTrafficCheckpoint(f.plan, checkpoint)).toBeUndefined();
  const attempt = (checkpoint.attempts as Record<string, unknown>[])[0];
  expect(attempt.httpStatus).toBe(0);
  expect(JSON.stringify(checkpoint)).not.toContain('connection refused');
  attempt.httpStatus = 200;
  attempt.bodySha256 = '4'.repeat(64);
  attempt.stderrPresent = false;
  expect(() => validateAzureTrafficCheckpoint(f.plan, checkpoint)).toThrow();
});

test('ignored Run Command cancellation cannot persist completed traffic evidence', async () => {
  const f = fixture();
  const controller = new AbortController();
  const exec = f.api.exec.bind(f.api);
  f.api.exec = async (command, args) => {
    const result = await exec(command, args);
    if (args[0] === 'vm' && args[1] === 'run-command') controller.abort(Error('ignored cancellation'));
    return result;
  };
  await expect(collectAzureTrafficProbe(f.plan, f.storage, f.api, controller.signal)).rejects.toThrow(
    'ignored cancellation',
  );
  expect((f.values.get('azure-traffic-probe.json') as Record<string, unknown>).phase).toBe('ready');
});

async function freshFailoverTrafficFixture(engine: 'native' | 'terraform') {
  const f = fixture(engine, true);
  const selected = f.plan.actions.find((row) => row.kind === 'vm-create' && row.node === 2);
  if (!selected?.resourceId) throw Error('missing failover VM');
  const failover = buildAzureCeFailoverPlan(f.plan, {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: f.plan.subscription.id,
    region: f.plan.region,
    engine,
    deploymentId: f.plan.deploymentName,
    sourcePlanSha256: f.plan.planSha256,
    nodeIndex: 2,
    vmResourceId: selected.resourceId,
    vmId: '00000000-0000-4000-8000-000000000002',
    powerState: 'running',
    observedAt: new Date().toISOString(),
  });
  const root = await mkdtemp(join(tmpdir(), 'azure-failover-fresh-traffic-'));
  const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.plan));
  return { ...f, storage, failover, root };
}

test('failover phases always execute fresh traffic probes and preserve every historical checkpoint for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = await freshFailoverTrafficFixture(engine);
    try {
      const first = await collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
      const bytes = JSON.stringify(await f.storage.read(`${first.checkpointKey}.json`));
      f.setProbe(`503 ${'5'.repeat(64)}\n`, 'unavailable');
      await expect(collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api)).rejects.toThrow(
        'has not converged',
      );
      f.setProbe(`200 ${'4'.repeat(64)}\n`);
      const latest = await collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
      const outage = await collectAzureFailoverTraffic(f.plan, f.failover, 'outage', f.storage, f.api);
      expect(first.checkpointKey).not.toBe(latest.checkpointKey);
      expect(outage.checkpointKey).toContain('-outage-traffic-');
      expect(f.calls.filter((args) => args.includes('run-command'))).toHaveLength(4);
      expect(JSON.stringify(await f.storage.read(`${first.checkpointKey}.json`))).toBe(bytes);
      const name = `${f.failover.planId}-baseline-traffic-observations.json`;
      const ledger = (await f.storage.read(name)) as { observations: { checkpointKey: string }[] };
      expect(ledger.observations).toHaveLength(3);
      const checkpoints = new Map<string, unknown>();
      for (const row of ledger.observations)
        checkpoints.set(`${row.checkpointKey}.json`, await f.storage.read(`${row.checkpointKey}.json`));
      expect(validateAzureFailoverTrafficHistory(f.plan, f.failover, 'baseline', ledger, checkpoints)).toMatchObject({
        complete: 2,
        pending: 1,
      });
      expect(JSON.stringify(ledger)).not.toContain('unavailable');
      expect(latest.evidence.status).toBe('healthy');
    } finally {
      await rm(f.root, { recursive: true });
    }
  }
});

for (const boundary of ['before-ledger', 'after-ledger', 'before-complete', 'after-complete'] as const)
  test(`failover fresh traffic resumes ${boundary} publication with a new current probe`, async () => {
    const f = await freshFailoverTrafficFixture('native');
    try {
      const write = f.storage.write.bind(f.storage);
      let failed = false;
      f.storage.write = async (name, value) => {
        const complete = (value as { phase?: string }).phase === 'complete';
        const target = boundary.includes('ledger') ? name.endsWith('traffic-observations.json') : complete;
        if (target && !failed) {
          failed = true;
          if (boundary.startsWith('after-')) await write(name, value);
          throw Error('interrupted publication');
        }
        return write(name, value);
      };
      await expect(collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api)).rejects.toThrow(
        'interrupted',
      );
      const result = await collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
      expect(result.evidence.status).toBe('healthy');
      expect(f.calls.filter((args) => args.includes('run-command'))).toHaveLength(
        boundary.includes('complete') ? 2 : 1,
      );
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

for (const mode of [
  'foreign-owner',
  'foreign-plan',
  'wrong-phase',
  'duplicate',
  'future',
  'extra-field',
  'forged-checkpoint',
] as const)
  test(`failover traffic rejects ${mode} before another HTTP request`, async () => {
    const f = await freshFailoverTrafficFixture('native');
    try {
      const first = await collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
      const file = `${f.failover.planId}-baseline-traffic-observations.json`;
      const ledger = (await f.storage.read(file)) as Record<string, unknown> & {
        observations: Array<Record<string, unknown>>;
      };
      if (mode === 'foreign-owner') (f.storage.owner as { engine: string }).engine = 'terraform';
      if (mode === 'foreign-plan') ledger.sourcePlanSha256 = 'f'.repeat(64);
      if (mode === 'wrong-phase') ledger.phase = 'outage';
      if (mode === 'duplicate') ledger.observations.push(ledger.observations[0]);
      if (mode === 'future') ledger.observations[0].requestedAt = '2999-01-01T00:00:00Z';
      if (mode === 'extra-field') ledger.secret = 'must-not-appear';
      if (mode === 'forged-checkpoint') {
        const checkpoint = (await f.storage.read(`${first.checkpointKey}.json`)) as {
          evidence: { bodySha256: string };
        };
        checkpoint.evidence.bodySha256 = 'f'.repeat(64);
        await f.storage.write(`${first.checkpointKey}.json`, checkpoint);
      }
      if (mode !== 'foreign-owner') await f.storage.write(file, ledger);
      await expect(collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api)).rejects.toThrow();
      expect(f.calls.filter((args) => args.includes('run-command'))).toHaveLength(1);
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

test('cancelled fresh failover traffic preserves pending history without a completed receipt', async () => {
  const f = await freshFailoverTrafficFixture('native');
  try {
    const abort = new AbortController();
    const original = f.api.exec.bind(f.api);
    f.api.exec = async (command, args) => {
      const result = await original(command, args);
      if (args.includes('run-command')) abort.abort(Error('ignored fresh cancellation'));
      return result;
    };
    await expect(
      collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api, abort.signal),
    ).rejects.toThrow('ignored fresh cancellation');
    const history = (await f.storage.read(`${f.failover.planId}-baseline-traffic-observations.json`)) as {
      observations: { checkpointKey: string; checkpointSha256?: string }[];
    };
    expect(history.observations[0].checkpointSha256).toBeUndefined();
    const key = history.observations[0].checkpointKey;
    const checkpoint = await f.storage.read(`${key}.json`);
    expect(
      validateAzureFailoverTrafficHistory(
        f.plan,
        f.failover,
        'baseline',
        history,
        new Map([[`${key}.json`, checkpoint]]),
      ),
    ).toMatchObject({ complete: 0, pending: 1, currentTrafficQualified: false });
  } finally {
    await rm(f.root, { recursive: true });
  }
});

test('fresh failover traffic holds the phase lock through receipt publication', async () => {
  const f = await freshFailoverTrafficFixture('native');
  try {
    const entered = Promise.withResolvers<void>(),
      released = Promise.withResolvers<void>();
    const original = f.api.exec.bind(f.api);
    f.api.exec = async (command, args) => {
      if (args.includes('run-command')) {
        entered.resolve();
        await released.promise;
      }
      return original(command, args);
    };
    const first = collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
    await entered.promise;
    try {
      await expect(collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api)).rejects.toThrow(
        /lock|in progress/i,
      );
    } finally {
      released.resolve();
    }
    await first;
    await collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
    expect(f.calls.filter((args) => args.includes('run-command'))).toHaveLength(2);
  } finally {
    await rm(f.root, { recursive: true });
  }
});

async function failoverHistoryRecords(
  f: Pick<Awaited<ReturnType<typeof freshFailoverTrafficFixture>>, 'storage' | 'failover'>,
) {
  await f.storage.write(`${f.failover.planId}.json`, f.failover);
  const records = new Map<string, unknown>();
  for (const name of await readdir(f.storage.directory))
    if (isAzureFailoverHistoricalArtifact(name)) records.set(name, await f.storage.read(name));
  return records;
}

test('failover historical provenance accepts prepared and interrupted fresh traffic catalogs for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = await freshFailoverTrafficFixture(engine);
    try {
      await collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
      f.setProbe(`503 ${'5'.repeat(64)}\n`, 'private-failure');
      await expect(collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api)).rejects.toThrow();
      const records = await failoverHistoryRecords(f);
      const result = await verifyAzureFailoverHistoricalArtifacts(f.plan, 'owned-site', records);
      expect(result).toMatchObject({ plans: 1, histories: 1, checkpoints: 2, currentEvidenceQualified: false });
    } finally {
      await rm(f.root, { recursive: true });
    }
  }
});

for (const mode of [
  'missing-source',
  'foreign-source',
  'orphan-leaf',
  'missing-leaf',
  'changed-leaf',
  'foreign-phase',
  'duplicate-row',
  'unknown-name',
  'forged-completion',
  'unsubmitted-receipt',
] as const)
  test(`failover historical provenance rejects ${mode} atomically`, async () => {
    const f = await freshFailoverTrafficFixture('native');
    try {
      const traffic = await collectAzureFailoverTraffic(f.plan, f.failover, 'baseline', f.storage, f.api);
      const records = await failoverHistoryRecords(f);
      const historyName = `${f.failover.planId}-baseline-traffic-observations.json`;
      const history = records.get(historyName) as { phase: string; observations: unknown[] };
      if (mode === 'missing-source') records.delete(`${f.failover.planId}.json`);
      if (mode === 'foreign-source') records.set(`${f.failover.planId}.json`, { ...f.failover, engine: 'terraform' });
      if (mode === 'orphan-leaf') records.delete(historyName);
      if (mode === 'missing-leaf') records.delete(`${traffic.checkpointKey}.json`);
      if (mode === 'changed-leaf')
        Object.assign(records.get(`${traffic.checkpointKey}.json`) as object, { extra: 'foreign' });
      if (mode === 'foreign-phase') history.phase = 'outage';
      if (mode === 'duplicate-row') history.observations.push(history.observations[0]);
      if (mode === 'unknown-name') records.set(`${f.failover.planId}-future-success.json`, { status: 'success' });
      if (mode === 'forged-completion')
        records.set(`${f.failover.planId}-checkpoint.json`, {
          schemaVersion: 1,
          engine: 'native',
          sourcePlanSha256: f.plan.planSha256,
          failoverPlanSha256: f.failover.planSha256,
          phase: 'complete',
        });
      if (mode === 'unsubmitted-receipt')
        records.set(`${f.failover.planId}-receipt.json`, {
          status: 'failover-complete',
          engine: 'native',
          planId: f.failover.planId,
          planSha256: f.failover.planSha256,
          nodeIndex: 2,
          sessionSequence: [6, 4, 6],
          traffic: 'healthy',
          observedAt: new Date().toISOString(),
        });
      await expect(verifyAzureFailoverHistoricalArtifacts(f.plan, 'owned-site', records)).rejects.toThrow();
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

type HistoricalDirectPhase = {
  phase: string;
  trafficRequestedAt: string;
  sessions: ReturnType<typeof parseBgpSessions> & {
    owner: ReturnType<typeof azureFailoverOwner>;
    contractFingerprint: string;
  };
  effectiveRoutes: ReturnType<typeof parseBgpRoutes> & {
    siteName: string;
    pathInventory: Extract<ReturnType<typeof parseBgpRoutePaths>, { status: 'observed' }>;
  };
  routeServer: { peers: Array<{ peerIp: string }> };
};
async function completeFailoverHistoryFixture(engine: 'native' | 'terraform') {
  const f = await freshFailoverTrafficFixture(engine);
  const routing = {
    kind: 'bgp',
    name: 'failover-bgp',
    uid: 'routing-uid',
    siteName: f.plan.siteName,
    siteUid: 'owned-site',
    owner: azureFailoverOwner(f.plan),
    localAsn: f.plan.routing.localAsn,
    remoteAsn: 65515,
    interfaces: [1, 2, 3].map((index) => ({
      node: `${f.plan.deploymentName}-${index}`,
      interfaceName: `slo-${index}`,
    })),
    expectedSessions: 6,
    routeServerAddresses: ['10.255.0.4', '10.255.0.5'],
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
  };
  await f.storage.write('platform-routing.json', routing);
  await f.storage.write(`${f.failover.planId}.json`, f.failover);
  await f.storage.write(`${f.failover.planId}-authorization.json`, {
    schemaVersion: 1,
    engine,
    sourcePlanSha256: f.plan.planSha256,
    failoverPlanSha256: f.failover.planSha256,
    mutations: true,
  });
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const writePlan = async (phase: 'stop' | 'start' | 'release', final = false) => {
    const deployment = await azureTerraformFailoverDeployment(f.plan, f.failover, phase);
    const changes = final
      ? []
      : [
          {
            address: 'azapi_resource_action.ce_failover',
            type: 'azapi_resource_action',
            actions: [phase === 'stop' ? 'create' : phase === 'start' ? 'update' : 'delete'],
          },
        ];
    await f.storage.write(`${f.failover.planId}-${final ? 'final' : phase}-plan.json`, {
      schemaVersion: 1,
      deploymentId: f.plan.deploymentName,
      engine,
      backendIdentity: deployment.backendIdentity,
      configurationSha256: digest(deployment.configuration),
      providerLockSha256: digest(deployment.providerLock),
      planSha256: digest(`${phase}:${final}`),
      noChanges: final,
      changes,
    });
  };
  let state: 'running' | 'deallocated' = 'running';
  await runAzureCeFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.storage,
    async () => state,
    async (phase) => {
      if (engine === 'terraform') await writePlan(phase);
      state = phase === 'stop' ? 'deallocated' : 'running';
    },
    async (phase) => {
      const interfaces = routing.interfaces.filter(
        (row) => phase !== 'outage' || row.node !== `${f.plan.deploymentName}-2`,
      );
      const expected = interfaces.flatMap((row) =>
        routing.routeServerAddresses.map((peerAddress) => ({ ...row, peerAddress })),
      );
      const wire = {
        ver: interfaces.map((row) => ({
          name: row.node,
          peer: routing.routeServerAddresses.map((peerAddress) => ({
            interface_name: row.interfaceName,
            peer_address: { ipv4: { addr: peerAddress } },
            protocol_status: 'Established',
            received_prefix_count: 1,
            advertised_prefix_count: 1,
            up_down_timestamp: '2026-09-10T12:00:00Z',
          })),
          ri_table: [
            {
              routing_instance: 'opaque-ri',
              rt_table: [
                {
                  name: 'opaque-table',
                  imported: [],
                  exported: f.plan.routing.destinationCidrs.map((subnet) => ({
                    subnet,
                    path: [{ peer: row.interfaceName, nh: ['10.255.0.4'] }],
                  })),
                },
              ],
            },
          ],
        })),
      };
      const meta = {
        owner: routing.owner,
        siteName: f.plan.siteName,
        source: '/api/observed',
        contractFingerprint: routing.contractFingerprint,
        observedAt: new Date().toISOString(),
      };
      const sessions = { ...parseBgpSessions(wire, expected), ...meta };
      const effectiveRoutes = {
        ...parseBgpRoutes(
          wire,
          interfaces.map((row) => row.node),
        ),
        pathInventory: parseBgpRoutePaths(
          wire,
          interfaces.map((row) => row.node),
        ),
        ...meta,
      };
      const routeServerId = f.plan.actions.find((row) => row.kind === 'route-server-create')?.resourceId;
      const routeServer = {
        status: 'healthy',
        phase: phase === 'outage' ? 'outage' : 'recovered',
        selectedNode: 2,
        expectedEstablishedSessions: expected.length,
        routeServerId,
        serviceAddresses: routing.routeServerAddresses,
        peers: [1, 2, 3].map((node) => ({
          node,
          name: `${f.plan.deploymentName}-${node}`,
          peerIp: `10.20.0.${node + 10}`,
          peerAsn: f.plan.routing.localAsn,
          provisioningState: 'Succeeded',
          roles: [0, 1].map((role) => ({
            role: `RouteServiceRole_IN_${role}`,
            learnedRouteCount: phase === 'outage' && node === 2 ? 0 : 1,
            matchedPrefixes: phase === 'outage' && node === 2 ? [] : f.plan.routing.destinationCidrs,
          })),
        })),
        observedAt: new Date().toISOString(),
      };
      const traffic = await collectAzureFailoverTraffic(f.plan, f.failover, phase, f.storage, f.api);
      return {
        acceptance: 'passed',
        phase,
        expectedEstablishedSessions: expected.length,
        sessions,
        effectiveRoutes,
        routeServer,
        traffic: traffic.evidence,
        trafficCheckpointKey: traffic.checkpointKey,
        trafficRequestedAt: traffic.requestedAt,
        observedAt: new Date().toISOString(),
      };
    },
    async () => {
      if (engine === 'terraform') {
        await writePlan('release');
        await writePlan('release', true);
      }
    },
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {} },
  );
  const records = await failoverHistoryRecords(f);
  records.set('platform-routing.json', routing);
  return { ...f, records };
}

for (const engine of ['native', 'terraform'] as const)
  test(`${engine} historical verifier replays completed direct 6/4/6 failover without current acceptance`, async () => {
    const f = await completeFailoverHistoryFixture(engine);
    try {
      expect(await verifyAzureFailoverHistoricalArtifacts(f.plan, 'owned-site', f.records)).toEqual({
        plans: 1,
        histories: 3,
        checkpoints: 3,
        currentEvidenceQualified: false,
      });
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

for (const mode of [
  'extra-session-field',
  'extra-route-field',
  'malformed-path',
  'foreign-path-node',
  'changed-path-prefix',
  'missing-path',
  'invalid-cloud-ip',
  'stopped-session',
  'stopped-route',
  'foreign-owner',
  'foreign-site',
  'wrong-contract',
  'missing-outage',
  'outage-before-baseline',
  'receipt-before-recovery',
  'missing-stop-plan',
  'missing-start-plan',
  'missing-release-plan',
  'wrong-phase-plan',
  'plan-before-phase',
  'unexpected-plan-action',
  'final-with-changes',
] as const)
  test(`completed failover history rejects ${mode}`, async () => {
    const f = await completeFailoverHistoryFixture('terraform');
    try {
      const read = (suffix: string) => f.records.get(`${f.failover.planId}-${suffix}.json`) as Record<string, unknown>;
      const outage = read('outage-evidence') as unknown as HistoricalDirectPhase,
        baseline = read('baseline-evidence') as unknown as HistoricalDirectPhase;
      if (mode === 'extra-session-field') Object.assign(outage.sessions, { secret: 'foreign' });
      if (mode === 'extra-route-field') Object.assign(outage.effectiveRoutes, { secret: 'foreign' });
      if (mode === 'malformed-path')
        outage.effectiveRoutes.pathInventory.nodes[0].routingInstances[0].tables[0].exported[0].path[0].nh = [];
      if (mode === 'foreign-path-node') outage.effectiveRoutes.pathInventory.nodes[0].node = 'foreign';
      if (mode === 'changed-path-prefix')
        outage.effectiveRoutes.pathInventory.nodes[0].routingInstances[0].tables[0].exported[0].subnet = '10.1.1.1/32';
      if (mode === 'missing-path') Reflect.deleteProperty(outage.effectiveRoutes, 'pathInventory');
      if (mode === 'invalid-cloud-ip') outage.routeServer.peers[0].peerIp = '999.999.999.999';
      if (mode === 'stopped-session') outage.sessions.sessions.push(baseline.sessions.sessions[2]);
      if (mode === 'stopped-route') outage.effectiveRoutes.nodes.push(baseline.effectiveRoutes.nodes[1]);
      if (mode === 'foreign-owner') outage.sessions.owner.account = 'example-foreign';
      if (mode === 'foreign-site') outage.effectiveRoutes.siteName = 'foreign';
      if (mode === 'wrong-contract') outage.sessions.contractFingerprint = `sha256:${'b'.repeat(64)}`;
      if (mode === 'missing-outage') f.records.delete(`${f.failover.planId}-outage-evidence.json`);
      if (mode === 'outage-before-baseline') outage.trafficRequestedAt = '2020-01-01T00:00:00Z';
      if (mode === 'receipt-before-recovery') read('receipt').observedAt = '2020-01-01T00:00:00Z';
      if (mode === 'missing-stop-plan') f.records.delete(`${f.failover.planId}-stop-plan.json`);
      if (mode === 'missing-start-plan') f.records.delete(`${f.failover.planId}-start-plan.json`);
      if (mode === 'missing-release-plan') f.records.delete(`${f.failover.planId}-release-plan.json`);
      if (mode === 'wrong-phase-plan') f.records.set(`${f.failover.planId}-start-plan.json`, read('stop-plan'));
      if (mode === 'plan-before-phase') {
        read('checkpoint').phase = 'baseline';
        f.records.delete(`${f.failover.planId}-receipt.json`);
      }
      if (mode === 'unexpected-plan-action')
        (read('stop-plan') as unknown as PlanReceipt).changes[0].actions = ['delete'];
      if (mode === 'final-with-changes') read('final-plan').changes = read('release-plan').changes;
      await expect(verifyAzureFailoverHistoricalArtifacts(f.plan, 'owned-site', f.records)).rejects.toThrow();
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

async function failoverRetirementFixture() {
  const f = await completeFailoverHistoryFixture('terraform');
  const deployment = await azureTerraformFailoverDeployment(f.plan, f.failover, 'release');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const { configuration, providerLock, ...identity } = deployment;
  const final = f.records.get(`${f.failover.planId}-final-plan.json`) as PlanReceipt;
  const evidence = canonicalSha256({ platform: { status: 'absent' }, cloud: { status: 'absent' } }),
    calls: string[] = [];
  const manifest = {
    ...identity,
    configurationSha256: digest(configuration),
    providerLockSha256: digest(providerLock),
  };
  const marker = {
    schemaVersion: 1,
    status: 'runner-artifacts-retired',
    manifestSha256: canonicalSha256(manifest),
    evidenceSha256: evidence,
    finalPlanSha256: final.planSha256,
    planReceiptSha256: canonicalSha256(final),
    artifacts: [],
    inventorySha256: digest('[]'),
    ...independentRetirementFixture({
      manifestSha256: canonicalSha256(manifest),
      evidenceSha256: evidence,
      finalPlanSha256: final.planSha256,
      planReceiptSha256: canonicalSha256(final),
    }),
  };
  const result = {
    status: 'runner-artifacts-retired' as const,
    evidenceSha256: evidence,
    finalPlanSha256: final.planSha256,
    manifestSha256: marker.manifestSha256,
    inventorySha256: marker.inventorySha256,
    independentCleanupSha256: marker.independentCleanupSha256,
    retiredArtifacts: 0,
  };
  const session = {
    async readConfigurationSha256() {
      calls.push('configuration');
      return digest(configuration);
    },
    async readPlanApplicationState() {
      calls.push('application');
      return 'applied';
    },
    async plan() {
      calls.push('fresh-plan');
      return structuredClone(final);
    },
    async retireArtifacts(receipt: PlanReceipt, sha: string) {
      calls.push('retire');
      expect(receipt).toEqual(final);
      expect(sha).toBe(evidence);
      return structuredClone(result);
    },
  } as unknown as TerraformSession;
  const service = {
    async open(owner: unknown, selected: unknown, resume: unknown) {
      calls.push('open');
      expect(owner).toEqual(f.storage.owner);
      expect(selected).toEqual(deployment);
      expect(resume).toBe('current');
      return session;
    },
  } as CeTerraformService;
  const run = () =>
    retireAzureTerraformFailoverStage(f.plan, f.failover, 'owned-site', service, f.storage, evidence, {});
  return { ...f, session, service, evidence, calls, run, result, marker, manifest };
}

test('failover stage retirement binds complete history, release application and a fresh ordinary plan', async () => {
  const f = await failoverRetirementFixture();
  try {
    expect(
      await qualifiedAzureTerraformFailoverStages(f.plan, f.storage, [
        `failover-${f.failover.planSha256.slice(0, 24)}`,
      ]),
    ).toEqual([f.failover]);
    await expect(
      qualifiedAzureTerraformFailoverStages(f.plan, f.storage, [`failover-${'f'.repeat(24)}`]),
    ).rejects.toThrow();
    expect(await f.run()).toEqual(f.result);
    expect(f.calls).toEqual(['open', 'configuration', 'application', 'fresh-plan', 'retire']);
    f.calls.length = 0;
    expect(await f.run()).toEqual(f.result);
    expect(f.calls).toEqual(['open', 'retire']);
    const records = await failoverHistoryRecords(f);
    records.set('platform-routing.json', f.records.get('platform-routing.json'));
    expect(await verifyAzureFailoverHistoricalArtifacts(f.plan, 'owned-site', records)).toBeDefined();
  } finally {
    await rm(f.root, { recursive: true });
  }
});

for (const mode of [
  'incomplete',
  'applying',
  'wrong-configuration',
  'changed-final',
  'forged-result',
  'interrupted-retirement',
  'changed-after-plan',
] as const)
  test(`failover owning stage retirement ${mode}`, async () => {
    const f = await failoverRetirementFixture();
    try {
      if (mode === 'incomplete') {
        const name = `${f.failover.planId}-checkpoint.json`;
        await f.storage.write(name, { ...((await f.storage.read(name)) as object), phase: 'recovered' });
      }
      if (mode === 'applying') f.session.readPlanApplicationState = async () => 'applying';
      if (mode === 'wrong-configuration') f.session.readConfigurationSha256 = async () => 'f'.repeat(64);
      if (mode === 'changed-final')
        f.session.plan = async () => ({
          ...(f.records.get(`${f.failover.planId}-final-plan.json`) as PlanReceipt),
          configurationSha256: 'f'.repeat(64),
        });
      if (mode === 'forged-result')
        f.session.retireArtifacts = async () =>
          ({ ...f.result, evidenceSha256: 'f'.repeat(64) }) as ArtifactRetirementReceipt;
      if (mode === 'interrupted-retirement')
        f.session.retireArtifacts = async () => {
          throw Error('lost retirement response');
        };
      if (mode === 'changed-after-plan') {
        const original = f.session.plan.bind(f.session);
        f.session.plan = async (...args) => {
          const final = await original(...args);
          await f.storage.write(`${f.failover.planId}.json`, { ...f.failover, vmId: 'foreign' });
          return final;
        };
      }
      await expect(f.run()).rejects.toThrow();
      const marker = (await f.storage.read(`${f.failover.planId}-stage-retirement.json`).catch(() => undefined)) as
        | Record<string, unknown>
        | undefined;
      expect(marker?.status).not.toBe('retired');
      if (mode === 'incomplete') expect(f.calls).toEqual([]);
      if (mode === 'interrupted-retirement') {
        f.session.retireArtifacts = async () => f.result as ArtifactRetirementReceipt;
        const count = f.calls.filter((value) => value === 'fresh-plan').length;
        expect(await f.run()).toEqual(f.result);
        expect(f.calls.filter((value) => value === 'fresh-plan')).toHaveLength(count);
      }
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

for (const mode of ['complete', 'foreign-phase', 'unknown-artifact', 'changed-after-checkpoint'] as const)
  test(`Terraform parent failover history ${mode}`, async () => {
    const f = await completeFailoverHistoryFixture('terraform');
    const parent = await prepareRelayParentRetirement(f.plan, 'owned-site', f.records);
    try {
      if (mode === 'foreign-phase') {
        const name = `${f.failover.planId}-outage-evidence.json`;
        await parent.store.write(name, { ...((await parent.store.read(name)) as object), phase: 'recovered' });
      }
      if (mode === 'unknown-artifact')
        await parent.store.write(`${f.failover.planId}-future-success.json`, { status: 'success' });
      const run = () => retireAzureTerraformParentArtifacts(f.plan, parent.teardown, parent.evidence, parent.store);
      if (mode === 'complete') {
        expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
        expect(await parent.store.read(`${f.failover.planId}.json`)).toEqual(f.failover);
        expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
      } else if (mode === 'changed-after-checkpoint') {
        const write = parent.store.write.bind(parent.store);
        parent.store.write = async (name, value) => {
          await write(name, value);
          if (name === 'azure-terraform-parent-artifact-retirement.json') {
            await write(`${f.failover.planId}.json`, { ...f.failover, vmId: 'foreign' });
          }
        };
        await expect(run()).rejects.toThrow();
        expect(await parent.store.read('terraform-workflow.json')).toBeDefined();
      } else {
        await expect(run()).rejects.toThrow();
        expect(await parent.store.read('terraform-workflow.json')).toBeDefined();
        await expect(parent.store.read('azure-terraform-parent-artifact-retirement.json')).rejects.toThrow();
      }
    } finally {
      await parent.cleanup();
      await rm(f.root, { recursive: true });
    }
  });

for (const mode of ['complete', 'foreign-manifest', 'changed-runner-receipt', 'residual-stage-file'] as const)
  test(`Terraform parent retains only independently retired exact failover stage ${mode}`, async () => {
    const f = await failoverRetirementFixture();
    let parent: Awaited<ReturnType<typeof prepareRelayParentRetirement>> | undefined;
    try {
      await f.run();
      const records = await failoverHistoryRecords(f);
      records.set('platform-routing.json', f.records.get('platform-routing.json'));
      parent = await prepareRelayParentRetirement(f.plan, 'owned-site', records);
      const stagePath = join(
        parent.store.directory,
        'terraform-stages',
        `failover-${f.failover.planSha256.slice(0, 24)}`,
        f.plan.deploymentName,
      );
      await mkdir(stagePath, { recursive: true, mode: 0o700 });
      const manifest = structuredClone(f.manifest),
        marker = structuredClone(f.marker);
      if (mode === 'foreign-manifest') manifest.backendIdentity = 'local:foreign';
      if (mode === 'changed-runner-receipt') marker.independentCleanupSha256 = 'f'.repeat(64);
      await writeFile(join(stagePath, 'deployment.json'), JSON.stringify(manifest), { mode: 0o600 });
      await writeFile(join(stagePath, 'artifact-retirement.json'), JSON.stringify(marker), { mode: 0o600 });
      if (mode === 'residual-stage-file') await writeFile(join(stagePath, 'terraform.tfstate'), '{}', { mode: 0o600 });
      const owningParent = parent;
      const run = () =>
        retireAzureTerraformParentArtifacts(f.plan, owningParent.teardown, f.evidence, owningParent.store);
      if (mode === 'complete') {
        expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
        expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
      } else {
        await expect(run()).rejects.toThrow();
        expect(await parent.store.read('terraform-workflow.json')).toBeDefined();
        await expect(parent.store.read('azure-terraform-parent-artifact-retirement.json')).rejects.toThrow();
      }
    } finally {
      await parent?.cleanup();
      await rm(f.root, { recursive: true });
    }
  });

test('ignored failover runner retirement cancellation cannot publish terminal completion', async () => {
  const f = await failoverRetirementFixture();
  try {
    const controller = new AbortController();
    f.session.retireArtifacts = async () => {
      controller.abort(Error('ignored retirement cancellation'));
      return f.result as ArtifactRetirementReceipt;
    };
    await expect(
      retireAzureTerraformFailoverStage(
        f.plan,
        f.failover,
        'owned-site',
        f.service,
        f.storage,
        f.evidence,
        {},
        controller.signal,
      ),
    ).rejects.toThrow('ignored retirement cancellation');
    expect(await f.storage.read(`${f.failover.planId}-stage-retirement.json`)).toMatchObject({ status: 'retiring' });
    f.session.retireArtifacts = async () => f.result as ArtifactRetirementReceipt;
    expect(await f.run()).toEqual(f.result);
  } finally {
    await rm(f.root, { recursive: true });
  }
});

async function currentTrafficFixture() {
  const f = fixture('terraform');
  const root = await mkdtemp(join(tmpdir(), 'azure-current-traffic-'));
  const storage = await CeDeploymentStore.open(root, {
    deploymentId: f.plan.deploymentName,
    engine: f.plan.engine,
    provider: 'azure',
    account: f.plan.subscription.id,
    region: f.plan.region,
  });
  const transport = f.api.exec;
  const options = {
    replay: false,
    foreign: false,
    duplicate: false,
    failed: false,
    mutate: false,
    sourceChange: false,
  };
  let probed = false;
  const api = {
    exec: async (command: string, args: string[]) => {
      if (args[0] === 'vm' && args[1] === 'run-command') {
        probed = true;
        const script = args[args.indexOf('--scripts') + 1];
        const marker = /xcsh-current-traffic:[a-f0-9-]{36}/.exec(script)?.[0];
        if (options.mutate) f.plan.siteName = 'foreign-site';
        if (!options.replay)
          f.setProbe(
            `${options.failed ? '503' : '200'} ${'4'.repeat(64)}\n\n${options.foreign ? 'xcsh-current-traffic:00000000-0000-4000-8000-000000000000' : marker}\n${options.duplicate ? `${marker}\n` : ''}`,
          );
      }
      const raw = await transport(command, args);
      if (options.sourceChange && probed && args[0] === 'network') {
        const value = JSON.parse(raw.stdout);
        value.ipConfigurations[0].privateIPAddress = '10.30.0.5';
        return { ...raw, stdout: JSON.stringify(value) };
      }
      return raw;
    },
  };
  return { ...f, root, storage, api, options };
}

test('current traffic samples execute distinct challenge-bound probes without replacing completed history', async () => {
  const f = await currentTrafficFixture();
  try {
    const legacyApi = fixture('terraform').api;
    await collectAzureTrafficProbe(f.plan, f.storage, legacyApi);
    const before = await f.storage.read('azure-traffic-probe.json');
    const first = await collectAzureCurrentTrafficProbe(f.plan, f.storage, f.api);
    const second = await collectAzureCurrentTrafficProbe(f.plan, f.storage, f.api);
    expect(first.status).toBe('healthy');
    expect(second.status).toBe('healthy');
    expect(first.sampleId).not.toBe(second.sampleId);
    expect(first.scope).toBe('reviewed-vm-http-content-probe');
    expect(f.calls.filter((args) => args[0] === 'vm' && args[1] === 'run-command')).toHaveLength(2);
    expect(await f.storage.read('azure-traffic-probe.json')).toEqual(before);
    expect(JSON.stringify(first)).not.toContain('secret-bootstrap-content');
  } finally {
    await rm(f.root, { recursive: true });
  }
});

for (const failure of ['replay', 'foreign', 'duplicate', 'failed', 'mutate', 'sourceChange'] as const)
  test(`current traffic sample rejects ${failure} before publishing current acceptance`, async () => {
    const f = await currentTrafficFixture();
    try {
      f.options[failure] = true;
      await expect(collectAzureCurrentTrafficProbe(f.plan, f.storage, f.api)).rejects.toThrow();
      expect((await readdir(f.storage.directory)).filter((name) => name.endsWith('-current-sample.json'))).toHaveLength(
        0,
      );
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

test('current traffic cancellation settles when the provider transport ignores an aborted signal', async () => {
  const f = await currentTrafficFixture(),
    controller = new AbortController();
  try {
    const api = {
      exec: async (command: string, args: string[]) => {
        if (args[0] === 'vm' && args[1] === 'run-command') {
          controller.abort(Error('test traffic cancelled'));
          return new Promise<Awaited<ReturnType<typeof f.api.exec>>>(() => {});
        }
        return f.api.exec(command, args);
      },
    };
    const result = await Promise.race([
      collectAzureCurrentTrafficProbe(f.plan, f.storage, api, controller.signal).then(
        () => 'accepted',
        (error) => error.message,
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('did not settle after cancellation'), 100)),
    ]);
    expect(result).toBe('test traffic cancelled');
    expect((await readdir(f.storage.directory)).filter((name) => name.endsWith('-current-sample.json'))).toHaveLength(
      0,
    );
  } finally {
    await rm(f.root, { recursive: true });
  }
});

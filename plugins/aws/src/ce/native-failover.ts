import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

export interface AwsNativeFailover {
  schemaVersion: 1;
  engine: 'native';
  kind: 'aws-ce-native-failover';
  sourcePlanSha256: string;
  nodeIndex: number;
  instanceId: string;
  planId: string;
  planSha256: string;
}
interface NativeFailoverCheckpoint {
  schemaVersion: 1;
  engine: 'native';
  sourcePlanSha256: string;
  failoverPlanSha256: string;
  phase: 'stop' | 'outage' | 'start' | 'recovered' | 'complete';
  pending?: { phase: 'stop' | 'start'; requestSha256: string };
}

/** Revalidate exact instance ownership at every native mutation and convergence boundary. */
export async function observeAwsNativeFailoverInstance(
  base: AwsCePlan,
  failover: AwsNativeFailover,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<'running' | 'stopped' | 'pending' | 'unknown'> {
  signal?.throwIfAborted();
  verifyAwsNativeFailover(base, failover);
  const identity = await api.exec('aws', ['sts', 'get-caller-identity', '--region', base.region, '--output', 'json'], {
    signal,
  });
  if (identity.exitCode !== 0 || JSON.parse(identity.stdout).Account !== base.accountId)
    throw new Error('Native failover account observation differs');
  const response = await api.exec(
    'aws',
    ['ec2', 'describe-instances', '--instance-ids', failover.instanceId, '--region', base.region, '--output', 'json'],
    { signal },
  );
  if (response.exitCode !== 0) throw new Error('Native failover instance observation unavailable');
  const raw = JSON.parse(response.stdout) as Record<string, unknown>;
  const reservations = Array.isArray(raw.Reservations) ? raw.Reservations : [];
  const rows = reservations.flatMap((value) => {
    const reservation = value as Record<string, unknown>;
    return (Array.isArray(reservation.Instances) ? reservation.Instances : []).map((instance) => ({
      owner: reservation.OwnerId,
      instance: instance as Record<string, unknown>,
    }));
  });
  if (raw.NextToken || rows.length !== 1 || rows[0].owner !== base.accountId)
    throw new Error('Native failover instance response is incomplete');
  const instance = rows[0].instance;
  const tags = new Map(
    (Array.isArray(instance.Tags) ? instance.Tags : []).map((value) => {
      const tag = value as Record<string, unknown>;
      return [String(tag.Key), String(tag.Value)] as const;
    }),
  );
  if (
    instance.InstanceId !== failover.instanceId ||
    tags.size !== (Array.isArray(instance.Tags) ? instance.Tags.length : 0) ||
    tags.get('xcsh-managed-by') !== 'aws-ce' ||
    tags.get('xcsh-execution-engine') !== 'native' ||
    tags.get('xcsh-deployment-id') !== base.deploymentName ||
    tags.get('xcsh-plan-sha256') !== base.planSha256 ||
    tags.get('xcsh-node-index') !== String(failover.nodeIndex)
  )
    throw new Error('Native failover instance ownership differs');
  const state = (instance.State as Record<string, unknown> | undefined)?.Name;
  if (state === 'running' || state === 'stopped') return state;
  return ['pending', 'stopping'].includes(String(state)) ? 'pending' : 'unknown';
}

export function buildAwsNativeFailover(base: AwsCePlan, nodeIndex: number, instanceId: string): AwsNativeFailover {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.nodeIndexes.includes(nodeIndex));
  if (
    base.engine !== 'native' ||
    base.routing.profile !== 'tgw-connect' ||
    !selected ||
    !Number.isInteger(nodeIndex) ||
    !/^i-[0-9a-f]{8,17}$/.test(instanceId)
  )
    throw new Error('AWS native failover source, node or instance differs');
  const draft = {
    schemaVersion: 1 as const,
    engine: 'native' as const,
    kind: 'aws-ce-native-failover' as const,
    sourcePlanSha256: base.planSha256,
    nodeIndex,
    instanceId,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}

export function verifyAwsNativeFailover(base: AwsCePlan, failover: AwsNativeFailover): void {
  if (
    failover.schemaVersion !== 1 ||
    failover.engine !== 'native' ||
    failover.kind !== 'aws-ce-native-failover' ||
    failover.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(buildAwsNativeFailover(base, failover.nodeIndex, failover.instanceId)) !== canonicalSha256(failover)
  )
    throw new Error('Saved AWS native failover plan changed');
}

async function optional<T>(storage: CeDeploymentStore, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Execute one native outage and recovery; ambiguous mutations converge from live state without replay. */
export async function runAwsNativeFailover(
  base: AwsCePlan,
  failover: AwsNativeFailover,
  authorizedPlanSha256: string,
  storage: CeDeploymentStore,
  observeInstance: (signal?: AbortSignal) => Promise<'running' | 'stopped' | 'pending' | 'unknown'>,
  mutate: (phase: 'stop' | 'start', signal?: AbortSignal) => Promise<void>,
  collect: (phase: 'outage' | 'recovered', signal?: AbortSignal) => Promise<{ acceptance?: unknown }>,
  signal?: AbortSignal,
  polling: { attempts: number; intervalMs: number; wait(ms: number): Promise<void> } = {
    attempts: 30,
    intervalMs: 10_000,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAwsNativeFailover(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256) throw new Error('Exact native failover authorization is required');
  if (
    canonicalSha256(storage.owner) !==
    canonicalSha256({
      deploymentId: base.deploymentName,
      engine: 'native',
      provider: 'aws',
      account: base.accountId,
      region: base.region,
    })
  )
    throw new Error('Only the owning native engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Failover convergence bounds are invalid');
  const release = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const saved = await optional<AwsNativeFailover>(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(saved) !== canonicalSha256(failover)) throw new Error('Saved failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let checkpoint = await optional<NativeFailoverCheckpoint>(storage, checkpointName);
    if (!checkpoint) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'stop',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'native' ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.failoverPlanSha256 !== failover.planSha256 ||
      !['stop', 'outage', 'start', 'recovered', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.pending !== undefined &&
        (checkpoint.pending.phase !== checkpoint.phase ||
          checkpoint.pending.requestSha256 !==
            canonicalSha256({ phase: checkpoint.pending.phase, instanceId: failover.instanceId })))
    )
      throw new Error('Native failover checkpoint differs');
    let active = checkpoint as NativeFailoverCheckpoint;
    const convergeInstance = async (expected: 'running' | 'stopped') => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        if ((await observeInstance(signal)) === expected) return;
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Native failover instance ${expected} convergence deadline exceeded`);
    };
    const change = async (phase: 'stop' | 'start', next: NativeFailoverCheckpoint['phase']) => {
      const expected = phase === 'stop' ? 'stopped' : 'running';
      if (!active.pending) {
        const before = await observeInstance(signal);
        if (before === expected)
          throw new Error(`Native failover instance was already ${expected} before authorization`);
        if (before !== (phase === 'stop' ? 'running' : 'stopped'))
          throw new Error('Native failover instance state is unavailable');
        active = {
          ...active,
          pending: { phase, requestSha256: canonicalSha256({ phase, instanceId: failover.instanceId }) },
        };
        await storage.write(checkpointName, active);
        await mutate(phase, signal);
      }
      await convergeInstance(expected);
      active = { ...active, phase: next, pending: undefined };
      await storage.write(checkpointName, active);
    };
    const convergeNetwork = async (phase: 'outage' | 'recovered', next: NativeFailoverCheckpoint['phase']) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          active = { ...active, phase: next };
          await storage.write(checkpointName, active);
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Native failover ${phase} convergence deadline exceeded`);
    };
    if (active.phase === 'stop') await change('stop', 'outage');
    if (active.phase === 'outage') await convergeNetwork('outage', 'start');
    if (active.phase === 'start') await change('start', 'recovered');
    if (active.phase === 'recovered') await convergeNetwork('recovered', 'complete');
    const receipt = {
      status: 'failover-complete' as const,
      engine: 'native' as const,
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      observedAt: new Date().toISOString(),
      traffic: 'unknown' as const,
      originControl: 'unknown' as const,
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}

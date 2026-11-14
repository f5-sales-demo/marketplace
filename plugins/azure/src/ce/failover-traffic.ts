import { randomBytes } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { type AzureCeFailoverPlan, azureFailoverOwner, verifyAzureCeFailoverPlan } from './failover';
import { validateAzureTrafficCheckpoint } from './traffic-artifact-provenance';
import { collectAzureTrafficProbe } from './traffic-probe';
import type { AzureCePlan } from './types';

type Phase = 'baseline' | 'outage' | 'recovered';
type Json = Record<string, unknown>;
interface History {
  schemaVersion: 1;
  sourcePlanSha256: string;
  failoverPlanSha256: string;
  phase: Phase;
  observations: Array<{ checkpointKey: string; requestedAt: string; checkpointSha256?: string }>;
}
const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure failover traffic: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed history');
  return value as Json;
};
const keys = (value: Json, required: string[], optional: string[] = []) =>
  require(required.every((key) => key in value) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), 'history fields differ');
const timestamp = (value: unknown) => {
  require(typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now(), 'history timestamp differs');
  return Date.parse(String(value));
};
const prefix = (failover: AzureCeFailoverPlan, phase: Phase) => `${failover.planId}-${phase}-traffic-`;
export const azureFailoverTrafficHistoryName = (failover: AzureCeFailoverPlan, phase: Phase) =>
  `${prefix(failover, phase)}observations.json`;
async function optional(storage: Pick<CeDeploymentStore, 'read'>, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Validates immutable historical HTTP receipts. A missing uncompleted leaf is an interrupted read, never current success. */
export function validateAzureFailoverTrafficHistory(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  phase: Phase,
  input: unknown,
  checkpoints: Map<string, unknown>,
) {
  verifyAzureCeFailoverPlan(base, failover);
  require(['baseline', 'outage', 'recovered'].includes(phase), 'phase differs');
  const history = object(input);
  keys(history, ['schemaVersion', 'sourcePlanSha256', 'failoverPlanSha256', 'phase', 'observations']);
  require(history.schemaVersion === 1 &&
    history.sourcePlanSha256 === base.planSha256 &&
    history.failoverPlanSha256 === failover.planSha256 &&
    history.phase === phase &&
    Array.isArray(history.observations) &&
    history.observations.length > 0 &&
    history.observations.length <= 1000, 'history source or phase differs');
  const names = new Set<string>();
  let previous = 0,
    complete = 0,
    pending = 0;
  for (const raw of history.observations as unknown[]) {
    const row = object(raw);
    keys(row, ['checkpointKey', 'requestedAt'], ['checkpointSha256']);
    require(typeof row.checkpointKey === 'string' &&
      row.checkpointKey.startsWith(prefix(failover, phase)) &&
      /^[a-f0-9]{32}$/.test(row.checkpointKey.slice(prefix(failover, phase).length)) &&
      !names.has(row.checkpointKey), 'distinct source-bound checkpoint key required');
    const name = `${row.checkpointKey}.json`;
    names.add(String(row.checkpointKey));
    const requested = timestamp(row.requestedAt);
    require(requested >= previous, 'history collection order differs');
    previous = requested;
    const checkpoint = checkpoints.get(name);
    if (row.checkpointSha256 !== undefined)
      require(typeof row.checkpointSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(row.checkpointSha256) &&
        checkpoint !== undefined &&
        canonicalSha256(checkpoint) === row.checkpointSha256, 'completed checkpoint changed or missing');
    if (checkpoint === undefined) {
      pending++;
      continue;
    }
    const evidence = validateAzureTrafficCheckpoint(base, checkpoint);
    require(timestamp(object(checkpoint).sourceObservedAt) >=
      requested, 'checkpoint predates the requested observation');
    if (evidence) {
      require(timestamp(evidence.observedAt) >= requested, 'HTTP observation predates its phase request');
      complete++;
    } else {
      require(row.checkpointSha256 === undefined, 'completed checkpoint cannot be pending');
      pending++;
    }
  }
  require([...checkpoints.keys()].every(
    (name) => names.has(name.slice(0, -5)) && name.endsWith('.json'),
  ), 'foreign checkpoint inventory');
  return { complete, pending, history: history as unknown as History, currentTrafficQualified: false as const };
}

/** Every call issues a new HTTP read; completed checkpoints are kept only as historical evidence. */
export async function collectAzureFailoverTraffic(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  phase: Phase,
  storage: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureCeFailoverPlan(base, failover);
  require(['baseline', 'outage', 'recovered'].includes(phase), 'phase differs');
  require(canonicalSha256(storage.owner) === canonicalSha256(azureFailoverOwner(base)), 'storage owner differs');
  signal?.throwIfAborted();
  await storage.verify();
  const unlock = await acquireProcessLock(`${storage.directory}/.failover-traffic-${phase}-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const name = azureFailoverTrafficHistoryName(failover, phase);
    let history = (await optional(storage, name)) as History | undefined;
    if (history) {
      // Validate shape before using checkpoint names for file reads.
      const raw = object(history);
      require(Array.isArray(raw.observations), 'malformed observation inventory');
      const scope = {
        ...raw,
        observations: (raw.observations as unknown[]).map((row) => {
          const { checkpointSha256: _digest, ...identity } = object(row);
          return identity;
        }),
      };
      validateAzureFailoverTrafficHistory(base, failover, phase, scope, new Map());
      const checkpoints = new Map<string, unknown>();
      for (const row of history.observations) {
        const checkpoint = await optional(storage, `${row.checkpointKey}.json`);
        if (checkpoint !== undefined) checkpoints.set(`${row.checkpointKey}.json`, checkpoint);
      }
      validateAzureFailoverTrafficHistory(base, failover, phase, history, checkpoints);
    } else
      history = {
        schemaVersion: 1,
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase,
        observations: [],
      };
    require(history.observations.length < 1000, 'phase observation bound exhausted');
    const row = {
      checkpointKey: `${prefix(failover, phase)}${randomBytes(16).toString('hex')}`,
      requestedAt: new Date().toISOString(),
    };
    require((await optional(storage, `${row.checkpointKey}.json`)) ===
      undefined, 'new checkpoint identity already exists');
    signal?.throwIfAborted();
    history.observations.push(row);
    await storage.write(name, history);
    signal?.throwIfAborted();
    const evidence = await collectAzureTrafficProbe(base, storage, api, signal, row.checkpointKey);
    signal?.throwIfAborted();
    const checkpoint = await storage.read(`${row.checkpointKey}.json`);
    require(canonicalSha256(validateAzureTrafficCheckpoint(base, checkpoint)) === canonicalSha256(evidence) &&
      timestamp(evidence.observedAt) >= timestamp(row.requestedAt), 'new HTTP receipt differs');
    const active = history.observations.at(-1);
    if (!active) throw Error('Azure failover traffic: current observation missing');
    active.checkpointSha256 = canonicalSha256(checkpoint);
    await storage.write(name, history);
    signal?.throwIfAborted();
    return { checkpointKey: row.checkpointKey, requestedAt: row.requestedAt, evidence };
  } finally {
    await unlock();
  }
}

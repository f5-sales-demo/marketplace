import { createHash, timingSafeEqual } from 'node:crypto';
import type { CeDeploymentStore } from './deployment-store';
import { acquireProcessLock } from './process-lock';
import type { CeRuntime } from './runtime';
import type { VerifiedUpgradeContract } from './upgrade-contract';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from './upgrade-transition';

export interface NativeCeUpgradePlan {
  schemaVersion: 1;
  engine: 'native';
  kind: string;
  sourcePlanSha256: string;
  expectation: CeUpgradeExpectation;
  planId: string;
  planSha256: string;
}

interface NativeUpgradeCheckpoint {
  schemaVersion: 1;
  engine: 'native';
  sourcePlanSha256: string;
  upgradePlanSha256: string;
  phase: 'ready' | 'submitted' | 'complete';
}

interface NativeSerialUpgradeLedger {
  schemaVersion: 1;
  engine: 'native';
  status: 'active' | 'idle';
  activePlanId?: string;
  activePlanSha256?: string;
  lastPlanId?: string;
  lastPlanSha256?: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const sameHash = (left: string, right: string) =>
  /^[a-f0-9]{64}$/.test(left) &&
  /^[a-f0-9]{64}$/.test(right) &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

async function optional<T>(storage: CeDeploymentStore, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function exactFields(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== expected.toSorted().join(',')
  )
    throw Error('Native upgrade record fields differ');
}

export function validateNativeUpgradeReceipt(upgrade: NativeCeUpgradePlan, value: unknown) {
  exactFields(value, [
    'status',
    'engine',
    'planId',
    'planSha256',
    'siteName',
    'target',
    'observedAt',
    'nodeHealth',
    'routing',
    'traffic',
  ]);
  const time = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN;
  if (
    value.status !== 'upgrade-complete' ||
    value.engine !== 'native' ||
    value.planId !== upgrade.planId ||
    value.planSha256 !== upgrade.planSha256 ||
    value.siteName !== upgrade.expectation.binding.siteName ||
    hash(value.target) !== hash(upgrade.expectation.target) ||
    !Number.isFinite(time) ||
    time > Date.now() ||
    new Date(time).toISOString() !== value.observedAt ||
    value.nodeHealth !== 'unknown' ||
    value.routing !== 'unknown' ||
    value.traffic !== 'unknown'
  )
    throw Error('Completed native upgrade receipt differs');
  return value;
}

export function validateNativeUpgradeCheckpoint(upgrade: NativeCeUpgradePlan, value: unknown) {
  exactFields(value, ['schemaVersion', 'engine', 'sourcePlanSha256', 'upgradePlanSha256', 'phase']);
  if (
    value.schemaVersion !== 1 ||
    value.engine !== 'native' ||
    value.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
    value.upgradePlanSha256 !== upgrade.planSha256 ||
    !['ready', 'submitted', 'complete'].includes(String(value.phase))
  )
    throw Error('Native upgrade checkpoint differs');
  return value as unknown as NativeUpgradeCheckpoint;
}

export function validateNativeUpgradeSerial(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Native serial upgrade ledger differs');
  const row = value as Record<string, unknown>;
  exactFields(row, [
    'schemaVersion',
    'engine',
    'status',
    ...(row.activePlanId !== undefined ? ['activePlanId'] : []),
    ...(row.activePlanSha256 !== undefined ? ['activePlanSha256'] : []),
    ...(row.lastPlanId !== undefined ? ['lastPlanId'] : []),
    ...(row.lastPlanSha256 !== undefined ? ['lastPlanSha256'] : []),
  ]);
  const pair = (id: unknown, digest: unknown) =>
    typeof id === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) &&
    typeof digest === 'string' &&
    /^[a-f0-9]{64}$/.test(digest);
  if (
    row.schemaVersion !== 1 ||
    row.engine !== 'native' ||
    !['active', 'idle'].includes(String(row.status)) ||
    (row.status === 'idle' && (row.activePlanId !== undefined || row.activePlanSha256 !== undefined)) ||
    (row.status === 'active' && !pair(row.activePlanId, row.activePlanSha256)) ||
    ((row.lastPlanId !== undefined || row.lastPlanSha256 !== undefined) && !pair(row.lastPlanId, row.lastPlanSha256))
  )
    throw Error('Native serial upgrade ledger differs');
  return row as unknown as NativeSerialUpgradeLedger;
}

/** Cloud-neutral native upgrade executor with serial and ambiguous-response recovery. */
export async function runNativeCeUpgrade(
  input: NativeCeUpgradePlan,
  authorizedPlanSha256: string,
  verify: (plan: NativeCeUpgradePlan) => Promise<void>,
  runtime: Pick<CeRuntime, 'engine' | 'observeUpgrade' | 'submitUpgrade'>,
  contract: VerifiedUpgradeContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Native upgrade schema is obsolete; prepare a new v1 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact native upgrade authorization is required');
  if (
    runtime.engine !== 'native' ||
    storage.owner.engine !== 'native' ||
    hash(storage.owner) !== hash(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning native engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    signal?.throwIfAborted();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional<NativeCeUpgradePlan>(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved native upgrade source differs');

    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    const loadedCheckpoint = await optional<NativeUpgradeCheckpoint>(storage, checkpointName);
    let checkpoint: NativeUpgradeCheckpoint;
    if (loadedCheckpoint === undefined) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    } else checkpoint = loadedCheckpoint;
    checkpoint = validateNativeUpgradeCheckpoint(upgrade, checkpoint);

    let serial: NativeSerialUpgradeLedger = (await optional<NativeSerialUpgradeLedger>(
      storage,
      'native-ce-upgrade-serial.json',
    )) ?? { schemaVersion: 1, engine: 'native', status: 'idle' };
    serial = validateNativeUpgradeSerial(serial);
    if (
      serial.status === 'active' &&
      (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256)
    )
      throw Error('Another native site upgrade is active');
    if (serial.lastPlanId !== undefined) {
      const last = await optional<NativeCeUpgradePlan>(storage, `${serial.lastPlanId}.json`);
      if (
        !last ||
        last.planId !== serial.lastPlanId ||
        last.planSha256 !== serial.lastPlanSha256 ||
        last.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
        hash(last.expectation.binding.owner) !== hash(storage.owner)
      )
        throw Error('Native serial upgrade source differs');
      await verify(last);
    }
    if (checkpoint.phase === 'submitted' && serial.status !== 'active')
      throw Error('Submitted native upgrade serial source missing');
    if (checkpoint.phase === 'complete' && serial.status === 'idle' && !serial.lastPlanId)
      throw Error('Completed native upgrade serial source missing');
    if (serial.status === 'idle' && checkpoint.phase === 'ready') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
    }

    const observe = async () => {
      signal?.throwIfAborted();
      const result = await runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
      signal?.throwIfAborted();
      return result;
    };
    const publishComplete = async () => {
      signal?.throwIfAborted();
      let receipt = await optional<Record<string, unknown>>(storage, `${upgrade.planId}-receipt.json`);
      if (receipt === undefined) {
        if (checkpoint.phase === 'complete') throw Error('Completed native upgrade receipt missing');
        receipt = {
          status: 'upgrade-complete',
          engine: 'native',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
          siteName: upgrade.expectation.binding.siteName,
          target: upgrade.expectation.target,
          observedAt: new Date().toISOString(),
          nodeHealth: 'unknown',
          routing: 'unknown',
          traffic: 'unknown',
        };
        validateNativeUpgradeReceipt(upgrade, receipt);
        signal?.throwIfAborted();
        // Persist the receipt first. An interrupted publication can then resume without recreating its timestamp.
        await storage.write(`${upgrade.planId}-receipt.json`, receipt);
      } else validateNativeUpgradeReceipt(upgrade, receipt);
      signal?.throwIfAborted();
      if (checkpoint.phase !== 'complete') {
        checkpoint = { ...checkpoint, phase: 'complete' };
        await storage.write(checkpointName, checkpoint);
      }
      signal?.throwIfAborted();
      if (serial.status === 'active') {
        serial = {
          schemaVersion: 1,
          engine: 'native',
          status: 'idle',
          lastPlanId: upgrade.planId,
          lastPlanSha256: upgrade.planSha256,
        };
        await storage.write('native-ce-upgrade-serial.json', serial);
      } else if (!serial.lastPlanId) throw Error('Completed native upgrade serial source missing');
      signal?.throwIfAborted();
      return receipt;
    };
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed native upgrade version evidence regressed');
      return await publishComplete();
    }
    if (transition === 'failed') throw new Error('Native upgrade failed');
    if (transition === 'unknown') {
      if (checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown' as const,
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      throw new Error('Native upgrade evidence is unknown');
    }
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete' as const, planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized native action');
    if (checkpoint.phase === 'ready') {
      let crossedBoundary = false;
      try {
        await runtime.submitUpgrade(
          upgrade.expectation.binding,
          contract,
          upgrade.expectation.target,
          upgrade.expectation.siteUid,
          async () => {
            signal?.throwIfAborted();
            checkpoint = {
              schemaVersion: 1,
              engine: 'native',
              sourcePlanSha256: upgrade.sourcePlanSha256,
              upgradePlanSha256: upgrade.planSha256,
              phase: 'submitted',
            };
            await storage.write(checkpointName, checkpoint);
            crossedBoundary = true;
          },
          signal,
        );
      } catch (error) {
        signal?.throwIfAborted();
        if (!crossedBoundary) throw error;
        return {
          status: 'upgrade-submission-unconfirmed' as const,
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      }
      if (!crossedBoundary) throw Error('Native upgrade submission boundary missing');
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown' && checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown' as const,
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Native upgrade convergence is unknown');
      return {
        status:
          checkpoint.phase === 'submitted' && transition === 'ready'
            ? 'upgrade-submission-unconfirmed'
            : 'upgrade-converging',
        planId: upgrade.planId,
        planSha256: upgrade.planSha256,
      };
    }
    return await publishComplete();
  } finally {
    await release();
  }
}

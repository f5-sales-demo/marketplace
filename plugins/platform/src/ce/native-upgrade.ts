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
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional<NativeCeUpgradePlan>(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved native upgrade source differs');

    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional<NativeUpgradeCheckpoint>(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'native' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase)
    )
      throw new Error('Native upgrade checkpoint differs');

    let serial = await optional<NativeSerialUpgradeLedger>(storage, 'native-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 1, engine: 'native', status: 'idle' };
    if (
      serial.schemaVersion !== 1 ||
      serial.engine !== 'native' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another native site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
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

    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed native upgrade version evidence regressed');
      const receipt = (await storage.read(`${upgrade.planId}-receipt.json`)) as Record<string, unknown>;
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'native' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash(receipt.target) !== hash(upgrade.expectation.target) ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed native upgrade receipt differs');
      return receipt;
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
        if (!crossedBoundary) throw error;
        return {
          status: 'upgrade-submission-unconfirmed' as const,
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      }
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
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    serial = {
      schemaVersion: 1,
      engine: 'native',
      status: 'idle',
      lastPlanId: upgrade.planId,
      lastPlanSha256: upgrade.planSha256,
    };
    await storage.write('native-ce-upgrade-serial.json', serial);
    const receipt = {
      status: 'upgrade-complete' as const,
      engine: 'native' as const,
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown' as const,
      routing: 'unknown' as const,
      traffic: 'unknown' as const,
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}

import { createHash, timingSafeEqual } from 'node:crypto';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../platform/src/ce/upgrade-contract';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from '../../platform/src/ce/upgrade-transition';
import type { Deployment, PlanReceipt, TerraformActionIntent } from './runner';
import type { CeTerraformService, TerraformSession } from './service';

export interface TerraformCeUpgradePlan {
  schemaVersion: 2;
  engine: 'terraform';
  kind: string;
  sourcePlanSha256: string;
  expectation: CeUpgradeExpectation;
  deployment: Deployment;
  action: TerraformActionIntent;
  planId: string;
  planSha256: string;
}

interface UpgradeCheckpoint {
  schemaVersion: 2;
  engine: 'terraform';
  sourcePlanSha256: string;
  upgradePlanSha256: string;
  phase: 'ready' | 'submitted' | 'complete';
  actionPlanSha256?: string;
}

interface SerialUpgradeLedger {
  schemaVersion: 2;
  engine: 'terraform';
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
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) => digest(canonical(value));
const sameHash = (left: string, right: string) =>
  /^[a-f0-9]{64}$/.test(left) &&
  /^[a-f0-9]{64}$/.test(right) &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

async function optional<T>(storage: CeDeploymentStore, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}

function validateActionReceipt(upgrade: TerraformCeUpgradePlan, receipt: PlanReceipt): void {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== upgrade.deployment.deploymentId ||
    receipt.backendIdentity !== upgrade.deployment.backendIdentity ||
    receipt.configurationSha256 !== digest(upgrade.deployment.configuration) ||
    receipt.providerLockSha256 !== digest(upgrade.deployment.providerLock) ||
    receipt.operation ||
    receipt.noChanges ||
    receipt.changes.length ||
    receipt.actionInvocations?.length !== 1 ||
    hash(receipt.actionInvocations[0]) !== hash(upgrade.action) ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256)
  )
    throw new Error('Terraform upgrade saved action plan differs');
}

/** Cloud-neutral serial executor. Cloud adapters own plan translation and integrity reconstruction. */
export async function runTerraformCeUpgrade(
  input: TerraformCeUpgradePlan,
  authorizedPlanSha256: string,
  verify: (plan: TerraformCeUpgradePlan) => Promise<void>,
  runtime: Pick<CeRuntime, 'engine' | 'observeUpgrade'>,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  storage: CeDeploymentStore,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Terraform upgrade schema is obsolete; prepare a new v2 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact Terraform upgrade authorization is required');
  if (
    runtime.engine !== 'terraform' ||
    storage.owner.engine !== 'terraform' ||
    hash(storage.owner) !== hash(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning Terraform engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional<TerraformCeUpgradePlan>(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved Terraform upgrade source differs');

    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional<UpgradeCheckpoint>(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 2 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.phase === 'ready' && checkpoint.actionPlanSha256 !== undefined) ||
      (checkpoint.phase !== 'ready' && !/^[a-f0-9]{64}$/.test(checkpoint.actionPlanSha256 ?? ''))
    )
      throw new Error('Terraform upgrade checkpoint differs');

    let serial = await optional<SerialUpgradeLedger>(storage, 'terraform-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 2, engine: 'terraform', status: 'idle' };
    if (
      serial.schemaVersion !== 2 ||
      serial.engine !== 'terraform' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
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
      if (transition !== 'versions-complete') throw new Error('Completed Terraform upgrade version evidence regressed');
      const action = (await storage.read(`${upgrade.planId}-action-plan.json`)) as PlanReceipt;
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Completed upgrade action plan differs');
      const receipt = (await storage.read(`${upgrade.planId}-receipt.json`)) as Record<string, unknown>;
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash(receipt.target) !== hash(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== checkpoint.actionPlanSha256 ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed Terraform upgrade receipt differs');
      return receipt;
    }
    if (transition === 'failed') throw new Error('Terraform upgrade failed');
    if (checkpoint.phase === 'ready' && transition === 'unknown')
      throw new Error('Terraform upgrade evidence is unknown');
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete' as const, planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized Terraform action');
    if (checkpoint.phase === 'ready') {
      let session: TerraformSession;
      try {
        session = await terraform.open(storage.owner, upgrade.deployment, false);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        session = await terraform.open(storage.owner, upgrade.deployment, 'current');
      }
      const action = await session.planAction(upgrade.action, env, signal);
      validateActionReceipt(upgrade, action);
      await storage.write(`${upgrade.planId}-action-plan.json`, action);
      await storage.verify();
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
      if (transition !== 'ready') throw new Error('Terraform upgrade readiness changed before submission');
      checkpoint = { ...checkpoint, phase: 'submitted', actionPlanSha256: action.planSha256 };
      await storage.write(checkpointName, checkpoint);
      await session.apply(action, env, signal);
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    } else {
      const action = (await storage.read(`${upgrade.planId}-action-plan.json`)) as PlanReceipt;
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Submitted upgrade action plan differs');
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown')
        return {
          status: 'upgrade-convergence-unknown' as const,
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Terraform upgrade convergence is unknown');
      return { status: 'upgrade-converging' as const, planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    serial = {
      schemaVersion: 2,
      engine: 'terraform',
      status: 'idle',
      lastPlanId: upgrade.planId,
      lastPlanSha256: upgrade.planSha256,
    };
    await storage.write('terraform-ce-upgrade-serial.json', serial);
    const receipt = {
      status: 'upgrade-complete' as const,
      engine: 'terraform' as const,
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      actionPlanSha256: checkpoint.actionPlanSha256,
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

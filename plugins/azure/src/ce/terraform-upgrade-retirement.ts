import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

import { type AzureTerraformUpgrade, verifyAzureTerraformUpgrade } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed upgrade retirement evidence');
  return v as Record<string, unknown>;
};
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
async function optional(store: CeDeploymentStore, name: string) {
  try {
    return await store.read(name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
/** Internal terminal stage retirement. Caller independently qualifies complete cloud/F5 absence. */
export async function retireAzureTerraformUpgradeStage(
  base: AzureCePlan,
  input: AzureTerraformUpgrade,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  evidenceSha256: string,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const upgrade = structuredClone(input);
  base = structuredClone(base);
  env = { ...env };
  await verifyAzureTerraformUpgrade(base, upgrade, contract);
  if (!sha(evidenceSha256) || canonicalSha256(store.owner) !== canonicalSha256(upgrade.expectation.binding.owner))
    throw Error('Upgrade retirement owner or external absence differs');
  const release = await acquireProcessLock(join(store.directory, '.upgrade-lock'));
  try {
    const checkpointName = `${upgrade.planId}-stage-retirement.json`;
    const validate = async () => {
      signal?.throwIfAborted();
      await store.verify();
      if (canonicalSha256(await store.read(`${upgrade.planId}.json`)) !== canonicalSha256(upgrade))
        throw Error('Upgrade retirement source differs');
      const serial = object(await store.read('terraform-ce-upgrade-serial.json'));
      if (
        serial.schemaVersion !== 2 ||
        serial.engine !== 'terraform' ||
        serial.status !== 'idle' ||
        serial.activePlanId !== undefined ||
        serial.activePlanSha256 !== undefined ||
        typeof serial.lastPlanId !== 'string' ||
        !sha(serial.lastPlanSha256)
      )
        throw Error('Active or malformed serial upgrade blocks retirement');
      if (!/^azure-ce-upgrade-[a-f0-9]{24}$/.test(serial.lastPlanId))
        throw Error('Serial Azure upgrade source differs');
      const last = (await store.read(`${serial.lastPlanId}.json`)) as AzureTerraformUpgrade;
      await verifyAzureTerraformUpgrade(base, last, contract);
      if (last.planSha256 !== serial.lastPlanSha256) throw Error('Serial Azure upgrade digest differs');
      const auth = object(await store.read(`${upgrade.planId}-authorization.json`)),
        checkpoint = object(await store.read(`${upgrade.planId}-checkpoint.json`)),
        action = object(await store.read(`${upgrade.planId}-action-plan.json`)),
        receipt = object(await store.read(`${upgrade.planId}-receipt.json`));
      if (
        auth.schemaVersion !== 2 ||
        auth.engine !== 'terraform' ||
        auth.sourcePlanSha256 !== base.planSha256 ||
        auth.upgradePlanSha256 !== upgrade.planSha256 ||
        auth.mutations !== true ||
        checkpoint.schemaVersion !== 2 ||
        checkpoint.engine !== 'terraform' ||
        checkpoint.sourcePlanSha256 !== base.planSha256 ||
        checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
        checkpoint.phase !== 'complete' ||
        !sha(checkpoint.actionPlanSha256)
      )
        throw Error('Upgrade retirement authorization or completion differs');
      if (
        action.schemaVersion !== 1 ||
        action.engine !== 'terraform' ||
        action.deploymentId !== upgrade.deployment.deploymentId ||
        action.backendIdentity !== upgrade.deployment.backendIdentity ||
        action.configurationSha256 !== sha256Hex(upgrade.deployment.configuration) ||
        action.providerLockSha256 !== sha256Hex(upgrade.deployment.providerLock) ||
        action.operation ||
        action.noChanges !== false ||
        !Array.isArray(action.changes) ||
        action.changes.length ||
        !Array.isArray(action.actionInvocations) ||
        action.actionInvocations.length !== 1 ||
        canonicalSha256(action.actionInvocations[0]) !== canonicalSha256(upgrade.action) ||
        action.planSha256 !== checkpoint.actionPlanSha256 ||
        action.imports ||
        action.relinquishments
      )
        throw Error('Upgrade retirement action differs');
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        canonicalSha256(receipt.target) !== canonicalSha256(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== action.planSha256 ||
        !Number.isFinite(Date.parse(String(receipt.observedAt))) ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw Error('Upgrade retirement completion receipt differs');
      return action as unknown as PlanReceipt;
    };
    const validateFinal = (v: unknown) => {
      const r = object(v);
      if (
        r.schemaVersion !== 1 ||
        r.engine !== 'terraform' ||
        r.deploymentId !== upgrade.deployment.deploymentId ||
        r.backendIdentity !== upgrade.deployment.backendIdentity ||
        r.configurationSha256 !== sha256Hex(upgrade.deployment.configuration) ||
        r.providerLockSha256 !== sha256Hex(upgrade.deployment.providerLock) ||
        r.noChanges !== true ||
        !Array.isArray(r.changes) ||
        r.changes.length ||
        !sha(r.planSha256) ||
        r.operation ||
        r.actionInvocations ||
        r.imports ||
        r.relinquishments
      )
        throw Error('Upgrade retirement requires an exact ordinary no-change plan');
      return r as unknown as PlanReceipt;
    };
    const validateCheckpoint = (v: unknown) => {
      const c = object(v);
      if (
        c.schemaVersion !== 1 ||
        !['preparing', 'retiring', 'retired'].includes(String(c.status)) ||
        canonicalSha256(c.owner) !== canonicalSha256(store.owner) ||
        c.sourcePlanSha256 !== base.planSha256 ||
        c.upgradePlanSha256 !== upgrade.planSha256 ||
        c.deploymentSha256 !== canonicalSha256(upgrade.deployment) ||
        c.evidenceSha256 !== evidenceSha256 ||
        (c.status !== 'preparing' && c.receiptSha256 !== canonicalSha256(c.receipt)) ||
        (c.status === 'preparing' && (c.receipt !== undefined || c.receiptSha256 !== undefined))
      )
        throw Error('Upgrade stage retirement checkpoint differs');
      return { bound: c, receipt: c.status === 'preparing' ? undefined : validateFinal(c.receipt) };
    };
    const action = await validate();
    let checkpoint = await optional(store, checkpointName);
    if (checkpoint !== undefined) validateCheckpoint(checkpoint);
    const session = await terraform.open(store.owner, upgrade.deployment, 'current');
    if (!session.retireArtifacts || !session.readConfigurationSha256)
      throw Error('Owning upgrade stage retirement unavailable');
    if (checkpoint === undefined) {
      if ((await session.readConfigurationSha256()) !== sha256Hex(upgrade.deployment.configuration))
        throw Error('Upgrade stage configuration differs');
      if ((await session.readPlanApplicationState(action)) !== 'applied')
        throw Error('Upgrade owning application is unresolved');
      checkpoint = {
        schemaVersion: 1,
        status: 'preparing',
        owner: store.owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256: canonicalSha256(upgrade.deployment),
        evidenceSha256,
      };
      await store.write(checkpointName, checkpoint);
    }
    if (object(checkpoint).status === 'preparing') {
      const receipt = validateFinal(await session.plan(env, signal));
      await validate();
      checkpoint = {
        schemaVersion: 1,
        status: 'retiring',
        owner: store.owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256: canonicalSha256(upgrade.deployment),
        evidenceSha256,
        receipt,
        receiptSha256: canonicalSha256(receipt),
      };
      await store.write(checkpointName, checkpoint);
    }
    const { bound, receipt } = validateCheckpoint(checkpoint);
    await validate();
    if (!receipt) throw Error('Upgrade retirement final receipt missing');
    const result = await session.retireArtifacts(receipt, evidenceSha256, env, signal);
    if (
      result.status !== 'runner-artifacts-retired' ||
      result.evidenceSha256 !== evidenceSha256 ||
      result.finalPlanSha256 !== receipt.planSha256
    )
      throw Error('Upgrade stage retirement result differs');
    await store.write(checkpointName, { ...bound, status: 'retired', result });
    return result;
  } finally {
    await release();
  }
}

/** Map discovered stage names only through exact immutable upgrade sources. */
export async function qualifiedAzureTerraformUpgradeStages(
  base: AzureCePlan,
  store: CeDeploymentStore,
  stages: string[],
  contract: VerifiedUpgradeContract,
) {
  const { readdir } = await import('node:fs/promises');
  const sources = (await readdir(store.directory)).filter((name) => /^azure-ce-upgrade-[a-f0-9]{24}\.json$/.test(name));
  const upgrades: AzureTerraformUpgrade[] = [];
  for (const name of sources) {
    const upgrade = (await store.read(name)) as AzureTerraformUpgrade;
    await verifyAzureTerraformUpgrade(base, upgrade, contract);
    if (name !== `${upgrade.planId}.json`) throw Error('Upgrade source file identity differs');
    if (stages.includes(String(upgrade.deployment.stage))) upgrades.push(upgrade);
  }
  if (
    new Set(upgrades.map((u) => u.deployment.stage)).size !== upgrades.length ||
    stages.some((stage) => !upgrades.some((u) => u.deployment.stage === stage))
  )
    throw Error('Unqualified Terraform stage blocks terminal cleanup');
  return upgrades.sort((a, b) => String(a.deployment.stage).localeCompare(String(b.deployment.stage)));
}

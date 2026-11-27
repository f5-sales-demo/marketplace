import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import {
  type AzureCeFailoverPlan,
  azureFailoverOwner,
  validateAzureFailoverCheckpoint,
  validateAzureFailoverReceipt,
  verifyAzureCeFailoverPlan,
} from './failover';
import {
  isAzureFailoverHistoricalArtifact,
  verifyAzureFailoverHistoricalArtifacts,
} from './failover-artifact-provenance';
import { azureRelayHistoricalArtifacts } from './relay-artifact-provenance';
import {
  azureTerraformFailoverDeployment,
  validateAzureTerraformFailoverPlan,
  validateAzureTerraformFailoverRetirement,
} from './terraform-failover';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function optional(store: CeDeploymentStore, name: string) {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
export async function qualifiedAzureTerraformFailoverStages(
  base: AzureCePlan,
  store: CeDeploymentStore,
  stages: string[],
) {
  const sources: AzureCeFailoverPlan[] = [];
  for (const name of (await readdir(store.directory)).filter((name) =>
    /^azure-ce-failover-[a-f0-9]{24}\.json$/.test(name),
  )) {
    const source = (await store.read(name)) as AzureCeFailoverPlan;
    verifyAzureCeFailoverPlan(base, source);
    if (base.engine !== 'terraform' || name !== `${source.planId}.json`) throw Error('Failover stage source differs');
    const stage = `failover-${source.planSha256.slice(0, 24)}`;
    if (stages.includes(stage)) sources.push(source);
  }
  if (
    new Set(sources.map((row) => row.planSha256)).size !== sources.length ||
    new Set(stages).size !== stages.length ||
    stages.some((stage) => !sources.some((row) => stage === `failover-${row.planSha256.slice(0, 24)}`))
  )
    throw Error('Unqualified Terraform failover stage blocks terminal cleanup');
  return sources.sort((a, b) => a.planId.localeCompare(b.planId));
}
/** Caller holds the engine lifecycle lock and supplies separately verified current cloud/platform absence. */
export async function retireAzureTerraformFailoverStage(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  siteUid: string,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  evidenceSha256: string,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  failover = structuredClone(failover);
  env = { ...env };
  verifyAzureCeFailoverPlan(base, failover);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(store.owner) !== canonicalSha256(azureFailoverOwner(base)) ||
    !/^[a-f0-9]{64}$/.test(evidenceSha256)
  )
    throw Error('Failover retirement owner or external absence differs');
  const release = await acquireProcessLock(join(store.directory, '.failover-lock'));
  try {
    const deployment = await azureTerraformFailoverDeployment(base, failover, 'release');
    const name = `${failover.planId}-stage-retirement.json`;
    const validate = async () => {
      signal?.throwIfAborted();
      await store.verify();
      const records = new Map<string, unknown>();
      for (const entry of await readdir(store.directory))
        if (
          isAzureFailoverHistoricalArtifact(entry) ||
          azureRelayHistoricalArtifacts.has(entry) ||
          entry === 'platform-routing.json'
        )
          records.set(entry, await store.read(entry));
      await verifyAzureFailoverHistoricalArtifacts(base, siteUid, records);
      if (
        canonicalSha256(records.get(`${failover.planId}.json`)) !== canonicalSha256(failover) ||
        validateAzureFailoverCheckpoint(base, failover, records.get(`${failover.planId}-checkpoint.json`)).phase !==
          'complete'
      )
        throw Error('Incomplete failover blocks stage retirement');
      validateAzureFailoverReceipt(base, failover, records.get(`${failover.planId}-receipt.json`));
      return await validateAzureTerraformFailoverPlan(
        base,
        failover,
        'release',
        records.get(`${failover.planId}-release-plan.json`),
      );
    };
    const applied = await validate();
    let checkpoint = await optional(store, name);
    if (checkpoint !== undefined)
      await validateAzureTerraformFailoverRetirement(base, failover, checkpoint, evidenceSha256);
    const session = await terraform.open(store.owner, deployment, 'current');
    if (!session.readConfigurationSha256 || !session.retireArtifacts)
      throw Error('Owning failover runner retirement unavailable');
    const bound = {
      schemaVersion: 1,
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      failoverPlanSha256: failover.planSha256,
      deploymentSha256: canonicalSha256(deployment),
      evidenceSha256,
    };
    if (checkpoint === undefined) {
      if ((await session.readConfigurationSha256()) !== hash(deployment.configuration))
        throw Error('Failover stage configuration differs');
      if (!applied.noChanges && (await session.readPlanApplicationState(applied)) !== 'applied')
        throw Error('Failover release application unresolved');
      checkpoint = { ...bound, status: 'preparing' };
      await store.write(name, checkpoint);
    }
    let current = await validateAzureTerraformFailoverRetirement(base, failover, checkpoint, evidenceSha256);
    if (current.status === 'preparing') {
      const receipt = await validateAzureTerraformFailoverPlan(
        base,
        failover,
        'release',
        await session.plan(env, signal),
        true,
      );
      await validate();
      checkpoint = { ...bound, status: 'retiring', receipt, receiptSha256: canonicalSha256(receipt) };
      await store.write(name, checkpoint);
      current = await validateAzureTerraformFailoverRetirement(base, failover, checkpoint, evidenceSha256);
    }
    await validate();
    const result = await session.retireArtifacts(current.receipt as PlanReceipt, evidenceSha256, env, signal);
    signal?.throwIfAborted();
    const retired = { ...current, status: 'retired', result };
    await validateAzureTerraformFailoverRetirement(base, failover, retired, evidenceSha256);
    signal?.throwIfAborted();
    await store.write(name, retired);
    return result;
  } finally {
    await release();
  }
}

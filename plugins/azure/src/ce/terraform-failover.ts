import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { renderTerraformConfigurationJson } from '../../../terraform/src/configuration-json';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import { type AzureCeFailoverPlan, azureFailoverOwner, verifyAzureCeFailoverPlan } from './failover';
import { AZURE_CE_TERRAFORM_VERSION } from './terraform-foundation';
import { AZURE_CE_AZAPI_PROVIDER_VERSION } from './terraform-lifecycle';
import type { AzureCePlan } from './types';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const interruptedApplyMessage = 'Reconcile interrupted Terraform apply before revising configuration';
type Phase = 'stop' | 'start' | 'release';

interface Stage {
  phase: Phase;
  configuration: string;
  configurationSha256: string;
  address: string;
}

function configuration(base: AzureCePlan, failover: AzureCeFailoverPlan, phase: Phase): string {
  const resource =
    phase === 'release'
      ? {}
      : {
          azapi_resource_action: {
            ce_failover: {
              type: 'Microsoft.Compute/virtualMachines@2024-07-01',
              resource_id: failover.vmResourceId,
              action: phase === 'stop' ? 'deallocate' : 'start',
              method: 'POST',
              when: 'apply',
              locks: [failover.vmResourceId],
            },
          },
        };
  return renderTerraformConfigurationJson({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
      },
    },
    provider: { azapi: { subscription_id: base.subscription.id, tenant_id: base.subscription.tenantId } },
    resource,
  });
}

export async function azureTerraformFailoverDeployment(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  phase: Phase = 'stop',
): Promise<Deployment> {
  verifyAzureCeFailoverPlan(base, failover);
  if (base.engine !== 'terraform' || failover.engine !== 'terraform')
    throw new Error('Azure Terraform failover requires Terraform ownership');
  const text = configuration(base, failover, phase);
  const stage = `failover-${failover.planSha256.slice(0, 24)}`;
  return {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: base.subscription.id, region: base.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: text,
    providerLock: await readFile(new URL('../../terraform/azapi-provider-lock.hcl', import.meta.url), 'utf8'),
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
  };
}

function validateReceipt(deployment: Deployment, stage: Stage, receipt: PlanReceipt, final = false) {
  const allowed = stage.phase === 'release' ? ['delete', 'no-op'] : ['create', 'update', 'no-op'];
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    Array.isArray(receipt) ||
    Object.keys(receipt).some(
      (key) =>
        ![
          'schemaVersion',
          'deploymentId',
          'engine',
          'backendIdentity',
          'configurationSha256',
          'providerLockSha256',
          'planSha256',
          'changes',
          'noChanges',
          'actionInvocations',
          'imports',
          'relinquishments',
        ].includes(key),
    ) ||
    receipt.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    typeof receipt.noChanges !== 'boolean' ||
    !Array.isArray(receipt.changes) ||
    [receipt.actionInvocations, receipt.imports, receipt.relinquishments].some(
      (value) => value !== undefined && (!Array.isArray(value) || value.length > 0),
    ) ||
    receipt.changes.some(
      (value) =>
        !value ||
        Object.keys(value).sort().join(',') !== 'actions,address,type' ||
        !Array.isArray(value.actions) ||
        value.actions.length !== 1,
    ) ||
    receipt.noChanges !== receipt.changes.every((value) => value.actions[0] === 'no-op') ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== deployment.deploymentId ||
    receipt.backendIdentity !== deployment.backendIdentity ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    receipt.providerLockSha256 !== digest(deployment.providerLock) ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
    (final
      ? !receipt.noChanges || receipt.changes.length !== 0
      : stage.phase === 'release' && receipt.noChanges && receipt.changes.length === 0
        ? false
        : receipt.changes.length !== 1 ||
          receipt.changes[0].address !== stage.address ||
          receipt.changes[0].type !== 'azapi_resource_action' ||
          receipt.changes[0].actions.length !== 1 ||
          !allowed.includes(receipt.changes[0].actions[0]))
  )
    throw new Error(
      `Azure Terraform failover ${final ? 'final' : stage.phase} plan differs from the exact power action`,
    );
}

/** Recompile exact phase ownership for historical plan receipts; this does not prove application or cloud state. */
export async function validateAzureTerraformFailoverPlan(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  phase: Phase,
  input: unknown,
  final = false,
) {
  if (!['stop', 'start', 'release'].includes(phase) || (final && phase !== 'release'))
    throw Error('Azure Terraform failover plan phase differs');
  const deployment = await azureTerraformFailoverDeployment(base, failover, phase);
  const receipt = structuredClone(input) as PlanReceipt;
  validateReceipt(
    deployment,
    {
      phase,
      configuration: deployment.configuration,
      configurationSha256: digest(deployment.configuration),
      address: 'azapi_resource_action.ce_failover',
    },
    receipt,
    final,
  );
  return receipt;
}

async function optional<T>(storage: Pick<CeDeploymentStore, 'read'>, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Build resumable exact-plan callbacks for the generic Azure failover state machine. */
export async function createAzureTerraformFailoverController(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  terraform: CeTerraformService,
  storage: CeDeploymentStore,
  observeVm: (signal?: AbortSignal) => Promise<unknown>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const deployments = {
    stop: await azureTerraformFailoverDeployment(base, failover, 'stop'),
    start: await azureTerraformFailoverDeployment(base, failover, 'start'),
    release: await azureTerraformFailoverDeployment(base, failover, 'release'),
  };
  const stages = Object.fromEntries(
    (['stop', 'start', 'release'] as const).map((phase) => [
      phase,
      {
        phase,
        configuration: deployments[phase].configuration,
        configurationSha256: digest(deployments[phase].configuration),
        address: 'azapi_resource_action.ce_failover',
      },
    ]),
  ) as Record<Phase, Stage>;
  let session: TerraformSession;
  try {
    session = await terraform.open(storage.owner, deployments.stop, false);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    session = await terraform.open(storage.owner, deployments.stop, 'current');
  }
  const currentSha256 = async () => {
    const value = await session.readConfigurationSha256?.();
    if (!value) throw new Error('Terraform failover configuration identity is unavailable');
    return value;
  };
  const settle = async (phase: 'stop' | 'start', currentSignal?: AbortSignal) => {
    const receipt = await optional<PlanReceipt>(storage, `${failover.planId}-${phase}-plan.json`);
    if (!receipt) return;
    validateReceipt(deployments[phase], stages[phase], receipt);
    if (typeof session.reconcileApplyFromEvidence !== 'function')
      throw new Error('Terraform interrupted failover reconciliation is unavailable');
    await session.reconcileApplyFromEvidence(receipt, canonicalSha256(await observeVm(currentSignal)));
  };
  const select = async (phase: Phase, currentSignal?: AbortSignal) => {
    const desired = stages[phase];
    const current = await currentSha256();
    if (current === desired.configurationSha256) return;
    const predecessor = phase === 'start' ? 'stop' : phase === 'release' ? 'start' : undefined;
    if (!predecessor || current !== stages[predecessor].configurationSha256)
      throw new Error('Terraform failover configuration differs from the exact phase sequence');
    try {
      await session.reviseConfiguration(current, desired.configuration);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== interruptedApplyMessage) throw error;
      await settle(predecessor, currentSignal);
      await session.reviseConfiguration(current, desired.configuration);
    }
  };
  const apply = async (phase: 'stop' | 'start', currentSignal?: AbortSignal) => {
    await select(phase, currentSignal);
    const name = `${failover.planId}-${phase}-plan.json`;
    let receipt = await optional<PlanReceipt>(storage, name);
    if (!receipt) {
      receipt = await session.plan(env, currentSignal ?? signal);
      validateReceipt(deployments[phase], stages[phase], receipt);
      await storage.write(name, receipt);
    } else validateReceipt(deployments[phase], stages[phase], receipt);
    if (!receipt.noChanges) await session.apply(receipt, env, currentSignal ?? signal);
  };
  const release = async (currentSignal?: AbortSignal) => {
    await select('release', currentSignal);
    const receipt = await session.plan(env, currentSignal ?? signal);
    validateReceipt(deployments.release, stages.release, receipt);
    await storage.write(`${failover.planId}-release-plan.json`, receipt);
    if (!receipt.noChanges) await session.apply(receipt, env, currentSignal ?? signal);
    const final = await session.plan(env, currentSignal ?? signal);
    validateReceipt(deployments.release, stages.release, final, true);
    await storage.write(`${failover.planId}-final-plan.json`, final);
  };
  return { mutate: apply, release };
}

/** Exact historical terminal journal. The owning runner separately verifies empty state and independent cleanup. */
export async function validateAzureTerraformFailoverRetirement(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  input: unknown,
  evidenceSha256?: string,
) {
  const deployment = await azureTerraformFailoverDeployment(base, failover, 'release');
  const value = input as Record<string, unknown>;
  const required = [
    'schemaVersion',
    'status',
    'owner',
    'sourcePlanSha256',
    'failoverPlanSha256',
    'deploymentSha256',
    'evidenceSha256',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => ![...required, 'receipt', 'receiptSha256', 'result'].includes(key)) ||
    value.schemaVersion !== 1 ||
    !['preparing', 'retiring', 'retired'].includes(String(value.status)) ||
    canonicalSha256(value.owner) !== canonicalSha256(azureFailoverOwner(base)) ||
    value.sourcePlanSha256 !== base.planSha256 ||
    value.failoverPlanSha256 !== failover.planSha256 ||
    value.deploymentSha256 !== canonicalSha256(deployment) ||
    typeof value.evidenceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.evidenceSha256) ||
    (evidenceSha256 !== undefined && value.evidenceSha256 !== evidenceSha256)
  )
    throw Error('Failover stage retirement checkpoint differs');
  if (value.status === 'preparing') {
    if (value.receipt !== undefined || value.receiptSha256 !== undefined || value.result !== undefined)
      throw Error('Preparing failover retirement has terminal evidence');
  } else {
    await validateAzureTerraformFailoverPlan(base, failover, 'release', value.receipt, true);
    if (value.receiptSha256 !== canonicalSha256(value.receipt)) throw Error('Failover retirement final digest differs');
    if (value.status === 'retiring' && value.result !== undefined)
      throw Error('Uncommitted failover retirement result');
    if (value.status === 'retired') {
      const result = value.result as Record<string, unknown>;
      const { configuration, providerLock, ...identity } = deployment;
      if (
        !result ||
        Object.keys(result).sort().join(',') !==
          'evidenceSha256,finalPlanSha256,independentCleanupSha256,inventorySha256,manifestSha256,retiredArtifacts,status' ||
        result.status !== 'runner-artifacts-retired' ||
        result.evidenceSha256 !== value.evidenceSha256 ||
        result.finalPlanSha256 !== (value.receipt as PlanReceipt).planSha256 ||
        result.manifestSha256 !==
          canonicalSha256({
            ...identity,
            configurationSha256: digest(configuration),
            providerLockSha256: digest(providerLock),
          }) ||
        ![result.inventorySha256, result.independentCleanupSha256].every(
          (sha) => typeof sha === 'string' && /^[a-f0-9]{64}$/.test(sha),
        ) ||
        !Number.isSafeInteger(result.retiredArtifacts) ||
        Number(result.retiredArtifacts) < 0
      )
        throw Error('Failover runner retirement result differs');
    }
  }
  return structuredClone(value);
}

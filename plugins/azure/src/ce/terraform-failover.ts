import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import { type AzureCeFailoverPlan, verifyAzureCeFailoverPlan } from './failover';
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
  return JSON.stringify({
    terraform: {
      required_version: '= 1.16.1',
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
    terraformVersion: '1.16.1',
    configuration: text,
    providerLock: await readFile(new URL('../../terraform/azapi-provider-lock.hcl', import.meta.url), 'utf8'),
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
  };
}

function validateReceipt(deployment: Deployment, stage: Stage, receipt: PlanReceipt, final = false) {
  const allowed = stage.phase === 'release' ? ['delete', 'no-op'] : ['create', 'update', 'no-op'];
  if (
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

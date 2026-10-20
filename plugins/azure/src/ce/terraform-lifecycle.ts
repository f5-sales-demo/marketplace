import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { assertActionOwnership } from './apply';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { collectAzureNativeVmState, listAzureNativeVms } from './native-workflow';
import { collectAzurePlatformHealth } from './platform-health';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeAction, AzureCePlan } from './types';

export const AZURE_CE_AZAPI_PROVIDER_VERSION = '2.12.0';
const AZURE_COMPUTE_API_VERSION = '2024-07-01';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const interruptedApplyMessage = 'Reconcile interrupted Terraform apply before revising configuration';
type LifecycleOperation = 'start' | 'stop' | 'resize';

interface LifecycleCheckpoint {
  schemaVersion: 1;
  engine: 'terraform';
  planSha256: string;
  completedNodes: number[];
  state: 'running' | 'complete';
}

function lifecycleOperation(plan: AzureCePlan): LifecycleOperation {
  if (!['start', 'stop', 'resize'].includes(plan.intent.operation))
    throw new Error('Azure Terraform lifecycle supports start, stop, or resize plans');
  return plan.intent.operation as LifecycleOperation;
}

function mutationFor(plan: AzureCePlan, node: number) {
  const operation = lifecycleOperation(plan);
  const action = plan.actions.find(
    (candidate) =>
      candidate.node === node &&
      candidate.kind === (operation === 'start' ? 'vm-start' : operation === 'stop' ? 'vm-stop' : 'vm-resize'),
  );
  const gate = plan.actions.find((candidate) => candidate.node === node && candidate.kind === 'vm-state-gate');
  if (!action?.resourceId || !gate?.expectedOwnerPlanSha256 || !gate.expectedPowerState)
    throw new Error('Azure Terraform lifecycle node identity is incomplete');
  return { action, gate };
}

function configuration(plan: AzureCePlan, node: number, includeMutation: boolean): string {
  const { action } = mutationFor(plan, node);
  const operation = lifecycleOperation(plan);
  const type = operation === 'resize' ? 'azapi_update_resource' : 'azapi_resource_action';
  const value =
    operation === 'resize'
      ? {
          type: `Microsoft.Compute/virtualMachines@${AZURE_COMPUTE_API_VERSION}`,
          resource_id: action.resourceId,
          body: { properties: { hardwareProfile: { vmSize: plan.vm.size } } },
          locks: [action.resourceId],
        }
      : {
          type: `Microsoft.Compute/virtualMachines@${AZURE_COMPUTE_API_VERSION}`,
          resource_id: action.resourceId,
          action: operation === 'stop' ? 'deallocate' : 'start',
          method: 'POST',
          when: 'apply',
          locks: [action.resourceId],
        };
  return JSON.stringify({
    terraform: {
      required_version: '= 1.16.1',
      required_providers: {
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
      },
    },
    provider: { azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId } },
    resource: includeMutation ? { [type]: { ce: value } } : {},
  });
}

export async function azureTerraformLifecycleDeployment(
  plan: AzureCePlan,
  node: number,
  includeMutation = true,
): Promise<Deployment> {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform lifecycle requires Terraform ownership');
  mutationFor(plan, node);
  const stage = `lifecycle-${plan.planSha256.slice(0, 16)}-node-${node}`;
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: '1.16.1',
    configuration: configuration(plan, node, includeMutation),
    providerLock: await readFile(new URL('../../terraform/azapi-provider-lock.hcl', import.meta.url), 'utf8'),
    backendIdentity: `local:${plan.deploymentName}:stage:${stage}`,
  };
}

function validateReceipt(
  deployment: Deployment,
  receipt: PlanReceipt,
  phase: 'mutation' | 'release' | 'final',
  operation: LifecycleOperation,
) {
  const type = operation === 'resize' ? 'azapi_update_resource' : 'azapi_resource_action';
  const address = `${type}.ce`;
  const allowed = phase === 'mutation' ? ['create', 'update', 'no-op'] : phase === 'release' ? ['delete', 'no-op'] : [];
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== deployment.deploymentId ||
    receipt.backendIdentity !== deployment.backendIdentity ||
    receipt.configurationSha256 !== digest(deployment.configuration) ||
    receipt.providerLockSha256 !== digest(deployment.providerLock) ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
    (phase === 'final'
      ? !receipt.noChanges || receipt.changes.length !== 0
      : phase === 'release' && receipt.noChanges && receipt.changes.length === 0
        ? false
        : receipt.changes.length !== 1 ||
          receipt.changes[0].address !== address ||
          receipt.changes[0].type !== type ||
          receipt.changes[0].actions.length !== 1 ||
          !allowed.includes(receipt.changes[0].actions[0]))
  )
    throw new Error(`Azure Terraform lifecycle ${phase} plan differs from the exact isolated action`);
}

async function openStage(
  terraform: CeTerraformService,
  plan: AzureCePlan,
  node: number,
): Promise<{ session: TerraformSession; deployment: Deployment }> {
  const deployment = await azureTerraformLifecycleDeployment(plan, node);
  const owner = azureUpgradeBinding(plan).owner;
  try {
    return { session: await terraform.open(owner, deployment, false), deployment };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return { session: await terraform.open(owner, deployment, 'current'), deployment };
  }
}

async function pollVm(
  plan: AzureCePlan,
  gate: AzureCeAction,
  api: AzExecApi,
  storage: CeDeploymentStore,
  signal: AbortSignal | undefined,
  polling: { attempts: number; intervalMs: number; wait(ms: number): Promise<void> },
) {
  for (let attempt = 0; attempt < polling.attempts; attempt++) {
    signal?.throwIfAborted();
    const evidence = await collectAzureNativeVmState(plan, gate, api, signal);
    await storage.write(`${plan.planId}-node-${gate.node}-vm-state.json`, evidence);
    if (evidence.status === 'healthy') return evidence;
    if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
  }
  throw new Error('Observed Azure VM lifecycle state has not converged');
}

async function reconcileInterruptedApply(
  session: TerraformSession,
  receipt: PlanReceipt,
  evidence: unknown,
): Promise<void> {
  if (typeof session.reconcileApplyFromEvidence !== 'function')
    throw new Error('Terraform interrupted apply reconciliation is unavailable');
  await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
}

/** Run exact isolated AzAPI plans, remove their state-only controls, and finish with a refresh no-change plan. */
export async function runAzureTerraformLifecycle(
  plan: AzureCePlan,
  terraform: CeTerraformService,
  runtime: Pick<CeRuntime, 'engine' | 'observeHealth' | 'observeRegistrations'>,
  storage: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  polling: { attempts: number; intervalMs: number; wait(ms: number): Promise<void> } = {
    attempts: 90,
    intervalMs: 10_000,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAzureCePlan(plan);
  const operation = lifecycleOperation(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform' || storage.owner.engine !== 'terraform')
    throw new Error('Only the owning Terraform engine may run Azure lifecycle operations');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Azure Terraform lifecycle convergence bounds are invalid');
  const expectedOwner = azureUpgradeBinding(plan).owner;
  if (canonicalSha256(storage.owner) !== canonicalSha256(expectedOwner))
    throw new Error('Azure Terraform lifecycle storage ownership differs');
  const releaseLock = await acquireProcessLock(`${storage.directory}/.terraform-lifecycle-lock`);
  try {
    await storage.verify();
    const checkpointName = `${plan.planId}-terraform-lifecycle.json`;
    let checkpoint: LifecycleCheckpoint;
    try {
      checkpoint = (await storage.read(checkpointName)) as LifecycleCheckpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: plan.planSha256,
        completedNodes: [],
        state: 'running',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.planSha256 !== plan.planSha256 ||
      !Array.isArray(checkpoint.completedNodes) ||
      checkpoint.completedNodes.some((node, index) => node !== index + 1 || node > plan.topology.nodeCount) ||
      !['running', 'complete'].includes(checkpoint.state)
    )
      throw new Error('Azure Terraform lifecycle checkpoint differs');
    // Re-observe completed nodes on every invocation. The same plan remains an idempotent
    // desired-state operation if cloud state changes after an earlier completion.
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const { action, gate } = mutationFor(plan, node);
      await assertActionOwnership(plan, action, api);
      let observed = await collectAzureNativeVmState(plan, gate, api, signal);
      const opened = await openStage(terraform, plan, node);
      const empty = await azureTerraformLifecycleDeployment(plan, node, false);
      let currentSha256 = await opened.session.readConfigurationSha256?.();
      if (!currentSha256) throw new Error('Terraform lifecycle configuration identity is unavailable');
      if (observed.status !== 'healthy') {
        let resumeReceipt: PlanReceipt | undefined;
        if (currentSha256 === digest(empty.configuration)) {
          await opened.session.reviseConfiguration(currentSha256, opened.deployment.configuration);
          currentSha256 = digest(opened.deployment.configuration);
        } else if (currentSha256 !== digest(opened.deployment.configuration)) {
          throw new Error('Terraform lifecycle configuration differs from the isolated action');
        } else {
          try {
            resumeReceipt = (await storage.read(`${plan.planId}-node-${node}-mutation-plan.json`)) as PlanReceipt;
            validateReceipt(opened.deployment, resumeReceipt, 'mutation', operation);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
        const receipt = resumeReceipt ?? (await opened.session.plan(env, signal));
        validateReceipt(opened.deployment, receipt, 'mutation', operation);
        if (!resumeReceipt) await storage.write(`${plan.planId}-node-${node}-mutation-plan.json`, receipt);
        if (!receipt.noChanges)
          try {
            await opened.session.apply(receipt, env, signal);
          } catch (error) {
            try {
              observed = await pollVm(plan, gate, api, storage, signal, polling);
            } catch {
              throw error;
            }
            await reconcileInterruptedApply(opened.session, receipt, observed);
          }
        if (observed.status !== 'healthy') observed = await pollVm(plan, gate, api, storage, signal, polling);
      }
      currentSha256 = await opened.session.readConfigurationSha256?.();
      if (!currentSha256) throw new Error('Terraform lifecycle configuration identity is unavailable');
      if (currentSha256 === digest(opened.deployment.configuration)) {
        try {
          await opened.session.reviseConfiguration(currentSha256, empty.configuration);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== interruptedApplyMessage) throw error;
          const receipt = (await storage.read(`${plan.planId}-node-${node}-mutation-plan.json`)) as PlanReceipt;
          validateReceipt(opened.deployment, receipt, 'mutation', operation);
          await storage.write(`${plan.planId}-node-${node}-vm-state.json`, observed);
          await reconcileInterruptedApply(opened.session, receipt, observed);
          await opened.session.reviseConfiguration(currentSha256, empty.configuration);
        }
        const release = await opened.session.plan(env, signal);
        validateReceipt(empty, release, 'release', operation);
        await storage.write(`${plan.planId}-node-${node}-release-plan.json`, release);
        if (!release.noChanges) await opened.session.apply(release, env, signal);
      } else if (currentSha256 !== digest(empty.configuration)) {
        throw new Error('Terraform lifecycle release configuration differs');
      }
      const final = await opened.session.plan(env, signal);
      validateReceipt(empty, final, 'final', operation);
      await storage.write(`${plan.planId}-node-${node}-final-plan.json`, final);
      if (operation !== 'stop') {
        const vms = await listAzureNativeVms(plan, api);
        const health = await collectAzurePlatformHealth(plan, vms, runtime, signal, node);
        await storage.write(`${plan.planId}-node-${node}-platform-health.json`, health);
        if (health.status !== 'healthy') throw new Error('Observed Azure platform health has not converged');
      }
      if (!checkpoint.completedNodes.includes(node)) {
        checkpoint.completedNodes.push(node);
        await storage.write(checkpointName, checkpoint);
      }
    }
    checkpoint.state = 'complete';
    await storage.write(checkpointName, checkpoint);
    return {
      planId: plan.planId,
      planSha256: plan.planSha256,
      engine: 'terraform' as const,
      status: 'complete' as const,
    };
  } finally {
    await releaseLock();
  }
}

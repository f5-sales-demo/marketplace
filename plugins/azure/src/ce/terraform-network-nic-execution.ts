import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  captureAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import { validateAzureNetworkUpdateTerraformReceipt } from './network-update-terraform';
import { bindAzureTerraformNetworkNicPlan } from './terraform-network-nic-binding';
import {
  AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
  azureTerraformNetworkNicSelections,
  validateAzureTerraformNetworkNicProjection,
} from './terraform-network-nic-projection';
import { observeAzureTerraformNetworkPower } from './terraform-network-power';
import { buildAzureTerraformNetworkPinnedNicStage } from './terraform-network-routing';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = canonicalEqual;
const lower = (value: string) => value.toLowerCase();
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network NIC execution: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete object required');
  return value as Record<string, unknown>;
}
async function optional(store: CeDeploymentStore, name: string): Promise<unknown | undefined> {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Internal owning NIC stage. The public serial driver separately qualifies full source history and CE health/traffic. */
export async function runAzureTerraformNetworkNicStage(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  node: number,
  appliedNics: string[],
  session: TerraformSession,
  store: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  polling = {
    attempts: 90,
    intervalMs: 10_000,
    wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  },
) {
  const stage = buildAzureTerraformNetworkPinnedNicStage(plan, source, before, node);
  require(same(store.owner, azureUpgradeBinding(plan).owner), 'storage owner differs');
  const priorKeys = Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  require(same(appliedNics, priorKeys), 'complete serial predecessor NIC boundary required');
  require(Number.isInteger(polling.attempts) &&
    polling.attempts > 0 &&
    Number.isFinite(polling.intervalMs) &&
    polling.intervalMs >= 0, 'invalid convergence bounds');
  require(session.readPlannedResourcePaths &&
    session.readProposedResourcePaths, 'owning private paths capability required');
  const selectedKeys = plan.nics.map((nic) => `${node}:${nic.index}`),
    targetKeys = [...appliedNics, ...selectedKeys];
  const baseline = (inventory: AzureNetworkUpdateInventory) =>
    Object.entries(before.nodes[String(node)].nics).every(([index, nic]) => {
      const current = inventory.nodes[String(node)].nics[index];
      return lower(current.subnetId) === lower(nic.subnetId) && current.privateIp === nic.privateIp;
    });
  const observe = async () => {
    signal?.throwIfAborted();
    const deadline = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]);
    const bounded: AzExecApi = {
      async exec(command, args) {
        deadline.throwIfAborted();
        let rejectAbort: ((reason: unknown) => void) | undefined;
        const aborted = new Promise<never>((_, reject) => {
          rejectAbort = reject;
        });
        const onAbort = () => rejectAbort?.(deadline.reason);
        deadline.addEventListener('abort', onAbort, { once: true });
        try {
          const response = await Promise.race([api.exec(command, args, { signal: deadline }), aborted]);
          deadline.throwIfAborted();
          return response;
        } finally {
          deadline.removeEventListener('abort', onAbort);
        }
      },
    };
    const inventory = await captureAzureNetworkUpdateInventory(plan, bounded, deadline);
    // Only selected NICs may cross before/target boundaries during submitted reconciliation.
    const reached = selectedKeys.filter((key) => {
      const index = key.split(':')[1];
      return (
        lower(inventory.nodes[String(node)].nics[index].subnetId) ===
        lower(before.nodes[String(node)].nics[index].targetSubnetId)
      );
    });
    const progress = [...appliedNics, ...reached];
    verifyAzureNetworkUpdateProgress(plan, before, inventory, progress);
    for (const [owner, vm] of Object.entries(before.nodes))
      for (const [index, nic] of Object.entries(vm.nics))
        if (!progress.includes(`${owner}:${index}`))
          require(inventory.nodes[owner].nics[index].privateIp === nic.privateIp, 'unsubmitted NIC private IP changed');
    const power = await observeAzureTerraformNetworkPower(
      plan,
      before,
      node,
      'deallocate',
      progress,
      bounded,
      deadline,
    );
    require(same(power.inventory.nodes, inventory.nodes), 'cloud identity changed between NIC and power observations');
    require(power.converged && power.powerState === 'deallocated', 'selected VM is not deallocated');
    return {
      ...power,
      appliedNics: progress,
      nicConverged: reached.length === selectedKeys.length,
      baseline: baseline(power.inventory),
    };
  };
  const poll = async () => {
    for (let i = 0; i < polling.attempts; i++) {
      signal?.throwIfAborted();
      const cloud = await observe();
      if (cloud.nicConverged) return cloud;
      if (i + 1 < polling.attempts) await polling.wait(polling.intervalMs);
    }
    throw Error('Azure Terraform network NIC execution: selected NIC subnets have not converged');
  };
  const validateCloud = (input: unknown) => {
    const value = object(input);
    require(same(
      Object.keys(value).sort(),
      [
        'appliedNics',
        'baseline',
        'converged',
        'engine',
        'inventory',
        'nicConverged',
        'node',
        'observedAt',
        'operation',
        'ownerPlanSha256',
        'planSha256',
        'powerState',
        'resourceId',
        'vmId',
      ].sort(),
    ), 'saved cloud schema differs');
    const cloud = input as Awaited<ReturnType<typeof observe>>;
    require(cloud.engine === 'terraform' &&
      cloud.planSha256 === plan.planSha256 &&
      cloud.node === node &&
      cloud.operation === 'deallocate' &&
      cloud.resourceId === before.nodes[String(node)].resourceId &&
      cloud.vmId === before.nodes[String(node)].vmId &&
      cloud.ownerPlanSha256 === before.nodes[String(node)].ownerPlanSha256 &&
      cloud.powerState === 'deallocated' &&
      cloud.converged === true &&
      cloud.nicConverged === true &&
      same(cloud.appliedNics, targetKeys) &&
      typeof cloud.observedAt === 'string' &&
      Number.isFinite(Date.parse(cloud.observedAt)), 'saved convergence identity differs');
    verifyAzureNetworkUpdateProgress(plan, before, cloud.inventory, targetKeys);
    require(cloud.baseline === baseline(cloud.inventory), 'saved baseline differs');
    return cloud;
  };
  signal?.throwIfAborted();
  await store.verify();
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-nic-lock`);
  try {
    signal?.throwIfAborted();
    await store.verify();
    const prefix = `${plan.planId}-terraform-network-node-${node}`;
    const configuration = async () => {
      const current = await session.readConfigurationSha256?.();
      require(current === stage.previousConfigurationSha256 ||
        current === stage.configurationSha256, 'private configuration differs');
      return current;
    };
    await configuration();
    const prepared = {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      inventorySha256: canonicalSha256(before),
      appliedNics,
      stage,
    };
    const savedPrepared = await optional(store, `${prefix}-prepared.json`);
    if (savedPrepared === undefined) {
      for (const suffix of [
        'mutation-plan',
        'mutation-outcome',
        'mutation-complete',
        'final-plan',
        'current-no-change-plan',
        'nic-binding',
      ])
        require((await optional(store, `${prefix}-${suffix}.json`)) ===
          undefined, 'prepared history missing after later stage publication');
      require((await configuration()) ===
        stage.previousConfigurationSha256, 'target revision lacks original prepared history');
      require((await observe()).baseline, 'unsubmitted cloud baseline differs');
      require((await session.readConfiguration(stage.previousConfigurationSha256)) ===
        source, 'retained source bytes differ');
      await store.write(`${prefix}-prepared.json`, prepared);
    } else require(same(savedPrepared, prepared), 'saved prepared stage differs');
    if ((await configuration()) !== stage.configurationSha256) {
      require((await observe()).baseline, 'cloud changed before configuration revision');
      await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
    }
    require((await configuration()) === stage.configurationSha256, 'NIC revision differs');
    let mutation = await optional(store, `${prefix}-mutation-plan.json`);
    if (mutation === undefined) {
      require((await observe()).baseline, 'unsubmitted NIC baseline differs');
      mutation = await session.plan(env, signal);
      validateAzureNetworkUpdateTerraformReceipt(
        plan,
        stage,
        mutation as PlanReceipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      );
      await store.write(`${prefix}-mutation-plan.json`, mutation);
    }
    const receipt = mutation as PlanReceipt;
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    await bindAzureTerraformNetworkNicPlan(
      plan,
      stage,
      before,
      receipt,
      AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      session,
      store,
      env,
      signal,
    );
    const validateCompletion = (input: unknown) => {
      const value = object(input);
      require(same(Object.keys(value).sort(), ['outcome', 'receiptSha256', 'schemaVersion']) &&
        value.schemaVersion === 1 &&
        value.receiptSha256 === canonicalSha256(receipt), 'saved mutation completion differs');
      return validateCloud(value.outcome);
    };
    const completion = await optional(store, `${prefix}-mutation-complete.json`);
    if (completion === undefined) {
      let state = await session.readPlanApplicationState(receipt);
      require(['planned', 'applying', 'applied'].includes(state), 'mutation application state unavailable');
      if (state === 'planned') {
        require((await observe()).baseline, 'planned NIC baseline changed');
        if (!receipt.noChanges) {
          require((await configuration()) === stage.configurationSha256, 'configuration changed before apply');
          try {
            await session.apply(receipt, env, signal);
          } catch (error) {
            signal?.throwIfAborted();
            state = await session.readPlanApplicationState(receipt);
            if (state !== 'applying' && state !== 'applied') throw error;
          }
          state = await session.readPlanApplicationState(receipt);
        }
      }
      const outcome = await poll();
      validateCloud(outcome);
      await store.write(`${prefix}-mutation-outcome.json`, outcome);
      if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(outcome));
      else require(receipt.noChanges || state === 'applied', 'mutation has no authoritative submitted outcome');
      const completed = { schemaVersion: 1, receiptSha256: canonicalSha256(receipt), outcome };
      validateCompletion(completed);
      await store.write(`${prefix}-mutation-complete.json`, completed);
    } else validateCompletion(completion);
    const cloud = await poll();
    require((await configuration()) === stage.configurationSha256, 'completed NIC configuration changed');
    const final = await session.plan(env, signal);
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, final, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    require(final.noChanges, 'final refresh plan changes retained resources');
    const selections = azureTerraformNetworkNicSelections(plan, stage, cloud.inventory);
    const prior = await session.readPlannedResourcePaths(final, selections.prior, env, signal),
      proposed = await session.readProposedResourcePaths(final, selections.proposed, env, signal);
    validateAzureTerraformNetworkNicProjection(
      plan,
      stage,
      cloud.inventory,
      final,
      AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      prior,
      proposed,
    );
    const terminalCloud = await poll();
    require(same(
      terminalCloud.inventory.nodes,
      cloud.inventory.nodes,
    ), 'final NIC identity changed during plan projection');
    const terminal = { schemaVersion: 1, receipt: final, cloud: terminalCloud, prior, proposed };
    const validateTerminal = (input: unknown) => {
      const value = object(input);
      require(same(Object.keys(value).sort(), ['cloud', 'prior', 'proposed', 'receipt', 'schemaVersion']) &&
        value.schemaVersion === 1, 'saved final schema differs');
      const observed = validateCloud(value.cloud),
        finalReceipt = value.receipt as PlanReceipt;
      validateAzureNetworkUpdateTerraformReceipt(plan, stage, finalReceipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
      require(finalReceipt.noChanges, 'saved final plan changes retained resources');
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        observed.inventory,
        finalReceipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        value.prior,
        value.proposed,
      );
    };
    validateTerminal(terminal);
    const savedFinal = await optional(store, `${prefix}-final-plan.json`);
    if (savedFinal === undefined) await store.write(`${prefix}-final-plan.json`, terminal);
    else validateTerminal(savedFinal);
    await store.write(`${prefix}-current-no-change-plan.json`, terminal);
    return {
      status: 'nic-stage-complete' as const,
      engine: 'terraform' as const,
      planSha256: plan.planSha256,
      node,
      resourceId: terminalCloud.resourceId,
      vmId: terminalCloud.vmId,
      mutationPlanSha256: receipt.planSha256,
      currentNoChangePlanSha256: final.planSha256,
      cloudEvidenceSha256: canonicalSha256(terminalCloud),
    };
  } finally {
    await unlock();
  }
}

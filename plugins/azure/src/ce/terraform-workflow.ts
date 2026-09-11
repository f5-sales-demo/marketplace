import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { assertAzureCeRoutingExecutable } from './apply';
import { verifyAzureCePlan } from './artifacts';
import { configureAzureRouteServerRouting } from './routing-workflow';
import { azureTerraformFoundationDeployment, renderAzureTerraformFoundation } from './terraform-foundation';
import { discoverAzureTerraformInterfaces } from './terraform-identities';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
interface WorkflowCheckpoint {
  schemaVersion: 1;
  engine: 'terraform';
  planSha256: string;
  configurationSha256: string;
  bootstrapByNode: Record<string, string>;
  launchedAtByNode: Record<string, string>;
  stage: 'network-pending' | 'registration-pending' | 'registered';
}

const waitUntil = async (notBefore: number, signal?: AbortSignal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Azure Terraform HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};

/** Execute Azure foundation and admission without caller-provided bootstrap or health claims. */
export async function runAzureTerraformAdmission(
  plan: AzureCePlan,
  terraform: CeTerraformService,
  runtime: Pick<
    CeRuntime,
    | 'engine'
    | 'requireBootstrapContract'
    | 'requireRoutingContract'
    | 'reserveSite'
    | 'bootstrap'
    | 'approveRegistrations'
    | 'observeRegistrations'
    | 'observeRegisteredConfiguration'
    | 'observeAzureInterfaces'
    | 'ensureAzureRouting'
    | 'observeBgpSessions'
    | 'observeBgpRoutes'
  >,
  storage: Pick<CeDeploymentStore, 'read' | 'write' | 'verify'>,
  api: AzExecApi,
  revalidate: () => Promise<void>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  haSerialDelayMs = 180_000,
) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform')
    throw new Error('Azure Terraform workflow requires Terraform ownership');
  assertAzureCeRoutingExecutable(plan);
  runtime.requireBootstrapContract('azure');
  if (plan.routing.mode === 'route-server') runtime.requireRoutingContract('azure');
  const binding = azureUpgradeBinding(plan);
  const initial = renderAzureTerraformFoundation(plan);
  await storage.verify();
  let checkpoint: WorkflowCheckpoint;
  try {
    checkpoint = (await storage.read('terraform-workflow.json')) as WorkflowCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      configurationSha256: hash(initial),
      bootstrapByNode: {},
      launchedAtByNode: {},
      stage: 'network-pending',
    };
    await storage.write('terraform-workflow.json', checkpoint);
  }
  // Checkpoints written before serial HA admission did not record launch boundaries.
  checkpoint.launchedAtByNode ??= {};
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(checkpoint.configurationSha256) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    Object.keys(checkpoint.bootstrapByNode).some(
      (node, index) => !/^[1-3]$/.test(node) || Number(node) > plan.topology.nodeCount || Number(node) !== index + 1,
    ) ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, launchedAt]) =>
        !/^[1-3]$/.test(node) ||
        Number(node) > plan.topology.nodeCount ||
        !checkpoint.bootstrapByNode[node] ||
        Number.isNaN(Date.parse(launchedAt)),
    ) ||
    !['network-pending', 'registration-pending', 'registered'].includes(checkpoint.stage)
  )
    throw new Error('Azure Terraform workflow checkpoint differs from the owning plan');
  const save = () => storage.write('terraform-workflow.json', checkpoint);
  signal?.throwIfAborted();
  let session: TerraformSession;
  if (checkpoint.stage === 'network-pending') {
    const deployment = await azureTerraformFoundationDeployment(plan);
    try {
      session = await terraform.open(binding.owner, deployment, false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      session = await terraform.open(binding.owner, deployment, 'current');
    }
    await revalidate();
    const receipt = await session.plan(env, signal);
    if (
      receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
    )
      throw new Error('Azure Terraform foundation would mutate existing resources');
    await storage.write('terraform-foundation-plan.json', receipt);
    await storage.verify();
    await revalidate();
    if (!receipt.noChanges) await session.apply(receipt, env, signal);
    await storage.verify();
    await revalidate();
    await runtime.reserveSite(binding, (record) => storage.write('terraform-site.json', record), signal);
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      signal?.throwIfAborted();
      await storage.verify();
      await revalidate();
      const previous = node - 1;
      if (plan.topology.ha && previous > 0) {
        const launchedAt = checkpoint.launchedAtByNode[String(previous)];
        if (!launchedAt) throw new Error('Prior Azure HA node launch boundary is unavailable');
        await waitUntil(Date.parse(launchedAt) + haSerialDelayMs, signal);
      }
      if (!checkpoint.bootstrapByNode[String(node)]) {
        const nodeName = `${plan.deploymentName}-${node}`;
        const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
        checkpoint.bootstrapByNode[String(node)] = await runtime.bootstrap(
          binding,
          nodeName,
          tokenName,
          (secret) => storage.write(`${tokenName}.json`, secret),
          signal,
        );
        await save();
      }
      const admittedBootstrap = Object.fromEntries(
        Array.from({ length: node }, (_, index) => {
          const current = String(index + 1);
          return [current, checkpoint.bootstrapByNode[current]];
        }),
      );
      const configuration = renderAzureTerraformFoundation(plan, admittedBootstrap);
      const nextHash = hash(configuration);
      if (checkpoint.configurationSha256 !== nextHash) {
        try {
          await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
          // A prior run may have committed the exact desired revision before checkpointing.
          await session.reviseConfiguration(nextHash, configuration);
        }
        checkpoint.configurationSha256 = nextHash;
        await save();
      }
      const admission = await session.plan(env, signal);
      if (
        admission.changes.some((change) =>
          change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)),
        )
      )
        throw new Error('Azure Terraform admission would alter or replace an existing resource');
      await storage.write(`terraform-admission-plan-node-${node}.json`, admission);
      await storage.verify();
      await revalidate();
      if (!admission.noChanges) await session.apply(admission, env, signal);
      checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
      await save();
    }
    checkpoint.stage = 'registration-pending';
    await save();
  } else {
    session = await terraform.open(
      binding.owner,
      await azureTerraformFoundationDeployment(plan, checkpoint.bootstrapByNode),
      'current',
    );
  }
  await revalidate();
  const outputs = await session.readOutputs(['ce_interfaces', 'ce_instances'], env, signal);
  const discovered = await discoverAzureTerraformInterfaces(plan, outputs, api, signal);
  const instances = outputs.ce_instances as Record<string, { vm_id?: string }>;
  const expectedInstances = Object.fromEntries(
    binding.nodes.map((node, index) => [node, instances[String(index + 1)]?.vm_id]),
  );
  if (Object.values(expectedInstances).some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? '')))
    throw new Error('Azure Terraform admitted VM identities are unavailable');
  const expectedInterfaces = discovered.interfaces
    .filter((item) => item.role === 'slo' || item.role === 'sli')
    .map((item) => ({ node: `${plan.deploymentName}-${item.node}`, role: item.role as 'slo' | 'sli', mac: item.mac }));
  const registrations = await runtime.approveRegistrations(
    binding,
    expectedInstances as Record<string, string>,
    (record) => storage.write('terraform-registration.json', record),
    signal,
  );
  const configuration = await runtime.observeRegisteredConfiguration(
    binding,
    expectedInstances as Record<string, string>,
    expectedInterfaces,
    signal,
  );
  const current = await runtime.observeRegistrations(binding, expectedInstances as Record<string, string>, signal);
  checkpoint.stage =
    configuration.status === 'configured' && current.status === 'healthy' ? 'registered' : 'registration-pending';
  await save();
  let routing: 'healthy' | 'unknown' = 'unknown';
  if (plan.routing.mode === 'route-server' && checkpoint.stage === 'registered') {
    const evidence = await configureAzureRouteServerRouting(plan, expectedInterfaces, runtime, storage, api, signal);
    if (evidence.status !== 'healthy') throw new Error('Azure Route Server BGP and learned routes have not converged');
    routing = 'healthy';
  }
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: 'terraform' as const,
    status: checkpoint.stage === 'registered' ? ('registered' as const) : ('pending-registration' as const),
    registrations: current.status === 'healthy' ? current : registrations,
    configuration,
    routing,
    traffic: 'unknown' as const,
  };
}

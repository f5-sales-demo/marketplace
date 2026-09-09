import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { assertAzureCeRoutingExecutable } from './apply';
import { verifyAzureCePlan } from './artifacts';
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
  stage: 'network-pending' | 'registration-pending' | 'registered';
}

/** Execute Azure foundation and admission without caller-provided bootstrap or health claims. */
export async function runAzureTerraformAdmission(
  plan: AzureCePlan,
  terraform: CeTerraformService,
  runtime: Pick<
    CeRuntime,
    | 'engine'
    | 'requireBootstrapContract'
    | 'reserveSite'
    | 'bootstrap'
    | 'approveRegistrations'
    | 'observeRegistrations'
    | 'observeRegisteredConfiguration'
  >,
  storage: Pick<CeDeploymentStore, 'read' | 'write' | 'verify'>,
  api: AzExecApi,
  revalidate: () => Promise<void>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform')
    throw new Error('Azure Terraform workflow requires Terraform ownership');
  assertAzureCeRoutingExecutable(plan);
  runtime.requireBootstrapContract('azure');
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
      stage: 'network-pending',
    };
    await storage.write('terraform-workflow.json', checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(checkpoint.configurationSha256) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
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
    await session.apply(receipt, env, signal);
    await runtime.reserveSite(binding, (record) => storage.write('terraform-site.json', record), signal);
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      if (checkpoint.bootstrapByNode[String(node)]) continue;
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
    const configuration = renderAzureTerraformFoundation(plan, checkpoint.bootstrapByNode);
    const nextHash = hash(configuration);
    try {
      await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
      await session.reviseConfiguration(nextHash, configuration);
    }
    checkpoint.configurationSha256 = nextHash;
    await save();
    const admission = await session.plan(env, signal);
    if (
      admission.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
    )
      throw new Error('Azure Terraform admission would alter or replace an existing resource');
    await storage.write('terraform-admission-plan.json', admission);
    await session.apply(admission, env, signal);
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
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: 'terraform' as const,
    status: checkpoint.stage === 'registered' ? ('registered' as const) : ('pending-registration' as const),
    registrations: current.status === 'healthy' ? current : registrations,
    configuration,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
}

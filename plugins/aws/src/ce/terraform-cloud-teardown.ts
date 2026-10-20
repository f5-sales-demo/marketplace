import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { verifyAwsTerraformDestroyOwnership } from './terraform-destroy-ownership';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import type { AwsCePlan } from './types';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sourceFile = 'terraform-cloud-teardown-source.json';
const checkpointFile = 'terraform-cloud-teardown.json';
interface Source {
  schemaVersion: 1;
  engine: 'terraform';
  sourcePlanSha256: string;
  configuration: string;
  configurationSha256: string;
  retiredConfiguration: string;
  retiredConfigurationSha256: string;
}
interface Checkpoint {
  schemaVersion: 1;
  engine: 'terraform';
  sourcePlanSha256: string;
  configurationSha256: string;
  retiredConfigurationSha256: string;
  phase: 'destroy-pending' | 'retire-pending' | 'verify-pending' | 'retired';
}
type Store = Pick<CeDeploymentStore, 'read' | 'write' | 'verify' | 'owner'>;
async function optional<T>(storage: Store, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}
function retiredConfiguration(plan: AwsCePlan, configuration: string): string {
  const config = JSON.parse(configuration);
  const provider = config?.provider?.aws;
  if (
    !provider ||
    provider.region !== plan.intent.region ||
    JSON.stringify(provider.allowed_account_ids) !== JSON.stringify([plan.intent.accountId]) ||
    (provider.profile ?? undefined) !== plan.intent.awsProfile ||
    !config.terraform
  )
    throw new Error('Terraform teardown configuration scope differs');
  // Keep providers, versions and backend identity. Archive all former desired resources privately.
  return JSON.stringify({ terraform: config.terraform, provider: config.provider });
}

/** Concrete cloud stage for an already authorized teardown, after platform ingress/routing drain.
 * Completion here proves retired Terraform state, not platform deletion or independent cloud absence.
 */
export async function runAwsTerraformCloudTeardown(
  plan: AwsCePlan,
  session: TerraformSession,
  storage: Store,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(plan);
  const owner = storage.owner;
  if (
    plan.engine !== 'terraform' ||
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.intent.deploymentName ||
    owner.account !== plan.intent.accountId ||
    owner.region !== plan.intent.region
  )
    throw new Error('Terraform cloud teardown ownership differs');
  signal?.throwIfAborted();
  await storage.verify();
  let source = await optional<Source>(storage, sourceFile);
  let checkpoint = await optional<Checkpoint>(storage, checkpointFile);
  if (source === undefined) {
    if (checkpoint !== undefined) throw new Error('Terraform teardown source snapshot is missing');
    const receipt = await session.planDestroy(env, signal);
    const configuration = await session.readConfiguration(receipt.configurationSha256);
    const retired = retiredConfiguration(plan, configuration);
    source = {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: plan.planSha256,
      configuration,
      configurationSha256: digest(configuration),
      retiredConfiguration: retired,
      retiredConfigurationSha256: digest(retired),
    };
    await storage.write(sourceFile, source);
  }
  if (
    !source ||
    source.schemaVersion !== 1 ||
    source.engine !== 'terraform' ||
    source.sourcePlanSha256 !== plan.planSha256 ||
    typeof source.configuration !== 'string' ||
    typeof source.retiredConfiguration !== 'string' ||
    digest(source.configuration) !== source.configurationSha256 ||
    digest(source.retiredConfiguration) !== source.retiredConfigurationSha256 ||
    retiredConfiguration(plan, source.configuration) !== source.retiredConfiguration
  )
    throw new Error('Terraform teardown source snapshot is forged or differs');
  if (checkpoint === undefined) {
    checkpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: plan.planSha256,
      configurationSha256: source.configurationSha256,
      retiredConfigurationSha256: source.retiredConfigurationSha256,
      phase: 'destroy-pending',
    };
    await storage.write(checkpointFile, checkpoint);
  }
  if (
    !checkpoint ||
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourcePlanSha256 !== plan.planSha256 ||
    checkpoint.configurationSha256 !== source.configurationSha256 ||
    checkpoint.retiredConfigurationSha256 !== source.retiredConfigurationSha256 ||
    !['destroy-pending', 'retire-pending', 'verify-pending', 'retired'].includes(checkpoint.phase)
  )
    throw new Error('Terraform cloud teardown checkpoint differs');
  const save = () => storage.write(checkpointFile, checkpoint);
  if (checkpoint.phase === 'destroy-pending') {
    signal?.throwIfAborted();
    const receipt = await session.planDestroy(env, signal);
    if (receipt.configurationSha256 !== source.configurationSha256)
      throw new Error('Terraform teardown configuration changed before destruction');
    await storage.write('terraform-cloud-teardown-plan.json', receipt);
    await storage.verify();
    const ownership = await verifyAwsTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
    const originalInventory = await optional<AwsTerraformRetirementInventory>(
      storage,
      'terraform-cloud-teardown-inventory.json',
    );
    if (originalInventory === undefined) {
      await storage.write('terraform-cloud-teardown-inventory.json', ownership.inventory);
    } else {
      if (!originalInventory) throw new Error('Original cloud retirement inventory is invalid');
      const { sha256, ...material } = originalInventory;
      if (
        canonicalSha256(material) !== sha256 ||
        originalInventory.schemaVersion !== 1 ||
        originalInventory.engine !== 'terraform' ||
        originalInventory.sourcePlanSha256 !== plan.planSha256 ||
        originalInventory.deploymentId !== owner.deploymentId ||
        originalInventory.accountId !== owner.account ||
        originalInventory.region !== owner.region ||
        !Array.isArray(originalInventory.resources) ||
        !Array.isArray(originalInventory.tgwEdges) ||
        ownership.inventory.resources.some(
          (resource) =>
            !originalInventory.resources.some((row) => row.type === resource.type && row.id === resource.id),
        ) ||
        ownership.inventory.tgwEdges.some(
          (edge) => !originalInventory.tgwEdges.some((row) => canonicalSha256(row) === canonicalSha256(edge)),
        )
      )
        throw new Error('Original cloud retirement inventory differs');
    }
    await storage.write('terraform-cloud-teardown-ownership.json', ownership);
    await storage.verify();
    await session.apply(receipt, env, signal);
    checkpoint.phase = 'retire-pending';
    await save();
  }
  if (checkpoint.phase === 'retire-pending') {
    signal?.throwIfAborted();
    await storage.verify();
    try {
      await session.reviseConfiguration(source.configurationSha256, source.retiredConfiguration);
    } catch (error) {
      // A previous process may have committed retirement before saving the phase.
      // Only the exact retired revision is admissible; all other drift remains an error.
      try {
        await session.readConfiguration(source.retiredConfigurationSha256);
      } catch {
        throw error;
      }
    }
    checkpoint.phase = 'verify-pending';
    await save();
  }
  signal?.throwIfAborted();
  await storage.verify();
  await session.readConfiguration(source.retiredConfigurationSha256);
  const final = await session.plan(env, signal);
  if (
    final.operation ||
    final.configurationSha256 !== source.retiredConfigurationSha256 ||
    !final.noChanges ||
    final.changes.length ||
    (final.actionInvocations?.length ?? 0) > 0
  )
    throw new Error('Retired Terraform configuration did not converge to an ordinary no-change plan');
  await session.apply(final, env, signal);
  await storage.write('terraform-cloud-teardown-final-refresh.json', final);
  checkpoint.phase = 'retired';
  await save();
  return {
    status: 'terraform-state-retired' as const,
    engine: 'terraform' as const,
    sourcePlanSha256: plan.planSha256,
    finalPlanSha256: final.planSha256,
    observedAt: new Date().toISOString(),
    cloudInventory: 'unknown' as const,
    platform: 'unknown' as const,
  };
}

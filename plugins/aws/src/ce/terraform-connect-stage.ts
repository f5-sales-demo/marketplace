import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { renderAwsTerraformConnect } from './terraform-connect';
import { renderAwsTerraformFoundation } from './terraform-foundation';
import { siteBindings } from './topology';
import type { AwsCeObservation, AwsCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Add Connect resources without replacing admitted nodes; keep bootstrap confined to private storage. */
export async function applyAwsTerraformConnectStage(
  plan: AwsCePlan,
  observation: AwsCeObservation,
  session: TerraformSession,
  storage: Pick<CeDeploymentStore, 'read' | 'write' | 'verify'>,
  revalidate: () => Promise<void>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  await storage.verify();
  const admission = (await storage.read('terraform-admission.json')) as {
    schemaVersion: number;
    planSha256: string;
    configurationSha256: string;
    admittedSites: string[];
    bootstrapByNode: Record<string, string>;
  };
  if (
    admission.schemaVersion !== 1 ||
    admission.planSha256 !== plan.planSha256 ||
    !/^[0-9a-f]{64}$/.test(admission.configurationSha256) ||
    JSON.stringify(admission.admittedSites) !== JSON.stringify(siteBindings(plan).map(({ site }) => site.name))
  )
    throw new Error('Terraform Connect requires complete owned site admission');
  const configuration = renderAwsTerraformConnect(plan, observation, admission.bootstrapByNode);
  const desired = hash(configuration);
  const addresses = (value: string) =>
    new Map<string, string>(
      Object.entries(JSON.parse(value).resource as Record<string, Record<string, unknown>>).flatMap(
        ([type, resources]) => Object.keys(resources).map((name) => [`${type}.${name}`, type] as const),
      ),
    );
  const foundation = addresses(renderAwsTerraformFoundation(plan, admission.bootstrapByNode));
  const expected = addresses(configuration);
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: desired,
    stage: 'pending',
  });
  const apply = async (receipt: PlanReceipt) => {
    if (
      receipt.configurationSha256 !== desired ||
      receipt.changes.some(
        (change) =>
          expected.get(change.address) !== change.type ||
          change.actions.length !== 1 ||
          !['create', 'read', 'no-op'].includes(change.actions[0]) ||
          (change.actions[0] === 'create' && foundation.has(change.address)),
      )
    )
      throw new Error(
        'Terraform Connect would change, recreate an existing resource, or create an unexpected resource',
      );
    await storage.write('terraform-connect-plan.json', receipt);
    await storage.verify();
    await revalidate();
    await session.apply(receipt, env, signal);
  };
  let reconciled = false;
  try {
    try {
      await session.reviseConfiguration(admission.configurationSha256, configuration);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
      await session.reviseConfiguration(desired, configuration);
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Reconcile interrupted')) throw error;
    await apply(await session.plan(env, signal));
    reconciled = true;
  }
  if (!reconciled) await apply(await session.plan(env, signal));
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: desired,
    stage: 'applied',
    observedAt: new Date().toISOString(),
  });
  return { configurationSha256: desired };
}

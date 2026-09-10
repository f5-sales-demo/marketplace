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
  const connectFoundationAdds = new Set<string>();
  for (const interfaceIndex of new Set((plan.intent.routing.connectPeers ?? []).map((peer) => peer.transportInterfaceIndex))) {
    const role = plan.intent.interfaces.find((item) => item.index === interfaceIndex)?.role;
    if (!role || role === 'slo') continue;
    connectFoundationAdds.add(`aws_route_table.${role}`);
    for (let node = 1; node <= plan.intent.topology.nodeCount; node++)
      connectFoundationAdds.add(`aws_route_table_association.node_${node}_nic_${interfaceIndex}`);
  }
  const isDesiredSubset = (current: string) => {
    const source = JSON.parse(current).resource as Record<string, Record<string, unknown>>;
    const target = JSON.parse(configuration).resource as Record<string, Record<string, unknown>>;
    return Object.entries(source).every(([type, resources]) =>
      Object.entries(resources).every(
        ([name, value]) => target[type]?.[name] !== undefined && JSON.stringify(target[type][name]) === JSON.stringify(value),
      ),
    );
  };
  let previousPending: { configurationSha256?: unknown; planSha256?: unknown; stage?: unknown } | undefined;
  try {
    previousPending = (await storage.read('terraform-connect-stage.json')) as typeof previousPending;
  } catch {
    // The first Connect attempt has no stage checkpoint.
  }
  const pendingConfigurationSha256 =
    previousPending?.stage === 'pending' &&
    previousPending.planSha256 === plan.planSha256 &&
    typeof previousPending.configurationSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(previousPending.configurationSha256)
      ? previousPending.configurationSha256
      : undefined;
  const apply = async (receipt: PlanReceipt) => {
    if (
      receipt.configurationSha256 !== desired ||
      receipt.changes.some(
        (change) =>
          expected.get(change.address) !== change.type ||
          change.actions.length !== 1 ||
          !['create', 'read', 'no-op'].includes(change.actions[0]) ||
          (change.actions[0] === 'create' &&
            foundation.has(change.address) &&
            !connectFoundationAdds.has(change.address)),
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
    const revisions = [admission.configurationSha256, desired, pendingConfigurationSha256].filter(
      (value, index, values): value is string => typeof value === 'string' && values.indexOf(value) === index,
    );
    let revised = false;
    let stale: Error | undefined;
    for (const revision of revisions) {
      try {
        await session.reviseConfiguration(revision, configuration);
        revised = true;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
        stale = error;
      }
    }
    if (!revised) {
      if (!session.readConfigurationSha256) throw stale;
      const currentSha256 = await session.readConfigurationSha256();
      const current = await session.readConfiguration(currentSha256);
      if (!isDesiredSubset(current)) throw new Error('Pending Terraform Connect configuration is not owned by this plan');
      await session.reviseConfiguration(currentSha256, configuration);
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Reconcile interrupted')) throw error;
    await apply(await session.plan(env, signal));
    reconciled = true;
  }
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: desired,
    stage: 'pending',
  });
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

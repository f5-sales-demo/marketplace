import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import type { AwsTerraformDirectOwnership } from './terraform-direct-ownership';
import { observeAwsTerraformDirectPhase, renderAwsTerraformDirectTransition } from './terraform-direct-transition';
import type { AwsCePlan } from './types';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const marker = 'terraform-direct-retirement.json';
const sourceFile = 'terraform-direct-retirement-source.json';
interface RetirementSource {
  schemaVersion: 1;
  engine: 'terraform';
  sourcePlanSha256: string;
  ownershipSha256: string;
  restoredConfiguration: string;
  restoredConfigurationSha256: string;
  relinquishedConfiguration: string;
  relinquishedConfigurationSha256: string;
  stateIds: Record<string, string>;
}

type Store = Pick<CeDeploymentStore, 'read' | 'write' | 'verify' | 'owner'>;
const targetFields = [
  'gateway_id',
  'nat_gateway_id',
  'network_interface_id',
  'transit_gateway_id',
  'vpc_peering_connection_id',
];
/** Internal ownership-bound restoration. Ambiguous attempts remain journaled for evidence reconciliation. */
export async function retireAwsTerraformDirectRoutes(
  plan: AwsCePlan,
  ownership: AwsTerraformDirectOwnership,
  session: TerraformSession,
  storage: Store,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const owner = storage.owner;
  if (
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region ||
    !session.readConfigurationSha256 ||
    !session.planRelinquishments ||
    !session.readResourceIdentities
  )
    throw Error('Direct retirement requires exact durable owner and owning runner capabilities');
  await storage.verify();
  if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(ownership))
    throw Error('Direct retirement original ownership differs from durable snapshot');
  let prior: unknown;
  try {
    prior = await storage.read(marker);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (prior !== undefined) {
    const checkpoint = prior as Record<string, unknown>;
    if (!checkpoint || checkpoint.phase !== 'preserved')
      throw Error('Existing direct retirement attempt requires evidence reconciliation before replay');
    const source = (await storage.read(sourceFile)) as RetirementSource;
    if (
      !source ||
      source.schemaVersion !== 1 ||
      source.engine !== 'terraform' ||
      source.sourcePlanSha256 !== plan.planSha256 ||
      source.ownershipSha256 !== ownership.snapshotSha256 ||
      typeof source.restoredConfiguration !== 'string' ||
      typeof source.relinquishedConfiguration !== 'string' ||
      hash(source.restoredConfiguration) !== source.restoredConfigurationSha256 ||
      hash(source.relinquishedConfiguration) !== source.relinquishedConfigurationSha256 ||
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== plan.planSha256 ||
      checkpoint.ownershipSha256 !== ownership.snapshotSha256 ||
      checkpoint.configurationSha256 !== source.relinquishedConfigurationSha256 ||
      checkpoint.sourceSha256 !== canonicalSha256(source)
    )
      throw Error('Completed direct retirement source or checkpoint differs');
    const removal = renderAwsTerraformDirectTransition(
      plan,
      ownership,
      source.restoredConfiguration,
      'original',
      'relinquished',
      source.stateIds,
    );
    if (removal.configuration !== source.relinquishedConfiguration)
      throw Error('Completed direct retirement translation differs');
    signal?.throwIfAborted();
    const configurationSha256 = await session.readConfigurationSha256();
    if (
      configurationSha256 !== source.relinquishedConfigurationSha256 ||
      (await session.readConfiguration(configurationSha256)) !== source.relinquishedConfiguration
    )
      throw Error('Completed direct retirement configuration differs');
    const routeNames = ownership.routes.map((route) => route.address);
    if ((await session.readResourceIdentities(env, signal)).some((row) => routeNames.includes(row.address)))
      throw Error('Completed direct retirement route state reappeared');
    const preserved = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    const final = await session.plan(env, signal);
    if (
      final.engine !== 'terraform' ||
      final.deploymentId !== plan.deploymentName ||
      final.configurationSha256 !== configurationSha256 ||
      !final.noChanges ||
      final.operation ||
      final.imports?.length ||
      final.relinquishments?.length ||
      final.actionInvocations?.length ||
      final.changes.some((change) => change.actions.join(',') !== 'no-op' || routeNames.includes(change.address))
    )
      throw Error('Completed direct retirement did not converge to ordinary no-change state');
    await storage.verify();
    await storage.write('terraform-direct-retirement-resume-observation.json', { preserved, final });
    return { status: 'direct-routes-preserved' as const, preserved, configurationSha256 };
  }
  signal?.throwIfAborted();
  let configurationSha256 = await session.readConfigurationSha256();
  const current = await session.readConfiguration(configurationSha256);
  let phase: 'ce' | 'original' = 'ce';
  let restored: ReturnType<typeof renderAwsTerraformDirectTransition>;
  try {
    restored = renderAwsTerraformDirectTransition(plan, ownership, current, 'ce', 'original');
  } catch {
    phase = 'original';
    restored = renderAwsTerraformDirectTransition(plan, ownership, current, 'original', 'original');
  }
  await observeAwsTerraformDirectPhase(plan, ownership, phase, api, signal);
  await storage.write(marker, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    originalConfigurationSha256: configurationSha256,
    phase: 'restoration-pending',
  });
  configurationSha256 = await session.reviseConfiguration(configurationSha256, restored.configuration);
  if (configurationSha256 !== hash(restored.configuration))
    throw Error('Direct restoration configuration identity differs');
  const receipt = await session.plan(env, signal);
  const routeNames = ownership.routes.map((r) => r.address);
  const checkReceipt = (receipt: PlanReceipt, action: 'update' | 'forget') => {
    if (
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== plan.deploymentName ||
      receipt.configurationSha256 !== configurationSha256 ||
      receipt.operation ||
      receipt.imports?.length ||
      receipt.actionInvocations?.length ||
      new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
      ownership.routes.some(
        (r) => receipt.changes.filter((c) => c.address === r.address && c.type === 'aws_route').length !== 1,
      ) ||
      receipt.changes.some(
        (c) =>
          c.actions.length !== 1 ||
          (routeNames.includes(c.address) ? !['no-op', action].includes(c.actions[0]) : c.actions[0] !== 'no-op'),
      )
    )
      throw Error('Direct retirement saved plan would change unexpected resources');
  };
  checkReceipt(receipt, 'update');
  if (receipt.relinquishments?.length) throw Error('Restoration cannot relinquish state');
  const fields = Object.fromEntries(
    ownership.routes.map((r) => [r.address, ['route_table_id', 'destination_cidr_block', ...targetFields]]),
  );
  const priorFields = await session.readPlannedResourceFields(receipt, fields, env, signal);
  const proposed = await session.readProposedResourceFields(receipt, fields, env, signal);
  const checkFields = (values: Record<string, Record<string, unknown> | null>, desired: 'ce' | 'original') => {
    if (canonicalSha256(Object.keys(values).sort()) !== canonicalSha256(routeNames.slice().sort()))
      throw Error('Direct retirement route field inventory incomplete');
    for (const route of ownership.routes) {
      const v = values[route.address];
      const target = desired === 'ce' ? 'network_interface_id' : route.originalTarget.field;
      const id = desired === 'ce' ? route.networkInterfaceId : route.originalTarget.id;
      if (
        !v ||
        v.route_table_id !== route.routeTableId ||
        v.destination_cidr_block !== route.destinationCidr ||
        targetFields.some(
          (f) => !Object.hasOwn(v, f) || (f === target ? v[f] !== id : ![null, ''].includes(v[f] as string | null)),
        )
      )
        throw Error('Direct retirement prior/proposed route ownership differs');
    }
  };
  checkFields(priorFields, phase);
  checkFields(proposed, 'original');
  const ids = await session.readPlannedResourceIds(receipt, routeNames, env, signal);
  if (Object.values(ids).some((id) => typeof id !== 'string'))
    throw Error('Direct retirement prior state identity unresolved');
  const removal = renderAwsTerraformDirectTransition(
    plan,
    ownership,
    restored.configuration,
    'original',
    'relinquished',
    ids as Record<string, string>,
  );
  const source: RetirementSource = {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    restoredConfiguration: restored.configuration,
    restoredConfigurationSha256: hash(restored.configuration),
    relinquishedConfiguration: removal.configuration,
    relinquishedConfigurationSha256: hash(removal.configuration),
    stateIds: ids as Record<string, string>,
  };
  await storage.write(sourceFile, source);
  await storage.write('terraform-direct-restoration-plan.json', receipt);
  await storage.verify();
  await observeAwsTerraformDirectPhase(plan, ownership, phase, api, signal);
  await session.apply(receipt, env, signal);
  const restoration = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
  const refresh = await session.plan(env, signal);
  if (
    !refresh.noChanges ||
    refresh.configurationSha256 !== configurationSha256 ||
    refresh.operation ||
    refresh.imports?.length ||
    refresh.relinquishments?.length ||
    refresh.actionInvocations?.length ||
    refresh.changes.some((c) => c.actions.join(',') !== 'no-op')
  )
    throw Error('Restored direct routes did not converge to ordinary no-change state');
  const restoredIds = await session.readPlannedResourceIds(refresh, routeNames, env, signal);
  if (canonicalSha256(ids) !== canonicalSha256(restoredIds))
    throw Error('Direct route state identity changed during restoration');
  await storage.write(marker, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    restoration,
    phase: 'relinquishment-pending',
  });
  configurationSha256 = await session.reviseConfiguration(configurationSha256, removal.configuration);
  if (configurationSha256 !== hash(removal.configuration))
    throw Error('Direct relinquishment configuration identity differs');
  const forget = await session.planRelinquishments(removal.intents, env, signal);
  checkReceipt(forget, 'forget');
  if (
    canonicalSha256(forget.relinquishments) !== canonicalSha256(removal.intents) ||
    forget.changes.filter((c) => routeNames.includes(c.address)).some((c) => c.actions.join(',') !== 'forget')
  )
    throw Error('Direct relinquishment saved plan identity differs');
  await storage.write('terraform-direct-relinquishment-plan.json', forget);
  await storage.verify();
  await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
  await session.apply(forget, env, signal);
  if ((await session.readResourceIdentities(env, signal)).some((r) => routeNames.includes(r.address)))
    throw Error('Direct routes remain in Terraform state after relinquishment');
  const preserved = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
  await storage.write(marker, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    configurationSha256,
    preserved,
    sourceSha256: canonicalSha256(source),
    phase: 'preserved',
  });
  return { status: 'direct-routes-preserved' as const, preserved, configurationSha256 };
}

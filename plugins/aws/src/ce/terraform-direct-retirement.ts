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
  initialConfiguration: string;
  initialConfigurationSha256: string;
  restoredConfiguration: string;
  restoredConfigurationSha256: string;
  relinquishedConfiguration: string;
  relinquishedConfigurationSha256: string;
  stateIds: Record<string, string>;
  initialPhase: 'ce' | 'original';
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
  signal?.throwIfAborted();
  const readConfigurationSha256 = session.readConfigurationSha256.bind(session);
  const planRelinquishments = session.planRelinquishments.bind(session);
  const readResourceIdentities = session.readResourceIdentities.bind(session);
  await storage.verify();
  if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(ownership))
    throw Error('Direct retirement original ownership differs from durable snapshot');
  const routeNames = ownership.routes.map((r) => r.address);
  const checkReceipt = (receipt: PlanReceipt, configurationSha256: string, action: 'update' | 'forget') => {
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
  const fields = Object.fromEntries(
    ownership.routes.map((r) => [r.address, ['route_table_id', 'destination_cidr_block', ...targetFields]]),
  );
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
  const checkSource = (checkpoint: Record<string, unknown>, source: RetirementSource) => {
    if (
      source?.schemaVersion !== 1 ||
      !['ce', 'original'].includes(source.initialPhase) ||
      source.engine !== 'terraform' ||
      source.sourcePlanSha256 !== plan.planSha256 ||
      source.ownershipSha256 !== ownership.snapshotSha256 ||
      typeof source.initialConfiguration !== 'string' ||
      hash(source.initialConfiguration) !== source.initialConfigurationSha256 ||
      typeof source.restoredConfiguration !== 'string' ||
      typeof source.relinquishedConfiguration !== 'string' ||
      hash(source.restoredConfiguration) !== source.restoredConfigurationSha256 ||
      hash(source.relinquishedConfiguration) !== source.relinquishedConfigurationSha256 ||
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== plan.planSha256 ||
      checkpoint.ownershipSha256 !== ownership.snapshotSha256 ||
      checkpoint.sourceSha256 !== canonicalSha256(source)
    )
      throw Error('Direct retirement source or checkpoint differs');
    const restoration = renderAwsTerraformDirectTransition(
      plan,
      ownership,
      source.initialConfiguration,
      source.initialPhase,
      'original',
    );
    if (restoration.configuration !== source.restoredConfiguration)
      throw Error('Direct retirement initial translation differs');
    const removal = renderAwsTerraformDirectTransition(
      plan,
      ownership,
      source.restoredConfiguration,
      'original',
      'relinquished',
      source.stateIds,
    );
    if (removal.configuration !== source.relinquishedConfiguration)
      throw Error('Direct retirement translation differs');
    return removal;
  };
  const checkpointFor = (source: RetirementSource, phase: string, extra = {}) => ({
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    sourceSha256: canonicalSha256(source),
    phase,
    ...extra,
  });
  const readOptional = async <T>(name: string): Promise<T | undefined> => {
    try {
      return (await storage.read(name)) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return undefined;
    }
  };
  const readRouteIds = async () => {
    const identities = (await readResourceIdentities(env, signal)).filter((r) => routeNames.includes(r.address));
    if (
      identities.length !== routeNames.length ||
      new Set(identities.map((r) => r.address)).size !== routeNames.length ||
      new Set(identities.map((r) => r.id)).size !== routeNames.length ||
      identities.some((r) => r.type !== 'aws_route' || typeof r.id !== 'string' || !r.id)
    )
      throw Error('Direct retirement route state identity differs');
    return Object.fromEntries(identities.map((r) => [r.address, r.id]));
  };
  const verifyRouteIds = async (source: RetirementSource) => {
    if (canonicalSha256(await readRouteIds()) !== canonicalSha256(source.stateIds))
      throw Error('Direct retirement route state identity changed');
  };
  const verifySubmitted = async (
    source: RetirementSource,
    receipt: PlanReceipt,
    kind: 'restoration' | 'relinquishment',
  ) => {
    if (!session.readPlanApplicationState || !session.readAppliedResourceFields || !session.reconcileApplyFromEvidence)
      throw Error('Direct retirement requires owning journal reconciliation capabilities');
    const state = await session.readPlanApplicationState(receipt);
    if (!['applying', 'applied'].includes(state))
      throw Error('Direct retirement reconciliation requires a submitted exact plan');
    const fields = Object.fromEntries(
      ownership.routes.map((route) => [
        route.address,
        ['id', 'route_table_id', 'destination_cidr_block', route.originalTarget.field],
      ]),
    );
    const first = await session.readAppliedResourceFields(receipt, fields, env, signal);
    const cloud = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    const second = await session.readAppliedResourceFields(receipt, fields, env, signal);
    if (
      canonicalSha256(first) !== canonicalSha256(second) ||
      canonicalSha256(Object.keys(second).sort()) !== canonicalSha256(routeNames.slice().sort())
    )
      throw Error('Direct retirement applied-state inventory incomplete or changed');
    for (const route of ownership.routes) {
      const value = second[route.address];
      if (
        kind === 'relinquishment'
          ? value !== null
          : !value ||
            value.id !== source.stateIds[route.address] ||
            value.route_table_id !== route.routeTableId ||
            value.destination_cidr_block !== route.destinationCidr ||
            value[route.originalTarget.field] !== route.originalTarget.id
      )
        throw Error('Direct retirement submitted outcome differs from original route ownership');
    }
    const evidence = {
      schemaVersion: 1,
      engine: 'terraform',
      sourceSha256: canonicalSha256(source),
      receipt,
      first,
      cloud,
      second,
    };
    await storage.verify();
    await storage.write(`terraform-direct-${kind}-reconciliation.json`, evidence);
    signal?.throwIfAborted();
    if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
  };
  const finishRelinquishment = async (source: RetirementSource, saved?: PlanReceipt, preparing = false) => {
    const removal = renderAwsTerraformDirectTransition(
      plan,
      ownership,
      source.restoredConfiguration,
      'original',
      'relinquished',
      source.stateIds,
    );
    if (preparing) {
      if (saved && (await session.readPlanApplicationState(saved)) !== 'planned')
        throw Error('Relinquishment preparation cannot reconcile a submitted plan');
      await verifyRouteIds(source);
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    }
    let configurationSha256 = await readConfigurationSha256();
    const configuration = await session.readConfiguration(configurationSha256);
    if (configurationSha256 === source.restoredConfigurationSha256 && configuration === source.restoredConfiguration) {
      if (saved) throw Error('Relinquishment plan cannot belong to restored configuration');
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
      configurationSha256 = await session.reviseConfiguration(configurationSha256, removal.configuration);
    } else if (
      configurationSha256 !== source.relinquishedConfigurationSha256 ||
      configuration !== removal.configuration
    )
      throw Error('Direct relinquishment configuration identity differs');
    if (configurationSha256 !== source.relinquishedConfigurationSha256)
      throw Error('Direct relinquishment revision differs');
    const forget = saved ?? (await planRelinquishments(removal.intents, env, signal));
    checkReceipt(forget, configurationSha256, 'forget');
    if (
      canonicalSha256(forget.relinquishments) !== canonicalSha256(removal.intents) ||
      forget.changes.filter((c) => routeNames.includes(c.address)).some((c) => c.actions.join(',') !== 'forget')
    )
      throw Error('Direct relinquishment saved plan identity differs');
    if (!saved) await storage.write('terraform-direct-relinquishment-plan.json', forget);
    await storage.verify();
    await storage.write(marker, checkpointFor(source, 'relinquishment-pending'));
    const application = saved ? await session.readPlanApplicationState(forget) : 'planned';
    if (application === 'planned') {
      await verifyRouteIds(source);
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
      await session.apply(forget, env, signal);
    } else await verifySubmitted(source, forget, 'relinquishment');
    if ((await readResourceIdentities(env, signal)).some((r) => routeNames.includes(r.address)))
      throw Error('Direct routes remain in Terraform state after relinquishment');
    const preserved = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await storage.write(marker, checkpointFor(source, 'preserved', { configurationSha256, preserved }));
    return { status: 'direct-routes-preserved' as const, preserved, configurationSha256 };
  };
  const finishRestoration = async (source: RetirementSource) => {
    const currentSha = await readConfigurationSha256();
    if (
      currentSha !== source.restoredConfigurationSha256 ||
      (await session.readConfiguration(currentSha)) !== source.restoredConfiguration
    )
      throw Error('Restoration refresh configuration identity differs');
    const identities = (await readResourceIdentities(env, signal)).filter((r) => routeNames.includes(r.address));
    if (
      identities.length !== routeNames.length ||
      new Set(identities.map((r) => r.address)).size !== routeNames.length ||
      identities.some((r) => r.type !== 'aws_route' || r.id !== source.stateIds[r.address])
    )
      throw Error('Restoration refresh route state identity differs');
    const restoration = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await storage.verify();
    // The ordinary refresh replaces the runner journal. Record its boundary before planning so
    // a lost refresh response never causes restoration submission to be replayed.
    await storage.write(marker, checkpointFor(source, 'restoration-refresh-pending', { restoration }));
    const refresh = await session.plan(env, signal);
    if (
      !refresh.noChanges ||
      refresh.engine !== 'terraform' ||
      refresh.deploymentId !== plan.deploymentName ||
      refresh.configurationSha256 !== source.restoredConfigurationSha256 ||
      refresh.operation ||
      refresh.imports?.length ||
      refresh.relinquishments?.length ||
      refresh.actionInvocations?.length ||
      refresh.changes.some((c) => c.actions.join(',') !== 'no-op')
    )
      throw Error('Restored direct routes did not converge to ordinary no-change state');
    const restoredIds = await session.readPlannedResourceIds(refresh, routeNames, env, signal);
    if (canonicalSha256(source.stateIds) !== canonicalSha256(restoredIds))
      throw Error('Direct route state identity changed during restoration');
    await storage.write(marker, checkpointFor(source, 'relinquishment-preparing', { restoration, refresh }));
    return finishRelinquishment(source, undefined, true);
  };
  const prepareRestoration = async (source: RetirementSource) => {
    await verifyRouteIds(source);
    await observeAwsTerraformDirectPhase(plan, ownership, source.initialPhase, api, signal);
    let currentSha = await readConfigurationSha256();
    const current = await session.readConfiguration(currentSha);
    const saved = await readOptional<PlanReceipt>('terraform-direct-restoration-plan.json');
    if (currentSha === source.initialConfigurationSha256 && current === source.initialConfiguration) {
      if (saved && currentSha !== source.restoredConfigurationSha256)
        throw Error('Restoration plan cannot belong to initial configuration');
      if (current !== source.restoredConfiguration)
        currentSha = await session.reviseConfiguration(currentSha, source.restoredConfiguration);
    } else if (currentSha !== source.restoredConfigurationSha256 || current !== source.restoredConfiguration)
      throw Error('Direct restoration preparation configuration differs');
    if (currentSha !== source.restoredConfigurationSha256)
      throw Error('Direct restoration configuration identity differs');
    const receipt = saved ?? (await session.plan(env, signal));
    checkReceipt(receipt, currentSha, 'update');
    if (receipt.relinquishments?.length) throw Error('Restoration cannot relinquish state');
    if ((await session.readPlanApplicationState(receipt)) !== 'planned')
      throw Error('Restoration preparation cannot reconcile a submitted plan');
    checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), source.initialPhase);
    checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'original');
    if (
      canonicalSha256(await session.readPlannedResourceIds(receipt, routeNames, env, signal)) !==
      canonicalSha256(source.stateIds)
    )
      throw Error('Direct retirement planned state identity differs');
    if (!saved) await storage.write('terraform-direct-restoration-plan.json', receipt);
    await storage.verify();
    await storage.write(marker, checkpointFor(source, 'restoration-pending'));
    await verifyRouteIds(source);
    await observeAwsTerraformDirectPhase(plan, ownership, source.initialPhase, api, signal);
    await session.apply(receipt, env, signal);
    return finishRestoration(source);
  };
  let prior: unknown;
  try {
    prior = await storage.read(marker);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (prior !== undefined) {
    const checkpoint = prior as Record<string, unknown>;
    if (
      !checkpoint ||
      ![
        'preserved',
        'restoration-preparing',
        'restoration-pending',
        'restoration-refresh-pending',
        'relinquishment-preparing',
        'relinquishment-pending',
      ].includes(String(checkpoint.phase))
    )
      throw Error('Existing direct retirement attempt requires evidence reconciliation before replay');
    const source = (await storage.read(sourceFile)) as RetirementSource;
    checkSource(checkpoint, source);
    if (checkpoint.phase === 'restoration-preparing') return prepareRestoration(source);
    if (checkpoint.phase === 'relinquishment-preparing')
      return finishRelinquishment(
        source,
        await readOptional<PlanReceipt>('terraform-direct-relinquishment-plan.json'),
        true,
      );
    if (checkpoint.phase === 'restoration-refresh-pending') return finishRestoration(source);
    if (checkpoint.phase === 'restoration-pending') {
      const receipt = (await storage.read('terraform-direct-restoration-plan.json')) as PlanReceipt;
      checkReceipt(receipt, source.restoredConfigurationSha256, 'update');
      if (receipt.relinquishments?.length) throw Error('Restoration cannot relinquish state');
      const currentSha = await session.readConfigurationSha256();
      if (
        currentSha !== source.restoredConfigurationSha256 ||
        (await session.readConfiguration(currentSha)) !== source.restoredConfiguration
      )
        throw Error('Interrupted restoration configuration differs');
      if ((await session.readPlanApplicationState(receipt)) === 'planned') {
        checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), source.initialPhase);
        checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'original');
        if (
          canonicalSha256(await session.readPlannedResourceIds(receipt, routeNames, env, signal)) !==
          canonicalSha256(source.stateIds)
        )
          throw Error('Unsubmitted restoration state identity changed');
        await verifyRouteIds(source);
        await observeAwsTerraformDirectPhase(plan, ownership, source.initialPhase, api, signal);
        await storage.verify();
        await session.apply(receipt, env, signal);
      } else await verifySubmitted(source, receipt, 'restoration');
      return finishRestoration(source);
    }
    if (checkpoint.phase === 'relinquishment-pending') {
      let saved: PlanReceipt | undefined;
      try {
        saved = (await storage.read('terraform-direct-relinquishment-plan.json')) as PlanReceipt;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (!saved)
        throw Error('Interrupted relinquishment has no durable exact plan; preparation reconciliation required');
      return finishRelinquishment(source, saved);
    }
    if (checkpoint.configurationSha256 !== source.relinquishedConfigurationSha256)
      throw Error('Completed direct retirement checkpoint configuration differs');
    signal?.throwIfAborted();
    const configurationSha256 = await session.readConfigurationSha256();
    if (
      configurationSha256 !== source.relinquishedConfigurationSha256 ||
      (await session.readConfiguration(configurationSha256)) !== source.relinquishedConfiguration
    )
      throw Error('Completed direct retirement configuration differs');
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
  // Source is persisted before the preparation marker. A lost marker write leaves no
  // revised configuration or submission; validate that orphan before resuming it.
  const orphan = await readOptional<RetirementSource>(sourceFile);
  if (orphan !== undefined) {
    checkSource(checkpointFor(orphan, 'restoration-preparing'), orphan);
    const currentSha = await readConfigurationSha256();
    if (
      currentSha !== orphan.initialConfigurationSha256 ||
      (await session.readConfiguration(currentSha)) !== orphan.initialConfiguration ||
      (await readOptional('terraform-direct-restoration-plan.json')) !== undefined ||
      (await readOptional('terraform-direct-relinquishment-plan.json')) !== undefined
    )
      throw Error('Orphan direct retirement source differs from unmodified preparation');
    await verifyRouteIds(orphan);
    await observeAwsTerraformDirectPhase(plan, ownership, orphan.initialPhase, api, signal);
    await storage.verify();
    await storage.write(marker, checkpointFor(orphan, 'restoration-preparing'));
    return prepareRestoration(orphan);
  }
  const configurationSha256 = await readConfigurationSha256();
  const current = await session.readConfiguration(configurationSha256);
  let phase: 'ce' | 'original' = 'ce';
  let restored: ReturnType<typeof renderAwsTerraformDirectTransition>;
  try {
    restored = renderAwsTerraformDirectTransition(plan, ownership, current, 'ce', 'original');
  } catch {
    phase = 'original';
    restored = renderAwsTerraformDirectTransition(plan, ownership, current, 'original', 'original');
  }
  const ids = await readRouteIds();
  const removal = renderAwsTerraformDirectTransition(
    plan,
    ownership,
    restored.configuration,
    'original',
    'relinquished',
    ids,
  );
  const source: RetirementSource = {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    initialConfiguration: current,
    initialConfigurationSha256: configurationSha256,
    restoredConfiguration: restored.configuration,
    restoredConfigurationSha256: hash(restored.configuration),
    relinquishedConfiguration: removal.configuration,
    relinquishedConfigurationSha256: hash(removal.configuration),
    stateIds: ids,
    initialPhase: phase,
  };
  await observeAwsTerraformDirectPhase(plan, ownership, phase, api, signal);
  await verifyRouteIds(source);
  await storage.verify();
  await storage.write(sourceFile, source);
  await storage.write(marker, checkpointFor(source, 'restoration-preparing'));
  return prepareRestoration(source);
}

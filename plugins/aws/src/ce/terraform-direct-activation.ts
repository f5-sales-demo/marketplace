import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { renderAwsTerraformDirectImport } from './terraform-direct-import';
import type { AwsTerraformDirectOwnership } from './terraform-direct-ownership';
import { observeAwsTerraformDirectPhase, renderAwsTerraformDirectTransition } from './terraform-direct-transition';
import type { AwsCeObservation, AwsCePlan } from './types';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const sourceFile = 'terraform-direct-activation-source.json';
const marker = 'terraform-direct-activation-stage.json';
type Store = Pick<CeDeploymentStore, 'owner' | 'read' | 'write' | 'verify'>;
type InterfaceObservation = {
  status: 'observed' | 'down' | 'unknown';
  interfaces: ObservedCeInterface[];
  observedAt: string;
};
interface Source {
  schemaVersion: 1;
  sourcePlanSha256: string;
  ownershipSha256: string;
  initialConfiguration: string;
  activatedConfiguration: string;
  importSourceSha256: string;
}
const optional = async <T>(storage: Store, name: string): Promise<T | undefined> => {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};
const targetFields = [
  'gateway_id',
  'nat_gateway_id',
  'network_interface_id',
  'transit_gateway_id',
  'vpc_peering_connection_id',
];

/** Owning original-to-CE transition. Collection time is never original publisher heartbeat evidence. */
export async function activateAwsTerraformDirectRoutes(
  plan: AwsCePlan,
  ownership: AwsTerraformDirectOwnership,
  session: TerraformSession,
  storage: Store,
  api: AwsExecApi,
  observeUp: () => Promise<InterfaceObservation>,
  revalidate: () => Promise<void>,
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
    !session.readResourceIdentities
  )
    throw Error('Direct activation requires exact durable owner and owning runner capabilities');
  const readIdentities = session.readResourceIdentities.bind(session);
  const readConfigurationSha256 = session.readConfigurationSha256.bind(session);
  signal?.throwIfAborted();
  await storage.verify();
  if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(ownership))
    throw Error('Direct activation durable original ownership differs');
  const imported = (await storage.read('terraform-direct-import-source.json')) as {
    schemaVersion: number;
    sourcePlanSha256: string;
    ownership: AwsTerraformDirectOwnership;
    initialConfiguration: string;
    importedConfiguration: string;
  };
  const importCheckpoint = (await storage.read('terraform-direct-import-stage.json')) as Record<string, unknown>;
  if (
    imported.schemaVersion !== 1 ||
    imported.sourcePlanSha256 !== plan.planSha256 ||
    canonicalSha256(imported.ownership) !== canonicalSha256(ownership) ||
    renderAwsTerraformDirectImport(plan, ownership, imported.initialConfiguration).configuration !==
      imported.importedConfiguration ||
    importCheckpoint.schemaVersion !== 1 ||
    importCheckpoint.engine !== 'terraform' ||
    importCheckpoint.sourceSha256 !== canonicalSha256(imported) ||
    importCheckpoint.phase !== 'imported'
  )
    throw Error('Direct activation requires exact completed original import');
  const translated = renderAwsTerraformDirectTransition(
    plan,
    ownership,
    imported.importedConfiguration,
    'original',
    'ce',
  );
  const expectedSource: Source = {
    schemaVersion: 1,
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    initialConfiguration: imported.importedConfiguration,
    activatedConfiguration: translated.configuration,
    importSourceSha256: canonicalSha256(imported),
  };
  const sourceSha256 = canonicalSha256(expectedSource);
  const checkpointFor = (phase: string) => ({ schemaVersion: 1, engine: 'terraform', sourceSha256, phase });
  let source = await optional<Source>(storage, sourceFile);
  let checkpoint = await optional<Record<string, unknown>>(storage, marker);
  let receipt = await optional<PlanReceipt>(storage, 'terraform-direct-activation-plan.json');
  const names = ownership.routes.map((r) => r.address);
  const fields = Object.fromEntries(
    names.map((name) => [name, ['id', 'route_table_id', 'destination_cidr_block', ...targetFields]]),
  );
  const checkFields = (values: Record<string, Record<string, unknown> | null>, phase: 'original' | 'ce') => {
    if (canonicalSha256(Object.keys(values).sort()) !== canonicalSha256([...names].sort()))
      throw Error('Direct activation route field inventory differs');
    for (const route of ownership.routes) {
      const value = values[route.address];
      let crc = 0xffffffff;
      for (const byte of Buffer.from(route.destinationCidr)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      const target = phase === 'ce' ? 'network_interface_id' : route.originalTarget.field;
      const id = phase === 'ce' ? route.networkInterfaceId : route.originalTarget.id;
      if (
        !value ||
        value.id !== `r-${route.routeTableId}${(crc ^ 0xffffffff) >>> 0}` ||
        value.route_table_id !== route.routeTableId ||
        value.destination_cidr_block !== route.destinationCidr ||
        targetFields.some(
          (field) =>
            !Object.hasOwn(value, field) ||
            (field === target ? value[field] !== id : ![null, ''].includes(value[field] as string | null)),
        )
      )
        throw Error('Direct activation route identity or target differs');
    }
  };
  const verifyIds = async () => {
    const rows = (await readIdentities(env, signal)).filter((row) => names.includes(row.address));
    if (
      rows.length !== names.length ||
      new Set(rows.map((r) => r.address)).size !== names.length ||
      rows.some((r) => r.type !== 'aws_route')
    )
      throw Error('Direct activation route state inventory differs');
    // Validate provider IDs with the same exact field checker, preserving the selected target phase.
    const configured = JSON.parse(expectedSource.initialConfiguration).resource.aws_route;
    checkFields(
      Object.fromEntries(
        rows.map((r) => [
          r.address,
          {
            ...Object.fromEntries(targetFields.map((f) => [f, null])),
            ...configured[r.address.slice('aws_route.'.length)],
            id: r.id,
          },
        ]),
      ),
      'original',
    );
  };
  const up = async () => {
    signal?.throwIfAborted();
    const observed = await observeUp();
    if (observed.status !== 'observed' || observed.interfaces.length !== 2)
      throw Error('Direct activation requires complete verified up CE interface evidence');
    for (const [index, i] of ownership.interfaces.entries()) {
      const matches = observed.interfaces.filter(
        (row) =>
          row.node === `${plan.deploymentName}-1` &&
          row.role === (index ? 'sli' : 'slo') &&
          row.mac === i.mac &&
          row.device === plan.interfaces[index].guestDevice,
      );
      if (matches.length !== 1 || matches[0].linkUp !== true || !matches[0].interfaceName)
        throw Error('Direct activation CE interface identity or link differs');
    }
    await storage.write('terraform-direct-activation-interface-observation.json', observed);
    return observed;
  };
  const checkReceipt = (r: PlanReceipt, refresh = false) => {
    if (
      r.engine !== 'terraform' ||
      r.deploymentId !== plan.deploymentName ||
      r.configurationSha256 !== hash(expectedSource.activatedConfiguration) ||
      r.operation ||
      r.imports?.length ||
      r.relinquishments?.length ||
      r.actionInvocations?.length ||
      new Set(r.changes.map((c) => c.address)).size !== r.changes.length ||
      (!refresh &&
        names.some((n) => r.changes.filter((c) => c.address === n && c.type === 'aws_route').length !== 1)) ||
      r.changes.some(
        (c) =>
          c.actions.length !== 1 ||
          (refresh || !names.includes(c.address)
            ? c.actions[0] !== 'no-op'
            : c.type !== 'aws_route' || c.actions[0] !== 'update'),
      ) ||
      (refresh && !r.noChanges)
    )
      throw Error('Direct activation saved plan would change unexpected resources');
  };
  const configuration = async () => {
    const sha = await readConfigurationSha256();
    const current = await session.readConfiguration(sha);
    if (hash(current) !== sha) throw Error('Direct activation configuration digest differs');
    return current;
  };
  if (!source) {
    if (checkpoint || receipt || (await configuration()) !== expectedSource.initialConfiguration)
      throw Error('Direct activation cannot adopt orphan revised configuration or plan');
    await verifyIds();
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await up();
    source = expectedSource;
    await storage.write(sourceFile, source);
  }
  if (canonicalSha256(source) !== sourceSha256) throw Error('Direct activation source differs');
  if (!checkpoint) {
    if (receipt || (await configuration()) !== source.initialConfiguration)
      throw Error('Direct activation source cannot adopt orphan plan or revision');
    await verifyIds();
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await up();
    checkpoint = checkpointFor('preparing');
    await storage.write(marker, checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourceSha256 !== sourceSha256 ||
    !['preparing', 'submission-pending', 'refresh-pending', 'activated'].includes(String(checkpoint.phase))
  )
    throw Error('Direct activation checkpoint differs');
  if (checkpoint.phase === 'preparing') {
    if (receipt && (await session.readPlanApplicationState(receipt)) !== 'planned')
      throw Error('Direct activation preparation cannot adopt submitted plan');
    await revalidate();
    await verifyIds();
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await up();
    const current = await configuration();
    if (current === source.initialConfiguration) {
      if (receipt) throw Error('Activation plan cannot belong to original configuration');
      await session.reviseConfiguration(hash(current), source.activatedConfiguration);
    } else if (current !== source.activatedConfiguration)
      throw Error('Direct activation current configuration differs');
    receipt ??= await session.plan(env, signal);
    checkReceipt(receipt);
    checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), 'original');
    checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'ce');
    await storage.write('terraform-direct-activation-plan.json', receipt);
    await storage.verify();
    await storage.write(marker, checkpointFor('submission-pending'));
    checkpoint = checkpointFor('submission-pending');
  }
  if ((await configuration()) !== source.activatedConfiguration)
    throw Error('Direct activation submitted configuration differs');
  if (checkpoint.phase === 'submission-pending') {
    if (!receipt) throw Error('Direct activation submitted receipt missing');
    checkReceipt(receipt);
    let state = await session.readPlanApplicationState(receipt);
    if (state === 'planned') {
      await revalidate();
      await verifyIds();
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
      await up();
      checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), 'original');
      checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'ce');
      await storage.verify();
      if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(ownership))
        throw Error('Direct activation durable ownership changed before submission');
      signal?.throwIfAborted();
      await session.apply(receipt, env, signal);
      state = await session.readPlanApplicationState(receipt);
    }
    if (!['applying', 'applied'].includes(state)) throw Error('Direct activation requires submitted exact plan');
    const first = await session.readAppliedResourceFields(receipt, fields, env, signal);
    checkFields(first, 'ce');
    const cloud = await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
    const second = await session.readAppliedResourceFields(receipt, fields, env, signal);
    checkFields(second, 'ce');
    if (canonicalSha256(first) !== canonicalSha256(second)) throw Error('Direct activation applied evidence changed');
    const evidence = { sourceSha256, receipt, first, cloud, second };
    await storage.verify();
    await storage.write('terraform-direct-activation-reconciliation.json', evidence);
    if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
    await storage.write(marker, checkpointFor('refresh-pending'));
  }
  // Refresh may replace the runner journal; checkpoint precedes it so a lost response never replays activation.
  await verifyIds();
  await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
  await up();
  const refresh = await session.plan(env, signal);
  checkReceipt(refresh, true);
  checkFields(await session.readPlannedResourceFields(refresh, fields, env, signal), 'ce');
  await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
  await storage.verify();
  await storage.write('terraform-direct-activation-refresh.json', refresh);
  await storage.write(marker, checkpointFor('activated'));
  return {
    status: 'pending-route-and-traffic-acceptance',
    directRoutesActivated: true,
    terraformNoChanges: true,
    traffic: 'unknown',
  };
}

/** Admit only a journaled selected route target delta; all remaining preflight configuration stays immutable. */
export async function normalizeAwsTerraformDirectPreflight(
  plan: AwsCePlan,
  current: AwsCeObservation,
  storage: Store,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<AwsCeObservation> {
  const source = await optional<Source>(storage, sourceFile);
  if (!source) return current;
  await storage.verify();
  const owner = storage.owner;
  if (
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region
  )
    throw Error('Direct preflight owner differs');
  const ownership = (await storage.read('terraform-direct-ownership.json')) as AwsTerraformDirectOwnership;
  const imported = (await storage.read('terraform-direct-import-source.json')) as {
    schemaVersion: number;
    sourcePlanSha256: string;
    ownership: AwsTerraformDirectOwnership;
    initialConfiguration: string;
    importedConfiguration: string;
  };
  if (
    imported.schemaVersion !== 1 ||
    imported.sourcePlanSha256 !== plan.planSha256 ||
    canonicalSha256(imported.ownership) !== canonicalSha256(ownership) ||
    renderAwsTerraformDirectImport(plan, ownership, imported.initialConfiguration).configuration !==
      imported.importedConfiguration ||
    canonicalSha256(source) !==
      canonicalSha256({
        schemaVersion: 1,
        sourcePlanSha256: plan.planSha256,
        ownershipSha256: ownership.snapshotSha256,
        initialConfiguration: imported.importedConfiguration,
        activatedConfiguration: renderAwsTerraformDirectTransition(
          plan,
          ownership,
          imported.importedConfiguration,
          'original',
          'ce',
        ).configuration,
        importSourceSha256: canonicalSha256(imported),
      })
  )
    throw Error('Direct preflight source differs');
  const checkpoint = await optional<Record<string, unknown>>(storage, marker);
  if (!checkpoint) return current;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourceSha256 !== canonicalSha256(source) ||
    !['preparing', 'submission-pending', 'refresh-pending', 'activated'].includes(String(checkpoint.phase))
  )
    throw Error('Direct preflight checkpoint differs');
  if (checkpoint.phase === 'preparing') return current;
  const receipt = (await storage.read('terraform-direct-activation-plan.json')) as PlanReceipt;
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.configurationSha256 !== hash(source.activatedConfiguration) ||
    receipt.operation ||
    receipt.imports?.length ||
    receipt.relinquishments?.length ||
    receipt.actionInvocations?.length ||
    new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
    ownership.routes.some(
      (r) =>
        receipt.changes.filter(
          (c) => c.address === r.address && c.type === 'aws_route' && c.actions.join(',') === 'update',
        ).length !== 1,
    ) ||
    receipt.changes.some(
      (c) => !ownership.routes.some((r) => r.address === c.address) && c.actions.join(',') !== 'no-op',
    )
  )
    throw Error('Direct preflight activation receipt differs');
  const normalized = structuredClone(current);
  let ceTargets = 0;
  for (const route of ownership.routes) {
    const resources = normalized.resources.filter((r) => r.id === route.routeTableId);
    if (resources.length !== 1) throw Error('Direct preflight table inventory differs');
    const tables = resources[0].state.RouteTables as Array<Record<string, unknown>>;
    if (!Array.isArray(tables) || tables.length !== 1) throw Error('Direct preflight table unavailable');
    const routes = tables[0].Routes as Array<Record<string, unknown>>;
    if (!Array.isArray(routes)) throw Error('Direct preflight routes unavailable');
    const matches = routes.filter((r) => r.DestinationCidrBlock === route.destinationCidr);
    if (matches.length !== 1) throw Error('Direct preflight selected destination differs');
    const row = matches[0];
    const target = {
      gateway_id: 'GatewayId',
      nat_gateway_id: 'NatGatewayId',
      network_interface_id: 'NetworkInterfaceId',
      transit_gateway_id: 'TransitGatewayId',
      vpc_peering_connection_id: 'VpcPeeringConnectionId',
    }[route.originalTarget.field];
    if (!target) throw Error('Direct preflight original target unavailable');
    if (row.NetworkInterfaceId === route.networkInterfaceId) {
      if (
        [
          'GatewayId',
          'NatGatewayId',
          'TransitGatewayId',
          'VpcPeeringConnectionId',
          'InstanceId',
          'EgressOnlyInternetGatewayId',
          'CarrierGatewayId',
          'LocalGatewayId',
        ].some((k) => Object.hasOwn(row, k))
      )
        throw Error('Direct preflight selected target ambiguous');
      ceTargets++;
      delete row.NetworkInterfaceId;
      row[target] = route.originalTarget.id;
    }
  }
  if (ceTargets && ceTargets !== ownership.routes.length) throw Error('Direct preflight partial route transition');
  if (ceTargets) await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
  else {
    if (checkpoint.phase !== 'submission-pending') throw Error('Direct preflight activated routes reverted');
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
  }
  return normalized;
}

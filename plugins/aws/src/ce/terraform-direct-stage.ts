import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { renderAwsTerraformDirectImport } from './terraform-direct-import';
import {
  type AwsTerraformDirectOwnership,
  collectAwsTerraformDirectRouteOwnership,
} from './terraform-direct-ownership';
import { observeAwsTerraformDirectPhase } from './terraform-direct-transition';
import type { AwsCePlan } from './types';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const marker = 'terraform-direct-import-stage.json';
const sourceFile = 'terraform-direct-import-source.json';
type Store = Pick<CeDeploymentStore, 'owner' | 'read' | 'write' | 'verify'>;
interface Source {
  schemaVersion: 1;
  sourcePlanSha256: string;
  ownership: AwsTerraformDirectOwnership;
  initialConfiguration: string;
  importedConfiguration: string;
}
const optional = async <T>(storage: Store, name: string): Promise<T | undefined> => {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

/** Import original routes into owning state without changing any cloud target. Activation is a separate gate. */
export async function importAwsTerraformDirectRoutes(
  plan: AwsCePlan,
  values: Record<string, string>,
  session: TerraformSession,
  storage: Store,
  api: AwsExecApi,
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
    !session.readResourceIdentities ||
    !session.planImports
  )
    throw Error('Direct import requires exact durable owner and owning runner capabilities');
  signal?.throwIfAborted();
  await storage.verify();
  let source = await optional<Source>(storage, sourceFile);
  let checkpoint = await optional<Record<string, unknown>>(storage, marker);
  if (!source) {
    if (checkpoint) throw Error('Direct import source missing');
    const ownership = await collectAwsTerraformDirectRouteOwnership(plan, values, api, signal);
    const initialConfiguration = await session.readConfiguration(await session.readConfigurationSha256());
    const translated = renderAwsTerraformDirectImport(plan, ownership, initialConfiguration);
    const identities = await session.readResourceIdentities(env, signal);
    if (identities.some((r) => ownership.routes.some((route) => route.address === r.address)))
      throw Error('Direct import route already exists in state without a bound source');
    source = {
      schemaVersion: 1,
      sourcePlanSha256: plan.planSha256,
      ownership,
      initialConfiguration,
      importedConfiguration: translated.configuration,
    };
    await storage.write(sourceFile, source);
  }
  const translated = renderAwsTerraformDirectImport(plan, source.ownership, source.initialConfiguration);
  if (
    source.schemaVersion !== 1 ||
    source.sourcePlanSha256 !== plan.planSha256 ||
    translated.configuration !== source.importedConfiguration ||
    canonicalSha256(source.ownership.interfaces.map((i) => i.id)) !==
      canonicalSha256([values.__ENI_1_0__, values.__ENI_1_1__]) ||
    source.ownership.instanceId !== values.__INSTANCE_1__
  )
    throw Error('Direct import source differs from owning plan or interface bindings');
  const sourceSha256 = canonicalSha256(source);
  const checkpointFor = (phase: string) => ({ schemaVersion: 1, engine: 'terraform', sourceSha256, phase });
  const saved = await optional<PlanReceipt>(storage, 'terraform-direct-import-plan.json');
  if (!checkpoint) {
    if (saved || (await session.readConfigurationSha256()) !== hash(source.initialConfiguration))
      throw Error('Orphan direct import source cannot adopt revised configuration or a plan');
    if (
      (await session.readResourceIdentities(env, signal)).some((r) =>
        source.ownership.routes.some((route) => route.address === r.address),
      )
    )
      throw Error('Orphan direct import source cannot adopt existing route state');
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    checkpoint = checkpointFor('preparing');
    await storage.write(marker, checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourceSha256 !== sourceSha256 ||
    !['preparing', 'submission-pending', 'imported'].includes(String(checkpoint.phase))
  )
    throw Error('Direct import checkpoint differs');
  const names = source.ownership.routes.map((r) => r.address);
  const fields = Object.fromEntries(
    source.ownership.routes.map((r) => [
      r.address,
      [
        'id',
        'route_table_id',
        'destination_cidr_block',
        'gateway_id',
        'nat_gateway_id',
        'network_interface_id',
        'transit_gateway_id',
        'vpc_peering_connection_id',
      ],
    ]),
  );
  const checkFields = (projected: Record<string, Record<string, unknown> | null>) => {
    if (canonicalSha256(Object.keys(projected).sort()) !== canonicalSha256([...names].sort()))
      throw Error('Direct import applied state inventory differs');
    for (const route of source.ownership.routes) {
      const row = projected[route.address];
      let crc = 0xffffffff;
      for (const byte of Buffer.from(route.destinationCidr)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      const id = `r-${route.routeTableId}${(crc ^ 0xffffffff) >>> 0}`;
      if (
        !row ||
        row.id !== id ||
        row.route_table_id !== route.routeTableId ||
        row.destination_cidr_block !== route.destinationCidr ||
        fields[route.address]
          .slice(3)
          .some(
            (field) =>
              !Object.hasOwn(row, field) ||
              (field === route.originalTarget.field
                ? row[field] !== route.originalTarget.id
                : ![null, ''].includes(row[field] as string | null)),
          )
      )
        throw Error('Direct import applied route identity or target differs');
    }
  };
  const validateReceipt = (receipt: PlanReceipt) => {
    if (
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== plan.deploymentName ||
      receipt.configurationSha256 !== hash(source.importedConfiguration) ||
      receipt.operation ||
      receipt.actionInvocations?.length ||
      receipt.relinquishments?.length ||
      canonicalSha256(receipt.imports) !== canonicalSha256(translated.intents) ||
      new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
      names.some((name) => receipt.changes.filter((c) => c.address === name && c.type === 'aws_route').length !== 1) ||
      receipt.changes.some((c) => c.actions.length !== 1 || c.actions[0] !== 'no-op')
    )
      throw Error('Direct import saved plan would mutate resources or import foreign identities');
  };
  let receipt = saved;
  if (checkpoint.phase === 'preparing') {
    if (receipt && (await session.readPlanApplicationState(receipt)) !== 'planned')
      throw Error('Direct import preparation cannot adopt a submitted plan');
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    const currentSha = await session.readConfigurationSha256();
    const current = await session.readConfiguration(currentSha);
    if (current === source.initialConfiguration && currentSha === hash(current)) {
      if (receipt) throw Error('Direct import saved plan cannot belong to initial configuration');
      await session.reviseConfiguration(currentSha, source.importedConfiguration);
    } else if (current !== source.importedConfiguration || currentSha !== hash(current))
      throw Error('Direct import current configuration differs');
    receipt ??= await session.planImports(translated.intents, env, signal);
    validateReceipt(receipt);
    await storage.write('terraform-direct-import-plan.json', receipt);
    await storage.write('terraform-direct-ownership.json', source.ownership);
    await storage.verify();
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    await storage.write(marker, checkpointFor('submission-pending'));
    await session.apply(receipt, env, signal);
  }
  if (!receipt) throw Error('Direct import submitted plan receipt missing');
  validateReceipt(receipt);
  if ((await session.readConfigurationSha256()) !== hash(source.importedConfiguration))
    throw Error('Direct import submitted configuration differs');
  if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(source.ownership))
    throw Error('Direct import durable original ownership differs');
  let state = await session.readPlanApplicationState(receipt);
  if (state === 'planned' && checkpoint.phase === 'submission-pending') {
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    await session.apply(receipt, env, signal);
    state = await session.readPlanApplicationState(receipt);
  }
  if (!['applying', 'applied'].includes(state)) throw Error('Direct import requires submitted exact plan');
  const first = await session.readAppliedResourceFields(receipt, fields, env, signal);
  checkFields(first);
  const cloud = await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
  const second = await session.readAppliedResourceFields(receipt, fields, env, signal);
  checkFields(second);
  if (canonicalSha256(first) !== canonicalSha256(second)) throw Error('Direct import applied evidence changed');
  const evidence = { sourceSha256, receipt, first, cloud, second };
  await storage.verify();
  await storage.write('terraform-direct-import-reconciliation.json', evidence);
  if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
  await storage.write(marker, checkpointFor('imported'));
  return {
    status: 'pending-direct-route-transition',
    originalRoutesImported: true,
    routing: 'unknown',
    traffic: 'unknown',
  };
}

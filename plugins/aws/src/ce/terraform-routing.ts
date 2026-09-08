import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { assertAttachmentAvailable } from './attachment-gate';
import { collectAwsNetworkHealth } from './network-health';
import { type AwsRoutingRebind, configureAwsRouting, validateAwsRoutingRebind } from './routing-apply';
import { scopedAwsApi } from './scoped-exec';
import { discoverAwsTerraformInterfaces } from './terraform-identities';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Translate state locators into the common live collector, never Terraform health assertions. */
export function bindTerraformConnectPeers(
  plan: AwsCePlan,
  outputs: Record<string, unknown>,
  interfaceBindings: Record<string, string>,
): Record<string, string> {
  verifyAwsCePlan(plan);
  if (plan.engine !== 'terraform' || plan.routing.profile !== 'tgw-connect')
    throw new Error('Terraform Connect ownership and profile are required');
  const peers = object(outputs.ce_connect_peers);
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (!actions.length || Object.keys(peers).length !== actions.length)
    throw new Error('Terraform Connect peer output is incomplete');
  if (
    typeof outputs.ce_vpc_id !== 'string' ||
    !/^vpc-[0-9a-f]{8,17}$/.test(outputs.ce_vpc_id) ||
    typeof outputs.ce_transport_attachment !== 'string' ||
    !/^tgw-attach-[0-9a-f]{8,17}$/.test(outputs.ce_transport_attachment)
  )
    throw new Error('Terraform transport output is incomplete');
  const values: Record<string, string> = {
    ...interfaceBindings,
    __VPC_ID__: outputs.ce_vpc_id,
    __TGW_TRANSPORT_ATTACHMENT__: outputs.ce_transport_attachment,
  };
  const ids = new Set<string>();
  for (const [index, action] of actions.entries()) {
    const peer = object(peers[String(index + 1)]);
    const attachmentIndex = action.args?.indexOf('--transit-gateway-attachment-id') ?? -1;
    const attachment = attachmentIndex >= 0 ? action.args?.[attachmentIndex + 1] : undefined;
    const addressIndex = action.args?.indexOf('--peer-address') ?? -1;
    const address = addressIndex >= 0 ? action.args?.[addressIndex + 1] : undefined;
    const role =
      address === `__NODE_${action.node}_SLO_IP__` ? 0 : address === `__NODE_${action.node}_SLI_IP__` ? 1 : undefined;
    if (
      !action.capture?.placeholder ||
      !attachment ||
      !/^__TGW_CONNECT_ATTACHMENT_[01]_\d+__$/.test(attachment) ||
      role === undefined ||
      peer.node !== action.node ||
      peer.transport_interface_index !== role ||
      typeof peer.id !== 'string' ||
      !/^tgw-connect-peer-[0-9a-f]{8,21}$/.test(peer.id) ||
      ids.has(peer.id) ||
      typeof peer.attachment_id !== 'string' ||
      !/^tgw-attach-[0-9a-f]{8,17}$/.test(peer.attachment_id) ||
      (values[attachment] !== undefined && values[attachment] !== peer.attachment_id)
    )
      throw new Error('Terraform Connect output differs from the planned peer topology');
    if (
      Object.entries(values).some(
        ([key, value]) =>
          key.startsWith('__TGW_CONNECT_ATTACHMENT_') && key !== attachment && value === peer.attachment_id,
      )
    )
      throw new Error('Terraform Connect attachment roles are ambiguous');
    ids.add(peer.id);
    values[action.capture.placeholder] = peer.id;
    values[attachment] = peer.attachment_id;
  }
  return values;
}

export async function configureAwsTerraformRouting(
  plan: AwsCePlan,
  session: TerraformSession,
  runtime: CeRuntime,
  storage: Pick<CeDeploymentStore, 'write' | 'verify'>,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  rebind?: AwsRoutingRebind,
) {
  await storage.verify();
  if (rebind) validateAwsRoutingRebind(plan, rebind);
  const outputs = await session.readOutputs(
    ['ce_vpc_id', 'ce_interfaces', 'ce_instances', 'ce_connect_peers', 'ce_transport_attachment'],
    env,
    signal,
  );
  const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
  const checkpoint = {
    schemaVersion: 2,
    engine: 'terraform',
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    state: 'running',
    resolvedValues: {
      ...Object.fromEntries(
        Object.entries(rebind?.checkpoint.resolvedValues ?? {}).filter(([key]) => key.startsWith('__XC_ROUTING_')),
      ),
      ...bindTerraformConnectPeers(plan, outputs, discovered.bindings),
    },
  } as AwsCeCheckpoint;
  const persist = () => storage.write('terraform-routing-checkpoint.json', checkpoint);
  await persist();
  const scoped = scopedAwsApi(api, plan.intent.awsProfile, signal);
  for (const action of plan.actions.filter((action) => action.kind === 'tgw-attachment-gate'))
    await assertAttachmentAvailable(action, plan, checkpoint, scoped);
  await configureAwsRouting(runtime, plan, checkpoint, scoped, persist, signal, rebind);
  return collectAwsNetworkHealth('bgp', plan, checkpoint, scoped, signal);
}

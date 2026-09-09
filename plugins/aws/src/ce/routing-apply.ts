import type { VerifiedRoutingContract } from '../../../platform/src/ce/routing-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsGreBinding } from '../../../platform/src/ce/wire-routing';
import type { AwsExecApi } from '../aws/exec';
import { collectAwsNetworkHealth } from './network-health';
import { siteBindings } from './topology';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

export interface AwsRoutingRebind {
  siteName: string;
  siteUid: string;
  contract: VerifiedRoutingContract;
  checkpoint: AwsCeCheckpoint;
}

/** Validate frozen routing locators before any replacement cloud mutation or checkpoint overwrite. */
export function validateAwsRoutingRebind(plan: AwsCePlan, rebind: AwsRoutingRebind): void {
  const selected = siteBindings(plan).find(({ site }) => site.name === rebind.siteName);
  const cp = rebind.checkpoint;
  if (
    !selected ||
    !rebind.siteUid ||
    cp.schemaVersion !== 2 ||
    cp.engine !== plan.engine ||
    cp.planSha256 !== plan.planSha256 ||
    cp.planId !== plan.planId ||
    !cp.resolvedValues ||
    typeof cp.resolvedValues !== 'object' ||
    Array.isArray(cp.resolvedValues)
  )
    throw new Error('Replacement routing checkpoint differs from deployment');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const names = actions
    .filter((action) => selected.site.nodeIndexes.includes(action.node ?? 0))
    .map((action) => `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`);
  if (!names.length) throw new Error('Replacement site has no Connect routing inventory');
  names.push(`${rebind.siteName.slice(0, 55)}-tgw-bgp`);
  names.push(`${rebind.siteName.slice(0, 43)}-tgw-export-policy`);
  const uids = names.map((name) => cp.resolvedValues[`__XC_ROUTING_${name}__`]);
  if (uids.some((uid) => typeof uid !== 'string' || !uid.trim()) || new Set(uids).size !== uids.length)
    throw new Error('Replacement routing UIDs are missing or duplicated');
}

export async function configureAwsRouting(
  runtime: CeRuntime,
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  api: AwsExecApi,
  persist: () => Promise<unknown>,
  signal?: AbortSignal,
  rebind?: AwsRoutingRebind,
): Promise<void> {
  if (rebind) validateAwsRoutingRebind(plan, rebind);
  const facts = await collectAwsNetworkHealth('bgp', plan, checkpoint, api, signal);
  if (facts.status === 'unknown' || !Array.isArray(facts.sessions) || !Array.isArray(facts.transports))
    throw new Error('AWS GRE endpoint evidence has not converged');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  for (const { site, binding } of siteBindings(plan)) {
    if (rebind && site.name !== rebind.siteName) continue;
    const peers = actions.filter((action) => site.nodeIndexes.includes(action.node ?? 0));
    const expected = peers.map((action) => {
      const argument = action.args?.[action.args.indexOf('--peer-address') + 1];
      const role = argument?.includes('_SLO_IP__') ? ('slo' as const) : ('sli' as const);
      const node = `${plan.deploymentName}-${action.node}`;
      const mac = checkpoint.resolvedValues[`__ENI_${action.node}_${role === 'slo' ? 0 : 1}_MAC__`];
      if (!mac) throw new Error('AWS GRE transport MAC is unavailable');
      return { node, role, mac };
    });
    const unique = expected.filter(
      (item, index) => expected.findIndex((other) => other.node === item.node && other.mac === item.mac) === index,
    );
    const observed = await runtime.observeAwsInterfaces(binding, unique, signal);
    if (observed.status !== 'observed') throw new Error('XC GRE interface evidence has not converged');
    const interfaces: AwsGreBinding[] = peers.map((action, index) => {
      const peerId = checkpoint.resolvedValues[action.capture?.placeholder ?? ''];
      const transport = (facts.transports as Record<string, unknown>[]).find((item) => item.peerId === peerId);
      const sessions = (facts.sessions as Record<string, unknown>[]).filter((item) => item.peerId === peerId);
      const iface = observed.interfaces.find(
        (item) =>
          item.node === expected[index].node &&
          item.mac === expected[index].mac.toLowerCase() &&
          item.role === expected[index].role,
      );
      if (!transport || sessions.length !== 2 || sessions[0].ceEndpoint !== sessions[1].ceEndpoint || !iface)
        throw new Error('GRE endpoint binding is incomplete');
      return {
        name: `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`,
        node: iface.node,
        interfaceName: iface.interfaceName,
        interfaceMtu: iface.mtu,
        awsGreAddress: String(transport.awsGreAddress),
        ceInsideAddress: String(sessions[0].ceEndpoint),
        awsBgpAddresses: sessions.map((item) => String(item.awsEndpoint)).sort() as [string, string],
      };
    });
    await runtime.ensureAwsRouting(
      binding,
      plan.routing.customerAsn ?? 0,
      plan.routing.transitGatewayAsn ?? 0,
      interfaces,
      async (resource) => {
        checkpoint.resolvedValues[`__XC_ROUTING_${String(resource.name)}__`] = String(resource.uid);
        await persist();
      },
      signal,
      rebind
        ? {
            contract: rebind.contract,
            siteUid: rebind.siteUid,
            resources: [
              ...interfaces.map((item) => ({ kind: 'external_connector' as const, name: item.name })),
              {
                kind: 'bgp_routing_policy' as const,
                name: `${binding.siteName.slice(0, 43)}-tgw-export-policy`,
              },
              { kind: 'bgp' as const, name: `${binding.siteName.slice(0, 55)}-tgw-bgp` },
            ].map((item) => ({ ...item, uid: rebind.checkpoint.resolvedValues[`__XC_ROUTING_${item.name}__`] ?? '' })),
          }
        : undefined,
    );
  }
}

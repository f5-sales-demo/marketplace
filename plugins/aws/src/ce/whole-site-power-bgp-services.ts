import type { ExpectedBgpSession } from '../../../platform/src/ce/bgp-evidence';
import {
  buildAwsBgpPowerPolicyRevision,
  type AwsBgpPowerPolicyRevision,
} from '../../../platform/src/ce/bgp-power-policy';
import type { ExpectedBgpServiceTable } from '../../../platform/src/ce/bgp-service-membership';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';
import { collectAwsPowerConnectRoutes } from './whole-site-power-connect';

type Json = Record<string, unknown>;
function object(v: unknown): Json {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed BGP service binding');
  return v as Json;
}
function rows(v: unknown): Json[] {
  if (!Array.isArray(v)) throw Error('Incomplete BGP service binding');
  return v.map(object);
}
type RoutingSnapshot = Awaited<ReturnType<CeRuntime['observePowerRouting']>>;
export interface AwsBgpPowerSiteBinding {
  binding: SiteBinding;
  siteUid: string;
  bgpName: string;
  bgpUid: string;
  contractFingerprint: string;
  originalSpec: Json;
  connectors: Array<{ name: string; uid: string; spec: Json }>;
  sessions: ExpectedBgpSession[];
  tables: ExpectedBgpServiceTable[];
  revision: AwsBgpPowerPolicyRevision;
}
/** Compose cloud ownership, exact generated F5 objects and actual registration hardware. No operational freshness is inferred. */
export async function collectAwsPowerBgpServices(
  base: AwsCePlan,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
  retained?: AwsBgpPowerSiteBinding[],
) {
  const cloud = await collectAwsPowerConnectRoutes(base, values, api, signal);
  const sites = siteBindings(base),
    platform: AwsBgpPowerSiteBinding[] = [],
    snapshots: RoutingSnapshot[] = [],
    observations = [];
  if (
    retained &&
    (retained.length !== sites.length || new Set(retained.map((s) => s.binding.siteName)).size !== sites.length)
  )
    throw Error('Retained BGP site inventory differs');
  const actions = base.actions.filter((a) => a.kind === 'tgw-connect-peer-create');
  for (const { site, binding } of sites) {
    const name = `${site.name.slice(0, 55)}-tgw-bgp`,
      snapshot = await runtime.observePowerRouting(binding, 'bgp', name, signal);
    if (
      snapshot.uid !== values[`__XC_ROUTING_${name}__`] ||
      snapshot.kind !== 'bgp' ||
      canonicalSha256(snapshot.binding) !== canonicalSha256(binding) ||
      snapshot.contractFingerprint !== runtime.contract.fingerprint
    )
      throw Error('BGP generated object differs from trusted deployment binding');
    const prior = retained?.find((s) => s.binding.siteName === site.name);
    if (
      prior &&
      (canonicalSha256(prior.binding) !== canonicalSha256(binding) ||
        prior.siteUid !== snapshot.siteUid ||
        prior.bgpName !== name ||
        prior.bgpUid !== snapshot.uid ||
        prior.contractFingerprint !== snapshot.contractFingerprint)
    )
      throw Error('Retained BGP object or site identity differs');
    const original = prior?.originalSpec ?? snapshot.spec;
    if (object(original.bgp_parameters).asn !== base.intent.routing.customerAsn)
      throw Error('BGP local ASN differs from owning plan');
    const revision = buildAwsBgpPowerPolicyRevision(
      original,
      site.name,
      cloud.services.prefixes,
      'withdraw',
      (kind, spec) => runtime.contract.validateRouting(kind, spec),
    );
    if (
      prior &&
      (canonicalSha256(prior.revision) !== canonicalSha256(revision) ||
        ![canonicalSha256(original), canonicalSha256(revision.bgpSpec)].includes(canonicalSha256(snapshot.spec)))
    )
      throw Error('Retained BGP revision or current spec differs');
    const selected = cloud.services.peers.filter((p) => site.nodeIndexes.includes(Number(p.node)));
    const expectedHardware = site.nodeIndexes.flatMap((node) =>
      base.intent.interfaces.map((i) => ({
        node: `${base.deploymentName}-${node}`,
        role: i.role === 'slo' || i.role === 'sli' ? i.role : ('data' as const),
        mac: values[`__ENI_${node}_${i.index}_MAC__`],
      })),
    );
    const instances = Object.fromEntries(
      site.nodeIndexes.map((node) => [`${base.deploymentName}-${node}`, values[`__INSTANCE_${node}__`]]),
    );
    const hardware = await runtime.observeRegisteredDevices(binding, instances, expectedHardware, signal);
    if (hardware.status !== 'observed' || hardware.interfaces.length !== expectedHardware.length)
      throw Error('BGP registration hardware identity unavailable');
    const sessions: ExpectedBgpSession[] = [],
      connectors: AwsBgpPowerSiteBinding['connectors'] = [];
    for (const peer of selected) {
      const actionIndex = actions.findIndex((a) => values[a.capture?.placeholder ?? ''] === peer.peerId),
        connectorName = `${base.deploymentName.slice(0, 24)}-gre-${actionIndex + 1}`;
      const connector = await runtime.observePowerRouting(binding, 'external_connector', connectorName, signal);
      if (
        actionIndex < 0 ||
        connector.siteUid !== snapshot.siteUid ||
        connector.uid !== values[`__XC_ROUTING_${connectorName}__`] ||
        connector.kind !== 'external_connector' ||
        canonicalSha256(connector.binding) !== canonicalSha256(binding) ||
        connector.contractFingerprint !== snapshot.contractFingerprint
      )
        throw Error('BGP connector generated identity differs');
      const ref = object(connector.spec.ce_site_reference),
        gre = object(object(connector.spec.gre).gre_parameters),
        endpoints = rows(gre.tunnel_eps);
      const node = `${base.deploymentName}-${peer.node}`,
        devices = hardware.interfaces.filter(
          (i) =>
            i.node === node && i.mac === peer.mac && i.role === (Number(peer.interfaceIndex) === 0 ? 'slo' : 'sli'),
        );
      if (
        ref.name !== site.name ||
        ref.namespace !== 'system' ||
        endpoints.length !== 1 ||
        devices.length !== 1 ||
        endpoints[0].node !== node ||
        endpoints[0].interface !== devices[0].device ||
        endpoints[0].local_tunnel_ip !== `${peer.ceEndpoint}/29` ||
        !(peer.awsEndpoints as string[]).some((ip) => endpoints[0].remote_tunnel_ip === `${ip}/29`) ||
        object(gre.peer_ip_address).addr !== peer.awsGreAddress ||
        !Object.hasOwn(gre, 'site_local_inside_network')
      )
        throw Error('BGP connector physical node/device/MAC/tunnel join differs');
      connectors.push({ name: connectorName, uid: connector.uid, spec: connector.spec });
      for (const address of peer.awsEndpoints as string[])
        sessions.push({ node, interfaceName: `ves-io-external-connector-${connectorName}`, peerAddress: address });
    }
    const peers = rows(original.peers);
    if (
      peers.length !== sessions.length ||
      sessions.some(
        (s) =>
          peers.filter((p) => {
            const e = object(p.external),
              ref = object(e.interface);
            return (
              e.address === s.peerAddress &&
              e.asn === base.intent.routing.transitGatewayAsn &&
              ref.name === s.interfaceName &&
              ref.namespace === 'system'
            );
          }).length !== 1,
      )
    )
      throw Error('BGP peer spec and cloud endpoint inventory differ');
    let tables = prior?.tables;
    if (!tables) {
      const observed = await runtime.observeBgpRoutes(binding, signal);
      if (
        observed.status !== 'observed' ||
        canonicalSha256(observed.owner) !== canonicalSha256(binding.owner) ||
        observed.siteName !== binding.siteName ||
        observed.contractFingerprint !== snapshot.contractFingerprint
      )
        throw Error('BGP route discovery binding differs');
      tables = binding.nodes.map((node) => {
        const matches = observed.nodes
          .filter((n) => n.node === node)
          .flatMap((n) =>
            n.routingInstances.flatMap((ri) =>
              ri.tables
                .filter((t) => cloud.services.prefixes.every((p) => t.exported.includes(p)))
                .map((t) => ({ node, routingInstance: ri.name, table: t.name })),
            ),
          );
        if (matches.length !== 1) throw Error('BGP service routing instance/table discovery missing or ambiguous');
        return matches[0];
      });
    }
    const current: AwsBgpPowerSiteBinding = {
      binding,
      siteUid: snapshot.siteUid,
      bgpName: name,
      bgpUid: snapshot.uid,
      contractFingerprint: snapshot.contractFingerprint,
      originalSpec: original,
      connectors,
      sessions,
      tables,
      revision,
    };
    if (prior && canonicalSha256(current) !== canonicalSha256(prior))
      throw Error('BGP retained service inventory changed');
    const observation = await runtime.observeBgpServiceMembership(
      binding,
      snapshot.siteUid,
      sessions,
      tables,
      cloud.services.prefixes,
      signal,
    );
    if (
      canonicalSha256(observation.owner) !== canonicalSha256(binding.owner) ||
      observation.siteName !== binding.siteName ||
      observation.siteUid !== snapshot.siteUid ||
      observation.contractFingerprint !== snapshot.contractFingerprint
    )
      throw Error('BGP service observation binding differs');
    const final = await runtime.observePowerRouting(binding, 'bgp', name, signal);
    if (
      final.uid !== snapshot.uid ||
      final.siteUid !== snapshot.siteUid ||
      final.resourceVersion !== snapshot.resourceVersion ||
      canonicalSha256(final.spec) !== canonicalSha256(snapshot.spec)
    )
      throw Error('BGP object changed during service collection');
    platform.push(current);
    snapshots.push(snapshot);
    observations.push(observation);
  }
  if (new Set(platform.map((s) => s.revision.policy.name)).size !== platform.length)
    throw Error('BGP maintenance policy names collide');
  const services = { schemaVersion: 1, kind: 'aws-ce-bgp-power-services', cloud: cloud.services, platform };
  const statuses = [cloud.status, ...observations.map((o) => o.status)];
  return {
    services,
    servicesSha256: canonicalSha256(services),
    snapshots,
    cloud,
    observations,
    status: statuses.every((s) => s === 'active')
      ? ('active' as const)
      : statuses.every((s) => s === 'withdrawn')
        ? ('withdrawn' as const)
        : ('pending' as const),
    freshness: 'unqualified' as const,
    traffic: 'unknown' as const,
    collectedAt: new Date().toISOString(),
  };
}

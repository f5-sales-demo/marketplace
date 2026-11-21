import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { parseBgpRoutes } from '../../../platform/src/ce/bgp-route-evidence';
import type { ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from './terraform-network-replacement-execution';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import type { AzureTerraformNetworkReplacementSourceBinding } from './terraform-network-replacement-source-binding';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
type Runtime = Partial<Pick<CeRuntime, 'observeBgpSessions' | 'observeBgpRoutes'>>;
function require(value: unknown): asserts value {
  if (!value) throw Error('Replacement BGP owner, identity or complete scope differs');
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Json;
}
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Read-only retained Route Server and CE BGP observations. The expected server owner
 * comes from authenticated private Terraform bytes, while SLO addresses/MACs come from
 * the full current replacement vector. Counts, route presence and state-change times
 * never establish original CE heartbeat freshness or effective traffic acceptance.
 */
export async function collectAzureReplacementBgp(
  request: AzureCePlan,
  expected: AzureTerraformNetworkReplacementOperationalIdentity,
  retainedSource: AzureTerraformNetworkReplacementSourceBinding,
  physical: ObservedCeInterface[],
  cloud: AzExecApi,
  runtime: Runtime,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    source = structuredClone(retainedSource),
    interfaces = structuredClone(physical),
    binding = azureUpgradeBinding(plan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  const refs = [cloud.exec, runtime.observeBgpSessions, runtime.observeBgpRoutes];
  const snapshots = [request, expected, retainedSource, physical].map(canonicalSha256);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(
      refs.every((fn, index) => fn === [cloud.exec, runtime.observeBgpSessions, runtime.observeBgpRoutes][index]) &&
        canonicalEqual(snapshots, [request, expected, retainedSource, physical].map(canonicalSha256)),
    );
  };
  const step = async <T>(work: () => Promise<T>): Promise<T> => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      abort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', abort, { once: true });
    try {
      const value = await Promise.race([Promise.resolve().then(work), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', abort);
    }
  };
  require(
    identity.planSha256 === plan.planSha256 &&
      canonicalEqual(identity.owner, binding.owner) &&
      source.planSha256 === plan.planSha256 &&
      source.originalPlanSha256 === profile.originalPlanSha256 &&
      source.retainedPlanSha256 === profile.retainedPlanSha256 &&
      canonicalEqual(source.owner, identity.owner) &&
      canonicalEqual(source.site, identity.site) &&
      canonicalSha256(source) === identity.sourceBindingSha256 &&
      createHash('sha256').update(source.source).digest('hex') === source.sourceConfigurationSha256,
  );
  require(
    canonicalEqual(
      Object.keys(identity.nodes).sort(),
      Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1)).sort(),
    ) &&
      interfaces.length === plan.topology.nodeCount * plan.nics.length &&
      new Set(interfaces.map((row) => row.mac)).size === interfaces.length,
  );
  for (const [index, node] of binding.nodes.entries()) {
    const rows = interfaces.filter((row) => row.node === node);
    require(
      rows.length === plan.nics.length &&
        new Set(rows.map((row) => row.device)).size === rows.length &&
        new Set(rows.map((row) => row.interfaceName)).size === rows.length,
    );
    for (const nic of plan.nics) {
      const current = identity.nodes[String(index + 1)]?.nics[String(nic.index)],
        matches = rows.filter((row) => row.role === nic.role);
      require(
        current &&
          matches.length === 1 &&
          matches[0].mac === current.mac &&
          typeof matches[0].device === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(matches[0].device) &&
          typeof matches[0].interfaceName === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(matches[0].interfaceName) &&
          !matches[0].interfaceName.includes('__'),
      );
    }
  }
  const base = {
    scope: 'replacement-bgp-route-observations' as const,
    owner: structuredClone(identity.owner),
    planSha256: plan.planSha256,
    expectedIdentitySha256: canonicalSha256(identity),
    originalSampleFreshness: 'unqualified' as const,
    forwarding: 'unknown' as const,
    traffic: 'unknown' as const,
    operationalAcceptance: 'unknown' as const,
  };
  if (plan.routing.mode !== 'route-server')
    return { ...base, status: 'not-applicable' as const, reason: 'route-server-unconfigured' };
  const unknown = (reason: string) => ({ status: 'unknown' as const, reason });
  let routeExchange: Json = unknown('retained-route-server-unavailable'),
    sessions: Json = unknown('complete-ce-bgp-sessions-unavailable'),
    routes: Json = unknown('complete-ce-bgp-routes-unavailable');
  const read = async (args: string[]) => {
    const result = await step(() =>
      cloud.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], { signal: deadline }),
    );
    require(result.exitCode === 0);
    return object(JSON.parse(result.stdout));
  };
  let serviceAddresses: string[] = [];
  const serverArgs = [
    'network',
    'routeserver',
    'show',
    '--resource-group',
    plan.intent.resourceGroup,
    '--name',
    plan.deploymentName + '-rs',
  ];
  const serverIdentity = (row: Json) => ({
    id: lower(row.id),
    location: lower(row.location),
    state: row.provisioningState,
    asn: row.virtualRouterAsn,
    ips: Array.isArray(row.virtualRouterIps) ? [...row.virtualRouterIps].sort() : row.virtualRouterIps,
    tags: row.tags,
  });
  const peerIdentity = (row: Json) => ({
    id: lower(row.id),
    name: row.name,
    state: row.provisioningState,
    asn: row.peerAsn,
    ip: row.peerIp,
  });
  let retainedServer: Json | undefined;
  const retainedPeers: Array<{ args: string[]; identity: Json }> = [];
  const serverId =
    '/subscriptions/' +
    plan.subscription.id +
    '/resourceGroups/' +
    plan.intent.resourceGroup +
    '/providers/Microsoft.Network/virtualHubs/' +
    plan.deploymentName +
    '-rs';
  const peers: Json[] = [];
  try {
    const configuration = object(JSON.parse(source.source)),
      resources = object(configuration.resource),
      serverConfig = object(object(resources.azurerm_route_server).ce);
    const expectedTags = object(serverConfig.tags),
      ownerPlan = expectedTags['xcsh-plan-sha256'];
    require(
      sha(ownerPlan) &&
        expectedTags['xcsh-managed-by'] === 'azure-ce' &&
        expectedTags['xcsh-execution-engine'] === 'terraform' &&
        expectedTags['xcsh-deployment-id'] === plan.deploymentName,
    );
    const server = await read(serverArgs),
      tags = object(server.tags),
      ips = server.virtualRouterIps;
    require(
      lower(server.id) === lower(serverId) &&
        lower(server.location) === lower(plan.region) &&
        server.provisioningState === 'Succeeded' &&
        server.virtualRouterAsn === 65515 &&
        canonicalEqual(tags, expectedTags) &&
        Array.isArray(ips) &&
        ips.length === 2 &&
        new Set(ips).size === 2 &&
        ips.every((ip) => typeof ip === 'string' && isIP(ip) === 4),
    );
    retainedServer = serverIdentity(server);
    serviceAddresses = [...(ips as string[])].sort();
    const sloIndices = plan.nics.filter((nic) => nic.role === 'slo');
    require(sloIndices.length === 1);
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const name = plan.deploymentName + '-' + node,
        nic = identity.nodes[String(node)]?.nics[String(sloIndices[0].index)];
      const observed = interfaces.filter((row) => row.node === name && row.role === 'slo');
      require(nic && isIP(nic.privateIp as string) === 4 && observed.length === 1 && observed[0].mac === nic.mac);
      const common = [
        '--resource-group',
        plan.intent.resourceGroup,
        '--routeserver',
        plan.deploymentName + '-rs',
        '--name',
        name,
      ];
      const peerArgs = ['network', 'routeserver', 'peering', 'show', ...common],
        peer = await read(peerArgs);
      retainedPeers.push({ args: peerArgs, identity: peerIdentity(peer) });
      require(
        lower(peer.id) === lower(serverId + '/bgpConnections/' + name) &&
          peer.name === name &&
          peer.provisioningState === 'Succeeded' &&
          peer.peerAsn === plan.routing.localAsn &&
          peer.peerIp === nic.privateIp,
      );
      const learned = await read(['network', 'routeserver', 'peering', 'list-learned-routes', ...common]);
      require(!learned.nextLink && !learned.nextPageToken && !learned.error);
      const roles = Object.keys(learned)
        .filter((key) => /^RouteServiceRole_IN_[01]$/.test(key))
        .sort();
      require(roles.length === 2);
      const observations = roles.map((role) => {
        const rows = learned[role];
        require(Array.isArray(rows));
        const values = rows.map(object);
        require(
          values.every((row) => {
            if (typeof row.network !== 'string' || typeof row.nextHop !== 'string' || isIP(row.nextHop) !== 4)
              return false;
            const [address, prefix, extra] = row.network.split('/');
            return extra === undefined && isIP(address) === 4 && /^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix);
          }),
        );
        require(
          new Set(values.map((row) => canonicalSha256({ network: row.network, nextHop: row.nextHop }))).size ===
            values.length,
        );
        const matchedPrefixes = plan.routing.destinationCidrs.filter(
          (prefix) => values.filter((row) => row.network === prefix && row.nextHop === nic.privateIp).length === 1,
        );
        return { role, routeCount: values.length, matchedPrefixes };
      });
      require(
        plan.routing.destinationCidrs.length > 0 &&
          observations.every((row) => row.matchedPrefixes.length === plan.routing.destinationCidrs.length),
      );
      peers.push({ node: name, peerIp: nic.privateIp, mac: nic.mac, roles: observations });
    }
    routeExchange = {
      status: 'healthy',
      scope: 'retained-route-server-control-plane',
      routeServerId: serverId,
      ownerPlanSha256: ownerPlan,
      serviceAddresses,
      peers,
    };
  } catch {
    seal();
  }
  if (routeExchange.status === 'healthy') {
    const wanted = binding.nodes.flatMap((node) => {
      const matches = interfaces.filter((row) => row.node === node && row.role === 'slo');
      require(matches.length === 1);
      return serviceAddresses.map((peerAddress) => ({ node, interfaceName: matches[0].interfaceName, peerAddress }));
    });
    try {
      const reader = runtime.observeBgpSessions;
      require(typeof reader === 'function');
      const value = await step(() => reader.call(runtime, structuredClone(binding), structuredClone(wanted), deadline));
      require(
        canonicalEqual(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.expectedSessions === wanted.length &&
          value.sessions.length === wanted.length,
      );
      const observations = wanted.map((target) => {
        const matches = value.sessions.filter(
          (row) =>
            row.node === target.node &&
            row.interfaceName === target.interfaceName &&
            row.peerAddress === target.peerAddress,
        );
        require(matches.length === 1);
        const row = matches[0];
        require(
          [
            'Unknown',
            'Idle',
            'Connect',
            'Active',
            'OpenSent',
            'OpenConfirm',
            'Established',
            'Clearing',
            'Deleted',
          ].includes(row.state) &&
            Number.isSafeInteger(row.receivedPrefixCount) &&
            row.receivedPrefixCount >= 0 &&
            Number.isSafeInteger(row.advertisedPrefixCount) &&
            row.advertisedPrefixCount >= 0 &&
            typeof row.stateChangedAt === 'string' &&
            Number.isFinite(Date.parse(row.stateChangedAt)),
        );
        return {
          ...target,
          state: row.state,
          receivedPrefixCount: row.receivedPrefixCount,
          advertisedPrefixCount: row.advertisedPrefixCount,
          stateChangedAt: row.stateChangedAt,
        };
      });
      const established = observations.filter((row) => row.state === 'Established').length;
      require(
        value.establishedSessions === established &&
          value.status === (established === wanted.length ? 'healthy' : 'degraded'),
      );
      sessions = {
        status: observations.some((row) => row.state === 'Unknown') ? 'unknown' : value.status,
        expectedSessions: wanted.length,
        establishedSessions: established,
        sessions: observations,
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
    try {
      const reader = runtime.observeBgpRoutes;
      require(typeof reader === 'function');
      const value = await step(() => reader.call(runtime, structuredClone(binding), deadline));
      require(
        canonicalEqual(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.status === 'observed' &&
          value.nodes.length === binding.nodes.length &&
          binding.nodes.every((node) => value.nodes.filter((row) => row.node === node).length === 1),
      );
      const inventory = parseBgpRoutes(
        {
          ver: value.nodes.map((node) => ({
            name: node.node,
            ri_table: node.routingInstances.map((instance) => ({
              routing_instance: instance.name,
              rt_table: instance.tables.map((table) => ({
                name: table.name,
                imported: table.imported.map((subnet) => ({ subnet })),
                exported: table.exported.map((subnet) => ({ subnet })),
              })),
            })),
          })),
        },
        binding.nodes,
      );
      require(canonicalEqual(inventory.nodes, value.nodes));
      routes = {
        status: 'observed',
        scope: 'all-node-bgp-route-inventory',
        evidenceSha256: canonicalSha256(value.nodes),
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
  }
  if (routeExchange.status === 'healthy') {
    try {
      require(retainedServer && canonicalEqual(retainedServer, serverIdentity(await read(serverArgs))));
      for (const peer of retainedPeers) require(canonicalEqual(peer.identity, peerIdentity(await read(peer.args))));
    } catch {
      seal();
      routeExchange = unknown('retained-route-server-identity-unavailable-or-changed');
    }
  }
  seal();
  return {
    ...base,
    status:
      routeExchange.status === 'healthy' && sessions.status === 'healthy' && routes.status === 'observed'
        ? ('observed' as const)
        : ('unknown' as const),
    routeExchange,
    sessions,
    routes,
  };
}

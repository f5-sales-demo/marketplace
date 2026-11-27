import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  captureAzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import { prepareAzureTerraformNetworkRouting } from './terraform-network-routing';
import type { AzureCePlan } from './types';

export interface AzureTerraformNetworkRoutingConfigurationRow {
  kind: 'udr-next-hop' | 'route-server-peer';
  resourceId: string;
  parentId: string;
  parentOwnerPlanSha256: string;
  node: number;
  nicIndex: number;
  nic: AzureNetworkUpdateInventory['nodes'][string]['nics'][string];
  name: string;
  previousIp: string;
  currentIp: string;
  installedIp: string;
  state: 'prior' | 'current';
  provisioningState: 'Succeeded';
  prefix?: string;
  nextHopType?: 'VirtualAppliance';
  peerAsn?: number;
}
const same = canonicalEqual;
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform routing configuration: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value as Record<string, unknown>;
}
/** Actual read-only parent and installed route/peer observations. The independent owning source supplies
 * every expected resource, prefix, peer and NIC; returned rows never define expected coverage.
 * Prior/current/mixed configuration installation is separate from BGP exchange, forwarding,
 * CE operational link state, node health and original sample freshness.
 */
export async function collectAzureTerraformNetworkRoutingConfiguration(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  expected: AzureNetworkUpdateInventory,
  node: number,
  appliedNics: string[],
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const snapshot = structuredClone({ plan, before, expected, node, appliedNics });
  const inputSha256 = canonicalSha256(snapshot);
  const prepared = prepareAzureTerraformNetworkRouting(snapshot.plan, source, snapshot.before, node);
  validateAzureNetworkUpdateInventory(snapshot.plan, snapshot.expected);
  verifyAzureNetworkUpdateProgress(snapshot.plan, snapshot.before, snapshot.expected, snapshot.appliedNics);
  for (const [owner, vm] of Object.entries(snapshot.before.nodes))
    for (const [index, nic] of Object.entries(vm.nics))
      require(snapshot.appliedNics.includes(`${owner}:${index}`) ||
        snapshot.expected.nodes[owner].nics[index].privateIp === nic.privateIp, 'unsubmitted private address changed');
  const graph = object(JSON.parse(source)),
    resources = object(graph.resource);
  const execute = api.exec;
  require(typeof execute === 'function', 'Azure executor unavailable');
  const deadline = AbortSignal.any([AbortSignal.timeout(180_000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(api.exec === execute &&
      canonicalSha256(snapshot) === inputSha256 &&
      canonicalSha256({ plan, before, expected, node, appliedNics }) ===
        inputSha256, 'input or Azure executor changed');
  };
  const bounded = async <T>(action: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const transport: AzExecApi = {
    async exec(command, args, options) {
      return await bounded(() => execute.call(api, command, args, options));
    },
  };
  const base = {
    schemaVersion: 1,
    scope: 'azure-dependent-routing-configuration' as const,
    planSha256: snapshot.plan.planSha256,
    node,
    beforeSha256: canonicalSha256(snapshot.before),
    expectedSha256: canonicalSha256(snapshot.expected),
    preparationSha256: canonicalSha256(prepared),
    collectedAt: new Date().toISOString(),
    freshness: 'unqualified' as const,
    forwarding: 'unknown' as const,
    bgpExchange: 'unknown' as const,
    interfaceState: 'unknown' as const,
    nodeHealth: 'unknown' as const,
  };
  let phase = 'initial-cloud-identity';
  try {
    const cloud = async () => {
      const observed = await bounded(() => captureAzureNetworkUpdateInventory(snapshot.plan, transport, deadline));
      require(same(observed.nodes, snapshot.expected.nodes), 'complete current cloud identity differs');
    };
    const read = async (args: string[]) => {
      const response = await transport.exec(
        'az',
        [...args, '--subscription', snapshot.plan.subscription.id, '--output', 'json'],
        { signal: deadline },
      );
      require(response.exitCode === 0, 'configuration observation unavailable');
      const value = object(JSON.parse(response.stdout));
      require(value.error === undefined &&
        value.errors === undefined &&
        (value.nextLink === undefined || value.nextLink === null || value.nextLink === '') &&
        value.provisioningState === 'Succeeded', 'incomplete terminal configuration');
      return value;
    };
    const collect = async (): Promise<AzureTerraformNetworkRoutingConfigurationRow[]> => {
      const parents = new Map<string, string>(),
        rows: AzureTerraformNetworkRoutingConfigurationRow[] = [];
      for (const dependency of prepared.dependencies) {
        const isUdr = dependency.kind === 'udr-next-hop';
        const parentId = dependency.resourceId.slice(
          0,
          dependency.resourceId.lastIndexOf(isUdr ? '/routes/' : '/bgpConnections/'),
        );
        const configuredParent = object(object(resources[isUdr ? 'azurerm_route_table' : 'azurerm_route_server']).ce);
        const tags = object(configuredParent.tags),
          owner = tags['xcsh-plan-sha256'];
        require(typeof owner === 'string' && /^[a-f0-9]{64}$/.test(owner), 'resolved parent owner required');
        if (!isUdr) {
          const actions = snapshot.plan.actions.filter(
            (action) => action.kind === 'route-server-peer-update' && action.node === node,
          );
          require(actions.length === 1 &&
            lower(actions[0].resourceId) === lower(dependency.resourceId) &&
            actions[0].expectedOwnerPlanSha256 === owner, 'independent planned Route Server parent owner differs');
        }
        if (!parents.has(parentId)) {
          const parent = await read(['network', isUdr ? 'route-table' : 'routeserver', 'show', '--ids', parentId]);
          const actualTags = object(parent.tags);
          require(lower(parent.id) === lower(parentId) &&
            parent.name === configuredParent.name &&
            lower(parent.location) === lower(snapshot.plan.region) &&
            actualTags['xcsh-managed-by'] === 'azure-ce' &&
            actualTags['xcsh-execution-engine'] === 'terraform' &&
            actualTags['xcsh-deployment-id'] === snapshot.plan.deploymentName &&
            actualTags['xcsh-plan-sha256'] === owner, 'current routing parent identity/owner differs');
          parents.set(parentId, owner);
        }
        const row = await read([
          'network',
          isUdr ? 'route-table' : 'routeserver',
          isUdr ? 'route' : 'peering',
          'show',
          '--ids',
          dependency.resourceId,
        ]);
        const configured = object(
          object(resources[dependency.address.split('.')[0]])[dependency.address.split('.')[1]],
        );
        const installedIp = row[isUdr ? 'nextHopIpAddress' : 'peerIp'];
        const nic = snapshot.expected.nodes[String(node)].nics[String(dependency.nicIndex)];
        require(lower(row.id) === lower(dependency.resourceId) &&
          row.name === configured.name &&
          typeof installedIp === 'string' &&
          isIP(installedIp) === 4 &&
          (installedIp === dependency.previousIp ||
            installedIp === nic.privateIp), 'route/peer identity or installed address differs');
        if (isUdr)
          require(row.addressPrefix === configured.address_prefix &&
            row.nextHopType === 'VirtualAppliance', 'current route destination/type differs');
        else require(row.peerAsn === configured.peer_asn && Number.isInteger(row.peerAsn), 'current peer ASN differs');
        rows.push({
          kind: dependency.kind,
          resourceId: dependency.resourceId,
          parentId,
          parentOwnerPlanSha256: parents.get(parentId) as string,
          node,
          nicIndex: dependency.nicIndex,
          nic: structuredClone(nic),
          name: row.name as string,
          previousIp: dependency.previousIp,
          currentIp: nic.privateIp,
          installedIp,
          state: installedIp === nic.privateIp ? 'current' : 'prior',
          provisioningState: 'Succeeded',
          ...(isUdr
            ? { prefix: row.addressPrefix as string, nextHopType: 'VirtualAppliance' as const }
            : { peerAsn: row.peerAsn as number }),
        });
      }
      return rows;
    };
    await cloud();
    phase = 'routing-configuration';
    const first = await collect(),
      second = await collect();
    require(same(first, second), 'routing parent or configuration changed');
    phase = 'final-cloud-identity';
    await cloud();
    seal();
    if (!prepared.dependencies.length)
      return {
        ...base,
        status: 'not-required' as const,
        configurationState: 'not-required' as const,
        rows: second,
        reason: 'no-selected-dependent-routing',
      };
    const states = new Set(second.map((row) => row.state));
    const configurationState = states.size === 1 ? second[0].state : ('mixed' as const);
    return {
      ...base,
      status: 'observed' as const,
      configurationState,
      rows: second,
      reason: 'configuration-installation-only',
    };
  } catch {
    deadline.throwIfAborted();
    return {
      ...base,
      status: 'unknown' as const,
      configurationState: 'unknown' as const,
      rows: [] as AzureTerraformNetworkRoutingConfigurationRow[],
      reason: `${phase}-unverified`,
    };
  }
}

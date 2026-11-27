import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { observeAzureRelayIdentity } from './relay-identity';
import { type AzureRelayPlan, verifyAzureRelayPlan } from './relay-plan';
import { azureRelayResourceSource } from './relay-replacement-plan';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay Route Server: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed observation');
  const result = value as Json;
  require(!['nextLink', 'nextPageToken', 'error', 'errors', 'NextToken'].some(
    (key) => result[key],
  ), 'partial or failed observation');
  return result;
};
const same = (value: unknown, expected: string) =>
  typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
const ipv4 = (address: string) => address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);

/** Current cloud identity joins only. Connected provisioning metadata does not establish BGP session or traffic health. */
export async function observeAzureRelayRouteServerIdentity(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureRelayPlan(source, plan);
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const relays = await observeAzureRelayIdentity(source, plan, api, deadline);
  const reads: Array<{ args: string[]; responseSha256: string; observedAt: string }> = [];
  const read = async (args: string[]) => {
    deadline.throwIfAborted();
    const fullArgs = [...args, '--subscription', source.subscription.id, '--output', 'json'];
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let raw: Awaited<ReturnType<AzExecApi['exec']>>;
    try {
      raw = await Promise.race([api.exec('az', fullArgs, { signal: deadline }), abort.promise]);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    deadline.throwIfAborted();
    require(raw.exitCode === 0, 'cloud read unavailable');
    let response: unknown;
    try {
      response = JSON.parse(raw.stdout);
    } catch {
      throw Error('Azure relay Route Server: malformed JSON');
    }
    const result = object(response);
    reads.push({ args: fullArgs, responseSha256: canonicalSha256(result), observedAt: new Date().toISOString() });
    return result;
  };
  const ownerSource = azureRelayResourceSource(source);
  const serverAction = ownerSource.actions.find((action) => action.kind === 'route-server-create');
  require(serverAction?.args, 'saved Route Server creation action required');
  const args = serverAction?.args as string[];
  const hostedSubnetId = args[args.indexOf('--hosted-subnet') + 1];
  require(typeof hostedSubnetId === 'string' &&
    hostedSubnetId === `${plan.vnetId}/subnets/RouteServerSubnet`, 'saved hosted subnet identity differs');
  const subnetActions = ownerSource.actions.filter(
    (action) => action.resourceId === hostedSubnetId && action.kind === 'subnet-create',
  );
  require(subnetActions.length === 1 &&
    subnetActions[0].args?.includes('--address-prefixes'), 'saved hosted subnet CIDR required');
  const subnetArgs = subnetActions[0].args as string[];
  const cidr = subnetArgs[subnetArgs.indexOf('--address-prefixes') + 1];
  const [network, prefix] = cidr.split('/');
  require(isIP(network) === 4 && prefix === '26' && ipv4(network) % 64 === 0, 'canonical hosted /26 required');
  const usable = (address: unknown) =>
    typeof address === 'string' &&
    isIP(address) === 4 &&
    ipv4(address) > ipv4(network) + 3 &&
    ipv4(address) < ipv4(network) + 63;
  const common = ['--resource-group', source.intent.resourceGroup, '--name', `${source.deploymentName}-rs`];
  const server = await read(['network', 'routeserver', 'show', ...common]);
  const tags = object(server.tags);
  require(same(server.id, plan.routeServerId) &&
    same(server.location, plan.region) &&
    server.provisioningState === 'Succeeded' &&
    server.virtualRouterAsn === 65515, 'hub identity differs');
  for (const [key, expected] of Object.entries({
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': ownerSource.planSha256,
  }))
    require(tags[key] === expected, 'hub ownership differs');
  const addresses = server.virtualRouterIps;
  require(Array.isArray(addresses) &&
    addresses.length === 2 &&
    new Set(addresses).size === 2 &&
    addresses.every(usable), 'two distinct hosted service addresses required');
  const expectedPeers = plan.relays.map((relay) => `${plan.routeServerId}/bgpConnections/${relay.name}`);
  const references = server.bgpConnections;
  require(Array.isArray(references) &&
    references.length === 2 &&
    expectedPeers.every(
      (expected) => references.filter((reference) => same(object(reference).id, expected)).length === 1,
    ), 'hub peer references incomplete or foreign');
  const configReferences = server.ipConfigurations;
  require(Array.isArray(configReferences) &&
    configReferences.length > 0 &&
    configReferences.length <= 2, 'hub IP configuration references missing');
  const referenceIds = (configReferences as unknown[]).map((reference) => object(reference).id);
  require(referenceIds.every(
    (id) =>
      typeof id === 'string' && id.toLowerCase().startsWith(`${plan.routeServerId}/ipConfigurations/`.toLowerCase()),
  ) &&
    new Set(referenceIds.map((id) => (id as string).toLowerCase())).size ===
      referenceIds.length, 'hub IP configuration references duplicated or foreign');
  // Hub IP configuration is a public ARM child resource; Azure CLI has no routeserver ip-config subgroup.
  const configurations = await read([
    'rest',
    '--method',
    'get',
    '--url',
    `https://management.azure.com${plan.routeServerId}/ipConfigurations?api-version=2024-05-01`,
  ]);
  require(Array.isArray(configurations.value) &&
    configurations.value.length === referenceIds.length, 'hub IP configuration list incomplete');
  const values = (configurations.value as unknown[]).map(object);
  require(referenceIds.every(
    (id) => values.filter((value) => same(value.id, id as string)).length === 1,
  ), 'hub IP configuration identities differ');
  for (const value of values) {
    const properties = object(value.properties);
    require(properties.provisioningState === 'Succeeded' &&
      same(object(properties.subnet).id, hostedSubnetId) &&
      usable(properties.privateIPAddress) &&
      (addresses as string[]).includes(properties.privateIPAddress as string), 'hosted IP configuration differs');
  }
  const subnet = await read(['network', 'vnet', 'subnet', 'show', '--ids', hostedSubnetId]);
  require(same(subnet.id, hostedSubnetId) &&
    subnet.provisioningState === 'Succeeded' &&
    subnet.addressPrefix === cidr &&
    !subnet.networkSecurityGroup &&
    !subnet.routeTable, 'hosted subnet differs or is constrained');
  const peers = [];
  for (const relay of plan.relays) {
    const peer = await read([
      'network',
      'routeserver',
      'peering',
      'show',
      '--resource-group',
      source.intent.resourceGroup,
      '--routeserver',
      `${source.deploymentName}-rs`,
      '--name',
      relay.name,
    ]);
    const expectedId = `${plan.routeServerId}/bgpConnections/${relay.name}`;
    require(same(peer.id, expectedId) &&
      peer.name === relay.name &&
      peer.provisioningState === 'Succeeded' &&
      peer.peerAsn === relay.asn &&
      peer.peerIp === relay.privateAddress, 'relay peer identity differs');
    peers.push({ id: expectedId, name: relay.name, peerAsn: relay.asn, peerIp: relay.privateAddress });
  }
  deadline.throwIfAborted();
  return {
    status: 'observed' as const,
    source: 'azure-cli-current-identity' as const,
    sourcePlanSha256: source.planSha256,
    planSha256: plan.planSha256,
    routeServerId: plan.routeServerId,
    hostedSubnetId,
    serviceAddresses: (addresses as string[]).toSorted(),
    relays: relays.relays,
    peers,
    reads,
    observedAt: new Date().toISOString(),
    sessions: 'unknown' as const,
    software: 'unknown' as const,
    traffic: 'unknown' as const,
    ceSampleFreshnessQualified: false as const,
  };
}

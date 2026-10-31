import { parseBgpSessions } from '../../../platform/src/ce/bgp-evidence';
import { parseBgpRoutes } from '../../../platform/src/ce/bgp-route-evidence';
import { buildAzureRelayRouting } from '../../../platform/src/ce/wire-routing';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { azureRelayCurrentIdentityContext } from './relay-current-identity';
import { azureRelayPlanForDeployment } from './relay-deployment-plan';
import {
  compileAzureRelayGuestActivation,
  compileAzureRelayGuestObservation,
  parseAzureRelayGuestReceipt,
} from './relay-guest';
import { compileAzureRelayGuestFib, parseAzureRelayGuestFib } from './relay-guest-fib';
import { compileAzureRelayGuestRoute, parseAzureRelayGuestRoute } from './relay-guest-routes';
import { azureRelayResourceSource } from './relay-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
type Identity = Awaited<
  ReturnType<Awaited<ReturnType<typeof azureRelayCurrentIdentityContext>>['observe']>
>['identity'];
export const azureRelayHistoricalArtifacts = new Set([
  'relay-routing-workflow.json',
  'platform-relay-routing.json',
  'relay-routing-configuration.json',
  'relay-routing-observation.json',
]);
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay artifact provenance: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Json;
};
const array = (value: unknown): Json[] => {
  require(Array.isArray(value), 'malformed list');
  return (value as unknown[]).map(object);
};
const keys = (value: Json, expected: string[]) =>
  require(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value);
const timestamp = (value: unknown) =>
  require(typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now(), 'historical collection timestamp differs');
const same = canonicalEqual;
const rawResult = (marker: string, nonce: string, payload: unknown) => ({
  value: [
    {
      code: 'ComponentStatus/StdOut/succeeded',
      level: 'Info',
      message: `${marker}:${nonce}:${JSON.stringify(payload)}`,
    },
    { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
  ],
});
// Timestamp validation here is syntax/provenance only. Historical records never prove current CE freshness.
function withoutCollectionTimes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCollectionTimes);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, row]) => {
        if (key === 'observedAt' || key === 'collectedAt') {
          timestamp(row);
          return [];
        }
        return [[key, withoutCollectionTimes(row)]];
      }),
    );
  return value;
}
const guestPayload = (guest: Json, expected: Json) =>
  Object.fromEntries(
    [...Object.keys(expected), 'status', 'imageId', 'interfaceName', 'containerId'].map((key) => [key, guest[key]]),
  );

/** Atomic offline preflight for owned staging, including partial submission. Fresh external absence is a separate gate. */
export function verifyAzureRelayHistoricalArtifacts(
  source: AzureCePlan,
  siteUid: string,
  records: Map<string, unknown>,
  outage?: { nodeIndex: number },
) {
  if (outage) {
    require(Object.keys(outage).join(',') === 'nodeIndex' &&
      source.topology.ha &&
      source.topology.nodeCount === 3 &&
      source.nics.length === 2 &&
      Number.isInteger(outage.nodeIndex) &&
      outage.nodeIndex >= 1 &&
      outage.nodeIndex <= 3 &&
      records.has('relay-routing-observation.json'), 'outage requires exact selected HA node and complete observation');
    outage = structuredClone(outage);
  }
  if (!records.size) return;
  require(['native', 'terraform'].includes(source.engine) &&
    source.relayProfile &&
    text(siteUid), 'owning relay plan or site missing');
  verifyAzureCePlan(source);
  const plan = azureRelayPlanForDeployment(source),
    resourceSource = azureRelayResourceSource(source),
    binding = azureUpgradeBinding(source);
  const journal = object(records.get('relay-routing-workflow.json'));
  keys(journal, [
    'schemaVersion',
    'engine',
    'sourcePlanSha256',
    'relayPlanSha256',
    'siteUid',
    'bindingSha256',
    'identity',
    'relays',
  ]);
  require(journal.schemaVersion === 2 &&
    journal.engine === source.engine &&
    journal.sourcePlanSha256 === source.planSha256 &&
    journal.relayPlanSha256 === plan.planSha256 &&
    journal.siteUid === siteUid &&
    sha(journal.bindingSha256), 'workflow owner, engine or site differs');
  const identity = object(journal.identity);
  keys(identity, ['stable', 'server', 'slo', 'endpoints']);
  const stable = object(identity.stable),
    server = object(identity.server);
  keys(server, [
    'status',
    'source',
    'sourcePlanSha256',
    'planSha256',
    'routeServerId',
    'hostedSubnetId',
    'serviceAddresses',
    'relays',
    'peers',
    'reads',
    'observedAt',
    'sessions',
    'software',
    'traffic',
    'ceSampleFreshnessQualified',
  ]);
  require(server.source === 'azure-cli-current-identity', 'historical identity source differs');
  const common = ['--resource-group', source.intent.resourceGroup, '--name', `${source.deploymentName}-rs`];
  const identityQueries = [
    ['network', 'routeserver', 'show', ...common],
    [
      'rest',
      '--method',
      'get',
      '--url',
      `https://management.azure.com${plan.routeServerId}/ipConfigurations?api-version=2024-05-01`,
    ],
    ['network', 'vnet', 'subnet', 'show', '--ids', `${plan.vnetId}/subnets/RouteServerSubnet`],
    ...plan.relays.map((relay) => [
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
    ]),
  ].map((args) => [...args, '--subscription', source.subscription.id, '--output', 'json']);
  for (const [index, read] of array(server.reads).entries()) {
    keys(read, ['args', 'responseSha256', 'observedAt']);
    require(Array.isArray(read.args) &&
      read.args.every((arg) => typeof arg === 'string') &&
      same(read.args, identityQueries[index]) &&
      sha(read.responseSha256), 'historical identity read differs');
    timestamp(read.observedAt);
  }
  require(array(server.reads).length === 5, 'historical identity reads incomplete');
  keys(stable, ['siteUid', 'cloud', 'relays', 'serviceAddresses', 'peers']);
  require(stable.siteUid === siteUid &&
    canonicalSha256(stable) === journal.bindingSha256 &&
    same(stable.relays, server.relays) &&
    same(stable.serviceAddresses, server.serviceAddresses) &&
    same(stable.peers, server.peers), 'historical identity digest differs');
  require(server.status === 'observed' &&
    server.sourcePlanSha256 === source.planSha256 &&
    server.planSha256 === plan.planSha256 &&
    server.routeServerId === plan.routeServerId &&
    server.hostedSubnetId === `${plan.vnetId}/subnets/RouteServerSubnet` &&
    server.ceSampleFreshnessQualified === false &&
    server.sessions === 'unknown' &&
    server.software === 'unknown' &&
    server.traffic === 'unknown', 'historical Route Server binding differs');
  timestamp(server.observedAt);
  require(Array.isArray(server.relays) &&
    server.relays.length === plan.relays.length &&
    Array.isArray(server.peers) &&
    server.peers.length === plan.relays.length, 'complete historical relay identities required');
  const macs = new Set<string>();
  const validMac = (value: unknown) => {
    require(typeof value === 'string' &&
      /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(value) &&
      !(Number.parseInt(value.slice(0, 2), 16) & 1) &&
      value !== '00:00:00:00:00:00' &&
      !macs.has(value), 'distinct unicast MAC required');
    macs.add(value as string);
  };
  for (const [index, relay] of plan.relays.entries()) {
    const row = array(server.relays)[index],
      peer = array(server.peers)[index];
    keys(row, ['name', 'vmId', 'nicId', 'osDiskId', 'ipConfigurationId', 'subnetId', 'mac', 'address', 'asn']);
    keys(peer, ['id', 'name', 'peerAsn', 'peerIp']);
    require(row.osDiskId === relay.osDiskId &&
      row.name === relay.name &&
      row.vmId === relay.vmId &&
      row.nicId === relay.nicId &&
      row.address === relay.privateAddress &&
      row.asn === relay.asn &&
      row.subnetId === plan.sloSubnetId &&
      row.ipConfigurationId === relay.ipConfigurationId &&
      peer.id === `${plan.routeServerId}/bgpConnections/${relay.name}` &&
      peer.name === relay.name &&
      peer.peerAsn === relay.asn &&
      peer.peerIp === relay.privateAddress, 'foreign or reordered relay graph');
    validMac(row.mac);
  }
  require(Array.isArray(stable.cloud) &&
    stable.cloud.length === binding.nodes.length * source.nics.length &&
    Array.isArray(identity.slo) &&
    identity.slo.length === binding.nodes.length &&
    Array.isArray(identity.endpoints) &&
    identity.endpoints.length === binding.nodes.length, 'partial CE identity snapshot');
  const uuids = new Set<string>(),
    interfaces = new Set<string>();
  for (let node = 1; node <= source.topology.nodeCount; node++) {
    const nodeName = `${source.deploymentName}-${node}`;
    const vm = resourceSource.actions.find((row) => row.kind === 'vm-create' && row.node === node);
    const rows = array(stable.cloud).filter((row) => row.node === nodeName);
    require(rows.length === source.nics.length, 'partial or foreign CE node');
    const uuid = rows[0].vmUuid;
    require(typeof uuid === 'string' &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid) &&
      !uuids.has(uuid.toLowerCase()), 'distinct CE VM UUID required');
    uuids.add((uuid as string).toLowerCase());
    for (const nic of source.nics) {
      const selected = rows.filter((row) => row.role === nic.role);
      require(selected.length === 1, 'duplicate CE role');
      const row = selected[0],
        action = resourceSource.actions.find(
          (item) => item.kind === 'nic-create' && item.node === node && item.resourceId?.endsWith(`-nic${nic.index}`),
        );
      keys(row, [
        'node',
        'role',
        'vmId',
        'vmUuid',
        'nicId',
        'ipConfigurationId',
        'mac',
        'subnetId',
        'device',
        'interfaceName',
        'ipv4',
      ]);
      require(vm?.resourceId &&
        row.vmId === vm.resourceId &&
        row.vmUuid === uuid &&
        action?.resourceId &&
        row.nicId === action.resourceId &&
        typeof row.ipConfigurationId === 'string' &&
        row.ipConfigurationId.startsWith(`${action.resourceId}/ipConfigurations/`) &&
        row.subnetId === `${plan.vnetId}/subnets/${nic.subnet.name}` &&
        text(row.device) &&
        text(row.interfaceName) &&
        !interfaces.has(row.interfaceName as string), 'CE VM/NIC/device/interface join differs');
      interfaces.add(row.interfaceName as string);
      validMac(row.mac);
      if (nic.role === 'slo') {
        const slo = array(identity.slo).filter((item) => item.node === nodeName);
        const endpoints = array(identity.endpoints).filter((item) => item.node === node);
        if (endpoints.length === 1) keys(endpoints[0], ['node', 'address']);
        require(slo.length === 1 &&
          endpoints.length === 1 &&
          slo[0].role === 'slo' &&
          slo[0].mac === row.mac &&
          slo[0].device === row.device &&
          slo[0].interfaceName === row.interfaceName &&
          slo[0].linkUp === true &&
          same(slo[0].ipv4, row.ipv4) &&
          endpoints[0].address === object(row.ipv4).address &&
          object(row.ipv4).prefixLength === Number(plan.sloCidr.split('/')[1]), 'SLO endpoint binding differs');
      }
    }
  }
  const historical = identity as unknown as Identity;
  // Recompile exact requests from the saved plan and historical joins, even for a submission with no response.
  const activation = (relayName: string, nonce: string) =>
    compileAzureRelayGuestActivation(source, plan, relayName, historical.server, historical.endpoints, nonce);
  for (const relay of plan.relays) activation(relay.name, '0'.repeat(32));
  const entries = object(journal.relays),
    names = Object.keys(entries),
    nonces = new Set<string>();
  require(names.every((name, index) => name === plan.relays[index]?.name), 'submission prefix order differs');
  const receipts: unknown[] = [];
  for (const name of names) {
    const entry = object(entries[name]);
    keys(entry, ['nonce', 'requestSha256', 'submitted', ...('receipt' in entry ? ['receipt'] : [])]);
    require(entry.submitted === true &&
      typeof entry.nonce === 'string' &&
      /^[a-f0-9]{32}$/.test(entry.nonce) &&
      !nonces.has(entry.nonce), 'submission or distinct nonce differs');
    nonces.add(entry.nonce as string);
    const request = activation(name, entry.nonce as string);
    require(entry.requestSha256 === request.requestSha256, 'compiled submission digest differs');
    if ('receipt' in entry) {
      const receipt = object(entry.receipt),
        probe = compileAzureRelayGuestObservation(request);
      require([request.requestSha256, probe.requestSha256].includes(
        String(receipt.requestSha256),
      ), 'guest receipt request differs');
      const selected = receipt.requestSha256 === request.requestSha256 ? request : probe;
      const parsed = parseAzureRelayGuestReceipt(
        selected,
        rawResult('XCSH_RELAY_RECEIPT', selected.expected.nonce, guestPayload(receipt, selected.expected)),
      );
      require(same(
        withoutCollectionTimes(receipt),
        withoutCollectionTimes(parsed),
      ), 'guest receipt provenance differs');
      receipts.push(receipt);
    }
  }
  const slo = historical.slo.map((row) => ({ node: row.node, role: 'slo' as const, interfaceName: row.interfaceName }));
  const relays = plan.relays.map((relay) => ({ name: relay.name, address: relay.privateAddress, asn: relay.asn }));
  const routing = buildAzureRelayRouting(source.siteName, plan.localAsn, slo, relays, () => {});
  const platform = records.get('platform-relay-routing.json');
  if (platform !== undefined) {
    const value = object(platform);
    keys(value, [
      'kind',
      'name',
      'uid',
      'siteName',
      'siteUid',
      'owner',
      'localAsn',
      'interfaces',
      'relays',
      'expectedSessions',
      'expectedPeers',
      'contractFingerprint',
    ]);
    require(value.kind === 'bgp' &&
      value.name === routing.bgp.name &&
      text(value.uid) &&
      value.siteName === source.siteName &&
      value.siteUid === siteUid &&
      same(value.owner, binding.owner) &&
      value.localAsn === plan.localAsn &&
      same(value.interfaces, slo) &&
      same(value.relays, relays) &&
      value.expectedSessions === routing.expectedSessions &&
      same(value.expectedPeers, routing.expectedPeers) &&
      text(value.contractFingerprint), 'platform BGP owner or binding differs');
  }
  require(names.length === 0 || platform !== undefined, 'submitted guests require platform routing provenance');
  const configuration = records.get('relay-routing-configuration.json');
  if (configuration !== undefined) {
    const value = object(configuration);
    keys(value, [
      'status',
      'sourcePlanSha256',
      'relayPlanSha256',
      'siteUid',
      'bindingSha256',
      'guestReceipts',
      'observedAt',
      'routing',
      'traffic',
      'ceSampleFreshnessQualified',
    ]);
    require(value.status === 'configured' &&
      value.sourcePlanSha256 === source.planSha256 &&
      value.relayPlanSha256 === plan.planSha256 &&
      value.siteUid === siteUid &&
      value.bindingSha256 === journal.bindingSha256 &&
      receipts.length === plan.relays.length &&
      same(value.guestReceipts, receipts) &&
      value.routing === 'unknown' &&
      value.traffic === 'unknown' &&
      value.ceSampleFreshnessQualified === false, 'configuration completeness or binding differs');
    timestamp(value.observedAt);
  }
  const observedNodes = binding.nodes.filter((_node, index) => index + 1 !== outage?.nodeIndex);
  const observation = records.get('relay-routing-observation.json');
  if (observation !== undefined) {
    require(configuration !== undefined, 'observation requires completed configuration');
    const value = object(observation);
    keys(value, [
      ...(outage ? ['outage'] : []),
      'status',
      'sourcePlanSha256',
      'relayPlanSha256',
      'siteUid',
      'bindingSha256',
      'sessions',
      'finalSessions',
      'ceRoutes',
      'guestRoutes',
      'guestFib',
      'cloudRoutes',
      'collectedAt',
      'ceRouteScope',
      'routing',
      'fib',
      'traffic',
      'freshness',
      'ceSampleFreshnessQualified',
    ]);
    require(value.status === 'observed' &&
      value.sourcePlanSha256 === source.planSha256 &&
      value.relayPlanSha256 === plan.planSha256 &&
      value.siteUid === siteUid &&
      value.bindingSha256 === journal.bindingSha256 &&
      value.ceRouteScope === 'unqualified' &&
      value.routing === 'unknown' &&
      value.fib === 'unknown' &&
      value.traffic === 'unknown' &&
      value.freshness === 'unqualified' &&
      value.ceSampleFreshnessQualified === false, 'observation identity or unsupported acceptance claim differs');
    if (outage) {
      const selected = object(value.outage);
      keys(selected, [
        'nodeIndex',
        'powerState',
        'currentInterfaces',
        'retainedInterfaceIdentity',
        'ceSampleFreshnessQualified',
      ]);
      require(selected.nodeIndex === outage.nodeIndex &&
        selected.powerState === 'deallocated' &&
        selected.currentInterfaces === 4 &&
        selected.retainedInterfaceIdentity === 'historical' &&
        selected.ceSampleFreshnessQualified === false, 'historical stopped-node scope differs');
    }
    timestamp(value.collectedAt);
    for (const key of ['sessions', 'finalSessions', 'ceRoutes']) {
      const row = object(value[key]);
      require(same(row.owner, binding.owner) &&
        row.siteName === source.siteName &&
        row.status === (key === 'ceRoutes' ? 'observed' : 'healthy'), 'CE routing observation owner differs');
      timestamp(row.observedAt);
      require(Array.isArray(row[key === 'ceRoutes' ? 'nodes' : 'sessions']), 'malformed CE routing observation');
      require(row.contractFingerprint === object(platform).contractFingerprint &&
        typeof row.source === 'string' &&
        row.source.length > 0, 'CE routing contract provenance differs');
      if (key === 'ceRoutes') {
        const nodes = array(row.nodes);
        const wire = {
          ver: nodes.map((node) => ({
            name: node.node,
            ri_table: array(node.routingInstances).map((instance) => ({
              routing_instance: instance.name,
              rt_table: array(instance.tables).map((table) => ({
                name: table.name,
                imported: (table.imported as unknown[]).map((subnet) => ({ subnet })),
                exported: (table.exported as unknown[]).map((subnet) => ({ subnet })),
              })),
            })),
          })),
        };
        require(same(parseBgpRoutes(wire, observedNodes).nodes, nodes), 'CE route inventory provenance differs');
        if (row.pathInventory !== undefined) {
          const paths = object(row.pathInventory);
          require(['observed', 'unknown'].includes(String(paths.status)) &&
            paths.scope === 'unqualified' &&
            paths.freshness === 'unqualified' &&
            paths.traffic === 'unknown', 'CE path qualifier differs');
          if (paths.status === 'observed')
            require(array(paths.nodes).length === observedNodes.length &&
              array(paths.nodes).every(
                (node, index) => node.node === observedNodes[index],
              ), 'CE path node provenance differs');
          else require(typeof paths.reason === 'string' && paths.reason.length > 0, 'CE unknown path reason missing');
        }
      } else {
        const sessions = array(row.sessions),
          expected = routing.expectedPeers
            .filter((peer) => observedNodes.includes(peer.node))
            .map(({ node, interfaceName, peerAddress }) => ({
              node,
              interfaceName,
              peerAddress,
            }));
        const wire = {
          ver: observedNodes.map((node) => ({
            name: node,
            peer: sessions
              .filter((session) => session.node === node)
              .map((session) => ({
                interface_name: session.interfaceName,
                peer_address: { ipv4: { addr: session.peerAddress } },
                protocol_status: session.state,
                received_prefix_count: session.receivedPrefixCount,
                advertised_prefix_count: session.advertisedPrefixCount,
                up_down_timestamp: session.stateChangedAt,
              })),
          })),
        };
        const parsed = parseBgpSessions(wire, expected);
        require(same(parsed.sessions, sessions) &&
          row.expectedSessions === parsed.expectedSessions &&
          row.establishedSessions === parsed.establishedSessions, 'CE session inventory provenance differs');
      }
    }
    require(Array.isArray(value.guestRoutes) && Array.isArray(value.guestFib), 'missing guest route observations');
    let routeIndex = 0,
      fibIndex = 0;
    const probeNonces = new Set<string>();
    for (const relay of plan.relays) {
      const tasks = [
        ...plan.vipPrefixes.map((prefix) => ({
          direction: 'received' as const,
          prefix,
          peer: undefined as string | undefined,
        })),
        ...plan.returnPrefixes.map((prefix) => ({
          direction: 'received' as const,
          prefix,
          peer: undefined as string | undefined,
        })),
        ...plan.vipPrefixes.flatMap((prefix) =>
          historical.server.serviceAddresses.map((peer) => ({ direction: 'advertised' as const, prefix, peer })),
        ),
        ...plan.returnPrefixes.flatMap((prefix) =>
          historical.endpoints
            .filter((row) => row.node !== outage?.nodeIndex)
            .map(({ address: peer }) => ({ direction: 'advertised' as const, prefix, peer })),
        ),
      ];
      for (const task of tasks) {
        const row = array(value.guestRoutes)[routeIndex++],
          session = object(row.session),
          guest = object(session.guest);
        const nonce = guest.nonce;
        require(typeof nonce === 'string' &&
          /^[a-f0-9]{32}$/.test(nonce) &&
          !probeNonces.has(nonce), 'distinct route probe nonce required');
        probeNonces.add(nonce as string);
        const compile = task.direction === 'received' ? compileAzureRelayGuestFib : compileAzureRelayGuestRoute;
        const request = compile(
          source,
          plan,
          relay.name,
          historical.server,
          historical.endpoints,
          nonce as string,
          task.direction,
          task.prefix,
          task.peer,
          outage,
        );
        const routeRequest = 'routeRequest' in request ? request.routeRequest : request;
        const payload = {
          session: { guest: guestPayload(guest, routeRequest.sessionRequest.expected), sessions: session.sessions },
          route: row.route,
        };
        const parsed = parseAzureRelayGuestRoute(routeRequest, rawResult('XCSH_RELAY_ROUTE', nonce as string, payload));
        require(same(withoutCollectionTimes(row), withoutCollectionTimes(parsed)), 'guest route provenance differs');
        const configured = object(object(entries[relay.name]).receipt);
        require(['containerId', 'imageId', 'interfaceName'].every(
          (key) => guest[key] === configured[key],
        ), 'guest changed since configuration');
        if ('routeRequest' in request) {
          const fib = array(value.guestFib)[fibIndex++];
          const parsedFib = parseAzureRelayGuestFib(
            request,
            rawResult('XCSH_RELAY_FIB', nonce as string, { membership: payload, fib: fib.fib }),
          );
          require(same(withoutCollectionTimes(fib), withoutCollectionTimes(parsedFib)) &&
            same(fib.membership, row), 'guest FIB provenance differs');
        }
      }
    }
    require(routeIndex === array(value.guestRoutes).length &&
      fibIndex === array(value.guestFib).length, 'duplicate or surplus route observations');
    const cloud = object(value.cloudRoutes);
    keys(cloud, [
      'status',
      'source',
      'sourcePlanSha256',
      'relayPlanSha256',
      'routeServerId',
      'identitySha256',
      'peers',
      'reads',
      'collectedAt',
      'sessions',
      'traffic',
      'freshness',
      'ceSampleFreshnessQualified',
    ]);
    require(cloud.source === 'azure-cli-current-route-exchange' &&
      cloud.sessions === 'unknown' &&
      cloud.identitySha256 ===
        canonicalSha256({
          sourcePlanSha256: server.sourcePlanSha256,
          planSha256: server.planSha256,
          routeServerId: server.routeServerId,
          hostedSubnetId: server.hostedSubnetId,
          serviceAddresses: server.serviceAddresses,
          relays: server.relays,
          peers: server.peers,
        }), 'cloud exchange identity digest differs');
    const reads: string[][] = [];
    for (const [index, relay] of plan.relays.entries()) {
      const peer = array(cloud.peers)[index];
      keys(peer, ['relayName', 'peerId', 'learned', 'advertised']);
      require(peer.relayName === relay.name &&
        peer.peerId === `${plan.routeServerId}/bgpConnections/${relay.name}`, 'cloud exchange peer differs');
      for (const direction of ['learned', 'advertised'] as const) {
        reads.push([
          'network',
          'routeserver',
          'peering',
          `list-${direction}-routes`,
          '--resource-group',
          source.intent.resourceGroup,
          '--routeserver',
          `${source.deploymentName}-rs`,
          '--name',
          relay.name,
          '--subscription',
          source.subscription.id,
          '--output',
          'json',
        ]);
        const roles = array(peer[direction]);
        require(roles.length === 2, 'complete cloud service roles required');
        for (const [roleIndex, role] of roles.entries()) {
          keys(role, ['role', 'routeCount', 'matches']);
          require(role.role === `RouteServiceRole_IN_${roleIndex}` &&
            Number.isSafeInteger(role.routeCount) &&
            Number(role.routeCount) >= 0, 'cloud role or route count differs');
          const prefixes = direction === 'learned' ? plan.vipPrefixes : plan.returnPrefixes;
          const matches = array(role.matches);
          require(matches.length === prefixes.length, 'partial cloud prefix scope');
          let pathsCount = 0;
          for (const [prefixIndex, match] of matches.entries()) {
            keys(match, ['prefix', 'paths']);
            require(match.prefix === prefixes[prefixIndex], 'foreign cloud prefix');
            const paths = array(match.paths),
              seen = new Set<string>();
            require(paths.length > 0, 'missing cloud paths');
            pathsCount += paths.length;
            for (const path of paths) {
              keys(path, ['localAddress', 'nextHop', 'sourcePeer', 'asPath']);
              require(historical.server.serviceAddresses.includes(String(path.localAddress)) &&
                !seen.has(canonicalSha256(path)), 'foreign or duplicate cloud path');
              seen.add(canonicalSha256(path));
              if (direction === 'learned')
                require(path.nextHop === relay.privateAddress &&
                  path.sourcePeer === relay.privateAddress &&
                  typeof path.asPath === 'string' &&
                  new RegExp(`^${relay.asn}(?:-${relay.asn})*-${plan.localAsn}(?:-${plan.localAsn})*$`).test(
                    path.asPath,
                  ), 'cloud VIP path binding differs');
              else
                require(path.nextHop === path.localAddress &&
                  path.sourcePeer === path.localAddress &&
                  path.asPath === '65515', 'cloud return path differs');
            }
          }
          require(Number(role.routeCount) >= pathsCount, 'cloud route count contradicts paths');
        }
      }
    }
    require(same(cloud.reads, reads), 'cloud exchange read scope differs');
    require(cloud.status === 'observed' &&
      cloud.sourcePlanSha256 === source.planSha256 &&
      cloud.relayPlanSha256 === plan.planSha256 &&
      cloud.routeServerId === plan.routeServerId &&
      sha(cloud.identitySha256) &&
      cloud.traffic === 'unknown' &&
      cloud.freshness === 'unqualified' &&
      cloud.ceSampleFreshnessQualified === false &&
      Array.isArray(cloud.peers) &&
      cloud.peers.length === plan.relays.length &&
      Array.isArray(cloud.reads) &&
      cloud.reads.length > 0, 'cloud exchange provenance differs');
    timestamp(cloud.collectedAt);
  }
}

/** A completed checkpoint alone cannot qualify a successor generation. */
export function requireAzureRelayHistoricalAcceptance(
  source: AzureCePlan,
  siteUid: string,
  records: Map<string, unknown>,
) {
  verifyAzureRelayHistoricalArtifacts(source, siteUid, records);
  const observation = object(records.get('relay-routing-observation.json'));
  require(observation.routing === 'healthy' &&
    observation.ceSampleFreshnessQualified === true &&
    observation.ceRouteScope !== 'unqualified' &&
    observation.freshness !== 'unqualified', 'predecessor operational routing acceptance remains unqualified');
}

export function isAzureRelayReplacementHistoricalArtifact(name: string): boolean {
  const match = /^azure-ce-[a-f0-9]{24}-replacement-(.+)$/.exec(name);
  return Boolean(match && azureRelayHistoricalArtifacts.has(match[1]));
}

/** Resolve every isolated journal through its exact generation and original retained resource graph. */
export function verifyAzureRelayReplacementHistories(
  base: AzureCePlan,
  siteUid: string,
  records: Map<string, unknown>,
  sources: Map<string, AzureCePlan>,
) {
  const generations = new Map<string, Map<string, unknown>>();
  for (const [name, value] of records) {
    if (!isAzureRelayReplacementHistoricalArtifact(name)) continue;
    const match = /^(azure-ce-[a-f0-9]{24})-replacement-(.+)$/.exec(name);
    require(match, 'replacement journal name differs');
    const planId = (match as RegExpExecArray)[1],
      file = (match as RegExpExecArray)[2];
    if (!generations.has(planId)) generations.set(planId, new Map());
    generations.get(planId)?.set(file, value);
  }
  for (const [planId, history] of generations) {
    const matches = [...sources.values()].filter((source) => source.planId === planId);
    require(matches.length === 1, 'replacement journal source is missing or ambiguous');
    const source = matches[0];
    verifyAzureCePlan(source);
    require(source.relayProfile?.schemaVersion === 2 &&
      source.intent.operation === 'replace-node' &&
      source.engine === base.engine &&
      same(azureUpgradeBinding(source), azureUpgradeBinding(base)) &&
      same(
        azureRelayResourceSource(source),
        azureRelayResourceSource(base),
      ), 'replacement journal generation or original resource owner differs');
    verifyAzureRelayHistoricalArtifacts(source, siteUid, history);
  }
}

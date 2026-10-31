import { isIP } from 'node:net';
import { parseBgpSessions } from '../../../platform/src/ce/bgp-evidence';
import { parseBgpRoutePaths, parseBgpRoutes } from '../../../platform/src/ce/bgp-route-evidence';
import { canonicalEqual } from './canonical';
import {
  type AzureCeFailoverPlan,
  buildAzureCeFailoverPlan,
  requireAzureFailoverExecutionContract,
  validateAzureFailoverCheckpoint,
  validateAzureFailoverReceipt,
  verifyAzureCeFailoverPlan,
} from './failover';
import { validateAzureFailoverTrafficHistory } from './failover-traffic';
import { verifyAzureRelayHistoricalArtifacts } from './relay-artifact-provenance';
import { validateAzureTerraformFailoverPlan, validateAzureTerraformFailoverRetirement } from './terraform-failover';
import { azureUpgradeBinding } from './terraform-upgrade';
import { validateAzureTrafficCheckpoint } from './traffic-artifact-provenance';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
type Phase = 'baseline' | 'outage' | 'recovered';
const phases: Phase[] = ['baseline', 'outage', 'recovered'];
const sourcePattern = /^azure-ce-failover-[a-f0-9]{24}\.json$/;
export const isAzureFailoverHistoricalArtifact = (name: string) =>
  /^azure-ce-failover-[a-f0-9]{24}(?:-[a-z0-9-]+)?\.json$/.test(name);
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure failover history: ${message}`);
};
const object = (input: unknown): Json => {
  require(input && typeof input === 'object' && !Array.isArray(input), 'malformed record');
  return input as Json;
};
const keys = (value: Json, required: string[], optional: string[] = []) =>
  require(required.every((key) => key in value) &&
    Object.keys(value).every((key) => [...required, ...optional].includes(key)), 'record fields differ');
const same = canonicalEqual;
const timestamp = (value: unknown): number => {
  require(typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now(), 'historical timestamp differs');
  return Date.parse(value as string);
};
const rows = (value: unknown): Json[] => {
  require(Array.isArray(value), 'complete list required');
  return (value as unknown[]).map(object);
};

function directPhase(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  phase: Phase,
  value: Json,
  siteUid: string,
  records: ReadonlyMap<string, unknown>,
) {
  keys(value, [
    'acceptance',
    'phase',
    'expectedEstablishedSessions',
    'sessions',
    'effectiveRoutes',
    'routeServer',
    'traffic',
    'trafficCheckpointKey',
    'trafficRequestedAt',
    'observedAt',
  ]);
  require(value.acceptance === 'passed', 'direct phase acceptance differs');
  const routing = requireAzureFailoverExecutionContract(base, failover, records.get('platform-routing.json'));
  require(routing.siteUid === siteUid, 'direct routing site differs');
  const binding = azureUpgradeBinding(base),
    selected = binding.nodes[failover.nodeIndex - 1];
  const interfaces = routing.interfaces.filter((row) => phase !== 'outage' || row.node !== selected);
  const nodes = interfaces.map((row) => row.node);
  const expected = interfaces.flatMap((row) =>
    routing.routeServerAddresses.map((peerAddress) => ({ ...row, peerAddress })),
  );
  const sessions = object(value.sessions),
    routes = object(value.effectiveRoutes);
  keys(sessions, [
    'status',
    'expectedSessions',
    'establishedSessions',
    'sessions',
    'owner',
    'siteName',
    'source',
    'observedAt',
    'contractFingerprint',
  ]);
  keys(routes, [
    'status',
    'nodes',
    'pathInventory',
    'owner',
    'siteName',
    'source',
    'observedAt',
    'contractFingerprint',
  ]);
  for (const row of [sessions, routes]) {
    require(same(row.owner, binding.owner) &&
      row.siteName === base.siteName &&
      row.contractFingerprint === routing.contractFingerprint &&
      typeof row.source === 'string' &&
      row.source, 'direct CE owner/site/contract differs');
    require(timestamp(row.observedAt) <= timestamp(value.observedAt), 'CE observation follows phase receipt');
  }
  require(sessions.status === 'healthy' && routes.status === 'observed', 'direct CE observation unavailable');
  const peers = rows(sessions.sessions);
  const parsed = parseBgpSessions(
    {
      ver: nodes.map((node) => ({
        name: node,
        peer: peers
          .filter((row) => row.node === node)
          .map((row) => ({
            interface_name: row.interfaceName,
            peer_address: { ipv4: { addr: row.peerAddress } },
            protocol_status: row.state,
            received_prefix_count: row.receivedPrefixCount,
            advertised_prefix_count: row.advertisedPrefixCount,
            up_down_timestamp: row.stateChangedAt,
          })),
      })),
    },
    expected,
  );
  require(same(parsed.sessions, peers) &&
    parsed.expectedSessions === sessions.expectedSessions &&
    parsed.establishedSessions === sessions.establishedSessions &&
    parsed.establishedSessions === expected.length, 'direct CE session scope differs');
  const routeNodes = rows(routes.nodes);
  const wire = {
    ver: routeNodes.map((node) => ({
      name: node.node,
      ri_table: rows(node.routingInstances).map((instance) => ({
        routing_instance: instance.name,
        rt_table: rows(instance.tables).map((table) => ({
          name: table.name,
          imported: rowsOrStrings(table.imported).map((subnet) => ({ subnet })),
          exported: rowsOrStrings(table.exported).map((subnet) => ({ subnet })),
        })),
      })),
    })),
  };
  require(same(parseBgpRoutes(wire, nodes).nodes, routeNodes), 'direct CE route scope differs');
  const paths = object(routes.pathInventory);
  const qualifiers = ['status', 'scope', 'freshness', 'traffic'];
  require(paths.scope === 'unqualified' &&
    paths.freshness === 'unqualified' &&
    paths.traffic === 'unknown', 'direct CE path qualifiers differ');
  if (paths.status === 'unknown') {
    keys(paths, [...qualifiers, 'reason']);
    require(typeof paths.reason === 'string' && paths.reason.length > 0, 'unknown CE path reason missing');
  } else {
    keys(paths, [...qualifiers, 'nodes']);
    require(paths.status === 'observed', 'CE path status differs');
    const pathNodes = rows(paths.nodes);
    const pathWire = {
      ver: pathNodes.map((node) => ({
        name: node.node,
        ri_table: rows(node.routingInstances).map((instance) => ({
          routing_instance: instance.name,
          rt_table: rows(instance.tables).map((table) => ({
            name: table.name,
            imported: table.imported,
            exported: table.exported,
          })),
        })),
      })),
    };
    require(same(parseBgpRoutes(pathWire, nodes).nodes, routeNodes) &&
      same(parseBgpRoutePaths(pathWire, nodes), paths), 'direct CE path inventory differs');
  }
  const cloud = object(value.routeServer);
  keys(cloud, [
    'status',
    'phase',
    'selectedNode',
    'expectedEstablishedSessions',
    'routeServerId',
    'serviceAddresses',
    'peers',
    'observedAt',
  ]);
  const server = base.actions.filter((row) => row.kind === 'route-server-create');
  require(cloud.status === 'healthy' &&
    cloud.phase === (phase === 'outage' ? 'outage' : 'recovered') &&
    cloud.selectedNode === failover.nodeIndex &&
    cloud.expectedEstablishedSessions === expected.length &&
    server.length === 1 &&
    cloud.routeServerId === server[0].resourceId &&
    same(cloud.serviceAddresses, [...routing.routeServerAddresses].sort()), 'direct cloud topology differs');
  require(timestamp(cloud.observedAt) <= timestamp(value.observedAt), 'cloud observation follows phase receipt');
  const cloudPeers = rows(cloud.peers),
    ips = new Set<string>();
  require(cloudPeers.length === 3, 'complete retained cloud peers required');
  for (const [index, peer] of cloudPeers.entries()) {
    keys(peer, ['node', 'name', 'peerIp', 'peerAsn', 'provisioningState', 'roles']);
    require(peer.node === index + 1 &&
      peer.name === binding.nodes[index] &&
      peer.peerAsn === base.routing.localAsn &&
      peer.provisioningState === 'Succeeded' &&
      typeof peer.peerIp === 'string' &&
      isIP(peer.peerIp) === 4 &&
      !ips.has(peer.peerIp), 'direct cloud peer differs');
    ips.add(peer.peerIp as string);
    const roleRows = rows(peer.roles);
    require(roleRows.length === 2, 'both cloud service roles required');
    for (const [roleIndex, role] of roleRows.entries()) {
      keys(role, ['role', 'learnedRouteCount', 'matchedPrefixes']);
      const expectedPrefixes =
        phase === 'outage' && peer.node === failover.nodeIndex ? [] : base.routing.destinationCidrs;
      require(role.role === `RouteServiceRole_IN_${roleIndex}` &&
        Number.isSafeInteger(role.learnedRouteCount) &&
        Number(role.learnedRouteCount) >= expectedPrefixes.length &&
        same(role.matchedPrefixes, expectedPrefixes), 'direct cloud withdrawal/restoration differs');
    }
  }
}
function rowsOrStrings(value: unknown): unknown[] {
  require(Array.isArray(value), 'route prefix list required');
  return value as unknown[];
}

/** Atomic historical preflight. This never proves present routing, heartbeat, traffic or external cleanup. */
export async function verifyAzureFailoverHistoricalArtifacts(
  base: AzureCePlan,
  siteUid: string,
  records: ReadonlyMap<string, unknown>,
) {
  const names = [...records.keys()].filter(isAzureFailoverHistoricalArtifact);
  const sources = new Map<string, AzureCeFailoverPlan>();
  for (const name of names.filter((name) => sourcePattern.test(name))) {
    const source = records.get(name) as AzureCeFailoverPlan;
    verifyAzureCeFailoverPlan(base, source);
    require(name === `${source.planId}.json`, 'source filename differs');
    sources.set(source.planId, source);
  }
  const consumed = new Set<string>();
  let histories = 0,
    checkpoints = 0;
  for (const failover of sources.values()) {
    const id = failover.planId;
    consumed.add(`${id}.json`);
    const read = (suffix: string) => records.get(`${id}${suffix}.json`);
    const consume = (suffix: string) => {
      if (records.has(`${id}${suffix}.json`)) consumed.add(`${id}${suffix}.json`);
    };
    const prep = read('-preparation-evidence');
    if (prep !== undefined) {
      const value = object(prep);
      keys(value, [
        'schemaVersion',
        'source',
        'subscriptionId',
        'region',
        'engine',
        'deploymentId',
        'sourcePlanSha256',
        'nodeIndex',
        'vmResourceId',
        'vmId',
        'powerState',
        'observedAt',
      ]);
      timestamp(value.observedAt);
      require(same(
        buildAzureCeFailoverPlan(base, prep as Parameters<typeof buildAzureCeFailoverPlan>[1]),
        failover,
      ), 'preparation identity differs');
      consume('-preparation-evidence');
    }
    const auth = read('-authorization');
    if (auth !== undefined) {
      require(same(auth, {
        schemaVersion: 1,
        engine: base.engine,
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        mutations: true,
      }), 'authorization differs');
      consume('-authorization');
    }
    const checkpointValue = read('-checkpoint'),
      receipt = read('-receipt');
    const active =
      checkpointValue === undefined ? undefined : validateAzureFailoverCheckpoint(base, failover, checkpointValue);
    if (active) {
      require(auth, 'checkpoint authorization missing');
      consume('-checkpoint');
    }
    if (receipt !== undefined) {
      require(active && ['release', 'complete'].includes(active.phase), 'receipt precedes durable release');
      validateAzureFailoverReceipt(base, failover, receipt);
      consume('-receipt');
    }
    if (active?.phase === 'complete') require(receipt, 'complete checkpoint receipt missing');
    const catalogs = new Map<Phase, ReturnType<typeof validateAzureFailoverTrafficHistory>>();
    for (const phase of phases) {
      const catalog = read(`-${phase}-traffic-observations`);
      if (catalog === undefined) continue;
      const leaves = new Map<string, unknown>();
      for (const name of names.filter(
        (name) =>
          name.startsWith(`${id}-${phase}-traffic-`) &&
          /^[a-f0-9]{32}\.json$/.test(name.slice(`${id}-${phase}-traffic-`.length)),
      ))
        leaves.set(name, records.get(name));
      const checked = validateAzureFailoverTrafficHistory(base, failover, phase, catalog, leaves);
      catalogs.set(phase, checked);
      histories++;
      checkpoints += leaves.size;
      consume(`-${phase}-traffic-observations`);
      for (const name of leaves.keys()) consumed.add(name);
    }
    const phaseEvidence = new Map<Phase, Json>();
    const phaseOrder = ['baseline', 'stop', 'outage', 'start', 'recovered', 'release', 'complete'];
    const reached = (phase: string) => active && phaseOrder.indexOf(active.phase) >= phaseOrder.indexOf(phase);
    for (const phase of phases) {
      const input = read(`-${phase}-evidence`);
      if (input === undefined) continue;
      const value = object(input);
      require(value.phase === phase &&
        value.expectedEstablishedSessions === (phase === 'outage' ? 4 : 6), 'phase scope differs');
      timestamp(value.observedAt);
      require(phase === 'baseline' || reached(phase), 'phase evidence precedes durable phase');
      const previous =
        phase === 'outage'
          ? phaseEvidence.get('baseline')
          : phase === 'recovered'
            ? phaseEvidence.get('outage')
            : undefined;
      require(phase === 'baseline' ||
        (previous &&
          timestamp(value.trafficRequestedAt) >= timestamp(previous.observedAt)), 'phase evidence sequence differs');
      const catalog = catalogs.get(phase);
      const request = catalog?.history.observations.find((row) => row.checkpointKey === value.trafficCheckpointKey);
      require(request?.checkpointSha256 &&
        request.requestedAt === value.trafficRequestedAt, 'phase traffic catalog binding missing');
      const traffic = validateAzureTrafficCheckpoint(base, records.get(`${value.trafficCheckpointKey}.json`));
      require(traffic &&
        same(traffic, value.traffic) &&
        timestamp(traffic.observedAt) >= timestamp(value.trafficRequestedAt) &&
        timestamp(traffic.observedAt) <= timestamp(value.observedAt), 'phase HTTP evidence differs');
      if (base.relayProfile) {
        keys(value, [
          'acceptance',
          'phase',
          'topology',
          'expectedEstablishedSessions',
          'expectedCloudEstablishedSessions',
          'observation',
          'traffic',
          'trafficCheckpointKey',
          'trafficRequestedAt',
          'reason',
          'observedAt',
        ]);
        require(value.acceptance === 'unknown' &&
          value.topology === 'ce-relay-route-server' &&
          value.expectedCloudEstablishedSessions === 4 &&
          typeof value.reason === 'string' &&
          value.reason, 'unsupported relay acceptance claim');
        const replay = new Map(
          [...records].filter(([name]) =>
            ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'].includes(
              name,
            ),
          ),
        );
        replay.set('relay-routing-observation.json', value.observation);
        verifyAzureRelayHistoricalArtifacts(
          base,
          siteUid,
          replay,
          phase === 'outage' ? { nodeIndex: failover.nodeIndex } : undefined,
        );
      } else directPhase(base, failover, phase, value, siteUid, records);
      phaseEvidence.set(phase, value);
      consume(`-${phase}-evidence`);
    }
    if (active) {
      const required: Phase[] = active.phase === 'baseline' ? [] : ['baseline'];
      if (['start', 'recovered', 'release', 'complete'].includes(active.phase)) required.push('outage');
      if (['release', 'complete'].includes(active.phase)) required.push('recovered');
      for (const phase of required)
        require(phaseEvidence.get(phase)?.acceptance === 'passed', 'advanced checkpoint phase evidence missing');
    }
    if (receipt)
      require(phaseEvidence.get('recovered') &&
        timestamp(object(receipt).observedAt) >=
          timestamp(phaseEvidence.get('recovered')?.observedAt), 'completion receipt precedes recovery');
    for (const phase of ['stop', 'start', 'release'] as const) {
      const plan = read(`-${phase}-plan`);
      if (plan === undefined) continue;
      const predecessor = phase === 'start' ? 'stop' : phase === 'release' ? 'start' : undefined;
      require(base.engine === 'terraform' &&
        reached(phase) &&
        auth &&
        (!predecessor || read(`-${predecessor}-plan`)), 'Terraform phase plan sequence or authorization missing');
      await validateAzureTerraformFailoverPlan(base, failover, phase, plan);
      consume(`-${phase}-plan`);
    }
    const final = read('-final-plan');
    if (final !== undefined) {
      require(base.engine === 'terraform' &&
        active &&
        ['release', 'complete'].includes(active.phase) &&
        read('-release-plan'), 'final Terraform release sequence differs');
      await validateAzureTerraformFailoverPlan(base, failover, 'release', final, true);
      consume('-final-plan');
    }
    const retirement = read('-stage-retirement');
    if (retirement !== undefined) {
      require(base.engine === 'terraform' &&
        active?.phase === 'complete' &&
        receipt &&
        final, 'stage retirement precedes failover completion');
      await validateAzureTerraformFailoverRetirement(base, failover, retirement);
      consume('-stage-retirement');
    }
    if (base.engine === 'terraform' && active) {
      if (reached('outage')) require(read('-stop-plan'), 'Terraform outage stop plan missing');
      if (reached('recovered')) require(read('-start-plan'), 'Terraform recovery start plan missing');
      if (receipt) require(read('-release-plan') && final, 'Terraform completion release/final plan missing');
    }
  }
  require(names.every((name) => consumed.has(name)), 'unknown or orphan failover artifact');
  return { plans: sources.size, histories, checkpoints, currentEvidenceQualified: false as const };
}

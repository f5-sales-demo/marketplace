import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CePlatformService, CeStoredSiteBinding } from '../../../platform/src/ce/service';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { type AzureCeFailoverPlan, verifyAzureCeFailoverPlan } from './failover';
import { collectAzureFailoverTraffic } from './failover-traffic';
import { verifyAzureRelayHistoricalArtifacts } from './relay-artifact-provenance';
import { observeAzureRelayRoutingWorkflow } from './relay-observation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Azure relay failover: malformed scope');
  return value as Record<string, unknown>;
};
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay failover: ${message}`);
};

/** Historical identity is admission provenance, never current routing, traffic or heartbeat evidence. */
export function requireAzureRelayFailoverScope(
  source: AzureCePlan,
  input: CeStoredSiteBinding,
  capabilities: { tenantOrigin: string; contractFingerprint: string },
  records: Map<string, unknown>,
) {
  const binding = azureUpgradeBinding(source);
  require(source.relayProfile &&
    source.topology.ha &&
    source.topology.nodeCount === 3 &&
    source.nics.length === 2 &&
    source.nics.some((nic) => nic.role === 'slo') &&
    source.nics.some((nic) => nic.role === 'sli'), 'complete three-node SLO/SLI relay topology required');
  const stored = object(input);
  require(Object.keys(stored).sort().join(',') ===
    'binding,contractFingerprint,expectedInterfaces,schemaVersion,siteUid,tenantOrigin' &&
    stored.schemaVersion === 1 &&
    stored.tenantOrigin === capabilities.tenantOrigin &&
    typeof capabilities.tenantOrigin === 'string' &&
    /^https:\/\//.test(capabilities.tenantOrigin) &&
    stored.contractFingerprint === capabilities.contractFingerprint &&
    /^sha256:[a-f0-9]{64}$/.test(capabilities.contractFingerprint) &&
    typeof stored.siteUid === 'string' &&
    stored.siteUid.trim() &&
    canonicalSha256(stored.binding) ===
      canonicalSha256(binding), 'active context, contract or deployment binding differs');
  require(records instanceof Map &&
    ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'].every((name) =>
      records.has(name),
    ), 'complete historical relay configuration required');
  verifyAzureRelayHistoricalArtifacts(source, stored.siteUid as string, records);
  const routing = object(records.get('platform-relay-routing.json'));
  require(routing.contractFingerprint ===
    capabilities.contractFingerprint, 'configured relay contract differs from active context');
  const journal = object(records.get('relay-routing-workflow.json'));
  const cloud = object(object(journal.identity).stable).cloud;
  require(Array.isArray(cloud) &&
    Array.isArray(stored.expectedInterfaces) &&
    stored.expectedInterfaces.length === 6, 'complete six-interface binding required');
  const expected = stored.expectedInterfaces as ExpectedCeInterface[];
  const seen = new Set<string>(),
    macs = new Set<string>();
  for (const row of expected) {
    const value = object(row),
      normalized = typeof value.mac === 'string' ? value.mac.toLowerCase().replaceAll('-', ':') : '';
    const key = `${value.node}/${value.role}`;
    require(binding.nodes.includes(String(value.node)) &&
      ['slo', 'sli'].includes(String(value.role)) &&
      /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(normalized) &&
      !seen.has(key) &&
      !macs.has(normalized), 'duplicate, partial or foreign expected interfaces');
    seen.add(key);
    macs.add(normalized);
    const matches = (cloud as unknown[])
      .map(object)
      .filter((item) => item.node === value.node && item.role === value.role);
    require(matches.length === 1 &&
      matches[0].mac === normalized, 'expected interface MAC differs from retained cloud identity');
  }
  return {
    siteUid: stored.siteUid as string,
    expectedInterfaces: structuredClone(expected),
    topology: 'ce-relay-route-server' as const,
    ceSessionSequence: [6, 4, 6] as const,
    cloudSessionSequence: [4, 4, 4] as const,
    currentTrafficQualified: false as const,
  };
}

/** Refresh trusted bindings and collect actual relay/traffic reads without converting unqualified evidence to success. */
export async function collectAzureRelayFailoverAcceptance(
  source: AzureCePlan,
  failover: AzureCeFailoverPlan,
  phase: 'baseline' | 'outage' | 'recovered',
  platform: CePlatformService,
  runtime: Parameters<typeof observeAzureRelayRoutingWorkflow>[2],
  storage: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  verifyAzureCeFailoverPlan(source, failover);
  require(['baseline', 'outage', 'recovered'].includes(phase), 'phase differs');
  if (!platform.siteBinding) throw Error('Azure relay failover: trusted site binding service unavailable');
  const stored = await platform.siteBinding(source.siteName, source.intent.platformContext);
  signal?.throwIfAborted();
  const capabilities = await platform.capabilities(source.intent.platformContext);
  signal?.throwIfAborted();
  const records = new Map<string, unknown>();
  for (const name of ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'])
    records.set(name, await storage.read(name));
  const scope = requireAzureRelayFailoverScope(source, stored, capabilities, records);
  signal?.throwIfAborted();
  const observation = await observeAzureRelayRoutingWorkflow(
    source,
    scope.expectedInterfaces,
    runtime,
    storage,
    api,
    signal,
    phase === 'outage' ? { nodeIndex: failover.nodeIndex } : undefined,
  );
  require(observation.siteUid === scope.siteUid, 'current site differs from trusted binding');
  for (const row of [observation.sessions, observation.finalSessions, observation.ceRoutes]) {
    const current = object(row);
    require(current.contractFingerprint === capabilities.contractFingerprint &&
      current.siteName === source.siteName &&
      canonicalSha256(current.owner) ===
        canonicalSha256(stored.binding.owner), 'current CE observation owner or contract differs');
  }
  const expectedSessions = phase === 'outage' ? 4 : 6;
  require(observation.sessions.expectedSessions === expectedSessions &&
    observation.sessions.establishedSessions === expectedSessions &&
    observation.finalSessions.expectedSessions === expectedSessions &&
    observation.finalSessions.establishedSessions === expectedSessions, 'current CE session cardinality differs');
  signal?.throwIfAborted();
  const traffic = await collectAzureFailoverTraffic(source, failover, phase, storage, api, signal);
  signal?.throwIfAborted();
  // The observer reports its qualification explicitly; successful reads alone cannot admit an outage.
  const evidence = object(observation);
  const qualified =
    evidence.routing === 'healthy' &&
    evidence.fib === 'healthy' &&
    evidence.ceRouteScope === 'qualified' &&
    evidence.freshness === 'qualified' &&
    evidence.ceSampleFreshnessQualified === true &&
    traffic.evidence.status === 'healthy';
  return {
    acceptance: qualified ? ('passed' as const) : ('unknown' as const),
    phase,
    topology: scope.topology,
    expectedEstablishedSessions: phase === 'outage' ? 4 : 6,
    expectedCloudEstablishedSessions: 4,
    observation,
    traffic: traffic.evidence,
    trafficCheckpointKey: traffic.checkpointKey,
    trafficRequestedAt: traffic.requestedAt,
    ...(qualified
      ? {}
      : { reason: 'Relay CE route scope, forwarding and original sample freshness remain unqualified' }),
    observedAt: new Date().toISOString(),
  };
}

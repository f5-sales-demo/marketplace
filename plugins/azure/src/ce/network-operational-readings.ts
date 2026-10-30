import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { guardAzureCeApplyObject } from './apply-request';
import { canonicalSha256 } from './canonical';
import { collectAzureNetworkOperationalIdentity } from './network-operational-identity';
import { collectAzureRouteServerHealth } from './route-server-health';
import type { AzureTerraformNetworkAcceptanceIdentity } from './terraform-network-checkpoint';
import { azureUpgradeBinding } from './terraform-upgrade';
import { collectAzureCurrentTrafficProbe } from './traffic-probe';
import type { AzureCePlan } from './types';

type Runtime = Parameters<typeof collectAzureNetworkOperationalIdentity>[2] &
  Pick<CeRuntime, 'observeHealth' | 'observeBgpSessions' | 'observeBgpRoutes'>;
type Json = Record<string, unknown>;
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed operational reading');
  return value as Json;
}
function require(value: unknown): asserts value {
  if (!value) throw Error('Operational reading identity differs');
}

/** Collect available facts without widening their scope into serial acceptance.
 * Site-global health remains separate from per-node health. BGP state-change timestamps and
 * collection intervals never qualify original CE sample freshness. A reviewed active traffic
 * probe additionally requires the trusted observer's complete, current up admission.
 */
export async function collectAzureNetworkOperationalReadings(
  request: AzureCePlan,
  expected: AzureTerraformNetworkAcceptanceIdentity,
  transport: Runtime,
  cloud: AzExecApi,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
  collectTraffic = false,
) {
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    requestSha256 = canonicalSha256(request),
    identitySha256 = canonicalSha256(expected),
    binding = azureUpgradeBinding(plan),
    deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]),
    startedAt = new Date().toISOString();
  const collaborators = [
    [
      transport,
      [
        'observeOwnedSite',
        'ownedSiteConfiguration',
        'observeRegistrations',
        'observeAzureInterfaces',
        'observeHealth',
        'observeBgpSessions',
        'observeBgpRoutes',
      ],
    ],
    [cloud, ['exec']],
    [storage, ['verify', 'read', 'write']],
  ] as const;
  const callbacks = collaborators.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target as unknown as Record<string, unknown>;
      const callback = object[name];
      require(typeof callback === 'function');
      return { object, name, callback };
    }),
  );
  const directory = storage.directory;
  const seal = () => {
    deadline.throwIfAborted();
    require(
      same(storage.owner, identity.owner) &&
        same(storage.owner, binding.owner) &&
        transport.engine === 'terraform' &&
        canonicalSha256(request) === requestSha256 &&
        canonicalSha256(expected) === identitySha256 &&
        canonicalSha256(plan) === requestSha256 &&
        canonicalSha256(identity) === identitySha256 &&
        storage.directory === directory &&
        callbacks.every(({ object, name, callback }) => object[name] === callback),
    );
  };
  seal();
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal),
    store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => store.verify());
  const initial = await bounded(() => collectAzureNetworkOperationalIdentity(plan, identity, runtime, api, deadline));
  const unknown = (reason: string) => ({ status: 'unknown' as const, reason });
  let siteHealth: Json = unknown('site-global-health-unavailable');
  try {
    const health = object(await bounded(() => runtime.observeHealth(binding, deadline)));
    require(
      same(health.owner, binding.owner) &&
        health.siteName === binding.siteName &&
        health.siteUid === identity.siteUid &&
        health.scope === 'site-global-only' &&
        health.nodeHealth === 'unknown' &&
        typeof health.representativeNode === 'string' &&
        binding.nodes.includes(health.representativeNode) &&
        ['healthy', 'degraded'].includes(String(health.status)) &&
        ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
          String(health.state),
        ) &&
        (health.status === 'healthy') === (health.state === 'PROVISIONED'),
    );
    siteHealth = {
      status: health.status,
      scope: 'site-global-only',
      nodeHealth: 'unknown',
      siteUid: health.siteUid,
      representativeNode: health.representativeNode,
      state: health.state,
    };
  } catch {
    seal();
  }
  const routeExchange = await bounded(() => collectAzureRouteServerHealth(plan, api, deadline));
  let sessions: Json = unknown('complete-platform-bgp-session-evidence-unavailable'),
    routes: Json = unknown('complete-platform-bgp-route-evidence-unavailable');
  if (routeExchange.status === 'healthy' && initial.status !== 'unknown') {
    const slo = initial.interfaces.filter((row) => row.role === 'slo'),
      serviceAddresses = routeExchange.serviceAddresses;
    require(
      slo.length === binding.nodes.length &&
        binding.nodes.every((node) => slo.filter((row) => row.node === node).length === 1),
    );
    const expectedSessions = slo.flatMap(({ node, interfaceName }) =>
      serviceAddresses.map((peerAddress) => ({ node, interfaceName, peerAddress })),
    );
    try {
      const value = await bounded(() => runtime.observeBgpSessions(binding, expectedSessions, deadline));
      require(
        same(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.expectedSessions === expectedSessions.length &&
          value.sessions.length === expectedSessions.length,
      );
      const rows = expectedSessions.map((wanted) => {
        const matches = value.sessions.filter(
          (row) =>
            row.node === wanted.node &&
            row.interfaceName === wanted.interfaceName &&
            row.peerAddress === wanted.peerAddress,
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
          ...wanted,
          state: row.state,
          receivedPrefixCount: row.receivedPrefixCount,
          advertisedPrefixCount: row.advertisedPrefixCount,
          stateChangedAt: row.stateChangedAt,
        };
      });
      const establishedSessions = rows.filter((row) => row.state === 'Established').length;
      require(
        value.establishedSessions === establishedSessions &&
          value.status === (establishedSessions === expectedSessions.length ? 'healthy' : 'degraded'),
      );
      sessions = {
        status: value.status,
        establishedSessions,
        expectedSessions: expectedSessions.length,
        sessions: rows,
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
    try {
      const value = await bounded(() => runtime.observeBgpRoutes(binding, deadline));
      require(same(value.owner, binding.owner) && value.siteName === binding.siteName && value.status === 'observed');
      require(
        Array.isArray(value.nodes) &&
          value.nodes.length === binding.nodes.length &&
          binding.nodes.every((node) => value.nodes.filter((row) => row.node === node).length === 1),
      );
      // The runtime validates the complete route inventory. Its digest retains provenance without
      // exporting route payloads or treating inventory presence as effective forwarding acceptance.
      routes = {
        status: 'observed',
        scope: 'bgp-route-inventory',
        evidenceSha256: canonicalSha256(value.nodes),
        forwardingAcceptance: 'unknown',
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
  }
  let traffic: Json = unknown(
    !collectTraffic
      ? 'active-probe-not-requested'
      : plan.intent.ingress?.mode !== 'platform-http'
        ? 'reviewed-platform-http-probe-unconfigured'
        : 'interface-up-admission-unverified',
  );
  if (
    collectTraffic &&
    plan.intent.ingress?.mode === 'platform-http' &&
    initial.canSatisfyInterfaceMutationGate === true
  ) {
    try {
      const sample = await bounded(() => collectAzureCurrentTrafficProbe(plan, store, api, deadline));
      traffic = {
        status: sample.status,
        scope: sample.scope,
        sampleId: sample.sampleId,
        planSha256: sample.planSha256,
        checkpointKey: sample.checkpointKey,
        checkpointSha256: sample.checkpointSha256,
        sourceIdentitySha256: sample.sourceIdentitySha256,
        startedAt: sample.startedAt,
        completedAt: sample.completedAt,
        evidenceSha256: canonicalSha256(sample.evidence),
      };
    } catch {
      seal();
      traffic = unknown('current-traffic-probe-unverified');
    }
  }
  const final = await bounded(() => collectAzureNetworkOperationalIdentity(plan, identity, runtime, api, deadline)),
    boundary = (reading: typeof initial) => {
      const { collectedAt: _collectedAt, ...facts } = reading;
      return facts;
    };
  require(same(boundary(initial), boundary(final)));
  seal();
  return {
    schemaVersion: 1,
    scope: 'current-network-operational-readings' as const,
    owner: structuredClone(binding.owner),
    planSha256: plan.planSha256,
    node: identity.node,
    siteUid: identity.siteUid,
    identity: final,
    siteHealth,
    nodeHealth: 'unknown' as const,
    routeExchange,
    sessions,
    routes,
    traffic,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

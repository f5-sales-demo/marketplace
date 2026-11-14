import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureOperationalAcquisitionReference } from './network-operational-provenance';
import type { createAzureOperationalAcquisitionSession } from './network-operational-session';
import type {
  AzureTerraformNetworkAcceptanceIdentity,
  AzureTerraformNetworkAcceptanceVerifier,
} from './terraform-network-checkpoint';

type Session = Awaited<ReturnType<typeof createAzureOperationalAcquisitionSession>>;
type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed operational acceptance evidence');
  return value as Json;
}

export class AzureNetworkOperationalAcceptanceUnavailable extends Error {
  constructor(
    readonly evidence: { status: 'unknown'; interfaceState: string; evidenceSha256: string; missing: string[] },
  ) {
    super(`Operational evidence remains unqualified: ${evidence.missing.join(', ')}`);
  }
}

/** Authenticate the original acquisition before interpreting its operational scope.
 * Current and historical signatures authenticate facts, including down and unknown;
 * neither signature nor collection time supplies a missing vendor freshness contract.
 */
export function createAzureNetworkOperationalAcceptance(session: Session) {
  const collect = session.collect,
    authenticate = session.authenticate;
  const seal = () => {
    if (session.collect !== collect || session.authenticate !== authenticate)
      throw Error('Operational acceptance session changed');
  };
  const inspect = async (
    receipt: unknown,
    identity: AzureTerraformNetworkAcceptanceIdentity,
    mode: 'current' | 'historical',
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    seal();
    const reference = object(receipt),
      purpose = reference.purpose;
    if (!['preflight', 'restored', 'final'].includes(String(purpose)))
      throw Error('Operational acquisition purpose differs');
    const expected = structuredClone(identity),
      referenceSha256 = canonicalSha256(receipt),
      identitySha256 = canonicalSha256(identity);
    const acquired = await authenticate.call(
      session,
      structuredClone(receipt) as AzureOperationalAcquisitionReference,
      expected,
      purpose as 'preflight' | 'restored' | 'final',
      mode,
      signal,
    );
    seal();
    signal?.throwIfAborted();
    if (
      canonicalSha256(receipt) !== referenceSha256 ||
      canonicalSha256(identity) !== identitySha256 ||
      acquired.status !== 'authenticated' ||
      acquired.mode !== mode ||
      acquired.purpose !== purpose
    )
      throw Error('Operational acquisition identity changed');
    const readings = object(acquired.readings),
      physical = object(readings.identity),
      readiness = object(readings.nodeReadiness),
      forwarding = object(readings.forwarding),
      sessions = object(readings.sessions),
      traffic = object(readings.traffic);
    if (
      !canonicalEqual(readings.owner, expected.owner) ||
      readings.planSha256 !== expected.planSha256 ||
      readings.node !== expected.node ||
      readings.siteUid !== expected.siteUid ||
      physical.siteName !== expected.siteName ||
      physical.siteUid !== expected.siteUid ||
      physical.siteConfigurationSha256 !== expected.siteConfigurationSha256 ||
      physical.configurationSha256 !== expected.configurationSha256 ||
      physical.expectedInventorySha256 !== canonicalSha256(expected.inventory.nodes)
    )
      throw Error('Operational reading ownership or inventory differs');
    const registrations = object(physical.registrations),
      registered = Array.isArray(registrations.nodes) ? registrations.nodes.map(object) : [],
      instance = expected.inventory.nodes[String(expected.node)]?.vmId;
    const selected = registered.filter((row) => row.instanceId === instance);
    const missing: string[] = [];
    if (physical.status !== 'observed' || physical.canSatisfyInterfaceMutationGate !== true)
      missing.push('complete-current-up-interfaces');
    // This is the authenticated original sample qualification, never startedAt/completedAt.
    if (String(acquired.originalSampleFreshness) !== 'verified' || physical.freshness !== 'verified')
      missing.push('original-sample-freshness');
    if (
      selected.length !== 1 ||
      readiness.status !== 'observed' ||
      readiness.readiness !== 'ready' ||
      readiness.scope !== 'selected-node-vpm-readiness' ||
      readiness.node !== selected[0]?.node ||
      readiness.instanceId !== instance ||
      readiness.registration !== selected[0]?.registration ||
      readiness.siteUid !== expected.siteUid
    )
      missing.push('selected-node-readiness');
    if (
      object(readings.routeExchange).status !== 'healthy' ||
      sessions.status !== 'healthy' ||
      sessions.establishedSessions !== sessions.expectedSessions ||
      typeof sessions.expectedSessions !== 'number' ||
      sessions.expectedSessions < 1
    )
      missing.push('complete-bgp-route-exchange');
    if (
      sessions.originalSampleFreshness !== 'verified' ||
      forwarding.freshness !== 'verified' ||
      forwarding.interfaceNamespace !== 'verified' ||
      forwarding.operationalAcceptance !== 'verified'
    )
      missing.push('qualified-forwarding-scope-and-freshness');
    if (
      traffic.status !== 'healthy' ||
      traffic.scope !== 'reviewed-vm-http-content-probe' ||
      traffic.planSha256 !== expected.planSha256
    )
      missing.push('current-reviewed-traffic');
    return {
      status: missing.length ? ('unknown' as const) : ('verified' as const),
      interfaceState: String(physical.interfaceState ?? 'unknown'),
      evidenceSha256: acquired.evidenceSha256,
      missing,
    };
  };
  const qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier = async (receipt, identity, mode, signal) => {
    const evidence = await inspect(receipt, identity, mode, signal);
    if (evidence.status !== 'verified')
      throw new AzureNetworkOperationalAcceptanceUnavailable({ ...evidence, status: 'unknown' });
    return { status: 'verified', scope: 'node-interfaces-routing-traffic', evidenceSha256: evidence.evidenceSha256 };
  };
  return Object.freeze({
    collectAcceptance: async (
      identity: AzureTerraformNetworkAcceptanceIdentity,
      purpose: 'preflight' | 'restored' | 'final',
      signal?: AbortSignal,
    ) => {
      seal();
      signal?.throwIfAborted();
      const reference = await collect.call(session, identity, purpose, signal, true);
      seal();
      signal?.throwIfAborted();
      return reference;
    },
    inspect,
    qualifyAcceptance,
  });
}

import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureReplacementReadingsAcquisitionReference } from './network-replacement-readings-provenance';
import {
  assertAzureReplacementReadingsAcquisitionSession,
  type createAzureReplacementReadingsAcquisitionSession,
} from './network-replacement-readings-session';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import type {
  AzureTerraformNetworkReplacementExecutionDependencies,
  AzureTerraformNetworkReplacementOperationalIdentity,
} from './terraform-network-replacement-execution';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';

type Session = Awaited<ReturnType<typeof createAzureReplacementReadingsAcquisitionSession>>;
type Identity = AzureTerraformNetworkReplacementOperationalIdentity;
type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const rows = (value: unknown) => (Array.isArray(value) ? value.map(object) : []);
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Replacement readings acceptance: ${message}`);
}

export class AzureReplacementReadingsAcceptanceUnavailable extends Error {
  constructor(
    readonly evidence: {
      status: 'unknown';
      interfaceState: string;
      evidenceSha256: string;
      missing: string[];
    },
  ) {
    super(`Replacement operational evidence remains unqualified: ${evidence.missing.join(', ')}`);
  }
}

/** Native source authority and original signatures authenticate these facts before interpretation.
 * Configuration readiness, current local invocation, and vendor sample freshness remain distinct.
 * Missing qualifications produce a diagnostic, never a mutation/completion authorization. */
export function createAzureReplacementReadingsAcceptance(session: Session) {
  const plan = assertAzureReplacementReadingsAcquisitionSession(session),
    binding = azureUpgradeBinding(plan),
    profile = verifyAzureTerraformNetworkReplacementProfile(plan),
    collect = session.collect,
    authenticate = session.authenticate;
  const seal = () =>
    require(canonicalEqual(assertAzureReplacementReadingsAcquisitionSession(session), plan) &&
      session.collect === collect &&
      session.authenticate === authenticate, 'native session changed');
  const inspect = async (
    receipt: unknown,
    identity: Identity,
    mode: 'current' | 'historical',
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    seal();
    require(mode === 'current' || mode === 'historical', 'exact authentication mode required');
    const purpose = object(receipt).purpose;
    require((purpose === 'preflight' && identity.phase === 'intact') ||
      (purpose === 'final' && identity.phase === 'launched'), 'exact acquisition purpose and phase required');
    const expected = structuredClone(identity),
      referenceSha256 = canonicalSha256(receipt),
      identitySha256 = canonicalSha256(identity);
    const acquired = await authenticate.call(
      session,
      structuredClone(receipt) as AzureReplacementReadingsAcquisitionReference,
      expected,
      purpose,
      mode,
      signal,
    );
    seal();
    signal?.throwIfAborted();
    require(canonicalSha256(receipt) === referenceSha256 &&
      canonicalSha256(identity) === identitySha256 &&
      canonicalSha256(expected) === identitySha256 &&
      acquired.status === 'authenticated' &&
      acquired.scope === 'owning-replacement-readings-operational-acquisition' &&
      acquired.mode === mode &&
      acquired.purpose === purpose &&
      sha(acquired.evidenceSha256), 'authenticated acquisition changed');
    const readings = object(acquired.readings),
      physical = object(readings.identity),
      readiness = object(readings.nodeReadiness),
      forwarding = object(readings.forwarding),
      bgp = object(readings.bgp),
      traffic = object(readings.traffic);
    require(canonicalEqual(expected.owner, binding.owner) &&
      expected.planSha256 === plan.planSha256 &&
      canonicalEqual(readings.owner, expected.owner) &&
      readings.planSha256 === expected.planSha256 &&
      readings.purpose === purpose &&
      readings.scope === 'current-replacement-operational-readings' &&
      canonicalEqual(physical.owner, expected.owner) &&
      physical.planSha256 === expected.planSha256 &&
      physical.journalSha256 === expected.journalSha256 &&
      physical.sourceBindingSha256 === expected.sourceBindingSha256 &&
      physical.configurationSha256 === expected.configurationSha256 &&
      canonicalEqual(physical.site, expected.site) &&
      physical.phase === expected.phase &&
      physical.purpose === purpose &&
      physical.expectedIdentitySha256 === identitySha256 &&
      physical.expectedInventorySha256 === canonicalSha256(expected.nodes), 'reading source or inventory differs');
    const interfaces = rows(physical.interfaces),
      registrations = rows(object(physical.registrations).nodes),
      nodes = rows(readiness.nodes),
      missing: string[] = [];
    const completeInterfaces =
      interfaces.length === binding.nodes.length * plan.nics.length &&
      new Set(interfaces.map((row) => row.mac)).size === interfaces.length &&
      new Set(interfaces.map((row) => row.interfaceName)).size === interfaces.length &&
      new Set(interfaces.map((row) => `${row.node}/${row.device}`)).size === interfaces.length &&
      binding.nodes.every((node, i) =>
        plan.nics.every((nic) => {
          const wanted = expected.nodes[String(i + 1)]?.nics[String(nic.index)],
            matched = interfaces.filter((row) => row.node === node && row.role === nic.role && row.mac === wanted?.mac);
          return (
            wanted &&
            wanted.attachment === expected.nodes[String(i + 1)].resourceId &&
            matched.length === 1 &&
            matched[0].linkUp === true &&
            text(matched[0].device) &&
            text(matched[0].interfaceName)
          );
        }),
      );
    if (
      physical.status !== 'observed' ||
      physical.interfaceState !== 'observed' ||
      physical.canSatisfyInterfaceMutationGate !== true ||
      !completeInterfaces
    )
      missing.push('complete-current-up-interfaces');
    // The custody field is explicitly unqualified today. Neither signature nor local clock
    // upgrades it; an independently qualified original publication contract is still required.
    if (String(acquired.originalSampleFreshness) !== 'verified' || physical.freshness !== 'verified')
      missing.push('original-sample-freshness');
    if (
      readiness.status !== 'observed' ||
      readiness.readiness !== 'ready' ||
      readiness.scope !== 'all-replacement-node-vpm-readiness' ||
      !canonicalEqual(readiness.owner, expected.owner) ||
      readiness.planSha256 !== plan.planSha256 ||
      readiness.siteUid !== expected.site.siteUid ||
      readiness.expectedIdentitySha256 !== identitySha256 ||
      object(physical.registrations).status !== 'observed' ||
      registrations.length !== binding.nodes.length ||
      nodes.length !== binding.nodes.length ||
      !binding.nodes.every((node, i) => {
        const vm = expected.nodes[String(i + 1)],
          registered = registrations.filter(
            (row) => row.node === node && row.instanceId === vm?.vmId && row.state === 'ONLINE',
          ),
          observed = nodes.filter((row) => row.node === node && row.instanceId === vm?.vmId);
        return (
          registered.length === 1 &&
          observed.length === 1 &&
          text(registered[0].registration) &&
          observed[0].registration === registered[0].registration &&
          observed[0].status === 'observed' &&
          observed[0].state === 'PROVISIONED' &&
          observed[0].readiness === 'ready' &&
          sha(observed[0].outputSha256) &&
          sha(observed[0].bindingOutputSha256)
        );
      })
    )
      missing.push('all-replacement-node-readiness');
    if (readiness.nodeHealth !== 'healthy' || physical.nodeHealth !== 'healthy')
      missing.push('all-node-operational-health');
    if (
      forwarding.status !== 'observed' ||
      forwarding.scope !== 'replacement-reviewed-forwarding' ||
      !canonicalEqual(forwarding.owner, expected.owner) ||
      forwarding.planSha256 !== plan.planSha256 ||
      forwarding.retainedPlanSha256 !== profile.retainedPlanSha256 ||
      forwarding.expectedIdentitySha256 !== identitySha256 ||
      !sha(forwarding.expectedRoutesSha256) ||
      forwarding.freshness !== 'verified' ||
      forwarding.interfaceNamespace !== 'verified' ||
      forwarding.operationalAcceptance !== 'verified'
    )
      missing.push('qualified-forwarding-scope-and-freshness');
    if (plan.routing.mode === 'route-server') {
      const exchange = object(bgp.routeExchange),
        sessions = object(bgp.sessions),
        routes = object(bgp.routes);
      if (
        bgp.status !== 'observed' ||
        bgp.scope !== 'replacement-bgp-route-observations' ||
        !canonicalEqual(bgp.owner, expected.owner) ||
        bgp.planSha256 !== plan.planSha256 ||
        bgp.expectedIdentitySha256 !== identitySha256 ||
        exchange.status !== 'healthy' ||
        sessions.status !== 'healthy' ||
        sessions.expectedSessions !== binding.nodes.length * 2 ||
        sessions.establishedSessions !== sessions.expectedSessions ||
        rows(sessions.sessions).length !== sessions.expectedSessions ||
        routes.status !== 'observed' ||
        routes.scope !== 'all-node-bgp-route-inventory' ||
        !sha(routes.evidenceSha256)
      )
        missing.push('complete-bgp-route-exchange');
      if (
        bgp.originalSampleFreshness !== 'verified' ||
        sessions.originalSampleFreshness !== 'verified' ||
        routes.originalSampleFreshness !== 'verified'
      )
        missing.push('original-bgp-sample-freshness');
    } else if (bgp.status !== 'not-applicable' || bgp.reason !== 'route-server-unconfigured')
      missing.push('routing-applicability');
    if (
      plan.intent.ingress?.mode !== 'platform-http' ||
      traffic.status !== 'healthy' ||
      traffic.scope !== 'reviewed-vm-http-content-probe' ||
      traffic.planSha256 !== plan.planSha256 ||
      !text(traffic.sampleId) ||
      !text(traffic.checkpointKey) ||
      !sha(traffic.checkpointSha256) ||
      !sha(traffic.sourceIdentitySha256) ||
      !sha(traffic.evidenceSha256)
    )
      missing.push('current-reviewed-traffic');
    return {
      status: missing.length ? ('unknown' as const) : ('verified' as const),
      interfaceState: String(physical.interfaceState ?? 'unknown'),
      evidenceSha256: acquired.evidenceSha256,
      missing,
    };
  };
  const qualifyCompletedOperational: AzureTerraformNetworkReplacementCompletedVerifier = async (
    receipt,
    identity,
    mode,
    signal,
  ) => {
    const evidence = await inspect(receipt, identity, mode, signal);
    if (evidence.status !== 'verified')
      throw new AzureReplacementReadingsAcceptanceUnavailable({ ...evidence, status: 'unknown' });
    return { status: 'verified', scope: 'node-interfaces-routing-traffic', evidenceSha256: evidence.evidenceSha256 };
  };
  const qualifyOperational: AzureTerraformNetworkReplacementExecutionDependencies['qualifyOperational'] = (
    receipt,
    identity,
    signal,
  ) => qualifyCompletedOperational(receipt, identity, 'current', signal);
  return Object.freeze({
    collectOperational: async (identity: Identity, purpose: 'preflight' | 'final', signal?: AbortSignal) => {
      signal?.throwIfAborted();
      seal();
      const reference = await collect.call(session, identity, purpose, signal, true);
      signal?.throwIfAborted();
      seal();
      return reference;
    },
    inspect,
    qualifyOperational,
    qualifyCompletedOperational,
  });
}

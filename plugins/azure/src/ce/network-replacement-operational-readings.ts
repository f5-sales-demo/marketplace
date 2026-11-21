import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { guardAzureCeApplyObject } from './apply-request';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import {
  type AzureReplacementOperationalIdentityDependencies,
  collectAzureReplacementOperationalIdentity,
} from './network-replacement-operational-identity';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from './terraform-network-replacement-execution';
import { collectAzureCurrentTrafficProbe } from './traffic-probe';
import type { AzureCePlan } from './types';

type Runtime = Parameters<typeof collectAzureReplacementOperationalIdentity>[2];
type Json = Record<string, unknown>;
function require(value: unknown): asserts value {
  if (!value) throw Error('Replacement operational readings context or identity changed');
}

/** Acquire source-authenticated replacement facts around an explicitly requested current
 * probe. The registration/interface signature retains its read-only scope; these readings
 * do not qualify publication freshness, all traffic paths or full operational acceptance. */
export async function collectAzureReplacementOperationalReadings(
  request: AzureCePlan,
  expected: AzureTerraformNetworkReplacementOperationalIdentity,
  transport: Runtime,
  cloud: AzExecApi,
  storage: CeDeploymentStore,
  terraform: TerraformSession,
  dependencies: AzureReplacementOperationalIdentityDependencies,
  purpose: 'preflight' | 'final',
  signal?: AbortSignal,
  collectTraffic = false,
) {
  signal?.throwIfAborted();
  require(typeof collectTraffic === 'boolean' && ['preflight', 'final'].includes(purpose));
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    matchesPlan = canonicalSnapshot(request),
    matchesIdentity = canonicalSnapshot(expected),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    environment = process.env,
    environmentSha256 = canonicalSha256(environment),
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
        'observeNodeReadiness',
        'observeForwardingRoutes',
        'observeBgpSessions',
        'observeBgpRoutes',
      ],
    ],
    [cloud, ['exec']],
    [storage, ['verify', 'read', 'write']],
    [terraform, ['readConfiguration', 'readConfigurationSha256']],
    [dependencies, ['qualifyHistorical', 'qualifyReplacementCompleted']],
    [dependencies.loaders, ['loadSource']],
  ] as const;
  const callbacks = collaborators.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target as unknown as Record<string, unknown>;
      return { object, name, callback: object[name] };
    }),
  );
  const seal = () => {
    deadline.throwIfAborted();
    require(
      matchesPlan(request) &&
        matchesPlan(plan) &&
        matchesIdentity(expected) &&
        matchesIdentity(identity) &&
        canonicalEqual(storage.owner, owner) &&
        canonicalEqual(owner, identity.owner) &&
        storage.directory === directory &&
        transport.engine === 'terraform' &&
        process.env === environment &&
        canonicalSha256(environment) === environmentSha256 &&
        callbacks.every((row) => row.object[row.name] === row.callback),
    );
  };
  seal();
  // The identity reader already guards its acquired read collaborators. Avoid wrapping
  // those guards again; compare the caller context at both acquisition boundaries.
  // Keep per-operation outer guards for active guest commands and traffic publications.
  const api = guardAzureCeApplyObject(cloud, seal),
    store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([Promise.resolve().then(work), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const acquire = () =>
    bounded(() =>
      collectAzureReplacementOperationalIdentity(
        plan,
        identity,
        transport,
        cloud,
        storage,
        terraform,
        dependencies,
        purpose,
        deadline,
      ),
    );
  const initial = await acquire();
  const unknown = (reason: string) => ({ status: 'unknown' as const, reason });
  let traffic: Json = unknown(
    !collectTraffic
      ? 'active-probe-not-requested'
      : plan.intent.ingress?.mode !== 'platform-http'
        ? 'reviewed-platform-http-probe-unconfigured'
        : 'qualified-current-up-admission-unavailable',
  );
  if (
    collectTraffic &&
    plan.intent.ingress?.mode === 'platform-http' &&
    initial.canSatisfyInterfaceMutationGate === true
  ) {
    try {
      require(typeof storage.write === 'function');
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
      traffic = unknown('current-reviewed-traffic-probe-unverified');
    }
  }
  const final = await acquire();
  if (initial.status !== 'unknown' && final.status !== 'unknown') {
    // Collection times and explicit link state are not identity. A physical/object/registration
    // change must reject even when each separate observation is internally complete.
    const identityFacts = (reading: typeof initial) => ({
      site: reading.site,
      registrations: reading.registrations,
      interfaces: reading.interfaces.map(({ linkUp: _link, ...row }) => row),
      sourceBindingSha256: reading.sourceBindingSha256,
      configurationSha256: reading.configurationSha256,
      expectedInventorySha256: reading.expectedInventorySha256,
    });
    require(canonicalEqual(identityFacts(initial), identityFacts(final)));
  }
  if (traffic.status === 'healthy' && final.canSatisfyInterfaceMutationGate !== true)
    traffic = unknown('post-probe-qualified-current-up-admission-unavailable');
  seal();
  return {
    schemaVersion: 1,
    scope: 'current-replacement-operational-readings' as const,
    status:
      initial.status !== 'unknown' && final.status !== 'unknown' && (!collectTraffic || traffic.status === 'healthy')
        ? ('observed' as const)
        : ('unknown' as const),
    owner,
    planSha256: plan.planSha256,
    purpose,
    identity: final,
    nodeReadiness: final.nodeReadiness,
    forwarding: final.forwarding,
    bgp: final.bgp,
    traffic,
    operationalAcceptance: 'unknown' as const,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

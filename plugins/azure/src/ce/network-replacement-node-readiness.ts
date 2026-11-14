import { validateExpectedNodeHealth } from '../../../platform/src/ce/node-health';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from './terraform-network-replacement-execution';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Runtime = Pick<CeRuntime, 'engine'> & Partial<Pick<CeRuntime, 'observeNodeReadiness'>>;
type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed replacement readiness');
  return value as Json;
}
function require(value: unknown): asserts value {
  if (!value) throw Error('Replacement readiness identity or scope differs');
}
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Current, identity-bound VPM readiness for every replacement-generation node.
 * Configuration readiness and version facts remain separate from node operational health,
 * interface heartbeat freshness, routing and traffic. No mutations or keys are created.
 */
export async function collectAzureReplacementNodeReadiness(
  request: AzureCePlan,
  expected: AzureTerraformNetworkReplacementOperationalIdentity,
  registrations: unknown,
  runtime: Runtime,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    registered = structuredClone(registrations ?? null);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  const binding = azureUpgradeBinding(plan),
    reader = runtime.observeNodeReadiness;
  const planSha = canonicalSha256(request),
    identitySha = canonicalSha256(expected),
    registeredSha = canonicalSha256(registrations ?? null);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(
      runtime.engine === 'terraform' &&
        runtime.observeNodeReadiness === reader &&
        canonicalSha256(request) === planSha &&
        canonicalSha256(expected) === identitySha &&
        canonicalSha256(registrations ?? null) === registeredSha &&
        canonicalEqual(identity.owner, binding.owner) &&
        identity.planSha256 === plan.planSha256,
    );
  };
  const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
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
  seal();
  const base = {
    schemaVersion: 1,
    scope: 'all-replacement-node-vpm-readiness' as const,
    owner: structuredClone(binding.owner),
    planSha256: plan.planSha256,
    siteUid: identity.site.siteUid,
    expectedIdentitySha256: identitySha,
    originalSampleFreshness: 'unqualified' as const,
    nodeHealth: 'unknown' as const,
    routingTrafficQualified: false,
    canSatisfyInterfaceMutationGate: false,
  };
  let rows: Json[];
  try {
    const value = object(registered);
    require(value.status === 'observed' && Array.isArray(value.nodes) && value.nodes.length === binding.nodes.length);
    rows = value.nodes.map(object);
    const instances = binding.nodes.map((node, index) => ({
      node,
      instanceId: identity.nodes[String(index + 1)]?.vmId,
    }));
    require(
      new Set(instances.map((row) => row.instanceId)).size === binding.nodes.length &&
        instances.every(
          (wanted) =>
            typeof wanted.instanceId === 'string' &&
            /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(wanted.instanceId) &&
            rows.filter(
              (row) =>
                row.node === wanted.node &&
                row.instanceId === wanted.instanceId &&
                row.state === 'ONLINE' &&
                typeof row.registration === 'string' &&
                row.registration.trim(),
            ).length === 1,
        ),
    );
  } catch {
    seal();
    return {
      ...base,
      status: 'unknown' as const,
      readiness: 'unknown' as const,
      nodes: [],
      reason: 'complete-registrations-unavailable',
    };
  }
  const instances = Object.fromEntries(
    binding.nodes.map((node, index) => [node, identity.nodes[String(index + 1)].vmId as string]),
  );
  const nodes: Json[] = [];
  for (const node of binding.nodes) {
    let result: Json = {
      node,
      instanceId: instances[node],
      status: 'unknown',
      readiness: 'unknown',
      reason: 'node-readiness-unavailable',
    };
    try {
      require(typeof reader === 'function');
      const registration = rows.find((row) => row.node === node);
      const value = object(
        await bounded(() =>
          reader.call(
            runtime,
            structuredClone(binding),
            { siteUid: identity.site.siteUid, node, instances: { ...instances } },
            deadline,
          ),
        ),
      );
      require(
        value.status === 'observed' &&
          canonicalEqual(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.siteUid === identity.site.siteUid &&
          value.node === node &&
          value.instanceId === instances[node] &&
          value.registration === registration?.registration &&
          value.scope === 'selected-node-vpm-readiness' &&
          value.originalSampleFreshness === 'unqualified' &&
          value.canSatisfyInterfaceMutationGate === false &&
          value.allNodeHealthQualified === false &&
          value.routingTrafficQualified === false &&
          value.source ===
            '/api/operate/namespaces/system/sites/' + binding.siteName + '/vpm/debug/' + node + '/exec-user' &&
          sha(value.outputSha256) &&
          sha(value.bindingOutputSha256) &&
          ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
            String(value.state),
          ) &&
          value.readiness === (value.state === 'PROVISIONED' ? 'ready' : 'not-ready') &&
          Array.isArray(value.roles) &&
          value.roles.length > 0 &&
          value.roles.length <= 32 &&
          new Set(value.roles).size === value.roles.length &&
          [value.softwareVersion, value.osVersion, value.vpmVersion, ...value.roles].every(
            (text) => typeof text === 'string' && text.trim() && text.length <= 256,
          ),
      );
      validateExpectedNodeHealth(
        { siteUid: identity.site.siteUid, node, instances, expectedFqdn: value.fqdn as string },
        binding.nodes,
      );
      result = {
        node,
        instanceId: instances[node],
        registration: value.registration,
        status: 'observed',
        readiness: value.readiness,
        state: value.state,
        fqdn: value.fqdn,
        softwareVersion: value.softwareVersion,
        osVersion: value.osVersion,
        vpmVersion: value.vpmVersion,
        roles: [...value.roles],
        source: value.source,
        outputSha256: value.outputSha256,
        bindingOutputSha256: value.bindingOutputSha256,
      };
    } catch {
      seal();
    }
    nodes.push(result);
  }
  seal();
  const complete = nodes.every((row) => row.status === 'observed');
  return {
    ...base,
    status: complete ? ('observed' as const) : ('unknown' as const),
    readiness: !complete
      ? ('unknown' as const)
      : nodes.every((row) => row.readiness === 'ready')
        ? ('ready' as const)
        : ('not-ready' as const),
    nodes,
    reason: complete ? 'readiness-only-not-operational-acceptance' : 'node-readiness-unavailable',
  };
}

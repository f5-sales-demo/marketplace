import type { ExpectedCeForwardingRoutes } from '../../../platform/src/ce/forwarding-route';
import { validateExpectedForwardingRoutes } from '../../../platform/src/ce/forwarding-route';
import type { ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { normalizeAzureForwardingExpectations } from './network-forwarding-expectations';
import { collectAzureNetworkForwardingReading } from './network-forwarding-readings';
import { azureTerraformNetworkScope, verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from './terraform-network-replacement-execution';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

function require(value: unknown): asserts value {
  if (!value) throw Error('Replacement forwarding source or physical identity differs');
}

/** Replacement changes a VM, not its completed retained network configuration. Both
 * boundaries compare the retained after scope; a serial update's mixed before/after scope
 * is inappropriate here. Names come solely from complete MAC/device/node/role joins.
 */
export function resolveAzureReplacementForwardingExpectations(
  plan: AzureCePlan,
  retained: AzureCePlan,
  identity: AzureTerraformNetworkReplacementOperationalIdentity,
  interfaces: ObservedCeInterface[],
): ExpectedCeForwardingRoutes | undefined {
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  verifyAzureCePlan(retained);
  const retainedOriginal =
    retained.intent.operation === 'update-network'
      ? verifyAzureTerraformNetworkProfile(retained).originalPlanSha256
      : verifyAzureTerraformNetworkReplacementProfile(retained).originalPlanSha256;
  const binding = azureUpgradeBinding(plan);
  require(
    profile.retainedPlanSha256 === retained.planSha256 &&
      retainedOriginal === profile.originalPlanSha256 &&
      canonicalEqual(azureUpgradeBinding(retained), binding) &&
      canonicalEqual(azureTerraformNetworkScope(plan, false), azureTerraformNetworkScope(retained, false)) &&
      identity.planSha256 === plan.planSha256 &&
      canonicalEqual(identity.owner, binding.owner) &&
      typeof identity.site.siteUid === 'string' &&
      identity.site.siteUid.trim(),
  );
  const desired = retained.routing.forwardingRoutes;
  if (desired === undefined) {
    require(plan.routing.forwardingRoutes === undefined && plan.intent.routing.forwardingRoutes === undefined);
    return undefined;
  }
  const normalized = normalizeAzureForwardingExpectations(
    desired,
    plan.topology.nodeCount,
    plan.nics.map((row) => row.role),
  );
  require(
    canonicalEqual(desired, normalized) &&
      canonicalEqual(retained.intent.routing.forwardingRoutes, normalized) &&
      canonicalEqual(plan.routing.forwardingRoutes, normalized) &&
      canonicalEqual(plan.intent.routing.forwardingRoutes, normalized),
  );
  const physical = binding.nodes.flatMap((node, index) =>
    ['slo', 'sli'].map((role) => {
      const nics = plan.nics.filter((row) => row.role === role);
      require(nics.length === 1);
      const expected = identity.nodes[String(index + 1)]?.nics[String(nics[0].index)];
      const matches = interfaces.filter((row) => row.node === node && row.role === role);
      require(
        expected &&
          matches.length === 1 &&
          matches[0].mac === expected.mac &&
          typeof matches[0].device === 'string' &&
          matches[0].device.trim() &&
          typeof matches[0].interfaceName === 'string' &&
          matches[0].interfaceName.trim(),
      );
      const row = matches[0];
      return { node, role: role as 'slo' | 'sli', mac: row.mac, device: row.device, interfaceName: row.interfaceName };
    }),
  );
  require(interfaces.filter((row) => row.role === 'slo' || row.role === 'sli').length === physical.length);
  const routes = binding.nodes.flatMap((node, index) =>
    normalized.after.filter((row) => row.node === index + 1).map((row) => ({ ...row, node })),
  );
  const result = { siteUid: identity.site.siteUid, interfaces: physical, routes };
  validateExpectedForwardingRoutes(result, binding.nodes);
  return result;
}

/** Available reported forwarding facts; no configuration mutation, inferred desired routes,
 * original sample freshness, or traffic acceptance. The enclosing identity reader rechecks
 * the full source/configuration/cloud/registration/interface generation after collection.
 */
export async function collectAzureReplacementForwarding(
  request: AzureCePlan,
  predecessor: AzureCePlan,
  expected: AzureTerraformNetworkReplacementOperationalIdentity,
  physical: ObservedCeInterface[],
  runtime: Partial<Pick<CeRuntime, 'observeForwardingRoutes'>>,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    retained = structuredClone(predecessor),
    identity = structuredClone(expected),
    interfaces = structuredClone(physical),
    reader = runtime.observeForwardingRoutes;
  const snapshots = [
    canonicalSha256(request),
    canonicalSha256(predecessor),
    canonicalSha256(expected),
    canonicalSha256(physical),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(
      runtime.observeForwardingRoutes === reader &&
        canonicalEqual(snapshots, [
          canonicalSha256(request),
          canonicalSha256(predecessor),
          canonicalSha256(expected),
          canonicalSha256(physical),
        ]),
    );
  };
  seal();
  const wanted = resolveAzureReplacementForwardingExpectations(plan, retained, identity, interfaces);
  const base = {
    scope: 'replacement-reviewed-forwarding' as const,
    owner: structuredClone(identity.owner),
    planSha256: identity.planSha256,
    retainedPlanSha256: retained.planSha256,
    expectedIdentitySha256: canonicalSha256(identity),
    interfaceNamespace: 'unqualified' as const,
    freshness: 'unqualified' as const,
    operationalAcceptance: 'unknown' as const,
  };
  if (!wanted) return { ...base, status: 'unknown' as const, reason: 'reviewed-forwarding-unconfigured' };
  if (typeof reader !== 'function')
    return { ...base, status: 'unknown' as const, reason: 'forwarding-observer-unavailable' };
  const aborted = Promise.withResolvers<never>(),
    abort = () => aborted.reject(deadline.reason);
  deadline.addEventListener('abort', abort, { once: true });
  try {
    const observations = await Promise.race([
      collectAzureNetworkForwardingReading(
        azureUpgradeBinding(plan),
        wanted,
        { observeForwardingRoutes: reader.bind(runtime) },
        deadline,
      ),
      aborted.promise,
    ]);
    seal();
    return {
      ...base,
      status: 'observed' as const,
      observations,
      expectedRoutesSha256: canonicalSha256(wanted),
      reason: 'reported-forwarding-only-not-operational-acceptance',
    };
  } catch {
    seal();
    return { ...base, status: 'unknown' as const, reason: 'reviewed-forwarding-evidence-unverified' };
  } finally {
    deadline.removeEventListener('abort', abort);
  }
}

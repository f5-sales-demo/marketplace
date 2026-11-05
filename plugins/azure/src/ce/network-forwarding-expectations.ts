import { isIP } from 'node:net';
import {
  type ExpectedCeForwardingRoutes,
  validateExpectedForwardingRoutes,
} from '../../../platform/src/ce/forwarding-route';
import type { ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import { canonicalEqual } from './canonical';
import type { AzureTerraformNetworkAcceptanceIdentity } from './terraform-network-checkpoint';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeForwardingExpectations, AzureCeForwardingRouteExpectation, AzureCePlan } from './types';

function require(value: unknown): asserts value {
  if (!value) throw Error('Azure CE forwarding expectations are malformed, partial or identity-unverified');
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function prefix(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const [address, bits, extra] = value.split('/');
  if (isIP(address) !== 4 || extra !== undefined || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits ?? '')) return false;
  const number = address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  return number % 2 ** (32 - Number(bits)) === 0;
}
/** Desired routes are explicit plan intent, never observed state or freshness evidence.
 * Complete before/after scopes support serial HA transitions without comparing a preflight
 * against routes that can only exist after its selected node has changed configuration.
 */
export function normalizeAzureForwardingExpectations(
  value: unknown,
  nodeCount: number,
  roles: string[],
): AzureCeForwardingExpectations {
  const profile = object(value);
  require(
    canonicalEqual(Object.keys(profile).sort(), ['after', 'before']) &&
      [1, 3].includes(nodeCount) &&
      ['slo', 'sli'].every((role) => roles.filter((v) => v === role).length === 1),
  );
  const normalize = (value: unknown): AzureCeForwardingRouteExpectation[] => {
    require(Array.isArray(value) && value.length >= nodeCount * 2 && value.length <= 1024);
    const seen = new Set<string>();
    const rows = value.map((raw) => {
      const row = object(raw);
      require(
        canonicalEqual(Object.keys(row).sort(), ['node', 'prefix', 'role', 'routeType']) &&
          typeof row.node === 'number' &&
          Number.isInteger(row.node) &&
          row.node >= 1 &&
          row.node <= nodeCount &&
          typeof row.role === 'string' &&
          ['slo', 'sli'].includes(row.role) &&
          prefix(row.prefix) &&
          typeof row.routeType === 'string' &&
          ['REMOTE_SITE_ROUTE', 'LOCAL_ROUTE', 'STATIC_ROUTE', 'BGP_ROUTE'].includes(row.routeType),
      );
      const key = JSON.stringify([row.node, row.role, row.prefix]);
      require(!seen.has(key));
      seen.add(key);
      return {
        node: row.node,
        role: row.role,
        prefix: row.prefix,
        routeType: row.routeType,
      } as AzureCeForwardingRouteExpectation;
    });
    for (let node = 1; node <= nodeCount; node++)
      for (const role of ['slo', 'sli']) require(rows.some((row) => row.node === node && row.role === role));
    return rows.toSorted(
      (a, b) =>
        a.node - b.node || (a.role === 'slo' ? 0 : 1) - (b.role === 'slo' ? 0 : 1) || a.prefix.localeCompare(b.prefix),
    );
  };
  const normalized = { before: normalize(profile.before), after: normalize(profile.after) };
  // Every serial boundary must fit the same public observer capacity as either full scope.
  for (let changed = 0; changed <= nodeCount; changed++)
    require(
      normalized.after.filter((row) => row.node <= changed).length +
        normalized.before.filter((row) => row.node > changed).length <=
        1024,
    );
  return normalized;
}

/** Resolve runtime names only from the current identity-joined observation and cloud inventory.
 * The result instructs a read-only route comparison; no interface namespace, heartbeat,
 * operational acceptance or permission to interrupt a node is inferred here.
 */
export function resolveAzureForwardingExpectations(
  plan: AzureCePlan,
  identity: AzureTerraformNetworkAcceptanceIdentity,
  physical: ObservedCeInterface[],
  purpose: 'preflight' | 'restored' | 'final',
): ExpectedCeForwardingRoutes | undefined {
  const desired = plan.routing.forwardingRoutes;
  if (desired === undefined) {
    require(plan.intent.routing.forwardingRoutes === undefined);
    return undefined;
  }
  const binding = azureUpgradeBinding(plan),
    profile = normalizeAzureForwardingExpectations(
      desired,
      plan.topology.nodeCount,
      plan.nics.map((nic) => nic.role),
    );
  require(
    canonicalEqual(desired, profile) &&
      canonicalEqual(plan.intent.routing.forwardingRoutes, profile) &&
      canonicalEqual(identity.owner, binding.owner) &&
      identity.planSha256 === plan.planSha256 &&
      identity.siteName === plan.siteName &&
      Number.isInteger(identity.node) &&
      identity.node >= 1 &&
      identity.node <= plan.topology.nodeCount &&
      ['preflight', 'restored', 'final'].includes(purpose),
  );
  const interfaces = binding.nodes.flatMap((node, index) =>
    ['slo', 'sli'].map((role) => {
      const nics = plan.nics.filter((nic) => nic.role === role);
      require(nics.length === 1);
      const expected = identity.inventory.nodes[String(index + 1)]?.nics[String(nics[0].index)];
      const matches = physical.filter((row) => row.node === node && row.role === role);
      require(expected && matches.length === 1 && matches[0].mac === expected.mac);
      const row = matches[0];
      return { node, role: role as 'slo' | 'sli', mac: row.mac, device: row.device, interfaceName: row.interfaceName };
    }),
  );
  require(physical.filter((row) => row.role === 'slo' || row.role === 'sli').length === interfaces.length);
  const routes = binding.nodes.flatMap((node, index) => {
    const changed = index + 1 < identity.node || (index + 1 === identity.node && purpose !== 'preflight');
    return profile[changed ? 'after' : 'before']
      .filter((row) => row.node === index + 1)
      .map((row) => ({ ...row, node }));
  });
  const result = { siteUid: identity.siteUid, interfaces, routes };
  validateExpectedForwardingRoutes(result, binding.nodes);
  return result;
}

/** A completed predecessor with explicit expectations fixes the next comparison's before scope.
 * This joins desired intent only; source/history and current operational evidence remain separate.
 */
export function verifyAzureForwardingPredecessor(base: AzureCePlan, retained: AzureCePlan): void {
  const desired = base.routing.forwardingRoutes,
    prior = retained.routing.forwardingRoutes;
  if (prior === undefined) return;
  require(desired !== undefined && canonicalEqual(desired.before, prior.after));
}

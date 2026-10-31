import {
  type ExpectedCeForwardingRoutes,
  validateExpectedForwardingRoutes,
} from '../../../platform/src/ce/forwarding-route';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import { canonicalEqual, canonicalSha256 } from './canonical';

type Json = Record<string, unknown>;
const same = canonicalEqual;
function require(value: unknown): asserts value {
  if (!value) throw Error('Forwarding reading identity differs');
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Json;
}
function rows(value: unknown): Json[] {
  require(Array.isArray(value));
  return value.map(object);
}
const stable = (values: unknown[]) => values.map(canonicalSha256).toSorted();

/** Execute the mapped public observer twice against independently reviewed route expectations.
 * Literal reported-interface matches remain separate from physical namespace qualification.
 * Stable collection does not establish original publisher freshness or execution provenance.
 * The caller binds complete current cloud/registration/interface identity around these reads.
 */
export async function collectAzureNetworkForwardingReading(
  binding: SiteBinding,
  expected: ExpectedCeForwardingRoutes,
  runtime: Pick<CeRuntime, 'observeForwardingRoutes'>,
  signal?: AbortSignal,
) {
  const identity = structuredClone(binding),
    wanted = structuredClone(expected);
  validateExpectedForwardingRoutes(wanted, identity.nodes);
  const expectedReads = wanted.interfaces.map((row) => ({
    method: 'POST',
    path: `/api/operate/namespaces/system/sites/${identity.siteName}/ver/simplified_routes`,
    body: { namespace: 'system', site: identity.siteName, node: row.node, family: 'INET4', [row.role]: {} },
  }));
  const read = async () => {
    signal?.throwIfAborted();
    const value = object(
      await runtime.observeForwardingRoutes(structuredClone(identity), structuredClone(wanted), signal),
    );
    signal?.throwIfAborted();
    require(
      value.status === 'observed' &&
        same(value.owner, identity.owner) &&
        value.siteName === identity.siteName &&
        value.siteUid === wanted.siteUid &&
        value.scope === 'reported-forwarding-interface' &&
        value.interfaceNamespace === 'unqualified' &&
        value.freshness === 'unqualified' &&
        value.operationalAcceptance === 'unknown' &&
        typeof value.contractFingerprint === 'string' &&
        /^sha256:[a-f0-9]{64}$/.test(value.contractFingerprint) &&
        same(value.reads, expectedReads),
    );
    const observed = rows(value.routes);
    require(observed.length === wanted.routes.length);
    const routes = wanted.routes.map((route) => {
      const matches = observed.filter(
        (row) =>
          row.node === route.node &&
          row.role === route.role &&
          row.prefix === route.prefix &&
          row.routeType === route.routeType,
      );
      require(matches.length === 1);
      const row = matches[0];
      require(
        Array.isArray(row.flags) &&
          row.flags.every(
            (flag) =>
              typeof flag === 'string' &&
              flag.length > 0 &&
              flag.length <= 1024 &&
              [...flag].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
          ) &&
          new Set(row.flags).size === row.flags.length,
      );
      const hops = rows(row.interfaces),
        seen = new Set<string>();
      require(hops.length > 0 && hops.length <= wanted.interfaces.length);
      const interfaces = hops.map((hop) => {
        const matches = wanted.interfaces.filter(
          (iface) =>
            iface.node === route.node &&
            iface.role === route.role &&
            iface.node === hop.node &&
            iface.role === hop.role &&
            iface.mac === hop.mac &&
            iface.device === hop.device &&
            iface.interfaceName === hop.interfaceName,
        );
        require(matches.length === 1 && !seen.has(matches[0].mac));
        const iface = matches[0];
        seen.add(iface.mac);
        require(
          (hop.kind === 'local' || hop.kind === 'subnet') &&
            (hop.reportedInterface === iface.device || hop.reportedInterface === iface.interfaceName) &&
            same(
              hop.matchedFields,
              ['device', 'interfaceName'].filter(
                (field) => iface[field as 'device' | 'interfaceName'] === hop.reportedInterface,
              ),
            ),
        );
        // Export only validated observational fields, never arbitrary transport payloads.
        return {
          ...iface,
          kind: hop.kind,
          reportedInterface: hop.reportedInterface,
          matchedFields: [...(hop.matchedFields as string[])],
        };
      });
      return {
        ...route,
        flags: [...(row.flags as string[])].toSorted(),
        interfaces: interfaces.toSorted((a, b) => a.mac.localeCompare(b.mac)),
      };
    });
    return { contractFingerprint: value.contractFingerprint, routes };
  };
  const first = await read(),
    second = await read();
  require(
    first.contractFingerprint === second.contractFingerprint && same(stable(first.routes), stable(second.routes)),
  );
  return {
    status: 'observed' as const,
    scope: 'reported-forwarding-interface' as const,
    interfaceNamespace: 'unqualified' as const,
    freshness: 'unqualified' as const,
    operationalAcceptance: 'unknown' as const,
    contractFingerprint: second.contractFingerprint,
    evidenceSha256: canonicalSha256(stable(second.routes)),
    routeCount: second.routes.length,
    observationRequests: expectedReads.length * 2,
  };
}

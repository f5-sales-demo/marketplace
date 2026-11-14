import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  captureAzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
} from './network-update';
import type { AzureCePlan } from './types';

/** Azure REST 2022-01-01 EffectiveRouteListResult, public source commit
 * ba3eef39e5be55cd5ed1a2e5c6c9bb1a17c36b9a. The installed CLI awaits the POST LRO.
 * Route activity is distinct from CE operational link state; no original sample timestamp is provided.
 */
export interface AzureEffectiveRoute {
  name?: string;
  source: 'Unknown' | 'User' | 'VirtualNetworkGateway' | 'Default';
  state: 'Active' | 'Invalid';
  addressPrefix: string[];
  nextHopIpAddress: string[];
  nextHopType: 'VirtualNetworkGateway' | 'VnetLocal' | 'Internet' | 'VirtualAppliance' | 'None';
  disableBgpRoutePropagation?: boolean;
}
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure effective route evidence: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Record<string, unknown>;
}
function cidr(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const [address, prefix, extra] = value.split('/'),
    family = isIP(address);
  return (
    !!family &&
    extra === undefined &&
    /^(?:0|[1-9][0-9]{0,2})$/.test(prefix ?? '') &&
    Number(prefix) <= (family === 4 ? 32 : 128)
  );
}
function strings(value: unknown, valid: (item: unknown) => boolean): string[] {
  require(Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && valid(item)) &&
    new Set(value).size === value.length, 'missing, malformed or duplicate array');
  return [...value] as string[];
}
export function parseAzureEffectiveRoutes(raw: unknown): AzureEffectiveRoute[] {
  const response = object(raw);
  require((response.nextLink === undefined || response.nextLink === null || response.nextLink === '') &&
    !['error', 'errors', 'nextPageToken'].some((key) => response[key] !== undefined && response[key] !== null) &&
    Array.isArray(response.value), 'incomplete terminal route inventory');
  const routes = response.value.map((rawRoute) => {
    const row = object(rawRoute);
    require(typeof row.source === 'string' &&
      typeof row.state === 'string' &&
      typeof row.nextHopType === 'string' &&
      ['Unknown', 'User', 'VirtualNetworkGateway', 'Default'].includes(row.source) &&
      ['Active', 'Invalid'].includes(row.state) &&
      ['VirtualNetworkGateway', 'VnetLocal', 'Internet', 'VirtualAppliance', 'None'].includes(
        row.nextHopType,
      ), 'unsupported route source, activity or next hop');
    require(row.name === undefined ||
      (typeof row.name === 'string' &&
        row.name.trim() &&
        ![...row.name].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )), 'malformed route name');
    require(row.disableBgpRoutePropagation === undefined ||
      typeof row.disableBgpRoutePropagation === 'boolean', 'malformed propagation flag');
    const addressPrefix = strings(row.addressPrefix, cidr),
      nextHopIpAddress = strings(row.nextHopIpAddress, (value) => typeof value === 'string' && isIP(value) !== 0);
    require(addressPrefix.length > 0 &&
      (row.nextHopType !== 'VirtualAppliance' ||
        nextHopIpAddress.length > 0), 'incomplete route destination or appliance');
    return {
      ...(row.name !== undefined ? { name: row.name as string } : {}),
      source: row.source as AzureEffectiveRoute['source'],
      state: row.state as AzureEffectiveRoute['state'],
      addressPrefix,
      nextHopIpAddress,
      nextHopType: row.nextHopType as AzureEffectiveRoute['nextHopType'],
      ...(row.disableBgpRoutePropagation !== undefined
        ? { disableBgpRoutePropagation: row.disableBgpRoutePropagation as boolean }
        : {}),
    };
  });
  const keys = routes.map((row) =>
    canonicalSha256({
      ...row,
      name: undefined,
      addressPrefix: row.addressPrefix.toSorted(),
      nextHopIpAddress: row.nextHopIpAddress.toSorted(),
    }),
  );
  require(new Set(keys).size === routes.length, 'duplicate route observation');
  return routes;
}

/** Read-only inventory for an exact NIC resolved from the owning network-update plan.
 * No route expectation is inferred from returned rows. A combined observer must bind those
 * independently and qualify the reviewed traffic-source NIC separately.
 */
export async function collectAzureNetworkEffectiveRoutes(
  source: AzureCePlan,
  expected: AzureNetworkUpdateInventory,
  selection: { node: number; index: number },
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const plan = structuredClone(source),
    inventory = structuredClone(expected),
    selector = structuredClone(selection);
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, inventory);
  require(Number.isInteger(selector.node) &&
    Number.isInteger(selector.index) &&
    Object.keys(selector).sort().join(',') === 'index,node', 'resolved node/NIC selector required');
  const nic = inventory.nodes[String(selector.node)]?.nics[String(selector.index)];
  require(nic && plan.nics.some((row) => row.index === selector.index), 'selected owned NIC unavailable');
  const base = {
    schemaVersion: 1,
    scope: 'azure-nic-effective-route-inventory' as const,
    planSha256: plan.planSha256,
    node: selector.node,
    index: selector.index,
    nic,
    collectedAt: new Date().toISOString(),
    freshness: 'unqualified' as const,
    forwarding: 'unknown' as const,
    interfaceState: 'unknown' as const,
  };
  const execute = api.exec;
  require(typeof execute === 'function', 'Azure executor unavailable');
  const transport: AzExecApi = {
    async exec(command, args, options) {
      require(api.exec === execute, 'Azure executor changed');
      const result = await execute.call(api, command, args, options);
      require(api.exec === execute, 'Azure executor changed');
      return result;
    },
  };
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async <T>(task: () => Promise<T>) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  let phase = 'initial-cloud-identity';
  try {
    const cloud = async () => {
      const current = await bounded(() => captureAzureNetworkUpdateInventory(plan, transport, deadline));
      require(canonicalSha256(current.nodes) === canonicalSha256(inventory.nodes), 'current NIC/cloud owner changed');
    };
    const read = async () => {
      const result = await bounded(() =>
        transport.exec(
          'az',
          [
            'network',
            'nic',
            'show-effective-route-table',
            '--ids',
            nic.resourceId,
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ],
          { signal: deadline },
        ),
      );
      require(result.exitCode === 0, 'route observation unavailable');
      return parseAzureEffectiveRoutes(JSON.parse(result.stdout));
    };
    await cloud();
    phase = 'effective-routes';
    const first = await read(),
      second = await read();
    const stable = (rows: AzureEffectiveRoute[]) =>
      rows
        .map((row) =>
          canonicalSha256({
            ...row,
            addressPrefix: row.addressPrefix.toSorted(),
            nextHopIpAddress: row.nextHopIpAddress.toSorted(),
          }),
        )
        .toSorted();
    require(canonicalSha256(stable(first)) === canonicalSha256(stable(second)), 'route inventory changed');
    phase = 'final-cloud-identity';
    await cloud();
    deadline.throwIfAborted();
    return { ...base, status: 'observed' as const, routes: second, reason: 'route-inventory-only' };
  } catch {
    deadline.throwIfAborted();
    return { ...base, status: 'unknown' as const, routes: [] as AzureEffectiveRoute[], reason: `${phase}-unverified` };
  }
}

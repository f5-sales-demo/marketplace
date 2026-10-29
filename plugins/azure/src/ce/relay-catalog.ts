import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureRelayCatalog, type AzureRelaySelection, compileAzureRelayPlan } from './relay-plan';
import type { AzureCePlan, AzureCeVmSizeObservation } from './types';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay catalog: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed observation');
  const result = value as Json;
  require(!['nextLink', 'nextPageToken', 'error', 'errors', 'NextToken'].some(
    (key) => result[key],
  ), 'partial or failed observation');
  return result;
};
const same = (value: unknown, expected: string) =>
  typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();

export interface AzureRelayResolvedCatalog extends AzureRelayCatalog {
  provenance: {
    method: 'azure-cli-live';
    sourcePlanSha256: string;
    observedAt: string;
    reads: Array<{ command: 'az'; args: string[]; responseSha256: string; observedAt: string }>;
  };
}

/** Exact read-only catalog resolution. Collector time does not establish CE publication freshness. */
export async function resolveAzureLinuxHostCatalog(
  source: AzureCePlan,
  selection: Pick<AzureRelaySelection, 'hostImage' | 'vmSize'>,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<AzureRelayResolvedCatalog> {
  verifyAzureCePlan(source);
  signal?.throwIfAborted();
  require(source.intent.operation === 'deploy' &&
    source.routing.mode === 'route-server', 'owning Route Server creation plan required');
  const image = selection?.hostImage;
  const safe = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
  require(image &&
    [image.publisher, image.offer, image.sku].every((value) => typeof value === 'string' && safe.test(value)) &&
    /^\d+\.\d+\.\d+$/.test(image.version), 'resolved exact host image required');
  require(typeof selection.vmSize === 'string' && safe.test(selection.vmSize), 'resolved VM size required');
  const urn = [image.publisher, image.offer, image.sku, image.version].join(':');
  const imageId = `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${image.publisher}/artifacttypes/vmimage/offers/${image.offer}/skus/${image.sku}/versions/${image.version}`;
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const reads: AzureRelayResolvedCatalog['provenance']['reads'] = [];
  const read = async (args: string[]): Promise<unknown> => {
    deadline.throwIfAborted();
    const fullArgs = [...args, '--subscription', source.subscription.id, '--output', 'json'];
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let raw: Awaited<ReturnType<AzExecApi['exec']>>;
    try {
      raw = await Promise.race([api.exec('az', fullArgs, { signal: deadline }), abort.promise]);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    deadline.throwIfAborted();
    require(raw.exitCode === 0, 'cloud catalog read unavailable');
    let response: unknown;
    try {
      response = JSON.parse(raw.stdout);
    } catch {
      throw Error('Azure relay catalog: malformed JSON');
    }
    reads.push({
      command: 'az',
      args: fullArgs,
      responseSha256: canonicalSha256(response),
      observedAt: new Date().toISOString(),
    });
    return response;
  };
  const account = object(await read(['account', 'show']));
  require(same(account.id, source.subscription.id) &&
    same(account.tenantId, source.subscription.tenantId) &&
    account.environmentName === 'AzureCloud', 'subscription, tenant or cloud differs');
  const host = object(await read(['vm', 'image', 'show', '--urn', urn, '--location', source.region]));
  require(same(host.id, imageId) &&
    object(host.osDiskImage).operatingSystem === 'Linux' &&
    host.architecture === 'x64', 'exact Linux host image identity differs');
  const rawSkus = await read(['vm', 'list-skus', '--size', selection.vmSize, '--location', source.region, '--all']);
  require(Array.isArray(rawSkus), 'complete SKU list required');
  const skus = (rawSkus as unknown[])
    .map(object)
    .filter((sku) => same(sku.name, selection.vmSize) && same(sku.resourceType, 'virtualMachines'));
  require(skus.length === 1, 'SKU missing or ambiguous');
  const sku = skus[0];
  require(Array.isArray(sku.locations) &&
    sku.locations.some((location) => same(location, source.region)), 'SKU region differs');
  require(Array.isArray(sku.locationInfo), 'SKU regional details missing');
  const infos = (sku.locationInfo as unknown[]).map(object).filter((info) => same(info.location, source.region));
  require(infos.length === 1, 'SKU regional details missing or ambiguous');
  require(Array.isArray(sku.restrictions) &&
    Array.isArray(sku.capabilities), 'SKU restrictions or capabilities missing');
  // Regional restrictions block a regional relay. Zone-only restrictions do not block an unzoned VM.
  const restricted = (sku.restrictions as unknown[]).map(object).some((restriction) => {
    if (restriction.type === 'Zone') return false;
    if (restriction.type !== 'Location') return true;
    const info = restriction.restrictionInfo === undefined ? undefined : object(restriction.restrictionInfo);
    const locations = info?.locations ?? restriction.values;
    return (
      !Array.isArray(locations) || locations.length === 0 || locations.some((location) => same(location, source.region))
    );
  });
  const capabilities = (sku.capabilities as unknown[]).map(object);
  const architectures = capabilities.filter((capability) => same(capability.name, 'CpuArchitectureType'));
  require(architectures.length === 1 && architectures[0].value === 'x64', 'host SKU architecture missing or differs');
  const number = (name: string, integer: boolean) => {
    const matches = capabilities.filter((capability) => same(capability.name, name));
    require(matches.length === 1 &&
      typeof matches[0].value === 'string' &&
      /^\d+(?:\.\d+)?$/.test(matches[0].value), 'SKU capability missing or ambiguous');
    const value = Number(matches[0].value);
    require(Number.isFinite(value) && value > 0 && (!integer || Number.isInteger(value)), 'invalid SKU capability');
    return value;
  };
  const zones = infos[0].zones ?? [];
  require(Array.isArray(zones) &&
    zones.every((zone) => typeof zone === 'string' && /^[1-9]\d*$/.test(zone)) &&
    new Set(zones).size === zones.length, 'invalid SKU zones');
  const size: AzureCeVmSizeObservation = {
    name: selection.vmSize,
    maxNics: number('MaxNetworkInterfaces', true),
    vCpus: number('vCPUs', true),
    memoryGb: number('MemoryGB', false),
    zones: (zones as string[]).toSorted(),
    restricted,
  };
  const catalog: AzureRelayResolvedCatalog = {
    region: source.region,
    image: { id: host.id as string, urn, osType: 'Linux', architecture: 'amd64' },
    vmSizes: [size],
    provenance: {
      method: 'azure-cli-live',
      sourcePlanSha256: source.planSha256,
      observedAt: new Date().toISOString(),
      reads,
    },
  };
  deadline.throwIfAborted();
  return catalog;
}

export async function resolveAzureRelayCatalog(
  source: AzureCePlan,
  selection: AzureRelaySelection,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<AzureRelayResolvedCatalog> {
  const catalog = await resolveAzureLinuxHostCatalog(source, selection, api, signal);
  compileAzureRelayPlan(source, selection, catalog);
  return catalog;
}

import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureCeAction, AzureCePlan } from './types';

function require(value: unknown): asserts value {
  if (!value) throw Error('Greenfield UDR ownership is unavailable or differs from the approved plan');
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
/** Associate only an explicitly approved new subnet, with both current parent and table ownership. */
export async function assertAzureGreenfieldUdrAssociationOwnership(
  source: AzureCePlan,
  selected: AzureCeAction,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<void> {
  const plan = structuredClone(source),
    action = structuredClone(selected);
  verifyAzureCePlan(plan);
  const udr = plan.routing.udr;
  require(
    udr &&
      plan.intent.operation === 'deploy' &&
      plan.routing.mode === 'udr' &&
      action.kind === 'route-association-update' &&
      plan.actions.some((row) => canonicalSha256(row) === canonicalSha256(action)),
  );
  const vnetId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${plan.deploymentName}-vnet`,
    tableId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/routeTables/${plan.deploymentName}-rt`;
  const nic = plan.nics.find(
    (row) =>
      udr.subnetNames.includes(row.subnet.name ?? '') && action.resourceId === `${vnetId}/subnets/${row.subnet.name}`,
  );
  require(
    nic &&
      nic.subnet.mode === 'greenfield' &&
      plan.actions.some((row) => row.kind === 'subnet-create' && row.resourceId === action.resourceId),
  );
  const execute = api.exec,
    deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const read = async (args: string[], id: string) => {
    deadline.throwIfAborted();
    require(api.exec === execute);
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([
        execute.call(
          api,
          'az',
          [...args, 'show', '--ids', id, '--subscription', plan.subscription.id, '--output', 'json'],
          { signal: deadline },
        ),
        abort.promise,
      ]);
      deadline.throwIfAborted();
      require(api.exec === execute && result.exitCode === 0);
      let raw: unknown;
      try {
        raw = JSON.parse(result.stdout);
      } catch {
        throw Error('Greenfield UDR ownership evidence is malformed');
      }
      const row = object(raw);
      require(row.id === id && row.provisioningState === 'Succeeded' && !row.nextLink && !row.error && !row.errors);
      return row;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  for (const [args, id] of [
    [['network', 'vnet'], vnetId],
    [['network', 'route-table'], tableId],
  ] as const) {
    const value = await read([...args], id),
      tags = object(value.tags);
    require(value.location === plan.region);
    for (const [key, expected] of Object.entries({
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': plan.engine,
      'xcsh-deployment-id': plan.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
    }))
      require(tags[key] === expected);
  }
  const subnet = await read(['network', 'vnet', 'subnet'], action.resourceId as string);
  const prefixes =
    subnet.addressPrefixes ?? (typeof subnet.addressPrefix === 'string' ? [subnet.addressPrefix] : undefined);
  require(
    Array.isArray(prefixes) &&
      prefixes.length === 1 &&
      prefixes[0] === nic.subnet.cidr &&
      (subnet.addressPrefix === undefined || subnet.addressPrefix === nic.subnet.cidr) &&
      (subnet.routeTable === undefined || subnet.routeTable === null || object(subnet.routeTable).id === tableId),
  );
}

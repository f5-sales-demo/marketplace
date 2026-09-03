import type { AzExecApi } from '../az/exec';
import { execAzJson } from '../az/exec';
import { formatVmTable } from '../az/formatters';
import type { PluginInterface } from '../az/types';
import { RESOURCE_GROUP_PATTERN, SUBSCRIPTION_ID_PATTERN, SUBSCRIPTION_NAME_PATTERN } from '../az/types';
import azVmDescription from '../prompts/az-vm-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, normalizeVm, textResult } from './shared';

const BASE_VM_FIELDS = [
  'id:id',
  'name:name',
  'location:location',
  'resourceGroup:resourceGroup',
  'vmSize:hardwareProfile.vmSize',
  'provisioningState:provisioningState',
  'osType:storageProfile.osDisk.osType',
];

export function vmListProjection(includePowerState: boolean, includeNetworkIdentifiers: boolean): string {
  const fields = [...BASE_VM_FIELDS];
  if (includePowerState) fields.push('powerState:powerState');
  if (includeNetworkIdentifiers) fields.push('publicIps:to_array(publicIps)', 'fqdns:to_array(fqdns)');
  return `[].{${fields.join(',')}}`;
}

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createAzVmListTool(pi: PluginInterface, makeApi: (cwd: string) => AzExecApi = makeExecApi) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    resource_group: Type.Optional(Type.String({ description: 'Filter by resource group' })),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    include_power_state: Type.Optional(Type.Boolean({ description: 'Include VM runtime power state (default: true)' })),
    include_network_identifiers: Type.Optional(
      Type.Boolean({
        description: 'Include public IP addresses and FQDNs only when explicitly requested (default: false)',
      }),
    ),
  });

  return {
    name: 'az_vm_list',
    label: 'Azure Virtual Machines',
    description: azVmDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: {
        resource_group?: string;
        subscription?: string;
        include_power_state?: boolean;
        include_network_identifiers?: boolean;
      },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'az_vm_list' as const };

      if (params.resource_group && !RESOURCE_GROUP_PATTERN.test(params.resource_group)) {
        return errorResult(
          `Error: invalid resource group "${params.resource_group}". Only alphanumeric characters, periods, underscores, hyphens, and parentheses are allowed.`,
          base,
        );
      }

      if (params.subscription) {
        const isUuid = SUBSCRIPTION_ID_PATTERN.test(params.subscription);
        const isName = SUBSCRIPTION_NAME_PATTERN.test(params.subscription);
        if (!isUuid && !isName) {
          return errorResult(`Error: invalid subscription "${params.subscription}".`, base);
        }
      }

      const api = makeApi(ctx.cwd);
      const args = ['vm', 'list'];
      if (params.resource_group) args.push('--resource-group', params.resource_group);
      if (params.subscription) args.push('--subscription', params.subscription);
      const policy = {
        includePowerState: params.include_power_state ?? true,
        includeNetworkIdentifiers: params.include_network_identifiers === true,
      };
      if (policy.includePowerState || policy.includeNetworkIdentifiers) args.push('--show-details');
      args.push('--query', vmListProjection(policy.includePowerState, policy.includeNetworkIdentifiers));

      try {
        const raw = await execAzJson<Record<string, unknown>[]>(api, args, signal);
        const vms = raw.map((vm) => normalizeVm(vm, policy));
        return textResult(formatVmTable(vms, policy), { ...base, vms });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

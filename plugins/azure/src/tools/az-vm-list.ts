import { execAzJson } from '../az/exec';
import { formatVmTable } from '../az/formatters';
import type { PluginInterface } from '../az/types';
import { RESOURCE_GROUP_PATTERN, SUBSCRIPTION_ID_PATTERN, SUBSCRIPTION_NAME_PATTERN } from '../az/types';
import azVmDescription from '../prompts/az-vm-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, normalizeVm, textResult } from './shared';

export function createAzVmListTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    resource_group: Type.Optional(Type.String({ description: 'Filter by resource group' })),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    show_details: Type.Optional(Type.Boolean({ description: 'Include public IP, FQDN, and power state (slower)' })),
  });

  return {
    name: 'az_vm_list',
    label: 'Azure Virtual Machines',
    description: azVmDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { resource_group?: string; subscription?: string; show_details?: boolean },
      _signal: unknown,
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

      const api = makeExecApi(ctx.cwd);
      const args = ['vm', 'list'];
      if (params.resource_group) args.push('--resource-group', params.resource_group);
      if (params.subscription) args.push('--subscription', params.subscription);
      if (params.show_details) args.push('--show-details');

      try {
        const raw = await execAzJson<Record<string, unknown>[]>(api, args);
        const vms = raw.map(normalizeVm);
        return textResult(formatVmTable(vms), { ...base, vms });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

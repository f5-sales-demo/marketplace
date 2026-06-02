import { execAzJson } from '../az/exec';
import { formatResourceTable } from '../az/formatters';
import type { PluginInterface } from '../az/types';
import {
  RESOURCE_GROUP_PATTERN,
  RESOURCE_TYPE_PATTERN,
  SUBSCRIPTION_ID_PATTERN,
  SUBSCRIPTION_NAME_PATTERN,
} from '../az/types';
import azResourceDescription from '../prompts/az-resource-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, normalizeResource, textResult } from './shared';

export function createAzResourceListTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    resource_group: Type.String({ description: 'Resource group name (required to avoid listing entire subscription)' }),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    resource_type: Type.Optional(
      Type.String({ description: 'Filter by type (e.g. Microsoft.Compute/virtualMachines)' }),
    ),
  });

  return {
    name: 'az_resource_list',
    label: 'Azure Resources',
    description: azResourceDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { resource_group: string; subscription?: string; resource_type?: string },
      _signal: unknown,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'az_resource_list' as const };

      if (!params.resource_group || !RESOURCE_GROUP_PATTERN.test(params.resource_group)) {
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

      if (params.resource_type && !RESOURCE_TYPE_PATTERN.test(params.resource_type)) {
        return errorResult(
          `Error: invalid resource type "${params.resource_type}". Use format like Microsoft.Compute/virtualMachines.`,
          base,
        );
      }

      const api = makeExecApi(ctx.cwd);
      const args = ['resource', 'list', '--resource-group', params.resource_group];
      if (params.subscription) args.push('--subscription', params.subscription);
      if (params.resource_type) args.push('--resource-type', params.resource_type);

      try {
        const raw = await execAzJson<Record<string, unknown>[]>(api, args);
        const resources = raw.map(normalizeResource);
        return textResult(formatResourceTable(resources), { ...base, resources });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

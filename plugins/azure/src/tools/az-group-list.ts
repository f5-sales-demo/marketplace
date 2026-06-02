import { execAzJson } from '../az/exec';
import { formatResourceGroupTable } from '../az/formatters';
import type { PluginInterface } from '../az/types';
import { RESOURCE_GROUP_PATTERN, SUBSCRIPTION_ID_PATTERN, SUBSCRIPTION_NAME_PATTERN, TAG_PATTERN } from '../az/types';
import azGroupDescription from '../prompts/az-group-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, normalizeResourceGroup, textResult } from './shared';

export function createAzGroupListTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    action: Type.Union([Type.Literal('list'), Type.Literal('show')], {
      description: 'list = all resource groups, show = single resource group details',
    }),
    name: Type.Optional(Type.String({ description: 'Resource group name (required for show)' })),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    tag: Type.Optional(Type.String({ description: 'Filter by tag in key[=value] format' })),
  });

  return {
    name: 'az_group_list',
    label: 'Azure Resource Groups',
    description: azGroupDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { action?: string; name?: string; subscription?: string; tag?: string },
      _signal: unknown,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'az_group_list' as const, action: params.action };

      if (params.name && !RESOURCE_GROUP_PATTERN.test(params.name)) {
        return errorResult(
          `Error: invalid resource group name "${params.name}". Only alphanumeric characters, periods, underscores, hyphens, and parentheses are allowed.`,
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

      if (params.tag && !TAG_PATTERN.test(params.tag)) {
        return errorResult(
          `Error: invalid tag "${params.tag}". Use format key[=value] with safe characters only.`,
          base,
        );
      }

      const api = makeExecApi(ctx.cwd);

      try {
        if (params.action === 'show') {
          if (!params.name) {
            return errorResult('Error: --name is required for show action.', base);
          }
          const args = ['group', 'show', '--name', params.name];
          if (params.subscription) args.push('--subscription', params.subscription);
          const raw = await execAzJson<Record<string, unknown>>(api, args);
          const group = normalizeResourceGroup(raw);
          return textResult(formatResourceGroupTable([group]), { ...base, resourceGroups: [group] });
        }

        const args = ['group', 'list'];
        if (params.subscription) args.push('--subscription', params.subscription);
        if (params.tag) args.push('--tag', params.tag);
        const raw = await execAzJson<Record<string, unknown>[]>(api, args);
        const groups = raw.map(normalizeResourceGroup);
        return textResult(formatResourceGroupTable(groups), { ...base, resourceGroups: groups });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

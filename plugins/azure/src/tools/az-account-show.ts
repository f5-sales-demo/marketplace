import { execAzJson } from '../az/exec';
import { formatSubscriptionDetail, formatSubscriptionTable } from '../az/formatters';
import type { PluginInterface } from '../az/types';
import { SUBSCRIPTION_ID_PATTERN, SUBSCRIPTION_NAME_PATTERN } from '../az/types';
import azAccountDescription from '../prompts/az-account-show.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, normalizeSubscription, textResult } from './shared';

export function createAzAccountShowTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    action: Type.Union([Type.Literal('show'), Type.Literal('list')], {
      description: 'show = current subscription, list = all subscriptions',
    }),
    subscription: Type.Optional(Type.String({ description: 'Filter by subscription name or ID' })),
  });

  return {
    name: 'az_account_show',
    label: 'Azure Account',
    description: azAccountDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { action?: string; subscription?: string },
      _signal: unknown,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'az_account_show' as const, action: params.action };

      if (params.subscription) {
        const isUuid = SUBSCRIPTION_ID_PATTERN.test(params.subscription);
        const isName = SUBSCRIPTION_NAME_PATTERN.test(params.subscription);
        if (!isUuid && !isName) {
          return errorResult(
            `Error: invalid subscription "${params.subscription}". Only alphanumeric characters, spaces, dots, underscores, and hyphens are allowed.`,
            base,
          );
        }
      }

      const api = makeExecApi(ctx.cwd);

      try {
        if (params.action === 'list') {
          const raw = await execAzJson<Record<string, unknown>[]>(api, ['account', 'list']);
          let subs = raw.map(normalizeSubscription);
          if (params.subscription) {
            const filter = params.subscription.toLowerCase();
            subs = subs.filter((s) => s.name.toLowerCase().includes(filter) || s.id.toLowerCase().includes(filter));
          }
          return textResult(formatSubscriptionTable(subs), { ...base, subscriptions: subs });
        }

        const args = ['account', 'show'];
        if (params.subscription) args.push('--subscription', params.subscription);
        const raw = await execAzJson<Record<string, unknown>>(api, args);
        const sub = normalizeSubscription(raw);
        return textResult(formatSubscriptionDetail(sub), { ...base, subscriptions: [sub] });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

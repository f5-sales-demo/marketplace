import type { GcloudExecApi } from '../gcloud/exec';
import { execGcloudJson } from '../gcloud/exec';
import { formatConfigDetail, normalizeConfig } from '../gcloud/formatters';
import type { PluginInterface } from '../gcloud/types';
import gcloudConfigListDescription from '../prompts/gcloud-config-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createGcloudConfigListTool(pi: PluginInterface, makeApi: (cwd: string) => GcloudExecApi = makeExecApi) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({});

  return {
    name: 'gcloud_config_list',
    label: 'Google Cloud Config',
    description: gcloudConfigListDescription,
    parameters,
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'gcloud_config_list' as const };
      const api = makeApi(ctx.cwd);
      const args = ['config', 'list'];

      try {
        const raw = await execGcloudJson<Record<string, unknown>>(api, args, signal);
        const config = normalizeConfig(raw);
        return textResult(formatConfigDetail(config), { ...base, config });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}

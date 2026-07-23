import type { PluginInterface } from '../gcloud/types';
import { HELP_PATH_PATTERN } from '../gcloud/types';
import gcloudHelpDescription from '../prompts/gcloud-help.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

export function createGcloudHelpTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description:
          'Command path without "gcloud" prefix, e.g. "compute instances" or "projects". Empty for top-level help.',
      }),
    ),
  });

  return {
    name: 'gcloud_help',
    label: 'Google Cloud CLI Help',
    description: gcloudHelpDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { command_path?: string },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'gcloud_help' as const };
      const commandPath = params.command_path?.trim() ?? '';

      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, digits, hyphens, and spaces are allowed.`,
          base,
        );
      }

      const parts = commandPath.length > 0 ? commandPath.split(' ').filter(Boolean) : [];
      // Belt-and-suspenders: the charset regex admits an interior/leading '-'
      // (e.g. "compute -foo"), so reject any dash-led part that could be read as a flag.
      if (parts.some((p) => p.startsWith('-'))) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Command path parts must not start with "-".`,
          base,
        );
      }

      // Help output is plain text; do NOT append --format=json.
      const args = [...parts, '--help'];
      const api = makeExecApi(ctx.cwd);

      try {
        const result = await api.exec('gcloud', args, { signal });
        if (result.exitCode !== 0) {
          const msg = result.stderr || result.stdout || `gcloud ${commandPath} --help failed (exit ${result.exitCode})`;
          return errorResult(`Error: ${msg}`, { ...base, errorType: 'exec_error' });
        }
        const output = result.stdout || result.stderr;
        if (!output.trim()) {
          return errorResult(`No help output for "gcloud ${commandPath}".`, { ...base, errorType: 'exec_error' });
        }
        return textResult(output, base);
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

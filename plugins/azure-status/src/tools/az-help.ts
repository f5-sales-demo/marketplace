import type { PluginInterface } from '../az/types';
import { HELP_PATH_PATTERN } from '../az/types';
import azHelpDescription from '../prompts/az-help.md' with { type: 'text' };
import { errorResult, makeExecApi, textResult } from './shared';

export function createAzHelpTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description:
          'Command path without "az" prefix, e.g. "network vnet" or "storage blob". Empty for top-level help.',
      }),
    ),
  });

  return {
    name: 'az_help',
    label: 'Azure CLI Help',
    description: azHelpDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { command_path?: string },
      _signal: unknown,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'az_help' as const };
      const commandPath = params.command_path?.trim() ?? '';

      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
          base,
        );
      }

      const api = makeExecApi(ctx.cwd);
      const parts = commandPath.length > 0 ? commandPath.split(' ').filter(Boolean) : [];
      const args = [...parts, '--help'];

      try {
        const result = await api.exec('az', args);
        if (result.exitCode !== 0) {
          const msg = result.stderr || result.stdout || `az ${commandPath} --help failed (exit ${result.exitCode})`;
          return errorResult(`Error: ${msg}`, { ...base, errorType: 'exec_error' });
        }
        const output = result.stdout || result.stderr;
        if (!output.trim()) {
          return errorResult(`No help output for "az ${commandPath}".`, base);
        }
        return textResult(output, base);
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: 'exec_error',
        });
      }
    },
  };
}

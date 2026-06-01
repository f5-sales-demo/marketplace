import type { PluginInterface } from '../az/types';
import { SAFE_ARG_PATTERN } from '../az/types';
import azExecDescription from '../prompts/az-exec.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

const MAX_OUTPUT_LENGTH = 50000;

export function createAzExecTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "az" itself)' }), {
      description: 'Command arguments as array, e.g. ["webapp", "list", "--resource-group", "myRG"]',
    }),
  });

  return {
    name: 'az_exec',
    label: 'Azure CLI Execute',
    description: azExecDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { args: string[] },
      _signal: unknown,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'az_exec' as const };

      if (!params.args || params.args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide az subcommand and flags.', base);
      }

      for (const arg of params.args) {
        if (!SAFE_ARG_PATTERN.test(arg)) {
          return errorResult(
            `Error: unsafe argument "${arg}". Shell metacharacters (;|$\`&&||) are not allowed.`,
            base,
          );
        }
      }

      const api = makeExecApi(ctx.cwd);
      const args = [...params.args, '--output', 'json'];

      try {
        const result = await api.exec('az', args);
        if (result.exitCode !== 0) {
          return errorResult(`az command failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`, {
            ...base,
            errorType: 'exec_error',
          });
        }
        let output = result.stdout;
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.slice(0, MAX_OUTPUT_LENGTH) + `\n\n[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
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

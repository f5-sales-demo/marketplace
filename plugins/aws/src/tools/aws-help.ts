import { helpArgs } from '../aws/arguments';
import type { AwsExecApi } from '../aws/exec';
import { detectAwsError } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import { HELP_PATH_PATTERN } from '../aws/types';
import awsHelpDescription from '../prompts/aws-help.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createAwsHelpTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description: 'Command path without "aws" prefix, e.g. "ec2 describe-instances". Empty for top-level help.',
      }),
    ),
  });

  return {
    name: 'aws_help',
    label: 'AWS CLI Help',
    description: awsHelpDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { command_path?: string },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'aws_help' as const };
      const commandPath = params.command_path?.trim() ?? '';

      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
          base,
        );
      }

      const parts = commandPath.length > 0 ? commandPath.split(' ').filter(Boolean) : [];
      // Belt-and-suspenders: the charset regex admits an interior/leading '-'
      // (e.g. "iam -foo"), so reject any dash-led part that could be read as a flag.
      if (parts.some((p) => p.startsWith('-'))) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Command path parts must not start with "-".`,
          base,
        );
      }

      const api = makeApi(ctx.cwd);
      // NOTE: aws uses the `help` subcommand, NOT a `--help` flag.
      const args = helpArgs(params.command_path);

      try {
        const result = await api.exec('aws', args, { signal });
        if (result.exitCode !== 0) throw detectAwsError(result.stderr || result.stdout, result.exitCode);
        const output = result.stdout || result.stderr;
        if (!output.trim()) {
          return errorResult(`No help output for "aws ${commandPath}".`, { ...base, errorType: 'exec_error' });
        }
        return textResult(output, base);
      } catch (err) {
        if (err instanceof Error && ['AbortError', 'ToolAbortError'].includes(err.name)) throw err;
        return errorResult(`Error: ${renderError(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

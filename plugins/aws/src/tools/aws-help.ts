import type { PluginInterface } from '../aws/types';
import { HELP_PATH_PATTERN } from '../aws/types';
import awsHelpDescription from '../prompts/aws-help.md' with { type: 'text' };
import { errorResult, makeExecApi, textResult } from './shared';

export function createAwsHelpTool(pi: PluginInterface) {
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

      const api = makeExecApi(ctx.cwd);
      // NOTE: aws uses the `help` subcommand, NOT a `--help` flag.
      const args = [...parts, 'help'];

      try {
        const result = await api.exec('aws', args, { signal });
        const output = result.stdout || result.stderr;
        if (!output.trim()) {
          return errorResult(`No help output for "aws ${commandPath}".`, { ...base, errorType: 'exec_error' });
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

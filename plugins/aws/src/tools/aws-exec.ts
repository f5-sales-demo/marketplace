import { detectAwsError } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import awsExecDescription from '../prompts/aws-exec.md' with { type: 'text' };
import { buildAwsArgs, findMutation } from './aws-exec-guard';
import { errorResult, hasControlChars, makeExecApi, textResult } from './shared';

const MAX_OUTPUT_LENGTH = 50000;

export function createAwsExecTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "aws" itself)' }), {
      description:
        'aws service, operation, and flags as an array, e.g. ["ec2", "describe-instances", "--output", "json"]',
    }),
  });

  return {
    name: 'aws_exec',
    label: 'AWS CLI Execute',
    description: awsExecDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { args: string[] },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'aws_exec' as const };
      const args = params.args ?? [];

      if (args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide an aws service and operation.', base);
      }

      // `aws` is spawned argv-style with NO shell, so shell metacharacters are inert
      // (the argv boundary is the real injection control). We therefore do NOT strip
      // metacharacters — doing so would break valid `--query` (JMESPath) syntax such
      // as `||`, backtick literals, and pipes. Only NUL/control bytes, which malform
      // an execve argv, are rejected.
      for (const arg of args) {
        if (hasControlChars(arg)) {
          return errorResult(
            `Error: argument contains a control character and cannot be passed to aws: "${arg}"`,
            base,
          );
        }
      }

      const mutation = findMutation(args);
      if (mutation.blocked) {
        return errorResult(`Error: ${mutation.reason}`, base);
      }

      const api = makeExecApi(ctx.cwd);
      const builtArgs = buildAwsArgs(args);
      const result = await api.exec('aws', builtArgs, { signal });
      if (result.exitCode !== 0) {
        throw detectAwsError(result.stderr, result.exitCode);
      }

      let output = result.stdout;
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = `${output.slice(0, MAX_OUTPUT_LENGTH)}\n\n[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
      }
      return textResult(output, base);
    },
  };
}

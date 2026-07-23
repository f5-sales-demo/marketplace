import { detectGcloudError } from '../gcloud/exec';
import type { PluginInterface } from '../gcloud/types';
import gcloudExecDescription from '../prompts/gcloud-exec.md' with { type: 'text' };
import { buildGcloudArgs, checkGcloud } from './gcloud-exec-guard';
import { detectErrorType, errorResult, hasControlChars, makeExecApi, textResult } from './shared';

const MAX_OUTPUT_LENGTH = 50000;

export function createGcloudExecTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "gcloud" itself)' }), {
      description: 'gcloud group, verb, and flags as an array, e.g. ["compute", "instances", "list", "--format=json"]',
    }),
  });

  return {
    name: 'gcloud_exec',
    label: 'Google Cloud CLI Execute',
    description: gcloudExecDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { args: string[] },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'gcloud_exec' as const };
      const args = params.args ?? [];

      if (args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide a gcloud group and verb.', base);
      }

      // `gcloud` is spawned argv-style with NO shell, so shell metacharacters are inert
      // (the argv boundary is the real injection control). We therefore do NOT strip
      // metacharacters — doing so would break valid `--filter`/`--format` expressions.
      // Only NUL/control bytes, which malform an execve argv, are rejected.
      for (const arg of args) {
        if (hasControlChars(arg)) {
          return errorResult(
            `Error: argument contains a control character and cannot be passed to gcloud: "${arg}"`,
            base,
          );
        }
      }

      const c = checkGcloud(args);
      if (c.blocked) {
        return errorResult(`Error: ${c.reason}`, base);
      }

      try {
        const api = makeExecApi(ctx.cwd);
        const result = await api.exec('gcloud', buildGcloudArgs(args), { signal });
        if (result.exitCode !== 0) {
          // Classify the failure (auth / session-expired / permission / not-found) from
          // stderr so the agent gets the same errorType the typed tools surface, instead
          // of a blanket exec_error.
          return errorResult(`gcloud command failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`, {
            ...base,
            errorType: detectErrorType(detectGcloudError(result.stderr, result.exitCode)),
          });
        }
        let output = result.stdout;
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = `${output.slice(0, MAX_OUTPUT_LENGTH)}\n\n[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
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

import sfExecDescription from '../prompts/sf-exec.md' with { type: 'text' };
import { execSfRaw } from '../sf/exec';
import { findMutation } from './sf-exec-guard';
import { errorResult, hasControlChars, makeExecApi, textResult } from './shared';

const SF_EXEC_MAX_OUTPUT = 50000;

export function createSfExecTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "sf")' }), {
      description: 'sf subcommand and flags as an array, e.g. ["org", "list", "--json"]',
    }),
  });

  return {
    name: 'sf_exec',
    label: 'Salesforce CLI Execute',
    description: sfExecDescription,
    parameters,
    async execute(_toolCallId: string, params: { args: string[] }, signal: any, _onUpdate: any, ctx: { cwd: string }) {
      const base = { tool: 'sf_exec' as const };
      const args = params.args ?? [];
      if (args.length === 0) {
        return errorResult('Error: args array must not be empty.', base);
      }
      for (const a of args) {
        if (hasControlChars(a)) {
          return errorResult(`Error: argument contains a control character: "${a}"`, base);
        }
      }
      const mutation = findMutation(args);
      if (mutation.blocked) {
        return errorResult(
          `Error: ${mutation.reason}. sf_exec is read-only by default and only runs commands on its confirmed allowlist. Run write operations through an explicitly confirmed path, not sf_exec.`,
          base,
        );
      }

      const api = makeExecApi(ctx.cwd);
      const result = await execSfRaw(api, args, signal);
      let out = result.stdout;
      if (out.length > SF_EXEC_MAX_OUTPUT) {
        out = `${out.slice(0, SF_EXEC_MAX_OUTPUT)}\n\n[Output truncated]`;
      }
      return textResult(out, base);
    },
  };
}

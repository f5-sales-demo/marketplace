import { execGlab } from '../glab/exec';
import glabExecDescription from '../prompts/glab-exec.md' with { type: 'text' };
import { findMutation } from './glab-exec-guard';
import { errorResult, hasControlChars, makeExecApi, textResult } from './shared';

const GLAB_EXEC_MAX_OUTPUT = 50000;

export function createGlabExecTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "glab")' }), {
      description: 'glab subcommand and flags as an array, e.g. ["issue", "list", "--output", "json"]',
    }),
  });

  return {
    name: 'glab_exec',
    label: 'GitLab CLI Execute',
    description: glabExecDescription,
    parameters,
    async execute(_toolCallId: string, params: { args: string[] }, signal: any, _onUpdate: any, ctx: { cwd: string }) {
      const args = params.args ?? [];
      if (args.length === 0) {
        return errorResult('Error: args array must not be empty.', { tool: 'glab_exec' });
      }
      for (const a of args) {
        if (hasControlChars(a)) {
          return errorResult(`Error: argument contains a control character: "${a}"`, { tool: 'glab_exec' });
        }
      }
      const mutation = findMutation(args);
      if (mutation.blocked) {
        return errorResult(
          `Error: ${mutation.reason}. glab_exec is read-only by default. Run write operations through an explicitly confirmed path, not glab_exec.`,
          { tool: 'glab_exec' },
        );
      }

      const api = makeExecApi(ctx.cwd);
      const result = await execGlab(api, args, signal);
      let out = result.stdout;
      if (out.length > GLAB_EXEC_MAX_OUTPUT) {
        out = `${out.slice(0, GLAB_EXEC_MAX_OUTPUT)}\n\n[Output truncated]`;
      }
      return textResult(out, { tool: 'glab_exec' });
    },
  };
}

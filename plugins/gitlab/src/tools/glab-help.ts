import { execGlab, GlabAuthError } from '../glab/exec';
import glabHelpDescription from '../prompts/glab-help.md' with { type: 'text' };
import { errorResult, makeExecApi, textResult } from './shared';

// Lowercase letters, spaces, and hyphens only. This blocks shell metacharacters
// and flag smuggling at the top level; the per-part `-` guard below then rejects
// any space-split segment that would still reach glab as a flag.
const HELP_PATH_PATTERN = /^[a-z][a-z -]*$/;

export function createGlabHelpTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description: 'Command path without the "glab" prefix, e.g. "issue list" or "mr". Empty for top-level help.',
      }),
    ),
  });

  return {
    name: 'glab_help',
    label: 'GitLab CLI Help',
    description: glabHelpDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { command_path?: string },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const commandPath = params.command_path?.trim() ?? '';
      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
          { tool: 'glab_help' },
        );
      }

      const parts = commandPath.length > 0 ? commandPath.split(' ').filter(Boolean) : [];
      if (parts.some((p) => p.startsWith('-'))) {
        return errorResult("Error: command path parts must not start with '-'.", { tool: 'glab_help' });
      }

      const api = makeExecApi(ctx.cwd);
      try {
        const result = await execGlab(api, [...parts, '--help'], signal);
        const output = result.stdout || result.stderr;
        return textResult(output || `No help output for "glab ${commandPath}".`, { tool: 'glab_help' });
      } catch (err) {
        if (err instanceof GlabAuthError) return textResult((err as Error).message);
        throw err;
      }
    },
  };
}

import sfHelpDescription from '../prompts/sf-help.md' with { type: 'text' };
import { errorResult, makeExecApi, textResult } from './shared';

// Lowercase letters, spaces, colons, and hyphens only. The colon supports sf's
// `topic:command` grammar. This blocks shell metacharacters and flag smuggling at
// the top level; the per-part `-` guard below then rejects any segment (split on
// space AND ':') that would still reach sf as a flag.
const HELP_PATH_PATTERN = /^[a-z][a-z :-]*$/;

export function createSfHelpTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description:
          'Command path without the "sf" prefix, e.g. "org list", "org:display", or "org". Empty for top-level help.',
      }),
    ),
  });

  return {
    name: 'sf_help',
    label: 'Salesforce CLI Help',
    description: sfHelpDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { command_path?: string },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'sf_help' as const };
      const commandPath = params.command_path?.trim() ?? '';
      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, colons, hyphens, and spaces are allowed.`,
          base,
        );
      }

      // Split on both space and colon so sf's `topic:command` form is decomposed
      // into individual argv parts before the flag-smuggling guard runs.
      const parts = commandPath.length > 0 ? commandPath.split(/[ :]/).filter(Boolean) : [];
      if (parts.some((p) => p.startsWith('-'))) {
        return errorResult("Error: command path parts must not start with '-'.", base);
      }

      const api = makeExecApi(ctx.cwd);
      const result = await api.exec('sf', [...parts, '--help'], { signal });
      const output = result.stdout || result.stderr;
      return textResult(output || `No help output for "sf ${commandPath}".`, base);
    },
  };
}

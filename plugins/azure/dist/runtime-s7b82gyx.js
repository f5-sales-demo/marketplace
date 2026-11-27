// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { errorResult, HELP_PATH_PATTERN, helpArgs, makeExecApi, textResult } from './runtime-2139fbqg.js';

// plugins/azure/src/prompts/az-help.md
var az_help_default = `# View Azure CLI Help

Fetch help documentation for any \`az\` CLI command group or subcommand.

Use this tool to discover available commands, flags, and usage patterns for az CLI subcommands that are not covered by the embedded tool documentation.

## Usage

Pass the command path (without \`az\` prefix) to get help:

**Example:** To see \`az network vnet --help\`:

\`\`\`json
{ "command_path": "network vnet" }
\`\`\`

**Example:** To see \`az storage blob --help\`:

\`\`\`json
{ "command_path": "storage blob" }
\`\`\`

**Example:** To see top-level \`az --help\`:

\`\`\`json
{ "command_path": "" }
\`\`\`

## When to Use

- Before using \`az_exec\` with an unfamiliar command group
- To discover available subcommands within a group
- To find the correct flags for a specific operation
- To check required vs optional parameters

## Output

Returns the raw \`az <command> --help\` output, which includes:

- Available subgroups and commands
- Command arguments with descriptions
- Required vs optional parameters
- Usage examples
`;

// plugins/azure/src/tools/az-help.ts
function createAzHelpTool(pi, makeApi = makeExecApi) {
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
    description: az_help_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_help' };
      const commandPath = params.command_path?.trim() ?? '';
      if (
        commandPath.length > 0 &&
        (!HELP_PATH_PATTERN.test(commandPath) || commandPath.split(' ').some((part) => part.startsWith('-')))
      ) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      const args = helpArgs(params.command_path);
      try {
        const result = await api.exec('az', args, { signal: signal ?? undefined });
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

export { createAzHelpTool };

// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import {
  detectAwsError,
  detectErrorType,
  errorResult,
  helpArgs,
  makeExecApi,
  renderError,
  textResult,
} from './runtime-30f0rzjf.js';
import { HELP_PATH_PATTERN } from './runtime-qx26ysqj.js';

// plugins/aws/src/prompts/aws-help.md
var aws_help_default = `# View AWS CLI Help

Fetch help documentation for any \`aws\` CLI service or operation.

Use this tool to discover available services, operations, and flags for AWS CLI commands that are not covered by the embedded tool documentation.

## Usage

Pass the command path (without the \`aws\` prefix) to get help:

**Example:** To see help for the \`ec2\` service:

\`\`\`json
{ "command_path": "ec2" }
\`\`\`

**Example:** To see help for a specific operation:

\`\`\`json
{ "command_path": "ec2 describe-instances" }
\`\`\`

**Example:** To see top-level \`aws\` help:

\`\`\`json
{ "command_path": "" }
\`\`\`

Note that the AWS CLI exposes help through the \`help\` subcommand (for example \`aws ec2 help\`), not a \`--help\` flag \u2014 this tool appends \`help\` for you.

## When to Use

- Before using \`aws_exec\` with an unfamiliar service
- To discover available operations within a service
- To find the correct flags for a specific operation
- To check required versus optional parameters

## Output

Returns the raw \`aws <command> help\` output, which includes:

- Available services and operations
- Command arguments with descriptions
- Required versus optional parameters
- Usage examples
`;

// plugins/aws/src/tools/aws-help.ts
function createAwsHelpTool(pi, makeApi = makeExecApi) {
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
    description: aws_help_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_help' };
      const commandPath = params.command_path?.trim() ?? '';
      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
          base,
        );
      }
      const parts = commandPath.length > 0 ? commandPath.split(' ').filter(Boolean) : [];
      if (parts.some((p) => p.startsWith('-'))) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Command path parts must not start with "-".`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
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

export { createAwsHelpTool };

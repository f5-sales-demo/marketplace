// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  buildAwsArgs,
  detectAwsError,
  errorResult,
  findMutation,
  hasControlChars,
  makeExecApi,
  textResult,
} from './runtime-30f0rzjf.js';

// plugins/aws/src/prompts/aws-exec.md
var aws_exec_default =
  '# Execute AWS CLI Commands\n\nExecute any `aws` CLI command directly.\n\nThis is the general-purpose tool for running AWS CLI commands that are not covered by the typed tools (aws_sts_whoami, aws_s3_ls, aws_ec2_describe_instances). Prefer the typed tools when available \u2014 they validate inputs and return structured data.\n\n## Usage\n\nPass the service, operation, and flags as an array of arguments. Do NOT include `aws` itself \u2014 it is prepended automatically.\n\n**Example:** To run `aws ec2 describe-instances --region us-east-1`:\n\n```json\n{ "args": ["ec2", "describe-instances", "--region", "us-east-1"] }\n```\n\nThe AWS CLI grammar is `aws <service> <operation>` (for example `ec2 describe-instances`, `iam list-users`, `s3 ls`).\n\n## Safety\n\n- Arguments are passed as an array directly to the `aws` binary \u2014 **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `aws` invocation runs, including full JMESPath `--query` syntax.\n- **Read-only by default:** only read operations are allowed. Reads are recognized by operation prefix (`describe-`, `list-`, `get-`, `lookup-`, `search-`, `head-`, `check-`, `resolve-`, \u2026) plus a few exact reads (`scan`, `query`, `select`, `wait`, and `s3 ls`).\n- Everything else \u2014 including `run-instances`, `terminate-instances`, `create-*`, `update-*`, `delete-*`, and the mutating `s3` verbs (`cp`, `mv`, `rm`, `sync`, `mb`, `rb`) \u2014 is blocked. Run write/destructive operations through an explicitly confirmed path (delegate to the `aws:cli-operator` agent), not `aws_exec`.\n- Output is capped to prevent context overflow.\n\n## Output format with `--output`\n\nControl the response format with `--output json|text|table` (JSON is added automatically when you do not supply your own):\n\n- `--output json` \u2014 machine-readable JSON (the default)\n- `--output text` \u2014 tab-separated, good for piping\n- `--output table` \u2014 human-readable ASCII table\n\n## Filtering with `--filters`\n\nMany `describe-*` operations accept server-side `--filters` in `Name=...,Values=...` form, which narrows results before they are returned:\n\n```json\n{ "args": ["ec2", "describe-instances", "--filters", "Name=instance-state-name,Values=running"] }\n```\n\n## Querying with `--query` (JMESPath)\n\nAWS uses the JMESPath grammar for the client-side `--query` flag \u2014 pass the expression as a single argument value. This is NOT the GitHub CLI `--json`/`--jq` model; there is no `--jq`. Common patterns:\n\n- Field projection: `--query "Reservations[].Instances[].{id:InstanceId, type:InstanceType}"`\n- Filter: `--query "Reservations[].Instances[?State.Name==\'running\']"`\n- Substring match: `--query "Buckets[?contains(Name, \'prod\')]"`\n- Backtick literals (numbers/booleans/quoted enums): `` --query "Volumes[?Size==`100`]" ``\n- OR / AND / NOT: `--query "[?a==\'x\' || b==\'y\']"`, `--query "[?a && b]"`, `--query "[?!Encrypted]"`\n- Pipe to post-process a projection: `--query "Reservations[].Instances[].InstanceId | [0]"`\n\nAll of the above \u2014 including `||`, `|`, and backticks \u2014 are accepted verbatim, because arguments bypass the shell.\n\n## Tips\n\n- `--output json` is added automatically unless you pass your own `--output`/`-o` (for example `-o table`, `-o text`), which is respected.\n- Use `--region NAME` to target a specific region and `--profile NAME` to select credentials.\n- Use the `aws_help` tool first if you are unsure about a service\'s available operations or flags.\n';

// plugins/aws/src/tools/aws-exec.ts
var MAX_OUTPUT_LENGTH = 50000;
function createAwsExecTool(pi, makeApi = makeExecApi) {
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
    description: aws_exec_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_exec' };
      const args = params.args ?? [];
      if (args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide an aws service and operation.', base);
      }
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
      const api = makeApi(ctx.cwd);
      const builtArgs = buildAwsArgs(args);
      const result = await api.exec('aws', builtArgs, { signal });
      if (result.exitCode !== 0) {
        throw detectAwsError(result.stderr, result.exitCode);
      }
      let output = result.stdout;
      const fullOutput = output;
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = `${output.slice(0, MAX_OUTPUT_LENGTH)}

[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
      }
      return textResult(output, { ...base, fullOutput, modelPreviewTruncated: output !== fullOutput });
    },
  };
}

export { createAwsExecTool };

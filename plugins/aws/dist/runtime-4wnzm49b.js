// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import {
  detectErrorType,
  errorResult,
  execAwsJson,
  hasControlChars,
  instanceArgs,
  makeExecApi,
  renderError,
  textResult,
} from './runtime-30f0rzjf.js';
import { formatInstanceTable, normalizeReservations } from './runtime-gjz54hes.js';
import { INSTANCE_ID_PATTERN, REGION_PATTERN } from './runtime-qx26ysqj.js';

// plugins/aws/src/prompts/aws-ec2-describe-instances.md
var aws_ec2_describe_instances_default =
  '# Describe Amazon EC2 instances\n\nUse `aws ec2 describe-instances`.\n\n## Usage\n\n```bash\naws ec2 describe-instances [--region REGION] [--instance-ids ID ...] [--filters ...] --output json\n```\n\n## Parameters\n\n| Parameter | Description |\n| --- | --- |\n| `region` | Optional AWS region (e.g. `us-east-1`) |\n| `instanceIds` | Optional list of instance IDs (e.g. `i-0123456789abcdef0`) |\n| `filters` | Optional list of `Name=...,Values=...` filter expressions |\n\n## Output Fields (JSON, flattened)\n\nResults arrive as `Reservations[].Instances[]` and are flattened to:\n\n- `instanceId` \u2014 Instance ID\n- `name` \u2014 Value of the `Name` tag, if present\n- `state` \u2014 Lifecycle state (running, stopped, terminated, etc.)\n- `type` \u2014 Instance type (e.g. `t3.micro`)\n- `az` \u2014 Availability Zone\n- `privateIp` \u2014 Private IPv4 address\n- `publicIp` \u2014 Public IPv4 address, if assigned\n\n## Notes\n\nWithout a region, the CLI\'s default region is used. Combine `--filters` for\nserver-side narrowing, e.g. `Name=instance-state-name,Values=running`.\n\nFor advanced field selection, add `--query` with a JMESPath expression, e.g.\n`--query "Reservations[].Instances[].InstanceId"`.\n\n## Related Commands\n\n- `aws ec2 describe-instance-status` \u2014 Health and status checks\n- `aws ec2 start-instances --instance-ids ID` \u2014 Start a stopped instance\n';

// plugins/aws/src/tools/aws-ec2-describe-instances.ts
var EC2_FILTER_PATTERN = /^Name=[A-Za-z0-9:._/-]+,Values=[A-Za-z0-9:._/,*-]+$/;
function createAwsEc2DescribeInstancesTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    region: Type.Optional(Type.String({ description: 'AWS region, e.g. us-east-1' })),
    instanceIds: Type.Optional(Type.Array(Type.String(), { description: 'Instance IDs, e.g. i-0123456789abcdef0' })),
    filters: Type.Optional(
      Type.Array(Type.String(), { description: 'Filters, e.g. Name=instance-state-name,Values=running' }),
    ),
  });
  return {
    name: 'aws_ec2_describe_instances',
    label: 'AWS EC2 Instances',
    description: aws_ec2_describe_instances_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_ec2_describe_instances' };
      if (params.region !== undefined && !REGION_PATTERN.test(params.region)) {
        return errorResult(`Error: invalid region "${params.region}". Expected a form like "us-east-1".`, base);
      }
      if (params.instanceIds) {
        for (const id of params.instanceIds) {
          if (!INSTANCE_ID_PATTERN.test(id)) {
            return errorResult(`Error: invalid instance ID "${id}". Expected a form like "i-0123456789abcdef0".`, base);
          }
        }
      }
      if (params.filters) {
        for (const filter of params.filters) {
          if (hasControlChars(filter)) {
            return errorResult(`Error: invalid filter "${filter}". Control characters are not allowed.`, base);
          }
          if (filter.startsWith('-') || !EC2_FILTER_PATTERN.test(filter)) {
            return errorResult(
              `Error: invalid filter "${filter}". Expected the form "Name=<name>,Values=<v1,v2,...>", e.g. "Name=instance-state-name,Values=running".`,
              base,
            );
          }
        }
      }
      const api = makeApi(ctx.cwd);
      const args = instanceArgs(params);
      try {
        const raw = await execAwsJson(api, args, signal);
        const instances = normalizeReservations(raw);
        return textResult(formatInstanceTable(instances), { ...base, instances });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}

export { createAwsEc2DescribeInstancesTool };

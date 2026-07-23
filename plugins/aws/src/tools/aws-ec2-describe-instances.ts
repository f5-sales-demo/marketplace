import { execAwsJson } from '../aws/exec';
import { formatInstanceTable, normalizeReservations } from '../aws/formatters';
import type { PluginInterface } from '../aws/types';
import { INSTANCE_ID_PATTERN, REGION_PATTERN } from '../aws/types';
import awsEc2DescribeDescription from '../prompts/aws-ec2-describe-instances.md' with { type: 'text' };
import { detectErrorType, errorResult, hasControlChars, makeExecApi, renderError, textResult } from './shared';

// Strict shape for an EC2 `--filters` element. Anchored so a value cannot start
// with a dash (which the aws CLI would read as a flag → argument injection) and
// so only known-safe characters appear on either side of the Name/Values pair.
const EC2_FILTER_PATTERN = /^Name=[A-Za-z0-9:._/-]+,Values=[A-Za-z0-9:._/,*-]+$/;

export function createAwsEc2DescribeInstancesTool(pi: PluginInterface) {
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
    description: awsEc2DescribeDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { region?: string; instanceIds?: string[]; filters?: string[] },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'aws_ec2_describe_instances' as const };

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
          // A leading dash would be interpreted by the aws CLI as a flag
          // (argument injection); the pattern also rejects it, but guard first
          // so the intent is explicit. Otherwise require the strict
          // Name=…,Values=… shape.
          if (filter.startsWith('-') || !EC2_FILTER_PATTERN.test(filter)) {
            return errorResult(
              `Error: invalid filter "${filter}". Expected the form "Name=<name>,Values=<v1,v2,...>", e.g. "Name=instance-state-name,Values=running".`,
              base,
            );
          }
        }
      }

      const api = makeExecApi(ctx.cwd);
      const args = ['ec2', 'describe-instances'];
      if (params.region) args.push('--region', params.region);
      if (params.instanceIds && params.instanceIds.length > 0) args.push('--instance-ids', ...params.instanceIds);
      if (params.filters && params.filters.length > 0) args.push('--filters', ...params.filters);

      try {
        const raw = await execAwsJson<Record<string, unknown>>(api, args, signal);
        const instances = normalizeReservations(raw);
        return textResult(formatInstanceTable(instances), { ...base, instances });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}

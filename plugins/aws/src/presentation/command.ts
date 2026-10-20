import { helpArgs, identityArgs, instanceArgs, jsonArgs, s3Args } from '../aws/arguments';
import { buildAwsArgs } from '../tools/aws-exec-guard';

export function toolArgv(name: string, args: Record<string, unknown>): string[] | undefined {
  const strings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((v) => typeof v === 'string');
  if (name === 'aws_sts_whoami')
    return ['aws', ...jsonArgs(identityArgs(typeof args.profile === 'string' ? args.profile : undefined))];
  if (name === 'aws_ec2_describe_instances')
    return [
      'aws',
      ...jsonArgs(
        instanceArgs({
          region: typeof args.region === 'string' ? args.region : undefined,
          instanceIds: strings(args.instanceIds) ? args.instanceIds : undefined,
          filters: strings(args.filters) ? args.filters : undefined,
        }),
      ),
    ];
  if (name === 'aws_s3_ls') {
    const target = typeof args.target === 'string' ? args.target : undefined;
    return ['aws', ...(target ? s3Args(target) : jsonArgs(s3Args()))];
  }
  if (name === 'aws_help')
    return ['aws', ...helpArgs(typeof args.command_path === 'string' ? args.command_path : undefined)];
  if (name === 'aws_exec' && strings(args.args) && args.args.length) return ['aws', ...buildAwsArgs(args.args)];
  // CE operations have multiple guarded commands, rather than one CLI invocation.
  return undefined;
}

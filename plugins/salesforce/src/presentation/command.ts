import type { Args } from './shared';

export function toolArgv(name: string, args: Args): string[] | undefined {
  if (name === 'sf_exec') return Array.isArray(args.args) ? ['sf', ...args.args.map(String)] : undefined;
  if (name === 'sf_help')
    return [
      'sf',
      ...String(args.command_path ?? '')
        .trim()
        .split(/[ :]/)
        .filter(Boolean),
      '--help',
    ];
  const argv =
    name === 'sf_query'
      ? ['sf', 'data', 'query', '--query', String(args.query ?? '')]
      : name === 'sf_describe'
        ? ['sf', 'sobject', 'describe', '--sobject', String(args.sobject ?? '').trim()]
        : name === 'sf_org_display'
          ? ['sf', 'org', 'display']
          : undefined;
  if (!argv) return undefined;
  if (args.target_org) argv.push('--target-org', String(args.target_org));
  if (name === 'sf_query' && args.use_tooling_api) argv.push('--use-tooling-api');
  if (name === 'sf_query' && args.all_rows) argv.push('--all-rows');
  return [...argv, '--json'];
}

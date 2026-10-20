/** JSON-only typed tools retain explicit projections without appending an overriding flag. */
export function jsonArgs(args: string[]): string[] {
  const formats = args.flatMap((arg, i) =>
    arg === '--format' ? [args[i + 1] ?? ''] : arg.startsWith('--format=') ? [arg.slice(9)] : [],
  );
  if (formats.some((format) => !/^json(?:\([^\r\n]*\))?$/.test(format)))
    throw new Error('Typed gcloud tools require a JSON format');
  return formats.length ? [...args] : [...args, '--format=json'];
}
export function listArgs(
  kind: 'projects' | 'instances' | 'buckets',
  params: { filter?: string; limit?: number; zone?: string },
): string[] {
  const args =
    kind === 'projects'
      ? ['projects', 'list']
      : kind === 'instances'
        ? ['compute', 'instances', 'list']
        : ['storage', 'buckets', 'list'];
  if (kind === 'instances' && params.zone) args.push(`--zones=${params.zone}`);
  if (params.filter) args.push(`--filter=${params.filter}`);
  if (params.limit !== undefined) args.push(`--limit=${String(params.limit)}`);
  return args;
}
export function helpArgs(path?: string): string[] {
  return [...(path?.trim().split(' ').filter(Boolean) ?? []), '--help'];
}
export function inventoryArgs(project: string, deploymentName: string): string[] {
  return [
    'compute',
    'instances',
    'list',
    `--project=${project}`,
    `--filter=labels.xcsh-deployment=${deploymentName}`,
    '--format=json(id,name,zone,status,labels)',
  ];
}

/** Pure argv builders shared by execution and command presentation. */
export const normalizeProfile = (profile?: string) =>
  profile !== undefined && /^ *$/.test(profile) ? undefined : profile;
export const jsonArgs = (args: readonly string[]) => [...args, '--output', 'json'];
export function identityArgs(profile?: string): string[] {
  const selected = normalizeProfile(profile);
  return ['sts', 'get-caller-identity', ...(selected ? ['--profile', selected] : [])];
}
export function instanceArgs(params: { region?: string; instanceIds?: string[]; filters?: string[] }): string[] {
  return [
    'ec2',
    'describe-instances',
    ...(params.region ? ['--region', params.region] : []),
    ...(params.instanceIds?.length ? ['--instance-ids', ...params.instanceIds] : []),
    ...(params.filters?.length ? ['--filters', ...params.filters] : []),
  ];
}
export const s3Args = (target?: string) => (target ? ['s3', 'ls', target] : ['s3api', 'list-buckets']);
export const helpArgs = (path?: string) => [...(path?.trim().split(' ').filter(Boolean) ?? []), 'help'];

export const jsonArgs = (args: string[]) => [...args, '--output', 'json'];
export function accountArgs(params: { action?: string; subscription?: string }) {
  const args = ['account', params.action === 'list' ? 'list' : 'show'];
  if (params.action !== 'list' && params.subscription) args.push('--subscription', params.subscription);
  return args;
}
export function groupArgs(params: { action?: string; name?: string; subscription?: string; tag?: string }) {
  const args = params.action === 'show' && params.name ? ['group', 'show', '--name', params.name] : ['group', 'list'];
  if (params.action !== 'show' && params.tag) args.push('--tag', params.tag);
  if (params.subscription) args.push('--subscription', params.subscription);
  return args;
}
export function resourceArgs(params: { resource_group: string; subscription?: string; resource_type?: string }) {
  const args = ['resource', 'list', '--resource-group', params.resource_group];
  if (params.subscription) args.push('--subscription', params.subscription);
  if (params.resource_type) args.push('--resource-type', params.resource_type);
  return args;
}
export const helpArgs = (path?: string) => [...(path?.trim().split(' ').filter(Boolean) ?? []), '--help'];

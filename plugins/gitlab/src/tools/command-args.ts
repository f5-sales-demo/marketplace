export interface IssueListInput {
  state?: string;
  labels?: string[];
  assignee?: string;
  search?: string;
  milestone?: string;
  sort?: string;
  order?: string;
  limit?: number;
}
/** Preserve the execution order and defaults; project is the resolved effective scope. */
export function issueListArgs(input: IssueListInput, project: string): string[] {
  const args = ['issue', 'list', '--output', 'json', '--repo', project];
  if (input.state === 'closed') args.push('--closed');
  else if (input.state === 'all') args.push('--all');
  if (input.labels?.length) args.push('--label', input.labels.join(','));
  if (input.assignee) args.push('--assignee', input.assignee);
  if (input.search) args.push('--search', input.search);
  if (input.milestone) args.push('--milestone', input.milestone);
  if (input.sort) args.push('--order', input.sort);
  if (input.order) args.push('--sort', input.order);
  args.push('--per-page', String(Math.min(input.limit ?? 30, 100)));
  return args;
}
export function issueViewArgs(input: { issue: number | string; comments?: boolean }, project: string): string[] {
  const args = ['issue', 'view', String(input.issue), '--output', 'json', '--repo', project];
  if (input.comments !== false) args.push('--comments');
  return args;
}
export function helpArgs(path = ''): string[] | undefined {
  const commandPath = path.trim();
  if (commandPath && !/^[a-z][a-z -]*$/.test(commandPath)) return;
  const parts = commandPath.split(' ').filter(Boolean);
  if (parts.some((part) => part.startsWith('-'))) return;
  return [...parts, '--help'];
}

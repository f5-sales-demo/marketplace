import type { GlabIssue } from './types';

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function truncateLabels(labels: string[], maxLen = 30): string {
  if (!labels.length) return '(none)';
  const joined = labels.join(', ');
  if (joined.length <= maxLen) return joined;
  const truncated = labels.slice(0, 3).join(', ');
  const remaining = labels.length - 3;
  return remaining > 0 ? `${truncated}, +${remaining}` : truncated;
}

export function formatIssueTable(issues: GlabIssue[]): string {
  if (issues.length === 0) {
    return 'No issues found matching the criteria.';
  }

  const header = '| IID | Title | State | Labels | Assignee | Updated |';
  const divider = '|-----|-------|-------|--------|----------|---------|';

  const rows = issues.map((issue) => {
    const title = issue.title.length > 50 ? `${issue.title.slice(0, 47)}...` : issue.title;
    const labels = truncateLabels(issue.labels);
    const assignee = issue.assignees.length > 0 ? `@${issue.assignees[0].username}` : 'unassigned';
    const updated = formatDate(issue.updated_at);
    return `| ${issue.iid} | ${title} | ${issue.state} | ${labels} | ${assignee} | ${updated} |`;
  });

  return [header, divider, ...rows].join('\n');
}

export function formatIssueDetail(issue: GlabIssue): string {
  const lines: string[] = [];

  lines.push(`# Issue #${issue.iid}: ${issue.title}`);
  lines.push('');
  lines.push(
    `State: ${issue.state} | Author: @${issue.author.username} | Created: ${formatDate(issue.created_at)} | Updated: ${formatDate(issue.updated_at)}`,
  );

  if (issue.labels.length > 0) {
    lines.push(`Labels: ${issue.labels.join(', ')}`);
  }

  const assigneeStr =
    issue.assignees.length > 0 ? issue.assignees.map((a) => `@${a.username}`).join(', ') : 'unassigned';
  lines.push(`Assignee: ${assigneeStr}${issue.milestone ? ` | Milestone: ${issue.milestone.title}` : ''}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(issue.description || '(no description)');

  const humanNotes = (issue.notes ?? []).filter((n) => !n.system);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (humanNotes.length === 0) {
    lines.push('No comments.');
  } else {
    lines.push(`## Comments (${humanNotes.length})`);
    for (const note of humanNotes) {
      lines.push('');
      lines.push(`**@${note.author.username}** (${formatDate(note.created_at)}):`);
      lines.push(`> ${note.body.split('\n').join('\n> ')}`);
    }
  }

  return lines.join('\n');
}

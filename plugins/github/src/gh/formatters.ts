// Pure render/format helpers extracted from ../tools/gh.
//
// Every function here is pure (data in → string/string[] out) and performs no
// I/O and no `git.*` calls. The fetch/execute code lives in ../tools/gh and
// imports these back as runtime values. Types flow the other way: this module
// imports type-only declarations from ../tools/gh, which are erased at runtime,
// so there is no runtime import cycle (gh.ts → formatters.ts only).

import type {
  GhComment,
  GhFailedJobLog,
  GhIssueViewData,
  GhIssueViewInput,
  GhLabel,
  GhPrFile,
  GhPrReview,
  GhPrReviewComment,
  GhPrViewData,
  GhPrViewInput,
  GhRepoViewData,
  GhRepoViewInput,
  GhRunJobSnapshot,
  GhRunSnapshot,
  GhSearchResult,
  GhUser,
} from '../tools/gh';

const FILE_PREVIEW_LIMIT = 50;
const RUN_SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
const RUN_FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure']);
const JOB_FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required']);

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\t', '    ').trim();
}

export function normalizeBlock(value: string | null | undefined): string {
  return (value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\t', '    ').trimEnd();
}

export function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function formatShortSha(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.slice(0, 12);
}

export function formatAuthor(author: GhUser | null | undefined): string | undefined {
  if (!author) return undefined;
  if (author.login) return `@${author.login}`;
  if (author.name) return author.name;
  return undefined;
}

export function formatLabels(labels: GhLabel[] | undefined): string | undefined {
  const names = labels?.map((label) => label.name).filter((value): value is string => Boolean(value)) ?? [];
  if (names.length === 0) return undefined;
  return names.join(', ');
}

export function pushLine(lines: string[], label: string, value: string | number | boolean | undefined): void {
  if (value === undefined || value === '') return;
  lines.push(`${label}: ${value}`);
}

export function getRunOutcome(value: string | undefined): 'success' | 'failure' | 'pending' {
  if (!value) {
    return 'pending';
  }

  if (RUN_SUCCESS_CONCLUSIONS.has(value)) {
    return 'success';
  }

  if (RUN_FAILURE_CONCLUSIONS.has(value)) {
    return 'failure';
  }

  return 'pending';
}

export function getRunSnapshotOutcome(run: GhRunSnapshot): 'success' | 'failure' | 'pending' {
  if (run.status !== 'completed') {
    return 'pending';
  }

  return getRunOutcome(run.conclusion);
}

export function getRunCollectionOutcome(runs: GhRunSnapshot[]): 'success' | 'failure' | 'pending' {
  if (runs.length === 0) {
    return 'pending';
  }

  let pending = false;
  for (const run of runs) {
    if (run.jobs.some(isFailedJob)) {
      return 'failure';
    }

    const outcome = getRunSnapshotOutcome(run);
    if (outcome === 'failure') {
      return 'failure';
    }
    if (outcome === 'pending') {
      pending = true;
    }
  }

  return pending ? 'pending' : 'success';
}

export function getRunCollectionSignature(runs: GhRunSnapshot[]): string {
  return runs
    .map((run) => run.id)
    .sort((left, right) => left - right)
    .join(',');
}

export function isFailedJob(job: GhRunJobSnapshot): boolean {
  return job.conclusion !== undefined && JOB_FAILURE_CONCLUSIONS.has(job.conclusion);
}

export function formatJobState(job: GhRunJobSnapshot): string {
  return job.conclusion ?? job.status ?? 'unknown';
}

export function renderJobsSection(jobs: GhRunJobSnapshot[]): string[] {
  if (jobs.length === 0) {
    return ['## Jobs', '', 'No jobs reported yet.'];
  }

  const lines: string[] = [`## Jobs (${jobs.length})`, ''];
  for (const job of jobs) {
    lines.push(`- [${formatJobState(job)}] ${job.name}`);
    if (job.startedAt) {
      pushLine(lines, '  Started', job.startedAt);
    }
    if (job.completedAt) {
      pushLine(lines, '  Completed', job.completedAt);
    }
    if (job.url) {
      pushLine(lines, '  URL', job.url);
    }
  }

  return lines;
}

export function renderFailedJobLogs(
  failedJobLogs: GhFailedJobLog[],
  options: { mode: 'tail'; tail: number } | { mode: 'full' },
): string[] {
  if (failedJobLogs.length === 0) {
    return [];
  }

  const lines: string[] = ['## Failed Jobs', ''];
  for (const entry of failedJobLogs) {
    lines.push(`### ${entry.job.name} [${entry.job.conclusion ?? 'failed'}]`);
    pushLine(lines, 'Run', `#${entry.run.id}`);
    pushLine(lines, 'Workflow', entry.run.workflowName ?? undefined);
    if (entry.job.startedAt) {
      pushLine(lines, 'Started', entry.job.startedAt);
    }
    if (entry.job.completedAt) {
      pushLine(lines, 'Completed', entry.job.completedAt);
    }
    if (entry.job.url) {
      pushLine(lines, 'URL', entry.job.url);
    }
    lines.push('');
    const logText = options.mode === 'full' ? entry.full : entry.tail;
    if (entry.available && logText) {
      lines.push(options.mode === 'full' ? 'Full log:' : `Last ${options.tail} log lines:`);
      lines.push('```text');
      lines.push(logText);
      lines.push('```');
    } else {
      lines.push(options.mode === 'full' ? 'Full log unavailable.' : 'Log tail unavailable.');
    }
    lines.push('');
  }

  return lines;
}

export function renderRunSection(run: GhRunSnapshot): string[] {
  const label = run.workflowName ? `### Run #${run.id} - ${run.workflowName}` : `### Run #${run.id}`;
  const lines: string[] = [label, ''];
  pushLine(lines, 'Title', run.displayTitle ?? undefined);
  pushLine(lines, 'Branch', run.branch ?? undefined);
  pushLine(lines, 'Commit', formatShortSha(run.headSha));
  pushLine(lines, 'Status', run.status);
  pushLine(lines, 'Conclusion', run.conclusion ?? undefined);
  pushLine(lines, 'Created', run.createdAt);
  pushLine(lines, 'Updated', run.updatedAt);
  pushLine(lines, 'URL', run.url);
  lines.push('');
  lines.push(...renderJobsSection(run.jobs));
  return lines;
}

export function formatRunWatchSnapshot(
  repo: string,
  run: GhRunSnapshot,
  pollCount: number,
  note?: string,
  includeOutcome: boolean = false,
): string {
  const failedJobs = run.jobs.filter(isFailedJob);
  const lines: string[] = [`# Watching GitHub Actions Run #${run.id}`, ''];
  pushLine(lines, 'Repository', repo);
  pushLine(lines, 'Workflow', run.workflowName ?? undefined);
  pushLine(lines, 'Title', run.displayTitle ?? undefined);
  pushLine(lines, 'Branch', run.branch ?? undefined);
  pushLine(lines, 'Status', run.status);
  pushLine(lines, 'Conclusion', run.conclusion ?? undefined);
  pushLine(lines, 'Created', run.createdAt);
  pushLine(lines, 'Updated', run.updatedAt);
  pushLine(lines, 'URL', run.url);
  pushLine(lines, 'Poll', pollCount);
  pushLine(lines, 'Failed jobs', failedJobs.length || undefined);

  if (note) {
    lines.push('');
    lines.push(`Note: ${note}`);
  }

  lines.push('');
  lines.push(...renderJobsSection(run.jobs));

  if (includeOutcome) {
    lines.push('');
    lines.push(failedJobs.length > 0 ? 'Failures detected.' : 'All jobs passed.');
  }

  return lines.join('\n').trim();
}

export function formatRunWatchResult(
  repo: string,
  run: GhRunSnapshot,
  failedJobLogs: GhFailedJobLog[],
  tail: number,
  options?: { mode?: 'tail' | 'full' },
): string {
  const failedJobs = run.jobs.filter(isFailedJob);
  const lines: string[] = [`# GitHub Actions Run #${run.id}`, ''];
  pushLine(lines, 'Repository', repo);
  pushLine(lines, 'Workflow', run.workflowName ?? undefined);
  pushLine(lines, 'Title', run.displayTitle ?? undefined);
  pushLine(lines, 'Branch', run.branch ?? undefined);
  pushLine(lines, 'Status', run.status);
  pushLine(lines, 'Conclusion', run.conclusion ?? undefined);
  pushLine(lines, 'Created', run.createdAt);
  pushLine(lines, 'Updated', run.updatedAt);
  pushLine(lines, 'URL', run.url);
  lines.push('');
  lines.push(...renderJobsSection(run.jobs));

  if (failedJobs.length > 0) {
    lines.push('');
    lines.push(
      ...renderFailedJobLogs(failedJobLogs, options?.mode === 'full' ? { mode: 'full' } : { mode: 'tail', tail }),
    );
    lines.push('Run failed.');
  } else if (getRunOutcome(run.conclusion) === 'success') {
    lines.push('');
    lines.push('All jobs passed.');
  } else {
    lines.push('');
    lines.push('Run completed without successful jobs, but no failed job logs were available.');
  }

  return lines.join('\n').trim();
}

export function formatCommitRunWatchSnapshot(
  repo: string,
  headSha: string,
  branch: string | undefined,
  runs: GhRunSnapshot[],
  pollCount: number,
  note?: string,
): string {
  const failedJobs = runs.flatMap((run) => run.jobs.filter(isFailedJob));
  const completedRuns = runs.filter((run) => run.status === 'completed').length;
  const lines: string[] = [`# Watching GitHub Actions for ${formatShortSha(headSha) ?? headSha}`, ''];
  pushLine(lines, 'Repository', repo);
  pushLine(lines, 'Branch', branch);
  pushLine(lines, 'Commit', headSha);
  pushLine(lines, 'Poll', pollCount);
  pushLine(lines, 'Runs', runs.length);
  pushLine(lines, 'Completed runs', `${completedRuns}/${runs.length}`);
  pushLine(lines, 'Failed jobs', failedJobs.length || undefined);

  if (note) {
    lines.push('');
    lines.push(`Note: ${note}`);
  }

  if (runs.length === 0) {
    lines.push('');
    lines.push('Waiting for workflow runs for this commit.');
    return lines.join('\n').trim();
  }

  for (const run of runs) {
    lines.push('');
    lines.push(...renderRunSection(run));
  }

  return lines.join('\n').trim();
}

export function formatCommitRunWatchResult(
  repo: string,
  headSha: string,
  branch: string | undefined,
  runs: GhRunSnapshot[],
  failedJobLogs: GhFailedJobLog[],
  tail: number,
  options?: { mode?: 'tail' | 'full' },
): string {
  const outcome = getRunCollectionOutcome(runs);
  const lines: string[] = [`# GitHub Actions for ${formatShortSha(headSha) ?? headSha}`, ''];
  pushLine(lines, 'Repository', repo);
  pushLine(lines, 'Branch', branch);
  pushLine(lines, 'Commit', headSha);
  pushLine(lines, 'Runs', runs.length);

  for (const run of runs) {
    lines.push('');
    lines.push(...renderRunSection(run));
  }

  if (failedJobLogs.length > 0) {
    lines.push('');
    lines.push(
      ...renderFailedJobLogs(failedJobLogs, options?.mode === 'full' ? { mode: 'full' } : { mode: 'tail', tail }),
    );
    lines.push('Workflow runs for this commit failed.');
  } else if (outcome === 'success') {
    lines.push('');
    lines.push('All workflow runs for this commit passed.');
  } else {
    lines.push('');
    lines.push('Workflow runs for this commit did not complete successfully.');
  }

  return lines.join('\n').trim();
}

export function tailLogLines(log: string, tail: number): string | undefined {
  const normalized = normalizeBlock(log);
  if (!normalized) {
    return undefined;
  }

  const lines = normalized.split('\n');
  return lines.slice(-tail).join('\n').trimEnd();
}

export function formatCommentsSection(comments: GhComment[] | undefined): string[] {
  if (!comments || comments.length === 0) {
    return [];
  }

  const visible = comments.filter((comment) => !comment.isMinimized);
  const hiddenCount = comments.length - visible.length;
  const lines: string[] = ['## Comments', ''];

  if (visible.length === 0) {
    lines.push(`No visible comments. Minimized comments omitted: ${hiddenCount}.`);
    return lines;
  }

  lines[0] = `## Comments (${visible.length})`;

  for (const comment of visible) {
    const author = formatAuthor(comment.author) ?? 'unknown';
    const createdAt = comment.createdAt ? ` · ${comment.createdAt}` : '';
    lines.push(`### ${author}${createdAt}`);
    lines.push('');
    lines.push(normalizeText(comment.body) || 'No comment body.');
    if (comment.url) {
      lines.push('');
      lines.push(`URL: ${comment.url}`);
    }
    lines.push('');
  }

  if (hiddenCount > 0) {
    lines.push(`Minimized comments omitted: ${hiddenCount}.`);
  }

  return lines;
}

export function formatReviewsSection(reviews: GhPrReview[] | undefined): string[] {
  if (!reviews || reviews.length === 0) {
    return [];
  }

  const lines: string[] = [`## Reviews (${reviews.length})`, ''];
  for (const review of reviews) {
    const author = formatAuthor(review.author) ?? 'unknown';
    const submittedAt = review.submittedAt ? ` - ${review.submittedAt}` : '';
    const state = review.state ? ` [${review.state}]` : '';
    lines.push(`### ${author}${submittedAt}${state}`);
    if (review.commit?.oid) {
      lines.push('');
      lines.push(`Commit: ${formatShortSha(review.commit.oid)}`);
    }
    lines.push('');
    lines.push(normalizeText(review.body) || 'No review body.');
    lines.push('');
  }

  return lines;
}

export function formatReviewCommentLocation(comment: GhPrReviewComment): string | undefined {
  if (!comment.path) {
    return undefined;
  }

  const line = comment.line ?? comment.originalLine;
  return line === undefined ? comment.path : `${comment.path}:${line}`;
}

export function formatReviewCommentsSection(comments: GhPrReviewComment[] | undefined): string[] {
  if (!comments || comments.length === 0) {
    return [];
  }

  const lines: string[] = [`## Review Comments (${comments.length})`, ''];
  for (const comment of comments) {
    const author = formatAuthor(comment.author) ?? 'unknown';
    const createdAt = comment.createdAt ? ` · ${comment.createdAt}` : '';
    lines.push(`### ${author}${createdAt}`);
    lines.push('');
    pushLine(lines, 'Location', formatReviewCommentLocation(comment));
    pushLine(lines, 'Side', comment.side);
    pushLine(lines, 'Reply to', comment.inReplyToId);
    pushLine(lines, 'URL', comment.url);
    lines.push('');
    lines.push(normalizeText(comment.body) || 'No review comment body.');
    lines.push('');
  }

  return lines;
}

export function formatRepoView(data: GhRepoViewData, input: GhRepoViewInput): string {
  const lines: string[] = [];
  const name = data.nameWithOwner ?? input.repo ?? 'GitHub Repository';
  lines.push(`# ${name}`);
  lines.push('');
  lines.push(normalizeText(data.description) || 'No description provided.');
  lines.push('');
  pushLine(lines, 'URL', data.url);
  pushLine(lines, 'Default branch', data.defaultBranchRef?.name);
  pushLine(lines, 'Branch', normalizeOptionalString(input.branch));
  pushLine(lines, 'Visibility', data.visibility ?? undefined);
  pushLine(lines, 'Viewer permission', data.viewerPermission ?? undefined);
  pushLine(lines, 'Primary language', data.primaryLanguage?.name);
  pushLine(lines, 'Stars', data.stargazerCount);
  pushLine(lines, 'Forks', data.forkCount);
  pushLine(lines, 'Archived', data.isArchived);
  pushLine(lines, 'Fork', data.isFork);
  pushLine(lines, 'Updated', data.updatedAt);
  pushLine(lines, 'Homepage', data.homepageUrl ?? undefined);
  const topics = data.repositoryTopics
    ?.map((topic) => topic.name ?? topic.topic?.name)
    .filter((value): value is string => Boolean(value))
    .join(', ');
  pushLine(lines, 'Topics', topics || undefined);
  return lines.join('\n').trim();
}

export function formatIssueView(data: GhIssueViewData, input: GhIssueViewInput): string {
  const lines: string[] = [];
  const issueNumber = data.number ?? input.issue;
  lines.push(`# Issue #${issueNumber}: ${data.title ?? 'Untitled'}`);
  lines.push('');
  pushLine(lines, 'State', data.state);
  pushLine(lines, 'State reason', data.stateReason ?? undefined);
  pushLine(lines, 'Author', formatAuthor(data.author));
  pushLine(lines, 'Created', data.createdAt);
  pushLine(lines, 'Updated', data.updatedAt);
  pushLine(lines, 'Labels', formatLabels(data.labels));
  pushLine(lines, 'URL', data.url);
  lines.push('');
  lines.push('## Body');
  lines.push('');
  lines.push(normalizeText(data.body) || 'No description provided.');

  if ((input.comments ?? true) && data.comments) {
    const commentSection = formatCommentsSection(data.comments);
    if (commentSection.length > 0) {
      lines.push('');
      lines.push(...commentSection);
    }
  }

  return lines.join('\n').trim();
}

export function formatPrFiles(files: GhPrFile[] | undefined): string[] {
  if (!files || files.length === 0) return [];

  const lines: string[] = [`## Files (${files.length})`, ''];
  for (const file of files.slice(0, FILE_PREVIEW_LIMIT)) {
    const changeType = file.changeType ?? 'CHANGED';
    const additions = file.additions ?? 0;
    const deletions = file.deletions ?? 0;
    lines.push(`- ${file.path ?? '(unknown file)'} [${changeType}] (+${additions} -${deletions})`);
  }

  if (files.length > FILE_PREVIEW_LIMIT) {
    lines.push(`- ... ${files.length - FILE_PREVIEW_LIMIT} more files`);
  }

  return lines;
}

export function formatPrView(data: GhPrViewData, input: GhPrViewInput): string {
  const lines: string[] = [];
  const prIdentifier = data.number ?? input.pr ?? 'current';
  lines.push(`# Pull Request #${prIdentifier}: ${data.title ?? 'Untitled'}`);
  lines.push('');
  pushLine(lines, 'State', data.state);
  pushLine(lines, 'Draft', data.isDraft);
  pushLine(lines, 'Author', formatAuthor(data.author));
  pushLine(lines, 'Base', data.baseRefName);
  pushLine(lines, 'Head', data.headRefName);
  pushLine(lines, 'Review decision', data.reviewDecision ?? undefined);
  pushLine(lines, 'Merge state', data.mergeStateStatus);
  pushLine(lines, 'Created', data.createdAt);
  pushLine(lines, 'Updated', data.updatedAt);
  pushLine(lines, 'Labels', formatLabels(data.labels));
  pushLine(lines, 'URL', data.url);
  lines.push('');
  lines.push('## Body');
  lines.push('');
  lines.push(normalizeText(data.body) || 'No description provided.');

  const fileSection = formatPrFiles(data.files);
  if (fileSection.length > 0) {
    lines.push('');
    lines.push(...fileSection);
  }

  if ((input.comments ?? true) && data.reviews) {
    const reviewSection = formatReviewsSection(data.reviews);
    if (reviewSection.length > 0) {
      lines.push('');
      lines.push(...reviewSection);
    }
  }

  if ((input.comments ?? true) && data.reviewComments) {
    const reviewCommentsSection = formatReviewCommentsSection(data.reviewComments);
    if (reviewCommentsSection.length > 0) {
      lines.push('');
      lines.push(...reviewCommentsSection);
    }
  }

  if ((input.comments ?? true) && data.comments) {
    const commentSection = formatCommentsSection(data.comments);
    if (commentSection.length > 0) {
      lines.push('');
      lines.push(...commentSection);
    }
  }

  return lines.join('\n').trim();
}

export function formatPrCheckoutResult(options: {
  data: GhPrViewData;
  localBranch: string;
  worktreePath: string;
  remoteName: string;
  remoteUrl: string;
  reused: boolean;
}): string {
  const { data, localBranch, worktreePath, remoteName, remoteUrl, reused } = options;
  const lines: string[] = [
    reused ? `# Pull Request #${data.number ?? '?'} Worktree` : `# Checked Out Pull Request #${data.number ?? '?'}`,
    '',
  ];
  pushLine(lines, 'Title', data.title ?? undefined);
  pushLine(lines, 'URL', data.url);
  pushLine(lines, 'Base', data.baseRefName);
  pushLine(lines, 'Head', data.headRefName);
  pushLine(lines, 'Local branch', localBranch);
  pushLine(lines, 'Worktree', worktreePath);
  pushLine(lines, 'Remote', remoteName);
  pushLine(lines, 'Remote URL', remoteUrl);
  pushLine(lines, 'Cross repository', data.isCrossRepository);
  pushLine(lines, 'Maintainer can modify', data.maintainerCanModify);
  lines.push('');
  lines.push(
    reused
      ? 'Reused the existing PR worktree.'
      : 'Created a dedicated worktree for this PR and configured the local branch to push back to the PR head branch.',
  );
  return lines.join('\n').trim();
}

export function formatPrPushResult(options: {
  localBranch: string;
  remoteName: string;
  remoteBranch: string;
  remoteUrl?: string;
  prUrl?: string;
  forceWithLease: boolean;
}): string {
  const lines: string[] = ['# Pushed Pull Request Branch', ''];
  pushLine(lines, 'Local branch', options.localBranch);
  pushLine(lines, 'Remote', options.remoteName);
  pushLine(lines, 'Remote branch', options.remoteBranch);
  pushLine(lines, 'Remote URL', options.remoteUrl);
  pushLine(lines, 'PR', options.prUrl);
  pushLine(lines, 'Force with lease', options.forceWithLease);
  lines.push('');
  lines.push(`Pushed ${options.localBranch} to ${options.remoteName}:${options.remoteBranch}.`);
  return lines.join('\n').trim();
}

export function formatSearchResults(
  kind: 'issues' | 'pull requests',
  query: string,
  repo: string | undefined,
  items: GhSearchResult[],
): string {
  const lines: string[] = [`# GitHub ${kind} search`, '', `Query: ${query}`];
  pushLine(lines, 'Repository', repo);
  pushLine(lines, 'Results', items.length);

  if (items.length === 0) {
    lines.push('');
    lines.push(`No ${kind} found.`);
    return lines.join('\n').trim();
  }

  for (const item of items) {
    lines.push('');
    lines.push(`- #${item.number ?? '?'} ${item.title ?? 'Untitled'}`);
    pushLine(lines, '  Repo', item.repository?.nameWithOwner);
    pushLine(lines, '  State', item.state);
    pushLine(lines, '  Author', formatAuthor(item.author));
    pushLine(lines, '  Labels', formatLabels(item.labels));
    pushLine(lines, '  Created', item.createdAt);
    pushLine(lines, '  Updated', item.updatedAt);
    pushLine(lines, '  URL', item.url);
  }

  return lines.join('\n').trim();
}

export function appendArtifactReference(text: string, artifactId: string | undefined, label: string): string {
  if (!artifactId) {
    return text;
  }

  return `${text}\n\n${label}: artifact://${artifactId}`;
}

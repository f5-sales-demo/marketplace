import * as path from 'node:path';

import { assertNoControlChars } from '../utils/git';
import { ToolAbortError, ToolError, throwIfAborted } from '../utils/tool-errors';

export type LifecycleAction = 'prepare' | 'status' | 'publish' | 'monitor' | 'repair' | 'cleanup';

export interface LifecycleCommand {
  command: 'git' | 'gh';
  args: string[];
  cwd: string;
}

export interface LifecycleCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type LifecycleExecutor = (command: LifecycleCommand, signal?: AbortSignal) => Promise<LifecycleCommandResult>;

export interface LifecycleAdvisory {
  code: string;
  message: string;
  severity: 'info' | 'warning';
}

export interface LifecycleInput {
  action: LifecycleAction;
  repo?: string;
  remote?: string;
  base?: string;
  issueMode?: 'create' | 'reuse' | 'none';
  issue?: string;
  issueTitle?: string;
  issueBody?: string;
  branch?: string;
  worktree?: string;
  stageAll?: boolean;
  stagePaths?: string[];
  direct?: boolean;
  pr?: string;
  prTitle?: string;
  prBody?: string;
  draft?: boolean;
  autoMerge?: boolean;
  cleanupWithoutMergeProof?: boolean;
}

export interface LifecycleOperation extends LifecycleCommand {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface LifecycleResult {
  action: LifecycleAction;
  repository: {
    root: string;
    nameWithOwner: string;
    remote: string;
    defaultBranch: string;
  };
  operations: LifecycleOperation[];
  advisories: LifecycleAdvisory[];
  baseSha?: string;
  issue?: { number: number; url: string };
  branch?: { name: string };
  worktree?: { path: string; reused: boolean; removed?: boolean };
  pullRequest?: {
    number: number;
    url: string;
    state?: string;
    mergeStateStatus?: string;
    headRefName?: string;
    headRefOid?: string;
    baseRefName?: string;
  };
  checkState?: 'pending' | 'passing' | 'failing' | 'unknown';
  retryAfterMs?: number;
  cleanup?: { mergeVerified: boolean; branchDeleted: boolean; worktreeRemoved: boolean };
}

type Typebox = typeof import('@sinclair/typebox').Type;

const PR_FIELDS = 'number,url,state,mergeStateStatus,headRefName,headRefOid,baseRefName';
const CHECK_FIELDS = 'name,state,bucket,link,workflow';
const DEFAULT_RETRY_MS = 30_000;

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseRepository(remote: string): string | undefined {
  return remote.trim().match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i)?.[1];
}

function numberFromUrl(value: string, kind: 'issues' | 'pull'): number | undefined {
  const match = value.trim().match(new RegExp(`/${kind}/(\\d+)(?:$|[/?#])`));
  if (match) return Number(match[1]);
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined;
}

function commandLabel(command: LifecycleCommand): string {
  return `${command.command} ${evidenceArgs(command.args).join(' ')}`;
}

function evidenceArgs(args: readonly string[]): string[] {
  const redacted: string[] = [];
  let redactNext = false;
  for (const arg of args) {
    if (redactNext) {
      redacted.push('[redacted]');
      redactNext = false;
      continue;
    }
    if (arg === '--body' || arg === '--body-file') {
      redacted.push(arg);
      redactNext = true;
      continue;
    }
    redacted.push(arg.startsWith('--body=') ? '--body=[redacted]' : arg);
  }
  return redacted;
}

async function argvExecutor(command: LifecycleCommand, signal?: AbortSignal): Promise<LifecycleCommandResult> {
  throwIfAborted(signal);
  assertNoControlChars(command.args);
  try {
    const child = Bun.spawn([command.command, ...command.args], {
      cwd: command.cwd,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
      signal,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    throwIfAborted(signal);
    return { exitCode: exitCode ?? 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    if (signal?.aborted) throw new ToolAbortError();
    throw error;
  }
}

function advisory(code: string, message: string): LifecycleAdvisory {
  return { code, message, severity: 'warning' };
}

interface RepositoryContext {
  root: string;
  nameWithOwner: string;
  remote: string;
  defaultBranch: string;
  baseSha?: string;
}

export class GitHubLifecycle {
  constructor(private readonly executor: LifecycleExecutor = argvExecutor) {}

  private async execute(
    operations: LifecycleOperation[],
    cwd: string,
    command: 'git' | 'gh',
    args: string[],
    signal?: AbortSignal,
  ): Promise<LifecycleCommandResult> {
    throwIfAborted(signal);
    assertNoControlChars(args);
    const invocation = { command, args, cwd } satisfies LifecycleCommand;
    const result = await this.executor(invocation, signal);
    operations.push({ ...invocation, args: evidenceArgs(args), ...result });
    if (result.exitCode !== 0) {
      const detail = normalize(result.stderr) ?? normalize(result.stdout) ?? `exit code ${result.exitCode}`;
      throw new ToolError(`${commandLabel(invocation)} failed: ${detail}`);
    }
    return result;
  }

  private async discover(
    cwd: string,
    input: Pick<LifecycleInput, 'repo' | 'remote' | 'base'>,
    operations: LifecycleOperation[],
    signal?: AbortSignal,
    refresh = false,
  ): Promise<RepositoryContext> {
    const root = normalize(
      (await this.execute(operations, cwd, 'git', ['rev-parse', '--show-toplevel'], signal)).stdout,
    );
    if (!root) throw new ToolError('GitHub lifecycle requires a git repository context.');
    const remoteName = normalize(input.remote) ?? 'origin';
    const remoteUrl = normalize(
      (await this.execute(operations, root, 'git', ['remote', 'get-url', remoteName], signal)).stdout,
    );
    if (!remoteUrl) throw new ToolError(`Git remote ${remoteName} has no URL.`);
    const nameWithOwner = normalize(input.repo) ?? parseRepository(remoteUrl);
    if (!nameWithOwner) throw new ToolError(`Cannot derive an OWNER/REPO GitHub identity from ${remoteUrl}.`);
    const defaultBranch = normalize(input.base) ?? 'main';
    if (refresh) {
      await this.execute(operations, root, 'git', ['fetch', '--prune', remoteName], signal);
    }
    const baseResult = await this.execute(
      operations,
      root,
      'git',
      ['rev-parse', `${remoteName}/${defaultBranch}`],
      signal,
    );
    return {
      root,
      nameWithOwner,
      remote: remoteName,
      defaultBranch,
      baseSha: normalize(baseResult.stdout),
    };
  }

  private async viewPullRequest(
    context: RepositoryContext,
    operations: LifecycleOperation[],
    pr: string | undefined,
    signal?: AbortSignal,
  ): Promise<NonNullable<LifecycleResult['pullRequest']>> {
    const args = ['pr', 'view'];
    const selector = normalize(pr);
    if (selector) args.push(selector);
    args.push('--repo', context.nameWithOwner, '--json', PR_FIELDS);
    const result = await this.execute(operations, context.root, 'gh', args, signal);
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(result.stdout) as Record<string, unknown>;
    } catch {
      throw new ToolError('gh pr view returned invalid JSON.');
    }
    if (!Number.isInteger(value.number) || typeof value.url !== 'string') {
      throw new ToolError('gh pr view omitted the pull request number or URL.');
    }
    return {
      number: value.number as number,
      url: value.url,
      state: typeof value.state === 'string' ? value.state : undefined,
      mergeStateStatus: typeof value.mergeStateStatus === 'string' ? value.mergeStateStatus : undefined,
      headRefName: typeof value.headRefName === 'string' ? value.headRefName : undefined,
      headRefOid: typeof value.headRefOid === 'string' ? value.headRefOid : undefined,
      baseRefName: typeof value.baseRefName === 'string' ? value.baseRefName : undefined,
    };
  }

  private emptyResult(
    action: LifecycleAction,
    repository: RepositoryContext,
    operations: LifecycleOperation[],
    advisories: LifecycleAdvisory[] = [],
  ): LifecycleResult {
    return {
      action,
      repository: {
        root: repository.root,
        nameWithOwner: repository.nameWithOwner,
        remote: repository.remote,
        defaultBranch: repository.defaultBranch,
      },
      baseSha: repository.baseSha,
      operations,
      advisories,
    };
  }

  async createIssue(
    cwd: string,
    input: Pick<LifecycleInput, 'repo' | 'remote' | 'base' | 'issueTitle' | 'issueBody'>,
    signal?: AbortSignal,
  ): Promise<LifecycleResult> {
    const operations: LifecycleOperation[] = [];
    const repository = await this.discover(cwd, input, operations, signal);
    const title = normalize(input.issueTitle);
    const body = normalize(input.issueBody);
    if (!title || !body) throw new ToolError('Issue creation requires a title and body.');
    const created = await this.execute(
      operations,
      repository.root,
      'gh',
      ['issue', 'create', '--repo', repository.nameWithOwner, '--title', title, '--body', body],
      signal,
    );
    const url = normalize(created.stdout);
    const number = url ? numberFromUrl(url, 'issues') : undefined;
    if (!url || !number) throw new ToolError('gh issue create did not return an issue URL.');
    return { ...this.emptyResult('prepare', repository, operations), issue: { number, url } };
  }

  async createPullRequest(
    cwd: string,
    input: Pick<LifecycleInput, 'repo' | 'remote' | 'base' | 'branch' | 'prTitle' | 'prBody' | 'draft'>,
    signal?: AbortSignal,
  ): Promise<LifecycleResult> {
    const operations: LifecycleOperation[] = [];
    const repository = await this.discover(cwd, input, operations, signal);
    const branchName =
      normalize(input.branch) ??
      normalize(
        (await this.execute(operations, repository.root, 'git', ['symbolic-ref', '--short', 'HEAD'], signal)).stdout,
      );
    if (!branchName) throw new ToolError('Pull request creation requires a named branch.');
    const args = [
      'pr',
      'create',
      '--repo',
      repository.nameWithOwner,
      '--base',
      repository.defaultBranch,
      '--head',
      branchName,
    ];
    const title = normalize(input.prTitle);
    const body = normalize(input.prBody);
    if (title) args.push('--title', title);
    if (body) args.push('--body', body);
    if (input.draft) args.push('--draft');
    const created = await this.execute(operations, repository.root, 'gh', args, signal);
    const url = normalize(created.stdout);
    const number = url ? numberFromUrl(url, 'pull') : undefined;
    if (!url || !number) throw new ToolError('gh pr create did not return a pull request URL.');
    return {
      ...this.emptyResult('publish', repository, operations),
      branch: { name: branchName },
      pullRequest: { number, url, headRefName: branchName, baseRefName: repository.defaultBranch },
    };
  }

  async enableAutoMerge(
    cwd: string,
    input: Pick<LifecycleInput, 'repo' | 'remote' | 'base' | 'pr'>,
    signal?: AbortSignal,
  ): Promise<LifecycleResult> {
    const operations: LifecycleOperation[] = [];
    const repository = await this.discover(cwd, input, operations, signal);
    const selector = normalize(input.pr);
    if (!selector) throw new ToolError('Auto-merge requires pr.');
    const pullRequest = await this.viewPullRequest(repository, operations, selector, signal);
    await this.execute(
      operations,
      repository.root,
      'gh',
      ['pr', 'merge', selector, '--repo', repository.nameWithOwner, '--auto', '--squash'],
      signal,
    );
    return { ...this.emptyResult('repair', repository, operations), pullRequest };
  }

  async updatePullRequestBranch(
    cwd: string,
    input: Pick<LifecycleInput, 'repo' | 'remote' | 'base' | 'pr'>,
    signal?: AbortSignal,
  ): Promise<LifecycleResult> {
    const operations: LifecycleOperation[] = [];
    const repository = await this.discover(cwd, input, operations, signal);
    const selector = normalize(input.pr);
    if (!selector) throw new ToolError('Pull request branch update requires pr.');
    const pullRequest = await this.viewPullRequest(repository, operations, selector, signal);
    await this.execute(
      operations,
      repository.root,
      'gh',
      ['pr', 'update-branch', selector, '--repo', repository.nameWithOwner],
      signal,
    );
    return { ...this.emptyResult('repair', repository, operations), pullRequest };
  }

  async run(cwd: string, input: LifecycleInput, signal?: AbortSignal): Promise<LifecycleResult> {
    const operations: LifecycleOperation[] = [];
    const advisories: LifecycleAdvisory[] = [];
    const repository = await this.discover(cwd, input, operations, signal, input.action === 'prepare');
    const result = this.emptyResult(input.action, repository, operations, advisories);

    switch (input.action) {
      case 'prepare': {
        const issueMode = input.issueMode ?? (input.issue ? 'reuse' : 'create');
        let issue: LifecycleResult['issue'];
        if (issueMode === 'create') {
          const title = normalize(input.issueTitle);
          const body = normalize(input.issueBody);
          if (!title || !body) throw new ToolError('prepare with issueMode=create requires issueTitle and issueBody.');
          const created = await this.execute(
            operations,
            repository.root,
            'gh',
            ['issue', 'create', '--repo', repository.nameWithOwner, '--title', title, '--body', body],
            signal,
          );
          const url = normalize(created.stdout);
          const number = url ? numberFromUrl(url, 'issues') : undefined;
          if (!url || !number) throw new ToolError('gh issue create did not return an issue URL.');
          issue = { number, url };
        } else if (issueMode === 'reuse') {
          const selector = normalize(input.issue);
          if (!selector) throw new ToolError('prepare with issueMode=reuse requires issue.');
          const viewed = await this.execute(
            operations,
            repository.root,
            'gh',
            ['issue', 'view', selector, '--repo', repository.nameWithOwner, '--json', 'number,url'],
            signal,
          );
          let parsed: { number?: number; url?: string };
          try {
            parsed = JSON.parse(viewed.stdout) as { number?: number; url?: string };
          } catch {
            throw new ToolError('gh issue view returned invalid JSON.');
          }
          if (!Number.isInteger(parsed.number) || !parsed.url)
            throw new ToolError('gh issue view omitted issue identity.');
          issue = { number: parsed.number as number, url: parsed.url };
        } else {
          advisories.push(
            advisory('github.issue_omitted', 'Preparing work without a linked issue was explicitly requested.'),
          );
        }

        const branchName = normalize(input.branch) ?? `feature/${issue?.number ?? 'untracked'}-github-workflow`;
        if (normalize(input.branch)) {
          advisories.push(advisory('github.custom_branch', `Using the explicitly requested branch ${branchName}.`));
        }
        const worktreePath = path.resolve(
          repository.root,
          normalize(input.worktree) ?? path.join('.worktrees', branchName.replaceAll('/', '-')),
        );
        const listed = await this.execute(
          operations,
          repository.root,
          'git',
          ['worktree', 'list', '--porcelain'],
          signal,
        );
        const reused = listed.stdout
          .split(/\n\s*\n/)
          .some((entry) => entry.split('\n').includes(`worktree ${worktreePath}`));
        if (!reused) {
          const localBranch = await this.execute(
            operations,
            repository.root,
            'git',
            ['branch', '--list', branchName],
            signal,
          );
          const worktreeArgs = normalize(localBranch.stdout)
            ? ['worktree', 'add', worktreePath, branchName]
            : ['worktree', 'add', '-b', branchName, worktreePath, `${repository.remote}/${repository.defaultBranch}`];
          await this.execute(operations, repository.root, 'git', worktreeArgs, signal);
        }
        result.issue = issue;
        result.branch = { name: branchName };
        result.worktree = { path: worktreePath, reused };
        return result;
      }

      case 'status': {
        result.pullRequest = await this.viewPullRequest(repository, operations, input.pr, signal);
        return result;
      }

      case 'publish': {
        const branchName =
          normalize(input.branch) ??
          normalize(
            (await this.execute(operations, repository.root, 'git', ['symbolic-ref', '--short', 'HEAD'], signal))
              .stdout,
          );
        if (!branchName) throw new ToolError('publish requires a named branch.');
        if (input.stageAll) {
          advisories.push(
            advisory('github.stage_all', 'All working-tree changes were staged as explicitly requested.'),
          );
          await this.execute(operations, repository.root, 'git', ['add', '--all'], signal);
        } else if (input.stagePaths?.length) {
          await this.execute(operations, repository.root, 'git', ['add', '--', ...input.stagePaths], signal);
        }
        await this.execute(
          operations,
          repository.root,
          'git',
          ['push', '--set-upstream', repository.remote, branchName],
          signal,
        );
        result.branch = { name: branchName };
        if (input.direct) {
          advisories.push(
            advisory(
              'github.direct_publication',
              'The branch was published without creating a pull request, as requested.',
            ),
          );
        } else {
          const args = [
            'pr',
            'create',
            '--repo',
            repository.nameWithOwner,
            '--base',
            repository.defaultBranch,
            '--head',
            branchName,
          ];
          const title = normalize(input.prTitle);
          const body = normalize(input.prBody);
          if (title) args.push('--title', title);
          if (body) args.push('--body', body);
          if (input.draft) args.push('--draft');
          const created = await this.execute(operations, repository.root, 'gh', args, signal);
          const url = normalize(created.stdout);
          const number = url ? numberFromUrl(url, 'pull') : undefined;
          if (!url || !number) throw new ToolError('gh pr create did not return a pull request URL.');
          result.pullRequest = { number, url, headRefName: branchName, baseRefName: repository.defaultBranch };
          if (input.autoMerge === false) {
            advisories.push(advisory('github.auto_merge_disabled', 'Automatic merge was left disabled as requested.'));
          } else {
            await this.execute(
              operations,
              repository.root,
              'gh',
              ['pr', 'merge', String(number), '--repo', repository.nameWithOwner, '--auto', '--squash'],
              signal,
            );
          }
        }
        if (input.direct && input.autoMerge === false) {
          advisories.push(advisory('github.auto_merge_disabled', 'Automatic merge was left disabled as requested.'));
        }
        return result;
      }

      case 'monitor': {
        const selector = normalize(input.pr);
        if (!selector) throw new ToolError('monitor requires pr.');
        result.pullRequest = await this.viewPullRequest(repository, operations, selector, signal);
        const checks = await this.execute(
          operations,
          repository.root,
          'gh',
          ['pr', 'checks', selector, '--repo', repository.nameWithOwner, '--json', CHECK_FIELDS],
          signal,
        );
        let rows: Array<{ state?: string; bucket?: string }> = [];
        if (normalize(checks.stdout)) {
          try {
            rows = JSON.parse(checks.stdout) as Array<{ state?: string; bucket?: string }>;
          } catch {
            throw new ToolError('gh pr checks returned invalid JSON.');
          }
        }
        const states = rows.map((row) => String(row.bucket ?? row.state ?? '').toLowerCase());
        result.checkState = states.some((state) => state.includes('fail') || state.includes('cancel'))
          ? 'failing'
          : states.some((state) => state.includes('pending') || state.includes('queue') || state.includes('progress'))
            ? 'pending'
            : rows.length > 0 && states.every((state) => state.includes('pass') || state.includes('success'))
              ? 'passing'
              : 'unknown';
        if (result.checkState === 'pending') result.retryAfterMs = DEFAULT_RETRY_MS;
        return result;
      }

      case 'repair': {
        result.pullRequest = await this.viewPullRequest(repository, operations, input.pr, signal);
        if (result.pullRequest.mergeStateStatus === 'BEHIND') {
          await this.execute(
            operations,
            repository.root,
            'gh',
            ['pr', 'update-branch', String(result.pullRequest.number), '--repo', repository.nameWithOwner],
            signal,
          );
        } else if (result.pullRequest.mergeStateStatus === 'DIRTY') {
          advisories.push(
            advisory(
              'github.conflict_requires_local_repair',
              'The pull request has conflicts and requires a local merge repair.',
            ),
          );
        } else {
          advisories.push(
            advisory('github.no_repair_needed', 'No branch repair was required by the current pull request state.'),
          );
        }
        return result;
      }

      case 'cleanup': {
        const worktreePath = normalize(input.worktree);
        const branchName = normalize(input.branch);
        if (!worktreePath || !branchName) throw new ToolError('cleanup requires worktree and branch.');
        let mergeVerified = false;
        if (input.cleanupWithoutMergeProof) {
          advisories.push(
            advisory(
              'github.cleanup_without_merge_proof',
              'Cleanup proceeded without proving the pull request was merged.',
            ),
          );
        } else {
          const pullRequest = await this.viewPullRequest(repository, operations, input.pr, signal);
          result.pullRequest = pullRequest;
          if (pullRequest.state !== 'MERGED') throw new ToolError(`Pull request #${pullRequest.number} is not merged.`);
          mergeVerified = true;
        }
        await this.execute(operations, repository.root, 'git', ['worktree', 'remove', worktreePath], signal);
        // Pull requests are normally squash-merged, so Git cannot prove the topic branch is
        // an ancestor of the local base branch. The GitHub merge proof above (or the caller's
        // explicit no-proof override) is the authority to delete this exact local branch.
        await this.execute(operations, repository.root, 'git', ['branch', '--delete', '--force', branchName], signal);
        result.branch = { name: branchName };
        result.worktree = { path: path.resolve(repository.root, worktreePath), reused: false, removed: true };
        result.cleanup = { mergeVerified, branchDeleted: true, worktreeRemoved: true };
        return result;
      }
    }
  }
}

interface ToolSession {
  cwd: string;
}

interface WorkflowToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details?: LifecycleResult;
}

function result(value: LifecycleResult): WorkflowToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], details: value };
}

export function createGitHubWorkflowTools({ Type }: { Type: Typebox }, session: ToolSession) {
  const lifecycle = new GitHubLifecycle();
  const common = {
    repo: Type.Optional(Type.String({ description: 'Repository in OWNER/REPO format.' })),
    remote: Type.Optional(Type.String({ description: 'Git remote name (default: origin).' })),
    base: Type.Optional(Type.String({ description: 'Base branch (default: main).' })),
  };
  const action = Type.Union(
    ['prepare', 'status', 'publish', 'monitor', 'repair', 'cleanup'].map((value) => Type.Literal(value)),
  );
  const workflowParameters = Type.Object({
    action,
    ...common,
    issueMode: Type.Optional(Type.Union(['create', 'reuse', 'none'].map((value) => Type.Literal(value)))),
    issue: Type.Optional(Type.String()),
    issueTitle: Type.Optional(Type.String()),
    issueBody: Type.Optional(Type.String()),
    branch: Type.Optional(Type.String()),
    worktree: Type.Optional(Type.String()),
    stageAll: Type.Optional(Type.Boolean()),
    stagePaths: Type.Optional(Type.Array(Type.String())),
    direct: Type.Optional(Type.Boolean()),
    pr: Type.Optional(Type.String()),
    prTitle: Type.Optional(Type.String()),
    prBody: Type.Optional(Type.String()),
    draft: Type.Optional(Type.Boolean()),
    autoMerge: Type.Optional(Type.Boolean()),
    cleanupWithoutMergeProof: Type.Optional(Type.Boolean()),
  });

  const tool = (
    name: string,
    label: string,
    description: string,
    parameters: unknown,
    execute: (params: Record<string, unknown>, signal?: AbortSignal) => Promise<LifecycleResult>,
  ) => ({
    name,
    label,
    description,
    parameters,
    strict: true,
    async execute(_id: string, params: Record<string, unknown>, signal?: AbortSignal) {
      return result(await execute(params, signal));
    },
  });

  return [
    tool(
      'github_workflow',
      'GitHub Workflow',
      'Run one independently callable GitHub lifecycle stage.',
      workflowParameters,
      (p, signal) => lifecycle.run(session.cwd, p as unknown as LifecycleInput, signal),
    ),
    tool(
      'github_issue_create',
      'GitHub Issue Create',
      'Create an issue and return normalized repository and issue evidence.',
      Type.Object({ ...common, title: Type.String(), body: Type.String() }),
      (p, signal) =>
        lifecycle.createIssue(
          session.cwd,
          { ...p, issueTitle: p.title, issueBody: p.body } as Pick<
            LifecycleInput,
            'repo' | 'remote' | 'base' | 'issueTitle' | 'issueBody'
          >,
          signal,
        ),
    ),
    tool(
      'github_pr_create',
      'GitHub Pull Request Create',
      'Create a pull request for the current or selected published branch.',
      Type.Object({
        ...common,
        branch: Type.Optional(Type.String()),
        title: Type.Optional(Type.String()),
        body: Type.Optional(Type.String()),
        draft: Type.Optional(Type.Boolean()),
      }),
      (p, signal) =>
        lifecycle.createPullRequest(
          session.cwd,
          { ...p, prTitle: p.title, prBody: p.body } as Pick<
            LifecycleInput,
            'repo' | 'remote' | 'base' | 'branch' | 'prTitle' | 'prBody' | 'draft'
          >,
          signal,
        ),
    ),
    tool(
      'github_pr_auto_merge',
      'GitHub Pull Request Auto-Merge',
      'Enable squash auto-merge for a pull request.',
      Type.Object({ ...common, pr: Type.String() }),
      (p, signal) =>
        lifecycle.enableAutoMerge(session.cwd, p as Pick<LifecycleInput, 'repo' | 'remote' | 'base' | 'pr'>, signal),
    ),
    tool(
      'github_pr_update_branch',
      'GitHub Pull Request Update Branch',
      'Update a pull request branch when GitHub reports it behind its base.',
      Type.Object({ ...common, pr: Type.String() }),
      (p, signal) =>
        lifecycle.updatePullRequestBranch(
          session.cwd,
          p as Pick<LifecycleInput, 'repo' | 'remote' | 'base' | 'pr'>,
          signal,
        ),
    ),
    tool(
      'github_worktree_prepare',
      'GitHub Worktree Prepare',
      'Create or reuse an issue-scoped branch and worktree without publishing.',
      Type.Object({
        ...common,
        issueMode: Type.Optional(Type.Union(['create', 'reuse', 'none'].map((value) => Type.Literal(value)))),
        issue: Type.Optional(Type.String()),
        issueTitle: Type.Optional(Type.String()),
        issueBody: Type.Optional(Type.String()),
        branch: Type.Optional(Type.String()),
        worktree: Type.Optional(Type.String()),
      }),
      (p, signal) => lifecycle.run(session.cwd, { ...p, action: 'prepare' } as LifecycleInput, signal),
    ),
    tool(
      'github_worktree_cleanup',
      'GitHub Worktree Cleanup',
      'Remove a worktree and its local branch, with optional merge verification.',
      Type.Object({
        ...common,
        pr: Type.Optional(Type.String()),
        branch: Type.String(),
        worktree: Type.String(),
        cleanupWithoutMergeProof: Type.Optional(Type.Boolean()),
      }),
      (p, signal) => lifecycle.run(session.cwd, { ...p, action: 'cleanup' } as LifecycleInput, signal),
    ),
  ];
}

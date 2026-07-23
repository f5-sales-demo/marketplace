import { mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLUGIN_ROOT = join(import.meta.dir, '..');
const FIXTURES_DIR = join(import.meta.dir, 'fixtures');
const MOCK_GH = join(import.meta.dir, 'mock-gh.sh');

// ---------------------------------------------------------------------------
// PATH-injected mock bootstrap
//
// Bun resolves inherited-spawn binaries from the PATH captured at process
// startup and does not observe later process.env mutations. The unmodified
// tool layer (src/utils/git.ts) spawns `gh` with inherited env, so injecting a
// mock via a runtime process.env.PATH mutation is invisible to it. Instead we
// re-exec this benchmark once with the mock symlinked onto PATH *before* the
// child process starts, so the tools resolve `gh` to the mock. The mock routes
// by argv to fixtures in GH_BENCH_FIXTURES; the live spot-check still reaches
// the real gh via GH_BENCH_ORIG_PATH.
// ---------------------------------------------------------------------------

if (!process.env.GH_BENCH_CHILD) {
  const mockBinDir = mkdtempSync(join(tmpdir(), 'gh-bench-'));
  symlinkSync(MOCK_GH, join(mockBinDir, 'gh'));
  const origPath = process.env.PATH ?? '';
  const child = Bun.spawn([process.execPath, import.meta.path], {
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${origPath}`,
      GH_BENCH_CHILD: '1',
      GH_BENCH_ORIG_PATH: origPath,
      GH_BENCH_FIXTURES: FIXTURES_DIR,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  process.exit(await child.exited);
}

const { Type } = await import('@sinclair/typebox');
const {
  GhExecTool,
  GhHelpTool,
  GhIssueViewTool,
  GhPrViewTool,
  GhRepoViewTool,
  GhSearchIssuesTool,
  GhSearchPrsTool,
  setTypebox,
} = await import('../src/tools/gh');

// gh.ts resolves typebox lazily; inject the real Type before instantiating tools.
setTypebox({ Type });

const SESSION = { cwd: '/tmp' };

// ---------------------------------------------------------------------------
// Scenario infrastructure
// ---------------------------------------------------------------------------

interface ScenarioResult {
  pass: boolean;
  score: number;
}

interface Scenario {
  name: string;
  run: () => Promise<ScenarioResult>;
}

function requireTool<T>(tool: T | null, name: string): T {
  if (!tool) {
    throw new Error(`${name}.createIf returned null (gh not resolvable on PATH)`);
  }
  return tool;
}

function checkResult(
  result: { content: Array<{ text: string }>; isError?: boolean },
  expected: { isError?: boolean; contains?: string[]; notContains?: string[] },
): ScenarioResult {
  const text = result.content[0]?.text ?? '';
  const isError = result.isError ?? false;

  if (expected.isError !== undefined && expected.isError !== isError) {
    return { pass: false, score: 0 };
  }

  let matched = 0;
  let total = 0;

  for (const s of expected.contains ?? []) {
    total++;
    if (text.includes(s)) matched++;
  }

  for (const s of expected.notContains ?? []) {
    total++;
    if (!text.includes(s)) matched++;
  }

  if (total === 0) return { pass: !isError || expected.isError === true, score: 1 };
  const score = matched / total;
  return { pass: score >= 0.8, score };
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  {
    name: 'repo-view',
    async run() {
      const tool = requireTool(GhRepoViewTool.createIf(SESSION), 'GhRepoViewTool');
      const result = await tool.execute('t', { repo: 'octo-org/hello-world' }, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['octo-org/hello-world', 'main', 'TypeScript', 'PUBLIC'],
      });
    },
  },
  {
    name: 'issue-view',
    async run() {
      const tool = requireTool(GhIssueViewTool.createIf(SESSION), 'GhIssueViewTool');
      const result = await tool.execute(
        't',
        { issue: '7', repo: 'octo-org/hello-world', comments: false },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, {
        isError: false,
        contains: ['Issue #7', 'Fix the startup crash', 'OPEN', 'octocat'],
      });
    },
  },
  {
    name: 'pr-view',
    async run() {
      const tool = requireTool(GhPrViewTool.createIf(SESSION), 'GhPrViewTool');
      const result = await tool.execute(
        't',
        { pr: '123', repo: 'octo-org/hello-world', comments: false },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, {
        isError: false,
        contains: ['Pull Request #123', 'Add benchmark fixtures', 'feat/benchmarks', 'OPEN'],
      });
    },
  },
  {
    name: 'search-prs',
    async run() {
      const tool = requireTool(GhSearchPrsTool.createIf(SESSION), 'GhSearchPrsTool');
      const result = await tool.execute('t', { query: 'is:open label:enhancement' }, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['#200', 'Improve the docs', 'octo-org/hello-world'],
      });
    },
  },
  {
    name: 'search-issues',
    async run() {
      const tool = requireTool(GhSearchIssuesTool.createIf(SESSION), 'GhSearchIssuesTool');
      const result = await tool.execute('t', { query: 'is:closed label:bug' }, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['#88', 'Crash on startup', 'CLOSED'],
      });
    },
  },
  {
    name: 'exec-read-diff',
    async run() {
      const tool = requireTool(GhExecTool.createIf(SESSION), 'GhExecTool');
      const result = await tool.execute('t', { args: ['pr', 'diff', '123'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: false, contains: ['diff --git', 'src/index.ts'] });
    },
  },
  {
    name: 'help-valid',
    async run() {
      const tool = requireTool(GhHelpTool.createIf(SESSION), 'GhHelpTool');
      const result = await tool.execute('t', { command_path: 'pr view' }, undefined, undefined, SESSION);
      return checkResult(result, { isError: false, contains: ['gh pr view'] });
    },
  },
  {
    name: 'help-injection-blocked',
    async run() {
      const tool = requireTool(GhHelpTool.createIf(SESSION), 'GhHelpTool');
      const result = await tool.execute('t', { command_path: '$(whoami)' }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['invalid'] });
    },
  },
  {
    name: 'exec-control-char-rejected',
    async run() {
      const tool = requireTool(GhExecTool.createIf(SESSION), 'GhExecTool');
      const result = await tool.execute('t', { args: ['repo', 'view', 'bad\u0000arg'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['control character'] });
    },
  },
  {
    name: 'exec-pr-merge-blocked',
    async run() {
      const tool = requireTool(GhExecTool.createIf(SESSION), 'GhExecTool');
      const result = await tool.execute('t', { args: ['pr', 'merge', '1'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['read-only'] });
    },
  },
  {
    name: 'exec-api-post-blocked',
    async run() {
      const tool = requireTool(GhExecTool.createIf(SESSION), 'GhExecTool');
      const result = await tool.execute('t', { args: ['api', '-X=POST', 'x'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['read-only', 'POST'] });
    },
  },
];

// ---------------------------------------------------------------------------
// Accuracy scoring
// ---------------------------------------------------------------------------

async function measureAccuracy(): Promise<number> {
  let totalScore = 0;
  for (const scenario of scenarios) {
    try {
      const { score } = await scenario.run();
      totalScore += score;
    } catch {}
  }
  return totalScore / scenarios.length;
}

// ---------------------------------------------------------------------------
// Turn efficiency
// ---------------------------------------------------------------------------

function measureTurnEfficiency(): number {
  const promptsDir = join(PLUGIN_ROOT, 'src', 'prompts');
  const promptContent = readdirSync(promptsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(join(promptsDir, f), 'utf-8'))
    .join('\n');

  const tasks = [
    { minTurns: 1, keywords: ['repo', 'OWNER/REPO', '--json'] },
    { minTurns: 1, keywords: ['pr', 'branch', 'gh_exec'] },
    { minTurns: 1, keywords: ['query', 'repo', '--jq'] },
    { minTurns: 1, keywords: ['command_path', 'gh_exec'] },
    { minTurns: 1, keywords: ['--json', '--jq', 'gh api'] },
  ];

  let totalTurns = 0;
  for (const task of tasks) {
    let turns = task.minTurns;
    const missing = task.keywords.filter((kw) => !promptContent.toLowerCase().includes(kw.toLowerCase()));
    turns += missing.length;
    totalTurns += turns;
  }
  return totalTurns / tasks.length;
}

// ---------------------------------------------------------------------------
// Token efficiency
// ---------------------------------------------------------------------------

function measureTokenEfficiency(): number {
  const promptsDir = join(PLUGIN_ROOT, 'src', 'prompts');
  let totalBytes = 0;
  for (const f of readdirSync(promptsDir).filter((f) => f.endsWith('.md'))) {
    totalBytes += statSync(join(promptsDir, f)).size;
  }
  return totalBytes;
}

// ---------------------------------------------------------------------------
// Live CLI spot-check (real gh via the pre-mock PATH)
// ---------------------------------------------------------------------------

async function measureLiveAccuracy(): Promise<number> {
  const liveEnv = { ...process.env, PATH: process.env.GH_BENCH_ORIG_PATH ?? process.env.PATH };
  try {
    const check = Bun.spawnSync(['gh', 'auth', 'status'], { env: liveEnv });
    if (check.exitCode !== 0) return 0;
  } catch {
    return 0;
  }

  const checks = [
    {
      cmd: ['gh', 'repo', 'view', '--json', 'nameWithOwner'],
      validate: (s: string) => typeof JSON.parse(s).nameWithOwner === 'string',
    },
    {
      cmd: ['gh', 'api', 'user', '--jq', '.login'],
      validate: (s: string) => s.trim().length > 0,
    },
  ];

  let passed = 0;
  for (const c of checks) {
    try {
      const proc = Bun.spawn(c.cmd, { stdout: 'pipe', stderr: 'pipe', env: liveEnv });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      if (c.validate(stdout)) passed++;
    } catch {
      // skip
    }
  }
  return passed / checks.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const accuracy = await measureAccuracy();
  const avgTurns = measureTurnEfficiency();
  const avgTokens = measureTokenEfficiency();
  const liveAccuracy = await measureLiveAccuracy();

  const composite = accuracy * (1 / (1 + avgTurns / 10)) * (1 / (1 + avgTokens / 10000));

  console.log(`METRIC accuracy=${accuracy.toFixed(4)}`);
  console.log(`METRIC avg_turns=${avgTurns.toFixed(2)}`);
  console.log(`METRIC avg_tokens=${avgTokens}`);
  console.log(`METRIC live_accuracy=${liveAccuracy.toFixed(4)}`);
  console.log(`METRIC composite_score=${composite.toFixed(6)}`);
  console.log(`ASI hypothesis=${process.env.AUTORESEARCH_HYPOTHESIS ?? 'baseline'}`);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

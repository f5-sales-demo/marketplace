import { mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLUGIN_ROOT = join(import.meta.dir, '..');
const FIXTURES_DIR = join(import.meta.dir, 'fixtures');
const MOCK_GLAB = join(import.meta.dir, 'mock-glab.sh');

// ---------------------------------------------------------------------------
// PATH-injected mock bootstrap
//
// Bun resolves inherited-spawn binaries from the PATH captured at process
// startup and does not observe later process.env mutations. The unmodified
// tool layer (src/tools/shared.ts -> makeExecApi) spawns `glab` with inherited
// env, so injecting a mock via a runtime process.env.PATH mutation is invisible
// to it. Instead we re-exec this benchmark once with the mock symlinked onto
// PATH *before* the child process starts, so the tools resolve `glab` to the
// mock. The mock routes by argv to fixtures in GLAB_BENCH_FIXTURES; the live
// spot-check still reaches the real glab via GLAB_BENCH_ORIG_PATH.
// ---------------------------------------------------------------------------

if (!process.env.GLAB_BENCH_CHILD) {
  const mockBinDir = mkdtempSync(join(tmpdir(), 'glab-bench-'));
  symlinkSync(MOCK_GLAB, join(mockBinDir, 'glab'));
  const origPath = process.env.PATH ?? '';
  const child = Bun.spawn([process.execPath, import.meta.path], {
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${origPath}`,
      GLAB_BENCH_CHILD: '1',
      GLAB_BENCH_ORIG_PATH: origPath,
      GLAB_BENCH_FIXTURES: FIXTURES_DIR,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  process.exit(await child.exited);
}

const Typebox = await import('@sinclair/typebox');
const { createGlabExecTool } = await import('../src/tools/glab-exec');
const { createGlabHelpTool } = await import('../src/tools/glab-help');
const { createGlabIssueListTool } = await import('../src/tools/glab-issue-list');
const { createGlabIssueViewTool } = await import('../src/tools/glab-issue-view');
const { createGlabSearchTool } = await import('../src/tools/glab-search');

// The GitLab tools are factory-style: createGlab*Tool(pi) reads pi.typebox to
// build its parameter schema. Construct the minimal pi stub the factories need.
const pi = { typebox: { Type: Typebox.Type } };

const glabIssueList = createGlabIssueListTool(pi);
const glabIssueView = createGlabIssueViewTool(pi);
const glabSearch = createGlabSearchTool(pi);
const glabHelp = createGlabHelpTool(pi);
const glabExec = createGlabExecTool(pi);

const SESSION = { cwd: '/tmp' };
const PROJECT = 'group/repo';

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
    name: 'issue-list',
    async run() {
      const result = await glabIssueList.execute('t', { project: PROJECT }, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['42', 'Fix the startup crash', 'opened', 'octocat', 'bug'],
      });
    },
  },
  {
    name: 'issue-view',
    async run() {
      const result = await glabIssueView.execute(
        't',
        { issue: '7', project: PROJECT, comments: true },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, {
        isError: false,
        contains: ['Issue #7', 'Investigate login timeout', 'opened', '@hubot', 'I can reproduce this'],
        notContains: ['changed the description'],
      });
    },
  },
  {
    name: 'search',
    async run() {
      const result = await glabSearch.execute(
        't',
        { query: 'login timeout', project: PROJECT },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, {
        isError: false,
        contains: ['15', 'Login timeout on Safari', 'opened'],
      });
    },
  },
  {
    name: 'help-valid',
    async run() {
      const result = await glabHelp.execute('t', { command_path: 'issue list' }, undefined, undefined, SESSION);
      return checkResult(result, { isError: false, contains: ['glab issue list'] });
    },
  },
  {
    name: 'exec-read-issue-list',
    async run() {
      const result = await glabExec.execute(
        't',
        { args: ['issue', 'list', '--output', 'json'] },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, { isError: false, contains: ['Fix the startup crash', '"iid": 42'] });
    },
  },
  {
    name: 'exec-control-char-rejected',
    async run() {
      const result = await glabExec.execute(
        't',
        { args: ['issue', 'view', 'bad\u0000arg'] },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, { isError: true, contains: ['control character'] });
    },
  },
  {
    name: 'exec-mr-merge-blocked',
    async run() {
      const result = await glabExec.execute('t', { args: ['mr', 'merge', '5'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['read-only'] });
    },
  },
  {
    name: 'exec-api-form-blocked',
    async run() {
      const result = await glabExec.execute('t', { args: ['api', '--form', 'x', 'y'] }, undefined, undefined, SESSION);
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
    { minTurns: 1, keywords: ['project', 'state', '--output json'] },
    { minTurns: 1, keywords: ['issue', 'comments', 'glab_exec'] },
    { minTurns: 1, keywords: ['search', 'labels', 'glab_exec'] },
    { minTurns: 1, keywords: ['command_path', 'glab_help'] },
    { minTurns: 1, keywords: ['--output json', 'glab api', 'glab_help'] },
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
// Live CLI spot-check (real glab via the pre-mock PATH)
// ---------------------------------------------------------------------------

async function measureLiveAccuracy(): Promise<number> {
  const liveEnv = { ...process.env, PATH: process.env.GLAB_BENCH_ORIG_PATH ?? process.env.PATH };
  try {
    const check = Bun.spawnSync(['glab', 'auth', 'status'], { env: liveEnv });
    if (check.exitCode !== 0) return 0;
  } catch {
    return 0;
  }

  const checks = [
    {
      cmd: ['glab', 'repo', 'view', '--output', 'json'],
      validate: (s: string) => typeof JSON.parse(s).path_with_namespace === 'string',
    },
    {
      cmd: ['glab', 'api', 'user'],
      validate: (s: string) => typeof JSON.parse(s).username === 'string',
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

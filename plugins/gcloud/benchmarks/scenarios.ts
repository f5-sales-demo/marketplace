import { mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLUGIN_ROOT = join(import.meta.dir, '..');
const FIXTURES_DIR = join(import.meta.dir, 'fixtures');
const MOCK_GCLOUD = join(import.meta.dir, 'mock-gcloud.sh');

// ---------------------------------------------------------------------------
// PATH-injected mock bootstrap
//
// Bun resolves inherited-spawn binaries from the PATH captured at process
// startup and does not observe later process.env mutations. The unmodified
// tool layer (src/tools/shared.ts -> makeExecApi) spawns `gcloud` with inherited
// env, so injecting a mock via a runtime process.env.PATH mutation is invisible
// to it. Instead we re-exec this benchmark once with the mock symlinked onto
// PATH *before* the child process starts, so the tools resolve `gcloud` to the
// mock. The mock routes by argv to fixtures in GCLOUD_BENCH_FIXTURES; the live
// spot-check still reaches the real gcloud via GCLOUD_BENCH_ORIG_PATH.
// ---------------------------------------------------------------------------

if (!process.env.GCLOUD_BENCH_CHILD) {
  const mockBinDir = mkdtempSync(join(tmpdir(), 'gcloud-bench-'));
  symlinkSync(MOCK_GCLOUD, join(mockBinDir, 'gcloud'));
  const origPath = process.env.PATH ?? '';
  const child = Bun.spawn([process.execPath, import.meta.path], {
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${origPath}`,
      GCLOUD_BENCH_CHILD: '1',
      GCLOUD_BENCH_ORIG_PATH: origPath,
      GCLOUD_BENCH_FIXTURES: FIXTURES_DIR,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  process.exit(await child.exited);
}

const Typebox = await import('@sinclair/typebox');
const { createGcloudConfigListTool } = await import('../src/tools/gcloud-config-list');
const { createGcloudProjectsListTool } = await import('../src/tools/gcloud-projects-list');
const { createGcloudComputeInstancesListTool } = await import('../src/tools/gcloud-compute-instances-list');
const { checkGcloud } = await import('../src/tools/gcloud-exec-guard');

// The gcloud tools are factory-style: createGcloud*Tool(pi) reads pi.typebox to
// build its parameter schema. Construct the minimal pi stub the factories need.
const pi = { typebox: { Type: Typebox.Type } };

const gcloudConfigList = createGcloudConfigListTool(pi);
const gcloudProjectsList = createGcloudProjectsListTool(pi);
const gcloudComputeInstancesList = createGcloudComputeInstancesListTool(pi);

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

// A pure-guardrail scenario asserts checkGcloud's blocked verdict without
// spawning gcloud. The score is binary: 1 when the verdict matches.
function checkGuard(args: string[], expectBlocked: boolean): ScenarioResult {
  const { blocked } = checkGcloud(args);
  const pass = blocked === expectBlocked;
  return { pass, score: pass ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  // ── Success scenarios (real tools -> mock gcloud -> fixtures) ────────────
  {
    name: 'config-list',
    async run() {
      const result = await gcloudConfigList.execute('t', {}, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['demo-project-123', 'demo-engineer@example.com', 'us-central1', 'us-central1-a'],
      });
    },
  },
  {
    name: 'projects-list',
    async run() {
      const result = await gcloudProjectsList.execute('t', {}, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['demo-project-123', 'Demo Project', 'demo-staging-456', 'ACTIVE'],
      });
    },
  },
  {
    name: 'compute-instances-list',
    async run() {
      const result = await gcloudComputeInstancesList.execute('t', {}, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['demo-web-1', 'us-central1-a', 'e2-medium', 'RUNNING', '10.128.0.2', '34.68.1.2'],
      });
    },
  },

  // ── Guardrail scenarios (pure checkGcloud, no spawn) ─────────────────────
  {
    name: 'guard-compute-instances-delete-blocked',
    async run() {
      return checkGuard(['compute', 'instances', 'delete', 'x'], true);
    },
  },
  {
    name: 'guard-get-credentials-blocked',
    async run() {
      return checkGuard(['container', 'clusters', 'get-credentials', 'c'], true);
    },
  },
  {
    name: 'guard-compute-ssh-blocked',
    async run() {
      return checkGuard(['compute', 'ssh', 'vm'], true);
    },
  },
  {
    name: 'guard-sql-connect-blocked',
    async run() {
      return checkGuard(['sql', 'connect', 'i'], true);
    },
  },
  {
    name: 'guard-auth-print-access-token-blocked',
    async run() {
      return checkGuard(['auth', 'print-access-token'], true);
    },
  },
  {
    name: 'guard-filtered-read-allowed',
    async run() {
      return checkGuard(['compute', 'instances', 'list', '--filter=status=RUNNING'], false);
    },
  },
];

// ---------------------------------------------------------------------------
// Accuracy scoring
// ---------------------------------------------------------------------------

interface AccuracyReport {
  accuracy: number;
  failures: string[];
}

async function measureAccuracy(): Promise<AccuracyReport> {
  let totalScore = 0;
  const failures: string[] = [];
  for (const scenario of scenarios) {
    try {
      const { pass, score } = await scenario.run();
      totalScore += score;
      if (!pass) failures.push(scenario.name);
    } catch (err) {
      failures.push(`${scenario.name} (threw: ${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return { accuracy: totalScore / scenarios.length, failures };
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
    { minTurns: 1, keywords: ['config', 'project', 'account'] },
    { minTurns: 1, keywords: ['projects', 'lifecycleState', 'filter'] },
    { minTurns: 1, keywords: ['compute', 'instances', 'zone'] },
    { minTurns: 1, keywords: ['command_path', 'gcloud_help'] },
    { minTurns: 1, keywords: ['--format=json', 'gcloud_exec', 'read-only'] },
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
// Live CLI spot-check (real gcloud via the pre-mock PATH)
// ---------------------------------------------------------------------------

async function measureLiveAccuracy(): Promise<number> {
  const liveEnv = { ...process.env, PATH: process.env.GCLOUD_BENCH_ORIG_PATH ?? process.env.PATH };
  try {
    const check = Bun.spawnSync(['gcloud', 'version'], { env: liveEnv });
    if (check.exitCode !== 0) return 0;
  } catch {
    return 0;
  }

  const checks = [
    {
      cmd: ['gcloud', 'config', 'list', '--format=json'],
      validate: (s: string) => typeof JSON.parse(s) === 'object',
    },
    {
      cmd: ['gcloud', 'auth', 'list', '--format=json'],
      validate: (s: string) => Array.isArray(JSON.parse(s)),
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
  const { accuracy, failures } = await measureAccuracy();
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

  // Hard gate: any failing scenario (success or guardrail) is a benchmark
  // failure. The composite is still reported above for autoresearch logging.
  if (failures.length > 0) {
    console.error(`Benchmark FAILED: ${failures.length} scenario(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

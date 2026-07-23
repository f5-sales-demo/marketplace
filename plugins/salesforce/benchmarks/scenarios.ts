import { mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLUGIN_ROOT = join(import.meta.dir, '..');
const FIXTURES_DIR = join(import.meta.dir, 'fixtures');
const MOCK_SF = join(import.meta.dir, 'mock-sf.sh');

// ---------------------------------------------------------------------------
// PATH-injected mock bootstrap
//
// Bun resolves inherited-spawn binaries from the PATH captured at process
// startup and does not observe later process.env mutations. The unmodified
// tool layer (src/tools/shared.ts -> makeExecApi) spawns `sf` with inherited
// env, so injecting a mock via a runtime process.env.PATH mutation is invisible
// to it. Instead we re-exec this benchmark once with the mock symlinked onto
// PATH *before* the child process starts, so the tools resolve `sf` to the
// mock. The mock routes by argv to fixtures in SF_BENCH_FIXTURES; the live
// spot-check still reaches the real sf via SF_BENCH_ORIG_PATH.
// ---------------------------------------------------------------------------

if (!process.env.SF_BENCH_CHILD) {
  const mockBinDir = mkdtempSync(join(tmpdir(), 'sf-bench-'));
  symlinkSync(MOCK_SF, join(mockBinDir, 'sf'));
  const origPath = process.env.PATH ?? '';
  const child = Bun.spawn([process.execPath, import.meta.path], {
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${origPath}`,
      SF_BENCH_CHILD: '1',
      SF_BENCH_ORIG_PATH: origPath,
      SF_BENCH_FIXTURES: FIXTURES_DIR,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  process.exit(await child.exited);
}

const Typebox = await import('@sinclair/typebox');
const { createSfSetupTool } = await import('../src/tools/sf-setup');
const { createSfQueryTool } = await import('../src/tools/sf-query');
const { createSfOrgDisplayTool } = await import('../src/tools/sf-org-display');
const { createSfHelpTool } = await import('../src/tools/sf-help');
const { createSfExecTool } = await import('../src/tools/sf-exec');

// The Salesforce tools are factory-style: createSf*Tool(pi) reads pi.typebox to
// build its parameter schema. Construct the minimal pi stub the factories need.
const pi = { typebox: { Type: Typebox.Type } };

const sfSetup = createSfSetupTool(pi);
const sfQuery = createSfQueryTool(pi);
const sfOrgDisplay = createSfOrgDisplayTool(pi);
const sfHelp = createSfHelpTool(pi);
const sfExec = createSfExecTool(pi);

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

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  {
    name: 'setup-status',
    async run() {
      const result = await sfSetup.execute('t', { action: 'status' }, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['SFDC', 'demo@f5.com', 'Connected'],
      });
    },
  },
  {
    name: 'query',
    async run() {
      const result = await sfQuery.execute(
        't',
        { query: 'SELECT Name, Amount, StageName FROM Opportunity' },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, {
        isError: false,
        contains: ['2 records returned', 'Acme Renewal', 'Closed Won'],
      });
    },
  },
  {
    name: 'org-display',
    async run() {
      const result = await sfOrgDisplay.execute('t', {}, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['SFDC', 'demo@f5.com', 'Connected'],
      });
    },
  },
  {
    name: 'help-valid',
    async run() {
      const result = await sfHelp.execute('t', { command_path: 'org list' }, undefined, undefined, SESSION);
      return checkResult(result, { isError: false, contains: ['sf org list'] });
    },
  },
  {
    name: 'exec-read-org-list',
    async run() {
      const result = await sfExec.execute('t', { args: ['org', 'list'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: false, contains: ['SFDC', 'demo@f5.com'] });
    },
  },
  {
    name: 'exec-control-char-rejected',
    async run() {
      // String.fromCharCode(0) yields a real NUL control byte at runtime while
      // keeping the source pure ASCII; hasControlChars must reject it before spawn.
      const result = await sfExec.execute(
        't',
        { args: ['org', 'list', `bad${String.fromCharCode(0)}arg`] },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, { isError: true, contains: ['control character'] });
    },
  },
  {
    name: 'exec-apex-run-blocked',
    async run() {
      const result = await sfExec.execute('t', { args: ['apex', 'run'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['read-only'] });
    },
  },
  {
    name: 'exec-colon-form-blocked',
    async run() {
      const result = await sfExec.execute('t', { args: ['data:create'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['read-only'] });
    },
  },
  {
    name: 'exec-api-body-flag-blocked',
    async run() {
      const result = await sfExec.execute(
        't',
        { args: ['api', 'request', 'rest', '-f', 'x'] },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, { isError: true, contains: ['read-only'] });
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
    { minTurns: 1, keywords: ['status', 'set_default', 'sf_setup'] },
    { minTurns: 1, keywords: ['description', 'SOQL', 'sf_query'] },
    { minTurns: 1, keywords: ['org', 'connectivity', 'sf_org_display'] },
    { minTurns: 1, keywords: ['command_path', 'sf_help'] },
    { minTurns: 1, keywords: ['--json', 'read-only', 'sf_exec'] },
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
// Live CLI spot-check (real sf via the pre-mock PATH)
// ---------------------------------------------------------------------------

async function measureLiveAccuracy(): Promise<number> {
  const liveEnv = { ...process.env, PATH: process.env.SF_BENCH_ORIG_PATH ?? process.env.PATH };
  try {
    const check = Bun.spawnSync(['sf', 'org', 'list', '--json'], { env: liveEnv });
    if (check.exitCode !== 0) return 0;
  } catch {
    return 0;
  }

  const checks = [
    {
      cmd: ['sf', 'org', 'list', '--json'],
      validate: (s: string) => typeof JSON.parse(s).status === 'number',
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

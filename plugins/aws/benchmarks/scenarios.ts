import { mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLUGIN_ROOT = join(import.meta.dir, '..');
const FIXTURES_DIR = join(import.meta.dir, 'fixtures');
const MOCK_AWS = join(import.meta.dir, 'mock-aws.sh');

// ---------------------------------------------------------------------------
// PATH-injected mock bootstrap
//
// Bun resolves inherited-spawn binaries from the PATH captured at process
// startup and does not observe later process.env mutations. The unmodified
// tool layer (src/tools/shared.ts -> makeExecApi) spawns `aws` with inherited
// env, so injecting a mock via a runtime process.env.PATH mutation is invisible
// to it. Instead we re-exec this benchmark once with the mock symlinked onto
// PATH *before* the child process starts, so the tools resolve `aws` to the
// mock. The mock routes by argv to fixtures in AWS_BENCH_FIXTURES; the live
// spot-check still reaches the real aws via AWS_BENCH_ORIG_PATH.
// ---------------------------------------------------------------------------

if (!process.env.AWS_BENCH_CHILD) {
  const mockBinDir = mkdtempSync(join(tmpdir(), 'aws-bench-'));
  symlinkSync(MOCK_AWS, join(mockBinDir, 'aws'));
  const origPath = process.env.PATH ?? '';
  const child = Bun.spawn([process.execPath, import.meta.path], {
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${origPath}`,
      AWS_BENCH_CHILD: '1',
      AWS_BENCH_ORIG_PATH: origPath,
      AWS_BENCH_FIXTURES: FIXTURES_DIR,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  process.exit(await child.exited);
}

const Typebox = await import('@sinclair/typebox');
const { createAwsStsWhoamiTool } = await import('../src/tools/aws-sts-whoami');
const { createAwsS3LsTool } = await import('../src/tools/aws-s3-ls');
const { createAwsEc2DescribeInstancesTool } = await import('../src/tools/aws-ec2-describe-instances');
const { createAwsHelpTool } = await import('../src/tools/aws-help');
const { createAwsExecTool } = await import('../src/tools/aws-exec');

// The AWS tools are factory-style: createAws*Tool(pi) reads pi.typebox to build
// its parameter schema. Construct the minimal pi stub the factories need.
const pi = { typebox: { Type: Typebox.Type } };

const awsStsWhoami = createAwsStsWhoamiTool(pi);
const awsS3Ls = createAwsS3LsTool(pi);
const awsEc2DescribeInstances = createAwsEc2DescribeInstancesTool(pi);
const awsHelp = createAwsHelpTool(pi);
const awsExec = createAwsExecTool(pi);

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
    name: 'sts-whoami',
    async run() {
      const result = await awsStsWhoami.execute('t', {}, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['123456789012', 'arn:aws:iam::123456789012:user/demo-engineer', 'AIDAEXAMPLEUSERID123'],
      });
    },
  },
  {
    name: 's3-ls-buckets',
    async run() {
      const result = await awsS3Ls.execute('t', {}, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['demo-assets', 'demo-logs'],
      });
    },
  },
  {
    name: 'ec2-describe-instances',
    async run() {
      const result = await awsEc2DescribeInstances.execute('t', {}, undefined, undefined, SESSION);
      return checkResult(result, {
        isError: false,
        contains: ['i-0123456789abcdef0', 'running', 't3.medium', 'us-east-1a', 'demo-web-1'],
      });
    },
  },
  {
    name: 'help-valid',
    async run() {
      const result = await awsHelp.execute(
        't',
        { command_path: 'ec2 describe-instances' },
        undefined,
        undefined,
        SESSION,
      );
      return checkResult(result, { isError: false, contains: ['aws ec2 describe-instances'] });
    },
  },
  {
    name: 'exec-read-describe-instances',
    async run() {
      const result = await awsExec.execute('t', { args: ['ec2', 'describe-instances'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: false, contains: ['i-0123456789abcdef0', 'Reservations'] });
    },
  },
  {
    name: 'exec-control-char-rejected',
    async run() {
      const result = await awsExec.execute('t', { args: ['s3', 'ls', 'bad\u0000arg'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['control character'] });
    },
  },
  {
    name: 'exec-run-instances-blocked',
    async run() {
      const result = await awsExec.execute('t', { args: ['ec2', 'run-instances'] }, undefined, undefined, SESSION);
      return checkResult(result, { isError: true, contains: ['read-only'] });
    },
  },
  {
    name: 'exec-s3-rm-blocked',
    async run() {
      const result = await awsExec.execute('t', { args: ['s3', 'rm', 's3://b/k'] }, undefined, undefined, SESSION);
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
    { minTurns: 1, keywords: ['sts', 'get-caller-identity', 'profile'] },
    { minTurns: 1, keywords: ['s3', 'bucket', 'aws_s3_ls'] },
    { minTurns: 1, keywords: ['ec2', 'describe-instances', 'region'] },
    { minTurns: 1, keywords: ['command_path', 'aws_help'] },
    { minTurns: 1, keywords: ['--output json', 'aws_exec', 'read-only'] },
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
// Live CLI spot-check (real aws via the pre-mock PATH)
// ---------------------------------------------------------------------------

async function measureLiveAccuracy(): Promise<number> {
  const liveEnv = { ...process.env, PATH: process.env.AWS_BENCH_ORIG_PATH ?? process.env.PATH };
  try {
    const check = Bun.spawnSync(['aws', 'sts', 'get-caller-identity', '--output', 'json'], { env: liveEnv });
    if (check.exitCode !== 0) return 0;
  } catch {
    return 0;
  }

  const checks = [
    {
      cmd: ['aws', 'sts', 'get-caller-identity', '--output', 'json'],
      validate: (s: string) => typeof JSON.parse(s).Account === 'string',
    },
    {
      cmd: ['aws', 's3api', 'list-buckets', '--output', 'json'],
      validate: (s: string) => Array.isArray(JSON.parse(s).Buckets),
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

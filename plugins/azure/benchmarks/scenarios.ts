import { mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import { createAzAccountTool } from '../src/tools/az-account';
import { createAzExecTool } from '../src/tools/az-exec';
import { createAzGroupTool } from '../src/tools/az-group';
import { createAzHelpTool } from '../src/tools/az-help';
import { createAzResourceTool } from '../src/tools/az-resource';
import { createAzVmTool } from '../src/tools/az-vm';

const PLUGIN_ROOT = join(import.meta.dir, '..');
const FIXTURES_DIR = join(import.meta.dir, 'fixtures');
const MOCK_AZ = join(import.meta.dir, 'mock-az.sh');

const pi = { typebox: { Type } };

// ---------------------------------------------------------------------------
// PATH-based mock: create a temp dir with mock "az" and prepend to PATH
// ---------------------------------------------------------------------------

const mockBinDir = mkdtempSync(join(tmpdir(), 'az-bench-'));
symlinkSync(MOCK_AZ, join(mockBinDir, 'az'));

function fixtureAbsPath(name: string): string {
  return join(FIXTURES_DIR, name);
}

function withFixture<T>(fixtureName: string, fn: () => Promise<T>): Promise<T> {
  const origPath = process.env.PATH;
  const origFixture = process.env.MOCK_AZ_FIXTURE;
  process.env.PATH = `${mockBinDir}:${origPath}`;
  process.env.MOCK_AZ_FIXTURE = fixtureAbsPath(fixtureName);
  return fn().finally(() => {
    process.env.PATH = origPath;
    process.env.MOCK_AZ_FIXTURE = origFixture;
  });
}

function withHelpMock<T>(helpText: string, fn: () => Promise<T>): Promise<T> {
  const origPath = process.env.PATH;
  const origHelp = process.env.MOCK_AZ_HELP;
  const origFixture = process.env.MOCK_AZ_FIXTURE;
  process.env.PATH = `${mockBinDir}:${origPath}`;
  process.env.MOCK_AZ_HELP = helpText;
  delete process.env.MOCK_AZ_FIXTURE;
  return fn().finally(() => {
    process.env.PATH = origPath;
    process.env.MOCK_AZ_HELP = origHelp;
    process.env.MOCK_AZ_FIXTURE = origFixture;
  });
}

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
    name: 'account-show-current',
    run: () =>
      withFixture('account-show.json', async () => {
        const tool = createAzAccountTool(pi);
        const result = await tool.execute('t', { action: 'show' }, null, null, { cwd: '/tmp' });
        return checkResult(result, {
          isError: false,
          contains: ['Dev Subscription', '11111111-2222-3333-4444-555555555555', 'Enabled'],
        });
      }),
  },
  {
    name: 'account-show-by-id',
    run: () =>
      withFixture('account-show.json', async () => {
        const tool = createAzAccountTool(pi);
        const result = await tool.execute(
          't',
          { action: 'show', subscription: '11111111-2222-3333-4444-555555555555' },
          null,
          null,
          { cwd: '/tmp' },
        );
        return checkResult(result, { isError: false, contains: ['Dev Subscription'] });
      }),
  },
  {
    name: 'account-list-all',
    run: () =>
      withFixture('account-list.json', async () => {
        const tool = createAzAccountTool(pi);
        const result = await tool.execute('t', { action: 'list' }, null, null, { cwd: '/tmp' });
        return checkResult(result, {
          isError: false,
          contains: ['Dev Subscription', 'Staging Subscription', 'Prod Subscription'],
        });
      }),
  },
  {
    name: 'account-list-filtered',
    run: () =>
      withFixture('account-list.json', async () => {
        const tool = createAzAccountTool(pi);
        const result = await tool.execute('t', { action: 'list', subscription: 'Staging' }, null, null, {
          cwd: '/tmp',
        });
        return checkResult(result, {
          isError: false,
          contains: ['Staging Subscription'],
          notContains: ['Prod Subscription'],
        });
      }),
  },
  {
    name: 'account-injection-rejected',
    async run() {
      const tool = createAzAccountTool(pi);
      const result = await tool.execute('t', { action: 'show', subscription: '$(whoami)' }, null, null, {
        cwd: '/tmp',
      });
      return checkResult(result, { isError: true, contains: ['invalid'] });
    },
  },
  {
    name: 'group-list',
    run: () =>
      withFixture('group-list.json', async () => {
        const tool = createAzGroupTool(pi);
        const result = await tool.execute('t', { action: 'list' }, null, null, { cwd: '/tmp' });
        return checkResult(result, {
          isError: false,
          contains: ['rg-dev-eastus', 'rg-staging-westus2', 'rg-prod-eastus'],
        });
      }),
  },
  {
    name: 'group-show',
    run: () =>
      withFixture('group-show.json', async () => {
        const tool = createAzGroupTool(pi);
        const result = await tool.execute('t', { action: 'show', name: 'rg-dev-eastus' }, null, null, { cwd: '/tmp' });
        return checkResult(result, { isError: false, contains: ['rg-dev-eastus', 'eastus'] });
      }),
  },
  {
    name: 'resource-list',
    run: () =>
      withFixture('resource-list.json', async () => {
        const tool = createAzResourceTool(pi);
        const result = await tool.execute('t', { resource_group: 'rg-dev-eastus' }, null, null, { cwd: '/tmp' });
        return checkResult(result, {
          isError: false,
          contains: ['web-vm-01', 'devstore001', 'Microsoft.Compute/virtualMachines'],
        });
      }),
  },
  {
    name: 'resource-injection-rejected',
    async run() {
      const tool = createAzResourceTool(pi);
      const result = await tool.execute('t', { resource_group: ';rm -rf /' }, null, null, { cwd: '/tmp' });
      return checkResult(result, { isError: true, contains: ['invalid'] });
    },
  },
  {
    name: 'vm-list-basic',
    run: () =>
      withFixture('vm-list.json', async () => {
        const tool = createAzVmTool(pi);
        const result = await tool.execute('t', {}, null, null, { cwd: '/tmp' });
        return checkResult(result, {
          isError: false,
          contains: ['web-vm-01', 'db-vm-01', 'Standard_D2s_v5'],
          notContains: ['azureuser'],
        });
      }),
  },
  {
    name: 'vm-list-details',
    run: () =>
      withFixture('vm-list-details.json', async () => {
        const tool = createAzVmTool(pi);
        const result = await tool.execute('t', { show_details: true }, null, null, { cwd: '/tmp' });
        return checkResult(result, {
          isError: false,
          contains: ['web-vm-01', '20.0.0.1', 'VM running', 'Public IPs'],
          notContains: ['azureuser'],
        });
      }),
  },
  {
    name: 'exec-safe-args',
    run: () =>
      withFixture('group-list.json', async () => {
        const tool = createAzExecTool(pi);
        const result = await tool.execute('t', { args: ['group', 'list'] }, null, null, { cwd: '/tmp' });
        return checkResult(result, { isError: false, contains: ['rg-dev-eastus'] });
      }),
  },
  {
    name: 'exec-injection-blocked',
    async run() {
      const tool = createAzExecTool(pi);
      const result = await tool.execute('t', { args: ['vm', 'list;rm -rf /'] }, null, null, { cwd: '/tmp' });
      return checkResult(result, { isError: true, contains: ['unsafe'] });
    },
  },
  {
    name: 'help-valid',
    run: () =>
      withHelpMock('Group\n    az vm : Manage Linux or Windows virtual machines.\n', async () => {
        const tool = createAzHelpTool(pi);
        const result = await tool.execute('t', { command_path: 'vm' }, null, null, { cwd: '/tmp' });
        return checkResult(result, { isError: false, contains: ['az vm'] });
      }),
  },
  {
    name: 'help-injection-blocked',
    async run() {
      const tool = createAzHelpTool(pi);
      const result = await tool.execute('t', { command_path: '$(whoami)' }, null, null, { cwd: '/tmp' });
      return checkResult(result, { isError: true, contains: ['invalid'] });
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
    { minTurns: 1, keywords: ['account show', '--subscription'] },
    { minTurns: 1, keywords: ['--show-details', '--resource-group', 'publicIps'] },
    { minTurns: 1, keywords: ['storage account', 'az_exec', '--subscription'] },
    { minTurns: 1, keywords: ['--tag', 'key=value', 'key[=value]'] },
    { minTurns: 1, keywords: ['az_help', 'command_path', 'network'] },
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
// Live CLI spot-check
// ---------------------------------------------------------------------------

async function measureLiveAccuracy(): Promise<number> {
  try {
    const check = Bun.spawnSync(['az', 'account', 'show', '--output', 'json']);
    if (check.exitCode !== 0) return 0;
  } catch {
    return 0;
  }

  const checks = [
    {
      cmd: ['az', 'account', 'show', '--output', 'json'],
      validate: (s: string) => {
        const d = JSON.parse(s);
        return typeof d.id === 'string' && typeof d.name === 'string';
      },
    },
    {
      cmd: ['az', 'account', 'list', '--output', 'json'],
      validate: (s: string) => {
        const d = JSON.parse(s);
        return Array.isArray(d) && d.every((e: Record<string, unknown>) => typeof e.id === 'string');
      },
    },
    {
      cmd: ['az', 'group', 'list', '--output', 'json'],
      validate: (s: string) => Array.isArray(JSON.parse(s)),
    },
  ];

  let passed = 0;
  for (const c of checks) {
    try {
      const proc = Bun.spawn(c.cmd, { stdout: 'pipe', stderr: 'pipe' });
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

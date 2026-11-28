import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCleanupObservationConcurrency } from '../../src/ce/bounded-cleanup-observations';
import { createGcpCaptureCleanupCli, gcpCaptureCleanupReadCommands } from '../../src/ce/capture-cleanup-cli';
import { observerOwnershipFixture } from './observer-ownership-fixtures';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
// Retain native child diagnostics on every outcome; these are source fixtures.
async function fixture(
  body = "print(json.dumps({'args':sys.argv[1:],'project':os.environ['CLOUDSDK_CORE_PROJECT'],'account':os.environ['CLOUDSDK_CORE_ACCOUNT'],'configuration':os.environ['CLOUDSDK_ACTIVE_CONFIG_NAME']}))",
) {
  const { i: intent } = observerOwnershipFixture();
  const root = await mkdtemp(join(tmpdir(), 'gcp-cleanup-cli-'));
  const directory = join(root, 'original');
  const diagnosticsDirectory = join(root, 'observations');
  await mkdir(directory, { mode: 0o700 });
  await mkdir(diagnosticsDirectory, { mode: 0o700 });
  await mkdir(join(directory, '.terraform-executor-lock'), { mode: 0o700 });
  const retained = join(directory, '.terraform-executor-lock', 'capture-unresolved.json');
  await writeFile(retained, 'original-failed-capture', { mode: 0o400 });
  const executable = join(root, 'fixture-gcloud');
  await writeFile(executable, `#!${python}\nimport json,os,sys,time\nfrom pathlib import Path\n${body}\n`, {
    mode: 0o700,
  });
  await chmod(executable, 0o700);
  let closureChecks = 0,
    inputChanged = false;
  const options = {
    intent,
    directory,
    diagnosticsDirectory,
    python: { path: python, sha256: hash(await readFile(python)) },
    gcloud: { path: executable, sha256: hash(await readFile(executable)) },
    account: 'EXAMPLE_ACCOUNT',
    configuration: 'source-fixture',
    environment: { PATH: process.env.PATH, CLOUDSDK_CONFIG: root },
    assertInputs: async () => {
      if (inputChanged) throw new Error('Original configuration changed');
      expect(await readFile(retained, 'utf8')).toBe('original-failed-capture');
    },
    assertIndependentClosure: async () => {
      closureChecks++;
    },
  };
  return {
    intent,
    root,
    directory,
    diagnosticsDirectory,
    retained,
    executable,
    options,
    closureChecks: () => closureChecks,
    changeInputs: () => {
      inputChanged = true;
    },
  };
}

test('cleanup CLI binds the exact source observation argv to original account, project, configuration and native executable', async () => {
  const f = await fixture();
  const api = createGcpCaptureCleanupCli(f.options);
  const args = gcpCaptureCleanupReadCommands(f.intent)[0];
  const result = await api.exec('gcloud', [...args]);
  expect(result.exitCode).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.args).toEqual([...args, '--account=EXAMPLE_ACCOUNT', '--configuration=source-fixture']);
  expect(report.project).toBe(f.intent.project);
  expect(report.account).toBe('EXAMPLE_ACCOUNT');
  expect(report.configuration).toBe('source-fixture');
  expect(f.closureChecks()).toBeGreaterThan(1);
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
});

test('cleanup read inventory covers original cloud identities, firewall insert joins and observer image/NIC evidence', async () => {
  const f = await fixture();
  const commands = gcpCaptureCleanupReadCommands(f.intent);
  expect(commands.filter((args) => args.at(-1) === '--format=json(id,selfLink)')).toHaveLength(17);
  expect(commands.filter((args) => args[1] === 'operations')).toHaveLength(5);
  expect(commands.filter((args) => args.includes('--format=json(id,selfLink,creationTimestamp)'))).toHaveLength(5);
  expect(commands.filter((args) => args.includes('--format=json(id,selfLink,sourceImage,sourceImageId)'))).toHaveLength(
    1,
  );
  expect(
    commands.filter((args) =>
      args.includes('--format=json(id,selfLink,serviceAccounts,canIpForward,networkInterfaces)'),
    ),
  ).toHaveLength(1);
  expect(new Set(commands.map((args) => JSON.stringify(args))).size).toBe(commands.length);
});

test('cleanup refuses command, scope, format, credential and configuration changes before spawning', async () => {
  const f = await fixture('raise RuntimeError("must-not-run")');
  const api = createGcpCaptureCleanupCli(f.options);
  const args = [...gcpCaptureCleanupReadCommands(f.intent)[0]];
  for (const [command, changed] of [
    ['sh', args],
    ['gcloud', [...args, '--account=FOREIGN_ACCOUNT']],
    ['gcloud', [...args, '--configuration=foreign']],
    ['gcloud', [...args, '--impersonate-service-account=foreign']],
    ['gcloud', args.map((arg) => (arg.startsWith('--project=') ? '--project=foreign-project' : arg))],
    ['gcloud', args.map((arg) => (arg.startsWith('--format=') ? '--format=json' : arg))],
    ['gcloud', args.map((arg) => (arg === 'describe' ? 'delete' : arg))],
    ['gcloud', [...args, '; touch injected']],
  ] as [string, string[]][])
    await expect(api.exec(command, changed)).rejects.toThrow();
  expect(await Array.fromAsync(new Bun.Glob('**/bootstrap.json').scan({ cwd: f.diagnosticsDirectory }))).toHaveLength(
    0,
  );
});

for (const alternative of [
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT',
])
  test(`cleanup refuses an environment credential alternative: ${alternative}`, async () => {
    const f = await fixture();
    expect(() =>
      createGcpCaptureCleanupCli({ ...f.options, environment: { ...f.options.environment, [alternative]: 'foreign' } }),
    ).toThrow();
  });

test('cleanup refuses changed source inputs or a still-live original reader before any command', async () => {
  const f = await fixture();
  const api = createGcpCaptureCleanupCli(f.options);
  f.changeInputs();
  await expect(api.exec('gcloud', [...gcpCaptureCleanupReadCommands(f.intent)[0]])).rejects.toThrow();
  const g = await fixture();
  const live = createGcpCaptureCleanupCli({
    ...g.options,
    assertIndependentClosure: async () => {
      throw new Error('Original reader remains live');
    },
  });
  await expect(live.exec('gcloud', [...gcpCaptureCleanupReadCommands(g.intent)[0]])).rejects.toThrow();
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
  expect(await readFile(g.retained, 'utf8')).toBe('original-failed-capture');
});

test('cleanup cancellation preserves natural CLI completion, final capture and the original failed claim', async () => {
  const f = await fixture(
    "Path('started').write_text('yes')\ntime.sleep(0.5)\nPath('completed').write_text('yes')\nprint('{}')",
  );
  const api = createGcpCaptureCleanupCli(f.options),
    controller = new AbortController();
  const pending = api.exec('gcloud', [...gcpCaptureCleanupReadCommands(f.intent)[0]], { signal: controller.signal });
  const deadline = Date.now() + 5000;
  let started = false;
  while (!started && Date.now() < deadline) {
    started = (await Array.fromAsync(new Bun.Glob('**/started').scan({ cwd: f.diagnosticsDirectory }))).length === 1;
    if (!started) await Bun.sleep(10);
  }
  expect(started).toBe(true);
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(await Array.fromAsync(new Bun.Glob('**/completed').scan({ cwd: f.diagnosticsDirectory }))).toHaveLength(1);
  const captures = await Array.fromAsync(
    new Bun.Glob('**/cleanup-observation-final.private.json').scan({ cwd: f.diagnosticsDirectory }),
  );
  expect(captures).toHaveLength(1);
  const capture = JSON.parse(await readFile(join(f.diagnosticsDirectory, captures[0]), 'utf8'));
  expect(capture.signalsSent).toBe(false);
  expect(capture.originalGroupClosed).toBe(true);
  expect(capture.reason).toBe('cancelled');
  expect(capture.finalDeadlineMs - capture.finalStartedMs).toBe(300000);
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
});

test('cleanup snapshots original arguments and options before awaiting guards', async () => {
  const f = await fixture();
  const api = createGcpCaptureCleanupCli(f.options);
  const args = [...gcpCaptureCleanupReadCommands(f.intent)[0]],
    original = [...args];
  const pending = api.exec('gcloud', args);
  args.push('--project=foreign-project');
  f.options.account = 'FOREIGN_ACCOUNT';
  f.intent.project = 'foreign-project';
  const result = await pending;
  expect(JSON.parse(result.stdout).args).toEqual([
    ...original,
    '--account=EXAMPLE_ACCOUNT',
    '--configuration=source-fixture',
  ]);
});

test('cleanup preserves bounded CLI failure diagnostics and never reports failed authentication as absence', async () => {
  const f = await fixture("print('reauthentication required',file=sys.stderr)\nsys.exit(1)");
  const api = createGcpCaptureCleanupCli(f.options);
  const result = await api.exec('gcloud', [...gcpCaptureCleanupReadCommands(f.intent)[0]]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('reauthentication required');
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
});

test('native cleanup transport permits exactly three qualified independent reads with one original budget', async () => {
  const f = await fixture();
  const api = createGcpCaptureCleanupCli({ ...f.options, readConcurrency: 3 });
  expect(readCleanupObservationConcurrency(api)).toBe(3);
  expect(readCleanupObservationConcurrency({ ...api })).toBe(1);
  const args = gcpCaptureCleanupReadCommands(f.intent).slice(0, 3);
  const results = await Promise.all(args.map((argv) => api.exec('gcloud', [...argv])));
  expect(results.map((r) => r.exitCode)).toEqual([0, 0, 0]);
  const files = await Array.fromAsync(
    new Bun.Glob('**/cleanup-observation-final.private.json').scan({ cwd: f.diagnosticsDirectory }),
  );
  expect(files).toHaveLength(3);
  const rows = await Promise.all(
    files.map(async (p) => JSON.parse(await readFile(join(f.diagnosticsDirectory, p), 'utf8'))),
  );
  expect(new Set(rows.map((r) => r.originalDeadlineMs)).size).toBe(1);
  expect(new Set(rows.map((r) => r.identity.group)).size).toBe(3);
  for (const row of rows) {
    expect(row.signalsSent).toBe(false);
    expect(row.originalGroupClosed).toBe(true);
    expect(row.finalDeadlineMs - row.finalStartedMs).toBe(300000);
  }
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
});
test('bounded native transport refuses a fourth read without retiring the three admitted reads', async () => {
  const f = await fixture();
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let started = 0;
  let began: () => void = () => {};
  const admission = new Promise<void>((r) => {
    began = r;
  });
  const api = createGcpCaptureCleanupCli({
    ...f.options,
    readConcurrency: 3,
    assertInputs: async () => {
      if (++started === 1) began();
      await gate;
      await f.options.assertInputs();
    },
  });
  const args = gcpCaptureCleanupReadCommands(f.intent)[0];
  const pending = Array.from({ length: 3 }, () => api.exec('gcloud', [...args]));
  await admission;
  expect(started).toBe(1);
  await expect(api.exec('gcloud', [...args])).rejects.toThrow('active or retired');
  release();
  expect((await Promise.all(pending)).map((r) => r.exitCode)).toEqual([0, 0, 0]);
});
test('default native transport keeps its original single-active-read contract', async () => {
  const f = await fixture();
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let began: () => void = () => {};
  const admission = new Promise<void>((r) => {
    began = r;
  });
  const api = createGcpCaptureCleanupCli({
    ...f.options,
    assertInputs: async () => {
      began();
      await gate;
      await f.options.assertInputs();
    },
  });
  expect(readCleanupObservationConcurrency(api)).toBe(1);
  const args = gcpCaptureCleanupReadCommands(f.intent)[0];
  const pending = api.exec('gcloud', [...args]);
  await admission;
  await expect(api.exec('gcloud', [...args])).rejects.toThrow('active or retired');
  release();
  expect((await pending).exitCode).toBe(0);
});
test('native transport rejects unsupported read concurrency before creating observation authority', async () => {
  const f = await fixture();
  expect(() => createGcpCaptureCleanupCli({ ...f.options, readConcurrency: 2 as 1 | 3 })).toThrow('read concurrency');
});

test('native cleanup transport permits exactly six qualified independent reads with one original budget', async () => {
  const f = await fixture();
  const api = createGcpCaptureCleanupCli({ ...f.options, readConcurrency: 6 });
  expect(readCleanupObservationConcurrency(api)).toBe(6);
  expect(readCleanupObservationConcurrency({ ...api })).toBe(1);
  const args = gcpCaptureCleanupReadCommands(f.intent).slice(0, 6);
  const results = await Promise.all(args.map((argv) => api.exec('gcloud', [...argv])));
  expect(results.map((r) => r.exitCode)).toEqual([0, 0, 0, 0, 0, 0]);
  const files = await Array.fromAsync(
    new Bun.Glob('**/cleanup-observation-final.private.json').scan({ cwd: f.diagnosticsDirectory }),
  );
  expect(files).toHaveLength(6);
  const rows = await Promise.all(
    files.map(async (p) => JSON.parse(await readFile(join(f.diagnosticsDirectory, p), 'utf8'))),
  );
  expect(new Set(rows.map((r) => r.originalDeadlineMs)).size).toBe(1);
  expect(new Set(rows.map((r) => r.identity.group)).size).toBe(6);
  for (const row of rows) {
    expect(row.signalsSent).toBe(false);
    expect(row.originalGroupClosed).toBe(true);
    expect(row.finalDeadlineMs - row.finalStartedMs).toBe(300000);
  }
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
});
test('bounded native transport refuses a seventh read without retiring the six admitted reads', async () => {
  const f = await fixture();
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let started = 0;
  let began: () => void = () => {};
  const admission = new Promise<void>((r) => {
    began = r;
  });
  const api = createGcpCaptureCleanupCli({
    ...f.options,
    readConcurrency: 6,
    assertInputs: async () => {
      if (++started === 1) began();
      await gate;
      await f.options.assertInputs();
    },
  });
  const args = gcpCaptureCleanupReadCommands(f.intent)[0];
  const pending = Array.from({ length: 6 }, () => api.exec('gcloud', [...args]));
  await admission;
  expect(started).toBe(1);
  await expect(api.exec('gcloud', [...args])).rejects.toThrow('active or retired');
  release();
  expect((await Promise.all(pending)).map((r) => r.exitCode)).toEqual([0, 0, 0, 0, 0, 0]);
});

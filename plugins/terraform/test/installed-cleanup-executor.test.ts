import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledCleanupExecutor } from '../src/installed-cleanup-executor';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
// Retain native evidence on every outcome.

async function fixture(body: string) {
  const root = await mkdtemp(join(tmpdir(), 'ce-cleanup-native-'));
  const directory = join(root, 'original');
  const diagnosticsDirectory = join(root, 'cleanup');
  await mkdir(directory, { mode: 0o700 });
  await mkdir(diagnosticsDirectory, { mode: 0o700 });
  const lock = join(directory, '.terraform-executor-lock');
  await mkdir(lock, { mode: 0o700 });
  const retained = join(lock, 'capture-unresolved.json');
  await writeFile(retained, 'original-failed-capture', { mode: 0o400 });
  const executable = join(root, 'fixture-terraform');
  await writeFile(
    executable,
    `#!${python}
import sys,os,json,time
from pathlib import Path
assert sys.argv[1] == ${JSON.stringify(`-chdir=${directory}`)}
${body}
`,
    { mode: 0o700 },
  );
  await chmod(executable, 0o700);
  let closureChecks = 0;
  const execute = createInstalledCleanupExecutor({
    directory,
    diagnosticsDirectory,
    python: { path: python, sha256: hash(await readFile(python)) },
    terraform: { path: executable, sha256: hash(await readFile(executable)) },
    assertInputs: async () => {
      expect(await readFile(retained, 'utf8')).toBe('original-failed-capture');
    },
    assertIndependentClosure: async () => {
      closureChecks++;
    },
  });
  return { root, directory, diagnosticsDirectory, retained, execute, closureChecks: () => closureChecks };
}

test('cleanup uses the same Terraform workspace through a separate native gate and preserves its failed lock', async () => {
  const f = await fixture('print(json.dumps({"cwd":os.getcwd(),"args":sys.argv[2:]}))');
  const result = await f.execute({ cwd: f.directory, args: ['version', '-json'], env: {} });
  expect(result.code).toBe(0);
  const reported = JSON.parse(result.stdout);
  expect(reported.cwd.startsWith(`${f.diagnosticsDirectory}/`)).toBe(true);
  expect(reported.args).toEqual(['version', '-json']);
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
  expect(f.closureChecks()).toBeGreaterThan(1);
});

test('cleanup refuses foreign workspaces, caller chdir flags and unreviewed auto approval before any execution', async () => {
  const f = await fixture('raise RuntimeError("must-not-run")');
  for (const request of [
    { cwd: f.root, args: ['version', '-json'] },
    { cwd: f.directory, args: ['-chdir=/foreign', 'show'] },
    { cwd: f.directory, args: ['apply', '-auto-approve'] },
  ])
    await expect(f.execute({ ...request, env: {} })).rejects.toThrow();
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
});

test('cleanup cancellation preserves natural child completion and the original failed capture', async () => {
  const f = await fixture(`Path(${JSON.stringify('started')}).write_text('yes')
time.sleep(0.5)
Path(${JSON.stringify('completed')}).write_text('yes')
print('natural-completion')`);
  const controller = new AbortController();
  const pending = f.execute({
    cwd: f.directory,
    args: ['show', '-json', 'terraform.tfstate'],
    env: {},
    signal: controller.signal,
  });
  const deadline = Date.now() + 5000;
  let started = false;
  while (!started && Date.now() < deadline) {
    for await (const file of new Bun.Glob('**/started').scan({ cwd: f.diagnosticsDirectory })) {
      if (file) started = true;
    }
    if (!started) await Bun.sleep(10);
  }
  expect(started).toBe(true);
  controller.abort();
  const result = await pending;
  expect(result.code).toBe(1);
  const completed = await Array.fromAsync(new Bun.Glob('**/completed').scan({ cwd: f.diagnosticsDirectory }));
  expect(completed).toHaveLength(1);
  expect(await readFile(f.retained, 'utf8')).toBe('original-failed-capture');
});

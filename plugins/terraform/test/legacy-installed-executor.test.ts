import { expect, test } from 'bun:test';
import { createLegacyInstalledTerraformExecutor } from '../src/legacy-installed-executor';

const fixture = () =>
  createLegacyInstalledTerraformExecutor({
    directory: '/example/legacy',
    inputs: {
      python: {
        path: '/example/python',
        sha256: 'a'.repeat(64),
        expectedIdentity: {
          dev: '1',
          ino: '2',
          uid: '1000',
          nlink: '1',
          mode: '33024',
          size: '64',
          mtimeNs: '1',
          ctimeNs: '1',
        },
        expectedParentIdentity: { dev: '1', ino: '1', uid: '1000', mode: '16832' },
      },
    },
    python: { path: '/example/python', sha256: 'a'.repeat(64) },
    executable: { path: '/example/terraform', sha256: 'b'.repeat(64) },
  });
test('legacy installed execution refuses foreign workspaces before launching an actor', async () => {
  await expect(fixture()({ cwd: '/example/foreign', args: ['version', '-json'], env: {} })).rejects.toThrow(
    'workspace',
  );
});
test('legacy installed execution accepts only the shared runner operation vocabulary', async () => {
  for (const args of [['destroy'], ['exec'], [], ['apply', '-auto-approve']])
    await expect(fixture()({ cwd: '/example/legacy', args, env: {} })).rejects.toThrow('invocation');
});

import { mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../src/installed-runtime';

async function originalLegacyFixture(delay = false) {
  const root = await mkdtemp(join(tmpdir(), 'ce-legacy-original-'));
  const pythonPath = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
  const python = (await readOwnedInstalledInput(pythonPath)).binding;
  const executablePath = join(root, 'terraform-fixture');
  await writeFile(
    executablePath,
    `#!${pythonPath}\nimport json,os,time\nprint(json.dumps({'command':__import__('sys').argv[1],'marker':os.environ.get('LEGACY_TEST_MARKER')}),flush=True)\n${delay ? 'time.sleep(0.5)\n' : ''}`,
    { mode: 0o700 },
  );
  const executable = (await readOwnedInstalledInput(executablePath)).binding;
  const execute = createLegacyInstalledTerraformExecutor({
    directory: root,
    inputs: { python, executable },
    python,
    executable,
  });
  return { root, execute };
}

test('legacy runner commands execute through original actors and retain one budget across natural closures', async () => {
  const f = await originalLegacyFixture();
  for (const command of ['version', 'validate', 'output']) {
    const result = await f.execute({ cwd: f.root, args: [command], env: { LEGACY_TEST_MARKER: 'original-env' } });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ command, marker: 'original-env' });
  }
  expect(await Bun.file(join(f.root, '.terraform-executor-lock/owner.json')).exists()).toBe(false);
  const captures = await Promise.all(
    (await readdir(join(f.root, 'executor-diagnostics'))).map(async (name) =>
      JSON.parse(await readFile(join(f.root, 'executor-diagnostics', name, 'completion.private.json'), 'utf8')),
    ),
  );
  expect(captures).toHaveLength(3);
  expect(new Set(captures.map((c) => c.originalDeadlineMs)).size).toBe(1);
  for (const capture of captures) {
    expect(capture.actualExitCode).toBe(0);
    expect(capture.originalGroupClosed).toBe(true);
    expect(capture.signalsSent).toBe(false);
    expect(capture.captureClosed).toBe(true);
    expect(await Bun.file(`/proc/${capture.pid}/stat`).exists()).toBe(false);
  }
});

test('cancellation observes natural closure and permits later runner work without replaying the original command', async () => {
  const f = await originalLegacyFixture(true);
  const controller = new AbortController();
  const pending = f.execute({ cwd: f.root, args: ['validate'], env: {}, signal: controller.signal });
  let original: string | undefined;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && !original) {
    for (const name of await readdir(join(f.root, 'executor-diagnostics')).catch(() => [])) {
      const path = join(f.root, 'executor-diagnostics', name, 'stdout.private');
      if ((await readFile(path, 'utf8').catch(() => '')).includes('validate')) original = name;
    }
    if (!original) await Bun.sleep(10);
  }
  expect(original).toBeDefined();
  controller.abort();
  expect((await pending).code).toBe(1);
  const completed = JSON.parse(
    await readFile(join(f.root, 'executor-diagnostics', original!, 'completion.private.json'), 'utf8'),
  );
  expect(completed.reason).toBe('cancelled');
  expect(completed.actualExitCode).toBe(0);
  expect(completed.originalGroupClosed).toBe(true);
  expect(completed.signalsSent).toBe(false);
  expect((await f.execute({ cwd: f.root, args: ['version'], env: {} })).code).toBe(0);
  expect((await readdir(join(f.root, 'executor-diagnostics'))).length).toBe(2);
});

test('an unresolved original lock refuses a second actor and preserves all first-attempt evidence', async () => {
  const f = await originalLegacyFixture();
  const lock = join(f.root, '.terraform-executor-lock');
  await mkdir(lock, { mode: 0o700 });
  const marker = join(lock, 'unresolved.private');
  await writeFile(marker, 'retain original unresolved lock', { mode: 0o400 });
  await expect(f.execute({ cwd: f.root, args: ['version'], env: {} })).rejects.toThrow();
  const before = await readdir(join(f.root, 'executor-diagnostics'));
  await expect(f.execute({ cwd: f.root, args: ['version'], env: {} })).rejects.toThrow('remains active');
  expect(await readdir(join(f.root, 'executor-diagnostics'))).toEqual(before);
  expect(await readFile(marker, 'utf8')).toBe('retain original unresolved lock');
});

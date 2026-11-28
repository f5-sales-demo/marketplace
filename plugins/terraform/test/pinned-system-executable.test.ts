import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { linuxMonotonicMs } from '../src/linux-clock';
import {
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeTerraformExecutor,
} from '../src/signal-free-executor';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const systemId = '/usr/bin/id';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
async function fixture(
  options: { alias?: boolean; wrongHash?: boolean; beforeRelease?: SignalFreeExecutionPolicy['beforeRelease'] } = {},
) {
  const base = process.env.CE_TEST_CAPTURE_ARTIFACTS ?? tmpdir();
  await mkdir(base, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(base, 'ce-system-pin-'));
  const canonical = await realpath(systemId),
    metadata = await lstat(canonical);
  expect(metadata.uid).toBe(0);
  expect(metadata.mode & 0o6022).toBe(0);
  const executable = options.alias ? join(root, 'original-id') : systemId;
  if (options.alias) await symlink(canonical, executable);
  const captures: FinalExecutionCapture[] = [],
    started = linuxMonotonicMs();
  const execute = signalFreeTerraformExecutor({
    python: { path: python, sha256: hash(await readFile(python)) },
    executable: { path: executable, sha256: options.wrongHash ? '0'.repeat(64) : hash(await readFile(canonical)) },
    originalStartMs: started,
    originalDeadlineMs: started + 7200000,
    timeoutMs: 60000,
    assertOriginal: async () => {},
    ...(options.beforeRelease ? { beforeRelease: options.beforeRelease } : {}),
    finalCapture: async (capture) => {
      captures.push(capture);
      await writeFile(join(root, 'final.private.json'), JSON.stringify(capture), { flag: 'wx', mode: 0o400 });
    },
  });
  return { root, canonical, executable, captures, execute };
}

for (const alias of [false, true])
  test(`pinned root-owned system executable retains the caller UID and completes without signals: alias=${alias}`, async () => {
    const f = await fixture({ alias });
    const result = await f.execute({ cwd: f.root, args: ['-u'], env: {} });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(String(process.getuid?.()));
    expect(f.captures).toHaveLength(1);
    expect(f.captures[0].submitted).toBe(true);
    expect(f.captures[0].signalsSent).toBe(false);
    const complete = JSON.parse(
      await readFile(join(dirname(f.captures[0].stdoutPath), 'completion.private.json'), 'utf8'),
    );
    expect(complete.originalGroupClosed).toBe(true);
    expect(complete.finalDeadlineMs - complete.finalStartedMs).toBe(300000);
  });

test('pinned root-owned system executable refuses a mismatched reviewed hash before launching any gate', async () => {
  const f = await fixture({ wrongHash: true });
  await expect(f.execute({ cwd: f.root, args: ['-u'], env: {} })).rejects.toThrow();
  expect(f.captures).toHaveLength(0);
  expect(await Bun.file(join(f.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(false);
});

test('replacing the original executable symlink with the same root-owned target refuses command release', async () => {
  let executable = '',
    canonical = '';
  const f = await fixture({
    alias: true,
    beforeRelease: async () => {
      await unlink(executable);
      await symlink(canonical, executable);
    },
  });
  executable = f.executable;
  canonical = f.canonical;
  const result = await f.execute({ cwd: f.root, args: ['-u'], env: {} });
  expect(result.code).toBe(1);
  expect(f.captures).toHaveLength(1);
  expect(f.captures[0].submitted).toBe(false);
  expect(f.captures[0].signalsSent).toBe(false);
  const complete = JSON.parse(
    await readFile(join(dirname(f.captures[0].stdoutPath), 'completion.private.json'), 'utf8'),
  );
  expect(complete.originalGroupClosed).toBe(true);
});

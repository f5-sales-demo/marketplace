import { expect, test } from 'bun:test';
import { mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock, assertExecutorGroupClosed } from '../../platform/src/ce/process-lock';
import { bindOriginalExecutionOutput } from '../src/original-output-stream';
import { signalFreeBootstrapSource } from '../src/signal-free-executor';

test('closure refusal retains the underlying OS cause privately', async () => {
  const root = await mkdtemp(join(tmpdir(), 'closure-cause-'));
  const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
  const script = join(root, 'gate.py'),
    ready = join(root, 'ready.json'),
    target = join(root, 'child.py');
  await writeFile(script, signalFreeBootstrapSource, { mode: 0o400 });
  await writeFile(target, 'print("synthetic final")\n', { mode: 0o400 });
  const stdoutPath = join(root, 'stdout.private'),
    stderrPath = join(root, 'stderr.private');
  const stdout = await open(stdoutPath, 'wx', 0o600),
    stderr = await open(stderrPath, 'wx', 0o600);
  const child = Bun.spawn([python, '-I', '-B', script, ready, python, target], {
    cwd: root,
    env: {},
    stdin: 'pipe',
    stdout: stdout.fd,
    stderr: stderr.fd,
  });
  let binding: Awaited<ReturnType<typeof bindOriginalExecutionOutput>> | undefined;
  let release: (() => Promise<void>) | undefined;
  let inject = false;
  try {
    const deadline = Date.now() + 15000;
    while (!(await Bun.file(ready).exists())) {
      if (Date.now() >= deadline) throw new Error('Gate startup timeout');
      await Bun.sleep(10);
    }
    const original = JSON.parse(await readFile(ready, 'utf8'));
    const lock = join(root, '.closure-cause-lock');
    release = await acquireProcessLock(lock, child.pid, { trackProcessGroup: true });
    binding = await bindOriginalExecutionOutput({
      directory: root,
      identity: { pid: original.pid, group: original.group, start: original.start, boot: original.boot },
      stdout: { path: stdoutPath, writer: stdout },
      stderr: { path: stderrPath, writer: stderr },
      maximum: 65536,
      assertInputs: async () => {},
      originalGroupClosed: async () => {
        if (inject) throw Object.assign(new Error('synthetic process lookup failure'), { code: 'ESRCH' });
        if (child.exitCode === null) return false;
        await assertExecutorGroupClosed(lock);
        return true;
      },
    });
    child.stdin.write('go\n');
    await child.stdin.flush();
    await child.stdin.end();
    expect(await child.exited).toBe(0);
    inject = true;
    let refusal: unknown;
    try {
      await binding.output.read('stdout');
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toHaveProperty('cause.code', 'ESRCH');
    const retained = JSON.parse(await readFile(join(root, 'output-capture-failure.private.json'), 'utf8'));
    expect(retained.schemaVersion).toBe(2);
    expect(retained.cause.code).toBe('ESRCH');
    expect(retained.cause.message).toBe('synthetic process lookup failure');
  } finally {
    await child.stdin.end();
    await child.exited;
    await binding?.close();
    await release?.();
    await stdout.close();
    await stderr.close();
    await rm(root, { recursive: true });
  }
}, 60000);

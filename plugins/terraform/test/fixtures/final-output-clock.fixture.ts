import { expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { linuxMonotonicMs: originalClock } = await import('../../src/linux-clock');
let clockMs: number | undefined;
const clock = () => clockMs ?? originalClock();
mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: clock }));
const { signalFreeTerraformExecutor } = await import('../../src/signal-free-executor');
const { monitorOriginalInputs } = await import('../../src/original-input-monitor');
const { readOwnedInstalledInput } = await import('../../src/installed-runtime');
type Output = import('../../src/original-output-stream').OriginalExecutionOutput;
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

async function campaign(late: boolean) {
  clockMs = undefined;
  const initial = originalClock();
  const root = await mkdtemp(join(tmpdir(), 'ce-final-output-clock-'));
  const marker = join(root, 'original-input.private');
  await writeFile(marker, 'synthetic-original-input', { flag: 'wx', mode: 0o400 });
  const monitor = await monitorOriginalInputs({ marker: (await readOwnedInstalledInput(marker)).binding });
  const executed = join(root, 'executed'),
    released = join(root, 'release');
  const script = join(root, 'fixture.py');
  await writeFile(
    script,
    `${[
      'import os,time',
      'print("original-final-output",flush=True)',
      `open(${JSON.stringify(executed)},"x").close()`,
      'deadline=time.monotonic()+5',
      `while not os.path.exists(${JSON.stringify(released)}):`,
      ' if time.monotonic()>=deadline: raise RuntimeError("fixture release deadline")',
      ' time.sleep(0.01)',
    ].join('\n')}\n`,
    { flag: 'wx', mode: 0o400 },
  );
  const path = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
  const executable = { path, sha256: hash(await readFile(path)) };
  let output: Output | undefined, pump: Promise<void> | undefined;
  let finalObserved = false;
  const deadline = initial + 7200000;
  const execute = signalFreeTerraformExecutor({
    python: executable,
    executable,
    originalStartMs: initial,
    originalDeadlineMs: deadline,
    assertOriginal: async () => {
      await monitor.assertOriginal();
      if (clock() >= deadline) throw new Error('Original operation budget exhausted');
    },
    assertOriginalIdentity: monitor.assertOriginalIdentity,
    assertFinalInputs: monitor.assertOriginal,
    beforeRelease: async (admission) => {
      output = admission.output;
      pump = (async () => {
        const wallDeadline = Date.now() + 15000;
        while (!(await Bun.file(executed).exists())) {
          if (Date.now() >= wallDeadline) throw new Error('Original child startup expired');
          await Bun.sleep(10);
        }
        clockMs = deadline + 1;
        await writeFile(released, 'release', { flag: 'wx', mode: 0o400 });
      })();
    },
    finalCapture: async (capture) => {
      await pump;
      if (!output) throw new Error('Original output required');
      finalObserved = true;
      expect(capture.reason).toBe('deadline');
      expect(capture.originalDeadlineMs).toBe(deadline);
      expect(capture.finalStartedMs).toBe(deadline + 1);
      expect(capture.finalDeadlineMs - capture.finalStartedMs).toBe(300000);
      clockMs = capture.finalDeadlineMs - (late ? 0 : 1);
      if (late) {
        await expect(output.read('stdout')).rejects.toThrow('lifetime');
        throw new Error('Original final output reserve expired');
      }
      expect((await output.read('stdout'))?.bytes.toString()).toBe('original-final-output\n');
      expect(await output.read('stdout')).toBeNull();
      expect(await output.read('stderr')).toBeNull();
      expect((await output.finish()).stdout.sha256).toBe(hash('original-final-output\n'));
    },
  });
  try {
    const run = execute({ cwd: root, args: [script], env: {} });
    if (late) await expect(run).rejects.toThrow();
    else expect((await run).code).toBe(1); // The original expired apply never becomes successful.
    expect(finalObserved).toBe(true);
    if (late) expect(await Bun.file(join(root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(true);
  } finally {
    await pump;
  }
}
test('expired original operation allows source capture strictly before its unchanged final deadline', async () => {
  await campaign(false);
}, 60000);
test('the original final deadline refuses output and retains its unresolved claim', async () => {
  await campaign(true);
}, 60000);

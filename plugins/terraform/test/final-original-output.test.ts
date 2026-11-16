/** Real gated output and original file monitor; operation expiry is an explicit offline guard stimulus. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs } from '../src/original-input-monitor';
import type { OriginalExecutionOutput } from '../src/original-output-stream';
import { signalFreeTerraformExecutor } from '../src/signal-free-executor';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function fixture(
  final: (value: {
    output: OriginalExecutionOutput;
    marker: string;
    root: string;
    expireOperation(): void;
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'ce-final-original-output-'));
  const marker = join(root, 'original-input.private');
  await writeFile(marker, 'synthetic-original-input', { flag: 'wx', mode: 0o400 });
  const monitor = await monitorOriginalInputs({ marker: (await readOwnedInstalledInput(marker)).binding });
  const script = join(root, 'fixture.py');
  await writeFile(script, 'print("original-final-output")\n', { flag: 'wx', mode: 0o400 });
  const path = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
  const executable = { path, sha256: hash(await readFile(path)) };
  const start = linuxMonotonicMs();
  let output: OriginalExecutionOutput | undefined,
    expired = false;
  let operationChecksAfterExpiry = 0,
    finalChecks = 0;
  const execute = signalFreeTerraformExecutor({
    python: executable,
    executable,
    originalStartMs: start,
    originalDeadlineMs: start + 7200000,
    assertOriginal: async () => {
      if (expired) {
        operationChecksAfterExpiry++;
        throw new Error('Original operation budget exhausted');
      }
      await monitor.assertOriginal();
    },
    assertOriginalIdentity: monitor.assertOriginalIdentity,
    assertFinalInputs: async () => {
      finalChecks++;
      await monitor.assertOriginal();
    },
    beforeRelease: async (admission) => {
      output = admission.output;
    },
    finalCapture: async (capture) => {
      if (!output || !capture.originalGroupClosed) throw new Error('Original closed output required');
      await final({
        output,
        marker,
        root,
        expireOperation: () => {
          expired = true;
        },
      });
    },
  });
  return {
    root,
    run: () => execute({ cwd: root, args: [script], env: {} }),
    counts: () => ({ operationChecksAfterExpiry, finalChecks }),
  };
}

test('original final output uses full original input checks after operation expiry without renewing operation authority', async () => {
  let retained: OriginalExecutionOutput | undefined;
  const run = await fixture(async ({ output, expireOperation }) => {
    retained = output;
    expireOperation();
    const chunk = await output.read('stdout');
    expect(chunk?.bytes.toString()).toBe('original-final-output\n');
    expect(await output.read('stdout')).toBeNull();
    expect(await output.read('stderr')).toBeNull();
    const complete = await output.finish();
    expect(complete.stdout.sha256).toBe(hash('original-final-output\n'));
    expect(complete.originalInsertQualified).toBe(false);
  });
  expect((await run.run()).code).toBe(0);
  expect(run.counts().operationChecksAfterExpiry).toBe(0);
  expect(run.counts().finalChecks).toBeGreaterThan(2);
  if (!retained) throw new Error('Original output required');
  await expect(retained.read('stdout')).rejects.toThrow();
}, 60000);

test('final original input replacement refuses capture permanently and preserves the unresolved claim', async () => {
  const run = await fixture(async ({ output, marker, expireOperation }) => {
    expireOperation();
    await rename(marker, `${marker}.original`);
    await writeFile(marker, 'synthetic-foreign-input', { flag: 'wx', mode: 0o400 });
    await expect(output.read('stdout')).rejects.toThrow();
    await rename(marker, `${marker}.foreign`);
    await rename(`${marker}.original`, marker);
    await expect(output.finish()).rejects.toThrow('refused');
    throw new Error('Original final output refused');
  });
  await expect(run.run()).rejects.toThrow();
  expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(true);
}, 60000);

import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('final output reserve retains exact expiry boundaries after the original operation deadline', async () => {
  expect((await runIsolatedClockFixture('final-output-clock.fixture.ts')).exitCode).toBe(0);
}, 180000);

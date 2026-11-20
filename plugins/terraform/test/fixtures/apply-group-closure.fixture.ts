/** Real controller, gated output and original file monitors; authentication values are explicit offline placeholders. */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createInstalledApplyController,
  type OriginalApplyCallbackContext,
} from '../../src/installed-apply-controller';
import { createInstalledCaptureContext } from '../../src/installed-capture-context';
import { readOwnedInstalledInput } from '../../src/installed-runtime';
import { linuxMonotonicMs } from '../../src/linux-clock';
import { monitorOriginalInputs } from '../../src/original-input-monitor';
import type { OriginalOutputCompletion } from '../../src/original-output-stream';
import { admitFinalReaderReserve } from '../../src/reader-final-reserve';
import { type FinalExecutionCapture, signalFreeTerraformExecutor } from '../../src/signal-free-executor';

export interface GroupClosureFixtureInput {
  before: OriginalApplyCallbackContext;
  final: OriginalApplyCallbackContext;
  completion: OriginalOutputCompletion;
  finished: FinalExecutionCapture;
  events: Record<string, unknown>[];
}
export async function withGroupClosure(
  run: (input: GroupClosureFixtureInput) => Promise<void>,
  failGroupRecord = false,
  afterGroupRecord?: (adcPath: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'ce-apply-group-closure-'));
  const adc = join(root, 'adc.private'),
    platform = join(root, 'platform.private');
  await writeFile(adc, '{}', { flag: 'wx', mode: 0o400 });
  await writeFile(platform, 'synthetic-platform', { flag: 'wx', mode: 0o400 });
  const inputs = {
    adc: (await readOwnedInstalledInput(adc)).binding,
    platform: (await readOwnedInstalledInput(platform)).binding,
  };
  const monitor = await monitorOriginalInputs(inputs);
  const release = join(root, 'group-release');
  const start = linuxMonotonicMs(),
    deadline = start + 7200000;
  const context = createInstalledCaptureContext({
    owner: {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'example-deployment',
    },
    executionDirectory: root,
    inputs,
    budget: { start, deadline },
    authentication: {
      accountSha256: 'a'.repeat(64),
      audienceSha256: 'b'.repeat(64),
      snapshotSha256: inputs.adc.sha256,
    },
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: adc,
      XCSH_API_URL: 'https://example.test',
      XCSH_API_TOKEN: 'example-token',
    },
    assertInputs: monitor.assertOriginal,
    assertWithinDeadline: async () => {
      await monitor.assertOriginal();
      if (linuxMonotonicMs() >= deadline) throw new Error('Original operation deadline exhausted');
    },
    readProviderInputs: async () => inputs,
  });
  let before: OriginalApplyCallbackContext | undefined;
  const events: Record<string, unknown>[] = [];
  const controller = createInstalledApplyController(
    context,
    {
      start: async (_admission, callback) => {
        before = callback;
      },
      assertOriginal: async () => {},
      finalCapture: async (finished, _reserve, final) => {
        if (!before || !final) throw new Error('Original callbacks required');
        await writeFile(release, 'release', { flag: 'wx', mode: 0o400 });
        for (const channel of ['stdout', 'stderr'] as const)
          for (;;) {
            if (!(await final.execution.output.read(channel))) break;
          }
        const completion = await final.execution.output.finish();
        await run({ before, final, completion, finished, events });
      },
      closeAfterExecutorExit: async () => {
        events.push({ phase: 'worker-closed' });
      },
    },
    {
      persist: async (event) => {
        if (failGroupRecord && event.phase === 'group-closure-source')
          throw new Error('Synthetic group closure persistence failed');
        await writeFile(join(root, `event-${String(event.sequence)}.private.json`), JSON.stringify(event), {
          flag: 'wx',
          mode: 0o400,
        });
        events.push(event);
        if (event.phase === 'group-closure-source') await afterGroupRecord?.(adc);
      },
    },
  );
  const script = join(root, 'apply');
  await writeFile(
    script,
    `${[
      'import subprocess,sys',
      `subprocess.Popen([sys.executable,"-c",${JSON.stringify(['import os,time', 'deadline=time.monotonic()+30', `while not os.path.exists(${JSON.stringify(release)}):`, ' if time.monotonic()>=deadline: raise RuntimeError("owned descendant release deadline")', ' time.sleep(0.01)'].join('\n'))}])`,
      'print("original-parent-output",flush=True)',
    ].join('\n')}\n`,
    { flag: 'wx', mode: 0o400 },
  );
  const path = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
  const executable = {
    path,
    sha256: createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
  };
  await controller.prepare?.(context);
  const execute = signalFreeTerraformExecutor({
    python: executable,
    executable,
    originalStartMs: start,
    originalDeadlineMs: deadline,
    assertOriginal: context.assertWithinDeadline,
    assertOriginalIdentity: monitor.assertOriginalIdentity,
    assertFinalInputs: monitor.assertOriginal,
    beforeRelease: (admission) => controller.start(admission),
    finalCapture: async (finished) => {
      if (!finished.identity) throw new Error('Original parent identity required');
      const reserve = admitFinalReaderReserve({
        identity: finished.identity,
        originalStartMs: start,
        originalDeadlineMs: deadline,
        finalStartedMs: finished.finalStartedMs,
        finalDeadlineMs: finished.finalDeadlineMs,
        assertOriginal: monitor.assertOriginal,
      });
      await controller.finalCapture(finished, reserve);
      await controller.closeAfterExecutorExit();
    },
  });
  const result = await execute({
    cwd: root,
    args: ['apply', '-json', '-parallelism=1', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'],
    env: {},
  });
  if (result.code !== 0) throw new Error('Original fixture apply failed');
  return events;
}

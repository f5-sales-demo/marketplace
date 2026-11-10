import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { openInstalledProviderReader, readOriginalInstalledProviderWindow } from '../src/installed-provider-reader';
import { inspectInstalledCaptureScripts } from '../src/installed-runtime';
import pins from '../src/installed-runtime-pins.json';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { Executor } from '../src/runner';
import type { ExecutionCaptureAdmission, SignalFreeExecutionPolicy } from '../src/signal-free-executor';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
const parent = { pid: 1234, group: 1234, start: '100', boot: '00000000-0000-4000-8000-000000000001' };
const sdk = { pid: 2345, group: 2345, start: '101', boot: parent.boot };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(latest = false) {
  const terraformHash = latest
    ? '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc'
    : pins.terraformSha256;
  const googleHash = latest
    ? 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9'
    : pins.googleProviderSha256;
  const googleVersion = latest ? '8.10.0' : '8.7.0';

  const root = await mkdtemp(join(tmpdir(), 'ce-installed-provider-'));
  roots.push(root);
  const source = await inspectInstalledCaptureScripts();
  const sample = source['script:__init__.py'];
  const binding = (path: string, sha256: string) => ({ ...sample, path, sha256 });
  const now = linuxMonotonicMs();
  const context = createInstalledCaptureContext({
    authentication: { accountSha256: 'a'.repeat(64), audienceSha256: 'b'.repeat(64), snapshotSha256: 'c'.repeat(64) },
    owner: {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'example-deployment',
    },
    executionDirectory: root,
    budget: { start: now, deadline: now + 7_200_000 },
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: join(root, 'adc'),
      XCSH_API_URL: 'https://example.com',
      XCSH_API_TOKEN: 'example-token',
    },
    inputs: {
      ...source,
      python: binding('/example/python', pins.pythonSha256),
      terraform: binding('/example/terraform', terraformHash),
      adc: binding(join(root, 'adc'), 'c'.repeat(64)),
      platform: binding(join(root, 'platform'), 'd'.repeat(64)),
    },
    assertInputs: async () => {},
    assertWithinDeadline: async () => {},
    readProviderInputs: async () =>
      Object.fromEntries(
        [
          'registry.terraform.io/hashicorp/google:LICENSE.txt',
          `registry.terraform.io/hashicorp/google:terraform-provider-google_v${googleVersion}_x5`,
          'registry.terraform.io/f5-sales-demo/xcsh:CHANGELOG.md',
          'registry.terraform.io/f5-sales-demo/xcsh:LICENSE',
          'registry.terraform.io/f5-sales-demo/xcsh:README.md',
          'registry.terraform.io/f5-sales-demo/xcsh:terraform-provider-xcsh_v15.13.0',
        ].map((name, index) => [
          name,
          binding(
            join(root, `provider-${index}`),
            name.includes('terraform-provider-google') ? googleHash : 'e'.repeat(64),
          ),
        ]),
      ),
  });
  const admission: ExecutionCaptureAdmission = {
    output: Object.freeze({
      read: async () => {
        throw new Error('Synthetic fixture has no original output capability');
      },
      finish: async () => {
        throw new Error('Synthetic fixture has no original output capability');
      },
    }),
    directory: root,
    args: ['apply', 'saved.tfplan'],
    identity: parent,
    stdoutPath: join(root, 'stdout'),
    stderrPath: join(root, 'stderr'),
    originalStartMs: now,
    originalDeadlineMs: now + 7_200_000,
    startupDeadlineMs: now + 15_000,
  };
  let executions = 0;
  let windowClock = now;
  let finishWindow: () => void = () => {};
  let mutateReady: (value: Record<string, unknown>) => void = () => {};
  let prematureWindow = false;

  let substituteRequest = false;
  let aliasResult = false;
  let mutate: (result: Record<string, unknown>) => void = () => {};
  const factory =
    (policy: SignalFreeExecutionPolicy): Executor =>
    async (invocation) => {
      executions++;
      const readerActor = {
        ...sdk,
        pid: sdk.pid + (executions - 1) * 100,
        group: sdk.group + (executions - 1) * 100,
        start: String(Number(sdk.start) + executions - 1),
      };
      const originalRequest = invocation.args[invocation.args.indexOf('--request') + 1];
      if (substituteRequest) {
        const bytes = await readFile(originalRequest);
        await rename(originalRequest, `${originalRequest}.original`);
        await writeFile(originalRequest, bytes, { flag: 'wx', mode: 0o400 });
      }
      await policy.assertOriginal();
      await policy.beforeRelease?.({
        ...admission,
        directory: invocation.cwd,
        args: invocation.args,
        identity: readerActor,
        startupDeadlineMs: windowClock + 15000,
      });
      await policy.assertOriginal();
      const path = invocation.args[invocation.args.indexOf('--request') + 1];
      const bytes = await readFile(path);
      const request = JSON.parse(bytes.toString());
      const result: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'original-provider-cohort',
        requestSha256: hash(bytes),
        executor: request.executor,
        reader: readerActor,
        candidates: [3456, 4567].map((pid) => ({
          pid,
          group: parent.group,
          start: String(pid),
          boot: parent.boot,
          parent: parent.pid,
          executable_sha256: googleHash,
        })),
        executorAvailable: true,
        executorGroupClosed: false,
        applyPhaseQualified: false,
        signalsSent: false,
        cloudSubmissions: 0,
      };
      if (request.schemaVersion === 3 || request.schemaVersion === 4) {
        const windowStartedMs = windowClock;
        const windowDeadlineMs = Math.min(windowStartedMs + 45000, request.deadlineMs);
        const ready: Record<string, unknown> = {
          schemaVersion: request.schemaVersion,
          kind: 'original-provider-stderr-ready',
          requestSha256: hash(bytes),
          executor: request.executor,
          reader: readerActor,
          windowStartedMs,
          windowDeadlineMs,
          applyPhaseQualified: false,
          signalsSent: false,
          cloudSubmissions: 0,
        };
        mutateReady(ready);
        const barrier = new Promise<void>((resolve) => {
          finishWindow = () => {
            windowClock = windowDeadlineMs;
            resolve();
          };
        });
        await writeFile(join(invocation.cwd, 'provider-ready.private.json'), JSON.stringify(ready), {
          flag: 'wx',
          mode: 0o400,
        });
        await barrier;
        Object.assign(result, {
          schemaVersion: request.schemaVersion,
          kind: request.kind,
          windowStartedMs,
          windowDeadlineMs,
          finishedMs: prematureWindow ? now : windowDeadlineMs,
          samplingWindowComplete: true,
          observations: (result.candidates as Array<Record<string, unknown>>).map((candidate) => ({
            candidate,
            stderr: {
              providerFd: 2,
              parentFd: 10,
              device: '14',
              inode: String(candidate.pid),
              providerFlags: 1,
              parentFlags: 526336,
            },
            firstObservedMs: windowStartedMs,
            lastObservedMs: windowStartedMs,
            presentAtLastSample: true,
          })),
        });
        if (request.schemaVersion === 4)
          Object.assign(result, { verificationPolicy: 'completed-before-window-end', boundaryAttempts: 0 });
        delete result.candidates;
      }
      mutate(result);
      await writeFile(join(invocation.cwd, 'provider-result.private.json'), JSON.stringify(result), {
        flag: 'wx',
        mode: 0o400,
      });
      if (aliasResult) {
        const path = join(invocation.cwd, 'provider-result.private.json');
        const foreign = join(root, 'foreign-result.private.json');
        await rename(path, foreign);
        await symlink(foreign, path);
      }
      await policy.finalCapture({
        invocationStartedMs: now,
        finalStartedMs: now,
        finalDeadlineMs: now + 300_000,
        originalDeadlineMs: admission.originalDeadlineMs,
        finishedMs: now,
        stdoutPath: join(invocation.cwd, 'stdout'),
        stderrPath: join(invocation.cwd, 'stderr'),
        identity: readerActor,
        pid: readerActor.pid,
        submitted: true,
        actualExitCode: 0,
        originalGroupClosed: true,
        signalsSent: false,
      });
      return { code: 0, stdout: '' };
    };
  return {
    root,
    clock: () => windowClock,
    releaseWindow: () => finishWindow(),
    mutateReady: (fn: typeof mutateReady) => {
      mutateReady = fn;
    },
    prematureWindow: () => {
      prematureWindow = true;
    },
    context,
    admission,
    factory,
    executions: () => executions,
    mutate: (fn: typeof mutate) => {
      mutate = fn;
    },
    substituteRequest: () => {
      substituteRequest = true;
    },
    aliasResult: () => {
      aliasResult = true;
    },
  };
}

test('installed provider bridge preserves all original candidates without qualifying cloud apply', async () => {
  const run = await fixture();
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  const cohort = await reader.read();
  expect(cohort.candidates).toHaveLength(2);
  expect(cohort.applyPhaseQualified).toBe(false);
  expect(cohort.executor).toEqual(parent);
  expect(run.executions()).toBe(1);
});

test('wrong original executor directory and budget refuse before reader execution', async () => {
  const run = await fixture();
  for (const admission of [
    { ...run.admission, directory: '/example/foreign' },
    { ...run.admission, originalDeadlineMs: run.admission.originalDeadlineMs + 1 },
  ]) {
    await expect(openInstalledProviderReader(run.context, admission, { executorFactory: run.factory })).rejects.toThrow(
      /[Oo]riginal/,
    );
  }
  expect(run.executions()).toBe(0);
});

test('foreign candidates and changed request attribution retire capture without a retry', async () => {
  const run = await fixture();
  run.mutate((result) => {
    (result.candidates as Array<Record<string, unknown>>)[0].parent = 9999;
  });
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow();
  await expect(reader.read()).rejects.toThrow('retired');
  expect(run.executions()).toBe(1);
});

test('missing admitted script sources cannot be replaced by a name-only lookup', async () => {
  const run = await fixture();
  const inputs = { ...run.context.inputs };
  delete inputs['script:gcp_provider_reader.py'];
  await expect(
    openInstalledProviderReader({ ...run.context, inputs }, run.admission, { executorFactory: run.factory }),
  ).rejects.toThrow('source');
  expect(run.executions()).toBe(0);
});

test('same-byte request replacement refuses before the original SDK is released', async () => {
  const run = await fixture();
  run.substituteRequest();
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow();
});

test('a foreign aliased result cannot inherit an original SDK capture', async () => {
  const run = await fixture();
  run.aliasResult();
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow();
});

test('an expired original operation refuses even when a fixture deadline callback is a no-op', async () => {
  const run = await fixture();
  const deadline = linuxMonotonicMs() - 1;
  const budget = { start: deadline - 7_200_000, deadline };
  const context = { ...run.context, budget };
  const admission = { ...run.admission, originalStartMs: budget.start, originalDeadlineMs: budget.deadline };
  const reader = await openInstalledProviderReader(context, admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow(AggregateError);
  expect(run.executions()).toBe(0);
});

test('provider getter replacement during capture is refused by the final original-snapshot check', async () => {
  const run = await fixture();
  let changed = false;
  run.mutate(() => {
    changed = true;
  });
  const context = {
    ...run.context,
    readProviderInputs: async () => {
      const original = await run.context.readProviderInputs();
      if (!changed) return original;
      const name = 'registry.terraform.io/hashicorp/google:LICENSE.txt';
      return { ...original, [name]: { ...original[name], path: `${original[name].path}-foreign` } };
    },
  };
  const reader = await openInstalledProviderReader(context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow('admission changed');
  await expect(reader.read()).rejects.toThrow('retired');
});

test('installed FIFO window becomes ready before the original sampling command completes', async () => {
  const run = await fixture();
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  const running = reader.startStderrWindow();
  let completed = false;
  running.complete.then(() => {
    completed = true;
  });
  const ready = await running.ready;
  expect(ready.kind).toBe('original-provider-stderr-ready');
  expect(ready.schemaVersion).toBe(3);
  expect(ready.executor).toEqual(parent);
  expect(ready.reader).toEqual(sdk);
  expect(ready.windowDeadlineMs - ready.windowStartedMs).toBe(45000);
  expect(completed).toBe(false);
  run.releaseWindow();
  const result = await running.complete;
  expect(result.kind).toBe('original-provider-stderr-coherent-window');
  expect(result.observations.map((value) => value.candidate.pid)).toEqual([3456, 4567]);
  expect(result.samplingWindowComplete).toBe(true);
  expect(result.applyPhaseQualified).toBe(false);
  expect(Object.isFrozen(result.observations[0].stderr)).toBe(true);
  expect(reader.captures()).toHaveLength(1);
});

test('wrong original ready identity refuses while retaining the same child completion', async () => {
  for (const change of [
    (r: Record<string, unknown>) => {
      r.reader = { ...sdk, pid: 9999 };
    },
    (r: Record<string, unknown>) => {
      r.requestSha256 = 'f'.repeat(64);
    },
    (r: Record<string, unknown>) => {
      r.windowDeadlineMs = Number(r.windowDeadlineMs) + 1;
    },
  ]) {
    const run = await fixture();
    run.mutateReady(change);
    const reader = await openInstalledProviderReader(run.context, run.admission, {
      executorFactory: run.factory,
      clock: run.clock,
    });
    const running = reader.startStderrWindow();
    await expect(running.ready).rejects.toThrow();
    run.releaseWindow();
    await expect(running.complete).rejects.toThrow();
    expect(reader.captures()).toHaveLength(1);
    expect(run.executions()).toBe(1);
  }
});

test('partial, premature, foreign and malformed FIFO windows cannot be accepted', async () => {
  for (const change of [
    (r: Record<string, unknown>) => {
      r.samplingWindowComplete = false;
    },
    (r: Record<string, unknown>) => {
      (r.observations as Array<{ stderr: Record<string, unknown> }>)[0].stderr.providerFlags = 0;
    },
    (r: Record<string, unknown>) => {
      (r.observations as Array<{ candidate: Record<string, unknown> }>)[0].candidate.boot = 'foreign';
    },
    (r: Record<string, unknown>) => {
      r.unknown = true;
    },
  ]) {
    const run = await fixture();
    run.mutate(change);
    const reader = await openInstalledProviderReader(run.context, run.admission, {
      executorFactory: run.factory,
      clock: run.clock,
    });
    const running = reader.startStderrWindow();
    await running.ready;
    run.releaseWindow();
    await expect(running.complete).rejects.toThrow();
  }
  const run = await fixture();
  run.prematureWindow();
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  const running = reader.startStderrWindow();
  await running.ready;
  run.releaseWindow();
  await expect(running.complete).rejects.toThrow();
});

test('a production reader cannot take an offline clock without its explicit fixture executor', async () => {
  const run = await fixture();
  await expect(openInstalledProviderReader(run.context, run.admission, { clock: run.clock })).rejects.toThrow(
    'Offline',
  );
  expect(run.executions()).toBe(0);
});

test('subsequent windows keep the original operation budget after its initial startup deadline', async () => {
  const run = await fixture();
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  const first = reader.startStderrWindow();
  await first.ready;
  run.releaseWindow();
  await first.complete;
  const second = reader.startStderrWindow();
  const ready = await second.ready;
  expect(ready.schemaVersion).toBe(3);
  expect(ready.executor).toEqual(parent);
  expect(ready.reader.pid).not.toBe(sdk.pid);
  expect(ready.windowStartedMs).toBe(run.admission.originalStartMs + 45000);
  run.releaseWindow();
  const result = await second.complete;
  expect(result.windowDeadlineMs).toBe(run.admission.originalStartMs + 90000);
  expect(reader.captures()).toHaveLength(2);
  expect(reader.captures().every((value) => value.originalDeadlineMs === run.admission.originalDeadlineMs)).toBe(true);
});

test('issued provider window retains its exact result file and rejects copied or replaced evidence', async () => {
  const run = await fixture();
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  const pending = reader.startStderrWindow();
  await pending.ready;
  run.releaseWindow();
  const window = await pending.complete;
  const evidence = await readOriginalInstalledProviderWindow(window);
  expect(hash(evidence)).toBe(window.evidenceSha256);
  await expect(readOriginalInstalledProviderWindow({ ...window })).rejects.toThrow('original');
  const replacement = `${window.evidencePath}.replacement`;
  await writeFile(replacement, evidence, { flag: 'wx', mode: 0o600 });
  await rename(replacement, window.evidencePath);
  await expect(readOriginalInstalledProviderWindow(window)).rejects.toThrow('changed');
});

test('latest provider uses version4 completed-observation windows while legacy remains version3', async () => {
  const run = await fixture(true);
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  const pending = reader.startStderrWindow();
  const ready = await pending.ready;
  run.releaseWindow();
  const result = await pending.complete;
  expect(ready.schemaVersion).toBe(4);
  expect(result.schemaVersion).toBe(4);
  expect(result.kind).toBe('original-provider-stderr-verified-window');
  expect(result.verificationPolicy).toBe('completed-before-window-end');
});

test('version4 rejects wrong policy, unqualified boundary times and empty observations', async () => {
  for (const change of [
    (r: Record<string, unknown>) => {
      r.verificationPolicy = 'started-before-boundary';
    },
    (r: Record<string, unknown>) => {
      r.boundaryAttempts = 2;
    },
    (r: Record<string, unknown>) => {
      r.observations = [];
    },
    (r: Record<string, unknown>) => {
      (r.observations as Array<Record<string, unknown>>)[0].lastObservedMs = r.windowDeadlineMs;
    },
  ]) {
    const run = await fixture(true);
    run.mutate(change);
    const reader = await openInstalledProviderReader(run.context, run.admission, {
      executorFactory: run.factory,
      clock: run.clock,
    });
    const pending = reader.startStderrWindow();
    await pending.ready;
    run.releaseWindow();
    await expect(pending.complete).rejects.toThrow();
  }
});

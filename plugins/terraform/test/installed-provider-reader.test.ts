import { expect, test } from 'bun:test';
import { mkdtemp, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GoogleProviderLifecycleParser } from '../src/google-provider-lifecycle';
import {
  openInstalledProviderReader,
  readOriginalInstalledProviderWindow,
  readOriginalInstalledProviderWindowClock,
} from '../src/installed-provider-reader';
import { linuxMonotonicMs } from '../src/linux-clock';
import { corroborateOriginalGoogleRpcProvider } from '../src/original-google-provider-source';
import type { ExecutionCaptureAdmission } from '../src/signal-free-executor';
import { signalFreeTerraformExecutor } from '../src/signal-free-executor';

import { fixture, hash, parent, roots, sdk } from './installed-provider-reader-fixture';

test('provider closure witnesses refuse synthetic group flags without original native execution records', async () => {
  const run = await fixture('812');
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  await reader.read();
  expect(typeof reader.readerClosureWitnesses).toBe('function');
  await expect(reader.readerClosureWitnesses()).rejects.toThrow();
  await expect(reader.read()).rejects.toThrow('retired');
  expect(run.executions()).toBe(1);
});

test('an original provider reader with no admitted children records an empty closure set and retires sampling', async () => {
  const run = await fixture('812');
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  expect(await reader.readerClosureWitnesses()).toEqual([]);
  await expect(reader.read()).rejects.toThrow('retired');
  expect(run.executions()).toBe(0);
});

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

test('Google8.11 reader selects its original provider hash and fixed version4 window', async () => {
  const run = await fixture('811');
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
  expect(result.observations[0].candidate.executable_sha256).toBe(
    'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
  );
});

test('paired original window clocks require exact reader issuance and stable bounded offset', async () => {
  const run = await fixture('811');
  const baseMono = run.clock();
  const baseEpoch = Date.now();
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
    epochClock: () => baseEpoch + run.clock() - baseMono,
  });
  const pending = reader.startStderrWindow();
  await pending.ready;
  run.releaseWindow();
  const window = await pending.complete;
  const clock = await readOriginalInstalledProviderWindowClock(window);
  expect(clock.before.monotonicBeforeMs).toBe(baseMono);
  expect(clock.after.monotonicAfterMs).toBe(baseMono + 45000);
  expect(clock.offsetLowerMs).toBeLessThanOrEqual(baseEpoch - baseMono);
  expect(clock.offsetUpperMs).toBeGreaterThanOrEqual(baseEpoch - baseMono);
  await expect(readOriginalInstalledProviderWindowClock({ ...window })).rejects.toThrow('original');
  const original = await readFile(window.evidencePath);
  const replacedPath = `${window.evidencePath}.replaced`;
  await writeFile(replacedPath, Buffer.concat([original, Buffer.from(' ')]), { flag: 'wx', mode: 0o400 });
  await rename(replacedPath, window.evidencePath);
  await expect(readOriginalInstalledProviderWindowClock(window)).rejects.toThrow();
});

test('window clock jumps permanently refuse correspondence and fixture epoch clocks cannot enter real execution', async () => {
  const run = await fixture('811');
  await expect(openInstalledProviderReader(run.context, run.admission, { epochClock: () => 1 })).rejects.toThrow(
    'fixture',
  );
  const baseMono = run.clock(),
    baseEpoch = Date.now();
  let skew = 0;
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
    epochClock: () => baseEpoch + run.clock() - baseMono + skew,
  });
  const pending = reader.startStderrWindow();
  await pending.ready;
  skew = 101;
  run.releaseWindow();
  const window = await pending.complete;
  await expect(readOriginalInstalledProviderWindowClock(window)).rejects.toThrow('clock');
  skew = 0;
  await expect(readOriginalInstalledProviderWindowClock(window)).rejects.toThrow('clock');
});

test('descriptor RPC times must fit independently issued original provider windows', async () => {
  // Real descriptor provenance with explicitly simulated provider logs/windows;
  // this fixture never qualifies a Google provider or cloud execution.
  for (const rpcOffset of [1000, -1000, 50000]) {
    const root = await mkdtemp(join(tmpdir(), 'ce-rpc-window-clock-'));
    roots.push(root);
    const script = join(root, 'simulated-lifecycle.py');
    await writeFile(script, 'pass\n', { mode: 0o600 });
    const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
    const executable = { path: python, sha256: hash(await readFile(python)) };
    const binding = {
      terraformVersion: '1.17.2',
      providerLockSha256: '05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc',
    };
    const providerPath = '/example/terraform-provider-google_v8.11.0_x5';
    const parser = new GoogleProviderLifecycleParser({ providerPath, planSha256: 'a'.repeat(64) }, binding);
    let admission: ExecutionCaptureAdmission | undefined;
    let fixtureFailure: unknown;
    // The concrete window type is retained separately from its synthetic reader.
    let issuedWindow: import('../src/installed-provider-reader').InstalledProviderWindow | undefined;
    const start = linuxMonotonicMs();
    const execute = signalFreeTerraformExecutor({
      python: executable,
      executable,
      originalStartMs: start,
      originalDeadlineMs: start + 7200000,
      assertOriginal: async () => {},
      beforeRelease: async (original) => {
        try {
          admission = original;
          const run = await fixture('811', original.identity);
          const baseMono = run.clock(),
            baseEpoch = Date.now();
          run.mutate((result) => {
            for (const observation of result.observations as Array<Record<string, unknown>>) {
              observation.firstObservedMs = baseMono + 100;
              observation.lastObservedMs = baseMono + 44999;
            }
          });
          const reader = await openInstalledProviderReader(run.context, run.admission, {
            executorFactory: run.factory,
            clock: run.clock,
            epochClock: () => baseEpoch + run.clock() - baseMono,
          });
          const pending = reader.startStderrWindow();
          await pending.ready;
          run.releaseWindow();
          issuedWindow = await pending.complete;
          const row = (offset: number, message: string, fields = {}) =>
            `${JSON.stringify({
              '@level': 'debug',
              '@module': 'provider',
              '@timestamp': new Date(baseEpoch + offset).toISOString(),
              '@message': message,
              ...fields,
            })}\n`;
          const rpc = (offset: number, message: string) =>
            row(offset, message, {
              '@module': 'sdk.proto',
              '@level': 'trace',
              tf_provider_addr: 'registry.terraform.io/hashicorp/google',
              tf_proto_version: '5.11',
              tf_rpc: 'ReadDataSource',
              tf_data_source_type: 'google_client_config',
              tf_req_id: '11111111-2222-3333-4444-555555555555',
            });
          const raw =
            row(-3000, 'starting plugin', { path: providerPath, args: [providerPath] }) +
            row(-2999, 'plugin started', { path: providerPath, pid: 3456 }) +
            rpc(rpcOffset, 'Received request') +
            rpc(rpcOffset + 100, 'Served request') +
            row(60000, 'plugin process exited', { plugin: providerPath, id: '3456' });
          await writeFile(script, `import sys\nsys.stderr.write(${JSON.stringify(raw)})\n`);
        } catch (error) {
          fixtureFailure = error;
          throw error;
        }
      },
      finalCapture: async () => {
        if (fixtureFailure) throw fixtureFailure;
        if (!admission || !issuedWindow) throw new Error('Original fixture output/window unavailable');
        const chunk = await admission.output.read('stderr');
        if (!chunk) throw new Error('Original fixture lifecycle bytes unavailable');
        const [candidate] = parser.pushOriginal(admission.output, chunk);
        const completion = await admission.output.finish();
        parser.finishOriginal(admission.output, completion);
        const correspondence = corroborateOriginalGoogleRpcProvider({
          rpc: candidate,
          windows: [issuedWindow],
          binding,
        });
        if (rpcOffset === 1000) {
          const result = await correspondence;
          expect(result.rpcWindowTimeCorroborated).toBe(true);
          expect(result.providerProcessQualified).toBe(false);
          expect(result.applyRpcQualified).toBe(false);
        } else await expect(correspondence).rejects.toThrow('temporal');
      },
    });
    expect((await execute({ cwd: root, args: [script], env: {} })).code).toBe(0);
  }
});

test('provider reader close is idempotent and retires idle access without starting a child', async () => {
  const run = await fixture('1172');
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  expect(typeof reader.close).toBe('function');
  const closed = reader.close();
  expect(reader.close()).toBe(closed);
  await closed;
  await expect(reader.read()).rejects.toThrow('retired');
  await expect(reader.assertOriginal()).rejects.toThrow('retired');
  expect(() => reader.startStderrWindow()).toThrow('retired');
  expect(run.executions()).toBe(0);
});

test('provider closure waits for the same reader naturally and never adopts the apply parent closure', async () => {
  const run = await fixture('1172');
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  expect(typeof reader.close).toBe('function');
  const pending = reader.startStderrWindow();
  pending.complete.catch(() => {});
  await pending.ready;
  let completed = false;
  const closure = reader.close();
  closure.then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  run.releaseWindow();
  await expect(pending.complete).rejects.toThrow('retired');
  await closure;
  const [capture] = reader.captures();
  expect(capture.identity).toEqual(sdk);
  expect(capture.originalGroupClosed).toBe(true);
  expect(capture.originalDeadlineMs).toBe(run.admission.originalDeadlineMs);
  const raw = JSON.parse(await readFile(join(dirname(capture.stdoutPath), 'provider-result.private.json'), 'utf8'));
  expect(raw.executorAvailable).toBe(true);
  expect(raw.executorGroupClosed).toBe(false);
  expect(run.executions()).toBe(1);
});

test('completed provider evidence retires on close while its original child receipt remains unchanged', async () => {
  const run = await fixture('1172');
  const baseMono = run.clock(),
    baseEpoch = Date.now();
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
    epochClock: () => baseEpoch + run.clock() - baseMono,
  });
  expect(typeof reader.close).toBe('function');
  const pending = reader.startStderrWindow();
  await pending.ready;
  run.releaseWindow();
  const window = await pending.complete;
  await readOriginalInstalledProviderWindowClock(window);
  const [capture] = reader.captures(),
    path = join(dirname(capture.stdoutPath), 'capture.private.json');
  const original = await readFile(path);
  expect(() => Object.assign(capture, { originalGroupClosed: false })).toThrow();
  const readerIdentity = capture.identity;
  if (!readerIdentity) throw new Error('Original reader capture identity required');
  expect(() => Object.assign(readerIdentity, { pid: parent.pid })).toThrow();
  await reader.close();
  await expect(readOriginalInstalledProviderWindow(window)).rejects.toThrow('retired');
  await expect(readOriginalInstalledProviderWindowClock(window)).rejects.toThrow('retired');
  expect(await readFile(path)).toEqual(original);
});

test('failed provider capture can close its independently closed child without erasing its failed result', async () => {
  const run = await fixture('1172');
  run.mutate((value) => {
    value.samplingWindowComplete = false;
  });
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  expect(typeof reader.close).toBe('function');
  const pending = reader.startStderrWindow();
  await pending.ready;
  run.releaseWindow();
  await expect(pending.complete).rejects.toThrow();
  const [capture] = reader.captures();
  const path = join(dirname(capture.stdoutPath), 'provider-result.private.json'),
    before = await readFile(path);
  await reader.close();
  expect(await readFile(path)).toEqual(before);
  expect(JSON.parse(before.toString()).samplingWindowComplete).toBe(false);
  await expect(reader.read()).rejects.toThrow('retired');
});

for (const changed of ['group', 'exit', 'identity', 'signals'])
  test(`provider closure refuses ${changed} child evidence and retains the original failed capture`, async () => {
    const run = await fixture('1172');
    run.mutateCapture((capture) => {
      if (changed === 'group') capture.originalGroupClosed = false;
      if (changed === 'exit') capture.actualExitCode = null;
      if (changed === 'identity') capture.identity = parent;
      if (changed === 'signals') capture.signalsSent = true;
    });
    const reader = await openInstalledProviderReader(run.context, run.admission, {
      executorFactory: run.factory,
      clock: run.clock,
    });
    expect(typeof reader.close).toBe('function');
    const pending = reader.startStderrWindow();
    await pending.ready;
    run.releaseWindow();
    await Promise.allSettled([pending.complete]);
    const [capture] = reader.captures(),
      path = join(dirname(capture.stdoutPath), 'capture.private.json');
    const original = await readFile(path);
    const closing = reader.close();
    expect(reader.close()).toBe(closing);
    await expect(closing).rejects.toThrow('closure');
    expect(await readFile(path)).toEqual(original);
  });

test('provider closure refuses a substituted receipt even when its bytes match', async () => {
  const run = await fixture('1172');
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
  });
  expect(typeof reader.close).toBe('function');
  const pending = reader.startStderrWindow();
  await pending.ready;
  run.releaseWindow();
  await pending.complete;
  const [capture] = reader.captures(),
    path = join(dirname(capture.stdoutPath), 'capture.private.json');
  await rename(path, `${path}.original`);
  await writeFile(path, await readFile(`${path}.original`), { mode: 0o400, flag: 'wx' });
  await expect(reader.close()).rejects.toThrow();
  expect(reader.captures()).toHaveLength(1);
});

test('a terminal reader with no final capture cannot claim independent child closure', async () => {
  const run = await fixture('1172');
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: (policy) => run.factory({ ...policy, finalCapture: async () => {} }),
    clock: run.clock,
  });
  expect(typeof reader.close).toBe('function');
  const pending = reader.startStderrWindow();
  await pending.ready;
  run.releaseWindow();
  await expect(pending.complete).rejects.toThrow();
  expect(reader.captures()).toHaveLength(0);
  await expect(reader.close()).rejects.toThrow('closure');
  expect(run.executions()).toBe(1);
});

test('current Google8.12 preserves the original stderr window schema and closure', async () => {
  const run = await fixture('812');
  const baseMono = run.clock();
  const baseEpoch = Date.now();
  const reader = await openInstalledProviderReader(run.context, run.admission, {
    executorFactory: run.factory,
    clock: run.clock,
    epochClock: () => baseEpoch + run.clock() - baseMono,
  });
  const pending = reader.startStderrWindow();
  await pending.ready;
  run.releaseWindow();
  const window = await pending.complete;
  expect(window.schemaVersion).toBe(4);
  await readOriginalInstalledProviderWindowClock(window);
  await reader.close();
  await expect(readOriginalInstalledProviderWindow(window)).rejects.toThrow('retired');
});

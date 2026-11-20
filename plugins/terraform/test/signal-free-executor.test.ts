import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import { linuxMonotonicMs } from '../src/linux-clock';
import {
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeBootstrapSource,
  signalFreeTerraformExecutor,
} from '../src/signal-free-executor';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const directories: string[] = [];
afterEach(async () => {
  for (const root of directories.splice(0)) {
    const evidenceExists = await lstat(join(root, 'executor-diagnostics')).then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    if (!evidenceExists) await rm(root, { recursive: true });
  }
});
async function fixture(
  body: string,
  limits: Pick<
    SignalFreeExecutionPolicy,
    | 'timeoutMs'
    | 'maxOutputBytes'
    | 'startupTimeoutMs'
    | 'beforeRelease'
    | 'assertOriginalIdentity'
    | 'assertFinalInputs'
  > = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'ce-signal-free-'));
  directories.push(root);
  const script = join(root, 'fixture.py');
  await writeFile(script, body, { mode: 0o600 });
  const captures: FinalExecutionCapture[] = [];
  const checks: Array<() => Promise<void>> = [];
  const finalChecks: Array<() => Promise<void>> = [];
  const started = linuxMonotonicMs();
  const executor = signalFreeTerraformExecutor({
    python: { path: python, sha256: hash(await readFile(python)) },
    executable: { path: python, sha256: hash(await readFile(python)) },
    originalStartMs: started,
    originalDeadlineMs: started + 7_200_000,
    assertOriginal: async () => {
      for (const check of checks) await check();
    },
    finalCapture: async (capture) => {
      captures.push(capture);
      for (const check of finalChecks) await check();
    },
    ...limits,
  });
  return { root, script, executor, captures, checks, finalChecks, started };
}

describe('signal-free original executor on Linux', () => {
  test('bootstrap readiness is published only after the complete immutable JSON is durable', async () => {
    const run = await fixture('print("must-not-execute")\n');
    await mkdir(join(run.root, 'executor-diagnostics'));
    const source = join(run.root, 'slow-bootstrap.py');
    const ready = join(run.root, 'ready.json');
    const slowWriter = `import json,time
def slow_dump(value,stream):
 raw=json.dumps(value)
 stream.write(raw[:1]);stream.flush()
 time.sleep(0.3)
 stream.write(raw[1:])
json.dump=slow_dump
`;
    await writeFile(source, slowWriter + signalFreeBootstrapSource, { mode: 0o400 });
    const child = Bun.spawn([python, '-I', '-B', source, ready, python, run.script], {
      cwd: run.root,
      env: {},
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = new Response(child.stdout).text();
    const errors = new Response(child.stderr).text();
    try {
      const deadline = linuxMonotonicMs() + 3000;
      while (!(await Bun.file(ready).exists()) && linuxMonotonicMs() < deadline) await Bun.sleep(10);
      expect(await Bun.file(ready).exists()).toBe(true);
      const evidence = JSON.parse(await readFile(ready, 'utf8'));
      expect(evidence.pid).toBe(child.pid);
      expect((await lstat(ready)).mode & 0o777).toBe(0o400);
    } finally {
      await child.stdin.end();
      await child.exited;
      await Promise.all([output, errors]);
    }
    expect(await child.exited).toBe(73);
  });

  test('ambient Python and native-loader injection refuses before launching the original gate', async () => {
    const run = await fixture('print("must-not-run")\n');
    for (const key of [
      'PYTHONPATH',
      'PYTHONHOME',
      'PYTHONSTARTUP',
      'PYTHONINSPECT',
      'PYTHONUSERBASE',
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES',
    ]) {
      await expect(
        run.executor({ cwd: run.root, args: [run.script], env: { [key]: '/foreign/loader' } }),
      ).rejects.toThrow('loader substitution');
    }
    expect(run.captures).toHaveLength(0);
    expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(false);
  });

  test('trusted capture starts against the original gated identity before command release', async () => {
    let observed = false;
    const run = await fixture('from pathlib import Path\nPath("executed").write_text("yes")\n', {
      beforeRelease: async (admission) => {
        expect(await Bun.file(join(admission.directory, 'executed')).exists()).toBe(false);
        const raw = await readFile(`/proc/${admission.identity.pid}/stat`, 'utf8');
        const fields = raw
          .slice(raw.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        expect(admission.identity.start).toBe(fields[19]);
        expect(admission.identity.group).toBe(admission.identity.pid);
        expect(admission.identity.boot).toBe((await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim());
        expect(Object.isFrozen(admission)).toBe(true);
        expect(Object.isFrozen(admission.identity)).toBe(true);
        expect(Object.isFrozen(admission.args)).toBe(true);
        expect(await Bun.file(admission.stdoutPath).exists()).toBe(true);
        observed = true;
      },
    });
    const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
    expect(observed).toBe(true);
    expect(result.code).toBe(0);
    expect(await Bun.file(join(run.root, 'executed')).exists()).toBe(true);
  });

  test('capture startup failure prevents submission and still invokes independent final capture', async () => {
    const run = await fixture('from pathlib import Path\nPath("executed").write_text("yes")\n', {
      beforeRelease: async () => {
        throw new Error('reader authentication unavailable');
      },
    });
    const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
    expect(result.code).toBe(1);
    expect(await Bun.file(join(run.root, 'executed')).exists()).toBe(false);
    expect(run.captures).toHaveLength(1);
    expect(run.captures[0].submitted).toBe(false);
    expect(run.captures[0].reason).toBe('startup');
    expect(
      JSON.parse(await readFile(join(dirname(run.captures[0].stdoutPath), 'completion.private.json'), 'utf8'))
        .originalGroupClosed,
    ).toBe(true);
    expect(run.captures[0].signalsSent).toBe(false);
  });

  test('lost original capture stream refuses release and reaches final capture with an unresolved claim', async () => {
    const run = await fixture('from pathlib import Path\nPath("executed").write_text("yes")\n', {
      beforeRelease: async (admission) => {
        await rm(admission.stdoutPath);
      },
    });
    run.finalChecks.push(async () => {
      throw new Error('required original stream unavailable');
    });
    await expect(run.executor({ cwd: run.root, args: [run.script], env: {} })).rejects.toThrow(
      'required original stream unavailable',
    );
    expect(run.captures).toHaveLength(1);
    expect(run.captures[0].submitted).toBe(false);
    expect(run.captures[0].reason).toBe('input-changed');
    expect(run.captures[0].signalsSent).toBe(false);
    expect(await Bun.file(join(run.root, 'executed')).exists()).toBe(false);
    expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'capture-unresolved.json')).exists()).toBe(true);
  });

  test('late reader startup cannot submit after the original startup budget and must settle before final capture', async () => {
    let readerFinished = false;
    const run = await fixture('from pathlib import Path\nPath("executed").write_text("yes")\n', {
      startupTimeoutMs: 1500,
      beforeRelease: async () => {
        await Bun.sleep(1800);
        readerFinished = true;
      },
    });
    run.finalChecks.push(async () => {
      expect(readerFinished).toBe(true);
    });
    const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
    expect(result.code).toBe(1);
    expect(await Bun.file(join(run.root, 'executed')).exists()).toBe(false);
    expect(run.captures[0].submitted).toBe(false);
    expect(run.captures[0].reason).toBe('startup');
    expect(run.captures[0].invocationStartedMs).toBeGreaterThanOrEqual(run.started);
    expect(run.captures[0].originalDeadlineMs).toBe(run.started + 7_200_000);
    expect(run.captures[0].signalsSent).toBe(false);
  });

  test('uses exact argv, retains private streams and closes the original group naturally', async () => {
    const run = await fixture(
      'import json,sys\nprint(json.dumps(sys.argv[1:]))\nprint("private-stderr",file=sys.stderr)\n',
    );
    const args = ['literal `text`', 'a $value', 'quote\'"', 'line\nnext'];
    const result = await run.executor({ cwd: run.root, args: [run.script, ...args], env: {} });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(args);
    expect(run.captures).toHaveLength(1);
    expect(run.captures[0].signalsSent).toBe(false);
    expect(
      JSON.parse(await readFile(join(dirname(run.captures[0].stdoutPath), 'completion.private.json'), 'utf8'))
        .originalGroupClosed,
    ).toBe(true);
    expect(run.captures[0].submitted).toBe(true);
    expect((await readFile(run.captures[0].stderrPath, 'utf8')).trim()).toBe('private-stderr');
    expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(false);
  });

  test('deadline failure waits for natural completion and preserves the disruption clock', async () => {
    const run = await fixture('import time\ntime.sleep(2)\nprint("natural-exit")\n', { timeoutMs: 1500 });
    const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
    expect(result.code).toBe(1);
    expect(run.captures).toHaveLength(1);
    expect(run.captures[0].reason).toBe('deadline');
    expect(run.captures[0].invocationStartedMs).toBeGreaterThanOrEqual(run.started);
    expect(run.captures[0].finalStartedMs).toBeLessThan(run.captures[0].finishedMs);
    expect(run.captures[0].finalDeadlineMs).toBe(run.captures[0].finalStartedMs + 300_000);
    expect(
      JSON.parse(await readFile(join(dirname(run.captures[0].stdoutPath), 'completion.private.json'), 'utf8'))
        .actualExitCode,
    ).toBe(0);
    expect((await readFile(run.captures[0].stdoutPath, 'utf8')).trim()).toBe('natural-exit');
    expect(run.captures[0].signalsSent).toBe(false);
  });

  test('abort is a refusal, never a signal or successful result', async () => {
    const run = await fixture(
      'import time\nfrom pathlib import Path\nPath("running").write_text("yes")\ntime.sleep(0.6)\nprint("continued-to-natural-exit")\n',
    );
    const controller = new AbortController();
    const executing = run.executor({ cwd: run.root, args: [run.script], env: {}, signal: controller.signal });
    const until = linuxMonotonicMs() + 3000;
    while (!(await Bun.file(join(run.root, 'running')).exists()) && linuxMonotonicMs() < until) await Bun.sleep(10);
    expect(await Bun.file(join(run.root, 'running')).exists()).toBe(true);
    controller.abort();
    const result = await executing;
    expect(result.code).toBe(1);
    expect(run.captures[0].reason).toBe('cancelled');
    expect(
      JSON.parse(await readFile(join(dirname(run.captures[0].stdoutPath), 'completion.private.json'), 'utf8'))
        .actualExitCode,
    ).toBe(0);
    expect(run.captures[0].signalsSent).toBe(false);
  });

  test('over-limit output is retained privately and drained without terminating its writer', async () => {
    const run = await fixture('print("x"*100000)\n', { maxOutputBytes: 100 });
    const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(run.captures[0].reason).toBe('output-limit');
    expect(
      JSON.parse(await readFile(join(dirname(run.captures[0].stdoutPath), 'completion.private.json'), 'utf8'))
        .actualExitCode,
    ).toBe(0);
    expect((await readFile(run.captures[0].stdoutPath)).length).toBeGreaterThan(100000);
  });

  test('original-input refusal before release closes the gate through EOF without execution', async () => {
    const run = await fixture('from pathlib import Path\nPath("submitted").write_text("yes")\n');
    run.checks.push(async () => {
      throw new Error('original inputs unavailable');
    });
    await expect(run.executor({ cwd: run.root, args: [run.script], env: {} })).rejects.toThrow();
    expect(await Bun.file(join(run.root, 'submitted')).exists()).toBe(false);
  });

  test('original input changes during execution fail without replacing or stopping the child', async () => {
    const run = await fixture(
      'import time\nfrom pathlib import Path\nPath("input").write_text("changed")\ntime.sleep(0.2)\nprint("done")\n',
    );
    await writeFile(join(run.root, 'input'), 'original', { mode: 0o600 });
    run.checks.push(async () => {
      if ((await readFile(join(run.root, 'input'), 'utf8')) !== 'original') throw new Error('original input changed');
    });
    const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
    expect(result.code).toBe(1);
    expect(run.captures[0].reason).toBe('input-changed');
    expect(
      JSON.parse(await readFile(join(dirname(run.captures[0].stdoutPath), 'completion.private.json'), 'utf8'))
        .actualExitCode,
    ).toBe(0);
  });

  test('startup deadline expires through EOF and cannot submit', async () => {
    const run = await fixture('from pathlib import Path\nPath("submitted").write_text("yes")\n', {
      startupTimeoutMs: 1,
    });
    const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
    expect(result.code).toBe(1);
    expect(run.captures[0].submitted).toBe(false);
    expect(run.captures[0].reason).toBe('startup');
    expect(await Bun.file(join(run.root, 'submitted')).exists()).toBe(false);
  });

  test('wrong executable pin and expired original budget refuse before submission', async () => {
    const run = await fixture('print("unexpected")\n');
    const policy = {
      python: { path: python, sha256: hash(await readFile(python)) },
      executable: { path: python, sha256: '0'.repeat(64) },
      originalStartMs: run.started,
      originalDeadlineMs: run.started + 7_200_000,
      assertOriginal: async () => {},
      finalCapture: async () => {},
    };
    await expect(signalFreeTerraformExecutor(policy)({ cwd: run.root, args: [run.script], env: {} })).rejects.toThrow();
    expect(() => signalFreeTerraformExecutor({ ...policy, originalDeadlineMs: run.started + 1 })).toThrow();
  });

  test('failed final capture retains the claim and refuses automatic dead-owner reclaim', async () => {
    const run = await fixture('print("complete")\n');
    run.finalChecks.push(async () => {
      throw new Error('original reader closure unresolved');
    });
    await expect(run.executor({ cwd: run.root, args: [run.script], env: {} })).rejects.toThrow();
    const lock = join(run.root, '.terraform-executor-lock');
    expect(await Bun.file(join(lock, 'claim.json')).exists()).toBe(true);
    await expect(acquireProcessLock(lock)).rejects.toThrow();
  });
});

test('final capture begins before a timed-out original child finishes', async () => {
  const run = await fixture('import time\ntime.sleep(2)\nprint("natural-exit")\n', { timeoutMs: 1500 });
  run.finalChecks.push(async () => {
    const capture = run.captures.at(-1);
    if (!capture) throw new Error('Original capture unavailable');
    expect(capture.actualExitCode).toBeNull();
    expect(capture.originalGroupClosed).toBe(false);
    expect(await Bun.file(`/proc/${capture.pid}/stat`).exists()).toBe(true);
    expect(capture.finalDeadlineMs).toBe(capture.finalStartedMs + 300000);
  });
  const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
  expect(result.code).toBe(1);
  expect((await readFile(run.captures[0].stdoutPath, 'utf8')).trim()).toBe('natural-exit');
  expect(await Bun.file(join(run.root, '.terraform-executor-lock')).exists()).toBe(false);
});

test('final receipt persistence failure still captures within the original reserve and retains the claim', async () => {
  const run = await fixture('print("natural-exit")\n', {
    beforeRelease: async (admission) => {
      await mkdir(join(dirname(admission.stdoutPath), 'final.private.json'));
    },
  });
  await expect(run.executor({ cwd: run.root, args: [run.script], env: {} })).rejects.toThrow();
  expect(run.captures).toHaveLength(1);
  expect(run.captures[0].finalDeadlineMs).toBe(run.captures[0].finalStartedMs + 300_000);
  expect(linuxMonotonicMs()).toBeLessThan(run.captures[0].finalDeadlineMs);
  const lock = join(run.root, '.terraform-executor-lock');
  expect(await Bun.file(join(lock, 'claim.json')).exists()).toBe(true);
  expect(await Bun.file(join(lock, 'capture-unresolved.json')).exists()).toBe(true);
  await expect(acquireProcessLock(lock)).rejects.toThrow();
});

test('completion receipt persistence failure retains a closed original group claim', async () => {
  const run = await fixture('print("natural-exit")\n', {
    beforeRelease: async (admission) => {
      await mkdir(join(dirname(admission.stdoutPath), 'completion.private.json'));
    },
  });
  await expect(run.executor({ cwd: run.root, args: [run.script], env: {} })).rejects.toThrow();
  expect(run.captures).toHaveLength(1);
  expect(run.captures[0].originalGroupClosed).toBe(true);
  const lock = join(run.root, '.terraform-executor-lock');
  expect(await Bun.file(join(lock, 'claim.json')).exists()).toBe(true);
  expect(await Bun.file(join(lock, 'capture-unresolved.json')).exists()).toBe(true);
  await expect(acquireProcessLock(lock)).rejects.toThrow();
});

test('unresolved flag persistence failure preserves the original capture error and claim', async () => {
  const run = await fixture('print("natural-exit")\n');
  const original = new Error('original final reader failure');
  run.finalChecks.push(async () => {
    await mkdir(join(run.root, '.terraform-executor-lock', 'capture-unresolved.json'));
    throw original;
  });
  let failure: unknown;
  try {
    await run.executor({ cwd: run.root, args: [run.script], env: {} });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Aggregate capture failure required');
  expect(failure.errors).toContain(original);
  expect(failure.errors).toHaveLength(2);
  const lock = join(run.root, '.terraform-executor-lock');
  expect(await Bun.file(join(lock, 'claim.json')).exists()).toBe(true);
  await expect(acquireProcessLock(lock)).rejects.toThrow();
});

test('final persistence and callback failures are both retained', async () => {
  const run = await fixture('print("natural-exit")\n', {
    beforeRelease: async (admission) => {
      await mkdir(join(dirname(admission.stdoutPath), 'final.private.json'));
    },
  });
  const original = new Error('independent final reader failure');
  run.finalChecks.push(async () => {
    throw original;
  });
  let failure: unknown;
  try {
    await run.executor({ cwd: run.root, args: [run.script], env: {} });
  } catch (error) {
    failure = error;
  }
  expect(run.captures).toHaveLength(1);
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Aggregate capture failure required');
  expect(failure.errors).toContain(original);
  expect(failure.errors).toHaveLength(2);
  expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(true);
});

test('completion persistence does not mask an independent callback failure', async () => {
  const run = await fixture('print("natural-exit")\n', {
    beforeRelease: async (admission) => {
      await mkdir(join(dirname(admission.stdoutPath), 'completion.private.json'));
    },
  });
  const original = new Error('original callback failure before completion');
  run.finalChecks.push(async () => {
    throw original;
  });
  let failure: unknown;
  try {
    await run.executor({ cwd: run.root, args: [run.script], env: {} });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Aggregate capture failure required');
  expect(failure.errors).toContain(original);
  expect(failure.errors).toHaveLength(2);
  expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(true);
});

test('late group closure refusal retains the earlier callback failure', async () => {
  const run = await fixture('import time\ntime.sleep(2)\nprint("natural-exit")\n', { timeoutMs: 1500 });
  const original = new Error('original final capture failure before group closure');
  run.finalChecks.push(async () => {
    expect(run.captures[0].actualExitCode).toBeNull();
    await mkdir(join(run.root, '.terraform-executor-lock', 'capture-unresolved.json'));
    throw original;
  });
  let failure: unknown;
  try {
    await run.executor({ cwd: run.root, args: [run.script], env: {} });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Aggregate capture failure required');
  expect(failure.errors.flatMap((error) => (error instanceof AggregateError ? error.errors : [error]))).toContain(
    original,
  );
  expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(true);
});

test('input guard failure after natural success retains exact private cause and original identity', async () => {
  const run = await fixture('from pathlib import Path\nPath("executed").write_text("yes")\n');
  const cause = new Error('synthetic original guard failure');
  run.checks.push(async () => {
    if (await Bun.file(join(run.root, 'executed')).exists()) throw cause;
  });
  const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
  expect(result.code).toBe(1);
  const capture = run.captures[0];
  expect(capture.actualExitCode).toBe(0);
  expect(capture.reason).toBe('input-changed');
  const evidence = capture.inputFailureEvidence;
  expect(evidence).toBeDefined();
  if (!evidence) throw new Error('Required original failure evidence missing');
  const raw = await readFile(evidence.path);
  expect(hash(raw)).toBe(evidence.sha256);
  expect((await lstat(evidence.path)).mode & 0o777).toBe(0o400);
  const diagnostic = JSON.parse(raw.toString());
  expect(diagnostic.kind).toBe('original-executor-input-failure');
  expect(diagnostic.phase).toBe('original-input-check');
  expect(diagnostic.identity).toEqual(capture.identity);
  expect(diagnostic.error.message).toBe(cause.message);
  expect(diagnostic.error.stack).toBe(cause.stack);
  expect(diagnostic.finalStartedMs).toBe(capture.finalStartedMs);
  expect(JSON.stringify(capture)).not.toContain(cause.message);
});

test('input failure persistence retains both errors and final capture before refusing closure', async () => {
  const cause = new Error('synthetic input failure with unavailable receipt');
  const run = await fixture('from pathlib import Path\nPath("executed").write_text("yes")\n', {
    beforeRelease: async (admission) => {
      await mkdir(join(dirname(admission.stdoutPath), 'input-failure.private.json'));
    },
  });
  run.checks.push(async () => {
    if (await Bun.file(join(run.root, 'executed')).exists()) throw cause;
  });
  let retained: unknown;
  try {
    await run.executor({ cwd: run.root, args: [run.script], env: {} });
  } catch (error) {
    retained = error;
  }
  expect(retained).toBeInstanceOf(AggregateError);
  if (!(retained instanceof AggregateError)) throw new Error('Required aggregated failure missing');
  expect(retained.errors[0]).toBe(cause);
  expect(retained.errors[1].code).toBe('EEXIST');
  expect(run.captures).toHaveLength(1);
  expect(run.captures[0].originalGroupClosed).toBe(true);
  expect(run.captures[0].reason).toBe('input-changed');
  const completion = JSON.parse(
    await readFile(join(dirname(run.captures[0].stdoutPath), 'completion.private.json'), 'utf8'),
  );
  expect(completion.originalGroupClosed).toBe(true);
  expect(completion.captureClosed).toBe(true);
  expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'capture-unresolved.json')).exists()).toBe(true);
});

test('startup callback failure retains private original cause without exposing it or submitting', async () => {
  const cause = new Error('synthetic private startup credential detail');
  const run = await fixture('print("must-not-run")\n', {
    beforeRelease: async () => {
      throw cause;
    },
  });
  const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
  expect(result.code).toBe(1);
  expect(JSON.stringify(result)).not.toContain(cause.message);
  const capture = run.captures[0];
  const evidence = capture.startupFailureEvidence;
  expect(evidence).toHaveLength(1);
  if (!evidence) throw new Error('Startup evidence required');
  expect(evidence[0].phase).toBe('callback');
  const raw = await readFile(evidence[0].path);
  expect(hash(raw)).toBe(evidence[0].sha256);
  expect((await lstat(evidence[0].path)).mode & 0o777).toBe(0o400);
  const diagnostic = JSON.parse(raw.toString());
  expect(diagnostic.kind).toBe('original-executor-startup-failure');
  expect(diagnostic.error.message).toBe(cause.message);
  expect(diagnostic.error.stack).toBe(cause.stack);
  expect(diagnostic.identity).toEqual(capture.identity);
  expect(diagnostic.finalStartedMs).toBe(capture.finalStartedMs);
  expect(capture.reason).toBe('startup');
  expect(capture.submitted).toBe(false);
  expect(JSON.stringify(capture)).not.toContain(cause.message);
});

test('late callback error and startup deadline keep separate evidence without resetting the reserve', async () => {
  const cause = new Error('synthetic late original reader failure');
  const run = await fixture('print("must-not-run")\n', {
    startupTimeoutMs: 1500,
    beforeRelease: async () => {
      await Bun.sleep(1800);
      throw cause;
    },
  });
  const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
  expect(result.code).toBe(1);
  const capture = run.captures[0];
  expect(capture.startupFailureEvidence).toHaveLength(2);
  const evidence = capture.startupFailureEvidence;
  if (!evidence) throw new Error('Startup evidence required');
  expect(evidence.map((item) => item.phase).sort()).toEqual(['callback', 'deadline']);
  const diagnostics = await Promise.all(evidence.map(async (item) => JSON.parse(await readFile(item.path, 'utf8'))));
  expect(diagnostics.find((item) => item.phase === 'callback').error.message).toBe(cause.message);
  expect(diagnostics.every((item) => item.finalStartedMs === capture.finalStartedMs)).toBe(true);
  expect(capture.finalDeadlineMs).toBe(capture.finalStartedMs + 300_000);
  const completion = JSON.parse(await readFile(join(dirname(capture.stdoutPath), 'completion.private.json'), 'utf8'));
  expect(completion.startupFailureEvidence).toEqual(evidence);
  expect(completion.submitted).toBe(false);
});

test('startup diagnostic persistence preserves original cause and refusal after final capture', async () => {
  const cause = new Error('synthetic original startup failure');
  const run = await fixture('print("must-not-run")\n', {
    beforeRelease: async (admission) => {
      await mkdir(join(dirname(admission.stdoutPath), 'startup-callback-failure.private.json'));
      throw cause;
    },
  });
  let retained: unknown;
  try {
    await run.executor({ cwd: run.root, args: [run.script], env: {} });
  } catch (error) {
    retained = error;
  }
  expect(retained).toBeInstanceOf(AggregateError);
  if (!(retained instanceof AggregateError)) throw new Error('Aggregated startup failure required');
  expect(retained.errors[0]).toBe(cause);
  expect(retained.errors[1].code).toBe('EEXIST');
  expect(run.captures).toHaveLength(1);
  expect(run.captures[0].submitted).toBe(false);
  expect(run.captures[0].reason).toBe('startup');
  expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'capture-unresolved.json')).exists()).toBe(true);
});

test('continuous executor polling keeps full digests at release and around final capture', async () => {
  const events: string[] = [];
  let identityChecks = 0;
  const run = await fixture('print("original-success")\n', {
    assertOriginalIdentity: async () => {
      identityChecks++;
    },
    assertFinalInputs: async () => {
      events.push('final-digest');
    },
    beforeRelease: async () => {
      events.push('before-release');
    },
  });
  run.checks.push(async () => {
    events.push('digest');
  });
  run.finalChecks.push(async () => {
    events.push('capture');
  });
  const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
  expect(result.code).toBe(0);
  expect(identityChecks).toBeGreaterThan(0);
  expect(events.slice(events.indexOf('before-release') + 1)).toContain('digest');
  expect(events.slice(-3)).toEqual(['final-digest', 'capture', 'final-digest']);
});

test('continuous executor policy cannot omit its independent full final digest hook', async () => {
  await expect(
    fixture('print("must-not-run")\n', {
      assertOriginalIdentity: async () => {},
    }),
  ).rejects.toThrow('policy');
});

test('changed full release digest refuses even when continuous identity polling succeeds', async () => {
  let before = false;
  const run = await fixture('print("must-not-run")\n', {
    assertOriginalIdentity: async () => {},
    assertFinalInputs: async () => {},
    beforeRelease: async () => {
      before = true;
    },
  });
  run.checks.push(async () => {
    if (before) throw new Error('full release digest changed');
  });
  const result = await run.executor({ cwd: run.root, args: [run.script], env: {} });
  expect(result.code).toBe(1);
  expect(run.captures[0].reason).toBe('input-changed');
  expect(run.captures[0].submitted).toBe(false);
  expect(run.captures[0].stdoutPath && (await readFile(run.captures[0].stdoutPath, 'utf8'))).not.toContain(
    'must-not-run',
  );
});

test('failed full final digest keeps final capture evidence and an unresolved flag', async () => {
  const run = await fixture('print("owned-original")\n', {
    assertOriginalIdentity: async () => {},
    assertFinalInputs: async () => {
      throw new Error('final digest changed');
    },
  });
  await expect(run.executor({ cwd: run.root, args: [run.script], env: {} })).rejects.toThrow();
  expect(run.captures).toHaveLength(1);
  expect(await Bun.file(join(run.root, '.terraform-executor-lock/capture-unresolved.json')).exists()).toBe(true);
});

import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, link, mkdtemp, open, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { acquireProcessLock, assertExecutorGroupClosed } from '../../platform/src/ce/process-lock';
import { GoogleProviderLifecycleParser, readOriginalGoogleProviderRpcSource } from '../src/google-provider-lifecycle';
import { linuxMonotonicMs } from '../src/linux-clock';
import { corroborateOriginalGoogleRpcProvider } from '../src/original-google-provider-source';
import {
  bindOriginalExecutionOutput,
  type OriginalExecutionOutput,
  readOriginalExecutionChunk,
  readOriginalExecutionCompletion,
} from '../src/original-output-stream';
import {
  type ExecutionCaptureAdmission,
  signalFreeBootstrapSource,
  signalFreeTerraformExecutor,
} from '../src/signal-free-executor';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

async function fixture(
  body: string,
  start: (a: ExecutionCaptureAdmission) => Promise<void>,
  final: (output: OriginalExecutionOutput) => Promise<void>,
  maximum = 64 * 1024 * 1024,
) {
  const root = await mkdtemp(join(tmpdir(), 'ce-original-output-'));
  await writeFile(join(root, 'fixture.py'), body, { mode: 0o600 });
  const originalStartMs = linuxMonotonicMs();
  const executable = { path: python, sha256: hash(await readFile(python)) };
  let output: OriginalExecutionOutput | undefined;
  const execute = signalFreeTerraformExecutor({
    python: executable,
    executable,
    originalStartMs,
    originalDeadlineMs: originalStartMs + 7_200_000,
    maxOutputBytes: maximum,
    assertOriginal: async () => {},
    beforeRelease: async (a) => {
      output = a.output;
      await start(a);
    },
    finalCapture: async () => {
      if (!output) throw new Error('Original output unavailable');
      await final(output);
    },
  });
  return { root, execute: () => execute({ cwd: root, args: [join(root, 'fixture.py')], env: {} }) };
}

test('original gated descriptors expose bounded offsets and complete hashes after independent closure', async () => {
  let retained: OriginalExecutionOutput | undefined;
  const run = await fixture(
    'import sys\nprint("first")\nprint("error",file=sys.stderr)\n',
    async (a) => {
      retained = a.output;
      expect(Object.isFrozen(a.output)).toBe(true);
      expect(await a.output.read('stdout')).toBeNull();
      await expect(a.output.finish()).rejects.toThrow('live');
    },
    async (output) => {
      const out = await output.read('stdout');
      expect(out?.offset).toBe(0);
      expect(out?.endOffset).toBe(6);
      expect(out?.bytes.toString()).toBe('first\n');
      expect(out?.sha256).toBe(hash('first\n'));
      expect(Object.isFrozen(out)).toBe(true);
      expect(await output.read('stdout')).toBeNull();
      const err = await output.read('stderr');
      expect(err?.bytes.toString()).toBe('error\n');
      // Caller mutation cannot change the retained-prefix digest.
      out?.bytes.fill(0);
      const done = await output.finish();
      expect(done.stdout).toEqual({ bytes: 6, sha256: hash('first\n') });
      expect(done.stderr).toEqual({ bytes: 6, sha256: hash('error\n') });
      expect(done.originalGroupClosed).toBe(true);
      expect(done.applyRpcQualified).toBe(false);
      expect(done.originalInsertQualified).toBe(false);
      expect(Object.isFrozen(done.stdout)).toBe(true);
    },
  );
  expect((await run.execute()).code).toBe(0);
  if (!retained) throw new Error('Original output unavailable');
  await expect(retained.read('stdout')).rejects.toThrow('closed');
});

test('unconsumed output cannot finish and chunks retain separate contiguous channel offsets', async () => {
  const body = 'import sys\nsys.stdout.write("x"*150000)\nsys.stdout.flush()\n';
  const run = await fixture(
    body,
    async () => {},
    async (output) => {
      await expect(output.finish()).rejects.toThrow('unconsumed');
      const chunks = [];
      for (let chunk = await output.read('stdout'); chunk; chunk = await output.read('stdout')) chunks.push(chunk);
      expect(chunks.map((c) => c.offset)).toEqual([0, 65536, 131072]);
      expect(chunks.map((c) => c.endOffset)).toEqual([65536, 131072, 150000]);
      expect((await output.finish()).stdout.sha256).toBe(hash('x'.repeat(150000)));
    },
  );
  expect((await run.execute()).code).toBe(0);
});

test('consumed-prefix rewriting permanently refuses while retaining original private evidence and claim', async () => {
  let path = '';
  const run = await fixture(
    'print("original")\n',
    async (a) => {
      path = a.stdoutPath;
    },
    async (output) => {
      expect((await output.read('stdout'))?.bytes.toString()).toBe('original\n');
      await writeFile(path, 'modified\n', { mode: 0o600 });
      await expect(output.read('stdout')).rejects.toThrow('prefix');
      await expect(output.finish()).rejects.toThrow('refused');
      throw new Error('Original prefix capture refused');
    },
  );
  await expect(run.execute()).rejects.toThrow('Original prefix capture refused');
  expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'capture-unresolved.json')).exists()).toBe(true);
});

test('path replacement, hard links and broadened permissions cannot adopt new stream identities', async () => {
  for (const mutation of ['replace', 'link', 'mode'] as const) {
    let path = '';
    const run = await fixture(
      'print("original")\n',
      async (a) => {
        path = a.stdoutPath;
      },
      async (output) => {
        if (mutation === 'replace') {
          await rename(path, `${path}.preserved`);
          await writeFile(path, 'foreign\n', { mode: 0o600 });
        }
        if (mutation === 'link') await link(path, `${path}.second`);
        if (mutation === 'mode') await chmod(path, 0o644);
        await expect(output.read('stdout')).rejects.toThrow('identity');
        await expect(output.finish()).rejects.toThrow('refused');
        throw new Error('Original stream capture refused');
      },
    );
    await expect(run.execute()).rejects.toThrow('Original stream capture refused');
    expect(await Bun.file(join(run.root, '.terraform-executor-lock', 'claim.json')).exists()).toBe(true);
  }
});

test('parent replacement cannot recapture the original stream even when the original inode is retained', async () => {
  let root = '';
  const run = await fixture(
    'print("original")\n',
    async (a) => {
      root = dirname(a.stdoutPath);
    },
    async (output) => {
      await rename(root, `${root}.preserved`);
      // Do not manufacture a replacement receipt or repair the historical files.
      await expect(output.read('stdout')).rejects.toThrow();
      await expect(output.finish()).rejects.toThrow('refused');
      throw new Error('Original parent capture refused');
    },
  );
  let failure: unknown;
  try {
    await run.execute();
  } catch (error) {
    failure = error;
  }
  const errors = failure instanceof AggregateError ? failure.errors : [failure];
  expect(errors.some((e) => e instanceof Error && e.message === 'Original parent capture refused')).toBe(true);
  expect(await Bun.file(`${root}.preserved/stdout.private`).exists()).toBe(true);
});

test('concurrent reads refuse instead of replaying offsets', async () => {
  const run = await fixture(
    'print("original")\n',
    async () => {},
    async (output) => {
      const results = await Promise.allSettled([output.read('stdout'), output.read('stdout')]);
      expect(results.some((r) => r.status === 'rejected')).toBe(true);
      await expect(output.finish()).rejects.toThrow('refused');
      throw new Error('Original concurrent capture refused');
    },
  );
  await expect(run.execute()).rejects.toThrow('Original concurrent capture refused');
});

test('capture output bound rejects oversize retention without raising the original execution allowance', async () => {
  const run = await fixture(
    'print("x"*100)\n',
    async () => {},
    async (output) => {
      await expect(output.read('stdout')).rejects.toThrow('limit');
      await expect(output.finish()).rejects.toThrow('refused');
      throw new Error('Original output limit capture refused');
    },
    64,
  );
  await expect(run.execute()).rejects.toThrow('Original output limit capture refused');
});

test('live appends retain partial bytes and final contiguous offsets from the same original child', async () => {
  let collection: Promise<void> | undefined;
  const captured: Buffer[] = [];
  const body =
    'import time,sys\nfrom pathlib import Path\nsys.stdout.write("partial");sys.stdout.flush()\nPath("ready").write_text("yes")\ntime.sleep(0.4)\nsys.stdout.write("-final\\n");sys.stdout.flush()\n';
  const run = await fixture(
    body,
    async (a) => {
      collection = (async () => {
        const deadline = linuxMonotonicMs() + 3000;
        while (!(await Bun.file(join(a.directory, 'ready')).exists())) {
          if (linuxMonotonicMs() >= deadline) throw new Error('Original fixture readiness timeout');
          await Bun.sleep(10);
        }
        const first = await a.output.read('stdout');
        expect(first?.offset).toBe(0);
        expect(first?.bytes.toString()).toBe('partial');
        if (first) captured.push(first.bytes);
      })();
    },
    async (output) => {
      await collection;
      const last = await output.read('stdout');
      expect(last?.offset).toBe(7);
      expect(last?.endOffset).toBe(14);
      if (last) captured.push(last.bytes);
      expect(Buffer.concat(captured).toString()).toBe('partial-final\n');
      expect((await output.finish()).stdout.sha256).toBe(hash('partial-final\n'));
    },
  );
  expect((await run.execute()).code).toBe(0);
});

test('original child descriptor redirection refuses during live capture without adopting the foreign file', async () => {
  let collection: Promise<unknown> | undefined;
  const body =
    'import os,time\nfrom pathlib import Path\nf=os.open("foreign",os.O_WRONLY|os.O_CREAT,0o600)\nos.dup2(f,1)\nPath("ready").write_text("yes")\ntime.sleep(0.4)\n';
  const run = await fixture(
    body,
    async (a) => {
      collection = (async () => {
        const deadline = linuxMonotonicMs() + 3000;
        while (!(await Bun.file(join(a.directory, 'ready')).exists())) {
          if (linuxMonotonicMs() >= deadline) throw new Error('Original fixture readiness timeout');
          await Bun.sleep(10);
        }
        return a.output.read('stdout');
      })().catch((error) => error);
    },
    async (output) => {
      const failure = await collection;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain('descriptor identity');
      await expect(output.finish()).rejects.toThrow('refused');
      throw new Error('Original descriptor capture refused');
    },
  );
  await expect(run.execute()).rejects.toThrow('Original descriptor capture refused');
});

test('missing original producer descriptors are accepted only after the same independently verified group closure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-original-output-exit-'));
  const script = join(root, 'gate.py'),
    ready = join(root, 'ready.json'),
    target = join(root, 'fixture.py');
  await writeFile(script, signalFreeBootstrapSource, { mode: 0o400 });
  await writeFile(target, 'print("final")\n', { mode: 0o400 });
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
  let admitted: Awaited<ReturnType<typeof bindOriginalExecutionOutput>> | undefined;
  let release: (() => Promise<void>) | undefined;
  const lock = join(root, '.original-output-test-lock');
  let lag = true,
    closureChecks = 0;
  try {
    const deadline = linuxMonotonicMs() + 3000;
    while (!(await Bun.file(ready).exists())) {
      if (linuxMonotonicMs() >= deadline) throw new Error('Original gate readiness timeout');
      await Bun.sleep(10);
    }
    const original = JSON.parse(await readFile(ready, 'utf8'));
    release = await acquireProcessLock(lock, child.pid, { trackProcessGroup: true });
    admitted = await bindOriginalExecutionOutput({
      identity: { pid: original.pid, group: original.group, start: original.start, boot: original.boot },
      stdout: { path: stdoutPath, writer: stdout },
      stderr: { path: stderrPath, writer: stderr },
      maximum: 65536,
      assertInputs: async () => {},
      originalGroupClosed: async () => {
        if (child.exitCode === null) return false;
        // A stale controller notification is not EOF proof. The second query
        // independently verifies the same original group rather than adopting a PID.
        if (lag) {
          lag = false;
          return false;
        }
        await assertExecutorGroupClosed(lock);
        closureChecks++;
        return true;
      },
    });
    child.stdin.write('go\n');
    await child.stdin.flush();
    await child.stdin.end();
    expect(await child.exited).toBe(0);
    const chunk = await admitted.output.read('stdout');
    expect(chunk?.bytes.toString()).toBe('final\n');
    expect(closureChecks).toBeGreaterThan(0);
    expect((await admitted.output.finish()).originalGroupClosed).toBe(true);
    await release();
    release = undefined;
  } finally {
    await child.stdin.end();
    await child.exited;
    await admitted?.close();
    await stdout.close();
    await stderr.close();
    // A failed capture keeps its original claim and private files.
  }
});

test('failed stream captures retain a bounded private cause before returning their fixed refusal', async () => {
  let path = '';
  const run = await fixture(
    'print("original")\n',
    async (a) => {
      path = a.stdoutPath;
    },
    async (output) => {
      await output.read('stdout');
      await writeFile(path, 'modified\n', { mode: 0o600 });
      await expect(output.read('stdout')).rejects.toThrow('prefix');
      const failure = JSON.parse(await readFile(join(dirname(path), 'output-capture-failure.private.json'), 'utf8'));
      expect(failure.schemaVersion).toBe(1);
      expect(failure.kind).toBe('original-output-capture-failure');
      expect(failure.phase).toBe('retained-prefix');
      expect(failure.message).toBe('Original output retained prefix changed');
      expect(failure.offsets.stdout).toBe(9);
      expect(JSON.stringify(failure)).not.toContain('modified');
      expect(failure.messageTruncated).toBe(false);
      await expect(output.finish()).rejects.toThrow('refused');
      throw new Error('Original private capture refusal retained');
    },
  );
  await expect(run.execute()).rejects.toThrow('Original private capture refusal retained');
});

test('documented main-thread exit waits for independent original group closure before retained final capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-output-thread-exit-'));
  const source = join(root, 'fixture.c'),
    executable = join(root, 'fixture');
  await writeFile(
    source,
    '#include <pthread.h>\n#include <stdio.h>\n#include <unistd.h>\nstatic void *worker(void *v) { (void)v; usleep(400000); return NULL; }\nint main(void) { pthread_t thread; if (pthread_create(&thread, NULL, worker, NULL)) return 2; puts("original"); fflush(stdout); pthread_exit(NULL); }\n',
    { mode: 0o600 },
  );
  const compiler = Bun.which('cc');
  if (!compiler) throw new Error('Linux C compiler required for process regression');
  const compilation = Bun.spawn([compiler, '-pthread', source, '-o', executable], { stdout: 'pipe', stderr: 'pipe' });
  await Promise.all([new Response(compilation.stdout).text(), new Response(compilation.stderr).text()]);
  expect(await compilation.exited).toBe(0);
  let output: OriginalExecutionOutput | undefined,
    stop = false,
    failure: unknown;
  let pump: Promise<void> | undefined;
  const chunks: Buffer[] = [];
  const read = async () => {
    if (!output) throw new Error('Original output unavailable');
    for (let chunk = await output.read('stdout'); chunk; chunk = await output.read('stdout')) chunks.push(chunk.bytes);
  };
  const start = linuxMonotonicMs();
  const execute = signalFreeTerraformExecutor({
    python: { path: python, sha256: hash(await readFile(python)) },
    executable: { path: executable, sha256: hash(await readFile(executable)) },
    originalStartMs: start,
    originalDeadlineMs: start + 7_200_000,
    assertOriginal: async () => {},
    beforeRelease: async (a) => {
      output = a.output;
      pump = (async () => {
        while (!stop) {
          await read();
          await Bun.sleep(10);
        }
      })().catch((error) => {
        failure = error;
      });
    },
    finalCapture: async (f) => {
      stop = true;
      await pump;
      if (failure) throw failure;
      await read();
      expect(f.originalGroupClosed).toBe(true);
      if (!output) throw new Error('Original output unavailable');
      expect((await output.finish()).originalGroupClosed).toBe(true);
    },
  });
  expect((await execute({ cwd: root, args: ['fixture'], env: {} })).code).toBe(0);
  expect(Buffer.concat(chunks).toString()).toBe('original\n');
});

test('live descriptor loss remains refused even when the original actor later exits naturally', async () => {
  let collection: Promise<unknown> | undefined;
  const run = await fixture(
    'import os,time\nfrom pathlib import Path\nos.close(2)\nPath("ready").write_text("yes")\ntime.sleep(0.4)\n',
    async (a) => {
      collection = (async () => {
        const deadline = linuxMonotonicMs() + 3000;
        while (!(await Bun.file(join(a.directory, 'ready')).exists())) {
          if (linuxMonotonicMs() >= deadline) throw new Error('Original fixture readiness timeout');
          await Bun.sleep(10);
        }
        return a.output.read('stderr');
      })().catch((error) => error);
    },
    async (output) => {
      expect(await collection).toBeInstanceOf(Error);
      await expect(output.finish()).rejects.toThrow('refused');
      throw new Error('Original live descriptor loss retained');
    },
  );
  await expect(run.execute()).rejects.toThrow('Original live descriptor loss retained');
});

test('issued output records bind exact source identity and channel without adopting copies', async () => {
  const run = await fixture(
    'import sys\nprint("original",file=sys.stderr)\n',
    async () => {},
    async (output) => {
      const chunk = await output.read('stderr');
      if (!chunk) throw new Error('Original source fixture record required');
      const source = readOriginalExecutionChunk(output, chunk, 'stderr');
      expect(source.bytes.toString()).toBe('original\n');
      expect(source.identity.group).toBe(source.identity.pid);
      expect(source.sha256).toBe(hash('original\n'));
      await expect(
        Promise.resolve().then(() => readOriginalExecutionChunk(output, { ...chunk }, 'stderr')),
      ).rejects.toThrow('original');
      expect(() => readOriginalExecutionChunk(output, chunk, 'stdout')).toThrow('original');
      chunk.bytes.fill(0);
      source.bytes.fill(0);
      expect(readOriginalExecutionChunk(output, chunk, 'stderr').bytes.toString()).toBe('original\n');
      const completion = await output.finish();
      expect(readOriginalExecutionCompletion(output, completion).identity).toEqual(source.identity);
      expect(() => readOriginalExecutionCompletion(output, { ...completion })).toThrow('original');
    },
  );
  expect((await run.execute()).code).toBe(0);
});

test('original lifecycle RPC source requires issued stderr chunks and its matching executor completion', async () => {
  const path = '/example/terraform-provider-google_v8.10.0_x5';
  const binding = {
    terraformVersion: '1.17.1',
    providerLockSha256: 'fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
  };
  const scope = { providerPath: path, planSha256: 'a'.repeat(64) };
  const row = (message: string, fields = {}) =>
    `${JSON.stringify({ '@level': 'debug', '@module': 'provider', '@timestamp': '2026-11-10T00:00:00Z', '@message': message, ...fields })}\n`;
  const rpc = (message: string) =>
    row(message, {
      '@module': 'sdk.proto',
      '@level': 'trace',
      tf_provider_addr: 'registry.terraform.io/hashicorp/google',
      tf_proto_version: '5.11',
      tf_rpc: 'ReadDataSource',
      tf_data_source_type: 'google_compute_zones',
      tf_req_id: '11111111-2222-3333-4444-555555555555',
    });
  const raw =
    row('starting plugin', { path, args: [path] }) +
    row('plugin started', { path, pid: 1234 }) +
    rpc('Received request') +
    rpc('Served request') +
    row('plugin process exited', { plugin: path, id: '1234' });
  const parser = new GoogleProviderLifecycleParser(scope, binding);
  const run = await fixture(
    `import sys\nsys.stderr.write(${JSON.stringify(raw)})\n`,
    async () => {},
    async (output) => {
      const chunk = await output.read('stderr');
      if (!chunk) throw new Error('Original lifecycle fixture required');
      const [candidate] = parser.pushOriginal(output, chunk);
      expect(() => readOriginalGoogleProviderRpcSource(candidate)).toThrow('completion');
      const completion = await output.finish();
      expect(parser.finishOriginal(output, completion).complete).toBe(true);
      const source = readOriginalGoogleProviderRpcSource(candidate);
      await expect(corroborateOriginalGoogleRpcProvider({ rpc: candidate, windows: [], binding })).rejects.toThrow(
        'Original distinct',
      );
      await expect(
        corroborateOriginalGoogleRpcProvider({
          rpc: candidate,
          windows: [{ schemaVersion: 3, evidencePath: '/example/forged', evidenceSha256: 'a'.repeat(64) } as never],
          binding,
        }),
      ).rejects.toThrow('original');

      expect(source.executor.group).toBe(source.executor.pid);
      expect(source.stderrSha256).toBe(completion.stderr.sha256);
      expect(source.stderrBytes).toBe(Buffer.byteLength(raw));
      expect(source.schemaVersion).toBe(2);
      expect(source.providerStartingEpochMs).toBeLessThanOrEqual(source.providerStartedEpochMs);
      expect(source.providerStartedEpochMs).toBeLessThanOrEqual(source.receivedEpochMs);
      expect(source.receivedEpochMs).toBeLessThanOrEqual(source.servedEpochMs);
      expect(source.servedEpochMs).toBeLessThanOrEqual(source.providerExitedEpochMs);
      expect(() => readOriginalGoogleProviderRpcSource({ ...candidate })).toThrow('original');
      const copied = new GoogleProviderLifecycleParser(scope, binding);
      expect(() => copied.pushOriginal(output, { ...chunk })).toThrow('original');
      const unowned = new GoogleProviderLifecycleParser(scope, binding);
      unowned.push(Buffer.from(raw));
      expect(() => unowned.finishOriginal(output, completion)).toThrow('Original descriptor');
    },
  );
  expect((await run.execute()).code).toBe(0);
});

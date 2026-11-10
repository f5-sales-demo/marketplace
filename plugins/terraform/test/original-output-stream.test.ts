import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, link, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { OriginalExecutionOutput } from '../src/original-output-stream';
import { type ExecutionCaptureAdmission, signalFreeTerraformExecutor } from '../src/signal-free-executor';

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

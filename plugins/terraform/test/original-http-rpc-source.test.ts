import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as http from '../src/gcp-http-rpc-trace';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { OriginalExecutionOutput, OriginalOutputChunk } from '../src/original-output-stream';
import { type ExecutionCaptureAdmission, signalFreeTerraformExecutor } from '../src/signal-free-executor';
import { capture, operationFixture, requestFixture, scope, traceFixture } from './fixtures/gcp-insert.fixture';

const binding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
async function withTrace(
  check: (
    output: OriginalExecutionOutput,
    chunks: OriginalOutputChunk[],
    stdout: OriginalOutputChunk[],
    admission: ExecutionCaptureAdmission,
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'original-http-source-'));
  roots.push(root);
  const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
  const executable = { path: python, sha256: hash(await readFile(python)) };
  const script = join(root, 'simulated-http.py');
  const raw = Buffer.from(traceFixture(requestFixture(), operationFixture(), '8.11.0')).toString('hex');
  await writeFile(
    script,
    `import sys\nsys.stderr.buffer.write(bytes.fromhex("${raw}"))\nsys.stdout.write("synthetic stdout\\n")\n`,
    { mode: 0o600 },
  );
  let admission: ExecutionCaptureAdmission | undefined;
  const start = linuxMonotonicMs();
  const execute = signalFreeTerraformExecutor({
    python: executable,
    executable,
    originalStartMs: start,
    originalDeadlineMs: start + 7200000,
    assertOriginal: async () => {},
    beforeRelease: async (value) => {
      admission = value;
    },
    finalCapture: async () => {
      if (!admission) throw new Error('Original output admission required');
      const stderr: OriginalOutputChunk[] = [],
        stdout: OriginalOutputChunk[] = [];
      for (const [channel, collection] of [
        ['stderr', stderr],
        ['stdout', stdout],
      ] as const) {
        for (;;) {
          const chunk = await admission.output.read(channel);
          if (!chunk) break;
          collection.push(chunk);
        }
      }
      await check(admission.output, stderr, stdout, admission);
    },
  });
  expect((await execute({ cwd: root, args: [script], env: {} })).code).toBe(0);
}

test('original HTTP dump bodies join their actual executor stderr and completed channel hashes', async () => {
  expect(typeof http.readOriginalGoogleHttpRpcSource).toBe('function');
  await withTrace(async (output, chunks, _stdout, admission) => {
    const parser = new http.GoogleHttpRpcTraceParser(scope, binding);
    const candidates = chunks.flatMap((chunk) => parser.pushOriginal(output, chunk));
    expect(candidates).toHaveLength(1);
    const body = parser.consumeBodies(candidates[0]);
    await expect(http.readOriginalGoogleHttpRpcSource(body)).rejects.toThrow('completion');
    const completion = await output.finish();
    parser.finishOriginal(output, completion);
    const source = await http.readOriginalGoogleHttpRpcSource(body);
    expect(source.executor).toEqual(admission.identity);
    expect(source.stderrSha256).toBe(completion.stderr.sha256);
    expect(source.stdoutSha256).toBe(completion.stdout.sha256);
    expect(source.planSha256).toBe(scope.planSha256);
    expect(source.applyRpcQualified).toBe(false);
    await expect(http.readOriginalGoogleHttpRpcSource({ ...body })).rejects.toThrow('Original');
  });
});

test('plain HTTP parser bodies cannot gain original descriptor source authority', async () => {
  expect(typeof http.readOriginalGoogleHttpRpcSource).toBe('function');
  const body = capture(requestFixture(), operationFixture(), binding, '8.11.0');
  await expect(http.readOriginalGoogleHttpRpcSource(body)).rejects.toThrow('Original');
});

test('copied HTTP chunks, wrong channels, replay and plaintext mixing retire their original source', async () => {
  expect(typeof http.readOriginalGoogleHttpRpcSource).toBe('function');
  await withTrace(async (output, chunks, stdout) => {
    for (const bad of [{ ...chunks[0] }, stdout[0]]) {
      const parser = new http.GoogleHttpRpcTraceParser(scope, binding);
      expect(() => parser.pushOriginal(output, bad)).toThrow('original');
      expect(() => parser.pushOriginal(output, chunks[0])).toThrow('failed');
    }
    for (const mode of ['replay', 'plain', 'finish', 'completion']) {
      const parser = new http.GoogleHttpRpcTraceParser(scope, binding);
      for (const chunk of chunks) parser.pushOriginal(output, chunk);
      if (mode === 'replay') expect(() => parser.pushOriginal(output, chunks[0])).toThrow('gap');
      if (mode === 'plain') expect(() => parser.push(Buffer.from('unowned\n'))).toThrow('unowned');
      if (mode === 'finish') expect(() => parser.finish()).toThrow('completion');
      if (mode === 'completion') {
        const completion = await output.finish();
        expect(() => parser.finishOriginal(output, { ...completion })).toThrow('original');
      }
      expect(() => parser.pushOriginal(output, chunks[0])).toThrow('failed');
    }
  });
});

test('HTTP trace envelopes reject impossible calendar timestamps', () => {
  const parser = new http.GoogleHttpRpcTraceParser(scope, binding);
  expect(() =>
    parser.push(
      Buffer.from(traceFixture(requestFixture(), operationFixture(), '8.11.0').replaceAll('2026-11-10', '2026-02-30')),
    ),
  ).toThrow();
});

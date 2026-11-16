/** Real original output issuer; simulated Google trace, no cloud resources. */
import { afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleHttpRpcTraceParser, type OriginalGoogleHttpResponseObservation } from '../../src/gcp-http-rpc-trace';
import { linuxMonotonicMs } from '../../src/linux-clock';
import type { OriginalExecutionOutput, OriginalOutputChunk } from '../../src/original-output-stream';
import { type ExecutionCaptureAdmission, signalFreeTerraformExecutor } from '../../src/signal-free-executor';
import { operationFixture, requestFixture, scope, traceFixture } from './gcp-insert.fixture';

export const binding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');

export async function withEarlyResponse(
  live: (run: {
    parser: GoogleHttpRpcTraceParser;
    output: OriginalExecutionOutput;
    response: OriginalGoogleHttpResponseObservation;
    admission: ExecutionCaptureAdmission;
    chunk: OriginalOutputChunk;
  }) => Promise<void>,
  final?: (run: {
    parser: GoogleHttpRpcTraceParser;
    output: OriginalExecutionOutput;
    response: OriginalGoogleHttpResponseObservation;
    admission: ExecutionCaptureAdmission;
    chunk: OriginalOutputChunk;
  }) => Promise<void>,
  tailMode: 'valid' | 'truncated' | 'malformed' = 'valid',
) {
  const root = await mkdtemp(join(tmpdir(), 'original-early-response-'));
  roots.push(root);
  const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
  const executable = { path: python, sha256: hash(await readFile(python)) };
  const lines = traceFixture(requestFixture(), operationFixture(), '8.11.0').trimEnd().split('\n');
  const last = lines.pop();
  if (!last) throw new Error('Original served request fixture required');
  const prefix = `${lines.join('\n')}\n`;
  const tail = tailMode === 'valid' ? `${last}\n` : tailMode === 'truncated' ? '' : '{malformed\n';
  const release = join(root, 'release');
  const script = join(root, 'split-trace.py');
  await writeFile(
    script,
    `${[
      'import sys,time,os',
      'sys.stdout.buffer.write(bytes.fromhex("73796e746865746963207374646f75740a"));sys.stdout.flush()',
      `sys.stderr.buffer.write(bytes.fromhex("${Buffer.from(prefix).toString('hex')}"));sys.stderr.flush()`,
      'deadline=time.monotonic()+30',
      `while not os.path.exists("${release}"):`,
      ' if time.monotonic()>=deadline: sys.exit(74)',
      ' time.sleep(0.01)',
      `sys.stderr.buffer.write(bytes.fromhex("${Buffer.from(tail).toString('hex')}"));sys.stderr.flush()`,
    ].join('\n')}\n`,
    { mode: 0o600 },
  );
  let admission: ExecutionCaptureAdmission | undefined;
  let response: OriginalGoogleHttpResponseObservation | undefined;
  let lastChunk: OriginalOutputChunk | undefined;
  let pending: Promise<void> | undefined;
  let liveError: unknown;
  const parser = new GoogleHttpRpcTraceParser({ ...scope, instanceName: 'example-node' }, binding);
  const start = linuxMonotonicMs();
  const execute = signalFreeTerraformExecutor({
    python: executable,
    executable,
    originalStartMs: start,
    originalDeadlineMs: start + 7200000,
    assertOriginal: async () => {},
    beforeRelease: async (actor) => {
      admission = actor;
      pending = (async () => {
        try {
          const deadline = linuxMonotonicMs() + 15000;
          while (!response) {
            if (linuxMonotonicMs() >= deadline) throw new Error('Early response fixture startup expired');
            const chunk = await actor.output.read('stderr');
            if (chunk) {
              lastChunk = chunk;
              parser.pushOriginal(actor.output, chunk);
              response = parser.takeOriginalResponses()[0];
            } else await Bun.sleep(10);
          }
          if (!lastChunk) throw new Error('Original response chunk required');
          await live({ parser, output: actor.output, response, admission: actor, chunk: lastChunk });
        } catch (error) {
          liveError = error;
        } finally {
          await writeFile(release, 'release', { flag: 'wx', mode: 0o600 });
        }
      })();
      pending.catch(() => {});
    },
    finalCapture: async () => {
      await pending;
      if (liveError) throw liveError;
      if (!admission || !response) throw new Error('Original response fixture incomplete');
      for (const channel of ['stdout', 'stderr'] as const)
        for (;;) {
          const chunk = await admission.output.read(channel);
          if (!chunk) break;
          if (channel === 'stderr') parser.pushOriginal(admission.output, chunk);
        }
      const completion = await admission.output.finish();
      if (tailMode === 'truncated') {
        try {
          parser.finishOriginal(admission.output, completion);
        } catch {}
      } else parser.finishOriginal(admission.output, completion);
      if (!lastChunk) throw new Error('Original response chunk required');
      await final?.({ parser, output: admission.output, response, admission, chunk: lastChunk });
    },
  });
  try {
    const result = await execute({ cwd: root, args: [script], env: {} });
    if (result.code !== 0) throw new Error('Original fixture process failed');
  } catch (error) {
    roots.splice(roots.indexOf(root), 1);
    await writeFile(
      join(root, 'fixture-failure.private.json'),
      JSON.stringify({
        retainedRoot: root,
        message: error instanceof Error ? error.message : 'unknown',
        cloudResources: 0,
        originalInsertQualified: false,
      }),
      { flag: 'wx', mode: 0o400 },
    );
    throw error;
  }
}

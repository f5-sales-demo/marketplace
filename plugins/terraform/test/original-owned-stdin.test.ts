/** Real Linux executor/descriptor tests only; no SSH or cloud acceptance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { OriginalInputBinding } from '../src/original-input-monitor';
import {
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeTerraformExecutor,
} from '../src/signal-free-executor';

const python = process.env.CE_TEST_PYTHON ?? '';
if (!python) throw new Error('Original test Python required');
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
async function fixture(hook?: SignalFreeExecutionPolicy['beforeRelease']) {
  const root = await mkdtemp(join(tmpdir(), 'ce-owned-stdin-'));
  const path = join(root, 'artifact.zip');
  const bytes = Buffer.alloc(1_021_474, 23);
  await writeFile(path, bytes, { mode: 0o400 });
  const input = (await readOwnedInstalledInput(path)).binding;
  const captures: FinalExecutionCapture[] = [];
  const script = join(root, 'read.py');
  await writeFile(
    script,
    "import sys,hashlib,json,fcntl\nb=sys.stdin.buffer.read()\nprint(json.dumps({'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'seals':fcntl.fcntl(0,1034)}))\n",
    { mode: 0o400 },
  );
  const start = linuxMonotonicMs(),
    pythonSha = hash(await readFile(python));
  const policy: SignalFreeExecutionPolicy & { stdin: OriginalInputBinding } = {
    python: { path: python, sha256: pythonSha },
    executable: { path: python, sha256: pythonSha },
    originalStartMs: start,
    originalDeadlineMs: start + 7_200_000,
    stdin: input,
    timeoutMs: 60000,
    assertOriginal: async () => {},
    beforeRelease: hook,
    finalCapture: async (capture) => {
      captures.push(capture);
    },
  };
  return { root, path, bytes, input, script, captures, policy };
}
test('a megabyte owned stdin snapshot reaches the original child as sealed bytes after the unchanged gate handshake', async () => {
  const f = await fixture((admission) => {
    const stdin = (admission as typeof admission & { stdin?: { sha256: string; bytes: number; sealed: true } }).stdin;
    expect(stdin?.sha256).toBe(hash(f.bytes));
    expect(stdin?.bytes).toBe(f.bytes.length);
    expect(stdin?.sealed).toBe(true);
    return Promise.resolve();
  });
  const run = signalFreeTerraformExecutor(f.policy);
  const result = await run({ cwd: f.root, args: ['-I', '-B', f.script], env: {} });
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ bytes: f.bytes.length, sha256: hash(f.bytes), seals: 15 });
  expect(f.captures[0].submitted).toBe(true);
  expect(f.captures[0].originalGroupClosed).toBe(true);
  expect(f.captures[0].signalsSent).toBe(false);
  expect((f.captures[0] as FinalExecutionCapture & { stdin?: { sha256: string } }).stdin?.sha256).toBe(hash(f.bytes));
  // Executor diagnostics stay retained in the private fixture root.
}, 60000);
test('same-byte stdin replacement after admission refuses submission and preserves final failure evidence', async () => {
  const f = await fixture(async () => {
    await rename(f.path, `${f.path}.original`);
    await writeFile(f.path, f.bytes, { mode: 0o400 });
  });
  const run = signalFreeTerraformExecutor(f.policy);
  await expect(run({ cwd: f.root, args: ['-I', '-B', f.script], env: {} })).rejects.toThrow();
  expect(f.captures).toHaveLength(1);
  expect(f.captures[0].submitted).toBe(false);
  expect(f.captures[0].reason).toBe('input-changed');
  expect(f.captures[0].signalsSent).toBe(false);
  expect(await readFile(f.path)).toEqual(f.bytes);
}, 60000);
test('a caller cannot supply stdin without complete original file and parent identities', async () => {
  const f = await fixture();
  const partial = { path: f.path, sha256: f.input.sha256 } as OriginalInputBinding;
  expect(() => signalFreeTerraformExecutor({ ...f.policy, stdin: partial })).toThrow('identities');
  await rm(f.root, { recursive: true, force: true });
}, 60000);
test('generated gate-script replacement refuses release even without a command stdin input', async () => {
  const f = await fixture(async (admission) => {
    const gate = join(dirname(admission.stdoutPath), 'gate.py');
    const bytes = await readFile(gate);
    await rename(gate, `${gate}.original`);
    await writeFile(gate, bytes, { mode: 0o400 });
  });
  const { stdin: _stdin, ...policy } = f.policy;
  const run = signalFreeTerraformExecutor(policy);
  await expect(run({ cwd: f.root, args: ['-I', '-B', f.script], env: {} })).rejects.toThrow();
  expect(f.captures).toHaveLength(1);
  expect(f.captures[0].submitted).toBe(false);
  expect(f.captures[0].reason).toBe('input-changed');
  expect(f.captures[0].signalsSent).toBe(false);
}, 60000);

test('factory snapshots caller stdin identities and never retargets a later mutation', async () => {
  const f = await fixture();
  const mutable = structuredClone(f.input);
  const run = signalFreeTerraformExecutor({ ...f.policy, stdin: mutable });
  (mutable as { path: string }).path = join(f.root, 'foreign');
  const result = await run({ cwd: f.root, args: ['-I', '-B', f.script], env: {} });
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).sha256).toBe(hash(f.bytes));
}, 60000);
test('same-byte stdin control metadata replacement refuses release and remains retained', async () => {
  const f = await fixture(async (admission) => {
    const metadata = join(dirname(admission.stdoutPath), 'bootstrap.json.stdin-binding.json');
    const bytes = await readFile(metadata);
    await rename(metadata, `${metadata}.original`);
    await writeFile(metadata, bytes, { mode: 0o400 });
  });
  await expect(
    signalFreeTerraformExecutor(f.policy)({ cwd: f.root, args: ['-I', '-B', f.script], env: {} }),
  ).rejects.toThrow();
  expect(f.captures[0].submitted).toBe(false);
  expect(f.captures[0].reason).toBe('input-changed');
  expect(f.captures[0].signalsSent).toBe(false);
}, 60000);

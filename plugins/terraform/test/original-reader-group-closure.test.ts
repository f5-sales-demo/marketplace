/** Real native source executions; physical group closure does not claim GCP guest acceptance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { assertRecordedProcessGroupAbsent } from '../../platform/src/ce/process-lock';
import { linuxMonotonicMs } from '../src/linux-clock';
import {
  assertOriginalReaderGroupClosure,
  assertOriginalReaderGroupInputs,
  collectOriginalReaderGroupClosure,
  persistOriginalReaderGroupSet,
} from '../src/original-reader-group-closure';
import {
  type FinalExecutionCapture,
  signalFreeBootstrapSource,
  signalFreeTerraformExecutor,
} from '../src/signal-free-executor';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
async function fixture(failCapture = false, liveCheck = false) {
  const base = process.env.CE_TEST_CAPTURE_ARTIFACTS ?? tmpdir();
  await mkdir(base, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(base, 'reader-group-closure-'));
  const script = join(root, 'fixture.py');
  await writeFile(script, 'print("synthetic-source-output")\n', { mode: 0o600 });
  const sha256 = hash(await readFile(python));
  const start = linuxMonotonicMs(),
    deadline = start + 7200000;
  const captures: FinalExecutionCapture[] = [];
  const execute = signalFreeTerraformExecutor({
    python: { path: python, sha256 },
    executable: { path: python, sha256 },
    originalStartMs: start,
    originalDeadlineMs: deadline,
    assertOriginal: async () => {},
    beforeRelease: async (admission) => {
      if (liveCheck) await expect(assertRecordedProcessGroupAbsent(admission.identity)).rejects.toThrow('live');
    },
    finalCapture: async (capture) => {
      captures.push(capture);
      if (failCapture) throw new Error('Intentional incomplete capture');
    },
  });
  return {
    root,
    execute,
    captures,
    script,
    input: () => {
      const capture = captures[0];
      if (!capture) throw new Error('Original native capture required');
      return {
        directory: root,
        capture,
        originalBudget: { start, deadline },
        pythonSha256: sha256,
        executableSha256: sha256,
        gateSha256: hash(Buffer.from(signalFreeBootstrapSource)),
      };
    },
  };
}

test('original native closure joins immutable bootstrap/completion, retains inputs and independently checks group absence', async () => {
  const f = await fixture(false, true);
  expect((await f.execute({ cwd: f.root, args: [f.script], env: {} })).code).toBe(0);
  const witness = await collectOriginalReaderGroupClosure(f.input());
  const identity = f.captures[0].identity;
  if (!identity) throw new Error('Original captured identity required');
  expect(witness.identity).toEqual(identity);
  expect(witness.physicalGroupAbsent).toBe(true);
  expect(witness.executionAccepted).toBe(false);
  expect(witness.captureComplete).toBe(true);
  await assertOriginalReaderGroupClosure(witness);
});

test('an incomplete native capture can prove physical closure without clearing the original failed flag', async () => {
  const f = await fixture(true);
  await expect(f.execute({ cwd: f.root, args: [f.script], env: {} })).rejects.toThrow('incomplete');
  const path = join(f.root, '.terraform-executor-lock', 'capture-unresolved.json'),
    original = await readFile(path);
  const witness = await collectOriginalReaderGroupClosure(f.input());
  expect(witness.physicalGroupAbsent).toBe(true);
  expect(witness.captureComplete).toBe(false);
  expect(witness.executionAccepted).toBe(false);
  await assertOriginalReaderGroupClosure(witness);
  expect(await readFile(path)).toEqual(original);
});

test('original closure refuses another actor, executable or operation budget', async () => {
  const f = await fixture();
  await f.execute({ cwd: f.root, args: [f.script], env: {} });
  const input = f.input(),
    identity = input.capture.identity;
  if (!identity) throw new Error('Original actor required');
  await expect(
    collectOriginalReaderGroupClosure({
      ...input,
      capture: { ...input.capture, identity: { ...identity, start: '1' } },
    }),
  ).rejects.toThrow();
  await expect(collectOriginalReaderGroupClosure({ ...input, executableSha256: 'f'.repeat(64) })).rejects.toThrow();
  await expect(
    collectOriginalReaderGroupClosure({
      ...input,
      originalBudget: { ...input.originalBudget, deadline: input.originalBudget.deadline + 1 },
    }),
  ).rejects.toThrow();
});

test('same-byte completion replacement cannot retain original reader closure authority', async () => {
  const f = await fixture();
  await f.execute({ cwd: f.root, args: [f.script], env: {} });
  const witness = await collectOriginalReaderGroupClosure(f.input());
  const path = join(dirname(f.captures[0].stdoutPath), 'completion.private.json'),
    bytes = await readFile(path);
  await rename(path, `${path}.original`);
  await writeFile(path, bytes, { mode: 0o400, flag: 'wx' });
  await expect(assertOriginalReaderGroupClosure(witness)).rejects.toThrow();
});

test('actual native reader witnesses persist as original durable cleanup inputs with exact source coverage', async () => {
  const f = await fixture();
  await f.execute({ cwd: f.root, args: [f.script], env: {} });
  const witness = await collectOriginalReaderGroupClosure(f.input());
  const owner = {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'original',
  };
  const store = await CeDeploymentStore.open(join(f.root, 'reader-proof'), owner);
  const source = { name: 'provider', attemptCount: 1, witnesses: [witness] };
  await expect(
    persistOriginalReaderGroupSet({ store, owner, requiredSources: ['provider', 'guest'], sources: [source] }),
  ).rejects.toThrow('coverage');
  const inputs = await persistOriginalReaderGroupSet({
    store,
    owner,
    requiredSources: ['provider'],
    sources: [source],
  });
  await assertOriginalReaderGroupInputs({ inputs, owner, requiredSources: ['provider'] });
  await expect(
    assertOriginalReaderGroupInputs({ inputs, owner, requiredSources: ['provider', 'guest'] }),
  ).rejects.toThrow('coverage');
  await expect(
    assertOriginalReaderGroupInputs({
      inputs,
      owner: { ...owner, deploymentId: 'foreign' },
      requiredSources: ['provider'],
    }),
  ).rejects.toThrow();
  expect(Object.keys(inputs)).toHaveLength(1);
});

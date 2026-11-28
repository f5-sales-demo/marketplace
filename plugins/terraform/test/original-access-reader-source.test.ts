/** Actual gated local processes and original apply callbacks; no cloud or SSH acceptance. */
import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import {
  assertOriginalReaderGroupClosure,
  assertOriginalReaderGroupInputs,
  persistOriginalReaderGroupSet,
} from '../src/original-reader-group-closure';
import { signalFreeFinalReaderExecutor, signalFreeTerraformExecutor } from '../src/signal-free-executor';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('access reader collector requires its original source and records zero attempts before native execution', async () => {
  const source = await import('../src/original-access-reader-source');
  for (const value of [null, {}, { attemptCount: 0, witnesses: [] }])
    await expect(source.collectInstalledOriginalAccessReaderSource(value)).rejects.toThrow('source-issued');
  await withApplyInventory(async ({ before }) => {
    const input = {
      callback: before,
      family: 'observer' as const,
      role: 'trust' as const,
      instanceId: '123456789',
      directory: join(before.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`),
      python: before.original.inputs.python,
      executable: before.original.inputs.python,
      args: ['-I', '-B', '/example/source-only.py'],
    };
    await expect(source.openOriginalAccessReaderCapture({ ...input, callback: { ...before } })).rejects.toThrow(
      'Original',
    );
    await mkdir(input.directory, { mode: 0o700 });
    const recorder = await source.openOriginalAccessReaderCapture(input);
    const port = Object.freeze({});
    source.bindOriginalAccessReaderCapture(port, recorder);
    expect(await source.collectInstalledOriginalAccessReaderSource(port)).toEqual({
      name: 'observer-trust',
      attemptCount: 0,
      witnesses: [],
    });
    await expect(source.collectInstalledOriginalAccessReaderSource({ ...port })).rejects.toThrow('source-issued');
  });
}, 60_000);

test('an access composition requires exact original child roles even when no native child started', async () => {
  const source = await import('../src/original-access-reader-source');
  await withApplyInventory(async ({ before }) => {
    const directory = join(before.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`);
    await mkdir(directory, { mode: 0o700 });
    const recorder = await source.openOriginalAccessReaderCapture({
      callback: before,
      family: 'observer',
      role: 'trust',
      instanceId: '123456789',
      directory,
      python: before.original.inputs.python,
      executable: before.original.inputs.python,
    });
    const child = Object.freeze({});
    source.bindOriginalAccessReaderCapture(child, recorder);
    const sources: Record<string, unknown> = { trust: child };
    const composition = Object.freeze({});
    await source.bindOriginalAccessReaderCollection(composition, {
      callback: before,
      family: 'observer',
      instanceId: '123456789',
      sources: () => sources,
    });
    const rows = await source.collectInstalledOriginalAccessReaderSources(composition);
    expect(rows.map((row) => row.name).sort()).toEqual([
      'observer-abi',
      'observer-delivery',
      'observer-peer',
      'observer-renewal',
      'observer-trust',
      'observer-wire',
    ]);
    expect(rows.every((row) => row.attemptCount === 0 && row.witnesses.length === 0)).toBe(true);
    await expect(source.collectInstalledOriginalAccessReaderSources({ ...composition })).rejects.toThrow(
      'source-issued',
    );
    sources.trust = { ...child };
    await expect(source.collectInstalledOriginalAccessReaderSources(composition)).rejects.toThrow();
    sources.trust = child;
    sources.wire = child;
    await expect(source.collectInstalledOriginalAccessReaderSources(composition)).rejects.toThrow();
    delete sources.wire;
    await expect(
      source.bindOriginalAccessReaderCollection(composition, {
        callback: before,
        family: 'observer',
        instanceId: '123456789',
        sources: () => sources,
      }),
    ).rejects.toThrow('claimed');
    await expect(
      source.bindOriginalAccessReaderCollection(Object.freeze({}), {
        callback: { ...before },
        family: 'observer',
        instanceId: '123456789',
        sources: () => sources,
      }),
    ).rejects.toThrow('Original');
    // The different instance collection itself must reject this original child's ownership.
    const foreign = Object.freeze({});
    await source.bindOriginalAccessReaderCollection(foreign, {
      callback: before,
      family: 'observer',
      instanceId: '987654321',
      sources: () => sources,
    });
    await expect(source.collectInstalledOriginalAccessReaderSources(foreign)).rejects.toThrow();
  });
}, 60_000);

test('an original access child after real operation expiry retains the owning budget and final reserve', async () => {
  const source = await import('../src/original-access-reader-source');
  await withApplyInventory(
    async ({ before }) => {
      while (linuxMonotonicMs() < before.original.budget.deadline) await Bun.sleep(10);
    },
    true,
    async ({ final }) => {
      const completion = await final.execution.output.finish();
      await acknowledgeOriginalApplyGroupClosure(final, completion);
      if (!final.reserve) throw new Error('Original final reserve required');
      expect(linuxMonotonicMs()).toBeGreaterThanOrEqual(final.original.budget.deadline);
      const directory = join(final.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`);
      await mkdir(directory, { mode: 0o700 });
      const script = join(directory, 'source-only.py');
      await writeFile(script, "print('SOURCE_ONLY_FINAL_CAPTURE')\n", { mode: 0o400 });
      const args = ['-I', '-B', script];
      const recorder = await source.openOriginalAccessReaderCapture({
        callback: final,
        family: 'observer',
        role: 'trust',
        instanceId: '123456789',
        directory,
        python: final.original.inputs.python,
        executable: final.original.inputs.python,
        args,
      });
      const port = Object.freeze({});
      source.bindOriginalAccessReaderCapture(port, recorder);
      const execute = signalFreeFinalReaderExecutor(
        {
          python: final.original.inputs.python,
          executable: final.original.inputs.python,
          originalStartMs: final.original.budget.start,
          originalDeadlineMs: final.original.budget.deadline,
          assertOriginal: async () => {},
          beforeRelease: (admission) => recorder.admit(admission),
          finalCapture: (capture) => recorder.capture(capture),
        },
        final.reserve,
      );
      try {
        await recorder.begin();
        try {
          expect((await execute({ cwd: directory, args, env: {} })).code).toBe(0);
        } finally {
          recorder.finished();
        }
        const row = await source.collectInstalledOriginalAccessReaderSource(port);
        expect(row.attemptCount).toBe(1);
        const witness = row.witnesses[0];
        expect(witness.originalBudget).toEqual(final.original.budget);
        expect(witness.origin?.kind).toBe('original-installed-gcp-access-reader-origin');
        if (witness.origin?.kind !== 'original-installed-gcp-access-reader-origin')
          throw new Error('Original final access origin required');
        expect(witness.origin.phase).toBe('after');
        expect(witness.physicalGroupAbsent).toBe(true);
        expect(witness.executionAccepted).toBe(false);
        await assertOriginalReaderGroupClosure(witness);
      } finally {
        const retained = await retainOwnedTestCapture(directory, 'access-after-expiry', 'success');
        console.info(JSON.stringify({ kind: 'private-native-capture-retained', ...retained }));
      }
    },
    undefined,
    'deadline',
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    false,
    10000,
  );
}, 120_000);

for (const outcome of ['success', 'nonzero', 'before-admission', 'final-failure', 'stdin'] as const)
  test(`original access source retains exact native closure: ${outcome}`, async () => {
    const source = await import('../src/original-access-reader-source');
    await withApplyInventory(async ({ before, store }) => {
      const script = join(before.original.executionDirectory, `source-only-${randomUUID()}.py`);
      await writeFile(
        script,
        `import sys\n${outcome === 'stdin' ? "assert sys.stdin.buffer.read() == b'SOURCE_ONLY_STDIN'\n" : ''}print('SOURCE_ONLY_NATIVE_CAPTURE')\nsys.exit(${outcome === 'nonzero' ? 7 : 0})\n`,
        { mode: 0o400 },
      );
      const args = ['-I', '-B', script];
      const directory = join(before.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`);
      await mkdir(directory, { mode: 0o700 });
      const stdinPath = join(directory, 'payload.private.bin');
      if (outcome === 'stdin') await writeFile(stdinPath, 'SOURCE_ONLY_STDIN', { mode: 0o400 });
      const stdin = outcome === 'stdin' ? (await readOwnedInstalledInput(stdinPath)).binding : undefined;
      const recorder = await source.openOriginalAccessReaderCapture({
        callback: before,
        family: 'observer',
        role: 'trust',
        instanceId: '123456789',
        directory,
        python: before.original.inputs.python,
        executable: before.original.inputs.python,
        args: outcome === 'success' ? undefined : args,
        ...(stdin ? { stdin } : {}),
      });
      const port = Object.freeze({});
      source.bindOriginalAccessReaderCapture(port, recorder);
      const execute = signalFreeTerraformExecutor({
        python: before.original.inputs.python,
        executable: before.original.inputs.python,
        ...(stdin ? { stdin } : {}),
        originalStartMs: before.original.budget.start,
        originalDeadlineMs: before.original.budget.deadline,
        assertOriginal: async () => {},
        beforeRelease: async (admission) => {
          await expect(source.collectInstalledOriginalAccessReaderSource(port)).rejects.toThrow('terminal');
          if (outcome === 'before-admission') throw new Error('Intentional pre-admission refusal');
          await recorder.admit(admission);
        },
        finalCapture: async (capture) => {
          await recorder.capture(capture);
          if (outcome === 'final-failure') throw new Error('Intentional final capture failure');
        },
      });
      try {
        await recorder.begin(args);
        try {
          if (outcome === 'final-failure') await expect(execute({ cwd: directory, args, env: {} })).rejects.toThrow();
          else {
            const result = await execute({ cwd: directory, args, env: {} });
            expect(result.code).toBe(outcome === 'before-admission' ? 1 : outcome === 'nonzero' ? 7 : 0);
            if (outcome === 'before-admission') expect(result.stdout).toBe('');
          }
        } finally {
          recorder.finished();
        }
        const row = await source.collectInstalledOriginalAccessReaderSource(port);
        expect(row.attemptCount).toBe(1);
        expect(row.witnesses).toHaveLength(1);
        const witness = row.witnesses[0];
        expect(witness.physicalGroupAbsent).toBe(true);
        expect(witness.executionAccepted).toBe(false);
        expect(witness.origin?.kind).toBe('original-installed-gcp-access-reader-origin');
        if (witness.origin?.kind !== 'original-installed-gcp-access-reader-origin')
          throw new Error('Original access origin required');
        expect(witness.origin.owner).toEqual(before.original.owner);
        expect(witness.origin.admissionRecorded).toBe(outcome !== 'before-admission');
        if (outcome === 'before-admission') {
          expect(witness.inputs.submission).toBeUndefined();
          const capture = JSON.parse(await readFile(witness.inputs.capture.path, 'utf8'));
          expect(capture.submitted).toBe(false);
          expect((await readFile(capture.stdoutPath)).length).toBe(0);
        }
        expect(witness.captureComplete).toBe(outcome !== 'final-failure');
        await assertOriginalReaderGroupClosure(witness);
        const failedPath = join(directory, '.terraform-executor-lock/capture-unresolved.json');
        const failed = outcome === 'final-failure' ? await readFile(failedPath) : undefined;
        const inputs = await persistOriginalReaderGroupSet({
          store,
          owner: before.original.owner,
          requiredSources: ['observer-trust'],
          sources: [row],
        });
        await assertOriginalReaderGroupInputs({
          inputs,
          owner: before.original.owner,
          requiredSources: ['observer-trust'],
        });
        await expect(recorder.begin()).rejects.toThrow('single-use');
        await expect(
          assertOriginalReaderGroupClosure({ ...witness, origin: { ...witness.origin, instanceId: '987654321' } }),
        ).rejects.toThrow();
        const path = witness.origin.request.path,
          bytes = await readFile(path);
        await rename(path, `${path}.original`);
        await writeFile(path, bytes, { mode: 0o400, flag: 'wx' });
        await expect(source.collectInstalledOriginalAccessReaderSource(port)).rejects.toThrow();
        if (failed) expect(await readFile(failedPath)).toEqual(failed);
      } finally {
        const retained = await retainOwnedTestCapture(directory, `access-${outcome}`, 'failure');
        console.info(JSON.stringify({ kind: 'private-native-capture-retained', ...retained }));
      }
    });
  }, 60_000);

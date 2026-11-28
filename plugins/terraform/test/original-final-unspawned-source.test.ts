/** Actual original parent expiry and guard refusal only; no guest or cloud acceptance. */
import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { acknowledgeOriginalApplyGroupClosure } from '../src/installed-apply-controller';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import {
  bindOriginalAccessReaderCapture,
  collectInstalledOriginalAccessReaderSource,
  openOriginalAccessReaderCapture,
} from '../src/original-access-reader-source';
import {
  assertOriginalReaderGroupInputs,
  assertOriginalUnspawnedSource,
  persistOriginalReaderGroupSet,
} from '../src/original-reader-group-closure';
import {
  collectOriginalSignalFreeUnspawnedExecutions,
  signalFreeFinalReaderExecutor,
} from '../src/signal-free-executor';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('final native guard refusal after real operation expiry retains the original fixed reserve and parent', async () => {
  let store: CeDeploymentStore | undefined;
  await withApplyInventory(
    async (before) => {
      store = before.store;
      while (linuxMonotonicMs() < before.before.original.budget.deadline) await Bun.sleep(10);
    },
    true,
    async ({ final, capture }) => {
      let outcome: 'success' | 'failure' = 'failure';
      try {
        const completion = await final.execution.output.finish();
        await acknowledgeOriginalApplyGroupClosure(final, completion);
        if (!final.reserve || !store) throw new Error('Original final reserve and store required');
        const reserve = final.reserve;
        expect(linuxMonotonicMs()).toBeGreaterThanOrEqual(final.original.budget.deadline);
        const directory = join(final.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`);
        await mkdir(directory, { mode: 0o700 });
        const args = ['-I', '-B', '/example/unsubmitted-final-only.py'];
        const recorder = await openOriginalAccessReaderCapture({
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
        bindOriginalAccessReaderCapture(port, recorder);
        const policy = {
          python: final.original.inputs.python,
          executable: final.original.inputs.python,
          originalStartMs: final.original.budget.start,
          originalDeadlineMs: final.original.budget.deadline,
          assertOriginal: async () => {
            throw new Error('Intentional final original guard refusal');
          },
          finalCapture: async () => {
            throw new Error('No native child may reach final capture');
          },
        };
        expect(() => signalFreeFinalReaderExecutor(policy, { ...reserve })).toThrow('admitted');
        expect(() =>
          signalFreeFinalReaderExecutor(policy, {
            ...reserve,
            finalDeadlineMs: reserve.finalDeadlineMs + 1,
          }),
        ).toThrow('admitted');
        const execute = signalFreeFinalReaderExecutor(policy, reserve);
        await recorder.begin();
        await expect(execute({ cwd: directory, args, env: {} })).rejects.toThrow(
          'Intentional final original guard refusal',
        );
        recorder.finished(execute);
        const originals = await collectOriginalSignalFreeUnspawnedExecutions(execute);
        expect(originals).toHaveLength(1);
        const row = await collectInstalledOriginalAccessReaderSource(port);
        expect(row.attemptCount).toBe(0);
        expect(row.invocationCount).toBe(1);
        expect(row.witnesses).toHaveLength(0);
        const inputs = await persistOriginalReaderGroupSet({
          store,
          owner: final.original.owner,
          requiredSources: ['observer-trust'],
          sources: [row],
        });
        await assertOriginalReaderGroupInputs({
          inputs,
          owner: final.original.owner,
          requiredSources: ['observer-trust'],
        });
        const original = row.unspawned?.[0];
        if (!original) throw new Error('Original final unspawned evidence required');
        const raw = JSON.parse(await readFile(original.evidence.path, 'utf8'));
        for (const mutate of [
          (value: typeof raw) => {
            value.finalReserve.finalDeadlineMs++;
          },
          (value: typeof raw) => {
            value.finalReserve.identity.pid++;
          },
          (value: typeof raw) => {
            value.invocationStartedMs = value.finalReserve.finalStartedMs - 1;
          },
          (value: typeof raw) => {
            value.layer = 'command';
          },
          (value: typeof raw) => {
            value.schemaVersion = 1;
          },
        ]) {
          const value = structuredClone(raw);
          mutate(value);
          const altered = join(directory, 'executor-unspawned', randomUUID());
          await mkdir(altered, { mode: 0o700 });
          const path = join(altered, 'source.private.json');
          await writeFile(path, JSON.stringify(value), { flag: 'wx', mode: 0o400 });
          await expect(
            assertOriginalUnspawnedSource(
              { request: original.request, evidence: (await readOwnedInstalledInput(path)).binding },
              final.original.owner,
            ),
          ).rejects.toThrow();
        }
        outcome = 'success';
      } finally {
        await writeFile(
          join(final.original.executionDirectory, 'final-unspawned-parent.private.json'),
          JSON.stringify(capture),
          { flag: 'wx', mode: 0o400 },
        );
        await retainOwnedTestCapture(final.original.executionDirectory, 'original-final-unspawned', outcome);
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
}, 120000);

/** Native guard refusals only; no cloud, SSH, guest or installed acceptance. */
import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bindOriginalAccessReaderCapture,
  collectInstalledOriginalAccessReaderSource,
  openOriginalAccessReaderCapture,
} from '../src/original-access-reader-source';
import { assertOriginalReaderGroupInputs, persistOriginalReaderGroupSet } from '../src/original-reader-group-closure';
import { collectOriginalSignalFreeUnspawnedExecutions, signalFreeTerraformExecutor } from '../src/signal-free-executor';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const fault of ['none', 'replaced-evidence', 'foreign-executor', 'custom-executor', 'loader', 'aborted'] as const)
  test(`an original access guard refusal retains genuine unspawned provenance: ${fault}`, async () => {
    await withApplyInventory(
      async ({ before, store }) => {
        const directory = join(before.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`);
        await mkdir(directory, { mode: 0o700 });
        const args = ['-I', '-B', '/example/unsubmitted-source-only.py'];
        const recorder = await openOriginalAccessReaderCapture({
          callback: before,
          family: 'observer',
          role: 'trust',
          instanceId: '123456789',
          directory,
          python: before.original.inputs.python,
          executable: before.original.inputs.python,
          args,
        });
        const port = Object.freeze({});
        bindOriginalAccessReaderCapture(port, recorder);
        let releases = 0,
          captures = 0;
        const execute = signalFreeTerraformExecutor({
          python: before.original.inputs.python,
          executable: before.original.inputs.python,
          originalStartMs: before.original.budget.start,
          originalDeadlineMs: before.original.budget.deadline,
          assertOriginal: async () => {
            throw new Error('Intentional initial original input refusal');
          },
          beforeRelease: async () => {
            releases++;
          },
          finalCapture: async () => {
            captures++;
          },
        });
        await recorder.begin();
        const cancellation = new AbortController();
        if (fault === 'aborted') cancellation.abort(new Error('Intentional original cancellation'));
        const env = fault === 'loader' ? { LD_PRELOAD: '/example/unsubmitted-loader.so' } : {};
        await expect(execute({ cwd: directory, args, env, signal: cancellation.signal })).rejects.toThrow(
          fault === 'loader'
            ? 'loader substitution'
            : fault === 'aborted'
              ? 'original cancellation'
              : 'Intentional initial original input refusal',
        );
        const evidence = await collectOriginalSignalFreeUnspawnedExecutions(execute);
        expect(evidence).toHaveLength(1);
        expect(releases).toBe(0);
        expect(captures).toBe(0);
        let bound = execute;
        if (fault === 'foreign-executor') {
          const foreign = join(before.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`);
          await mkdir(foreign, { mode: 0o700 });
          bound = signalFreeTerraformExecutor({
            python: before.original.inputs.python,
            executable: before.original.inputs.python,
            originalStartMs: before.original.budget.start,
            originalDeadlineMs: before.original.budget.deadline,
            assertOriginal: async () => {
              throw new Error('Intentional foreign source refusal');
            },
            finalCapture: async () => {},
          });
          await expect(bound({ cwd: foreign, args, env: {} })).rejects.toThrow('Intentional foreign source refusal');
        } else if (fault === 'custom-executor') bound = async () => ({ code: 0, stdout: '', stderr: '' });
        recorder.finished(bound);
        if (fault === 'foreign-executor' || fault === 'custom-executor') {
          await expect(collectInstalledOriginalAccessReaderSource(port)).rejects.toThrow();
          return;
        }
        const row = await collectInstalledOriginalAccessReaderSource(port);
        expect(row.attemptCount).toBe(0);
        expect(row.invocationCount).toBe(1);
        expect(row.witnesses).toHaveLength(0);
        expect(row.unspawned).toHaveLength(1);
        expect(row.unspawned?.[0].evidence).toEqual(evidence[0]);
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
        if (fault === 'replaced-evidence') {
          const path = evidence[0].path,
            bytes = await readFile(path);
          await rename(path, `${path}.original`);
          await writeFile(path, bytes, { mode: 0o400, flag: 'wx' });
          await expect(collectInstalledOriginalAccessReaderSource(port)).rejects.toThrow();
          await expect(
            assertOriginalReaderGroupInputs({
              inputs,
              owner: before.original.owner,
              requiredSources: ['observer-trust'],
            }),
          ).rejects.toThrow();
        }
      },
      true,
      async ({ final, capture }) => {
        const directory = final.original.executionDirectory;
        await writeFile(join(directory, 'unspawned-test-parent-final.private.json'), JSON.stringify(capture), {
          flag: 'wx',
          mode: 0o400,
        });
        await retainOwnedTestCapture(directory, `access-unspawned-${fault}`, 'success');
      },
    );
  }, 60000);

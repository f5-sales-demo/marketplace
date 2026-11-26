import { expect, test } from 'bun:test';
import * as observer from '../src/gcp-observer-insert-evidence';
import * as ce from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

test('wire-key reads bind the actual early CE VM callback and reject copies without poisoning the source', async () => {
  await withEarlyVmFixture(async (input) => {
    const vm = await ce.collectOriginalEarlyGcpVmEvidence(input);
    await ce.assertOriginalGcpVmCaptureCallback(vm, input.callback);
    await expect(ce.assertOriginalGcpVmCaptureCallback(vm, { ...input.callback })).rejects.toThrow('Original');
    await expect(ce.assertOriginalGcpVmCaptureCallback({ ...vm }, input.callback)).rejects.toThrow('Original');
    await ce.assertOriginalGcpVmCaptureCallback(vm, input.callback);
  });
}, 60000);

test('wire-key reads bind the actual reserved final CE callback', async () => {
  let original: unknown;
  await withEarlyVmFixture(
    async (input) => {
      original = await ce.collectOriginalEarlyGcpVmEvidence(input);
    },
    async (final) => {
      const vm = await ce.handoffOriginalEarlyGcpVmEvidence(original, final);
      await ce.assertOriginalGcpVmCaptureCallback(vm, final.callback);
      await expect(ce.assertOriginalGcpVmCaptureCallback(vm, { ...final.callback })).rejects.toThrow('Original');
      await ce.assertOriginalGcpVmCaptureCallback(vm, final.callback);
    },
  );
}, 60000);

test('wire-key reads cannot attach a copied callback to the original observer VM', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    await observer.assertOriginalGcpObserverVmCaptureCallback(vm, input.callback);
    await expect(observer.assertOriginalGcpObserverVmCaptureCallback(vm, { ...input.callback })).rejects.toThrow(
      'Original',
    );
    await observer.assertOriginalGcpObserverVmCaptureCallback(vm, input.callback);
  });
}, 60000);

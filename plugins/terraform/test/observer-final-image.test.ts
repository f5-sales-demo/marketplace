/** Real original callback/baseline/image issuers with offline HTTP replies. */
import { expect, test } from 'bun:test';
import { openInstalledGcpCloudSerialReader } from '../src/gcp-cloud-serial-reader';
import { openInstalledGcpObserverImageReader } from '../src/gcp-observer-image';
import {
  bindOriginalGcpObserverFinalImage,
  collectOriginalGcpObserverInsertIdentity,
  collectOriginalGcpObserverVmEvidence,
  readOriginalGcpObserverInsertIdentity,
  readOriginalGcpObserverVmEvidence,
} from '../src/gcp-observer-insert-evidence';
import { linuxMonotonicMs } from '../src/linux-clock';
import { withObserverInsert } from './fixtures/observer-insert.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('factory observer image correlation completes with an actual final callback after original operation expiry', async () => {
  let finalVerified = false;
  let beforeInput: Parameters<Parameters<typeof withObserverInsert>[0]>[0] | undefined;
  let identity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
  await withObserverInsert(
    async (input) => {
      beforeInput = input;
      identity = await collectOriginalGcpObserverInsertIdentity(input);
      while (linuxMonotonicMs() < input.callback.original.budget.deadline) await Bun.sleep(10);
    },
    undefined,
    async (final) => {
      expect(linuxMonotonicMs()).toBeGreaterThanOrEqual(final.original.budget.deadline);
      if (!beforeInput) throw new Error('Original observer before sources required');
      const reader = await openInstalledGcpObserverImageReader(final.original, final, beforeInput.imageFetcher);
      await bindOriginalGcpObserverFinalImage(identity, final, reader);
      const view = await readOriginalGcpObserverInsertIdentity(identity, final);
      expect(view.role).toBe('observer');
      expect(view.imageId).toBe('4996011480491275419');
      if (!final.reserve) throw new Error('Original final reserve required');
      const cloud = await openInstalledGcpCloudSerialReader(final.original, undefined, beforeInput.cloudFetcher, {
        admission: final.execution,
        reserve: final.reserve,
      });
      try {
        if (!identity) throw new Error('Original observer identity required');
        const vm = await collectOriginalGcpObserverVmEvidence({
          identity,
          callback: final,
          reader: cloud,
        });
        const observed = await readOriginalGcpObserverVmEvidence(vm);
        expect(observed.instanceId).toBe(String(beforeInput.vm.id));
        expect(observed.diskId).toBe(String(beforeInput.disk.id));
        expect(observed.imageId).toBe('4996011480491275419');
      } finally {
        await cloud.close();
      }

      finalVerified = true;
      await retainOwnedTestCapture(final.original.executionDirectory, 'observer-final-image', 'success');
    },
    undefined,
    true,
    { current: true, factoryImageGuard: true, operationRemainingMs: 12000, completeTraceBeforeExit: true },
  );
  expect(finalVerified).toBe(true);
}, 60000);

test('fresh final image preserves original before expiry and never revives its retired reader', async () => {
  let original: Parameters<Parameters<typeof withObserverInsert>[0]>[0] | undefined;
  let identity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
  let completed = false;
  await withObserverInsert(
    async (input) => {
      original = input;
      identity = await collectOriginalGcpObserverInsertIdentity(input);
      while (linuxMonotonicMs() < input.callback.original.budget.deadline) await Bun.sleep(10);
      await expect(input.imageReader.read()).rejects.toThrow();
      await expect(readOriginalGcpObserverInsertIdentity(identity)).rejects.toThrow();
      await expect(readOriginalGcpObserverInsertIdentity(identity)).rejects.toThrow('expired');
    },
    undefined,
    async (final) => {
      if (!original) throw new Error('Original before sources required');
      const reader = await openInstalledGcpObserverImageReader(final.original, final, original.imageFetcher);
      await bindOriginalGcpObserverFinalImage(identity, final, reader);
      const view = await readOriginalGcpObserverInsertIdentity(identity, final);
      expect(view.schemaVersion).toBe(2);
      expect(view.priorBeforeExpiryRetained).toBe(true);
      expect(view.finalImageSourceBound).toBe(true);
      await expect(original.imageReader.read()).rejects.toThrow('retired');
      await expect(readOriginalGcpObserverInsertIdentity(identity)).rejects.toThrow('expired');
      await retainOwnedTestCapture(final.original.executionDirectory, 'observer-image-before-expiry', 'success');
      completed = true;
    },
    undefined,
    true,
    { current: true, factoryImageGuard: true, operationRemainingMs: 12000, completeTraceBeforeExit: true },
  );
  expect(completed).toBe(true);
}, 60000);

test('final image binding refuses copied sources and competing valid readers without poisoning the selected source', async () => {
  let original: Parameters<Parameters<typeof withObserverInsert>[0]>[0] | undefined;
  let identity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
  await withObserverInsert(
    async (input) => {
      original = input;
      identity = await collectOriginalGcpObserverInsertIdentity(input);
    },
    undefined,
    async (final) => {
      if (!original) throw new Error('Original observer sources required');
      const one = await openInstalledGcpObserverImageReader(final.original, final, original.imageFetcher);
      const two = await openInstalledGcpObserverImageReader(final.original, final, original.imageFetcher);
      await expect(bindOriginalGcpObserverFinalImage(identity, { ...final }, one)).rejects.toThrow('Original');
      await expect(bindOriginalGcpObserverFinalImage(identity, final, { ...one })).rejects.toThrow('Original');
      await expect(bindOriginalGcpObserverFinalImage(identity, final, original.imageReader)).rejects.toThrow(
        'Original',
      );
      const results = await Promise.allSettled([
        bindOriginalGcpObserverFinalImage(identity, final, one),
        bindOriginalGcpObserverFinalImage(identity, final, two),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect((await readOriginalGcpObserverInsertIdentity(identity, final)).finalImageSourceBound).toBe(true);
      await retainOwnedTestCapture(final.original.executionDirectory, 'observer-final-image-admission', 'success');
    },
    undefined,
    true,
    { current: true, factoryImageGuard: true, completeTraceBeforeExit: true },
  );
}, 60000);

test('restoring original image bytes cannot clear a before ownership failure through a fresh final image reader', async () => {
  const { rename, writeFile } = await import('node:fs/promises');
  let original: Parameters<Parameters<typeof withObserverInsert>[0]>[0] | undefined;
  let identity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
  await withObserverInsert(
    async (input) => {
      original = input;
      identity = await collectOriginalGcpObserverInsertIdentity(input);
      const path = input.image.path,
        held = `${path}.held`;
      await rename(path, held);
      await writeFile(path, '{}', { mode: 0o400 });
      await expect(readOriginalGcpObserverInsertIdentity(identity)).rejects.toThrow();
      await rename(held, path);
      await expect(readOriginalGcpObserverInsertIdentity(identity)).rejects.toThrow('retired');
    },
    undefined,
    async (final) => {
      if (!original) throw new Error('Original observer sources required');
      const reader = await openInstalledGcpObserverImageReader(final.original, final, original.imageFetcher);
      await expect(bindOriginalGcpObserverFinalImage(identity, final, reader)).rejects.toThrow('retired');
      await expect(readOriginalGcpObserverInsertIdentity(identity, final)).rejects.toThrow('retired');
      await retainOwnedTestCapture(final.original.executionDirectory, 'observer-image-integrity-retained', 'success');
    },
    undefined,
    true,
    { current: true, factoryImageGuard: true, completeTraceBeforeExit: true },
  );
}, 60000);

test('a fresh final reader cannot change the original pinned image creation identity', async () => {
  let original: Parameters<Parameters<typeof withObserverInsert>[0]>[0] | undefined;
  let identity: Awaited<ReturnType<typeof collectOriginalGcpObserverInsertIdentity>> | undefined;
  await withObserverInsert(
    async (input) => {
      original = input;
      identity = await collectOriginalGcpObserverInsertIdentity(input);
    },
    undefined,
    async (final) => {
      if (!original) throw new Error('Original observer source required');
      const fixed = original;
      const changed = (async (url: string | URL | Request, init?: RequestInit) => {
        const response = await fixed.imageFetcher(url, init);
        if (!new URL(String(url)).pathname.includes('/images/')) return response;
        return Response.json({
          ...((await response.json()) as Record<string, unknown>),
          creationTimestamp: '2026-10-22T00:00:00Z',
        });
      }) as typeof fetch;
      const reader = await openInstalledGcpObserverImageReader(final.original, final, changed);
      await expect(bindOriginalGcpObserverFinalImage(identity, final, reader)).rejects.toThrow('image changed');
      const restored = await openInstalledGcpObserverImageReader(final.original, final, fixed.imageFetcher);
      await expect(bindOriginalGcpObserverFinalImage(identity, final, restored)).rejects.toThrow('retired');
      await retainOwnedTestCapture(final.original.executionDirectory, 'observer-final-image-replacement', 'success');
    },
    undefined,
    true,
    { current: true, factoryImageGuard: true, completeTraceBeforeExit: true },
  );
}, 60000);

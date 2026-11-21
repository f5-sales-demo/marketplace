import { expect, test } from 'bun:test';
import { mkdirSync, renameSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { collectOriginalGcpObserverInsertIdentity } from '../src/gcp-observer-insert-evidence';
import { openInstalledVmCapture } from '../src/installed-vm-capture';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

test('current CE collector retains pending insertion, binds the original VM and attributes serial without guest acceptance', async () => {
  await withEarlyVmFixture(
    async (input) => {
      const stage = await openInstalledVmCapture(input);
      await stage.admitCe(input.identity);
      input.state.vmUnavailable = true;
      expect(await stage.reconcile(input.identity.nodeName)).toBeNull();
      input.state.vmUnavailable = false;
      const vm = await stage.reconcile(input.identity.nodeName);
      expect(vm?.instanceId).toBe(input.state.vm.id as string);
      const serial = await stage.captureSerial(input.identity.nodeName, '0');
      expect(await stage.readSerialPacket(input.identity.nodeName, input.callback)).toBe(serial);
      expect(Object.isFrozen(serial)).toBe(true);
      expect(serial.source.contents).toBe(`original-node-serial${String.fromCharCode(10)}`);
      if (!vm) throw new Error('Original VM required');
      expect(serial.source.instanceId).toBe(vm.instanceId);
      expect(stage.coverage()).toMatchObject({
        expected: 4,
        ready: 1,
        vmCoverageComplete: false,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      });
      expect((await readdir(stage.directory)).some((name) => name.includes('serial'))).toBe(true);
    },
    undefined,
    undefined,
    true,
  );
}, 60000);

test('current observer collector keeps its distinct disk, image and original serial source', async () => {
  await withObserverInsert(
    async (input) => {
      const stage = await openInstalledVmCapture({
        callback: input.callback,
        baseline: input.baseline,
        reader: input.cloudReader,
      });
      const identity = await collectOriginalGcpObserverInsertIdentity(input);
      await stage.admitObserver(identity);
      const name = String(input.request.name);
      const vm = await stage.reconcile(name);
      if (vm?.kind !== 'original-gcp-observer-vm-evidence') throw new Error('Original observer VM required');
      expect(vm.instanceId).toBe(String(input.operation.targetId));
      expect(vm.diskId).toBe(String(input.disk.id));
      expect(vm.imageId).toBe('4996011480491275419');
      const serial = await stage.captureSerial(name, '0');
      expect(serial.source.contents).toBe(`original-observer-serial${String.fromCharCode(10)}`);
      expect(stage.coverage().guestAcceptanceComplete).toBe(false);
    },
    undefined,
    undefined,
    undefined,
    true,
  );
}, 60000);

test('collector refuses copied original callback and a copied cloud reader before capture', async () => {
  await withEarlyVmFixture(
    async (input) => {
      await expect(openInstalledVmCapture({ ...input, callback: { ...input.callback } })).rejects.toThrow('Original');
      await expect(openInstalledVmCapture({ ...input, reader: { ...input.reader } })).rejects.toThrow('Original');
    },
    undefined,
    undefined,
    true,
  );
}, 60000);

test('a changed original VM permanently refuses capture despite later identity restoration', async () => {
  await withEarlyVmFixture(
    async (input) => {
      const stage = await openInstalledVmCapture(input);
      await stage.admitCe(input.identity);
      await stage.reconcile(input.identity.nodeName);
      const old = input.state.vm.id;
      input.state.vm.id = '18446744073709551610';
      await expect(stage.reconcile(input.identity.nodeName)).rejects.toThrow();
      input.state.vm.id = old;
      await expect(stage.captureSerial(input.identity.nodeName, '0')).rejects.toThrow('refused');
      expect(stage.coverage().refused).toBe(true);
    },
    undefined,
    undefined,
    true,
  );
}, 60000);

test('final capture uses the original after callback and separate reader reserve without resetting the budget', async () => {
  let stage: Awaited<ReturnType<typeof openInstalledVmCapture>> | undefined;
  let name = '';
  await withEarlyVmFixture(
    async (input) => {
      stage = await openInstalledVmCapture(input);
      name = input.identity.nodeName;
      await stage.admitCe(input.identity);
      await stage.reconcile(name);
    },
    async (input) => {
      if (!stage) throw new Error('Original collector stage required');
      const result = await stage.finalCapture(input.callback, input.reader);
      expect(result.vmCoverageComplete).toBe(false);
      expect(result.guestAcceptanceComplete).toBe(false);
      expect(result.capturedNames).toContain(name);
      expect(result.finalDeadlineMs - result.finalStartedMs).toBe(300000);
      const packet = await stage.readSerialPacket(name, input.callback);
      expect(packet.vm.kind).toBe('original-final-gcp-vm-evidence');
      expect(packet.source.instanceId).toBe(String(input.state.vm.id));
      expect(await stage.readSerialPacket(name, input.callback)).toBe(packet);
      await expect(
        stage.readSerialPacket(name, { ...input.callback, original: input.callback.original }),
      ).rejects.toThrow('Original');
      await expect(stage.finalCapture(input.callback, input.reader)).rejects.toThrow('already');
    },
    undefined,
    true,
  );
}, 60000);

test('replacing the private capture directory cannot redirect retained serial evidence', async () => {
  await withEarlyVmFixture(
    async (input) => {
      const stage = await openInstalledVmCapture(input);
      await stage.admitCe(input.identity);
      await stage.reconcile(input.identity.nodeName);
      input.state.mutateDuringSerial = () => {
        renameSync(stage.directory, `${stage.directory}-original`);
        mkdirSync(stage.directory, { mode: 0o700 });
        input.state.mutateDuringSerial = undefined;
      };
      await expect(stage.captureSerial(input.identity.nodeName, '0')).rejects.toThrow('retention directory');
      expect(stage.coverage().refused).toBe(true);
      expect(await readdir(stage.directory)).toHaveLength(0);
    },
    undefined,
    undefined,
    true,
  );
}, 60000);

test('a refused before capture still attempts its original reserved final capture', async () => {
  let stage: Awaited<ReturnType<typeof openInstalledVmCapture>> | undefined;
  let name = '';
  await withEarlyVmFixture(
    async (input) => {
      stage = await openInstalledVmCapture(input);
      name = input.identity.nodeName;
      await stage.admitCe(input.identity);
      await stage.reconcile(name);
      await expect(stage.captureSerial(name, 'not-a-serial-cursor')).rejects.toThrow();
      expect(stage.coverage().refused).toBe(true);
    },
    async (input) => {
      if (!stage) throw new Error('Original collector required');
      const result = await stage.finalCapture(input.callback, input.reader);
      expect(result.guestAcceptanceComplete).toBe(false);
      expect(result.vmCoverageComplete).toBe(false);
      expect(stage.coverage().ready).toBe(result.capturedNames.length);
      expect((await readdir(stage.directory)).some((name) => name.startsWith('final-'))).toBe(true);
    },
    undefined,
    true,
  );
}, 60000);

test('final reserve settles an in-flight before capture without another submission or signal', async () => {
  let stage: Awaited<ReturnType<typeof openInstalledVmCapture>> | undefined;
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  let pending: Promise<unknown> | undefined;
  await withEarlyVmFixture(
    async (input) => {
      stage = await openInstalledVmCapture(input);
      await stage.admitCe(input.identity);
      await stage.reconcile(input.identity.nodeName);
      input.state.beforeVmRead = () => {
        input.state.beforeVmRead = undefined;
        started.resolve();
        return release.promise;
      };
      pending = stage.reconcile(input.identity.nodeName).then(
        (result) => result,
        (error) => error,
      );
      await started.promise;
    },
    async (input) => {
      if (!stage || !pending) throw new Error('Original active stage required');
      const final = stage.finalCapture(input.callback, input.reader);
      try {
        const deadline = Date.now() + 15000;
        while (stage.coverage().phase !== 'final') {
          await Promise.race([Bun.sleep(5), final]);
          if (Date.now() >= deadline) throw new Error('Original final admission deadline expired');
        }
        release.resolve();
        const result = await final;
        await pending;
        expect(result.guestAcceptanceComplete).toBe(false);
        expect(result.finalDeadlineMs - result.finalStartedMs).toBe(300000);
        expect(stage.coverage().phase).toBe('closed');
      } finally {
        release.resolve();
        await pending;
      }
    },
    undefined,
    true,
  );
}, 60000);

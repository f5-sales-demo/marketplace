import { expect, test } from 'bun:test';
import { openInstalledVmCapture } from '../src/installed-vm-capture';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('factory VM queue keeps original insertion, reconciliation and serial operations ordered without source races', async () => {
  const { serializeInstalledVmCapture } = await import('../src/installed-vm-operation-queue');
  await withEarlyVmFixture(
    async (input) => {
      const raw = await openInstalledVmCapture({
        callback: input.callback,
        baseline: input.baseline,
        reader: input.reader,
      });
      const stage = serializeInstalledVmCapture(raw);
      await stage.admitCe(input.identity);
      const entered = Promise.withResolvers<void>(),
        release = Promise.withResolvers<void>();
      let blocked = false;
      input.state.beforeVmRead = async () => {
        if (!blocked) {
          blocked = true;
          entered.resolve();
          await release.promise;
        }
      };
      const vm = stage.reconcile(input.identity.nodeName);
      await entered.promise;
      const serial = stage.captureSerial(input.identity.nodeName, '0');
      await Bun.sleep(25);
      expect(input.state.serialReads).toBe(0);
      release.resolve();
      const view = await vm;
      const packet = await serial;
      expect(view?.instanceId).toBe(String(input.state.vm.id));
      expect(packet.source.instanceId).toBe(String(input.state.vm.id));
      expect(raw.coverage().refused).toBe(false);
      await retainOwnedTestCapture(raw.directory, 'vm-queue-ordering', 'success');
    },
    undefined,
    undefined,
    true,
  );
}, 60000);

test('factory VM queue preserves a source identity failure and never turns restoration into a retry', async () => {
  const { serializeInstalledVmCapture } = await import('../src/installed-vm-operation-queue');
  await withEarlyVmFixture(
    async (input) => {
      const raw = await openInstalledVmCapture({
        callback: input.callback,
        baseline: input.baseline,
        reader: input.reader,
      });
      const stage = serializeInstalledVmCapture(raw);
      await stage.admitCe(input.identity);
      await stage.reconcile(input.identity.nodeName);
      const id = input.state.vm.id;
      input.state.vm.id = '18446744073709551610';
      await expect(stage.captureSerial(input.identity.nodeName, '0')).rejects.toThrow();
      input.state.vm.id = id;
      await expect(stage.reconcile(input.identity.nodeName)).rejects.toThrow('refused');
      expect(raw.coverage().refused).toBe(true);
      await retainOwnedTestCapture(raw.directory, 'vm-queue-refusal', 'success');
    },
    undefined,
    undefined,
    true,
  );
}, 60000);

test('factory VM queue refuses an invalid final admission without retiring valid before work or its actual final capture', async () => {
  const { serializeInstalledVmCapture } = await import('../src/installed-vm-operation-queue');
  let stage: ReturnType<typeof serializeInstalledVmCapture> | undefined;
  let before: Parameters<typeof openInstalledVmCapture>[0]['callback'] | undefined;
  let name = '';
  await withEarlyVmFixture(
    async (input) => {
      before = input.callback;
      stage = serializeInstalledVmCapture(await openInstalledVmCapture(input));
      name = input.identity.nodeName;
      await stage.admitCe(input.identity);
      await expect(
        stage.finalCapture({ ...input.callback, original: input.callback.original }, input.reader),
      ).rejects.toThrow('Original');
      await expect(stage.finalCapture(input.callback, input.reader)).rejects.toThrow('reserve');
      expect((await stage.reconcile(name))?.instanceId).toBe(String(input.state.vm.id));
    },
    async (input) => {
      if (!stage || !before) throw new Error('Original queued VM stage required');
      await expect(
        stage.finalCapture({ ...input.callback, original: input.callback.original }, input.reader),
      ).rejects.toThrow('Original');
      await expect(stage.finalCapture(input.callback, { ...input.reader })).rejects.toThrow('Original');
      const report = await stage.finalCapture(input.callback, input.reader);
      await expect(stage.reconcile(name)).rejects.toThrow('retired');
      await expect(stage.readSerialPacket(name, before)).rejects.toThrow('retired');
      const captured = await stage.readSerialPacket(name, input.callback);
      expect(report.capturedNames).toContain(name);
      expect(report.finalDeadlineMs - report.finalStartedMs).toBe(300000);
      expect(captured.vm.kind).toBe('original-final-gcp-vm-evidence');
      expect(await stage.readSerialPacket(name, input.callback)).toBe(captured);
      await expect(stage.finalCapture(input.callback, input.reader)).rejects.toThrow('already');
      await retainOwnedTestCapture(stage.directory, 'vm-queue-final-admission', 'success');
    },
    undefined,
    true,
  );
}, 60000);

test('factory VM queue drains actual before work before final source handoff and retains its refusal', async () => {
  const { serializeInstalledVmCapture } = await import('../src/installed-vm-operation-queue');
  let stage: ReturnType<typeof serializeInstalledVmCapture> | undefined;
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  let pending: Promise<unknown> | undefined, queued: Promise<unknown> | undefined;
  await withEarlyVmFixture(
    async (input) => {
      stage = serializeInstalledVmCapture(await openInstalledVmCapture(input));
      await stage.admitCe(input.identity);
      await stage.reconcile(input.identity.nodeName);
      input.state.beforeVmRead = () => {
        input.state.beforeVmRead = undefined;
        entered.resolve();
        return release.promise;
      };
      pending = stage.reconcile(input.identity.nodeName).catch((error) => error);
      await entered.promise;
      queued = stage.captureSerial(input.identity.nodeName, '0').catch((error) => error);
      expect(input.state.serialReads).toBe(0);
    },
    async (input) => {
      if (!stage || !pending || !queued) throw new Error('Original in-flight VM queue required');
      const final = stage.finalCapture(input.callback, input.reader);
      try {
        await Bun.sleep(50);
        expect(stage.coverage().phase).toBe('before');
        expect(input.state.serialReads).toBe(0);
        release.resolve();
        const report = await final;
        expect(await pending).toBeInstanceOf(Error);
        expect(await queued).toBeInstanceOf(Error);
        expect(stage.coverage().refused).toBe(true);
        expect(stage.coverage().phase).toBe('closed');
        expect(report.capturedNames).toContain(input.identity.nodeName);
        expect(report.finalDeadlineMs - report.finalStartedMs).toBe(300000);
        expect((await stage.readSerialPacket(input.identity.nodeName, input.callback)).vm.kind).toBe(
          'original-final-gcp-vm-evidence',
        );
        await retainOwnedTestCapture(stage.directory, 'vm-queue-final-drain', 'success');
      } finally {
        release.resolve();
        await Promise.allSettled([pending, queued, final]);
      }
    },
    undefined,
    true,
  );
}, 60000);

test('VM queue drain refuses an unresolved operation at its monotonic deadline and rejects expired timing', async () => {
  const module = await import('../src/installed-vm-operation-queue');
  const drain = (
    module as unknown as {
      drainInstalledVmCaptureQueue(pending: Promise<void>, deadline: number): Promise<void>;
    }
  ).drainInstalledVmCaptureQueue;
  expect(typeof drain).toBe('function');
  const { linuxMonotonicMs } = await import('../src/linux-clock');
  const unresolved = Promise.withResolvers<void>();
  const started = linuxMonotonicMs();
  try {
    await expect(drain(unresolved.promise, started + 30)).rejects.toThrow('unresolved');
    expect(linuxMonotonicMs() - started).toBeLessThan(1000);
    await expect(drain(Promise.resolve(), linuxMonotonicMs() - 1)).rejects.toThrow('deadline');
    await expect(drain(Promise.resolve(), Number.NaN)).rejects.toThrow('deadline');
    await expect(drain(Promise.resolve(), Number.POSITIVE_INFINITY)).rejects.toThrow('deadline');
    await drain(Promise.resolve(), linuxMonotonicMs() + 1000);
  } finally {
    unresolved.resolve();
  }
});

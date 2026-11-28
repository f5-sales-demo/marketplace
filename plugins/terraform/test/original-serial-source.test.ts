import { expect, test } from 'bun:test';
import * as observer from '../src/gcp-observer-insert-evidence';
import * as ce from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

test('early CE serial source retains its original VM pairing, exact bytes and source clocks', async () => {
  await withEarlyVmFixture(async (input) => {
    const vm = await ce.collectOriginalEarlyGcpVmEvidence(input);
    const serial = await ce.collectOriginalEarlyGcpSerialEvidence(vm, '0');
    const source = await ce.readOriginalEarlyGcpSerialSource(vm, serial);
    expect(source.instanceId).toBe(input.identity.targetId as string);
    expect(source.contents).toBe('original-node-serial\n');
    expect(source.startedAt).toBe(serial.startedAt);
    expect(source.finishedAt).toBe(serial.finishedAt);
    expect(source.sshTrustQualified).toBe(false);
    await expect(ce.readOriginalEarlyGcpSerialSource({ ...vm }, serial)).rejects.toThrow('Original');
    await expect(ce.readOriginalEarlyGcpSerialSource(vm, { ...serial })).rejects.toThrow('Original');
    const current = await input.reader.instance(input.identity.zone, input.identity.nodeName);
    if (!current.present) throw new Error('Original fixture VM unavailable');
    const foreign = await input.reader.serial(current, '0');
    await expect(ce.readOriginalEarlyGcpSerialSource(vm, foreign)).rejects.toThrow('Original');
    expect((await ce.readOriginalEarlyGcpSerialSource(vm, serial)).contents).toBe(source.contents);
  });
}, 60000);

test('final CE serial source uses the actual final VM packet and retains its reserve', async () => {
  let before: unknown;
  await withEarlyVmFixture(
    async (input) => {
      before = await ce.collectOriginalEarlyGcpVmEvidence(input);
    },
    async (final) => {
      const vm = await ce.handoffOriginalEarlyGcpVmEvidence(before, final);
      const serial = await ce.collectOriginalFinalGcpSerialEvidence(vm, '0');
      const source = await ce.readOriginalFinalGcpSerialSource(vm, serial);
      expect(source.contents).toBe('original-node-serial\n');
      expect(source.instanceId).toBe(final.identity.targetId as string);
      expect(source.sshTrustQualified).toBe(false);
      await expect(ce.readOriginalFinalGcpSerialSource({ ...vm }, serial)).rejects.toThrow('Original');
      await expect(ce.readOriginalFinalGcpSerialSource(vm, { ...serial })).rejects.toThrow('Original');
    },
  );
}, 60000);

test('observer serial source cannot borrow another serial packet or a copied original VM', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const serial = await observer.collectOriginalGcpObserverSerialEvidence(vm, '0');
    const source = await observer.readOriginalGcpObserverSerialSource(vm, serial);
    expect(source.contents).toBe('original-observer-serial\n');
    expect(source.instanceId).toBe(input.vm.id as string);
    expect(source.startedAt).toBe(serial.startedAt);
    expect(source.sshTrustQualified).toBe(false);
    await expect(observer.readOriginalGcpObserverSerialSource({ ...vm }, serial)).rejects.toThrow('Original');
    await expect(observer.readOriginalGcpObserverSerialSource(vm, { ...serial })).rejects.toThrow('Original');
  });
}, 60000);

test('original CE serial source retires after VM replacement despite later restoration', async () => {
  await withEarlyVmFixture(async (input) => {
    const vm = await ce.collectOriginalEarlyGcpVmEvidence(input);
    const serial = await ce.collectOriginalEarlyGcpSerialEvidence(vm, '0');
    const original = input.state.vm;
    input.state.vm = { ...original, id: '18446744073709551610' };
    await expect(ce.readOriginalEarlyGcpSerialSource(vm, serial)).rejects.toThrow();
    input.state.vm = original;
    await expect(ce.readOriginalEarlyGcpSerialSource(vm, serial)).rejects.toThrow('retired');
  });
}, 60000);

test('observer serial source retires after original disk ownership changes', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const serial = await observer.collectOriginalGcpObserverSerialEvidence(vm, '0');
    const original = input.disk.id;
    input.disk.id = '18446744073709551610';
    await expect(observer.readOriginalGcpObserverSerialSource(vm, serial)).rejects.toThrow();
    input.disk.id = original;
    await expect(observer.readOriginalGcpObserverSerialSource(vm, serial)).rejects.toThrow('retired');
  });
}, 60000);

test('original serial source cannot renew capture clocks after expiry', async () => {
  await withEarlyVmFixture(async (input) => {
    const vm = await ce.collectOriginalEarlyGcpVmEvidence(input);
    const serial = await ce.collectOriginalEarlyGcpSerialEvidence(vm, '0');
    const realNow = Date.now;
    try {
      Date.now = () => serial.startedAt + 300001;
      await expect(ce.readOriginalEarlyGcpSerialSource(vm, serial)).rejects.toThrow();
    } finally {
      Date.now = realNow;
    }
    await expect(ce.readOriginalEarlyGcpSerialSource(vm, serial)).rejects.toThrow('retired');
  });
}, 60000);

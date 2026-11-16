import { expect, test } from 'bun:test';
import * as observer from '../src/gcp-observer-insert-evidence';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

test('observer VM evidence binds the original numeric VM, external disk, image and interface without CE token rules', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const packet = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const view = await observer.readOriginalGcpObserverVmEvidence(packet);
    expect(view.instanceId).toBe(input.vm.id as string);
    expect(view.diskId).toBe(input.disk.id as string);
    expect(view.imageId).toBe('4996011480491275419');
    expect(view.observerExecutionAuthorized).toBe(false);
    expect((await observer.collectOriginalGcpObserverSerialEvidence(packet, '0')).instanceId).toBe(view.instanceId);
  });
}, 60000);

for (const [target, change] of [
  ['vm', { id: '18446744073709551610' }],
  ['vm', { serviceAccounts: [{ email: 'default' }] }],
  ['vm', { canIpForward: true }],
  ['disk', { sourceImageId: '4996011480491275418' }],
  ['disk', { sizeGb: '30' }],
  ['disk', { users: [] }],
] as const)
  test(`observer VM join refuses original resource drift: ${target}${Object.keys(change)[0]}`, async () => {
    await withObserverInsert(async (input) => {
      const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
      Object.assign(input[target], change);
      await expect(
        observer.collectOriginalGcpObserverVmEvidence({
          identity,
          callback: input.callback,
          reader: input.cloudReader,
        }),
      ).rejects.toThrow();
    });
  }, 60000);

test('observer VM packet cannot be copied and later original resource replacement stays refused', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const packet = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    await expect(observer.readOriginalGcpObserverVmEvidence({ ...packet })).rejects.toThrow('Original');
    const id = input.disk.id;
    input.disk.id = '18446744073709551610';
    await expect(observer.readOriginalGcpObserverVmEvidence(packet)).rejects.toThrow();
    input.disk.id = id;
    await expect(observer.readOriginalGcpObserverVmEvidence(packet)).rejects.toThrow('retired');
  });
}, 60000);

for (const target of ['vm', 'disk'] as const)
  test(`ownership change during observer serial capture retires the packet: ${target}`, async () => {
    await withObserverInsert(async (input) => {
      const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
      const packet = await observer.collectOriginalGcpObserverVmEvidence({
        identity,
        callback: input.callback,
        reader: input.cloudReader,
      });
      const original = input[target].id;
      input.serialHook.run = () => {
        input[target].id = '18446744073709551610';
      };
      await expect(observer.collectOriginalGcpObserverSerialEvidence(packet, '0')).rejects.toThrow();
      input[target].id = original;
      input.serialHook.run = undefined;
      await expect(observer.readOriginalGcpObserverVmEvidence(packet)).rejects.toThrow('retired');
    });
  }, 60000);

test('observer insertion and VM evidence cannot renew stale observations', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const packet = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const realNow = Date.now;
    const expired = realNow() + 300001;
    try {
      Date.now = () => expired;
      await expect(observer.readOriginalGcpObserverVmEvidence(packet)).rejects.toThrow();
    } finally {
      Date.now = realNow;
    }
    await expect(observer.readOriginalGcpObserverVmEvidence(packet)).rejects.toThrow('retired');
  });
}, 60000);

test('observer VM evidence rejects metadata drift between original capture and the ownership bracket', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    let reads = 0;
    input.cloudHook.run = (path) => {
      if (path.endsWith(`/instances/${input.vm.name}`) && ++reads === 2)
        input.vm.metadata = { items: [], fingerprint: 'foreign' };
    };
    await expect(
      observer.collectOriginalGcpObserverVmEvidence({
        identity,
        callback: input.callback,
        reader: input.cloudReader,
      }),
    ).rejects.toThrow();
  });
}, 60000);

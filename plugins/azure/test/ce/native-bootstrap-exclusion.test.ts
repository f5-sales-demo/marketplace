import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { nativeRetirementFixture } from './native-retirement-fixture';

test('native Azure retirement publication excludes checkout and releases custody before drain', async () => {
  const f = await nativeRetirementFixture();
  const lock = join(f.storage.directory, '.azure-relay-native-mutation-lock');
  const release = await acquireProcessLock(lock);
  try {
    await expect(f.run()).rejects.toThrow('held by a live process');
    await expect(f.storage.read('azure-native-lifecycle-retirement.json')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(f.order).toEqual([]);
  } finally {
    await release();
  }
  try {
    let drains = 0;
    f.runtime.drainPlatform = async () => {
      drains++;
      expect(await f.storage.read('azure-native-lifecycle-retirement.json')).toEqual({
        schemaVersion: 1,
        engine: 'native',
        owner: f.binding.owner,
        sourcePlanSha256: f.source.planSha256,
        teardownPlanSha256: f.teardown.planSha256,
      });
      const unlock = await acquireProcessLock(lock);
      await unlock();
      return { status: 'pending-origin' };
    };
    expect((await f.run()).status).toBe('pending-platform-drain');
    expect((await f.run()).status).toBe('pending-platform-drain');
    expect(drains).toBe(2);
    await f.storage.write('azure-native-lifecycle-retirement.json', { schemaVersion: 1, owner: 'foreign' });
    await expect(f.run()).rejects.toThrow('another immutable teardown');
    expect(drains).toBe(2);
    const unlock = await acquireProcessLock(lock);
    await unlock();
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

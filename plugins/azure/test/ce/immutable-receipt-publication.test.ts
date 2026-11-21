const syntheticAccountId = '00000000-0000-4000-8000-000000000001';

import { afterEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { chmod, link, lstat, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { publishImmutableCeReceipt, readImmutableCeReceipt } from '../../src/ce/immutable-receipt-publication';

const roots: string[] = [],
  namespace = 'example-replacement-final';
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-immutable-receipt-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, {
    provider: 'azure',
    engine: 'terraform',
    account: syntheticAccountId,
    region: 'eastus',
    deploymentId: 'immutable-receipt-fixture',
  });
  const record = { schemaVersion: 1, kind: 'private-test-record', receiptSha256: 'a'.repeat(64) };
  const digest = canonicalSha256(record),
    name = `${namespace}-${digest}.json`,
    path = join(store.directory, name);
  const pending = () => join(store.directory, `${namespace}-${digest}-${randomUUID()}.pending`);
  const bytes = Buffer.from(JSON.stringify(record));
  return { root, store, record, digest, name, path, pending, bytes };
}

test('immutable publication is exact, owner-bound and idempotent without an execution claim', async () => {
  const f = await fixture();
  const first = await publishImmutableCeReceipt(f.store, namespace, f.record),
    stat = await lstat(f.path);
  expect(await publishImmutableCeReceipt(f.store, namespace, f.record)).toEqual(first);
  expect((await lstat(f.path)).ino).toBe(stat.ino);
  expect(stat.nlink).toBe(1);
  expect(stat.mode & 0o777).toBe(0o600);
  expect((await readImmutableCeReceipt(f.store, namespace, f.digest)).record).toEqual(f.record);
  expect(await readFile(f.path)).toEqual(f.bytes);
  expect((await readdir(f.store.directory)).filter((name) => name.startsWith(namespace))).toEqual([f.name]);
});
for (const linked of [false, true])
  test(`complete pending publication recovers without changing retained bytes (${linked ? 'linked' : 'unlinked'})`, async () => {
    const f = await fixture(),
      pending = f.pending();
    await writeFile(pending, f.bytes, { mode: 0o600 });
    if (linked) await link(pending, f.path);
    const original = await lstat(pending);
    await publishImmutableCeReceipt(f.store, namespace, f.record);
    expect((await lstat(f.path)).ino).toBe(original.ino);
    expect((await lstat(f.path)).nlink).toBe(1);
    expect(await readFile(f.path)).toEqual(f.bytes);
    await expect(lstat(pending)).rejects.toMatchObject({ code: 'ENOENT' });
  });
test('truncated pending evidence is retained without inferring a completed record', async () => {
  const f = await fixture(),
    pending = f.pending(),
    fragment = f.bytes.subarray(0, 17);
  await writeFile(pending, fragment, { mode: 0o600 });
  await expect(publishImmutableCeReceipt(f.store, namespace, f.record)).rejects.toThrow('pending retained');
  expect(await readFile(pending)).toEqual(fragment);
  await expect(lstat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('ambiguous pending evidence remains unresolved and unmodified', async () => {
  const f = await fixture(),
    pending = [f.pending(), f.pending()];
  for (const path of pending) await writeFile(path, f.bytes, { mode: 0o600 });
  await expect(publishImmutableCeReceipt(f.store, namespace, f.record)).rejects.toThrow('ambiguous');
  for (const path of pending) expect(await readFile(path)).toEqual(f.bytes);
  await expect(lstat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('foreign immutable collision cannot be overwritten or read as the requested receipt', async () => {
  const f = await fixture(),
    foreign = Buffer.from('{"schemaVersion":1,"kind":"foreign"}');
  await writeFile(f.path, foreign, { mode: 0o600 });
  await expect(publishImmutableCeReceipt(f.store, namespace, f.record)).rejects.toThrow('collision retained');
  await expect(readImmutableCeReceipt(f.store, namespace, f.digest)).rejects.toThrow('digest or encoding');
  expect(await readFile(f.path)).toEqual(foreign);
});
test('completed publication cannot conceal a separate unresolved pending fragment', async () => {
  const f = await fixture();
  await publishImmutableCeReceipt(f.store, namespace, f.record);
  const pending = f.pending(),
    fragment = f.bytes.subarray(0, 19);
  await writeFile(pending, fragment, { mode: 0o600 });
  await expect(publishImmutableCeReceipt(f.store, namespace, f.record)).rejects.toThrow('unresolved pending');
  expect(await readFile(f.path)).toEqual(f.bytes);
  expect(await readFile(pending)).toEqual(fragment);
});
test('same-content native owner inode replacement during verification rejects publication', async () => {
  const f = await fixture(),
    verify = f.store.verify.bind(f.store),
    owner = join(f.store.directory, 'owner.json');
  const bytes = await readFile(owner);
  f.store.verify = async () => {
    await verify();
    await rename(owner, join(f.store.directory, 'retained-owner.json'));
    await writeFile(owner, bytes, { mode: 0o600 });
  };
  await expect(publishImmutableCeReceipt(f.store, namespace, f.record)).rejects.toThrow('owner identity changed');
  await expect(lstat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('changed request during owner verification rejects before publication', async () => {
  const f = await fixture(),
    verify = f.store.verify.bind(f.store);
  f.store.verify = async () => {
    await verify();
    f.record.receiptSha256 = 'b'.repeat(64);
  };
  await expect(publishImmutableCeReceipt(f.store, namespace, f.record)).rejects.toThrow('owning context changed');
  await expect(lstat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
});
for (const fault of ['symlink', 'extra-link', 'wide-mode'] as const)
  test(`unsafe immutable file cannot qualify or be repaired (${fault})`, async () => {
    const f = await fixture(),
      target = join(f.store.directory, 'retained-target');
    if (fault === 'symlink') {
      await writeFile(target, f.bytes, { mode: 0o600 });
      await symlink(target, f.path);
    } else {
      await writeFile(f.path, f.bytes, { mode: 0o600 });
      if (fault === 'extra-link') await link(f.path, target);
      else await chmod(f.path, 0o644);
    }
    await expect(publishImmutableCeReceipt(f.store, namespace, f.record)).rejects.toThrow();
    await expect(readImmutableCeReceipt(f.store, namespace, f.digest)).rejects.toThrow();
    expect(await readFile(f.path)).toEqual(f.bytes);
    if (fault === 'wide-mode') expect((await lstat(f.path)).mode & 0o777).toBe(0o644);
  });
test('cancelled publication performs no publication', async () => {
  const f = await fixture(),
    signal = AbortSignal.abort(Error('owned cancellation'));
  await expect(publishImmutableCeReceipt(f.store, namespace, f.record, signal)).rejects.toThrow('owned cancellation');
  await expect(lstat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
});

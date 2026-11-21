import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { retireRegistrationApprovalReservations } from '../../src/ce/registration-approval-retirement';
import type { CeOwner, SiteBinding } from '../../src/ce/runtime';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const context = { tenantOrigin: 'https://tenant.example.test', contractFingerprint: 'sha256:' + 'a'.repeat(64) };
async function fixture(provider: 'aws' | 'azure' = 'aws', engine: 'native' | 'terraform' = 'terraform') {
  const root = await mkdtemp(join(tmpdir(), 'approval-retire-'));
  roots.push(root);
  const owner: CeOwner = { provider, engine, account: '111111111111', region: 'region-one', deploymentId: 'site-one' };
  const binding: SiteBinding = { owner, siteName: 'site-one', nodes: ['node-one'] };
  const store = await CeDeploymentStore.open(root, owner);
  const uid = '11111111-2222-3333-4444-555555555555';
  const registration = 'r-' + uid;
  const name = 'registration-approval-' + createHash('sha256').update(registration).digest('hex') + '.json';
  const record = {
    schemaVersion: 1,
    owner,
    ...context,
    identity: {
      siteName: binding.siteName,
      node: 'node-one',
      registration,
      registrationUid: uid,
      initialState: 'PENDING',
      action: 'approve-registration',
      instanceId: provider === 'aws' ? 'i-1234567890abcdef0' : 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      passportSha256: 'b'.repeat(64),
    },
  };
  await store.write(name, record);
  return { root, binding, store, name, record };
}
for (const provider of ['aws', 'azure'] as const)
  for (const engine of ['native', 'terraform'] as const)
    test(`${provider}/${engine}: exact absence retires the original approval reservation`, async () => {
      const f = await fixture(provider, engine);
      const seen: string[] = [];
      const result = await retireRegistrationApprovalReservations(f.store, f.binding, context, async (name) => {
        seen.push(name);
      });
      expect(seen).toEqual([f.record.identity.registration]);
      expect(result.retired).toHaveLength(1);
      expect(await readdir(f.store.directory)).toEqual(['owner.json']);
      expect(
        (
          await retireRegistrationApprovalReservations(f.store, f.binding, context, async () => {
            throw Error('no replay');
          })
        ).retired,
      ).toEqual([]);
    });
for (const mutation of [
  'owner',
  'tenant',
  'fingerprint',
  'node',
  'instance',
  'state',
  'uid',
  'extra',
  'passport',
  'node-array',
  'state-array',
] as const)
  test(`rejects ${mutation} substitution before API reads or retirement`, async () => {
    const f = await fixture();
    const value: any = structuredClone(f.record);
    if (mutation === 'node-array') value.identity.node = ['node-one'];
    if (mutation === 'state-array') {
      value.identity.initialState = ['NEW'];
      delete value.identity.registrationUid;
    }
    if (mutation === 'owner') value.owner.account = '222222222222';
    if (mutation === 'tenant') value.tenantOrigin = 'https://foreign.example.test';
    if (mutation === 'fingerprint') value.contractFingerprint = 'sha256:' + 'c'.repeat(64);
    if (mutation === 'node') value.identity.node = 'foreign-node';
    if (mutation === 'instance') value.identity.instanceId = '__INSTANCE_1__';
    if (mutation === 'state') value.identity.initialState = 'ONLINE';
    if (mutation === 'uid') value.identity.registrationUid = '99999999-2222-3333-4444-555555555555';
    if (mutation === 'extra') value.future = true;
    if (mutation === 'passport') delete value.identity.passportSha256;
    await f.store.write(f.name, value);
    let reads = 0;
    await expect(
      retireRegistrationApprovalReservations(f.store, f.binding, context, async () => {
        reads++;
      }),
    ).rejects.toThrow();
    expect(reads).toBe(0);
    expect(await f.store.read(f.name)).toEqual(value);
  });
test('authorization/service failure retains every reservation', async () => {
  const f = await fixture();
  await expect(
    retireRegistrationApprovalReservations(f.store, f.binding, context, async () => {
      throw Error('service unavailable');
    }),
  ).rejects.toThrow('service unavailable');
  expect(await f.store.read(f.name)).toEqual(f.record);
});
test('record changed during exact readback remains unretired', async () => {
  const f = await fixture();
  await expect(
    retireRegistrationApprovalReservations(f.store, f.binding, context, async () => {
      await f.store.write(f.name, { ...f.record, future: true });
    }),
  ).rejects.toThrow('changed');
  expect(await f.store.read(f.name)).toHaveProperty('future', true);
});
test('symlink substitution cannot read or retire another file', async () => {
  const f = await fixture();
  await rm(join(f.store.directory, f.name));
  await symlink(join(f.store.directory, 'owner.json'), join(f.store.directory, f.name));
  await expect(retireRegistrationApprovalReservations(f.store, f.binding, context, async () => {})).rejects.toThrow(
    'custody',
  );
  await f.store.verify();
});
test('pre-cancelled retirement performs no exact reads or removal', async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort(Error('cancelled'));
  let reads = 0;
  await expect(
    retireRegistrationApprovalReservations(
      f.store,
      f.binding,
      context,
      async () => {
        reads++;
      },
      controller.signal,
    ),
  ).rejects.toThrow('cancelled');
  expect(reads).toBe(0);
  expect(await f.store.read(f.name)).toEqual(f.record);
});

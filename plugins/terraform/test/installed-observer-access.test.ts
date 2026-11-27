/** Actual original issuers and native children; offline cloud replies and an
 * intentionally empty ELF keyscan source. No SSH or executor override. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { bindOriginalGcpCampaignAccess, prepareOriginalGcpCampaignAccess } from '../src/gcp-campaign-access';
import {
  collectOriginalGcpObserverInsertIdentity,
  collectOriginalGcpObserverSerialEvidence,
  collectOriginalGcpObserverVmEvidence,
} from '../src/gcp-observer-insert-evidence';
import { closeOriginalGcpSshClientProfile, openGcpSshClientProfile } from '../src/gcp-ssh-client-profile';
import { openInstalledGcpObserverAccess } from '../src/installed-observer-access';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

function copyOpaque(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Original fixture reference required');
  return { ...value };
}

async function withAccess(run: (input: Parameters<typeof openInstalledGcpObserverAccess>[0]) => Promise<void>) {
  let store: CeDeploymentStore | undefined;
  await withObserverInsert(
    async (input) => {
      if (!store) throw new Error('Original campaign store required');
      const identity = await collectOriginalGcpObserverInsertIdentity(input);
      const vm = await collectOriginalGcpObserverVmEvidence({
        identity,
        callback: input.callback,
        reader: input.cloudReader,
      });
      const serial = await collectOriginalGcpObserverSerialEvidence(vm, '0');
      const root = join(store.directory, 'offline-empty-client-profile');
      await mkdir(join(root, 'bin'), { recursive: true, mode: 0o700 });
      const bytes = await readFile('/usr/bin/true');
      const files: Record<string, string> = {};
      for (const name of ['ssh', 'ssh-keyscan', 'ssh-keygen']) {
        await writeFile(join(root, 'bin', name), bytes, { mode: 0o700 });
        files[name] = createHash('sha256').update(bytes).digest('hex');
      }
      const profile = await openGcpSshClientProfile(root, { pins: { version: '10.6p2', files } });
      try {
        await run({ vm, serial, callback: input.callback, store, profile });
      } finally {
        closeOriginalGcpSshClientProfile(profile);
      }
    },
    undefined,
    undefined,
    async (intent, originalStore) => {
      store = originalStore;
      if (!intent.observer || !intent.initialAccess) throw new Error('Original campaign scope required');
      const request = { platformContext: intent.platformContext, sshSourceCidr: intent.observer.sshSourceCidr };
      const access = await prepareOriginalGcpCampaignAccess(store, request);
      intent.observer.publicKey = access.observerPublicKey;
      intent.initialAccess.publicKey = access.cePublicKey;
      await bindOriginalGcpCampaignAccess(store, { ...request, ...access, intentSha256: fingerprint(intent).slice(7) });
    },
  );
}

test('observer access rejects copied VM, serial, callback and profile before source execution', async () => {
  await withAccess(async (input) => {
    const names = await readdir(input.callback.original.executionDirectory);
    for (const changed of [
      { vm: copyOpaque(input.vm) },
      { serial: copyOpaque(input.serial) },
      { callback: { ...input.callback } },
      { profile: { ...input.profile } },
    ])
      await expect(openInstalledGcpObserverAccess({ ...input, ...changed })).rejects.toThrow('Original');
    expect(await readdir(input.callback.original.executionDirectory)).toEqual(names);
  });
}, 120000);

test('observer access closes before initialization without submitting or adopting any source', async () => {
  await withAccess(async (input) => {
    const access = await openInstalledGcpObserverAccess(input);
    expect(access.coverage().initialized).toBe(false);
    const closed = access.close();
    expect(access.close()).toBe(closed);
    await closed;
    expect(access.coverage().closed).toBe(true);
    expect(access.coverage().guestAcceptanceComplete).toBe(false);
    await expect(access.initialize()).rejects.toThrow('retired');
    await expect(access.read()).rejects.toThrow('retired');
  });
}, 120000);

test('empty original native wire output retains refusal and prevents replay and client delivery', async () => {
  await withAccess(async (input) => {
    const access = await openInstalledGcpObserverAccess(input);
    await expect(access.initialize()).rejects.toThrow('One complete original VM wire key');
    expect(access.coverage().failed).toBe(true);
    expect(access.coverage().initialized).toBe(false);
    expect(access.coverage().clientDeliveryAttempted).toBe(false);
    await expect(access.initialize()).rejects.toThrow('claimed');
    await expect(access.read()).rejects.toThrow('refused');
    await access.close();
    expect(access.coverage().failed).toBe(true);
    expect(access.coverage().guestAcceptanceComplete).toBe(false);
    const names = await readdir(input.store.directory);
    const events = await Promise.all(
      names.filter((name) => name.startsWith('gcp-observer-access-')).map((name) => input.store.read(name)),
    );
    expect(events.some((event) => (event as { phase: string }).phase === 'initialization-refused')).toBe(true);
  });
}, 120000);

test('an explicit unavailable renewal never starts initial client delivery', async () => {
  await withAccess(async (input) => {
    const names = await readdir(input.callback.original.executionDirectory);
    for (const installation of [
      null,
      { schemaVersion: 1, kind: 'original-gcp-observer-client-installation-reference' },
    ]) {
      await expect(
        openInstalledGcpObserverAccess({
          ...input,
          installation: installation as unknown as typeof input.installation,
        }),
      ).rejects.toThrow('Original');
    }
    expect(await readdir(input.callback.original.executionDirectory)).toEqual(names);
  });
}, 120000);

test('a refused final closure retains its unresolved state and cannot report source closure', async () => {
  await withAccess(async (input) => {
    const access = await openInstalledGcpObserverAccess(input);
    await expect(access.close({ ...input.callback })).rejects.toThrow('Original');
    expect(access.coverage().closed).toBe(false);
    expect(access.coverage().closureUnresolved).toBe(true);
    expect(access.coverage().clientDeliveryAttempted).toBe(false);
    await expect(access.initialize()).rejects.toThrow('retired');
  });
}, 120000);

/** Genuine callback/VM issuers; explicit offline client bytes and cloud replies. */
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as command from '../src/gcp-keyscan-command';
import * as observer from '../src/gcp-observer-insert-evidence';
import { closeOriginalGcpSshClientProfile, openGcpSshClientProfile } from '../src/gcp-ssh-client-profile';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function clients() {
  const root = await mkdtemp(join(tmpdir(), 'gcp-keyscan-command-'));
  roots.push(root);
  await mkdir(join(root, 'bin'), { mode: 0o700 });
  const files: Record<string, string> = {};
  for (const name of ['ssh', 'ssh-keyscan', 'ssh-keygen']) {
    const bytes = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from(`offline-${name}`)]);
    await writeFile(join(root, 'bin', name), bytes, { mode: 0o500 });
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  return openGcpSshClientProfile(root, { pins: { version: '10.6p2', files } });
}

test('key scanning derives its exact target and arguments from the original observer VM', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const profile = await clients();
    try {
      const ref = await command.bindOriginalGcpObserverKeyScanCommand(vm, input.callback, profile);
      const original = await command.readOriginalGcpKeyScanCommand(ref);
      expect(original.args).toEqual(['-q', '-T', '15', '-t', 'ed25519', '-p', '22', '192.0.2.7']);
      expect(original.vm.instanceId).toBe(String(input.operation.targetId));
      expect(original.callback).toBe(input.callback);
      expect(original.executable.path.endsWith('/bin/ssh-keyscan')).toBe(true);
      expect(Object.isFrozen(original.args)).toBe(true);
      await expect(command.readOriginalGcpKeyScanCommand({ ...ref })).rejects.toThrow('Original');
      await command.readOriginalGcpKeyScanCommand(ref);
    } finally {
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('copied callbacks, VM receipts and client profiles cannot grant key-scan execution', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const profile = await clients();
    try {
      for (const [target, callback, client] of [
        [{ ...vm }, input.callback, profile],
        [vm, { ...input.callback }, profile],
        [vm, input.callback, { ...profile }],
      ] as const)
        await expect(command.bindOriginalGcpObserverKeyScanCommand(target, callback, client)).rejects.toThrow(
          'Original',
        );
      await command.bindOriginalGcpObserverKeyScanCommand(vm, input.callback, profile);
    } finally {
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('an original VM NIC change during capture retires the admitted key-scan command', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const profile = await clients();
    try {
      const ref = await command.bindOriginalGcpObserverKeyScanCommand(vm, input.callback, profile);
      const nics = input.vm.networkInterfaces as Array<{ accessConfigs: Array<{ natIP: string }> }>;
      nics[0].accessConfigs[0].natIP = '192.0.2.8';
      await expect(command.readOriginalGcpKeyScanCommand(ref)).rejects.toThrow();
      nics[0].accessConfigs[0].natIP = '192.0.2.7';
      await expect(command.readOriginalGcpKeyScanCommand(ref)).rejects.toThrow('retired');
    } finally {
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}, 60000);

test('retired original clients permanently retire a key-scan command', async () => {
  await withObserverInsert(async (input) => {
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const profile = await clients();
    const ref = await command.bindOriginalGcpObserverKeyScanCommand(vm, input.callback, profile);
    closeOriginalGcpSshClientProfile(profile);
    await expect(command.readOriginalGcpKeyScanCommand(ref)).rejects.toThrow('retired');
    await expect(command.readOriginalGcpKeyScanCommand(ref)).rejects.toThrow('retired');
  });
}, 60000);

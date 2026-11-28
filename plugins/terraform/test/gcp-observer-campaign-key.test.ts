/** Real campaign keys and original issuers; cloud observations remain explicit offline fixtures. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { bindOriginalGcpCampaignAccess, prepareOriginalGcpCampaignAccess } from '../src/gcp-campaign-access';
import * as key from '../src/gcp-observer-campaign-key';
import { openGcpObserverHostTrustReader } from '../src/gcp-observer-host-trust-reader';
import * as observer from '../src/gcp-observer-insert-evidence';
import * as ssh from '../src/gcp-observer-ssh-command';
import * as local from '../src/gcp-observer-ssh-local-inputs';
import * as peer from '../src/gcp-observer-ssh-peer';
import { compileOriginalGcpObserverTrustMaterial } from '../src/gcp-observer-trust-material';
import { openGcpObserverWireKeyReader } from '../src/gcp-observer-wire-key-reader';
import { closeOriginalGcpSshClientProfile, openGcpSshClientProfile } from '../src/gcp-ssh-client-profile';
import { signalFreeGcpObserverSshExecutor, signalFreeTerraformExecutor } from '../src/signal-free-executor';
import { type ObserverInsertFixtureInput, withObserverInsert } from './fixtures/observer-insert.fixture';
import { roots as inventoryRoots } from './original-gcp-inventory-fixture';

// Initial inventory, three bounded native commands, and their independent final
// capture must finish before Bun can abort the fixture or its cleanup.
const completeSshFixtureTimeout = 60000 + 3 * 60000 + 300000;

async function withCampaign(
  run: (value: {
    input: ObserverInsertFixtureInput;
    vm: observer.OriginalGcpObserverVmEvidence;
    store: CeDeploymentStore;
    publicKey: string;
  }) => Promise<void>,
) {
  let store: CeDeploymentStore | undefined,
    publicKey = '';
  await withObserverInsert(
    async (input) => {
      if (!store) throw new Error('Original campaign fixture store required');
      const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
      const vm = await observer.collectOriginalGcpObserverVmEvidence({
        identity,
        callback: input.callback,
        reader: input.cloudReader,
      });
      await run({ input, vm, store, publicKey });
    },
    undefined,
    undefined,
    async (intent, current) => {
      if (!intent.observer || !intent.initialAccess) throw new Error('Original observer SSH intent required');
      store = current;
      const request = { platformContext: intent.platformContext, sshSourceCidr: intent.observer.sshSourceCidr };
      const access = await prepareOriginalGcpCampaignAccess(current, request);
      intent.initialAccess.publicKey = access.cePublicKey;
      intent.observer.publicKey = access.observerPublicKey;
      publicKey = access.observerPublicKey;
      await bindOriginalGcpCampaignAccess(current, {
        ...request,
        ...access,
        intentSha256: fingerprint(intent).slice(7),
      });
    },
  );
}

test('observer authentication key derives from the original store, intent and actual VM metadata', async () => {
  await withCampaign(async ({ input, vm, store, publicKey }) => {
    const ref = await key.openOriginalGcpObserverCampaignKey(vm, input.callback, store);
    try {
      const original = await key.readOriginalGcpObserverCampaignKey(ref);
      expect(original.key.path).toBe(join(store.directory, 'gcp-campaign-access', 'observer_key'));
      expect(original.publicKeySha256).toBe(createHash('sha256').update(publicKey).digest('hex'));
      expect(original.instanceId).toBe(String(input.operation.targetId));
      await key.assertOriginalGcpObserverCampaignKeyContext(ref, input.callback);
      await expect(key.assertOriginalGcpObserverCampaignKeyContext(ref, { ...input.callback })).rejects.toThrow(
        'Original',
      );
      await expect(key.readOriginalGcpObserverCampaignKey({ ...ref })).rejects.toThrow('Original');
      await expect(key.openOriginalGcpObserverCampaignKey({ ...vm }, input.callback, store)).rejects.toThrow(
        'Original',
      );
      await expect(key.openOriginalGcpObserverCampaignKey(vm, { ...input.callback }, store)).rejects.toThrow(
        'Original',
      );
      await key.readOriginalGcpObserverCampaignKey(ref);
    } finally {
      key.closeOriginalGcpObserverCampaignKey(ref);
    }
  });
}, 60000);

test('original campaign key replacement retires the source without minting another key', async () => {
  await withCampaign(async ({ input, vm, store }) => {
    const ref = await key.openOriginalGcpObserverCampaignKey(vm, input.callback, store);
    const path = join(store.directory, 'gcp-campaign-access', 'observer_key'),
      bytes = await readFile(path);
    try {
      await rename(path, `${path}.original`);
      await writeFile(path, bytes, { mode: 0o400 });
      await expect(key.readOriginalGcpObserverCampaignKey(ref)).rejects.toThrow();
      await rm(path);
      await rename(`${path}.original`, path);
      await expect(key.readOriginalGcpObserverCampaignKey(ref)).rejects.toThrow('retired');
    } finally {
      key.closeOriginalGcpObserverCampaignKey(ref);
    }
  });
}, 60000);

test(
  'observer SSH probe binds the original pin/key/client and disables alternate authentication and forwarding',
  async () => {
    await withCampaign(async ({ input, vm, store }) => {
      const root = join(store.directory, 'offline-client-profile');
      await mkdir(root, { mode: 0o700 });
      await mkdir(join(root, 'bin'), { mode: 0o700 });
      const bytes = await readFile('/usr/bin/true'),
        files: Record<string, string> = {};
      for (const name of ['ssh', 'ssh-keyscan', 'ssh-keygen']) {
        await writeFile(join(root, 'bin', name), bytes, { mode: 0o500 });
        files[name] = createHash('sha256').update(bytes).digest('hex');
      }
      const profile = await openGcpSshClientProfile(root, { pins: { version: '10.6p2', files } });
      const hostKey = Buffer.concat([
        Buffer.from('0000000b7373682d6564323535313900000020', 'hex'),
        Buffer.alloc(32, 7),
      ]);
      const fp = `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`;
      const line = `192.0.2.7 ssh-ed25519 ${hostKey.toString('base64')}`;
      input.serialHook.contents = `-----BEGIN SSH HOST KEY FINGERPRINTS-----\n256 ${fp} root@fixture (ED25519)\n-----END SSH HOST KEY FINGERPRINTS-----\n`;
      const reader = await openGcpObserverWireKeyReader(vm, input.callback, profile, {
        executorFactory: async (policy) => {
          const path = join(root, 'wire.py');
          await writeFile(path, `print('${line}')\n`, { mode: 0o400 });
          const execute = signalFreeTerraformExecutor({ ...policy, executable: policy.python });
          return (invocation) => execute({ ...invocation, args: ['-I', '-B', path] });
        },
      });
      let keyRef: Awaited<ReturnType<typeof key.openOriginalGcpObserverCampaignKey>> | undefined;
      let trustReader: Awaited<ReturnType<typeof openGcpObserverHostTrustReader>> | undefined;
      let command: unknown;
      let finalInputs: Awaited<ReturnType<typeof local.openOriginalGcpObserverSshInputLease>> | undefined;
      try {
        const wire = await reader.scan(),
          serial = await observer.collectOriginalGcpObserverSerialEvidence(vm, '0');
        const material = await compileOriginalGcpObserverTrustMaterial(vm, serial, wire, input.callback);
        trustReader = await openGcpObserverHostTrustReader(material, input.callback);
        const pin = await trustReader.verify();
        keyRef = await key.openOriginalGcpObserverCampaignKey(vm, input.callback, store);
        command = await ssh.openOriginalGcpObserverSshCommand(pin, keyRef, profile, input.callback);
        const original = await ssh.readOriginalGcpObserverSshCommand(command);
        expect(original.args.slice(-2)[0]).toBe('192.0.2.7');
        expect(original.args).toContain('ubuntu');
        expect(original.args).toContain('StrictHostKeyChecking=yes');
        expect(original.args).toContain('PasswordAuthentication=no');
        expect(original.args).toContain('KbdInteractiveAuthentication=no');
        expect(original.args).toContain('IdentityAgent=none');
        expect(original.args).toContain('ForwardAgent=no');
        expect(original.args).toContain('ClearAllForwardings=yes');
        expect(original.args).toContain('ProxyCommand=none');
        expect(original.args).toContain('ControlPath=none');
        expect(original.args.at(-1)).toContain(original.challenge);
        await expect(ssh.readOriginalGcpObserverSshCommand({ ...(command as object) })).rejects.toThrow('Original');
        await expect(
          signalFreeGcpObserverSshExecutor(
            {
              python: original.python,
              executable: original.executable,
              originalStartMs: original.callback.original.budget.start,
              originalDeadlineMs: original.callback.original.budget.deadline,
              stdin: (await key.readOriginalGcpObserverCampaignKey(keyRef)).key,
              assertOriginal: async () => {},
              finalCapture: async () => {},
            },
            command,
          ),
        ).rejects.toThrow('does not accept command stdin');
        await ssh.assertOriginalGcpObserverSshCommandInputs(command);
        finalInputs = await local.openOriginalGcpObserverSshInputLease(command, input.callback);
        const connection = await peer.openGcpObserverSshPeer(command);
        for (let index = inventoryRoots.length - 1; index >= 0; index--)
          if (input.callback.original.executionDirectory.startsWith(`${inventoryRoots[index]}/`))
            inventoryRoots.splice(index, 1);
        try {
          await expect(connection.probe()).rejects.toThrow('not verified');
        } finally {
          await connection.close();
        }
        await expect(connection.probe()).rejects.toThrow('retired');
        await expect(
          peer.readOriginalVerifiedGcpObserverPeer({
            schemaVersion: 1,
            kind: 'original-verified-gcp-observer-peer-reference',
            instanceId: original.instanceId,
            challengeMatched: true,
          }),
        ).rejects.toThrow('Original');
        ssh.closeOriginalGcpObserverSshCommand(command);
        await finalInputs.assertOriginal();
        const originals = finalInputs.bindings;
        const originalKeyPath = original.args[original.args.indexOf('-i') + 1];
        const originalHostsPath = original.args
          .find((value) => value.startsWith('UserKnownHostsFile='))
          ?.slice('UserKnownHostsFile='.length);
        if (!originalKeyPath || !originalHostsPath) throw new Error('Original fixture SSH paths required');
        expect(originals.key.path).toBe(originalKeyPath);
        expect(originals.hosts.path).toBe(originalHostsPath);
        expect(Object.isFrozen(originals)).toBe(true);
        await expect(ssh.readOriginalGcpObserverSshCommand(command)).rejects.toThrow('retired');
      } finally {
        finalInputs?.close();
        if (command) ssh.closeOriginalGcpObserverSshCommand(command);
        if (keyRef) key.closeOriginalGcpObserverCampaignKey(keyRef);
        await trustReader?.close();
        await reader.close();
        closeOriginalGcpSshClientProfile(profile);
      }
    });
  },
  completeSshFixtureTimeout,
);

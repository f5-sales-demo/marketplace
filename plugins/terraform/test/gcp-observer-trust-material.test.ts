/** Genuine issuers with explicit offline cloud/client/key observations. No live trust claim. */
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openInstalledGcpCloudSerialReader } from '../src/gcp-cloud-serial-reader';
import * as trust from '../src/gcp-observer-host-trust-reader';
import * as observer from '../src/gcp-observer-insert-evidence';
import * as material from '../src/gcp-observer-trust-material';
import * as wire from '../src/gcp-observer-wire-key-reader';
import { closeOriginalGcpSshClientProfile, openGcpSshClientProfile } from '../src/gcp-ssh-client-profile';
import type { FinalReaderReserve } from '../src/reader-final-reserve';
import {
  type SignalFreeExecutionPolicy,
  signalFreeFinalReaderExecutor,
  signalFreeTerraformExecutor,
} from '../src/signal-free-executor';
import { type ObserverInsertFixtureInput, withObserverInsert } from './fixtures/observer-insert.fixture';
import { authInfo } from './original-gcp-inventory-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const key = Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, 7)]);
const fingerprint = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
const serialText = `-----BEGIN SSH HOST KEY FINGERPRINTS-----\n256 ${fingerprint} root@example (ED25519)\n-----END SSH HOST KEY FINGERPRINTS-----\n`;
const line = `192.0.2.7 ssh-ed25519 ${key.toString('base64')}`;
async function clients() {
  const root = await mkdtemp(join(tmpdir(), 'gcp-trust-material-'));
  roots.push(root);
  await mkdir(join(root, 'bin'), { mode: 0o700 });
  const bytes = await readFile('/usr/bin/true'),
    files: Record<string, string> = {};
  for (const name of ['ssh', 'ssh-keyscan', 'ssh-keygen']) {
    await writeFile(join(root, 'bin', name), bytes, { mode: 0o500 });
    files[name] = hash(bytes);
  }
  return openGcpSshClientProfile(root, { pins: { version: '10.6p2', files } });
}
async function executor(policy: SignalFreeExecutionPolicy, reserve?: FinalReaderReserve) {
  const root = await mkdtemp(join(tmpdir(), 'gcp-trust-wire-source-'));
  roots.push(root);
  const script = join(root, 'wire.py');
  await writeFile(
    script,
    `import sys\nsys.stdout.buffer.write(bytes.fromhex('${Buffer.from(`${line}\n`).toString('hex')}'))\n`,
    { mode: 0o400 },
  );
  const bound = { ...policy, executable: policy.python };
  const native = reserve ? signalFreeFinalReaderExecutor(bound, reserve) : signalFreeTerraformExecutor(bound);
  return (invocation: import('../src/runner').Invocation) => native({ ...invocation, args: ['-I', '-B', script] });
}
async function withMaterialInputs(
  run: (data: {
    vm: observer.OriginalGcpObserverVmEvidence;
    serial: unknown;
    keys: wire.OriginalGcpObserverWireKeys;
    input: ObserverInsertFixtureInput;
  }) => Promise<void>,
) {
  await withObserverInsert(async (input) => {
    input.serialHook.contents = serialText;
    const identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    const vm = await observer.collectOriginalGcpObserverVmEvidence({
      identity,
      callback: input.callback,
      reader: input.cloudReader,
    });
    const profile = await clients();
    const reader = await wire.openGcpObserverWireKeyReader(vm, input.callback, profile, {
      executorFactory: (policy) => executor(policy),
    });
    try {
      const keys = await reader.scan(),
        serial = await observer.collectOriginalGcpObserverSerialEvidence(vm, '0');
      await run({ vm, serial, keys, input });
    } finally {
      await reader.close();
      closeOriginalGcpSshClientProfile(profile);
    }
  });
}

test('original trust material derives exact serial bytes, wire keys and context from the same original VM', async () => {
  await withMaterialInputs(async ({ vm, serial, keys, input }) => {
    const reference = await material.compileOriginalGcpObserverTrustMaterial(vm, serial, keys, input.callback);
    const result = await material.readOriginalGcpObserverTrustMaterial(reference);
    expect(result.serial.toString()).toBe(serialText);
    expect(result.wire.toString()).toBe(`${line}\n`);
    expect(result.expected.instanceId).toBe(String(input.operation.targetId));
    expect(result.expected.address).toBe('192.0.2.7');
    expect(result.expected.campaign).toBe(input.callback.original.owner.deploymentId);
    expect(result.receipt.sha256).toBe(hash(Buffer.from(serialText)));
    expect(result.receipt.retainedBytes).toBe(Buffer.byteLength(serialText));
    expect(result.receipt.startedAtEpoch).toBeLessThanOrEqual(result.receipt.finishedAtEpoch);
    expect(result.parserQualified).toBe(false);
    result.serial.fill(0);
    result.wire.fill(0);
    const reread = await material.readOriginalGcpObserverTrustMaterial(reference);
    expect(reread.serial.toString()).toBe(serialText);
    expect(reread.wire.toString()).toBe(`${line}\n`);
    await expect(material.readOriginalGcpObserverTrustMaterial({ ...reference })).rejects.toThrow('Original');
  });
}, 60000);

test('original consumer runs the real owned parser and issues a source-bound host pin without a live access claim', async () => {
  await withMaterialInputs(async ({ vm, serial, keys, input }) => {
    const original = await material.compileOriginalGcpObserverTrustMaterial(vm, serial, keys, input.callback);
    const reader = await trust.openGcpObserverHostTrustReader(original, input.callback);
    try {
      const reference = await reader.verify();
      const result = await trust.readOriginalGcpObserverHostTrust(reference);
      expect(result.fingerprint).toBe(fingerprint);
      expect(result.instanceId).toBe(String(input.operation.targetId));
      expect(result.address).toBe('192.0.2.7');
      expect(result.serialWireMatched).toBe(true);
      expect(result.liveAccessVerified).toBe(false);
      expect(result.originalDeadlineMs).toBe(input.callback.original.budget.deadline);
      await trust.assertOriginalGcpObserverHostTrustContext(reference, input.callback);
      await expect(trust.assertOriginalGcpObserverHostTrustContext(reference, { ...input.callback })).rejects.toThrow(
        'Original',
      );
      expect((await readFile(result.knownHosts.path)).toString()).toBe(`${line}\n`);
      await expect(trust.readOriginalGcpObserverHostTrust({ ...reference })).rejects.toThrow('Original');
      await expect(reader.verify()).rejects.toThrow('single');
      await reader.close();
      await reader.close();
      await expect(trust.readOriginalGcpObserverHostTrust(reference)).rejects.toThrow('retired');
    } finally {
      await reader.close();
    }
  });
}, 60000);

test('the real consumer refuses original serial bytes whose host fingerprint differs from the wire source', async () => {
  await withMaterialInputs(async ({ vm, keys, input }) => {
    input.serialHook.contents = serialText.replace(
      fingerprint,
      `SHA256:${Buffer.alloc(32, 1).toString('base64').replace(/=+$/, '')}`,
    );
    const serial = await observer.collectOriginalGcpObserverSerialEvidence(vm, '0');
    const original = await material.compileOriginalGcpObserverTrustMaterial(vm, serial, keys, input.callback);
    const reader = await trust.openGcpObserverHostTrustReader(original, input.callback);
    try {
      await expect(reader.verify()).rejects.toThrow('verification failed');
    } finally {
      await reader.close();
    }
  });
}, 60000);

test('caller-created serial or VM receipts, wire copies and callback copies cannot authenticate material', async () => {
  await withMaterialInputs(async ({ vm, serial, keys, input }) => {
    for (const [node, capture, host, callback] of [
      [{ ...vm }, serial, keys, input.callback],
      [vm, { ...(serial as object) }, keys, input.callback],
      [vm, serial, { ...keys }, input.callback],
      [vm, serial, keys, { ...input.callback }],
    ] as const)
      await expect(material.compileOriginalGcpObserverTrustMaterial(node, capture, host, callback)).rejects.toThrow(
        'Original',
      );
    await material.compileOriginalGcpObserverTrustMaterial(vm, serial, keys, input.callback);
  });
}, 60000);

test('trust material cannot borrow a serial packet captured outside the original VM issuer', async () => {
  await withMaterialInputs(async ({ vm, serial, keys, input }) => {
    const current = await input.cloudReader.instance(
      String(input.operation.zone).split('/').at(-1) as string,
      String(input.vm.name),
    );
    if (!current.present) throw new Error('Original fixture VM missing');
    const foreign = await input.cloudReader.serial(current, '0');
    await expect(material.compileOriginalGcpObserverTrustMaterial(vm, foreign, keys, input.callback)).rejects.toThrow(
      'Original',
    );
    await material.compileOriginalGcpObserverTrustMaterial(vm, serial, keys, input.callback);
  });
}, 60000);

test('retained host-key replacement permanently retires the issued pin without restarting its parser', async () => {
  await withMaterialInputs(async ({ vm, serial, keys, input }) => {
    const original = await material.compileOriginalGcpObserverTrustMaterial(vm, serial, keys, input.callback);
    const reader = await trust.openGcpObserverHostTrustReader(original, input.callback);
    try {
      const reference = await reader.verify();
      const value = await trust.readOriginalGcpObserverHostTrust(reference);
      const path = value.knownHosts.path,
        bytes = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, bytes, { mode: 0o400 });
      await expect(trust.readOriginalGcpObserverHostTrust(reference)).rejects.toThrow();
      await rm(path);
      await rename(`${path}.original`, path);
      await expect(trust.readOriginalGcpObserverHostTrust(reference)).rejects.toThrow('retired');
      await expect(reader.verify()).rejects.toThrow('retired');
    } finally {
      await reader.close();
    }
  });
}, 60000);

test('real original host verification retains the actual final callback and parent reserve', async () => {
  let saved: ObserverInsertFixtureInput | undefined, identity: observer.OriginalGcpObserverInsertIdentity | undefined;
  await withObserverInsert(
    async (input) => {
      saved = input;
      identity = await observer.collectOriginalGcpObserverInsertIdentity(input);
    },
    undefined,
    async (callback) => {
      if (!saved || !identity || !callback.reserve) throw new Error('Original final fixture required');
      const source = saved;
      const cloud = await openInstalledGcpCloudSerialReader(
        callback.original,
        undefined,
        (async (url: string | URL | Request) => {
          const path = new URL(String(url)).pathname;
          if (path === '/token')
            return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
          if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
          if (path === '/v1/projects/example-project')
            return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
          if (path.includes('/operations/')) return Response.json(source.operation);
          if (path.includes('/disks/')) return Response.json(source.disk);
          if (path.includes('/serialPort'))
            return Response.json({ start: '0', next: String(Buffer.byteLength(serialText)), contents: serialText });
          return Response.json(source.vm);
        }) as typeof fetch,
        { admission: callback.execution, reserve: callback.reserve },
      );
      const profile = await clients();
      let wireReader: Awaited<ReturnType<typeof wire.openGcpObserverWireKeyReader>> | undefined;
      let reader: Awaited<ReturnType<typeof trust.openGcpObserverHostTrustReader>> | undefined;
      try {
        const vm = await observer.collectOriginalGcpObserverVmEvidence({ identity, callback, reader: cloud });
        wireReader = await wire.openGcpObserverWireKeyReader(vm, callback, profile, {
          executorFactory: (policy) => executor(policy, callback.reserve),
        });
        const keys = await wireReader.scan(),
          serial = await observer.collectOriginalGcpObserverSerialEvidence(vm, '0');
        const original = await material.compileOriginalGcpObserverTrustMaterial(vm, serial, keys, callback);
        reader = await trust.openGcpObserverHostTrustReader(original, callback);
        const reference = await reader.verify();
        const result = await trust.readOriginalGcpObserverHostTrust(reference);
        expect(result.originalDeadlineMs).toBe(callback.original.budget.deadline);
        expect(result.finalStartedMs).toBe(callback.reserve.finalStartedMs);
        expect(result.finalDeadlineMs).toBe(callback.reserve.finalDeadlineMs);
        expect(result.fingerprint).toBe(fingerprint);
        expect(result.liveAccessVerified).toBe(false);
      } finally {
        await reader?.close();
        await wireReader?.close();
        closeOriginalGcpSshClientProfile(profile);
        await cloud.close();
      }
    },
  );
}, 120000);

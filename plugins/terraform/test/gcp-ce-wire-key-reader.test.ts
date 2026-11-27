/** Offline consistency fixtures; positive packets never issue native provenance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as scan from '../src/gcp-ce-wire-key-reader';
import pins from '../src/gcp-ssh-client-pins.json';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const field = (raw: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(raw.length);
  return Buffer.concat([length, raw]);
};
const wire = Buffer.concat([
  field(Buffer.from('ssh-rsa')),
  field(Buffer.from([1, 0, 1])),
  field(Buffer.concat([Buffer.from([0]), Buffer.alloc(384, 0x81)])),
]);
const request = {
  schemaVersion: 1,
  kind: 'original-observer-ce-keyscan',
  nonce: 'a'.repeat(64),
  observerInstanceId: '123456',
  abiNonce: 'b'.repeat(64),
  abiReceiptSha256: 'c'.repeat(64),
  uid: 1000,
  bootId: '11111111-2222-3333-4444-555555555555',
  pythonPath: '/usr/bin/python3.12',
  pythonSha256: 'd'.repeat(64),
  archiveSha256: pins.archiveSha256,
  guestDeadlineMs: 9000,
  targetInstanceId: '789012',
  targetAddress: '192.0.2.1',
  project: 'example-project',
  zone: 'us-central1-a',
  nodeName: 'example-ce',
  network: 'projects/example-project/global/networks/example-sli',
  subnet: 'projects/example-project/regions/us-central1/subnetworks/example-sli',
};
const packet = () => {
  const { guestDeadlineMs, ...scope } = request;
  const stdout = Buffer.from(`192.0.2.1 ssh-rsa ${wire.toString('base64')}\n`);
  return {
    ...scope,
    kind: 'original-observer-ce-keyscan-proof',
    interfaceIndex: 1,
    role: 'sli',
    startedMs: 1000,
    finishedMs: 3000,
    originalDeadlineMs: guestDeadlineMs,
    sshTrustQualified: false,
    guestAccessQualified: false,
    process: {
      client: 'ssh-keyscan',
      args: ['-q', '-T', '15', '-t', 'rsa', '-p', '22', '192.0.2.1'],
      pid: 100,
      identity: {
        pid: 100,
        group: 100,
        start: '200',
        bootId: request.bootId,
        uid: request.uid,
        pythonPath: request.pythonPath,
        pythonSha256: request.pythonSha256,
        clientFd: 5,
        clientSha256: pins.files['ssh-keyscan'].sha256,
        clientSeals: 15,
        clientBytes: 2463464,
        clientDev: '1',
        clientIno: '1000',
      },
      executableSha256: pins.files['ssh-keyscan'].sha256,
      stdoutSha256: hash(stdout),
      stderrSha256: hash(Buffer.alloc(0)),
      stdoutBase64: stdout.toString('base64'),
      stderrBase64: '',
      exitCode: 0,
      originalDeadlineMs: guestDeadlineMs,
      startedMs: 1500,
      finishedMs: 2000,
      originalGroupClosed: true,
      signalsSent: false,
    },
  };
};
const raw = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);

test('exact ABI, CE SLI, sealed process and retained wire bytes join as untrusted evidence', () => {
  const view = scan.inspectGcpCeKeyScan(raw(packet()), request);
  expect(view.instanceId).toBe(request.targetInstanceId);
  expect(view.observerInstanceId).toBe(request.observerInstanceId);
  expect(view.address).toBe(request.targetAddress);
  expect(view.knownHostsLine).toBe(`192.0.2.1 ssh-rsa ${wire.toString('base64')}`);
  expect(view.fingerprint).toBe(`SHA256:${createHash('sha256').update(wire).digest('base64').replace(/=+$/, '')}`);
  expect(view.sshTrustQualified).toBe(false);
  expect(view.guestAccessQualified).toBe(false);
  expect(view.hostKeyAlgorithms).toEqual(['rsa-sha2-512', 'rsa-sha2-256']);
  expect(Object.isFrozen(view)).toBe(true);
  expect(Object.isFrozen(view.process.identity)).toBe(true);
});
test('foreign identities, ABI, network, claims and operation clocks refuse', () => {
  const renewed = { ...request, schemaVersion: 2 };
  const renewedPacket = { ...packet(), schemaVersion: 2 };
  const renewedView = scan.inspectGcpCeKeyScan(raw(renewedPacket), renewed);
  expect(renewedView.abiSchemaVersion).toBe(2);
  expect(renewedView.guestAccessQualified).toBe(false);
  expect(() => scan.inspectGcpCeKeyScan(raw(renewedPacket), request)).toThrow();
  expect(() => scan.inspectGcpCeKeyScan(raw(packet()), renewed)).toThrow();
  expect(() =>
    scan.inspectGcpCeKeyScan(raw({ ...renewedPacket, schemaVersion: 3 }), { ...renewed, schemaVersion: 3 }),
  ).toThrow();
  for (const change of [
    { observerInstanceId: '789012' },
    { targetInstanceId: '123456' },
    { nonce: 'foreign' },
    { abiNonce: 'foreign' },
    { abiReceiptSha256: '0'.repeat(64) },
    { uid: true },
    { bootId: 'foreign' },
    { pythonSha256: '0'.repeat(64) },
    { archiveSha256: '0'.repeat(64) },
    { targetAddress: '192.0.2.2' },
    { network: 'foreign' },
    { subnet: 'foreign' },
    { interfaceIndex: 0 },
    { role: 'slo' },
    { sshTrustQualified: true },
    { guestAccessQualified: true },
    { startedMs: true },
    { finishedMs: 9000 },
    { startedMs: 4000 },
    { originalDeadlineMs: 10000 },
    { schemaVersion: true },
    { extra: true },
  ])
    expect(() => scan.inspectGcpCeKeyScan(raw({ ...packet(), ...change }), request)).toThrow();
});
test('unclosed, foreign, injected, malformed or truncated original child output refuses', () => {
  for (const change of [
    { client: 'ssh' },
    { args: ['-q', '192.0.2.1; foreign'] },
    { pid: true },
    { exitCode: 1 },
    { executableSha256: '0'.repeat(64) },
    { stdoutBase64: 'bad!' },
    { stdoutSha256: '0'.repeat(64) },
    { stderrBase64: 'bad!' },
    { originalGroupClosed: false },
    { signalsSent: true },
    { startedMs: 0 },
    { finishedMs: 4000 },
    { originalDeadlineMs: 10000 },
  ]) {
    const value = packet();
    Object.assign(value.process, change);
    expect(() => scan.inspectGcpCeKeyScan(raw(value), request)).toThrow();
  }
  for (const change of [
    { pid: 999 },
    { group: 999 },
    { start: '../foreign' },
    { uid: true },
    { bootId: 'foreign' },
    { pythonSha256: '0'.repeat(64) },
    { clientFd: 0 },
    { clientSeals: 0 },
    { clientBytes: 0 },
    { clientSha256: '0'.repeat(64) },
    { clientIno: 'foreign' },
  ]) {
    const value = packet();
    Object.assign(value.process.identity, change);
    expect(() => scan.inspectGcpCeKeyScan(raw(value), request)).toThrow();
  }
  for (const text of [
    '',
    '192.0.2.1 ssh-rsa incomplete\n',
    `192.0.2.2 ssh-rsa ${wire.toString('base64')}\n`,
    `192.0.2.1 ssh-rsa ${wire.toString('base64')}`,
    `192.0.2.1 ssh-rsa ${wire.toString('base64')}\n192.0.2.1 ssh-rsa ${wire.toString('base64')}\n`,
  ]) {
    const value = packet();
    value.process.stdoutBase64 = Buffer.from(text).toString('base64');
    value.process.stdoutSha256 = hash(Buffer.from(text));
    expect(() => scan.inspectGcpCeKeyScan(raw(value), request)).toThrow();
  }
});
test('copied proofs, duplicate fields and extra packets cannot enter the native issuer', async () => {
  const fake = { schemaVersion: 1, kind: 'original-gcp-ce-wire-key-reference' };
  await expect(scan.readOriginalGcpCeWireKeys(fake)).rejects.toThrow('Original');
  await expect(scan.assertOriginalGcpCeWireKeysContext(fake, {} as never, {} as never)).rejects.toThrow('Original');
  await expect(
    scan.openGcpCeWireKeyReader({ schemaVersion: 1, kind: 'original-gcp-ce-keyscan-command-reference' }),
  ).rejects.toThrow('Original');
  expect(() =>
    scan.inspectGcpCeKeyScan(
      Buffer.from(raw(packet()).toString().replace('"clientSeals":15', '"clientSeals":15,"clientSeals":15')),
      request,
    ),
  ).toThrow();
  expect(() => scan.inspectGcpCeKeyScan(Buffer.concat([raw(packet()), raw(packet())]), request)).toThrow();
  expect(() => scan.inspectGcpCeKeyScan(Buffer.alloc(65537), request)).toThrow();
});

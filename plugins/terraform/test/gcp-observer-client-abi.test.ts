/** Consistency packets are offline fixtures and can never mint native provenance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as abi from '../src/gcp-observer-client-abi';
import pins from '../src/gcp-ssh-client-pins.json';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const request = {
  schemaVersion: 1,
  kind: 'original-observer-client-abi',
  instanceId: '123456',
  nonce: 'a'.repeat(64),
  deliveryNonce: 'e'.repeat(64),
  deliveryReceiptSha256: 'f'.repeat(64),
  deliveryFinishedMs: 1000,
  uid: 1000,
  bootId: '11111111-2222-3333-4444-555555555555',
  pythonPath: '/usr/bin/python3.12',
  pythonSha256: 'b'.repeat(64),
  archiveSha256: pins.archiveSha256,
  guestDeadlineMs: 9000,
};
const commands = [
  { client: 'ssh', args: ['-V'], code: 0, stderr: 'OpenSSH_10.6p2, OpenSSL fixture\n' },
  { client: 'ssh-keyscan', args: [], code: 1, stderr: 'usage: ssh-keyscan [fixture]\n' },
  { client: 'ssh-keygen', args: ['-l', '-f', '/dev/null'], code: 255, stderr: '/dev/null is not a public key file.\n' },
] as const;
const packet = () => ({
  schemaVersion: 1,
  kind: 'original-observer-client-abi-proof',
  instanceId: request.instanceId,
  nonce: request.nonce,
  deliveryNonce: request.deliveryNonce,
  deliveryReceiptSha256: request.deliveryReceiptSha256,
  deliveryFinishedMs: request.deliveryFinishedMs,
  uid: request.uid,
  bootId: request.bootId,
  pythonPath: request.pythonPath,
  pythonSha256: request.pythonSha256,
  archiveSha256: request.archiveSha256,
  originalDeadlineMs: request.guestDeadlineMs,
  clientRoot: '/home/ubuntu/.local/share/xcsh/gcp-observer-clients/123456',
  startedMs: 1500,
  finishedMs: 8000,
  processes: commands.map((command, index) => ({
    client: command.client,
    args: [...command.args],
    pid: 100 + index,
    exitCode: command.code,
    executableSha256: pins.files[command.client].sha256,
    stdoutSha256: hash(Buffer.alloc(0)),
    stderrSha256: hash(Buffer.from(command.stderr)),
    stdoutBase64: '',
    stderrBase64: Buffer.from(command.stderr).toString('base64'),
    originalDeadlineMs: request.guestDeadlineMs,
    originalGroupClosed: true,
    startedMs: 2000 + index * 1000,
    finishedMs: 2500 + index * 1000,
    signalsSent: false,
    identity: {
      pid: 100 + index,
      group: 100 + index,
      start: String(200 + index),
      bootId: request.bootId,
      uid: request.uid,
      pythonPath: request.pythonPath,
      pythonSha256: request.pythonSha256,
      clientFd: 5,
      clientSeals: 15,
      clientSha256: pins.files[command.client].sha256,
      clientBytes: 500000,
      clientDev: '1',
      clientIno: String(1000 + index),
    },
  })),
  abiVerified: true,
  guestClientQualified: false,
});
const raw = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);
test('exact delivery, guest clock, three serial original processes and content join without granting provenance', () => {
  const view = abi.inspectGcpObserverClientAbi(raw(packet()), request);
  expect(view.abiVerified).toBe(true);
  expect(view.guestClientQualified).toBe(false);
  expect(view.processes.map((row) => row.client)).toEqual(['ssh', 'ssh-keyscan', 'ssh-keygen']);
  expect(view.receiptSha256).toBe(hash(raw(packet())));
  expect(Object.isFrozen(view)).toBe(true);
  expect(Object.isFrozen(view.processes)).toBe(true);
  expect(Object.isFrozen(view.processes[0].identity)).toBe(true);
  expect(Object.isFrozen(view.processes[0].args)).toBe(true);
});
test('foreign delivery, clocks, content, executable identity and interrupted closure cannot qualify', () => {
  for (const change of [
    { nonce: 'foreign' },
    { deliveryNonce: 'foreign' },
    { deliveryReceiptSha256: '0'.repeat(64) },
    { deliveryFinishedMs: 1001 },
    { startedMs: 999 },
    { finishedMs: 9000 },
    { finishedMs: true },
    { uid: true },
    { bootId: 'foreign' },
    { pythonSha256: '0'.repeat(64) },
    { clientRoot: '/tmp/foreign' },
    { abiVerified: false },
    { guestClientQualified: true },
    { processes: packet().processes.slice(0, 2) },
  ])
    expect(() => abi.inspectGcpObserverClientAbi(raw({ ...packet(), ...change }), request)).toThrow();
  for (const change of [
    { args: ['-V; foreign'] },
    { pid: true },
    { exitCode: 255 },
    { executableSha256: '0'.repeat(64) },
    { stderrBase64: 'bad!' },
    { stderrSha256: '0'.repeat(64) },
    { stdoutBase64: Buffer.from('foreign').toString('base64') },
    { originalGroupClosed: false },
    { signalsSent: true },
    { startedMs: 5000 },
    { originalDeadlineMs: 10000 },
  ]) {
    const value = packet();
    Object.assign(value.processes[0], change);
    expect(() => abi.inspectGcpObserverClientAbi(raw(value), request)).toThrow();
  }
  for (const change of [
    { pid: 999 },
    { group: 999 },
    { start: '../foreign' },
    { uid: true },
    { bootId: 'foreign' },
    { clientFd: 0 },
    { clientSeals: 0 },
    { clientBytes: 0 },
    { clientSha256: '0'.repeat(64) },
    { clientIno: 'foreign' },
  ]) {
    const value = packet();
    Object.assign(value.processes[0].identity, change);
    expect(() => abi.inspectGcpObserverClientAbi(raw(value), request)).toThrow();
  }
  const repeated = packet();
  repeated.processes[1].pid = repeated.processes[0].pid;
  repeated.processes[1].identity.pid = repeated.processes[0].pid;
  repeated.processes[1].identity.group = repeated.processes[0].pid;
  expect(() => abi.inspectGcpObserverClientAbi(raw(repeated), request)).toThrow();
});
test('duplicate nested fields, extra output and copied receipts cannot enter the native issuer', async () => {
  const duplicate = raw(packet()).toString().replace('"clientSeals":15', '"clientSeals":15,"clientSeals":15');
  expect(() => abi.inspectGcpObserverClientAbi(Buffer.from(duplicate), request)).toThrow();
  expect(() => abi.inspectGcpObserverClientAbi(Buffer.concat([raw(packet()), raw(packet())]), request)).toThrow();
  await expect(
    abi.readOriginalGcpObserverClientAbi({ schemaVersion: 1, kind: 'original-gcp-observer-client-abi-reference' }),
  ).rejects.toThrow('Original');
  await expect(
    abi.openGcpObserverClientAbi({ schemaVersion: 1, kind: 'original-gcp-observer-client-abi-command-reference' }),
  ).rejects.toThrow('Original');
});

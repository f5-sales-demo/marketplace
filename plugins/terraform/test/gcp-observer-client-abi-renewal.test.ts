/** V2 packets are consistency fixtures and grant no original provenance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as renewal from '../src/gcp-observer-client-abi-renewal';
import pins from '../src/gcp-ssh-client-pins.json';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const request = {
  schemaVersion: 2,
  kind: 'original-observer-client-abi-renewal',
  instanceId: '123456',
  nonce: 'a'.repeat(64),
  uid: 1000,
  bootId: '11111111-2222-3333-4444-555555555555',
  pythonPath: '/usr/bin/python3.12',
  pythonSha256: 'b'.repeat(64),
  archiveSha256: pins.archiveSha256,
  installationNonce: 'e'.repeat(64),
  installationReceiptSha256: 'f'.repeat(64),
  installationFinishedMs: 1000,
  peerChallenge: 'c'.repeat(64),
  peerMonotonicMs: 400000,
  guestDeadlineMs: 460000,
};
const commands = [
  { client: 'ssh', args: ['-V'], exitCode: 0, marker: 'OpenSSH_10.6p2, fixture\n' },
  { client: 'ssh-keyscan', args: [], exitCode: 1, marker: 'usage: ssh-keyscan fixture\n' },
  {
    client: 'ssh-keygen',
    args: ['-l', '-f', '/dev/null'],
    exitCode: 255,
    marker: '/dev/null is not a public key file.\n',
  },
] as const;
function packet() {
  const { guestDeadlineMs, ...scope } = request;
  return {
    ...scope,
    kind: 'original-observer-client-abi-renewal-proof',
    clientRoot: '/home/ubuntu/.local/share/xcsh/gcp-observer-clients/123456',
    startedMs: 401000,
    finishedMs: 410000,
    originalDeadlineMs: guestDeadlineMs,
    abiVerified: true,
    guestClientQualified: false,
    installationReplayed: false,
    processes: commands.map((command, index) => ({
      client: command.client,
      args: [...command.args],
      pid: 100 + index,
      exitCode: command.exitCode,
      executableSha256: pins.files[command.client].sha256,
      stdoutBase64: '',
      stdoutSha256: hash(Buffer.alloc(0)),
      stderrBase64: Buffer.from(command.marker).toString('base64'),
      stderrSha256: hash(Buffer.from(command.marker)),
      originalDeadlineMs: guestDeadlineMs,
      startedMs: 402000 + index * 1000,
      finishedMs: 402500 + index * 1000,
      originalGroupClosed: true,
      signalsSent: false,
      identity: {
        pid: 100 + index,
        group: 100 + index,
        start: String(200 + index),
        uid: request.uid,
        bootId: request.bootId,
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
  };
}
const raw = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);
test('original installation age stays distinct from fresh peer and probe clocks', () => {
  const view = renewal.inspectGcpObserverClientAbiRenewal(raw(packet()), request);
  expect(view.installationFinishedMs).toBe(1000);
  expect(view.peerMonotonicMs).toBe(400000);
  expect(view.installationReplayed).toBe(false);
  expect(view.guestClientQualified).toBe(false);
  expect(view.processes).toHaveLength(3);
  expect(Object.isFrozen(view.processes[0].identity)).toBe(true);
});
test('foreign provenance, stale clocks, replay claims and incomplete processes refuse', () => {
  for (const change of [
    { installationReceiptSha256: '0'.repeat(64) },
    { installationNonce: 'foreign' },
    { peerChallenge: 'foreign' },
    { peerMonotonicMs: 400001 },
    { nonce: 'foreign' },
    { bootId: 'foreign' },
    { uid: true },
    { startedMs: 399999 },
    { finishedMs: 460000 },
    { originalDeadlineMs: 500000 },
    { installationReplayed: true },
    { guestClientQualified: true },
    { processes: packet().processes.slice(0, 2) },
    { extra: true },
  ])
    expect(() => renewal.inspectGcpObserverClientAbiRenewal(raw({ ...packet(), ...change }), request)).toThrow();
  for (const change of [
    { pid: true },
    { args: ['-V; foreign'] },
    { signalsSent: true },
    { originalGroupClosed: false },
    { stdoutBase64: 'bad!' },
    { executableSha256: '0'.repeat(64) },
  ]) {
    const value = packet();
    Object.assign(value.processes[0], change);
    expect(() => renewal.inspectGcpObserverClientAbiRenewal(raw(value), request)).toThrow();
  }
});
test('duplicate packets and copied source shapes cannot mint native renewal clients', async () => {
  expect(() =>
    renewal.inspectGcpObserverClientAbiRenewal(Buffer.concat([raw(packet()), raw(packet())]), request),
  ).toThrow();
  const fake = { schemaVersion: 2, kind: 'original-gcp-observer-client-abi-renewal-reference' };
  await expect(renewal.readOriginalGcpObserverClientAbiRenewal(fake)).rejects.toThrow('Original');
  await expect(
    renewal.openGcpObserverClientAbiRenewal({
      schemaVersion: 2,
      kind: 'original-gcp-observer-client-abi-renewal-command-reference',
    }),
  ).rejects.toThrow('Original');
});

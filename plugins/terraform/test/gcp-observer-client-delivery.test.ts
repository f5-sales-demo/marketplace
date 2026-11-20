/** Receiver consistency only; packets cannot mint original delivery provenance. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as delivery from '../src/gcp-observer-client-delivery';

const request = {
  instanceId: '123456',
  nonce: 'a'.repeat(64),
  uid: 1000,
  bootId: '11111111-2222-3333-4444-555555555555',
  pythonPath: '/usr/bin/python3.12',
  pythonSha256: 'b'.repeat(64),
  archiveSha256: 'c'.repeat(64),
  guestDeadlineMs: 9000,
};
const packet = () => ({
  schemaVersion: 1,
  kind: 'original-observer-installed-client-bytes',
  instanceId: request.instanceId,
  nonce: request.nonce,
  uid: request.uid,
  bootId: request.bootId,
  pythonPath: request.pythonPath,
  pythonSha256: request.pythonSha256,
  archiveSha256: request.archiveSha256,
  clientRoot: '/home/ubuntu/.local/share/xcsh/gcp-observer-clients/123456',
  startedMs: 1000,
  finishedMs: 8000,
  originalDeadlineMs: 9000,
  installedBytesVerified: true,
  abiVerified: false,
  guestClientQualified: false,
});
const raw = (value: unknown) => Buffer.from(JSON.stringify(value));
test('delivery response joins exact original request, guest identity, fixed path and deadline but leaves ABI unqualified', () => {
  const view = delivery.inspectGcpObserverClientDelivery(raw(packet()), request);
  expect(view.instanceId).toBe('123456');
  expect(view.installedBytesVerified).toBe(true);
  expect(view.guestClientQualified).toBe(false);
  expect(view.abiVerified).toBe(false);
  expect(view.receiptSha256).toBe(createHash('sha256').update(raw(packet())).digest('hex'));
  expect(Object.isFrozen(view)).toBe(true);
});
test('foreign or incomplete receiver output cannot be used as installed client evidence', () => {
  for (const change of [
    { nonce: 'foreign' },
    { instanceId: '999999' },
    { uid: true },
    { uid: 0 },
    { bootId: 'foreign' },
    { pythonSha256: 'd'.repeat(64) },
    { archiveSha256: 'bad' },
    { clientRoot: '/tmp/foreign' },
    { startedMs: 8001 },
    { finishedMs: 9000 },
    { finishedMs: 1.5 },
    { originalDeadlineMs: 10000 },
    { installedBytesVerified: false },
    { abiVerified: true },
    { guestClientQualified: true },
  ])
    expect(() => delivery.inspectGcpObserverClientDelivery(raw({ ...packet(), ...change }), request)).toThrow();
  expect(() =>
    delivery.inspectGcpObserverClientDelivery(
      Buffer.from(raw(packet()).toString().replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')),
      request,
    ),
  ).toThrow();
});
test('invented receipts and commands cannot enter the original output-attributed delivery consumer', async () => {
  await expect(
    delivery.assertOriginalGcpObserverClientDeliveryContext(
      { schemaVersion: 1, kind: 'original-gcp-observer-client-delivery-reference' },
      {} as never,
    ),
  ).rejects.toThrow('Original');
  await expect(
    delivery.readOriginalGcpObserverClientDelivery({
      ...packet(),
      kind: 'original-gcp-observer-client-delivery-reference',
    }),
  ).rejects.toThrow('Original');
  await expect(
    delivery.openGcpObserverClientDelivery({
      schemaVersion: 1,
      kind: 'original-gcp-observer-client-delivery-command-reference',
    }),
  ).rejects.toThrow('Original');
});

/** Fixed mapping refusals; no invented peer can authorize guest delivery. */
import { expect, test } from 'bun:test';
import * as delivery from '../src/gcp-observer-client-delivery-command';

test('caller receipts and arbitrary payloads cannot prepare an observer guest delivery command', async () => {
  await expect(
    delivery.openOriginalGcpObserverClientDeliveryCommand(
      { schemaVersion: 1, kind: 'original-verified-gcp-observer-peer-reference', challengeMatched: true },
      { path: '/tmp/foreign.zip', sha256: 'a'.repeat(64) },
      {} as never,
    ),
  ).rejects.toThrow('Original verified observer');
});
test('guest deadline uses the original source clock lower bound and refuses stale/future/expired intervals', () => {
  const clock = {
    sourceStartedMs: 1000,
    sourceFinishedMs: 1100,
    guestMonotonicMs: 5000,
    guestEpochMs: 1,
    bootId: '11111111-2222-3333-4444-555555555555',
    uid: 1000,
    pythonPath: '/usr/bin/python3.12',
    pythonSha256: 'a'.repeat(64),
    offsetMinimumMs: 3900,
    offsetMaximumMs: 4000,
    guestClientQualified: false as const,
  };
  const interval = delivery.projectOriginalGcpGuestDeliveryDeadline(clock, 2000, 100000);
  expect(interval.sourceDeadlineMs).toBe(62000);
  expect(interval.guestDeadlineMs).toBe(64900);
  expect(delivery.projectOriginalGcpGuestDeliveryDeadline(clock, 2000, 3000).sourceDeadlineMs).toBe(3000);
  for (const [now, limit] of [
    [999, 100000],
    [301001, 400000],
    [2000, 1999],
  ])
    expect(() => delivery.projectOriginalGcpGuestDeliveryDeadline(clock, now, limit)).toThrow();
});

test('delivery executor refuses invented commands before acquiring any input or producer', async () => {
  const executor = await import('../src/signal-free-executor');
  await expect(
    executor.signalFreeGcpObserverClientDeliveryExecutor({} as never, {
      schemaVersion: 1,
      kind: 'original-gcp-observer-client-delivery-command-reference',
    }),
  ).rejects.toThrow('Original');
});

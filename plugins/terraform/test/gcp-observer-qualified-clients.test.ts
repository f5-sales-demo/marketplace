/** Dispatch boundaries only. Mock issuers grant no guest or GCP acceptance. */
import { expect, spyOn, test } from 'bun:test';
import * as initial from '../src/gcp-observer-client-abi';
import * as renewal from '../src/gcp-observer-client-abi-renewal';
import { assertOriginalQualifiedGcpObserverClientsContext } from '../src/gcp-observer-qualified-clients';

test('explicit client schema chooses exactly one issuer and a failed V1 authority never falls back', async () => {
  const first = spyOn(initial, 'assertOriginalGcpObserverClientAbiContext').mockRejectedValue(
    new Error('Original V1 authority retired'),
  );
  const second = spyOn(renewal, 'assertOriginalGcpObserverClientAbiRenewalContext').mockRejectedValue(
    new Error('Original V2 authority retired'),
  );
  const callback = {} as never;
  try {
    await expect(
      assertOriginalQualifiedGcpObserverClientsContext(
        { schemaVersion: 1, kind: 'original-gcp-observer-client-abi-reference' },
        callback,
      ),
    ).rejects.toThrow('V1 authority retired');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    await expect(
      assertOriginalQualifiedGcpObserverClientsContext(
        { schemaVersion: 2, kind: 'original-gcp-observer-client-abi-renewal-reference' },
        callback,
      ),
    ).rejects.toThrow('V2 authority retired');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    for (const value of [
      null,
      {},
      { schemaVersion: 1, kind: 'original-gcp-observer-client-abi-renewal-reference' },
      { schemaVersion: 2, kind: 'original-gcp-observer-client-abi-reference' },
    ])
      await expect(assertOriginalQualifiedGcpObserverClientsContext(value, callback)).rejects.toThrow('Original');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  } finally {
    first.mockRestore();
    second.mockRestore();
  }
});

test('success-shaped V1 and V2 packets cannot issue native clients or borrow a callback', async () => {
  for (const value of [
    { schemaVersion: 1, kind: 'original-gcp-observer-client-abi-reference', guestClientQualified: true },
    { schemaVersion: 2, kind: 'original-gcp-observer-client-abi-renewal-reference', guestClientQualified: true },
  ])
    await expect(assertOriginalQualifiedGcpObserverClientsContext(value, {} as never)).rejects.toThrow('Original');
});

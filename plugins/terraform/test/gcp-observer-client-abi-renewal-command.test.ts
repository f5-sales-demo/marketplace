/** Fresh peer and durable original installation are both mandatory for renewal. */
import { expect, test } from 'bun:test';
import * as command from '../src/gcp-observer-client-abi-renewal-command';
import * as native from '../src/signal-free-executor';

test('caller installation and fresh-looking peer packets cannot authorize ABI renewal', async () => {
  await expect(
    command.openOriginalGcpObserverClientAbiRenewalCommand(
      { schemaVersion: 1, kind: 'original-gcp-observer-client-installation-reference' },
      { schemaVersion: 1, kind: 'original-verified-gcp-observer-peer-reference' },
      {} as never,
    ),
  ).rejects.toThrow('Original');
});
test('copied renewal commands cannot provide byte, deadline or native execution authority', async () => {
  const fake = { schemaVersion: 2, kind: 'original-gcp-observer-client-abi-renewal-command-reference' };
  await expect(command.readOriginalGcpObserverClientAbiRenewalCommand(fake)).rejects.toThrow('Original');
  await expect(command.assertOriginalGcpObserverClientAbiRenewalInputs(fake)).rejects.toThrow('Original');
  await expect(command.checkoutOriginalGcpObserverClientAbiRenewalCommand(fake)).rejects.toThrow('Original');
  await expect(native.signalFreeGcpObserverClientAbiRenewalExecutor({} as never, fake)).rejects.toThrow('Original');
});

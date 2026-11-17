/** No caller-created delivery, callback or command can authorize guest probes. */
import { expect, test } from 'bun:test';
import * as command from '../src/gcp-observer-client-abi-command';

test('ABI command requires the exact original successful delivery and callback', async () => {
  await expect(
    command.openOriginalGcpObserverClientAbiCommand(
      { schemaVersion: 1, kind: 'original-gcp-observer-client-delivery-reference' },
      {} as never,
    ),
  ).rejects.toThrow('Original');
});
test('serialized ABI command cannot provide execution or source-input authority', async () => {
  const fake = { schemaVersion: 1, kind: 'original-gcp-observer-client-abi-command-reference' };
  await expect(command.readOriginalGcpObserverClientAbiCommand(fake)).rejects.toThrow('Original');
  await expect(command.assertOriginalGcpObserverClientAbiInputs(fake)).rejects.toThrow('Original');
  const native = await import('../src/signal-free-executor');
  await expect(native.signalFreeGcpObserverClientAbiExecutor({} as never, fake)).rejects.toThrow('Original');
});

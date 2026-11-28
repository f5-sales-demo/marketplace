/** Immutable installation provenance is separate from command authority. */
import { expect, test } from 'bun:test';
import * as delivery from '../src/gcp-observer-client-delivery';

test('serialized delivery cannot mint durable installation provenance', async () => {
  await expect(
    delivery.openOriginalGcpObserverClientInstallation({
      schemaVersion: 1,
      kind: 'original-gcp-observer-client-delivery-reference',
      installedBytesVerified: true,
    }),
  ).rejects.toThrow('Original');
});
test('serialized installation cannot provide retained inputs or callback authority', async () => {
  const fake = { schemaVersion: 1, kind: 'original-gcp-observer-client-installation-reference' };
  await expect(delivery.readOriginalGcpObserverClientInstallation(fake)).rejects.toThrow('Original');
  await expect(delivery.assertOriginalGcpObserverClientInstallationContext(fake, {} as never)).rejects.toThrow(
    'Original',
  );
  expect(() => delivery.closeOriginalGcpObserverClientInstallation(fake)).toThrow('Original');
});

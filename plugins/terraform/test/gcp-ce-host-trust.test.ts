/** Only original source capabilities may cross the CE serial/wire join. */
import { expect, test } from 'bun:test';
import * as trust from '../src/gcp-observer-host-trust-reader';
import * as material from '../src/gcp-observer-trust-material';

test('CE trust material cannot be made from packets or a borrowed observer shape', async () => {
  const callback = {} as never;
  const fake = { schemaVersion: 1, kind: 'original-gcp-observer-trust-material-reference' };
  await expect(material.readOriginalGcpCeTrustMaterial(fake)).rejects.toThrow('Original');
  await expect(material.assertOriginalGcpCeTrustMaterialContext(fake, callback)).rejects.toThrow('Original');
  await expect(
    material.compileOriginalGcpCeTrustMaterial(
      {
        schemaVersion: 1,
        kind: 'original-qualified-gcp-ce-observer-scan-context-reference',
      },
      {},
      {},
      callback,
    ),
  ).rejects.toThrow('Original');
  await expect(trust.openGcpCeHostTrustReader(fake, callback)).rejects.toThrow('Original');
});
test('copied CE pins cannot authenticate an observer or provide original CE trust', async () => {
  const fake = { schemaVersion: 1, kind: 'original-gcp-ce-host-trust-reference' };
  await expect(trust.readOriginalGcpCeHostTrust(fake)).rejects.toThrow('Original');
  await expect(trust.assertOriginalGcpCeHostTrustContext(fake, {} as never)).rejects.toThrow('Original');
  await expect(trust.readOriginalGcpObserverHostTrust(fake)).rejects.toThrow('Original');
});

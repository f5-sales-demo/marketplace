import { expect, it } from 'bun:test';
import { assertGcpRestorationSafe, assertGcpRestored, captureGcpRestoration } from '../../src/ce/restoration';

const link = 'https://www.googleapis.com/compute/v1/projects/test-project/global/networks/brownfield';
it('restores exact original networking and refuses out-of-band drift', () => {
  const item = captureGcpRestoration(
    link,
    '123',
    { routes: [{ destination: '10.0.0.0/24', nextHop: 'original' }] },
    { routes: [{ destination: '10.0.0.0/24', nextHop: 'ce' }] },
  );
  expect(() => assertGcpRestorationSafe(item, { selfLink: link, id: '123', fields: item.planned })).not.toThrow();
  expect(() =>
    assertGcpRestorationSafe(item, {
      selfLink: link,
      id: '123',
      fields: { routes: [{ destination: '10.0.0.0/24', nextHop: 'foreign' }] },
    }),
  ).toThrow('outside');
  expect(() => assertGcpRestored(item, item.original)).not.toThrow();
  expect(() => assertGcpRestored(item, item.planned)).toThrow('mismatch');
});
it('rejects identity replacement, snapshot tampering and bootstrap fields', () => {
  const item = captureGcpRestoration(link, '123', { routes: [] }, { routes: [] });
  expect(() => assertGcpRestorationSafe(item, { selfLink: link, id: '456', fields: item.original })).toThrow(
    'identity',
  );
  expect(() => captureGcpRestoration(link, '123', { metadata: { token: 'SECRET' } }, { routes: [] })).toThrow('field');
  item.original.routes = ['tampered'];
  expect(() => assertGcpRestorationSafe(item, { selfLink: link, id: '123', fields: item.planned })).toThrow(
    'integrity',
  );
});

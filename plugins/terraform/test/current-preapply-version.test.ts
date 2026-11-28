import { expect, test } from 'bun:test';
import * as preapply from '../src/gcp-preapply-bootstrap';
import { resolveInstalledGcpVersionProfile } from '../src/installed-version-profile';

test('current151712 preapply has schema8 and preserves exact source profile identity', () => {
  const current = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.2',
    providerLockSha256: '18b715851e8ea176e7b0f11c270f2f0cd2c835a30d497e7676add5156eccfccc',
  });
  expect(preapply.originalPreapplyBootstrapVersion(current)).toEqual({
    schemaVersion: 8,
    xcshProviderVersion: '15.17.12',
  });
  expect(() => preapply.originalPreapplyBootstrapVersion({ ...current })).toThrow();
});
test('historical15179 preapply retains schema7 without current-version fallback', () => {
  const old = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.2',
    providerLockSha256: '40fdb8634396951a615fe16eaeb575ce9ed0a6756bb15c4611c1c2e5fb5b8fee',
  });
  expect(preapply.originalPreapplyBootstrapVersion(old)).toEqual({ schemaVersion: 7, xcshProviderVersion: '15.17.9' });
});

import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as artifacts from '../../src/ce/terraform-public-artifacts';

test('fresh current and observer artifacts use the verified current151712 tuple', () => {
  const current = artifacts.GCP_PUBLIC_TERRAFORM_ARTIFACTS;
  expect(current.versions).toEqual({ terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.12' });
  expect(current.expectedLockSha256).toBe('sha256:18b715851e8ea176e7b0f11c270f2f0cd2c835a30d497e7676add5156eccfccc');
  expect('sha256:' + createHash('sha256').update(current.providerLock).digest('hex')).toBe(current.expectedLockSha256);
  expect(artifacts.GCP_OBSERVER_TERRAFORM_ARTIFACTS.configurationVersion).toBe(3);
  expect(artifacts.GCP_OBSERVER_TERRAFORM_ARTIFACTS.versions).toEqual(current.versions);
});

test('stored15179 artifact versions remain resolvable without a lock or engine migration', () => {
  const old = artifacts.GCP_XCSH15179_TERRAFORM_ARTIFACTS;
  expect(artifacts.resolveGcpTerraformArtifacts({ ...old })).toBe(old);
  expect(artifacts.resolveGcpTerraformArtifacts({ ...artifacts.GCP_XCSH15179_OBSERVER_ARTIFACTS }).versions.xcsh).toBe(
    '15.17.9',
  );
  expect(() => artifacts.resolveGcpTerraformArtifacts({ ...old, providerLock: old.providerLock + '\n' })).toThrow();
});

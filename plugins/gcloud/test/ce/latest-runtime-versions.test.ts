import { expect, test } from 'bun:test';
import {
  GCP_LEGACY_TERRAFORM_ARTIFACTS,
  GCP_PUBLIC_TERRAFORM_ARTIFACTS,
  resolveGcpTerraformArtifacts,
} from '../../src/ce/terraform-public-artifacts';

test('new GCP deployments select the currently verified latest stable Terraform and providers', () => {
  expect(GCP_PUBLIC_TERRAFORM_ARTIFACTS?.versions).toEqual({
    terraform: '1.17.1',
    google: '8.10.0',
    xcsh: '15.15.6',
  });
});

test('stored deployment artifacts keep their exact original versions and lock bytes', () => {
  const legacy = GCP_LEGACY_TERRAFORM_ARTIFACTS;
  expect(legacy.versions).toEqual({ terraform: '1.16.6', google: '8.7.0', xcsh: '15.13.0' });
  expect(resolveGcpTerraformArtifacts(structuredClone(legacy))).toBe(legacy);
  const latest = GCP_PUBLIC_TERRAFORM_ARTIFACTS;
  if (!latest) throw new Error('Latest GCP artifacts required');
  expect(resolveGcpTerraformArtifacts(structuredClone(latest))).toBe(latest);
  for (const changed of [
    { ...legacy, providerLock: legacy.providerLock + ' ' },
    { ...legacy, versions: { ...legacy.versions, google: '8.10.0' } },
    { ...legacy, expectedLockSha256: 'sha256:' + 'f'.repeat(64) },
  ]) {
    expect(() => resolveGcpTerraformArtifacts(changed)).toThrow();
  }
  expect(Object.isFrozen(latest.versions)).toBe(true);
  expect(Object.isFrozen(legacy.versions)).toBe(true);
});

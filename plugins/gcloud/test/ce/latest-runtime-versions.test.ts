import { expect, test } from 'bun:test';
import {
  GCP_GOOGLE810_TERRAFORM_ARTIFACTS,
  GCP_LEGACY_TERRAFORM_ARTIFACTS,
  GCP_PREVIOUS_TERRAFORM_ARTIFACTS,
  GCP_PUBLIC_TERRAFORM_ARTIFACTS,
  GCP_TERRAFORM1171_ARTIFACTS,
  resolveGcpTerraformArtifacts,
} from '../../src/ce/terraform-public-artifacts';

test('new GCP deployments select the currently verified latest stable Terraform and providers', () => {
  expect(GCP_PUBLIC_TERRAFORM_ARTIFACTS?.versions).toEqual({
    terraform: '1.17.2',
    google: '8.11.0',
    xcsh: '15.15.7',
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
    { ...legacy, providerLock: `${legacy.providerLock} ` },
    { ...legacy, versions: { ...legacy.versions, google: '8.10.0' } },
    { ...legacy, expectedLockSha256: `sha256:${'f'.repeat(64)}` },
  ]) {
    expect(() => resolveGcpTerraformArtifacts(changed)).toThrow();
  }
  expect(Object.isFrozen(latest.versions)).toBe(true);
  expect(Object.isFrozen(legacy.versions)).toBe(true);
});

test('prior current profile retains its original versions and lock bytes after a provider patch', () => {
  const prior = GCP_PREVIOUS_TERRAFORM_ARTIFACTS;
  if (!prior) throw new Error('Previous GCP artifacts required');
  expect(prior.versions).toEqual({ terraform: '1.17.1', google: '8.10.0', xcsh: '15.15.6' });
  expect(prior.expectedLockSha256).toBe('sha256:2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034');
  expect(resolveGcpTerraformArtifacts(structuredClone(prior))).toBe(prior);
  expect(prior).not.toBe(GCP_PUBLIC_TERRAFORM_ARTIFACTS);
});

test('Google8.10 stored profile remains byte-identical after the new default', () => {
  const previous = GCP_GOOGLE810_TERRAFORM_ARTIFACTS;
  if (!previous) throw new Error('Original Google8.10 profile required');
  expect(previous.versions).toEqual({ terraform: '1.17.1', google: '8.10.0', xcsh: '15.15.7' });
  expect(previous.expectedLockSha256).toBe('sha256:fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0');
  expect(resolveGcpTerraformArtifacts(structuredClone(previous))).toBe(previous);
  expect(previous).not.toBe(GCP_PUBLIC_TERRAFORM_ARTIFACTS);
});

test('Terraform1.17.1 stored profile retains its exact lock and versions after the executable upgrade', () => {
  const previous = GCP_TERRAFORM1171_ARTIFACTS;
  const current = GCP_PUBLIC_TERRAFORM_ARTIFACTS;
  if (!previous || !current) throw new Error('Original and current GCP profiles required');
  expect(previous.versions).toEqual({ terraform: '1.17.1', google: '8.11.0', xcsh: '15.15.7' });
  expect(previous.providerLock).toBe(current.providerLock);
  expect(resolveGcpTerraformArtifacts(structuredClone(previous))).toBe(previous);
  expect(previous).not.toBe(current);
});

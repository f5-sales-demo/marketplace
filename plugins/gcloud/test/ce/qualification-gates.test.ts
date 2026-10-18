import { expect, it } from 'bun:test';
import { assertGcpLaunchGates, type GcpQualificationGates } from '../../src/ce/qualification-gates';

const hash = `sha256:${'a'.repeat(64)}`;
const gates: GcpQualificationGates = {
  schemaVersion: 1,
  project: 'test-project',
  region: 'northamerica-northeast1',
  engine: 'native',
  approvalPlanHash: hash,
  apiContract: { publication: 'immutable-release', gcpMapping: 'available', sha256: hash },
  policy: { identity: 'f5xc-ce-automation-policy/v2', sha256: hash, verified: true },
  sharedRuntime: true,
  exactImageVerified: true,
  legalAcceptance: 'not-required',
  iamVerified: true,
  quotaVerified: true,
  organizationPolicyVerified: true,
  providerLocksVerified: false,
};
it('approval does not override unpublished mappings or unverified policy', () => {
  expect(() =>
    assertGcpLaunchGates({ ...gates, apiContract: { ...gates.apiContract, publication: 'candidate' } }, hash),
  ).toThrow('Immutable');
  expect(() => assertGcpLaunchGates({ ...gates, policy: { ...gates.policy, verified: false } }, hash)).toThrow(
    'policy',
  );
  expect(() => assertGcpLaunchGates(gates, hash)).not.toThrow();
});
it('rejects reviewed plan drift, unknown legal acceptance and missing Terraform locks', () => {
  expect(() => assertGcpLaunchGates(gates, `sha256:${'b'.repeat(64)}`)).toThrow('Reviewed');
  expect(() => assertGcpLaunchGates({ ...gates, legalAcceptance: 'unknown' }, hash)).toThrow('prerequisites');
  expect(() => assertGcpLaunchGates({ ...gates, engine: 'terraform' }, hash)).toThrow('locks');
});

import { expect, it } from 'bun:test';
import { GCP_CE_API_RELEASE, type GcpCeContractBoundary } from '../../src/ce/contract';
import { assertGcpTeardownProfile } from '../../src/ce/deployment-teardown';
import { fingerprint } from '../../src/ce/discovery';
import {
  assertGcpTerraformHaProfile,
  type GcpTerraformHaProfile,
  gcpDeploymentLifecycleFingerprint,
  qualifiedGcpTerraformHaProfile,
} from '../../src/ce/terraform-ha-profile';
import { intent } from './fixtures';
import { operationalFixture } from './operational-health.test';

export function terraformHaProfileFixture() {
  const i = structuredClone(intent()),
    f = operationalFixture();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  i.machineType = 'n2-standard-8';
  i.diskGiB = 80;
  i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...structuredClone(i.sites[0].nodes[0]),
    name: `node-${suffix}`,
    zone: `northamerica-northeast1-${suffix}`,
  }));
  const contractFingerprint = fingerprint(f.profile);
  const profile: GcpTerraformHaProfile = {
    schemaVersion: 2,
    scope: 'original-three-node-terraform-ha',
    region: 'northamerica-northeast1',
    zones: ['northamerica-northeast1-a', 'northamerica-northeast1-b', 'northamerica-northeast1-c'],
    machineType: 'n2-standard-8',
    diskGiB: 80,
    imageIdentitySha256: fingerprint(i.image),
    versions: { terraform: '1.16.6', google: '8.7.0', xcsh: '15.13.0' },
    providerLockSha256: fingerprint({ lock: true }),
    operationalContractFingerprint: contractFingerprint,
    lifecycleEvidenceSha256: fingerprint({ lifecycle: true }),
  };
  const qualification = {
    schemaVersion: 2 as const,
    contractFingerprint,
    bindingFingerprint: fingerprint(f.binding),
    healthyRoundFingerprints: [fingerprint({ round: 1 }), fingerprint({ round: 2 })] as [string, string],
    evidenceSha256: fingerprint({ evidence: true }),
    campaignCleanupSha256: fingerprint({ cleanup: true }),
    objectsAbsent: 18 as const,
    emptyDestroy: true as const,
    stableState: true as const,
    repeatedResumeNoSubmission: true as const,
    terraformHaLifecycle: profile,
  };
  const boundary: GcpCeContractBoundary = {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint({ api: true }),
    availability: 'unavailable',
    reason: 'gcp_provider_requires_consumer_qualification',
    singleNodeLifecycle: { availability: 'evidence_backed_single_node' },
    terraformHaLifecycle: profile,
    operationalHealthContract: {
      profile: f.profile,
      contractFingerprint,
      qualification,
      qualificationFingerprint: fingerprint(qualification),
    },
    operationalHealthExpected: { contractFingerprint, qualificationFingerprint: fingerprint(qualification) },
  };
  return { i, profile, boundary };
}
it('admits only the exact qualified Terraform HA scope while retaining native HA refusal', () => {
  const f = terraformHaProfileFixture();
  expect(() => assertGcpTeardownProfile(f.i, f.boundary, 'terraform')).not.toThrow();
  expect(() => assertGcpTerraformHaProfile(f.i, f.boundary, true)).not.toThrow();
  expect(() => assertGcpTeardownProfile({ ...f.i, engine: 'native' }, f.boundary)).toThrow();
  for (const change of [
    (g: typeof f) => {
      g.i.diskGiB = 81;
    },
    (g: typeof f) => {
      g.i.sites[0].nodes[1].zone = g.i.sites[0].nodes[0].zone;
    },
    (g: typeof f) => {
      g.i.image.id = 'replacement';
    },
    (g: typeof f) => {
      g.i.sites[0].nodes[1].interfaces[1].role = 'management';
    },
    (g: typeof f) => {
      g.boundary.terraformHaLifecycle = undefined;
    },
    (g: typeof f) => {
      g.profile.operationalContractFingerprint = fingerprint({ changed: true });
    },
  ]) {
    const g = terraformHaProfileFixture();
    change(g);
    expect(() => assertGcpTerraformHaProfile(g.i, g.boundary, true)).toThrow();
  }
});
it('keeps owned cleanup available without live health collection while refusing new deployment', () => {
  const f = terraformHaProfileFixture();
  f.boundary.operationalHealthContract = undefined;
  expect(() => assertGcpTeardownProfile(f.i, f.boundary, 'terraform')).not.toThrow();
  expect(() => assertGcpTerraformHaProfile(f.i, f.boundary, true)).toThrow();
});
it('binds lifecycle and qualification drift and rejects malformed or sensitive profile extensions', () => {
  const f = terraformHaProfileFixture(),
    before = gcpDeploymentLifecycleFingerprint(f.i, f.boundary);
  f.boundary.operationalHealthContract!.qualificationFingerprint = fingerprint({ changed: true });
  expect(gcpDeploymentLifecycleFingerprint(f.i, f.boundary)).not.toBe(before);
  expect(() => assertGcpTerraformHaProfile(f.i, f.boundary, true)).toThrow();
  expect(qualifiedGcpTerraformHaProfile({})).toBe(false);
  expect(qualifiedGcpTerraformHaProfile({ ...f.profile, credential: 'sensitive' })).toBe(false);
  expect(qualifiedGcpTerraformHaProfile({ ...f.profile, versions: { ...f.profile.versions, google: '8.8.0' } })).toBe(
    false,
  );
});

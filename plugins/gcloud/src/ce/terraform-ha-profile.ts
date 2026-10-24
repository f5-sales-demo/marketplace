import type { GcpCeContractBoundary } from './contract';
import { fingerprint } from './discovery';
import { qualifiedOperationalRelease } from './operational-health';
import { assertGcpSiteAccessProfile, gcpSiteAccessFingerprint } from './site-access';
import type { GcpCeIntent } from './types';

/** Sanitized lifecycle scope published with the independently qualified health receipt. */
export interface GcpTerraformHaProfile {
  schemaVersion: 2;
  scope: 'original-three-node-terraform-ha';
  region: 'northamerica-northeast1';
  zones: ['northamerica-northeast1-a', 'northamerica-northeast1-b', 'northamerica-northeast1-c'];
  machineType: 'n2-standard-8';
  diskGiB: 80;
  imageIdentitySha256: string;
  versions: { terraform: '1.16.6'; google: '8.7.0'; xcsh: '15.13.0' };
  providerLockSha256: string;
  operationalContractFingerprint: string;
  lifecycleEvidenceSha256: string;
}
const hash = (v: unknown) => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
export function qualifiedGcpTerraformHaProfile(value: unknown): value is GcpTerraformHaProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as GcpTerraformHaProfile;
  return (
    Object.keys(p).sort().join(',') ===
      'diskGiB,imageIdentitySha256,lifecycleEvidenceSha256,machineType,operationalContractFingerprint,providerLockSha256,region,schemaVersion,scope,versions,zones' &&
    Array.isArray(p.zones) &&
    !!p.versions &&
    typeof p.versions === 'object' &&
    p.schemaVersion === 2 &&
    p.scope === 'original-three-node-terraform-ha' &&
    p.region === 'northamerica-northeast1' &&
    fingerprint(p.zones) ===
      fingerprint(['northamerica-northeast1-a', 'northamerica-northeast1-b', 'northamerica-northeast1-c']) &&
    p.machineType === 'n2-standard-8' &&
    p.diskGiB === 80 &&
    fingerprint(p.versions) === fingerprint({ terraform: '1.16.6', google: '8.7.0', xcsh: '15.13.0' }) &&
    [p.imageIdentitySha256, p.providerLockSha256, p.operationalContractFingerprint, p.lifecycleEvidenceSha256].every(
      hash,
    )
  );
}
/** Cleanup requires the immutable lifecycle scope, independently of any live health reads. */
export function assertGcpTerraformHaProfile(intent: GcpCeIntent, boundary: GcpCeContractBoundary, deployment = false) {
  assertGcpSiteAccessProfile(intent);
  const p = boundary.terraformHaLifecycle;
  const contract = boundary.operationalHealthContract;
  const expected = boundary.operationalHealthExpected;
  if (
    !qualifiedGcpTerraformHaProfile(p) ||
    p.operationalContractFingerprint !== (contract?.contractFingerprint ?? expected?.contractFingerprint) ||
    !hash(contract?.qualificationFingerprint ?? expected?.qualificationFingerprint) ||
    intent.engine !== 'terraform' ||
    intent.sites.length !== 1 ||
    intent.sites[0].nodes.length !== 3 ||
    intent.region !== p.region ||
    intent.machineType !== p.machineType ||
    intent.diskGiB !== p.diskGiB ||
    fingerprint(intent.image) !== p.imageIdentitySha256 ||
    fingerprint(intent.sites[0].nodes.map((n) => n.zone).sort()) !== fingerprint(p.zones) ||
    intent.sites[0].nodes.some(
      (n) => n.interfaces.length !== 2 || n.interfaces[0].role !== 'slo' || n.interfaces[1].role !== 'sli',
    )
  )
    throw new Error('Qualified immutable Terraform HA lifecycle scope required');
  if (
    deployment &&
    (!contract ||
      !qualifiedOperationalRelease(
        contract.qualification,
        contract.qualificationFingerprint,
        contract.contractFingerprint,
      ))
  )
    throw new Error('Qualified operational release required for Terraform HA deployment');
  return p;
}
export function gcpDeploymentLifecycleFingerprint(intent: GcpCeIntent, boundary: GcpCeContractBoundary) {
  if (intent.sites[0]?.nodes.length !== 3) return fingerprint(boundary.singleNodeLifecycle);
  const profile = assertGcpTerraformHaProfile(intent, boundary);
  const siteAccessFingerprint = gcpSiteAccessFingerprint(intent);
  return fingerprint({
    profile,
    ...(siteAccessFingerprint ? { siteAccessFingerprint } : {}),
    operationalQualificationFingerprint:
      boundary.operationalHealthContract?.qualificationFingerprint ??
      boundary.operationalHealthExpected?.qualificationFingerprint,
  });
}

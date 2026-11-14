import { fingerprint } from './discovery';
export interface GcpQualificationGates {
  fundingReceipt?: import('./corporate-funding').GcpCorporateFundingReceipt;
  schemaVersion: 1;
  project: string;
  region: string;
  engine: 'native' | 'terraform';
  approvalPlanHash: string;
  apiContract: {
    publication: 'immutable-release' | 'candidate';
    gcpMapping: 'available' | 'unavailable';
    sha256: string;
  };
  policy: { identity: 'f5xc-ce-automation-policy/v2'; sha256: string; verified: boolean };
  sharedRuntime: boolean;
  exactImageVerified: boolean;
  legalAcceptance: 'accepted' | 'not-required' | 'authorized-for-access-or-use' | 'unknown';
  iamVerified: boolean;
  quotaVerified: boolean;
  organizationPolicyVerified: boolean;
  providerLocksVerified: boolean;
}
export function assertGcpLaunchGates(gates: GcpQualificationGates, reviewedHash: string): void {
  if (
    gates.schemaVersion !== 1 ||
    gates.approvalPlanHash !== reviewedHash ||
    !/^sha256:[a-f0-9]{64}$/.test(reviewedHash)
  )
    throw new Error('Reviewed launch identity differs');
  if (
    gates.apiContract.publication !== 'immutable-release' ||
    gates.apiContract.gcpMapping !== 'available' ||
    !/^sha256:[a-f0-9]{64}$/.test(gates.apiContract.sha256)
  )
    throw new Error('Immutable qualified GCP API mapping required before launch');
  if (
    gates.policy.identity !== 'f5xc-ce-automation-policy/v2' ||
    gates.policy.verified !== true ||
    !/^sha256:[a-f0-9]{64}$/.test(gates.policy.sha256)
  )
    throw new Error('Current verified CE policy required before launch');
  if (
    !gates.sharedRuntime ||
    !gates.exactImageVerified ||
    !gates.iamVerified ||
    !gates.quotaVerified ||
    !gates.organizationPolicyVerified ||
    !['accepted', 'not-required', 'authorized-for-access-or-use'].includes(gates.legalAcceptance)
  )
    throw new Error('Launch prerequisites remain unavailable');
  if (gates.engine === 'terraform' && !gates.providerLocksVerified)
    throw new Error('Exact Terraform provider locks required');
}
export function fingerprintGcpQualificationGates(gates: GcpQualificationGates): string {
  return fingerprint(gates);
}

import { type InitialSiteVersions, initialSoftwareSettings } from './initial-versions';
import type { CeRuntime, SiteBinding } from './runtime';
import type { VerifiedUpgradeContract } from './upgrade-contract';
import { type CeVersionIdentity, stableCeSiteVersions } from './upgrade-transition';

export interface CeReplacementVersions {
  schemaVersion: 1;
  identity: CeVersionIdentity;
  versions: InitialSiteVersions;
}
type Runtime = Pick<CeRuntime, 'observeUpgrade'>;

/** Capture from the runtime, bound to the logical site already selected for replacement. */
export async function captureCeReplacementVersions(
  binding: SiteBinding,
  siteUid: string,
  siteContractFingerprint: string,
  runtime: Runtime,
  contract: VerifiedUpgradeContract,
  signal?: AbortSignal,
): Promise<CeReplacementVersions> {
  binding = structuredClone(binding);
  const observation = await runtime.observeUpgrade(binding, contract, undefined, signal);
  if (observation.status !== 'observed') throw new Error('Replacement version evidence is unavailable');
  const identity: CeVersionIdentity = {
    binding,
    siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    siteContractFingerprint,
    contractFingerprint: contract.fingerprint,
  };
  const versions = stableCeSiteVersions(identity, observation);
  if (!versions) throw new Error('Replacement site identity or effective versions are not stable');
  return { schemaVersion: 1, identity, versions };
}

/** Before an intact site's first destructive boundary, compare a new observation with its frozen plan. */
export async function verifyCeReplacementVersions(
  snapshot: CeReplacementVersions,
  runtime: Runtime,
  contract: VerifiedUpgradeContract,
  signal?: AbortSignal,
): Promise<void> {
  snapshot = structuredClone(snapshot);
  if (snapshot.schemaVersion !== 1 || snapshot.identity.contractFingerprint !== contract.fingerprint)
    throw new Error('Replacement version snapshot or published contract differs');
  initialSoftwareSettings(snapshot.versions);
  const observation = await runtime.observeUpgrade(snapshot.identity.binding, contract, undefined, signal);
  const current = stableCeSiteVersions(snapshot.identity, observation);
  if (!current || current.software !== snapshot.versions.software || current.os !== snapshot.versions.os)
    throw new Error('Replacement site identity or effective versions changed before mutation');
}

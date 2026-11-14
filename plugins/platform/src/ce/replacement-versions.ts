import { type InitialSiteVersions, initialSoftwareSettings } from './initial-versions';
import type { CeRuntime, SiteBinding } from './runtime';
import type { VerifiedUpgradeContract } from './upgrade-contract';
import { type CeVersionIdentity, stableCeSiteVersions } from './upgrade-transition';
import {
  type CeVersionObservationDiagnostic,
  safeCeVersionObservationDiagnostic,
} from './version-observation-diagnostic';

export interface CeReplacementVersions {
  schemaVersion: 1;
  identity: CeVersionIdentity;
  versions: InitialSiteVersions;
}
type Runtime = Pick<CeRuntime, 'observeUpgrade'>;

export class CeReplacementVersionEvidenceError extends Error {
  readonly diagnostic: CeVersionObservationDiagnostic;
  constructor(kind: 'unavailable' | 'unstable', observation?: unknown) {
    super(
      kind === 'unavailable'
        ? 'Replacement version evidence is unavailable'
        : 'Replacement site identity or effective versions are not stable',
    );
    this.diagnostic = safeCeVersionObservationDiagnostic(
      kind === 'unavailable'
        ? observation
        : {
            status: 'unstable',
            reason: 'identity-or-versions-not-stable',
            failedStage: 'replacement-version-stability',
          },
    );
  }
}

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
  if (observation.status !== 'observed') throw new CeReplacementVersionEvidenceError('unavailable', observation);
  const identity: CeVersionIdentity = {
    binding,
    siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    siteContractFingerprint,
    contractFingerprint: contract.fingerprint,
  };
  const versions = stableCeSiteVersions(identity, observation);
  if (!versions) throw new CeReplacementVersionEvidenceError('unstable');
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

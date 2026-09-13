import type { CeReplacementVersions } from '../../../platform/src/ce/replacement-versions';
import type { SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { versionFixture } from '../../../platform/test/ce/version-fixtures';

export const replacementContract = { fingerprint: `sha256:${'b'.repeat(64)}` } as VerifiedUpgradeContract;
export function replacementVersions(binding: SiteBinding): CeReplacementVersions {
  return {
    schemaVersion: 1,
    identity: {
      binding: structuredClone(binding),
      siteUid: 'old-site',
      physicalSiteUid: 'old-physical',
      siteContractFingerprint: `sha256:${'a'.repeat(64)}`,
      contractFingerprint: replacementContract.fingerprint,
    },
    versions: { software: 'crt-20260201-0179', os: '9.2026.17' },
  };
}
export function replacementObservation(binding: SiteBinding, uid = 'old-site') {
  const snapshot = replacementVersions(binding);
  const { observation } = versionFixture();
  return {
    ...observation,
    ...snapshot.identity,
    owner: binding.owner,
    nodes: binding.nodes,
    siteName: binding.siteName,
    siteUid: uid,
    physicalSiteUid: uid === 'old-site' ? 'old-physical' : 'new-physical',
    source: `/api/config/namespaces/system/sites/${binding.siteName}`,
    targetSoftware: snapshot.versions.software,
    software: { ...observation.software, installed: snapshot.versions.software },
    os: { ...observation.os, installed: snapshot.versions.os },
    progress: { status: 'COMPLETED', version: snapshot.versions.software },
  };
}

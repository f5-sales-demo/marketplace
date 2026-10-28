import type { SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';

export const nativeUpgradeTestContract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;

export function nativeUpgradeTestObservation(
  binding: SiteBinding,
  target: string,
  state: 'ready' | 'converging' | 'complete',
) {
  const installed = state === 'complete' ? target : 'crt-20260201-0178';
  return {
    owner: binding.owner,
    nodes: binding.nodes,
    siteName: binding.siteName,
    source: `/api/config/namespaces/system/sites/${binding.siteName}`,
    siteUid: 'logical-azure',
    physicalSiteUid: 'physical-azure',
    contractFingerprint: nativeUpgradeTestContract.fingerprint,
    siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
    status: 'observed' as const,
    startedAt: new Date(Date.now() - 100).toISOString(),
    observedAt: new Date().toISOString(),
    targetSoftware: target,
    online: state !== 'converging',
    siteState: state === 'converging' ? 'UPGRADING' : 'ONLINE',
    software: {
      installed,
      available: target,
      phase: state === 'converging' ? 'UPGRADE_IN_PROGRESS' : 'UPGRADE_COMPLETED',
      result: state === 'converging' ? 'In progress' : 'Completed',
    },
    os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
    targets: [target],
    targetSoftwareListed: true,
    prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
    progress: {
      status: state === 'converging' ? 'IN_PROGRESS' : 'COMPLETED',
      version: state === 'converging' ? target : installed,
    },
    sources: { site: '', targets: '', precheck: '', progress: '' },
    nodeHealth: 'unknown' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
}

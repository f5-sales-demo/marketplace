import type { CeUpgradeExpectation } from '../../src/ce/upgrade-transition';

export function versionFixture(kind: 'software' | 'os' = 'software') {
  const expected: CeUpgradeExpectation = {
    binding: {
      owner: { deploymentId: 'ce-test', engine: 'terraform', provider: 'aws', account: 'demo', region: 'us-east-1' },
      siteName: 'ce-one',
      nodes: ['node-one'],
      initialVersions: { software: 'crt-20260201-0177', os: '9.2026.13' },
    },
    siteUid: 'logical-one',
    physicalSiteUid: 'physical-one',
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
    siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
    before: { software: 'crt-20260201-0178', os: '9.2026.14' },
    target: { kind, version: kind === 'software' ? 'crt-20260201-0179' : '9.2026.17' },
  };
  const observation: any = {
    ...structuredClone(expected),
    owner: structuredClone(expected.binding.owner),
    siteName: 'ce-one',
    nodes: ['node-one'],
    source: '/api/config/namespaces/system/sites/ce-one',
    status: 'observed',
    startedAt: new Date(Date.now() - 100).toISOString(),
    observedAt: new Date().toISOString(),
    targetSoftware: kind === 'software' ? expected.target.version : expected.before.software,
    siteState: 'ONLINE',
    online: true,
    software: {
      installed: expected.before.software,
      available: 'crt-20260201-0179',
      phase: 'UPGRADE_COMPLETED',
      result: 'Completed',
    },
    os: { installed: expected.before.os, available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
    progress: { status: 'COMPLETED', version: expected.before.software },
    prechecks: { checks: [{ name: 'Node Availability', status: 'CHECKLIST_PASSED' }], passing: true },
    targets: ['crt-20260201-0179'],
    targetSoftwareListed: true,
    nodeHealth: 'unknown',
    routing: 'unknown',
    traffic: 'unknown',
  };
  return { expected, observation };
}

import { expect, test } from 'bun:test';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from '../../src/ce/upgrade-transition';

function fixture(kind: 'software' | 'os' = 'software') {
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

test('software and OS gates use effective versions for both engines and clouds, preserving create-time settings', () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const provider of ['aws', 'azure'] as const)
      for (const kind of ['software', 'os'] as const) {
        const { expected, observation } = fixture(kind);
        expected.binding.owner.engine = observation.owner.engine = engine;
        expected.binding.owner.provider = observation.owner.provider = provider;
        const before = structuredClone(expected);
        expect(assessCeUpgradeTransition(expected, observation)).toBe('ready');
        observation[kind].phase = 'UPGRADE_IN_PROGRESS';
        observation.siteState = 'UPGRADING';
        observation.online = false;
        if (kind === 'software') observation.progress = { status: 'IN_PROGRESS', version: expected.target.version };
        expect(assessCeUpgradeTransition(expected, observation)).toBe('converging');
        observation[kind].installed = expected.target.version;
        observation[kind].phase = 'UPGRADE_COMPLETED';
        observation.siteState = 'ONLINE';
        observation.online = true;
        if (kind === 'software') observation.progress.status = 'COMPLETED';
        expect(assessCeUpgradeTransition(expected, observation)).toBe('versions-complete');
        expect(expected).toEqual(before);
        expect(observation.traffic).toBe('unknown');
      }
});

test('replacements, stale observations, scope drift and unrelated version changes cannot pass upgrade gates', () => {
  for (const mutate of [
    (o: any) => {
      o.siteUid = 'replacement';
    },
    (o: any) => {
      o.physicalSiteUid = 'replacement';
    },
    (o: any) => {
      o.owner.engine = 'native';
    },
    (o: any) => {
      o.owner.region = 'other';
    },
    (o: any) => {
      o.nodes = ['foreign'];
    },
    (o: any) => {
      o.nodes = ['node-one', 'node-one'];
    },
    (o: any) => {
      o.contractFingerprint = `sha256:${'c'.repeat(64)}`;
    },
    (o: any) => {
      o.source = '/api/config/namespaces/system/sites/other';
    },
    (o: any) => {
      o.startedAt = new Date(Date.now() - 61000).toISOString();
    },
    (o: any) => {
      o.observedAt = new Date(Date.now() + 10000).toISOString();
    },
    (o: any) => {
      o.startedAt = 'malformed';
    },
    (o: any) => {
      o.os.installed = '9.2026.17';
    },
    (o: any) => {
      o.software.installed = '__VERSION__';
    },
    (o: any) => {
      o.targetSoftware = 'crt-20260201-0177';
    },
    (o: any) => {
      o.siteState = 'PROVISIONING';
    },
    (o: any) => {
      o.status = 'unknown';
    },
  ]) {
    const { expected, observation } = fixture();
    mutate(observation);
    expect(assessCeUpgradeTransition(expected, observation)).toBe('unknown');
  }
});

test('precheck and target booleans cannot override missing, failed, duplicated or unlisted evidence', () => {
  for (const mutate of [
    (o: any) => {
      o.prechecks.checks = [];
    },
    (o: any) => {
      o.prechecks.checks[0].status = 'CHECKLIST_FAILED';
    },
    (o: any) => {
      o.prechecks.checks[0].status = 'CHECKLIST_UNKNOWN';
    },
    (o: any) => {
      o.prechecks.checks.push(o.prechecks.checks[0]);
    },
    (o: any) => {
      o.targets = [];
    },
    (o: any) => {
      o.targets.push(o.targets[0]);
    },
    (o: any) => {
      o.progress.status = 'IN_PROGRESS';
    },
  ]) {
    const { expected, observation } = fixture();
    mutate(observation);
    expect(assessCeUpgradeTransition(expected, observation)).toBe('unknown');
  }
  const { expected, observation } = fixture('os');
  observation.os.available = '9.2026.18';
  expect(assessCeUpgradeTransition(expected, observation)).toBe('unknown');
});

test('historical completion cannot satisfy a new upgrade and failed or offline sites cannot complete', () => {
  const { expected, observation } = fixture();
  observation.software.installed = expected.target.version;
  expect(assessCeUpgradeTransition(expected, observation)).toBe('unknown');
  observation.progress = { version: expected.target.version, status: 'COMPLETED' };
  observation.siteState = 'PROVISIONING';
  observation.online = false;
  expect(assessCeUpgradeTransition(expected, observation)).toBe('unknown');
  observation.siteState = 'FAILED';
  expect(assessCeUpgradeTransition(expected, observation)).toBe('failed');
  observation.siteState = 'ONLINE';
  observation.online = true;
  observation.software.phase = 'UPGRADE_FAILED';
  expect(assessCeUpgradeTransition(expected, observation)).toBe('failed');
  expected.target.version = expected.before.software;
  expect(assessCeUpgradeTransition(expected, observation)).toBe('unknown');
});

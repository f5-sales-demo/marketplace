import { expect, test } from 'bun:test';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../src/ce/upgrade-contract';
import type { VerifiedCeContract } from '../../src/ce/verified-contract';
import { upgradeSiteFixture } from './upgrade-site-fixture';

const binding: SiteBinding = {
  owner: { deploymentId: 'stage-test', engine: 'terraform', provider: 'aws', account: 'demo', region: 'us-east-1' },
  siteName: 'ce-one',
  nodes: ['node-one'],
};
const metadata = {
  name: binding.siteName,
  namespace: 'system',
  labels: {
    'xcsh-ce-deployment': binding.owner.deploymentId,
    'xcsh-ce-engine': binding.owner.engine,
    'xcsh-ce-provider': binding.owner.provider,
    'xcsh-ce-account': binding.owner.account,
    'xcsh-ce-region': binding.owner.region,
  },
};
const stages = [
  'logical-site',
  'physical-site',
  'targets',
  'prechecks',
  'progress',
  'logical-site-recheck',
  'physical-site-recheck',
] as const;
function observer(failure?: { call?: number; status?: number; malformed?: boolean; paths?: boolean; drift?: boolean }) {
  let calls = 0;
  const runtime = new CeRuntime(
    { fingerprint: `sha256:${'a'.repeat(64)}` } as VerifiedCeContract,
    'terraform',
    'https://tenant.test',
    'stage-test-credential',
    async (url, init) => {
      calls++;
      expect(init?.method ?? 'GET').toBe('GET');
      if (calls === failure?.call && failure.status)
        return Response.json({ message: 'private-response-marker' }, { status: failure.status });
      const path = new URL(url).pathname;
      if (path.includes('securemesh_site_v2s'))
        return Response.json({ metadata, system_metadata: { uid: 'logical-one' } });
      if (path.endsWith('/sites/ce-one')) {
        const site = { ...upgradeSiteFixture(), metadata };
        if (failure?.malformed) site.status = [];
        if (failure?.drift && calls > 2) site.spec.site_state = 'FAILED';
        return Response.json(site);
      }
      if (path.endsWith('/targets')) return Response.json({ sw_versions: ['crt-20260201-0179'] });
      if (path.endsWith('/prechecks'))
        return Response.json({ checklist: [{ item: 'nodes', status: 'CHECKLIST_PASSED' }] });
      if (path.endsWith('/progress'))
        return Response.json({
          upgrade_status: {
            sw_upgrade_progress: { site: binding.siteName, status: 'COMPLETED', version: 'crt-20260201-0178' },
          },
        });
      throw Error('Unexpected fixture request');
    },
  );
  const contract = {
    fingerprint: `sha256:${'b'.repeat(64)}`,
    observationPaths: () => {
      if (failure?.paths) throw Error('private-contract-marker');
      return { targets: '/api/targets', precheck: '/api/prechecks', progress: '/api/progress' };
    },
  } as unknown as VerifiedUpgradeContract;
  return { run: () => runtime.observeUpgrade(binding, contract), calls: () => calls };
}

test('unknown version observations retain the exact failed read stage without response bodies', async () => {
  for (const [index, stage] of stages.entries())
    for (const status of [403, 503]) {
      const f = observer({ call: index + 1, status });
      const result = await f.run();
      expect(result).toMatchObject({
        status: 'unknown',
        failedStage: stage,
        reason: status === 403 ? 'authorization' : 'transient',
      });
      expect(f.calls()).toBe(index + 1);
      expect(JSON.stringify(result)).not.toContain('private-response-marker');
      expect(JSON.stringify(result)).not.toContain('stage-test-credential');
    }
});

test('version parsing, contract paths and collection drift identify separate failed boundaries', async () => {
  for (const [failure, stage, reason] of [
    [{ malformed: true }, 'site-versions', 'ownership-or-response-invalid'],
    [{ paths: true }, 'upgrade-paths', 'ownership-or-response-invalid'],
    [{ drift: true }, 'stability-recheck', 'conflict'],
  ] as const) {
    const result = await observer(failure).run();
    expect(result).toMatchObject({ status: 'unknown', failedStage: stage, reason });
    expect(JSON.stringify(result)).not.toContain('private-contract-marker');
  }
});

test('complete version observations carry no failed stage and retain separate health gates', async () => {
  const result = await observer().run();
  expect(result).toMatchObject({ status: 'observed', nodeHealth: 'unknown', routing: 'unknown', traffic: 'unknown' });
  expect(result).not.toHaveProperty('failedStage');
});

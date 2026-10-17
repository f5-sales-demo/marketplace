import { expect, test } from 'bun:test';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import { canonicalSha256 } from '../../src/ce/canonical';
import { prepareAwsTerraformUpgrade, verifyAwsTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import { foundationPlan } from './terraform-fixtures';

const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;
function fixture(ha = false) {
  const { planId: _id, planSha256: _sha, ...draft } = foundationPlan(ha);
  draft.deploymentName = draft.intent.deploymentName;
  draft.accountId = draft.intent.accountId;
  draft.region = draft.intent.region;
  draft.intent.initialVersions = { software: 'crt-20260201-0177', os: '9.2026.13' };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
}
function observation(binding: SiteBinding, target = 'crt-20260201-0178') {
  return {
    owner: binding.owner,
    nodes: binding.nodes,
    siteName: binding.siteName,
    source: `/api/config/namespaces/system/sites/${binding.siteName}`,
    siteUid: 'logical-one',
    physicalSiteUid: 'physical-one',
    contractFingerprint: contract.fingerprint,
    siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
    status: 'observed' as const,
    startedAt: new Date(Date.now() - 100).toISOString(),
    observedAt: new Date().toISOString(),
    targetSoftware: target,
    online: true,
    siteState: 'ONLINE',
    software: {
      installed: 'crt-20260201-0178',
      available: 'crt-20260201-0179',
      phase: 'UPGRADE_COMPLETED',
      result: 'Completed',
    },
    os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
    targets: ['crt-20260201-0179'],
    targetSoftwareListed: true,
    prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
    progress: { status: 'COMPLETED', version: 'crt-20260201-0178' },
    sources: { site: '', targets: '', precheck: '', progress: '' },
    nodeHealth: 'unknown' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
}
const runtime: Pick<CeRuntime, 'observeUpgrade'> = {
  async observeUpgrade(binding, _contract, target) {
    return observation(binding, target);
  },
};

test('prepares exact software and OS actions with isolated workspaces and effective versions', async () => {
  for (const ha of [false, true])
    for (const kind of ['software', 'os'] as const) {
      const base = fixture(ha),
        before = structuredClone(base);
      const upgrade = await prepareAwsTerraformUpgrade(
        base,
        ha ? 'site' : 'site-1',
        { kind, version: kind === 'software' ? 'crt-20260201-0179' : '9.2026.17' },
        runtime,
        contract,
      );
      expect(base).toEqual(before);
      expect(upgrade.expectation.before).toEqual({ software: 'crt-20260201-0178', os: '9.2026.14' });
      expect(upgrade.expectation.binding.nodes).toHaveLength(ha ? 3 : 1);
      expect(upgrade.deployment.backendIdentity).toBe(`local:ce:stage:${upgrade.deployment.stage}`);
      const config = JSON.parse(upgrade.deployment.configuration),
        type = kind === 'software' ? 'xcsh_site_upgrade_sw' : 'xcsh_site_upgrade_os';
      expect(config.action).toEqual({
        [type]: {
          ce: {
            config: {
              name: ha ? 'site' : 'site-1',
              namespace: 'system',
              version: upgrade.expectation.target.version,
              force: false,
            },
          },
        },
      });
      expect(config.resource).toBeUndefined();
      expect(config.output).toBeUndefined();
      expect(config.provider).toEqual({ xcsh: {} });
      expect(upgrade.action.type).toBe(type);
      expect(upgrade.action.address).toBe(`action.${type}.ce`);
      await verifyAwsTerraformUpgrade(base, upgrade, contract);
    }
});

test('OS observation selects installed software instead of the deployment bootstrap baseline', async () => {
  const base = fixture();
  const port: typeof runtime = {
    async observeUpgrade(binding, _contract, target) {
      expect(target).toBeUndefined();
      const value = observation(binding, 'crt-20260201-0179');
      value.software.installed = 'crt-20260201-0179';
      value.progress.version = 'crt-20260201-0179';
      return value;
    },
  };
  const result = await prepareAwsTerraformUpgrade(base, 'site-1', { kind: 'os', version: '9.2026.17' }, port, contract);
  expect(result.expectation.before.software).toBe('crt-20260201-0179');
  expect(result.expectation.binding.initialVersions?.software).toBe('crt-20260201-0177');
});

test('rejects missing, stale, foreign and degraded version evidence without creating an action', async () => {
  for (const mode of ['unknown', 'stale', 'foreign', 'failed'] as const) {
    const port: typeof runtime = {
      async observeUpgrade(binding, _contract, target) {
        const value = observation(binding, target);
        if (mode === 'unknown') return { ...value, status: 'unknown' as const, reason: 'malformed' };
        if (mode === 'stale') value.startedAt = new Date(Date.now() - 61000).toISOString();
        if (mode === 'foreign') value.owner = { ...value.owner, engine: 'native' };
        if (mode === 'failed') value.prechecks.checks[0].status = 'CHECKLIST_FAILED';
        return value;
      },
    };
    await expect(
      prepareAwsTerraformUpgrade(
        fixture(),
        'site-1',
        { kind: 'software', version: 'crt-20260201-0179' },
        port,
        contract,
      ),
    ).rejects.toThrow();
  }
  await expect(
    prepareAwsTerraformUpgrade(
      fixture(),
      'foreign',
      { kind: 'software', version: 'crt-20260201-0179' },
      runtime,
      contract,
    ),
  ).rejects.toThrow();
});

test('rejects saved workspace, action, provider-lock and identity tampering', async () => {
  const base = fixture(),
    original = await prepareAwsTerraformUpgrade(
      base,
      'site-1',
      { kind: 'software', version: 'crt-20260201-0179' },
      runtime,
      contract,
    );
  for (const mode of ['stage', 'action', 'lock', 'uid', 'owner'] as const) {
    const value = structuredClone(original);
    if (mode === 'stage') value.deployment.stage = 'other';
    if (mode === 'action') value.action.configValuesSha256 = '0'.repeat(64);
    if (mode === 'lock') value.deployment.providerLock = 'different';
    if (mode === 'uid') value.expectation.siteUid = 'different';
    if (mode === 'owner') value.expectation.binding.owner.engine = 'native';
    await expect(verifyAwsTerraformUpgrade(base, value, contract)).rejects.toThrow();
  }
});

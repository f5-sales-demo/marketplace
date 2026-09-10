import { expect, test } from 'bun:test';
import type { SiteBinding } from '../../src/ce/runtime';
import {
  parseSiteUpgradeState,
  parseSoftwareTargets,
  parseUpgradePrechecks,
  parseUpgradeProgress,
} from '../../src/ce/upgrade-evidence';

const binding: SiteBinding = {
  owner: { deploymentId: 'ce-test', engine: 'native', provider: 'aws', account: 'demo', region: 'us-east-1' },
  siteName: 'ce-one',
  nodes: ['node-one'],
};
function site() {
  return {
    metadata: { name: 'ce-one', namespace: 'system' },
    system_metadata: { uid: 'physical-one' },
    spec: { main_nodes: [{ name: 'node-one' }], site_state: 'ONLINE' },
    status: [
      { volterra_software_status: null },
      {
        metadata: {
          uid: 'software-publisher',
          creator_class: 'maurice',
          status_id: 'software-version',
          publish: 'STATUS_PUBLISH',
          vtrp_stale: false,
        },
        volterra_software_status: {
          last_installed_version: 'crt-20260201-0178',
          available_version: 'crt-20260201-0179',
          deployment_state: { phase: 'UPGRADE_COMPLETED', result: 'Completed' },
        },
      },
      {
        metadata: {
          uid: 'os-publisher',
          creator_class: 'maurice',
          status_id: 'operating-system-version',
          publish: 'STATUS_PUBLISH',
          vtrp_stale: false,
        },
        operating_system_status: {
          available_version: '9.2026.17',
          deployment_state: { version: '9.2026.14', phase: 'UPGRADE_COMPLETED', result: 'success' },
        },
      },
    ],
  };
}
test('selects version publishers and preserves current offline state despite completed deployment phases', () => {
  const raw = site();
  raw.status.unshift({
    metadata: {
      uid: 'node-status-publisher',
      creator_class: 'ver',
      status_id: 'node-one_SiteStatusMgr',
      publish: 'STATUS_PUBLISH',
      vtrp_stale: false,
    },
    volterra_software_status: {},
    operating_system_status: {},
  });
  expect(parseSiteUpgradeState(raw, binding).software.installed).toBe('crt-20260201-0178');
  raw.spec.site_state = 'FAILED';
  expect(parseSiteUpgradeState(raw, binding).online).toBe(false);
});
test('uses the completed software deployment version when fresh provisioning has not populated last installed', () => {
  const raw = site();
  raw.status[1].volterra_software_status.last_installed_version = '';
  raw.status[1].volterra_software_status.deployment_state.version = 'crt-20260201-0178';
  expect(parseSiteUpgradeState(raw, binding).software.installed).toBe('crt-20260201-0178');
  raw.status[1].volterra_software_status.deployment_state.phase = 'UPGRADE_IN_PROGRESS';
  expect(() => parseSiteUpgradeState(raw, binding)).toThrow('Missing upgrade evidence');
});
test('rejects missing freshness, forged publishers, duplicates, cross-site nodes and conflicting versions', () => {
  const mutations = [
    (raw: any) => {
      raw.spec.main_nodes[0].name = ['node-one'];
    },
    (raw: any) => {
      delete raw.status[1].metadata.vtrp_stale;
    },
    (raw: any) => {
      raw.status[1].metadata.creator_class = 'untrusted';
    },
    (raw: any) => {
      raw.status[1].metadata.vtrp_stale = true;
    },
    (raw: any) => {
      raw.status.push(structuredClone(raw.status[1]));
    },
    (raw: any) => {
      raw.spec.main_nodes[0].name = 'node-other';
    },
    (raw: any) => {
      raw.status[1].volterra_software_status.last_installed_version = '__VERSION__';
    },
    (raw: any) => {
      const other = structuredClone(raw.status[1]);
      other.metadata.uid = 'other';
      other.volterra_software_status.last_installed_version = 'crt-20260201-0177';
      raw.status.push(other);
    },
  ];
  for (const mutate of mutations) {
    const raw = site();
    mutate(raw);
    expect(() => parseSiteUpgradeState(raw, binding)).toThrow();
  }
});
test('unknown prechecks cannot admit an upgrade, while warnings are explicitly permissible', () => {
  expect(parseUpgradePrechecks({ checklist: [{ item: 'nodes', status: 'CHECKLIST_UNKNOWN' }] }).passing).toBe(false);
  expect(parseUpgradePrechecks({ checklist: [{ item: 'nodes', status: 'CHECKLIST_WARNING' }] }).passing).toBe(true);
  for (const raw of [{}, { checklist: [] }, { checklist: [{ item: 'nodes', status: 'invented' }] }])
    expect(() => parseUpgradePrechecks(raw)).toThrow();
});
test('target discovery accepts a complete empty list but rejects malformed and duplicate entries', () => {
  expect(parseSoftwareTargets({ sw_versions: [] })).toEqual([]);
  for (const raw of [{}, { sw_versions: ['latest'] }, { sw_versions: ['crt-20260201-0179', 'crt-20260201-0179'] }])
    expect(() => parseSoftwareTargets(raw)).toThrow();
});
test('progress validates site and status without claiming current health or target completion', () => {
  const raw = {
    upgrade_status: { sw_upgrade_progress: { site: 'ce-one', status: 'COMPLETED', version: 'crt-20260201-0178' } },
  };
  expect(parseUpgradeProgress(raw, 'ce-one')).toEqual({ status: 'COMPLETED', version: 'crt-20260201-0178' });
  expect(() => parseUpgradeProgress(raw, 'ce-other')).toThrow();
  raw.upgrade_status.sw_upgrade_progress.status = 'invented';
  expect(() => parseUpgradeProgress(raw, 'ce-one')).toThrow();
});

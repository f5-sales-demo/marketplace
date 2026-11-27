import { describe, expect, it } from 'bun:test';
import { parseNodeAdmission } from '../../src/ce/node-admission';

const configuration = {
  system_metadata: { uid: 'configuration-fixture' },
  spec: {
    azure: {
      not_managed: {
        node_list: [
          { hostname: 'fixture-ce-1', interface_list: [{ ethernet_interface: { mac: '02:00:00:00:00:01' } }] },
        ],
      },
    },
  },
};
const sites = {
  items: [
    {
      name: 'fixture-ce',
      uid: 'site-fixture',
      owner_view: { kind: 'securemesh_site_v2', uid: 'configuration-fixture' },
    },
  ],
};
const registrations = {
  items: [
    {
      name: 'r-fixture',
      get_spec: {
        passport: { cluster_name: 'fixture-ce', cluster_size: 1 },
        infra: { hostname: 'fixture-ce-1', instance_id: 'instance-fixture' },
      },
      object: { status: { current_state: 'ONLINE' } },
    },
  ],
};
const vpm = { hostname: 'fixture-ce-1.example', state: 'PROVISIONED' };
const expected = {
  siteName: 'fixture-ce',
  hostname: 'fixture-ce-1',
  instanceId: 'instance-fixture',
  mac: '02:00:00:00:00:01',
};
describe('identity-bound node probe admission', () => {
  it('joins cloud, configuration, original site UID, registration and VPM state', () => {
    const result = parseNodeAdmission(expected, configuration, sites, registrations, vpm);
    expect(result.status).toBe('ready-for-probe');
    expect(result.siteUid).toBe('site-fixture');
    expect(result.operationalServices).toBe('unknown');
  });
  it('retains unknown for mismatched identity, duplicate or incomplete observations', () => {
    for (const change of [
      { expected: { ...expected, instanceId: 'other-instance' } },
      { expected: { ...expected, mac: '02:00:00:00:00:02' } },
      { sites: { ...sites, next_page_token: 'next' } },
      { sites: { items: [...sites.items, ...sites.items] } },
      { vpm: { ...vpm, hostname: 'other-node' } },
    ])
      expect(
        parseNodeAdmission(
          change.expected ?? expected,
          configuration,
          change.sites ?? sites,
          registrations,
          change.vpm ?? vpm,
        ).status,
      ).toBe('unknown');
  });
  it('holds admission while registration or VPM provisioning is incomplete', () => {
    const pending = structuredClone(registrations);
    pending.items[0].object.status.current_state = 'PENDING';
    expect(parseNodeAdmission(expected, configuration, sites, pending, vpm).status).toBe('not-ready');
    expect(
      parseNodeAdmission(expected, configuration, sites, registrations, { ...vpm, state: 'PROVISIONING' }).status,
    ).toBe('not-ready');
  });
});

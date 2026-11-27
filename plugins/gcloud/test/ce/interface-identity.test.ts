import { expect, it } from 'bun:test';
import { correlateGcpPhysicalInterfaces, type GcpExpectedNodeIdentity } from '../../src/ce/interface-identity';

const expected: GcpExpectedNodeIdentity = {
  project: 'test-project',
  zone: 'northamerica-northeast1-a',
  instanceId: '123',
  nodeName: 'node-a',
  siteName: 'site-a',
  nics: [
    { index: 0, network: 'outside', subnet: 'outside', role: 'slo', vrf: 'outside' },
    { index: 1, network: 'inside', subnet: 'inside', role: 'sli', vrf: 'inside' },
  ],
};
function fixture() {
  const cloud = {
    id: '123',
    name: 'node-a',
    zone: 'https://www.googleapis.com/compute/v1/projects/test-project/zones/northamerica-northeast1-a',
    networkInterfaces: [
      { name: 'nic0', network: 'outside', subnetwork: 'outside', networkIP: '10.0.1.2' },
      { name: 'nic1', network: 'inside', subnetwork: 'inside', networkIP: '10.0.2.2' },
    ],
  };
  const registration = {
    get_spec: {
      infra: {
        provider: 'GOOGLE',
        instance_id: '123',
        hostname: 'node-a',
        availability_zone: expected.zone,
        hw_info: {
          network: [
            { name: 'ens4', mac_address: '02:00:00:00:00:01', ip_address: ['10.0.1.2/24', 'fe80::1/64'] },
            { name: 'ens5', mac_address: '02:00:00:00:00:02', ip_address: ['10.0.2.2/24'] },
            { name: 'docker0', mac_address: '02:00:00:00:00:03', ip_address: ['172.17.0.1/16'] },
          ],
        },
      },
      passport: { cluster_name: 'site-a' },
    },
    object: { status: { current_state: 'ONLINE' } },
  };
  const configuration = {
    metadata: { name: 'site-a', namespace: 'system' },
    spec: {
      gcp: {
        not_managed: {
          node_list: [
            {
              hostname: 'node-a',
              interface_list: [
                {
                  ethernet_interface: { device: 'ens4', mac: '02:00:00:00:00:01' },
                  is_primary: true,
                  network_option: { site_local_network: {} },
                },
                {
                  ethernet_interface: { device: 'ens5', mac: '02:00:00:00:00:02' },
                  is_primary: false,
                  network_option: { site_local_inside_network: {} },
                },
              ],
            },
          ],
        },
      },
    },
  };
  return { cloud, registration, configuration };
}
it('joins primary SLO and SLI by exact cloud identity, device/MAC, addresses and topology', () => {
  const f = fixture();
  const result = correlateGcpPhysicalInterfaces(expected, f.cloud, f.registration, f.configuration);
  expect(result.map((r) => [r.cloudNicIndex, r.role, r.vrf])).toEqual([
    [0, 'slo', 'outside'],
    [1, 'sli', 'inside'],
  ]);
});
it('rejects VM replacement, non-online registration, duplicate hardware and network drift', () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.cloud.id = '456';
    },
    (f: ReturnType<typeof fixture>) => {
      f.registration.object.status.current_state = 'PENDING';
    },
    (f: ReturnType<typeof fixture>) => {
      f.registration.get_spec.infra.hw_info.network.push(f.registration.get_spec.infra.hw_info.network[0]);
    },
    (f: ReturnType<typeof fixture>) => {
      f.cloud.networkInterfaces[1].network = 'foreign';
    },
  ]) {
    const f = fixture();
    mutate(f);
    expect(() => correlateGcpPhysicalInterfaces(expected, f.cloud, f.registration, f.configuration)).toThrow();
  }
});
it('guest name/MAC without unique cloud address correspondence cannot prove physical identity', () => {
  const f = fixture();
  f.registration.get_spec.infra.hw_info.network[1].ip_address = ['192.0.2.1'];
  expect(() => correlateGcpPhysicalInterfaces(expected, f.cloud, f.registration, f.configuration)).toThrow('join');
});

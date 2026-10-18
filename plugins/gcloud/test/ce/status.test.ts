import { expect, it } from 'bun:test';
import type { GcpExpectedNodeIdentity } from '../../src/ce/interface-identity';
import { observeGcpSiteStatus } from '../../src/ce/status';

const prefix = 'https://www.googleapis.com/compute/v1/projects/example-project';
const expected: GcpExpectedNodeIdentity = {
  project: 'example-project',
  zone: 'northamerica-northeast1-a',
  instanceId: '123',
  siteName: 'site-a',
  nodeName: 'node-a',
  nics: [
    {
      index: 0,
      network: `${prefix}/global/networks/outside`,
      subnet: `${prefix}/regions/northamerica-northeast1/subnetworks/outside`,
      role: 'slo',
      vrf: 'outside',
    },
  ],
};
function source() {
  const cloud = {
    id: '123',
    name: 'node-a',
    zone: `${prefix}/zones/northamerica-northeast1-a`,
    status: 'RUNNING',
    metadata: 'PRIVATE',
    networkInterfaces: [
      { name: 'nic0', network: expected.nics[0].network, subnetwork: expected.nics[0].subnet, networkIP: '10.0.1.2' },
    ],
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
              ],
            },
          ],
        },
      },
    },
  };
  const registration = {
    get_spec: {
      infra: {
        provider: 'GOOGLE',
        instance_id: '123',
        hostname: 'node-a',
        availability_zone: expected.zone,
        hw_info: { network: [{ name: 'ens4', mac_address: '02:00:00:00:00:01', ip_address: ['10.0.1.2/24'] }] },
      },
      passport: { cluster_name: 'site-a' },
      token: 'PRIVATE',
    },
    object: { status: { current_state: 'ONLINE' } },
  };
  const response = { items: [registration], errors: [] as unknown[], next_page_token: '' };
  return {
    cloudValue: cloud,
    registration,
    response,
    cloud: async () => cloud,
    configuration: async () => configuration,
    registrations: async () => response,
    health: async () => ({ hostname: 'node-a', state: 'PROVISIONED', token: 'PRIVATE' }),
  };
}
it('collects each layer independently and never infers routing or application traffic', async () => {
  const result = await observeGcpSiteStatus(expected, 'terraform', source());
  expect(result.cloudProvisioning).toBe('running');
  expect(result.registration).toBe('online');
  expect(result.physicalInterfaceIdentity).toBe('observed');
  expect(result.platformHealth).toBe('healthy');
  expect(result.routing).toBe('unknown');
  expect(result.applicationTraffic).toBe('unknown');
  expect(result.sourceReceipts).toHaveLength(4);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('partial/duplicate/wrong-node evidence remains unknown before health collection', async () => {
  for (const mutate of [
    (s: ReturnType<typeof source>) => {
      s.response.next_page_token = 'next';
    },
    (s: ReturnType<typeof source>) => {
      s.response.items.push(s.registration);
    },
    (s: ReturnType<typeof source>) => {
      s.cloudValue.id = '456';
    },
  ]) {
    const s = source();
    mutate(s);
    let healthCalls = 0;
    const result = await observeGcpSiteStatus(expected, 'native', {
      ...s,
      health: async () => {
        healthCalls++;
        return {};
      },
    });
    expect(result.platformHealth).toBe('unknown');
    expect(healthCalls).toBe(0);
  }
});
it('registration/interface success does not hide health transport failure', async () => {
  const result = await observeGcpSiteStatus(expected, 'native', {
    ...source(),
    health: async () => {
      throw new Error('private');
    },
  });
  expect(result.registration).toBe('online');
  expect(result.physicalInterfaceIdentity).toBe('observed');
  expect(result.platformHealth).toBe('unknown');
  expect(JSON.stringify(result)).not.toContain('private');
});

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
  expect(result.instanceId).toBe(expected.instanceId);
  expect(result.cloudProvisioning).toBe('running');
  expect(result.registration).toBe('online');
  expect(result.physicalInterfaceIdentity).toBe('observed');
  expect(result.platformHealth).toBe('healthy');
  expect(result.routing).toBe('unknown');
  expect(result.applicationTraffic).toBe('unknown');
  expect(result.sourceReceipts).toHaveLength(4);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('retains the exact owned uint64 identity when a same-name replacement is observed', async () => {
  const owned = { ...expected, instanceId: '18446744073709551614' };
  const s = source();
  s.cloudValue.id = '18446744073709551615';
  let platformReads = 0;
  const result = await observeGcpSiteStatus(owned, 'terraform', {
    ...s,
    configuration: async () => {
      platformReads++;
      return {};
    },
  });
  expect(result.instanceId).toBe(owned.instanceId);
  expect(result.cloudProvisioning).toBe('unknown');
  expect(result.registration).toBe('unknown');
  expect(result.platformHealth).toBe('unknown');
  expect(platformReads).toBe(0);
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
it('a healthy site-global response for another HA node cannot establish this node health', async () => {
  const result = await observeGcpSiteStatus(expected, 'terraform', {
    ...source(),
    health: async () => ({ hostname: 'node-b', state: 'PROVISIONED' }),
  });
  expect(result.registration).toBe('online');
  expect(result.physicalInterfaceIdentity).toBe('observed');
  expect(result.platformHealth).toBe('unknown');
  expect(result.instanceId).toBe('123');
});

it('cancellation before observation performs no reads', async () => {
  const controller = new AbortController();
  controller.abort();
  let reads = 0;
  await expect(
    observeGcpSiteStatus(
      expected,
      'native',
      {
        ...source(),
        cloud: async () => {
          reads++;
          return {};
        },
      },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(reads).toBe(0);
});

it('propagates cancellation at every asynchronous layer and resumes with fresh reads', async () => {
  for (const layer of ['cloud', 'configuration', 'registrations', 'health'] as const) {
    const controller = new AbortController();
    const s = source();
    let readsAfterCancellation = 0;
    const interrupted = Object.fromEntries(
      (['cloud', 'configuration', 'registrations', 'health'] as const).map((name) => [
        name,
        async (_identity: string, signal?: AbortSignal) => {
          expect(signal).toBe(controller.signal);
          if (controller.signal.aborted) readsAfterCancellation++;
          if (name === layer) controller.abort();
          return s[name]();
        },
      ]),
    ) as unknown as import('../../src/ce/status').GcpStatusSource;
    await expect(observeGcpSiteStatus(expected, 'terraform', interrupted, controller.signal)).rejects.toThrow();
    expect(readsAfterCancellation).toBe(0);
    const resumed = await observeGcpSiteStatus(expected, 'terraform', source(), new AbortController().signal);
    expect(resumed.platformHealth).toBe('healthy');
    expect(resumed.sourceReceipts).toHaveLength(4);
  }
});

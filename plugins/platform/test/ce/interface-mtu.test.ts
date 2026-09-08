import { expect, test } from 'bun:test';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import type { VerifiedCeContract } from '../../src/ce/verified-contract';

const binding: SiteBinding = {
  siteName: 'ce-one',
  nodes: ['node-one'],
  owner: { deploymentId: 'ce', engine: 'terraform', provider: 'aws', account: '123456789012', region: 'ca-west-1' },
};
const expected = [{ node: 'node-one', role: 'slo' as const, mac: '02:00:00:00:00:01', mtu: 1500 }];
function fixture() {
  const labels = Object.fromEntries(
    Object.entries({
      deployment: 'ce',
      engine: 'terraform',
      provider: 'aws',
      account: '123456789012',
      region: 'ca-west-1',
    }).map(([key, value]) => [`xcsh-ce-${key}`, value]),
  );
  const site = {
    metadata: { name: 'ce-one', namespace: 'system', labels },
    system_metadata: { uid: 'site-uid' },
    resource_version: 'one',
    spec: {
      aws: {
        not_managed: {
          node_list: [
            {
              hostname: 'node-one',
              interface_list: [
                {
                  name: 'ens5',
                  mtu: 0,
                  ethernet_interface: { device: 'ens5', mac: expected[0].mac },
                  network_option: { site_local_network: {} },
                  dhcp_client: {},
                },
              ],
            },
          ],
        },
      },
      no_network_policy: {},
      logs_streaming_disabled: {},
    },
  };
  let puts = 0;
  const receipts: Record<string, unknown>[] = [];
  const contract = {} as VerifiedCeContract;
  const runtime = new CeRuntime(contract, 'terraform', 'https://tenant.test', 'fixture', async (url, init) => {
    if (String(url).includes('registrations_by_site'))
      return Response.json({
        items: [
          {
            get_spec: {
              passport: { cluster_name: 'ce-one', cluster_size: 1 },
              infra: {
                hostname: 'node-one',
                instance_id: 'i-1234567890abcdef0',
                hw_info: { network: [{ name: 'ens5', mac_address: expected[0].mac }] },
              },
            },
            object: { status: { current_state: 'ONLINE' } },
          },
        ],
        errors: [],
      });
    if (init?.method === 'PUT') {
      puts++;
      throw new Error('Unexpected post-registration interface mutation');
    }
    return Response.json(site);
  });
  const run = () =>
    runtime.ensureAwsInterfaceMtu(binding, { 'node-one': 'i-1234567890abcdef0' }, expected, async (record) => {
      expect(record.packetMtu).toBe('unknown');
      receipts.push(record);
    });
  return { site, runtime, run, receipts, puts: () => puts };
}
test('registered primary MTU differences produce a bound replacement checkpoint without PUT', async () => {
  const f = fixture();
  await expect(f.run()).rejects.toThrow('coupled VM/site replacement');
  expect(f.puts()).toBe(0);
  expect(f.site.spec.aws.not_managed.node_list[0].interface_list[0].mtu).toBe(0);
  expect(f.receipts[0]).toMatchObject({
    evidenceKind: 'preboot-interface-configuration-required',
    owner: binding.owner,
    uid: 'site-uid',
    instances: { 'node-one': 'i-1234567890abcdef0' },
    interfaces: [{ ...expected[0], device: 'ens5' }],
  });
});
test('already configured MTU is verified without mutation or replacement', async () => {
  const f = fixture();
  f.site.spec.aws.not_managed.node_list[0].interface_list[0].mtu = 1500;
  await f.run();
  expect(f.puts()).toBe(0);
  expect(f.receipts[0].evidenceKind).toBe('configured-mtu');
});
test('MTU evidence rejects wrong ownership and missing resource version before replacement checkpoint', async () => {
  const foreign = fixture();
  foreign.site.metadata.labels['xcsh-ce-engine'] = 'native';
  await expect(foreign.run()).rejects.toThrow();
  expect(foreign.puts()).toBe(0);
  const missing = fixture();
  missing.site.resource_version = '';
  await expect(missing.run()).rejects.toThrow('resource version');
  expect(missing.puts()).toBe(0);
  const wrong = fixture();
  await expect(
    wrong.runtime.ensureAwsInterfaceMtu(
      { ...binding, owner: { ...binding.owner, engine: 'native' } },
      {},
      expected,
      async () => {},
    ),
  ).rejects.toThrow('owning');
  expect(wrong.puts()).toBe(0);
});

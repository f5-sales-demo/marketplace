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
  const contract = {
    siteReplaceRequest(snapshot: typeof site) {
      return {
        metadata: structuredClone(snapshot.metadata),
        spec: structuredClone(snapshot.spec),
        resource_version: snapshot.resource_version,
      };
    },
    validateSiteReplace() {},
  } as unknown as VerifiedCeContract;
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
      const request = JSON.parse(String(init.body));
      expect(request.resource_version).toBe('one');
      expect(request.spec.no_network_policy).toEqual({});
      site.spec = request.spec;
      site.resource_version = 'two';
      throw new Error('response lost after successful update');
    }
    return Response.json(site);
  });
  const run = () =>
    runtime.ensureAwsInterfaceMtu(binding, { 'node-one': 'i-1234567890abcdef0' }, expected, async (record) => {
      expect(record.packetMtu).toBe('unknown');
    });
  return { site, runtime, run, puts: () => puts };
}
test('MTU update uses resource version, preserves settings and reconciles an ambiguous response without another PUT', async () => {
  const f = fixture();
  await f.run();
  await f.run();
  expect(f.puts()).toBe(1);
  expect(f.site.spec.aws.not_managed.node_list[0].interface_list[0].mtu).toBe(1500);
});
test('MTU update rejects wrong ownership and missing concurrency evidence before mutation', async () => {
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

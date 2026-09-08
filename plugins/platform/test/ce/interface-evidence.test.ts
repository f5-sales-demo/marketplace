import { expect, test } from 'bun:test';
import { correlateCeInterfaces } from '../../src/ce/interface-evidence';

function fixture() {
  const mac = 'aa:bb:cc:dd:ee:ff';
  const metadata = { name: 'site-a', namespace: 'system' };
  const configuration = {
    metadata,
    system_metadata: { uid: 'site-uid' },
    spec: {
      aws: {
        not_managed: {
          node_list: [
            {
              hostname: 'node-a',
              interface_list: [
                { ethernet_interface: { mac, device: 'eth0' }, network_option: { site_local_network: {} }, mtu: 1500 },
              ],
            },
          ],
        },
      },
    },
  };
  const objects = {
    items: [
      {
        name: 'authoritative-interface-object',
        namespace: 'system',
        owner_view: { ...metadata, kind: 'securemesh_site_v2', uid: 'site-uid' },
        get_spec: { ethernet_interface: { node: 'node-a', device: 'eth0', site_local_network: {}, mtu: 1500 } },
      },
    ],
  };
  const physical = {
    metadata,
    status: [
      {
        metadata: {
          creator_class: 'ver',
          publish: 'STATUS_PUBLISH',
          vtrp_stale: false,
          creator_id: 'node-a.example.test',
        },
        ver_status: {
          intf_status: [
            {
              name: 'eth0',
              mac,
              link_state: true,
              link_type: 'LINK_TYPE_ETHERNET',
              network_type: 'VIRTUAL_NETWORK_SITE_LOCAL',
            },
          ],
        },
      },
    ],
  };
  const expected = [{ node: 'node-a', role: 'slo' as const, mac: mac.toUpperCase() }];
  return { configuration, objects, physical, expected };
}
test('resolves the authoritative object only through configured MAC, site UID, device and fresh physical link', () => {
  const f = fixture();
  const result = correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected);
  expect(result).toEqual([
    {
      node: 'node-a',
      role: 'slo',
      mac: 'aa:bb:cc:dd:ee:ff',
      device: 'eth0',
      interfaceName: 'authoritative-interface-object',
      mtu: 1500,
      linkUp: true,
    },
  ]);
});
test('rejects stale, down, duplicated, foreign-owner and wrong-MTU evidence', () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.physical.status[0].metadata.vtrp_stale = true;
    },
    (f: ReturnType<typeof fixture>) => {
      f.physical.status[0].ver_status.intf_status[0].link_state = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.objects.items.push(f.objects.items[0]);
    },
    (f: ReturnType<typeof fixture>) => {
      f.objects.items[0].owner_view.uid = 'foreign-site';
    },
    (f: ReturnType<typeof fixture>) => {
      f.objects.items[0].get_spec.ethernet_interface.mtu = 1400;
    },
  ]) {
    const f = fixture();
    mutate(f);
    expect(() => correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected)).toThrow();
  }
});

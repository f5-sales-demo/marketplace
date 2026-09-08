import { expect, test } from 'bun:test';
import { correlateCeInterfaces } from '../../src/ce/interface-evidence';
import recorded from '../fixtures/aws-site-publisher-links.json';

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
      ipv4: null,
    },
  ]);
});

test('collects IPv4 only from the correlated active physical interface', () => {
  const f = sitePublisherFixture();
  const link = f.physical.status[0].ver_status.intf_status[0];
  Object.assign(link, { active_state: 'STATE_ACTIVE', ip: { ipv4: { prefix: '10.20.1.10', plen: 24 } } });
  expect(correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected)[0].ipv4).toEqual({
    address: '10.20.1.10',
    prefixLength: 24,
  });
  f.physical.status[0].metadata.vtrp_stale = true;
  expect(() => correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected)).toThrow();
});

test('missing, inactive and malformed physical addresses remain unknown without losing link evidence', () => {
  for (const ip of [
    undefined,
    null,
    {},
    [],
    { ipv4: null },
    { ipv4: { prefix: '::1', plen: 24 } },
    { ipv4: { prefix: '10.20.1.10/24', plen: 24 } },
    { ipv4: { prefix: '10.20.1.10', plen: '24' } },
    { ipv4: { prefix: '10.20.1.10', plen: -1 } },
    { ipv4: { prefix: '10.20.1.10', plen: 33 } },
    { ipv4: { prefix: '10.20.1.10', plen: 24.5 } },
  ]) {
    const f = sitePublisherFixture();
    Object.assign(f.physical.status[0].ver_status.intf_status[0], { active_state: 'STATE_ACTIVE', ip });
    const result = correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected)[0];
    expect(result.ipv4).toBeNull();
    expect(result.linkUp).toBe(true);
  }
  const f = sitePublisherFixture();
  Object.assign(f.physical.status[0].ver_status.intf_status[0], {
    active_state: 'STATE_INACTIVE',
    ip: { ipv4: { prefix: '10.20.1.10', plen: 24 } },
  });
  expect(correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected)[0].ipv4).toBeNull();
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

function sitePublisherFixture() {
  const f = fixture();
  return {
    ...f,
    physical: {
      ...f.physical,
      system_metadata: { uid: 'physical-site-uid' },
      status: [
        {
          ...f.physical.status[0],
          metadata: { ...f.physical.status[0].metadata, creator_id: 'site-a', status_id: 'node-a_SiteStatusMgr' },
          ver_status: { ...f.physical.status[0].ver_status, ver_instance_name: 'node-a-site-a' },
          object_refs: [{ kind: 'ves.io.vega.cfg.site.Object', uid: 'physical-site-uid' }],
        },
      ],
    },
  };
}
test('correlates site-published node links using both node identifiers and physical-site UID', () => {
  const f = sitePublisherFixture();
  expect(correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected)[0].interfaceName).toBe(
    'authoritative-interface-object',
  );
});
test('rejects conflicting site-publisher node identities, stale links, references and duplicate publications', () => {
  for (const mutate of [
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.status[0].metadata.creator_id = 'foreign-site';
    },
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.status[0].metadata.status_id = 'other-node_SiteStatusMgr';
    },
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.status[0].ver_status.ver_instance_name = 'other-node-site-a';
    },
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.status[0].object_refs[0].uid = 'foreign-uid';
    },
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.status[0].object_refs = [];
    },
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.system_metadata.uid = '';
    },
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.status[0].metadata.vtrp_stale = true;
    },
    (f: ReturnType<typeof sitePublisherFixture>) => {
      f.physical.status.push(f.physical.status[0]);
    },
  ]) {
    const f = sitePublisherFixture();
    mutate(f);
    expect(() => correlateCeInterfaces(f.configuration, f.objects, f.physical, f.expected)).toThrow();
  }
});

test('replays sanitized current AWS site-publisher interface evidence', () => {
  const expected = recorded.expected.map((item) => ({ ...item, role: item.role as 'slo' | 'sli' }));
  const interfaces = correlateCeInterfaces(recorded.configuration, recorded.objects, recorded.physical, expected);
  expect(interfaces).toHaveLength(2);
  expect(interfaces.map((item) => item.role)).toEqual(['slo', 'sli']);
  expect(interfaces.every((item) => item.linkUp && item.mtu === 1500)).toBe(true);
});

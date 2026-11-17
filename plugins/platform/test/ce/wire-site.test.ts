import { expect, test } from 'bun:test';
import { buildWireSite, type WireSiteIntent } from '../../src/ce/wire-site';
import nodeLocalServicesAlias from '../fixtures/node-local-services-wire-alias.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import fixtureCompact from '../fixtures/smsv2-create-schema.json';

const fixture = resolveCeSchemaFixture(fixtureCompact);

const node = (number: number) => ({
  hostname: `ce-${number}`,
  interfaces: [
    {
      name: 'slo',
      mtu: 1500,
      ethernet_interface: { mac: `02:00:00:00:0${number}:01`, device: 'ens5' },
      network_option: { site_local_network: {} },
      dhcp_client: {},
    },
    {
      name: 'sli',
      mtu: 1500,
      ethernet_interface: { mac: `02:00:00:00:0${number}:02`, device: 'ens6' },
      network_option: { site_local_inside_network: {} },
      dhcp_client: {},
    },
  ],
});
const intent = (): WireSiteIntent => ({
  schemaVersion: 2,
  provider: 'aws',
  haMode: 'one-node',
  nodes: [node(1)],
  settings: {},
});

test('maps independent single-node sites and true HA through both cloud schemas', () => {
  for (const provider of ['aws', 'azure'] as const) {
    const singles = [1, 2, 3].map((number) =>
      buildWireSite({ ...intent(), provider, nodes: [node(number)] }, fixture.schemas),
    );
    expect(singles.every((spec) => Object.hasOwn(spec, 'disable_ha'))).toBe(true);
    const ha = buildWireSite(
      { ...intent(), provider, haMode: 'three-node', nodes: [node(1), node(2), node(3)] },
      fixture.schemas,
    );
    expect(ha.enable_ha).toEqual({});
    expect(ha[provider]).toEqual({
      not_managed: {
        node_list: [1, 2, 3].map((number) => ({
          hostname: `ce-${number}`,
          type: 'Control',
          interface_list: node(number).interfaces.map((iface) => ({
            ...iface,
            ...(iface.name === 'slo'
              ? { site_to_site_connectivity_interface_enabled: {} }
              : { site_to_site_connectivity_interface_disabled: {} }),
          })),
        })),
      },
    });
    expect(ha).not.toHaveProperty('provider');
  }
});
test('refuses duplicate identities, incomplete HA and asymmetric interfaces', () => {
  const ha = { ...intent(), haMode: 'three-node' as const, nodes: [node(1), node(2), node(3)] };
  for (const value of [
    { ...ha, nodes: [node(1), node(2)] },
    { ...ha, nodes: [node(1), node(1), node(3)] },
    { ...ha, nodes: [node(1), node(2), { ...node(3), interfaces: node(3).interfaces.slice(0, 1) }] },
  ])
    expect(() => buildWireSite(value, fixture.schemas)).toThrow();
});
test('accepts schema-supported advanced choices and rejects identity overrides', () => {
  const spec = buildWireSite(
    {
      ...intent(),
      settings: { enable_url_categorization: {}, dns_ntp_config: { f5_dns_default: {}, f5_ntp_default: {} } },
    },
    fixture.schemas,
  );
  expect(spec).not.toHaveProperty('disable_url_categorization');
  expect(spec.enable_url_categorization).toEqual({});
  for (const settings of [
    { azure: {} },
    { enable_management_network: {} },
    { enable_ha: {} },
    { non_existent_setting: {} },
  ])
    expect(() => buildWireSite({ ...intent(), settings }, fixture.schemas)).toThrow();
});

test('rejects AWS MAC-only create before wire submission without asserting Azure runtime equivalence', () => {
  const value = intent();
  for (const iface of value.nodes[0].interfaces) delete (iface.ethernet_interface as Record<string, unknown>).device;
  expect(() => buildWireSite(value, fixture.schemas)).toThrow('observed AWS guest device');
  expect(() => buildWireSite({ ...value, provider: 'azure' }, fixture.schemas)).not.toThrow();
});

test('selective local-service policy supersedes block-all and requires the exact wire spelling', () => {
  const schemas = structuredClone(fixture.schemas);
  (schemas.fleetBlockedServicesListType.properties.blocked_service as Record<string, unknown>)['x-f5xc-wire-name'] =
    nodeLocalServicesAlias.wireName;
  const blocked_sevice = [
    { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL', dns: {} },
    { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL', web_user_interface: {} },
    { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE', dns: {} },
    { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE', ssh: {} },
    { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE', web_user_interface: {} },
  ];
  const spec = buildWireSite({ ...intent(), settings: { blocked_services: { blocked_sevice } } }, schemas);
  expect(spec).not.toHaveProperty('block_all_services');
  expect(spec.blocked_services).toEqual({ blocked_sevice });
  expect(() =>
    buildWireSite({ ...intent(), settings: { blocked_services: { blocked_service: blocked_sevice } } }, schemas),
  ).toThrow();
});

import { expect, test } from 'bun:test';
import { buildWireSite, type WireSiteIntent } from '../../src/ce/wire-site';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import fixtureCompact from '../fixtures/smsv2-create-schema.json';

const fixture = resolveCeSchemaFixture(fixtureCompact);
type Json = Record<string, unknown>;
function intent(provider: 'aws' | 'azure', haMode: 'one-node' | 'three-node'): WireSiteIntent {
  return {
    schemaVersion: 2,
    provider,
    haMode,
    settings: {},
    nodes: Array.from({ length: haMode === 'three-node' ? 3 : 1 }, (_, index) => ({
      hostname: `ce-${index + 1}`,
      interfaces: ['slo', 'sli'].map((role, slot) => ({
        name: role,
        mtu: 1500,
        dhcp_client: {},
        ethernet_interface: { mac: `02:00:00:00:0${index + 1}:0${slot + 1}`, device: `ens${slot + 5}` },
        network_option: role === 'slo' ? { site_local_network: {} } : { site_local_inside_network: {} },
      })),
    })),
  };
}
function interfaces(spec: Json, provider: 'aws' | 'azure'): Json[][] {
  return (((spec[provider] as Json).not_managed as Json).node_list as Json[]).map(
    (node) => node.interface_list as Json[],
  );
}
for (const provider of ['aws', 'azure'] as const) {
  for (const haMode of ['one-node', 'three-node'] as const) {
    test(`${provider}/${haMode} selects SLO connectivity without mutating the caller or setting computed flags`, () => {
      const value = intent(provider, haMode),
        before = structuredClone(value);
      for (const [slo, sli] of interfaces(buildWireSite(value, fixture.schemas), provider)) {
        expect(slo.site_to_site_connectivity_interface_enabled).toEqual({});
        expect(slo).not.toHaveProperty('site_to_site_connectivity_interface_disabled');
        expect(sli.site_to_site_connectivity_interface_disabled).toEqual({});
        expect(sli).not.toHaveProperty('site_to_site_connectivity_interface_enabled');
        for (const iface of [slo, sli]) {
          expect(iface).not.toHaveProperty('is_primary');
          expect(iface).not.toHaveProperty('is_management');
        }
      }
      expect(value).toEqual(before);
    });
    test(`${provider}/${haMode} preserves explicit connectivity choices`, () => {
      const value = intent(provider, haMode);
      for (const node of value.nodes) {
        node.interfaces[0].site_to_site_connectivity_interface_disabled = {};
        node.interfaces[1].site_to_site_connectivity_interface_enabled = {};
      }
      for (const [slo, sli] of interfaces(buildWireSite(value, fixture.schemas), provider)) {
        expect(slo.site_to_site_connectivity_interface_disabled).toEqual({});
        expect(slo).not.toHaveProperty('site_to_site_connectivity_interface_enabled');
        expect(sli.site_to_site_connectivity_interface_enabled).toEqual({});
        expect(sli).not.toHaveProperty('site_to_site_connectivity_interface_disabled');
      }
    });
  }
  test(`${provider} rejects conflicting connectivity choices`, () => {
    const value = intent(provider, 'one-node');
    value.nodes[0].interfaces[0].site_to_site_connectivity_interface_disabled = {};
    value.nodes[0].interfaces[0].site_to_site_connectivity_interface_enabled = {};
    expect(() => buildWireSite(value, fixture.schemas)).toThrow();
  });
  test(`${provider} rejects asymmetric HA connectivity choices`, () => {
    const value = intent(provider, 'three-node');
    value.nodes[1].interfaces[0].site_to_site_connectivity_interface_disabled = {};
    expect(() => buildWireSite(value, fixture.schemas)).toThrow('homogeneous');
  });
}

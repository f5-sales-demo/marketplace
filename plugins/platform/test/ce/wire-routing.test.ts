import { expect, test } from 'bun:test';
import { buildAwsRouting, buildAzureRouting, routingValidators } from '../../src/ce/wire-routing';
import fixture from '../fixtures/aws-routing-schema.json';

const validate = routingValidators(fixture.schemas.network, fixture.schemas.marketplace);
const bindings = [0, 1].map((index) => ({
  name: `connector-${index}`,
  node: 'ce-1',
  interfaceName: `eth${index}`,
  interfaceMtu: 1500,
  awsGreAddress: `100.64.0.${index + 1}`,
  ceInsideAddress: `169.254.${index + 10}.1`,
  awsBgpAddresses: [`169.254.${index + 10}.2`, `169.254.${index + 10}.3`] as [string, string],
}));
test('builds two GRE connectors and all four BGP endpoints against immutable API request schemas', () => {
  const result = buildAwsRouting('site-a', 65010, 64512, bindings, ['10.253.0.0/16'], validate);
  expect(result.connectors).toHaveLength(2);
  expect(result.exportPolicy).toEqual({
    name: 'site-a-tgw-export-policy',
    spec: {
      rules: [
        {
          match: { ip_prefixes: { prefixes: [{ ip_prefixes: '10.253.0.0/16', equal_or_longer_than: {} }] } },
          action: { deny: {} },
        },
      ],
    },
  });
  expect(result.bgp.spec.peers).toHaveLength(4);
  expect(result.bgp.spec.peers[0]).not.toHaveProperty('routing_policies');
  expect(result.connectors[0].spec.gre.gre_parameters.site_local_inside_network).toEqual({});
  expect(result.connectors[0].spec.gre.gre_parameters).not.toHaveProperty('site_local_network');
  expect(result.connectors[0].spec.gre.gre_parameters.tunnel_mtu).toBe(1370);
  expect(result.ebgpMultihopTtlEvidence).toBe('unknown');
});
test('rejects duplicate endpoints, invalid interface evidence and invented TTL fields', () => {
  expect(() =>
    buildAwsRouting('site-a', 65010, 64512, [bindings[0], bindings[0]], ['10.253.0.0/16'], validate),
  ).toThrow();
  expect(() =>
    buildAwsRouting(
      'site-a',
      65010,
      64512,
      [{ ...bindings[0], interfaceName: '__UNRESOLVED__' }],
      ['10.253.0.0/16'],
      validate,
    ),
  ).toThrow();
  expect(() =>
    buildAwsRouting(
      'site-a',
      65010,
      64512,
      [{ ...bindings[0], ceInsideAddress: '169.254.99.1' }],
      ['10.253.0.0/16'],
      validate,
    ),
  ).toThrow('inside network');
  const result = buildAwsRouting('site-a', 65010, 64512, bindings, ['10.253.0.0/16'], validate);
  expect(() => validate('bgp', { ...result.bgp.spec, ttl: 2 })).toThrow();
  expect(() =>
    validate('bgp_routing_policy', {
      rules: [{ match: { ip_prefixes: { prefixes: [{ ip_prefixes: 'invalid', equal_or_longer_than: {} }] } } }],
    }),
  ).toThrow();
});

test('builds schema-validated Azure Route Server peers on authoritative SLO interfaces', () => {
  const result = buildAzureRouting(
    'site-a',
    65010,
    65515,
    [
      { node: 'ce-1', interfaceName: 'observed-slo-one' },
      { node: 'ce-2', interfaceName: 'observed-slo-two' },
      { node: 'ce-3', interfaceName: 'observed-slo-three' },
    ],
    ['10.20.0.4', '10.20.0.5'],
    validate,
  );
  expect(result.bgp.name).toBe('site-a-route-server-bgp');
  expect(result.bgp.spec.where).toEqual({
    site: {
      network_type: 'VIRTUAL_NETWORK_SITE_LOCAL',
      ref: [{ name: 'site-a', namespace: 'system' }],
      disable_internet_vip: {},
    },
  });
  expect(result.bgp.spec.bgp_parameters).toEqual({ asn: 65010, local_address: {} });
  expect(result.bgp.spec.peers).toHaveLength(6);
  expect(result.bgp.spec.peers[0]).toEqual({
    metadata: { name: 'peer-1-1' },
    external: {
      asn: 65515,
      address: '10.20.0.4',
      port: 179,
      interface: { name: 'observed-slo-one', namespace: 'system' },
      disable_v6: {},
    },
    passive_mode_disabled: {},
    bfd_disabled: {},
  });
  expect(result.expectedSessions).toBe(6);
});

test('rejects substituted Azure interfaces, service addresses and non-Route-Server ASNs', () => {
  const valid = [{ node: 'ce-1', interfaceName: 'observed-slo-one' }];
  for (const bindings of [
    [...valid, ...valid],
    [{ node: 'ce-1', interfaceName: '__UNRESOLVED__' }],
    [
      { node: 'ce-1', interfaceName: 'observed-slo-one' },
      { node: 'ce-2', interfaceName: 'observed-slo-one' },
    ],
  ]) {
    expect(() => buildAzureRouting('site-a', 65010, 65515, bindings, ['10.20.0.4', '10.20.0.5'], validate)).toThrow();
  }
  for (const addresses of [['10.20.0.4'], ['10.20.0.4', '10.20.0.4'], ['10.20.0.4', '2001:db8::1']]) {
    expect(() => buildAzureRouting('site-a', 65010, 65515, valid, addresses, validate)).toThrow();
  }
  expect(() => buildAzureRouting('site-a', 65010, 64512, valid, ['10.20.0.4', '10.20.0.5'], validate)).toThrow(
    'Route Server',
  );
});

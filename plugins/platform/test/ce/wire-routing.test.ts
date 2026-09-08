import { expect, test } from 'bun:test';
import { buildAwsRouting, routingValidators } from '../../src/ce/wire-routing';
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
  const result = buildAwsRouting('site-a', 65010, 64512, bindings, validate);
  expect(result.connectors).toHaveLength(2);
  expect(result.bgp.spec.peers).toHaveLength(4);
  expect(result.connectors[0].spec.gre.gre_parameters.site_local_inside_network).toEqual({});
  expect(result.connectors[0].spec.gre.gre_parameters.tunnel_mtu).toBe(1370);
  expect(result.ebgpMultihopTtlEvidence).toBe('unknown');
});
test('rejects duplicate endpoints, invalid interface evidence and invented TTL fields', () => {
  expect(() => buildAwsRouting('site-a', 65010, 64512, [bindings[0], bindings[0]], validate)).toThrow();
  expect(() =>
    buildAwsRouting('site-a', 65010, 64512, [{ ...bindings[0], interfaceName: '__UNRESOLVED__' }], validate),
  ).toThrow();
  expect(() =>
    buildAwsRouting('site-a', 65010, 64512, [{ ...bindings[0], ceInsideAddress: '169.254.99.1' }], validate),
  ).toThrow('inside network');
  const result = buildAwsRouting('site-a', 65010, 64512, bindings, validate);
  expect(() => validate('bgp', { ...result.bgp.spec, ttl: 2 })).toThrow();
});

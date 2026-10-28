import { expect, test } from 'bun:test';
import { buildAwsBgpPowerPolicyRevision } from '../../src/ce/bgp-power-policy';
import { buildAwsRouting, routingValidators } from '../../src/ce/wire-routing';
import fixture from '../fixtures/aws-routing-schema.json';

const validate = routingValidators(fixture.schemas.network, fixture.schemas.marketplace);
const routing = () =>
  buildAwsRouting(
    'site-a',
    65010,
    64512,
    [
      {
        name: 'ce-gre',
        node: 'ce-1',
        interfaceName: 'ens6',
        interfaceMtu: 1500,
        awsGreAddress: '100.64.0.1',
        ceInsideAddress: '169.254.10.1',
        awsBgpAddresses: ['169.254.10.2', '169.254.10.3'],
      },
    ],
    ['10.253.0.0/16'],
    validate,
  );
test('maintenance BGP policy attaches explicit outbound service-prefix denial and restores original peers', () => {
  const base = routing();
  const withdrawal = buildAwsBgpPowerPolicyRevision(base.bgp.spec, 'site-a', ['10.200.0.0/16'], 'withdraw', validate);
  expect(withdrawal.policy.spec).toEqual({
    rules: [
      {
        match: { ip_prefixes: { prefixes: [{ ip_prefixes: '10.200.0.0/16', equal_or_longer_than: {} }] } },
        action: { deny: {} },
      },
    ],
  });
  expect(withdrawal.bgpSpec.peers).toHaveLength(2);
  expect(withdrawal.bgpSpec.peers[0].routing_policies).toEqual({
    route_policy: [
      { all_nodes: {}, outbound: {}, object_refs: [{ name: 'site-a-tgw-power-policy', namespace: 'system' }] },
    ],
  });
  for (let i = 0; i < 2; i++) {
    expect(withdrawal.bgpSpec.peers[i].external).toEqual(base.bgp.spec.peers[i].external);
    expect(withdrawal.bgpSpec.peers[i]).not.toHaveProperty('disable');
  }
  const restore = buildAwsBgpPowerPolicyRevision(
    withdrawal.bgpSpec,
    'site-a',
    ['10.200.0.0/16'],
    'restore',
    validate,
    withdrawal,
  );
  expect(restore.bgpSpec).toEqual(base.bgp.spec);
  expect(restore.operationalEvidence).toBe('unknown');
});
for (const mode of [
  'unresolved',
  'default-route',
  'duplicate',
  'foreign-policy',
  'missing-retained',
  'tampered-retained',
] as const)
  test(`BGP maintenance policy ${mode} rejects`, () => {
    const base = routing();
    let prefixes = ['10.200.0.0/16'];
    if (mode === 'unresolved') prefixes = ['__SERVICE_PREFIX__'];
    if (mode === 'default-route') prefixes = ['0.0.0.0/0'];
    if (mode === 'duplicate') prefixes.push(prefixes[0]);
    if (mode === 'foreign-policy') Object.assign(base.bgp.spec.peers[0], { routing_policies: { route_policy: [] } });
    const withdrawal =
      mode === 'tampered-retained'
        ? buildAwsBgpPowerPolicyRevision(base.bgp.spec, 'site-a', prefixes, 'withdraw', validate)
        : undefined;
    if (withdrawal) withdrawal.originalBgpSpec.peers[0].external.address = '169.254.10.99';
    expect(() =>
      buildAwsBgpPowerPolicyRevision(
        withdrawal?.bgpSpec ?? base.bgp.spec,
        'site-a',
        prefixes,
        mode === 'missing-retained' || mode === 'tampered-retained' ? 'restore' : 'withdraw',
        validate,
        withdrawal,
      ),
    ).toThrow();
  });

import { expect, test } from 'bun:test';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import { buildAzureRelayRouting, buildAzureRouting, routingValidators } from '../../src/ce/wire-routing';
import fixtureCompact from '../fixtures/aws-routing-schema.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contractFixture from '../fixtures/smsv2-contract-v7.json';
import createCompact from '../fixtures/smsv2-create-schema.json';

const unresolved = (name: string) => ['$', '{', name, '}'].join('');
const fixture = resolveCeSchemaFixture(fixtureCompact);
const validate = routingValidators(fixture.schemas.network, fixture.schemas.marketplace);
const createSchema = resolveCeSchemaFixture(createCompact);
type FixtureConstructor = new (
  commit: string,
  fingerprint: string,
  contract: Record<string, unknown>,
  schemas: Record<string, unknown>,
  networking: { network: Record<string, unknown>; marketplace: Record<string, unknown> } | undefined,
  publication: 'published-release',
) => VerifiedCeContract;
function verifiedContract(networking = true) {
  const Constructor = VerifiedCeContract as unknown as FixtureConstructor;
  return new Constructor(
    createSchema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    contractFixture,
    createSchema.schemas,
    networking ? fixture.schemas : undefined,
    'published-release',
  );
}
const slo = [1, 2, 3].map((node) => ({ node: `ce-${node}`, interfaceName: `owned-slo-${node}`, role: 'slo' as const }));
const relays = [
  { name: 'relay-a', address: '10.20.1.4', asn: 65001 },
  { name: 'relay-b', address: '10.20.1.5', asn: 65002 },
];

test('builds ordinary site-local CE BGP to both relays for every SLO', () => {
  for (const interfaces of [slo.slice(0, 1), slo]) {
    const result = buildAzureRelayRouting('site-a', 65010, interfaces, relays, validate);
    expect(result.bgp.name).toBe('site-a-relay-bgp');
    expect(result.expectedSessions).toBe(interfaces.length * 2);
    expect(result.payloadNetwork).toBe('slo');
    expect(result.bgp.spec.where).toEqual({
      site: {
        network_type: 'VIRTUAL_NETWORK_SITE_LOCAL',
        ref: [{ name: 'site-a', namespace: 'system' }],
        disable_internet_vip: {},
      },
    });
    expect(result.bgp.spec.bgp_parameters).toEqual({ asn: 65010, local_address: {} });
    expect(result.bgp.spec.peers).toHaveLength(interfaces.length * 2);
    expect(result.bgp.spec.peers[0]).toEqual({
      metadata: { name: 'peer-1-1' },
      external: {
        asn: 65001,
        address: '10.20.1.4',
        port: 179,
        interface: { name: 'owned-slo-1', namespace: 'system' },
        disable_v6: {},
      },
      passive_mode_disabled: {},
      bfd_disabled: {},
    });
    expect(result.expectedPeers).toEqual(
      interfaces.flatMap((binding) =>
        relays.map((relay) => ({
          node: binding.node,
          interfaceName: binding.interfaceName,
          peerAddress: relay.address,
          peerAsn: relay.asn,
          relayName: relay.name,
        })),
      ),
    );
    expect(result.bgp.spec).not.toHaveProperty('ttl');
    expect(result.bgp.spec).not.toHaveProperty('ebgp_multihop');
  }
});

test('is deterministic under discovery order and does not mutate caller bindings', () => {
  const before = structuredClone({ slo, relays });
  const normal = buildAzureRelayRouting('site-a', 65010, slo, relays, validate);
  expect(buildAzureRelayRouting('site-a', 65010, [...slo].reverse(), [...relays].reverse(), validate)).toEqual(normal);
  expect({ slo, relays }).toEqual(before);
  const long = buildAzureRelayRouting('s'.repeat(63), 65010, slo, relays, validate);
  expect(long.bgp.name.length).toBeLessThanOrEqual(63);
  expect(buildAzureRelayRouting(`${'s'.repeat(62)}a`, 65010, slo, relays, validate).bgp.name).not.toBe(
    buildAzureRelayRouting(`${'s'.repeat(62)}b`, 65010, slo, relays, validate).bgp.name,
  );
});

test('rejects incomplete, duplicated, unresolved or non-SLO interface scope before schema execution', () => {
  for (const bindings of [
    [],
    slo.slice(0, 2),
    [...slo, slo[0]],
    [{ ...slo[0], node: '__UNRESOLVED__' }],
    [{ ...slo[0], interfaceName: unresolved('runtime-interface') }],
    [{ ...slo[0], role: 'sli' }],
    [{ ...slo[0], role: undefined }],
    [slo[0], { ...slo[1], node: slo[0].node }, slo[2]],
    [slo[0], { ...slo[1], interfaceName: slo[0].interfaceName }, slo[2]],
  ]) {
    let validations = 0;
    expect(() =>
      buildAzureRelayRouting('site-a', 65010, bindings as typeof slo, relays, () => {
        validations++;
      }),
    ).toThrow();
    expect(validations).toBe(0);
  }
});

test('rejects missing, duplicate, unresolved and non-unicast relay peers before schema execution', () => {
  for (const peers of [
    [],
    relays.slice(0, 1),
    [...relays, relays[0]],
    [relays[0], { ...relays[1], name: relays[0].name }],
    [relays[0], { ...relays[1], address: relays[0].address }],
    [{ ...relays[0], name: '__UNRESOLVED__' }, relays[1]],
    ...[
      unresolved('relay-address'),
      '',
      '2001:db8::1',
      '0.0.0.0',
      '0.1.2.3',
      '127.0.0.1',
      '169.254.1.1',
      '224.0.0.1',
      '255.255.255.255',
    ].map((address) => [{ ...relays[0], address }, relays[1]]),
  ]) {
    let validations = 0;
    expect(() =>
      buildAzureRelayRouting('site-a', 65010, slo, peers, () => {
        validations++;
      }),
    ).toThrow();
    expect(validations).toBe(0);
  }
});

test('rejects equal, invalid, reserved and direct Route Server ASNs', () => {
  for (const asn of [
    0,
    -1,
    1.2,
    NaN,
    65535,
    23456,
    65515,
    8074,
    8075,
    12076,
    64496,
    64511,
    65517,
    65518,
    65519,
    65520,
  ]) {
    expect(() => buildAzureRelayRouting('site-a', asn, slo, relays, validate)).toThrow();
    expect(() => buildAzureRelayRouting('site-a', 65010, slo, [{ ...relays[0], asn }, relays[1]], validate)).toThrow();
  }
  expect(() =>
    buildAzureRelayRouting('site-a', 65010, slo, [{ ...relays[0], asn: 65010 }, relays[1]], validate),
  ).toThrow();
  expect(() => buildAzureRelayRouting(unresolved('site'), 65010, slo, relays, validate)).toThrow();
});

test('propagates exact schema failures and preserves the dedicated direct Route Server contract', () => {
  expect(() =>
    buildAzureRelayRouting('site-a', 65010, slo, relays, () => {
      throw new Error('exact schema rejected');
    }),
  ).toThrow('exact schema rejected');
  expect(() =>
    buildAzureRouting(
      'site-a',
      65010,
      65001,
      slo,
      relays.map((r) => r.address),
      validate,
    ),
  ).toThrow('Route Server');
  const built = buildAzureRelayRouting('site-a', 65010, slo, relays, validate);
  expect(() => validate('bgp', { ...built.bgp.spec, ebgp_multihop: 2 })).toThrow();
});

test('exposes a verified-contract builder separately from the direct Route Server guard', () => {
  const contract = verifiedContract();
  expect(contract.buildAzureRelayRouting('site-a', 65010, slo, relays)).toEqual(
    buildAzureRelayRouting('site-a', 65010, slo, relays, validate),
  );
  expect(() =>
    contract.buildAzureRelayRouting('site-a', 65010, slo, [{ ...relays[0], asn: 65515 }, relays[1]]),
  ).toThrow();
  expect(() => verifiedContract(false).buildAzureRelayRouting('site-a', 65010, slo, relays)).toThrow('schemas');
  expect(() => contract.requireAzureRouteServerEbgpMultihop()).toThrow('no_schema_valid_ebgp_multihop_request_control');
});

import { expect, test } from 'bun:test';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import { buildAzureRelayRouting, buildAzureRouting, routingValidators } from '../../src/ce/wire-routing';
import fixtureCompact from '../fixtures/aws-routing-schema.json';
import relayEnvelope from '../fixtures/azure-relay-create-envelope.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contractFixture from '../fixtures/smsv2-contract-v7.json';
import createCompact from '../fixtures/smsv2-create-schema.json';

const unresolved = (name: string) => ['$', '{', name, '}'].join('');
const fixture = resolveCeSchemaFixture(fixtureCompact);
const validate = routingValidators(fixture.schemas.network, fixture.schemas.marketplace);
const createSchema = resolveCeSchemaFixture(createCompact);
const relaySchemas = {
  ...fixture.schemas,
  network: { ...createSchema.schemas, ...fixture.schemas.network, bgpCreateRequest: relayEnvelope.schema },
};
type FixtureConstructor = new (
  commit: string,
  fingerprint: string,
  contract: Record<string, unknown>,
  schemas: Record<string, unknown>,
  networking: { network: Record<string, unknown>; marketplace: Record<string, unknown> } | undefined,
  publication: 'published-release',
) => VerifiedCeContract;
function verifiedContract(
  networking = true,
  contract: Record<string, unknown> = contractFixture,
  routing = relaySchemas,
) {
  const Constructor = VerifiedCeContract as unknown as FixtureConstructor;
  return new Constructor(
    createSchema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    contract,
    createSchema.schemas,
    networking ? routing : undefined,
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

test('relay admission requires complete published request schemas and CE observation contracts', () => {
  expect(() => verifiedContract().requireAzureRelayRoutingContract()).not.toThrow();
  expect(() => verifiedContract(false).requireAzureRelayRoutingContract()).toThrow('schemas');
  const missingRequest = structuredClone(relaySchemas);
  delete (missingRequest.network as Record<string, unknown>).bgpCreateRequest;
  expect(() => verifiedContract(true, contractFixture, missingRequest).requireAzureRelayRoutingContract()).toThrow();
  for (const endpoint of ['configuration', 'bgp_peers', 'bgp_routes'] as const) {
    const contract = structuredClone(contractFixture);
    contract.providers.azure.runtime[endpoint].method = 'POST';
    const verified = verifiedContract(true, contract);
    expect(() => verified.requireAzureRelayRoutingContract()).toThrow('observation mapping');
    expect(() => verified.requireRoutingContract('azure')).toThrow('no_schema_valid_ebgp_multihop_request_control');
  }
});

function relayRuntimeFixture(engine: 'native' | 'terraform' = 'native', contract = verifiedContract()) {
  const binding: SiteBinding = {
    owner: {
      deploymentId: 'relay-demo',
      engine,
      provider: 'azure',
      account: 'example-synthetic-subscription',
      region: 'eastus',
    },
    siteName: 'site-a',
    nodes: slo.map((item) => item.node),
  };
  const labels = {
    'xcsh-ce-deployment': binding.owner.deploymentId,
    'xcsh-ce-engine': engine,
    'xcsh-ce-provider': 'azure',
    'xcsh-ce-account': binding.owner.account,
    'xcsh-ce-region': binding.owner.region,
  };
  let siteUid = 'site-uid';
  let bgp: Record<string, unknown> | undefined;
  let routes: Record<string, unknown> | undefined;
  let routeReads = 0;
  let posts = 0;
  let delegated = 0;
  let siteReads = 0;
  let loseResponse = false;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
  const fetcher = async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('/securemesh_site_v2s/')) {
      siteReads++;
      return json({ metadata: { name: 'site-a', namespace: 'system', labels }, system_metadata: { uid: siteUid } });
    }
    if (String(url).endsWith('/ver/bgp_routes')) {
      routeReads++;
      return json(routes ?? {});
    }
    if (init?.method === 'POST') {
      posts++;
      bgp = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'bgp-uid' } };
      if (loseResponse) throw Error('lost response');
      return json({});
    }
    return bgp ? json(bgp) : json({}, 404);
  };
  const runtime = new CeRuntime(
    contract,
    engine,
    'https://synthetic.test',
    'synthetic-credential',
    fetcher,
    engine === 'terraform'
      ? async (_owner, path, init) => {
          if (init.method === 'RECONCILE') return {};
          delegated++;
          const response = await fetcher(path, init);
          return (await response.json()) as Record<string, unknown>;
        }
      : undefined,
  );
  return {
    runtime,
    binding,
    labels,
    get posts() {
      return posts;
    },
    get delegated() {
      return delegated;
    },
    get bgp() {
      return bgp;
    },
    get siteReads() {
      return siteReads;
    },
    set routeResponse(value: Record<string, unknown>) {
      routes = value;
    },
    get routeReads() {
      return routeReads;
    },
    set uid(value: string) {
      siteUid = value;
    },
    set loseResponse(value: boolean) {
      loseResponse = value;
    },
  };
}

test('relay runtime rejects missing observation contracts before cloud or platform mutation', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const contract = structuredClone(contractFixture);
    contract.providers.azure.runtime.bgp_routes.method = 'POST';
    const f = relayRuntimeFixture(engine, verifiedContract(true, contract));
    await expect(f.runtime.ensureAzureRelayRouting(f.binding, 65010, slo, relays, async () => {})).rejects.toThrow(
      'observation mapping',
    );
    expect(f.siteReads).toBe(0);
    expect(f.posts).toBe(0);
    expect(f.delegated).toBe(0);
  }
});

test('relay runtime binds configured BGP to owned logical UID and reconciles response loss for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = relayRuntimeFixture(engine);
    f.loseResponse = engine === 'native';
    const checkpoints: Record<string, unknown>[] = [];
    const run = () =>
      f.runtime.ensureAzureRelayRouting(f.binding, 65010, slo, relays, async (record) => {
        checkpoints.push(record);
      });
    await run();
    await run();
    expect(f.posts).toBe(1);
    expect(f.delegated).toBe(engine === 'terraform' ? 1 : 0);
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0]).toMatchObject({
      kind: 'bgp',
      name: 'site-a-relay-bgp',
      uid: 'bgp-uid',
      siteUid: 'site-uid',
      localAsn: 65010,
      expectedSessions: 6,
      relays,
      interfaces: slo,
    });
    expect(f.bgp?.metadata).toMatchObject({
      labels: { ...f.labels, 'xcsh-ce-site': 'site-a', 'xcsh-ce-site-uid': 'site-uid' },
    });
  }
});

test('relay runtime rejects foreign engines, interface scope and invalid peers before any request', async () => {
  const f = relayRuntimeFixture();
  const checkpoint = async () => {};
  await expect(
    f.runtime.ensureAzureRelayRouting(
      { ...f.binding, owner: { ...f.binding.owner, engine: 'terraform' } },
      65010,
      slo,
      relays,
      checkpoint,
    ),
  ).rejects.toThrow('owning');
  await expect(
    f.runtime.ensureAzureRelayRouting(
      f.binding,
      65010,
      [...slo.slice(0, 2), { ...slo[2], node: 'foreign-node' }],
      relays,
      checkpoint,
    ),
  ).rejects.toThrow('ownership');
  await expect(
    f.runtime.ensureAzureRelayRouting(f.binding, 65010, slo, [relays[0], { ...relays[1], asn: 65515 }], checkpoint),
  ).rejects.toThrow();
  expect(f.siteReads).toBe(0);
  expect(f.posts).toBe(0);
});

test('relay runtime refuses foreign BGP objects, changed specs and changed logical site UID', async () => {
  for (const kind of ['owner', 'spec', 'site'] as const) {
    const f = relayRuntimeFixture();
    await f.runtime.ensureAzureRelayRouting(f.binding, 65010, slo, relays, async () => {});
    if (!f.bgp) throw Error('missing BGP object');
    if (kind === 'owner')
      (f.bgp.metadata as { labels: Record<string, unknown> }).labels['xcsh-ce-engine'] = 'terraform';
    if (kind === 'spec') (f.bgp.spec as { bgp_parameters: { asn: number } }).bgp_parameters.asn = 65011;
    if (kind === 'site') f.uid = 'replacement-site-uid';
    let saved = 0;
    await expect(
      f.runtime.ensureAzureRelayRouting(f.binding, 65010, slo, relays, async () => {
        saved++;
      }),
    ).rejects.toThrow();
    expect(f.posts).toBe(1);
    expect(saved).toBe(0);
  }
});

test('owned public runtime route observation retains exact path evidence and separates unavailable paths', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = relayRuntimeFixture(engine);
    const response = {
      ver: slo.map(({ node }) => ({
        name: node,
        ri_table: [
          {
            routing_instance: 'opaque-instance',
            rt_table: [
              {
                name: 'opaque-table',
                imported: [
                  {
                    subnet: '10.30.0.0/24',
                    path: [{ peer: 'opaque-peer', nh: ['10.20.1.4'], as_path: '65001 65515' }],
                  },
                ],
                exported: [],
              },
            ],
          },
        ],
      })),
    };
    f.routeResponse = response;
    const observed = await f.runtime.observeBgpRoutes(f.binding);
    expect(observed).toMatchObject({
      status: 'observed',
      owner: f.binding.owner,
      siteName: f.binding.siteName,
      pathInventory: { status: 'observed', scope: 'unqualified', freshness: 'unqualified', traffic: 'unknown' },
    });
    expect(f.routeReads).toBe(1);
    expect(f.posts).toBe(0);
    expect(f.delegated).toBe(0);
    expect(observed.pathInventory.status).toBe('observed');
    if (observed.pathInventory.status !== 'observed') throw Error('paths missing');
    expect(observed.pathInventory.nodes[0].routingInstances[0].tables[0].imported[0].path[0]).toEqual({
      peer: 'opaque-peer',
      nh: ['10.20.1.4'],
      as_path: '65001 65515',
    });
    response.ver[0].ri_table[0].rt_table[0].imported[0].path = [];
    const missing = await f.runtime.observeBgpRoutes(f.binding);
    expect(missing.status).toBe('observed');
    expect(missing.pathInventory.status).toBe('unknown');
    expect(f.routeReads).toBe(2);
    expect(f.posts).toBe(0);
    expect(f.delegated).toBe(0);
  }
});

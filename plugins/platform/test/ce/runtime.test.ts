import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VerifiedIngressContract } from '../../src/ce/ingress-contract';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { type CeStoredSiteBinding, createCePlatformService } from '../../src/ce/service';
import type { VerifiedUpgradeContract } from '../../src/ce/upgrade-contract';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import routingSchemaCompact from '../fixtures/aws-routing-schema.json';
import recordedInterfaces from '../fixtures/aws-site-publisher-links.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contract from '../fixtures/smsv2-contract-v7.json';
import schemaCompact from '../fixtures/smsv2-create-schema.json';
import replaceSchemaCompact from '../fixtures/smsv2-replace-schema.json';

const routingSchema = resolveCeSchemaFixture(routingSchemaCompact);
const schema = resolveCeSchemaFixture(schemaCompact);
const replaceSchema = resolveCeSchemaFixture(replaceSchemaCompact);

type ContractFixtureConstructor = new (
  commit: string,
  fingerprint: string,
  contract: Record<string, unknown>,
  schemas: Record<string, unknown>,
  networking: { network: Record<string, unknown>; marketplace: Record<string, unknown> } | undefined,
  publication: 'published-release',
) => VerifiedCeContract;

function fixture(withRouting = false, fixtureContract: Record<string, unknown> = contract): VerifiedCeContract {
  const Constructor = VerifiedCeContract as unknown as ContractFixtureConstructor;
  return new Constructor(
    schema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    fixtureContract,
    { ...schema.schemas, ...replaceSchema.schemas },
    withRouting
      ? {
          network: routingSchema.schemas.network,
          marketplace: routingSchema.schemas.marketplace,
        }
      : undefined,
    'published-release',
  );
}
const binding: SiteBinding = {
  owner: { deploymentId: 'ce-test', engine: 'native', provider: 'aws', account: 'demo', region: 'us-east-1' },
  siteName: 'ce-one',
  nodes: ['node-one'],
};
const intent = {
  schemaVersion: 2 as const,
  provider: 'aws' as const,
  haMode: 'one-node' as const,
  settings: {},
  nodes: [
    {
      hostname: 'node-one',
      interfaces: [
        {
          name: 'slo',
          ethernet_interface: { mac: '02:00:00:00:00:01', device: 'ens5' },
          network_option: { site_local_network: {} },
          dhcp_client: {},
        },
      ],
    },
  ],
};
const labels = {
  'xcsh-ce-deployment': 'ce-test',
  'xcsh-ce-engine': 'native',
  'xcsh-ce-provider': 'aws',
  'xcsh-ce-account': 'demo',
  'xcsh-ce-region': 'us-east-1',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('reconciles an ambiguous create and checkpoints the durable site UID without duplicate creation', async () => {
  const contract = fixture();
  let site: unknown;
  let posts = 0;
  const checkpoints: unknown[] = [];
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (_url, init) => {
    if (init?.method === 'POST') {
      posts++;
      site = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'site-uuid' } };
      throw new Error('response lost');
    }
    return site ? json(site) : json({}, 404);
  });
  await runtime.ensureSite(binding, intent, async (value) => {
    checkpoints.push(value);
  });
  await runtime.ensureSite(binding, intent, async (value) => {
    checkpoints.push(value);
  });
  expect(posts).toBe(1);
  expect(checkpoints).toHaveLength(2);
  expect(checkpoints[0]).toHaveProperty('uid', 'site-uuid');
});
test('foreign engine and foreign live ownership cannot delete resources', async () => {
  const contract = fixture();
  let deletes = 0;
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (_url, init) => {
    if (init?.method === 'DELETE') deletes++;
    return json({ metadata: { name: 'ce-one', namespace: 'system', labels: {} } });
  });
  await expect(runtime.deleteSite({ ...binding, owner: { ...binding.owner, engine: 'terraform' } })).rejects.toThrow(
    'owning',
  );
  await expect(runtime.deleteSite(binding)).rejects.toThrow('ownership');
  expect(deletes).toBe(0);
});

test('native upgrade checkpoints its exact site identity immediately before submission', async () => {
  const contract = fixture();
  const upgrade = {
    fingerprint: `sha256:${'a'.repeat(64)}`,
    build: () => ({
      method: 'POST' as const,
      path: `/api/config/namespaces/system/sites/${binding.siteName}/upgrade_sw`,
      body: { namespace: 'system', name: binding.siteName, version: 'crt-20260201-0179', force: false },
    }),
  } as unknown as VerifiedUpgradeContract;
  const events: string[] = [];
  let uid = 'site-uuid';
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (_url, init) => {
    if (init?.method === 'POST') {
      events.push('post');
      return json({});
    }
    return json({
      metadata: { name: binding.siteName, namespace: 'system', labels },
      system_metadata: { uid },
    });
  });
  const result = await runtime.submitUpgrade(
    binding,
    upgrade,
    { kind: 'software', version: 'crt-20260201-0179' },
    'site-uuid',
    async () => {
      events.push('checkpoint');
    },
  );
  expect(result).toMatchObject({ status: 'submitted', siteUid: 'site-uuid' });
  expect(events).toEqual(['checkpoint', 'post']);

  uid = 'replacement-uuid';
  await expect(
    runtime.submitUpgrade(
      binding,
      upgrade,
      { kind: 'software', version: 'crt-20260201-0179' },
      'site-uuid',
      async () => {
        events.push('unexpected-checkpoint');
      },
    ),
  ).rejects.toThrow('identity changed');
  expect(events).toEqual(['checkpoint', 'post']);
});

test('exact site deletion binds the observed UID and reconciles pending or lost delete responses', async () => {
  const contract = fixture();
  for (const mode of [
    'deleted',
    'pending',
    'lost-response',
    'foreign-uid',
    'replaced-during-delete',
    'forbidden',
    'already-absent',
  ] as const) {
    let deletes = 0;
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (_url, init) => {
      if (init?.method === 'DELETE') {
        deletes++;
        return json({}, mode === 'lost-response' ? 503 : mode === 'forbidden' ? 403 : 200);
      }
      if (mode === 'already-absent' || (deletes && !['pending', 'replaced-during-delete', 'forbidden'].includes(mode)))
        return json({}, 404);
      return json({
        metadata: { name: binding.siteName, namespace: 'system', labels },
        system_metadata: {
          uid: mode === 'foreign-uid' || (mode === 'replaced-during-delete' && deletes) ? 'new-site' : 'original-site',
        },
      });
    });
    if (mode === 'foreign-uid' || mode === 'replaced-during-delete') {
      await expect(runtime.deleteSiteExact(binding, 'original-site')).rejects.toThrow(/UID/);
      expect(deletes).toBe(mode === 'foreign-uid' ? 0 : 1);
    } else if (mode === 'forbidden') {
      await expect(runtime.deleteSiteExact(binding, 'original-site')).rejects.toMatchObject({
        category: 'authorization',
      });
      expect(deletes).toBe(1);
    } else {
      const result = await runtime.deleteSiteExact(binding, 'original-site');
      expect(result.status).toBe(mode === 'pending' ? 'pending' : 'deleted');
      expect(result.siteUid).toBe('original-site');
      expect(deletes).toBe(mode === 'already-absent' ? 0 : 1);
    }
  }
});

test('site deletion acceptance requires logical and physical absence plus complete inactive registration evidence', async () => {
  const contract = fixture();
  for (const mode of [
    'deleted',
    'physical-present',
    'foreign-physical',
    'inactive-registration',
    'duplicate-registration',
    'active-registration',
    'partial',
    'malformed',
    'foreign-registration',
  ] as const) {
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url) => {
      const path = new URL(url).pathname;
      if (path.includes('registrations_by_site')) {
        if (mode === 'partial') return json({ items: [], next_page_token: 'more' });
        if (mode === 'malformed') return json({ items: [{}] });
        if (
          ['active-registration', 'foreign-registration', 'inactive-registration', 'duplicate-registration'].includes(
            mode,
          )
        )
          return json({
            items: Array.from({ length: mode === 'duplicate-registration' ? 2 : 1 }, () => ({
              name: 'r-example',
              get_spec: {
                passport: { cluster_name: mode === 'foreign-registration' ? 'other-site' : binding.siteName },
                infra: { hostname: binding.nodes[0] },
              },
              object: {
                status: {
                  current_state:
                    mode === 'inactive-registration' || mode === 'duplicate-registration' ? 'RETIRED' : 'ONLINE',
                },
              },
            })),
          });
        return json({ items: [] });
      }
      if (path.includes('/sites/') && ['physical-present', 'foreign-physical'].includes(mode))
        return json({
          metadata: { name: binding.siteName, namespace: 'system' },
          system_metadata: { uid: mode === 'foreign-physical' ? 'other-physical-site' : 'physical-site' },
        });
      return json({}, 404);
    });
    const result = await runtime.observeSiteDeletion(binding, {
      siteUid: 'original-site',
      physicalSiteUid: 'physical-site',
    });
    expect(result.status).toBe(
      ['deleted', 'inactive-registration'].includes(mode)
        ? 'deleted'
        : ['physical-present', 'active-registration'].includes(mode)
          ? 'pending'
          : 'unknown',
    );
  }
});
test('token checkpoint failure resumes through GET without duplicate token issuance', async () => {
  const contract = fixture();
  let token: unknown;
  let posts = 0;
  let cloudInit = 0;
  const jwt = [{ alg: 'RS256' }, { exp: Math.floor(Date.now() / 1000) + 3600 }, 'synthetic-signature']
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
    if (String(url).includes('securemesh_site_v2s'))
      return json({ metadata: { name: 'ce-one', namespace: 'system', labels } });
    if (String(url).includes('get-cloud-init-config')) {
      cloudInit++;
      return json({
        cloud_init_config:
          '#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: |\n      token: {{ .Token }}\n',
      });
    }
    if (init?.method === 'POST') {
      posts++;
      token = { ...JSON.parse(String(init.body)), spec: { type: 1, site_name: 'ce-one', content: jwt } };
      return json({});
    }
    return token ? json(token) : json({}, 404);
  });
  await expect(
    runtime.bootstrap(binding, 'node-one', 'node-token', async () => {
      throw new Error('disk unavailable');
    }),
  ).rejects.toThrow('disk');
  expect(cloudInit).toBe(0);
  const material = await runtime.bootstrap(binding, 'node-one', 'node-token', async () => {});
  expect(posts).toBe(1);
  expect(material).toContain(jwt);
  expect(cloudInit).toBe(1);
});
test('verified API bootstrap capability admits AWS and Azure without making a request', async () => {
  const contract = fixture();
  let requests = 0;
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async () => {
    requests++;
    return json({});
  });
  expect(() => runtime.requireBootstrapContract('aws')).not.toThrow();
  expect(() => runtime.requireBootstrapContract('azure')).not.toThrow();
  expect(requests).toBe(0);
});
test('Azure Route Server multihop rejects before any runtime request', async () => {
  const withoutSchemas = fixture();
  expect(() => withoutSchemas.requireRoutingContract('azure')).toThrow('no_schema_valid_ebgp_multihop_request_control');
  const complete = fixture(true);
  let requests = 0;
  const runtime = new CeRuntime(complete, 'native', 'https://tenant.test', 'test-credential', async () => {
    requests++;
    return json({});
  });
  expect(() => runtime.requireRoutingContract('azure')).toThrow('no_schema_valid_ebgp_multihop_request_control');
  expect(requests).toBe(0);
});
test('Azure routing capability rejects altered configuration, peer, and route mappings', async () => {
  const variants = [
    (value: typeof contract) => {
      value.providers.azure.runtime.configuration.response_mappings.device = 'invented.device';
    },
    (value: typeof contract) => {
      value.providers.azure.runtime.bgp_peers.response_mappings.state = 'invented.state';
    },
    (value: typeof contract) => {
      value.providers.azure.runtime.bgp_routes.response_mappings.imported_routes = 'invented.routes[]';
    },
  ];
  for (const mutate of variants) {
    const changed = structuredClone(contract);
    mutate(changed);
    const candidateContract = fixture(true, changed);
    expect(() => candidateContract.requireRoutingContract('azure')).toThrow('unavailable');
  }
});
test('HTTP errors and malformed responses never expose server bodies', async () => {
  const contract = fixture();
  for (const [status, category] of [
    [401, 'expired'],
    [403, 'authorization'],
    [429, 'throttled'],
    [500, 'transient'],
  ] as const) {
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async () =>
      json({ secret: 'SENSITIVE_BOOTSTRAP' }, status),
    );
    await expect(runtime.observeSite(binding)).rejects.toThrow(category);
  }
  const runtime = new CeRuntime(
    contract,
    'native',
    'https://tenant.test',
    'test-credential',
    async () => new Response('SENSITIVE_BOOTSTRAP'),
  );
  await expect(runtime.observeSite(binding)).rejects.toThrow('malformed');
});

for (const health of [
  undefined,
  null,
  [],
  'invalid',
  {},
  { path: '/wrong' },
  ...['method', 'operation_id', 'response_schema', 'authority', 'semantics'].map((field) => ({
    ...contract.providers.aws.runtime.health,
    [field]: 'invalid',
  })),
]) {
  test(`unavailable provider health mapping ${JSON.stringify(health)} returns unknown without a request`, async () => {
    const fixtureContract = structuredClone(contract);
    Object.assign(fixtureContract.providers.azure.runtime, { health });
    let requests = 0;
    const runtime = new CeRuntime(
      fixture(false, fixtureContract),
      'native',
      'https://tenant.test',
      'test-credential',
      async () => {
        requests++;
        return json({});
      },
    );
    const azureBinding: SiteBinding = { ...binding, owner: { ...binding.owner, provider: 'azure' } };
    expect(await runtime.observeHealth(azureBinding)).toMatchObject({
      status: 'unknown',
      reason: 'provider-health-contract-unavailable',
    });
    expect(requests).toBe(0);
  });
}

test('site-global health never fabricates per-node HA health or accepts foreign identities', async () => {
  const contract = fixture();
  let response: unknown = { hostname: 'node-one.example', state: 'PROVISIONED' };
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url) =>
    String(url).includes('securemesh_site_v2s')
      ? json({ metadata: { name: 'ce-one', namespace: 'system', labels }, system_metadata: { uid: 'site-uuid' } })
      : json(response),
  );
  expect(await runtime.observeHealth(binding)).toMatchObject({
    status: 'healthy',
    scope: 'site-global-only',
    nodeHealth: 'unknown',
  });
  for (const invalid of [
    { hostname: 'other', state: 'PROVISIONED' },
    { hostname: 'node-one', state: 'SENSITIVE_BOOTSTRAP' },
    {},
  ]) {
    response = invalid;
    const observed = await runtime.observeHealth(binding);
    expect(observed.status).toBe('unknown');
    expect(JSON.stringify(observed)).not.toContain('SENSITIVE_BOOTSTRAP');
  }
});
test('published health states keep non-provisioned responses degraded and reject unpublished states', async () => {
  let state = 'PROVISIONED';
  const runtime = new CeRuntime(fixture(), 'native', 'https://tenant.test', 'test-credential', async (url) =>
    String(url).includes('securemesh_site_v2s')
      ? json({ metadata: { name: 'ce-one', namespace: 'system', labels }, system_metadata: { uid: 'site-uuid' } })
      : json({ hostname: 'node-one', state }),
  );
  for (const value of ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'FAILED', 'RESETTING']) {
    state = value;
    expect(await runtime.observeHealth(binding)).toMatchObject({
      status: 'degraded',
      state: value,
      nodeHealth: 'unknown',
    });
  }
  for (const value of ['INITIALIZING', 'DEGRADED', 'NOT_PROVISIONED']) {
    state = value;
    expect(await runtime.observeHealth(binding)).toMatchObject({ status: 'unknown' });
  }
});

test('registration health needs exact site/node/instance correlation and complete observations', async () => {
  const contract = fixture();
  const item = {
    name: 'r-test',
    get_spec: {
      passport: { cluster_name: 'ce-one', cluster_size: 1 },
      infra: { hostname: 'node-one', instance_id: 'i-fixture' },
    },
    object: { status: { current_state: 'ONLINE' } },
  };
  let response: unknown = { items: [item] };
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url) =>
    String(url).includes('securemesh_site_v2s')
      ? json({ metadata: { name: 'ce-one', namespace: 'system', labels } })
      : json(response),
  );
  expect(await runtime.observeRegistrations(binding, { 'node-one': 'i-fixture' })).toHaveProperty('status', 'healthy');
  expect(await runtime.observeRegistrations(binding, { 'node-one': 'i-other' })).toHaveProperty('status', 'unknown');
  for (const invalid of [
    { items: [item], next_page_token: 'next' },
    { items: [item, item] },
    { items: [] },
    { items: [item], errors: [{}] },
  ]) {
    response = invalid;
    expect(await runtime.observeRegistrations(binding, { 'node-one': 'i-fixture' })).toHaveProperty(
      'status',
      'unknown',
    );
  }
});

test('cumulative HA admission observes only launched nodes while preserving the final cluster size', async () => {
  const contract = fixture();
  const haBinding = { ...binding, nodes: ['node-one', 'node-two', 'node-three'] };
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url) =>
    String(url).includes('securemesh_site_v2s')
      ? json({ metadata: { name: 'ce-one', namespace: 'system', labels } })
      : json({
          items: [
            {
              name: 'r-test',
              get_spec: {
                passport: { cluster_name: 'ce-one', cluster_size: 3 },
                infra: { hostname: 'node-one', instance_id: 'i-fixture' },
              },
              object: { status: { current_state: 'ONLINE' } },
            },
          ],
        }),
  );
  expect(
    await runtime.observeRegistrations(haBinding, { 'node-one': 'i-fixture' }, undefined, ['node-one']),
  ).toHaveProperty('status', 'healthy');
  expect(await runtime.observeRegistrations(haBinding, { 'node-one': 'i-fixture' })).toHaveProperty(
    'status',
    'unknown',
  );
});

test('registration approval checkpoints before mutation and preserves the server passport', async () => {
  const contract = fixture();
  let state = 'NEW';
  const requests: Array<Record<string, unknown>> = [];
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
    const path = new URL(url).pathname;
    if (path.includes('securemesh_site_v2s'))
      return json({ metadata: { name: 'ce-one', namespace: 'system', labels } });
    if (path.includes('registrations_by_site'))
      return json({
        items: [
          {
            name: 'r-test',
            get_spec: {
              passport: { cluster_name: 'ce-one', cluster_size: state === 'NEW' ? 0 : 1 },
              infra: { hostname: 'node-one', instance_id: 'i-fixture' },
            },
            object: { status: { current_state: state } },
          },
        ],
      });
    if (path.endsWith('/approve')) {
      requests.push(JSON.parse(String(init?.body)));
      state = 'APPROVED';
      return json({});
    }
    return json({
      object: {
        spec: { gc_spec: { passport: { cluster_name: 'ce-one', cluster_size: 0, marker: 'preserve-server-value' } } },
        status: { current_state: state },
      },
    });
  });
  await expect(
    runtime.approveRegistrations(binding, { 'node-one': 'i-fixture' }, async () => {
      throw new Error('checkpoint failed');
    }),
  ).rejects.toThrow('checkpoint');
  expect(requests).toHaveLength(0);
  const records: unknown[] = [];
  await runtime.approveRegistrations(binding, { 'node-one': 'i-fixture' }, async (record) => {
    records.push(record);
  });
  expect(requests[0]).toEqual({
    namespace: 'system',
    name: 'r-test',
    state: 'APPROVED',
    passport: { cluster_name: 'ce-one', cluster_size: 1, marker: 'preserve-server-value' },
  });
  expect(records).toHaveLength(2);
  await runtime.approveRegistrations(binding, { 'node-one': 'i-fixture' }, async () => {});
  expect(requests).toHaveLength(1);
});

test('creates schema-validated routing objects in order and resumes lost responses without duplicate connectors', async () => {
  const contract = fixture(true);
  const objects = new Map<string, unknown>();
  const posts: string[] = [];
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.includes('securemesh_site_v2s/'))
      return json({
        metadata: { name: binding.siteName, namespace: 'system', labels },
        system_metadata: { uid: 'site-uid' },
      });
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(path);
      objects.set(`${path}/${body.metadata.name}`, { ...body, system_metadata: { uid: `uid-${posts.length}` } });
      throw new Error('response lost after durable creation');
    }
    return objects.has(path) ? json(objects.get(path)) : json({}, 404);
  });
  const interfaces = [
    {
      name: 'ce-gre',
      node: 'node-one',
      interfaceName: 'eth0',
      interfaceMtu: 1500,
      awsGreAddress: '100.64.0.1',
      ceInsideAddress: '169.254.10.1',
      awsBgpAddresses: ['169.254.10.2', '169.254.10.3'] as [string, string],
    },
  ];
  await expect(
    runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, ['10.253.0.0/16'], async () => {
      throw new Error('checkpoint interrupted');
    }),
  ).rejects.toThrow('checkpoint interrupted');
  await runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, ['10.253.0.0/16'], async () => {});
  expect(posts).toEqual([
    '/api/config/namespaces/system/external_connectors',
    '/api/config/namespaces/system/bgp_routing_policys',
    '/api/config/namespaces/system/bgps',
  ]);
  await runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, ['10.253.0.0/16'], async () => {});
  expect(posts).toHaveLength(3);
  const bgp = objects.get('/api/config/namespaces/system/bgps/ce-one-tgw-bgp') as { spec: { peers: unknown[] } };
  expect(bgp.spec.peers).toHaveLength(2);
  expect(
    [...objects.values()].map(
      (value) => (value as { metadata: { labels: Record<string, string> } }).metadata.labels['xcsh-ce-site-uid'],
    ),
  ).toEqual(['site-uid', 'site-uid', 'site-uid']);
});

test('Azure Route Server BGP rejects before any F5 request while multihop is unavailable', async () => {
  const contract = fixture(true);
  const azureBinding: SiteBinding = {
    owner: {
      deploymentId: 'ce-test',
      engine: 'native',
      provider: 'azure',
      account: 'demo',
      region: 'eastus',
    },
    siteName: 'ce-one',
    nodes: ['node-one'],
  };
  let bgp: unknown;
  let posts = 0;
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/ver/bgp_routes'))
      return json({
        ver: [
          {
            name: 'node-one.example.test',
            ri_table: [
              {
                routing_instance: 'ves-io-slo-tenant',
                rt_table: [
                  {
                    name: 'inet.0',
                    imported: [{ subnet: '10.20.0.0/24' }],
                    exported: [{ subnet: '10.250.0.10/32' }],
                  },
                ],
              },
            ],
          },
        ],
      });
    if (path.endsWith('/ver/bgp_peers'))
      return json({
        ver: [
          {
            name: 'node-one.example.test',
            peer: ['10.20.0.4', '10.20.0.5'].map((address) => ({
              interface_name: 'observed-slo-one',
              peer_address: { ipv4: { addr: address } },
              protocol_status: 'Established',
              received_prefix_count: 2,
              advertised_prefix_count: 1,
              up_down_timestamp: '2026-09-10T12:00:00Z',
            })),
          },
        ],
      });
    if (path.includes('securemesh_site_v2s/'))
      return json({
        metadata: {
          name: azureBinding.siteName,
          namespace: 'system',
          labels: {
            'xcsh-ce-deployment': 'ce-test',
            'xcsh-ce-engine': 'native',
            'xcsh-ce-provider': 'azure',
            'xcsh-ce-account': 'demo',
            'xcsh-ce-region': 'eastus',
          },
        },
        system_metadata: { uid: 'azure-site-uid' },
      });
    if (init?.method === 'POST') {
      posts++;
      bgp = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'azure-bgp-uid' } };
      throw new Error('response lost after durable creation');
    }
    return bgp ? json(bgp) : json({}, 404);
  });
  let saved: Record<string, unknown> | undefined;
  const run = (
    checkpoint: (record: Record<string, unknown>) => Promise<void> = async (record) => {
      saved = record;
    },
  ) =>
    runtime.ensureAzureRouting(
      azureBinding,
      65010,
      65515,
      [{ node: 'node-one', interfaceName: 'observed-slo-one' }],
      ['10.20.0.4', '10.20.0.5'],
      checkpoint,
    );
  await expect(run()).rejects.toThrow('no_schema_valid_ebgp_multihop_request_control');
  expect(posts).toBe(0);
  expect(bgp).toBeUndefined();
  expect(saved).toBeUndefined();
});

test('AWS configured creation rejects missing observed devices before any API request', async () => {
  const contract = fixture();
  let requests = 0;
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async () => {
    requests++;
    return json({}, 404);
  });
  const missing = structuredClone(intent);
  delete (missing.nodes[0].interfaces[0].ethernet_interface as Record<string, unknown>).device;
  await expect(runtime.ensureSite(binding, missing, async () => {})).rejects.toThrow('observed AWS guest device');
  expect(requests).toBe(0);
});

test('pins the initial software and OS before bootstrap for either owning engine and rejects changed baselines', async () => {
  const contract = fixture();
  for (const engine of ['native', 'terraform'] as const) {
    const selected: SiteBinding = {
      ...binding,
      owner: { ...binding.owner, engine },
      initialVersions: { software: 'crt-20251002-0027', os: '9.2026.10' },
    };
    let site: Record<string, unknown> | undefined;
    let posts = 0;
    const runtime = new CeRuntime(
      contract,
      engine,
      'https://tenant.test',
      'test-credential',
      async (_url, init) => {
        if (init?.method === 'POST') {
          posts++;
          site = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'baseline-site-uid' } };
          return json({});
        }
        return site ? json(site) : json({}, 404);
      },
      engine === 'terraform'
        ? async (_owner, _path, init) => {
            posts++;
            site = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'baseline-site-uid' } };
            return {};
          }
        : undefined,
    );
    await runtime.reserveSite(selected, async () => {});
    expect(site).toHaveProperty('spec.software_settings', {
      os: { operating_system_version: '9.2026.10' },
      sw: { volterra_software_version: 'crt-20251002-0027' },
    });
    await runtime.reserveSite(selected, async () => {});
    await expect(
      runtime.reserveSite(
        { ...selected, initialVersions: { software: 'crt-20260201-0179', os: '9.2026.17' } },
        async () => {},
      ),
    ).rejects.toThrow();
    expect(posts).toBe(1);
  }
});

test('reserves an Azure Route Server prefix through the schema-valid SLO local VRF', async () => {
  const contract = fixture();
  const azure: SiteBinding = {
    ...binding,
    owner: {
      ...binding.owner,
      engine: 'terraform',
      provider: 'azure',
      account: crypto.randomUUID(),
      region: 'australiacentral',
    },
  };
  let site: unknown;
  const runtime = new CeRuntime(contract, 'terraform', 'https://tenant.test', 'test-credential', async (_url, init) => {
    if (init?.method === 'POST') {
      site = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'azure-site-uid' } };
      return json({});
    }
    return site ? json(site) : json({}, 404);
  });

  await runtime.reserveSite(azure, async () => {}, undefined, ['10.253.0.0/24']);

  expect(site).toMatchObject({
    spec: {
      local_vrf: {
        slo_config: {
          static_routes: {
            static_routes: [
              {
                ip_prefixes: ['10.253.0.0/24'],
                default_gateway: {},
                attrs: ['ROUTE_ATTR_ADVERTISE', 'ROUTE_ATTR_INSTALL_FORWARDING'],
              },
            ],
          },
        },
      },
    },
  });
  expect(site).not.toHaveProperty('spec.static_routes');
});

test('rejects unresolved initial version pairs before contacting the API', async () => {
  const contract = fixture();
  let calls = 0;
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async () => {
    calls++;
    return json({});
  });
  await expect(
    runtime.reserveSite({ ...binding, initialVersions: { software: 'latest', os: '9.2026.10' } }, async () => {}),
  ).rejects.toThrow('explicit version pair');
  expect(calls).toBe(0);
});

test('upgrade observation rejects foreign physical ownership before reading eligibility', async () => {
  const contract = fixture();
  const paths: string[] = [];
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    return json({
      metadata: {
        name: binding.siteName,
        namespace: 'system',
        labels: path.includes('securemesh_site_v2s') ? labels : { ...labels, 'xcsh-ce-deployment': 'foreign' },
      },
      system_metadata: { uid: 'site-one' },
    });
  });
  const upgrade = { fingerprint: 'test-upgrade-contract', build: () => ({}) } as unknown as VerifiedUpgradeContract;
  expect(await runtime.observeUpgrade(binding, upgrade, 'crt-20260201-0179')).toMatchObject({
    status: 'unknown',
    reason: 'ownership-or-response-invalid',
  });
  expect(paths).toEqual([
    '/api/config/namespaces/system/securemesh_site_v2s/ce-one',
    '/api/config/namespaces/system/sites/ce-one',
  ]);
});

test('upgrade observations bind both site identities and reject changes during collection', async () => {
  const contract = fixture();
  for (const replacement of [false, true])
    for (const target of ['crt-20260201-0179', undefined]) {
      let logicalReads = 0;
      const runtime = new CeRuntime(
        contract,
        'terraform',
        'https://tenant.test',
        'test-credential',
        async (url, init) => {
          expect(init?.method ?? 'GET').toBe('GET');
          const path = new URL(url).pathname;
          const metadata = { name: binding.siteName, namespace: 'system', labels };
          if (path.includes('securemesh_site_v2s'))
            return json({
              metadata,
              system_metadata: { uid: replacement && ++logicalReads > 1 ? 'replaced' : 'logical-one' },
            });
          if (path.endsWith('/sites/ce-one'))
            return json({
              metadata,
              system_metadata: { uid: 'physical-one' },
              spec: { site_state: 'FAILED', main_nodes: [{ name: 'node-one' }] },
              status: [
                {
                  metadata: {
                    uid: 'sw-publisher',
                    creator_class: 'maurice',
                    status_id: 'software-version',
                    publish: 'STATUS_PUBLISH',
                    vtrp_stale: false,
                  },
                  volterra_software_status: {
                    last_installed_version: 'crt-20260201-0178',
                    available_version: 'crt-20260201-0179',
                    deployment_state: { phase: 'UPGRADE_COMPLETED', result: 'Completed' },
                  },
                },
                {
                  metadata: {
                    uid: 'os-publisher',
                    creator_class: 'maurice',
                    status_id: 'operating-system-version',
                    publish: 'STATUS_PUBLISH',
                    vtrp_stale: false,
                  },
                  operating_system_status: {
                    available_version: '9.2026.17',
                    deployment_state: { version: '9.2026.14', phase: 'UPGRADE_COMPLETED', result: 'success' },
                  },
                },
              ],
            });
          if (path.endsWith('/targets')) return json({ sw_versions: ['crt-20260201-0179'] });
          if (path.endsWith('/precheck')) return json({ checklist: [{ item: 'nodes', status: 'CHECKLIST_FAILED' }] });
          if (path.endsWith('/progress'))
            return json({
              upgrade_status: {
                sw_upgrade_progress: { site: 'ce-one', status: 'COMPLETED', version: 'crt-20260201-0178' },
              },
            });
          throw new Error('Unexpected path');
        },
      );
      const upgrade = {
        fingerprint: 'test-upgrade-contract',
        build: () => ({}),
        observationPaths: (_site: string, _current: unknown, selected: string) => {
          expect(selected).toBe(target ?? 'crt-20260201-0178');
          return { targets: '/api/targets', precheck: '/api/precheck', progress: '/api/progress' };
        },
      } as unknown as VerifiedUpgradeContract;
      const result = await runtime.observeUpgrade(binding, upgrade, target);
      if (replacement) expect(result).toMatchObject({ status: 'unknown', reason: 'conflict' });
      else
        expect(result).toMatchObject({
          status: 'observed',
          siteUid: 'logical-one',
          physicalSiteUid: 'physical-one',
          online: false,
          prechecks: { passing: false },
          targetSoftware: target ?? 'crt-20260201-0178',
          targetSoftwareListed: target !== undefined,
          nodeHealth: 'unknown',
          routing: 'unknown',
          traffic: 'unknown',
        });
    }
});

test('routing teardown requires the checkpoint UID, site label and owning engine', async () => {
  const contract = fixture(true);
  for (const mode of ['valid', 'foreign-uid', 'foreign-site', 'wrong-engine'] as const) {
    let deletes = 0;
    const runtime = new CeRuntime(
      contract,
      mode === 'wrong-engine' ? 'terraform' : 'native',
      'https://tenant.test',
      'test-credential',
      async (url, init) => {
        if (init?.method === 'DELETE') {
          deletes++;
          return json({});
        }
        if (new URL(url).pathname.includes('securemesh_site_v2s'))
          return json({ metadata: { name: binding.siteName, namespace: 'system', labels } });
        if (deletes) return json({}, 404);
        return json({
          metadata: {
            name: 'ce-bgp',
            namespace: 'system',
            labels: { ...labels, 'xcsh-ce-site': mode === 'foreign-site' ? 'foreign' : binding.siteName },
          },
          system_metadata: { uid: mode === 'foreign-uid' ? 'foreign' : 'routing-one' },
        });
      },
    );
    const action = runtime.deleteRouting(binding, { kind: 'bgp', name: 'ce-bgp', uid: 'routing-one' });
    if (mode === 'valid') {
      await action;
      expect(deletes).toBe(1);
    } else {
      await expect(action).rejects.toThrow();
      expect(deletes).toBe(0);
    }
  }
});

test('routing teardown treats absence as complete and reports a still-present object as pending', async () => {
  const contract = fixture(true);
  for (const present of [false, true]) {
    let deletes = 0;
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
      if (init?.method === 'DELETE') {
        deletes++;
        return json({});
      }
      if (new URL(url).pathname.includes('securemesh_site_v2s'))
        return json({ metadata: { name: binding.siteName, namespace: 'system', labels } });
      return present
        ? json({
            metadata: { name: 'ce-gre', namespace: 'system', labels: { ...labels, 'xcsh-ce-site': binding.siteName } },
            system_metadata: { uid: 'routing-one' },
          })
        : json({}, 404);
    });
    const action = runtime.deleteRouting(binding, { kind: 'external_connector', name: 'ce-gre', uid: 'routing-one' });
    if (present) await expect(action).rejects.toThrow('still converging');
    else await action;
    expect(deletes).toBe(present ? 1 : 0);
  }
});

test('replacement routing rebind resumes lost PUT responses and checkpoint interruptions without repeat updates', async () => {
  const contract = fixture(true);
  type RoutingObject = {
    metadata: { name: string; namespace: string; labels: Record<string, string> };
    system_metadata: { uid: string };
    resource_version: string;
    spec: unknown;
  };
  const objects = new Map<string, RoutingObject>();
  const puts: string[] = [];
  let siteUid = 'replacement-site';
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.includes('securemesh_site_v2s/'))
      return json({
        metadata: { name: binding.siteName, namespace: 'system', labels },
        system_metadata: { uid: siteUid },
      });
    if (init?.method === 'PUT') {
      puts.push(path);
      const current = objects.get(path);
      if (!current) throw new Error('Missing test routing object');
      objects.set(path, { ...JSON.parse(String(init.body)), system_metadata: current.system_metadata });
      throw new Error('response lost after durable update');
    }
    return objects.has(path) ? json(objects.get(path)) : json({}, 404);
  });
  const interfaces = [
    {
      name: 'ce-gre',
      node: 'node-one',
      interfaceName: 'eth0',
      interfaceMtu: 1500,
      awsGreAddress: '100.64.0.1',
      ceInsideAddress: '169.254.10.1',
      awsBgpAddresses: ['169.254.10.2', '169.254.10.3'] as [string, string],
    },
  ];
  const desired = contract.buildAwsRouting(binding.siteName, 65010, 64512, interfaces, ['10.253.0.0/16']);
  const resources = [
    { kind: 'external_connector' as const, name: 'ce-gre', uid: 'connector' },
    { kind: 'bgp_routing_policy' as const, name: desired.exportPolicy.name, uid: 'policy' },
    { kind: 'bgp' as const, name: desired.bgp.name, uid: 'bgp' },
  ];
  for (const resource of resources)
    objects.set(`/api/config/namespaces/system/${resource.kind}s/${resource.name}`, {
      metadata: { name: resource.name, namespace: 'system', labels: { ...labels, 'xcsh-ce-site': binding.siteName } },
      system_metadata: { uid: resource.uid },
      resource_version: '1',
      spec:
        resource.kind === 'bgp'
          ? desired.bgp.spec
          : resource.kind === 'bgp_routing_policy'
            ? desired.exportPolicy.spec
            : desired.connectors[0].spec,
    });
  const rebind = {
    siteUid,
    resources,
    contract: {
      fingerprint: 'test-contract',
      build: (_kind: string, snapshot: RoutingObject, spec: unknown, uid: string) => ({
        metadata: { ...snapshot.metadata, labels: { ...snapshot.metadata.labels, 'xcsh-ce-site-uid': uid } },
        spec,
        resource_version: snapshot.resource_version,
      }),
    } as unknown as import('../../src/ce/routing-contract').VerifiedRoutingContract,
  };
  const run = (checkpoint: (record: Record<string, unknown>) => Promise<void> = async () => {}) =>
    runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, ['10.253.0.0/16'], checkpoint, undefined, rebind);
  await expect(
    run(async () => {
      throw new Error('checkpoint interrupted');
    }),
  ).rejects.toThrow('checkpoint interrupted');
  expect(puts).toHaveLength(0);
  await expect(
    run(async (record) => {
      if (record.phase !== 'rebind-pending') throw new Error('after update');
    }),
  ).rejects.toThrow('after update');
  expect(puts).toHaveLength(1);
  await run();
  await run();
  expect(puts).toHaveLength(3);
  siteUid = 'foreign-site';
  await expect(run()).rejects.toThrow('Replacement site UID changed');
  expect(puts).toHaveLength(3);
  siteUid = rebind.siteUid;
  const connector = objects.get('/api/config/namespaces/system/external_connectors/ce-gre');
  if (!connector) throw new Error('Missing test connector');
  connector.system_metadata.uid = 'foreign';
  await expect(run()).rejects.toThrow('Replacement routing object UID changed');
  expect(puts).toHaveLength(3);
});

for (const mismatch of ['policy', 'peer-policy'] as const)
  test(`next generation AWS routing rejects ${mismatch} drift without migration`, async () => {
    const contract = fixture(true);
    type RoutingObject = {
      metadata: { name: string; namespace: string; labels: Record<string, string> };
      system_metadata: { uid: string };
      resource_version: string;
      spec: unknown;
    };
    const objects = new Map<string, RoutingObject>();
    const puts: string[] = [];
    const siteUid = 'replacement-site';
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.includes('securemesh_site_v2s/'))
        return json({
          metadata: { name: binding.siteName, namespace: 'system', labels },
          system_metadata: { uid: siteUid },
        });
      if (init?.method === 'PUT') {
        puts.push(path);
        const current = objects.get(path);
        if (!current) throw new Error('Missing test routing object');
        objects.set(path, { ...JSON.parse(String(init.body)), system_metadata: current.system_metadata });
        throw new Error('response lost after durable update');
      }
      return objects.has(path) ? json(objects.get(path)) : json({}, 404);
    });
    const interfaces = [
      {
        name: 'ce-gre',
        node: 'node-one',
        interfaceName: 'eth0',
        interfaceMtu: 1500,
        awsGreAddress: '100.64.0.1',
        ceInsideAddress: '169.254.10.1',
        awsBgpAddresses: ['169.254.10.2', '169.254.10.3'] as [string, string],
      },
    ];
    const desired = contract.buildAwsRouting(binding.siteName, 65010, 64512, interfaces, ['10.253.0.0/16']);
    const resources = [
      { kind: 'external_connector' as const, name: 'ce-gre', uid: 'connector' },
      { kind: 'bgp_routing_policy' as const, name: desired.exportPolicy.name, uid: 'policy' },
      { kind: 'bgp' as const, name: desired.bgp.name, uid: 'bgp' },
    ];
    for (const resource of resources)
      objects.set(`/api/config/namespaces/system/${resource.kind}s/${resource.name}`, {
        metadata: { name: resource.name, namespace: 'system', labels: { ...labels, 'xcsh-ce-site': binding.siteName } },
        system_metadata: { uid: resource.uid },
        resource_version: '1',
        spec:
          resource.kind === 'bgp'
            ? desired.bgp.spec
            : resource.kind === 'bgp_routing_policy'
              ? desired.exportPolicy.spec
              : desired.connectors[0].spec,
      });

    if (mismatch === 'policy') {
      const current = objects.get(`/api/config/namespaces/system/bgp_routing_policys/${desired.exportPolicy.name}`);
      if (!current) throw Error('missing fixture');
      current.spec = {
        rules: [
          {
            match: { ip_prefixes: { prefixes: [{ ip_prefixes: '0.0.0.0/0', equal_or_longer_than: {} }] } },
            action: { deny: {} },
          },
        ],
      };
    } else {
      const current = objects.get(`/api/config/namespaces/system/bgps/${desired.bgp.name}`);
      if (!current) throw Error('missing fixture');
      const spec = structuredClone(desired.bgp.spec);
      for (const peer of spec.peers)
        Object.assign(peer, {
          routing_policies: {
            route_policy: [
              { all_nodes: {}, outbound: {}, object_refs: [{ name: desired.exportPolicy.name, namespace: 'system' }] },
            ],
          },
        });
      current.spec = spec;
    }
    await expect(
      runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, ['10.253.0.0/16'], async () => {}),
    ).rejects.toThrow('differs');
    expect(puts).toHaveLength(0);
  });

test('bootstrap revocation reconciles lost responses and requires absence before completion', async () => {
  const contract = fixture();
  for (const mode of ['deleted', 'lost-response', 'pending', 'foreign', 'forbidden'] as const) {
    let deletes = 0;
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (_url, init) => {
      if (init?.method === 'DELETE') {
        deletes++;
        return json({}, mode === 'lost-response' ? 503 : mode === 'forbidden' ? 403 : 200);
      }
      if (deletes && !['pending', 'forbidden'].includes(mode)) return json({}, 404);
      return json({
        metadata: { name: 'ce-token', namespace: 'system', labels: { ...labels, 'xcsh-ce-node': binding.nodes[0] } },
        spec: { site_name: mode === 'foreign' ? 'other-site' : binding.siteName },
      });
    });
    if (['pending', 'foreign', 'forbidden'].includes(mode)) {
      await expect(runtime.deleteBootstrapToken(binding, binding.nodes[0], 'ce-token')).rejects.toThrow();
      expect(deletes).toBe(mode === 'foreign' ? 0 : 1);
    } else {
      await runtime.deleteBootstrapToken(binding, binding.nodes[0], 'ce-token');
      await runtime.deleteBootstrapToken(binding, binding.nodes[0], 'ce-token');
      expect(deletes).toBe(1);
    }
  }
});

test('public replacement projects only writable fields and rejects stale UID/version before PUT', async () => {
  const contract = fixture();
  let site: Record<string, unknown> = {
    metadata: { name: binding.siteName, namespace: 'system', labels },
    system_metadata: { uid: 'public-site-uid' },
    resource_version: 'version-one',
    spec: contract.buildSite(intent),
  };
  const requests: Record<string, unknown>[] = [];
  const runtime = new CeRuntime(
    contract,
    'native',
    'https://tenant.example.test',
    'fixture-token',
    async (_url, init) => {
      if (init?.method === 'PUT') {
        const request = JSON.parse(String(init.body));
        requests.push(request);
        site = { ...site, resource_version: 'version-two', spec: request.spec };
      }
      return json(site);
    },
  );
  await expect(
    runtime.replaceSite(binding, intent, { uid: 'foreign-site-uid', resourceVersion: 'version-one' }, async () => {}),
  ).rejects.toThrow(/replan/);
  await expect(
    runtime.replaceSite(binding, intent, { uid: 'public-site-uid', resourceVersion: 'stale' }, async () => {}),
  ).rejects.toThrow(/replan/);
  expect(requests).toHaveLength(0);
  const phases: unknown[] = [];
  await runtime.replaceSite(
    binding,
    intent,
    { uid: 'public-site-uid', resourceVersion: 'version-one' },
    async (record) => {
      phases.push(record.phase);
    },
  );
  expect(requests).toHaveLength(1);
  const spec = requests[0].spec as Record<string, unknown>;
  expect(spec.disable_management_network).toBeUndefined();
  expect(requests[0].resource_version).toBe('version-one');
  expect(phases).toEqual(['replace-prepared', 'replace-observed']);
});

test('replacement preserves observed primary identity flags and rejects caller changes', async () => {
  const contract = fixture();
  const spec = contract.buildSite(intent);
  const node = (spec.aws as { not_managed: { node_list: Array<{ interface_list: Array<Record<string, unknown>> }> } })
    .not_managed.node_list[0];
  Object.assign(node.interface_list[0], { is_primary: true, is_management: false });
  const snapshot = {
    metadata: { name: binding.siteName, namespace: 'system', labels },
    system_metadata: { uid: 'owned-primary-site' },
    resource_version: 'version-one',
    spec,
  };
  const replacement = contract.siteReplaceRequest(snapshot);
  const result = (replacement.spec as typeof spec).aws as {
    not_managed: { node_list: Array<{ interface_list: Array<Record<string, unknown>> }> };
  };
  expect(result.not_managed.node_list[0].interface_list[0].is_primary).toBe(true);
  expect(result.not_managed.node_list[0].interface_list[0].is_management).toBe(false);
  result.not_managed.node_list[0].interface_list[0].is_primary = false;
  expect(() => contract.validateObservedSiteReplace(snapshot, replacement)).toThrow(/flags changed/);
  expect(() => contract.validateSiteReplace(replacement)).toThrow();
  expect(() =>
    contract.buildSite({
      ...intent,
      nodes: [{ ...intent.nodes[0], interfaces: [{ ...intent.nodes[0].interfaces[0], is_primary: true }] }],
    }),
  ).toThrow();
});

test('routing power replacement checkpoints before PUT and reconciles exact retained UID without replay', async () => {
  const contract = fixture(true);
  const originalSpec = {
    bgp_parameters: { asn: 65010, local_address: {} },
    where: {
      site: {
        network_type: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE',
        ref: [{ name: binding.siteName, namespace: 'system' }],
      },
    },
    peers: [],
  };
  let current: Record<string, unknown> = {
    metadata: {
      name: 'power-bgp',
      namespace: 'system',
      labels: { ...labels, 'xcsh-ce-site': binding.siteName, 'xcsh-ce-site-uid': 'site-one' },
    },
    system_metadata: { uid: 'bgp-one' },
    resource_version: 'version-one',
    spec: originalSpec,
  };
  let puts = 0;
  let checkpointed = false;
  const desired = { ...originalSpec, peers: [{ metadata: { name: 'test-peer' } }] };
  const portContract = new Proxy(contract, {
    get(target, key) {
      if (key === 'routingReplaceRequest')
        return (_kind: string, snapshot: Record<string, unknown>, spec: unknown) => ({
          metadata: snapshot.metadata,
          spec,
          resource_version: snapshot.resource_version,
        });
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const runtime = new CeRuntime(portContract, 'native', 'https://tenant.test', 'credential', async (url, init) => {
    if (String(url).includes('securemesh_site_v2s/'))
      return json({
        metadata: { name: binding.siteName, namespace: 'system', labels },
        system_metadata: { uid: 'site-one' },
      });
    if (init?.method === 'PUT') {
      expect(checkpointed).toBe(true);
      puts++;
      const request = JSON.parse(String(init.body));
      current = { ...current, spec: request.spec, resource_version: 'version-two' };
      return json({}, 503);
    }
    return json(current);
  });
  const snapshot = {
    binding,
    siteUid: 'site-one',
    kind: 'bgp' as const,
    name: 'power-bgp',
    uid: 'bgp-one',
    resourceVersion: 'version-one',
    spec: originalSpec,
    contractFingerprint: contract.fingerprint,
  };
  await expect(
    runtime.replacePowerRouting(snapshot, desired, async () => {
      throw Error('checkpoint interruption');
    }),
  ).rejects.toThrow('checkpoint interruption');
  expect(puts).toBe(0);
  await runtime.replacePowerRouting(snapshot, desired, async () => {
    checkpointed = true;
  });
  expect(puts).toBe(1);
  await runtime.replacePowerRouting(snapshot, desired, async () => {
    throw Error('must not checkpoint completed replacement');
  });
  expect(puts).toBe(1);
  current = { ...current, system_metadata: { uid: 'foreign' } };
  await expect(runtime.replacePowerRouting(snapshot, desired, async () => {})).rejects.toThrow('identity');
  expect(puts).toBe(1);
});

test('maintenance routing observation binds site and child identity before writable projection', async () => {
  const contract = fixture(true);
  const bgp = contract.buildAwsRouting(
    binding.siteName,
    65010,
    64512,
    [
      {
        name: 'ce-gre',
        node: 'node-one',
        interfaceName: 'ens6',
        interfaceMtu: 1500,
        awsGreAddress: '100.64.0.1',
        ceInsideAddress: '169.254.10.1',
        awsBgpAddresses: ['169.254.10.2', '169.254.10.3'],
      },
    ],
    ['10.253.0.0/16'],
  ).bgp;
  let foreign = false;
  let missingVersion = false;
  let reads = 0;
  const portContract = new Proxy(contract, {
    get(target, key) {
      if (key === 'routingReplaceRequest')
        return (_kind: string, snapshot: Record<string, unknown>, spec: unknown) => ({
          metadata: snapshot.metadata,
          spec,
          resource_version: snapshot.resource_version,
        });
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const runtime = new CeRuntime(portContract, 'native', 'https://tenant.test', 'credential', async (url) => {
    reads++;
    if (String(url).includes('securemesh_site_v2s/'))
      return json({
        metadata: { name: binding.siteName, namespace: 'system', labels },
        system_metadata: { uid: 'site-one' },
      });
    return json({
      metadata: {
        name: bgp.name,
        namespace: 'system',
        labels: { ...labels, 'xcsh-ce-site': binding.siteName, 'xcsh-ce-site-uid': foreign ? 'foreign' : 'site-one' },
      },
      system_metadata: { uid: 'bgp-one' },
      resource_version: missingVersion ? '' : 'v1',
      spec: bgp.spec,
    });
  });
  const observed = await runtime.observePowerRouting(binding, 'bgp', bgp.name);
  expect(observed).toMatchObject({ siteUid: 'site-one', uid: 'bgp-one', resourceVersion: 'v1', spec: bgp.spec });
  expect(reads).toBe(3);
  foreign = true;
  await expect(runtime.observePowerRouting(binding, 'bgp', bgp.name)).rejects.toThrow('identity');
  foreign = false;
  missingVersion = true;
  await expect(runtime.observePowerRouting(binding, 'bgp', bgp.name)).rejects.toThrow('revision');
});

for (const mode of [
  'create',
  'lost-response',
  'accepted-absent',
  'submitted-absent',
  'foreign-attempt',
  'checkpoint-interrupted',
  'site-changed',
  'wrong-engine',
  'terraform-runtime',
  'forbidden',
] as const)
  test(`maintenance policy creation ${mode} retains original submission`, async () => {
    const contract = fixture(true);
    const spec = {
      rules: [
        {
          match: { ip_prefixes: { prefixes: [{ ip_prefixes: '10.200.0.0/16', equal_or_longer_than: {} }] } },
          action: { deny: {} },
        },
      ],
    };
    let child: Record<string, unknown> | undefined;
    let posts = 0;
    let siteUid = 'site-one';
    const events: string[] = [];
    const portContract = new Proxy(contract, {
      get(target, key) {
        if (key === 'routingReplaceRequest')
          return (_kind: string, snapshot: Record<string, unknown>, value: unknown) => ({
            metadata: snapshot.metadata,
            spec: value,
            resource_version: snapshot.resource_version,
          });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const runtime = new CeRuntime(
      portContract,
      mode === 'terraform-runtime' ? 'terraform' : 'native',
      'https://tenant.test',
      'credential',
      async (url, init) => {
        if (String(url).includes('securemesh_site_v2s/'))
          return json({
            metadata: { name: binding.siteName, namespace: 'system', labels },
            system_metadata: { uid: siteUid },
          });
        if (init?.method === 'POST') {
          events.push('post');
          posts++;
          if (mode === 'forbidden') return json({}, 403);
          if (mode === 'accepted-absent') return json({});
          child = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'policy-one' }, resource_version: 'v1' };
          return json({}, mode === 'lost-response' ? 503 : 200);
        }
        return child ? json(child) : json({}, 404);
      },
    );
    const intent = {
      binding: ['wrong-engine', 'terraform-runtime'].includes(mode)
        ? { ...binding, owner: { ...binding.owner, engine: 'terraform' as const } }
        : binding,
      siteUid: 'site-one',
      name: 'ce-one-tgw-power-policy',
      spec,
      attemptId: 'a'.repeat(64),
      contractFingerprint: contract.fingerprint,
    };
    if (mode === 'foreign-attempt')
      child = {
        metadata: {
          name: intent.name,
          namespace: 'system',
          labels: {
            ...labels,
            'xcsh-ce-site': binding.siteName,
            'xcsh-ce-site-uid': 'site-one',
            'xcsh-ce-power-attempt': 'b'.repeat(64),
          },
        },
        system_metadata: { uid: 'foreign-policy' },
        resource_version: 'v1',
        spec,
      };
    const invoke = () =>
      runtime.createPowerRoutingPolicy(
        intent,
        mode === 'submitted-absent' ? 'submitted' : 'not-submitted',
        async () => {
          events.push('checkpoint');
          if (mode === 'checkpoint-interrupted') throw Error('checkpoint interrupted');
          if (mode === 'site-changed') siteUid = 'replacement-site';
        },
      );
    if (
      [
        'foreign-attempt',
        'checkpoint-interrupted',
        'site-changed',
        'wrong-engine',
        'terraform-runtime',
        'forbidden',
      ].includes(mode)
    ) {
      await expect(invoke()).rejects.toThrow();
      expect(posts).toBe(mode === 'forbidden' ? 1 : 0);
    } else {
      const result = await invoke();
      expect(result.status).toBe(['submitted-absent', 'accepted-absent'].includes(mode) ? 'pending' : 'observed');
      if (!['submitted-absent', 'accepted-absent'].includes(mode)) {
        expect(result).toMatchObject({ uid: 'policy-one', siteUid: 'site-one', attemptId: intent.attemptId, spec });
        expect(events).toEqual(['checkpoint', 'post']);
        await runtime.createPowerRoutingPolicy(intent, 'submitted', async () => {
          throw Error('must not checkpoint again');
        });
      }
      const before = posts;
      await runtime.createPowerRoutingPolicy(intent, 'submitted', async () => {
        throw Error('must not replay');
      });
      expect(posts).toBe(before);
      expect(posts).toBe(mode === 'submitted-absent' ? 0 : 1);
    }
  });

for (const mode of [
  'delete',
  'lost-response',
  'pending',
  'submitted-present',
  'already-absent',
  'foreign-uid',
  'foreign-attempt',
  'checkpoint-interrupted',
  'site-changed',
] as const)
  test(`maintenance policy retirement ${mode} binds exact retained identity`, async () => {
    const contract = fixture(true),
      name = 'ce-one-tgw-power-policy',
      attemptId = 'a'.repeat(64);
    const spec = {
      rules: [
        {
          match: { ip_prefixes: { prefixes: [{ ip_prefixes: '10.200.0.0/16', equal_or_longer_than: {} }] } },
          action: { deny: {} },
        },
      ],
    };
    let child: Record<string, unknown> | undefined =
      mode === 'already-absent'
        ? undefined
        : {
            metadata: {
              name,
              namespace: 'system',
              labels: {
                ...labels,
                'xcsh-ce-site': binding.siteName,
                'xcsh-ce-site-uid': 'site-one',
                'xcsh-ce-power-attempt': mode === 'foreign-attempt' ? 'b'.repeat(64) : attemptId,
              },
            },
            system_metadata: { uid: mode === 'foreign-uid' ? 'foreign' : 'policy-one' },
            resource_version: 'v1',
            spec,
          };
    let deletes = 0,
      siteUid = 'site-one';
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'credential', async (url, init) => {
      if (String(url).includes('securemesh_site_v2s/'))
        return json({
          metadata: { name: binding.siteName, namespace: 'system', labels },
          system_metadata: { uid: siteUid },
        });
      if (init?.method === 'DELETE') {
        deletes++;
        if (mode !== 'pending') child = undefined;
        return json({}, mode === 'lost-response' ? 503 : 200);
      }
      return child ? json(child) : json({}, 404);
    });
    const snapshot = {
      binding,
      siteUid: 'site-one',
      name,
      uid: 'policy-one',
      resourceVersion: 'v1',
      spec,
      attemptId,
      contractFingerprint: contract.fingerprint,
    };
    const invoke = () =>
      runtime.deletePowerRoutingPolicy(
        snapshot,
        mode === 'submitted-present' ? 'submitted' : 'not-submitted',
        async () => {
          if (mode === 'checkpoint-interrupted') throw Error('checkpoint interrupted');
          if (mode === 'site-changed') siteUid = 'replacement';
        },
      );
    if (['foreign-uid', 'foreign-attempt', 'checkpoint-interrupted', 'site-changed'].includes(mode)) {
      await expect(invoke()).rejects.toThrow();
      expect(deletes).toBe(0);
    } else {
      const result = await invoke();
      expect(result.status).toBe(['pending', 'submitted-present'].includes(mode) ? 'pending' : 'deleted');
      const before = deletes;
      await runtime.deletePowerRoutingPolicy(snapshot, 'submitted', async () => {
        throw Error('must not repeat delete');
      });
      expect(deletes).toBe(before);
      expect(deletes).toBe(['submitted-present', 'already-absent'].includes(mode) ? 0 : 1);
    }
  });

for (const mode of ['active', 'withdrawn', 'identity-changed', 'unavailable'] as const)
  test(`owned BGP service observer ${mode} separates freshness`, async () => {
    const contract = fixture(true);
    let siteReads = 0;
    const expected = ['169.254.10.2', '169.254.10.3'].map((peerAddress) => ({
      node: binding.nodes[0],
      interfaceName: 'ce-gre-one',
      peerAddress,
    }));
    const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'credential', async (url) => {
      const path = String(url);
      if (path.includes('securemesh_site_v2s/')) {
        siteReads++;
        return json({
          metadata: { name: binding.siteName, namespace: 'system', labels },
          system_metadata: { uid: mode === 'identity-changed' && siteReads > 1 ? 'replacement' : 'site-one' },
        });
      }
      if (mode === 'unavailable') return json({}, 503);
      if (path.includes('bgp_peers'))
        return json({
          ver: [
            {
              name: binding.nodes[0],
              peer: expected.map((p) => ({
                interface_name: p.interfaceName,
                peer_address: { ipv4: { addr: p.peerAddress } },
                protocol_status: 'Established',
                received_prefix_count: 1,
                advertised_prefix_count: mode === 'withdrawn' ? 0 : 1,
                up_down_timestamp: '2026-09-10T12:00:00Z',
              })),
            },
          ],
        });
      return json({
        ver: [
          {
            name: binding.nodes[0],
            ri_table: [
              {
                routing_instance: 'site-local-inside',
                rt_table: [
                  { name: 'inet.0', imported: [], exported: mode === 'withdrawn' ? [] : [{ subnet: '10.200.0.0/16' }] },
                ],
              },
            ],
          },
        ],
      });
    });
    const invoke = () =>
      runtime.observeBgpServiceMembership(
        binding,
        'site-one',
        expected,
        [{ node: binding.nodes[0], routingInstance: 'site-local-inside', table: 'inet.0' }],
        ['10.200.0.0/16'],
      );
    if (mode === 'identity-changed' || mode === 'unavailable') await expect(invoke()).rejects.toThrow();
    else {
      const observed = await invoke();
      expect(observed).toMatchObject({
        status: mode,
        siteUid: 'site-one',
        freshness: 'unqualified',
        traffic: 'unknown',
      });
      expect(siteReads).toBe(2);
    }
  });

test('owned power observation exposes the exact generated external connector snapshot', async () => {
  const contract = fixture(true),
    spec = contract.buildAwsRouting(
      binding.siteName,
      65010,
      64512,
      [
        {
          name: 'ce-gre-one',
          node: binding.nodes[0],
          interfaceName: 'ens6',
          interfaceMtu: 1500,
          awsGreAddress: '100.64.0.1',
          ceInsideAddress: '169.254.10.1',
          awsBgpAddresses: ['169.254.10.2', '169.254.10.3'],
        },
      ],
      ['10.0.0.0/16'],
    ).connectors[0].spec;
  const portContract = new Proxy(contract, {
    get(target, key) {
      if (key === 'routingReplaceRequest')
        return (kind: string, snapshot: Record<string, unknown>, value: unknown) => {
          expect(kind).toBe('external_connector');
          return { metadata: snapshot.metadata, spec: value, resource_version: snapshot.resource_version };
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const runtime = new CeRuntime(portContract, 'native', 'https://tenant.test', 'credential', async (url) =>
    String(url).includes('securemesh_site_v2s/')
      ? json({
          metadata: { name: binding.siteName, namespace: 'system', labels },
          system_metadata: { uid: 'site-one' },
        })
      : json({
          metadata: {
            name: 'ce-gre-one',
            namespace: 'system',
            labels: { ...labels, 'xcsh-ce-site': binding.siteName, 'xcsh-ce-site-uid': 'site-one' },
          },
          system_metadata: { uid: 'connector-one' },
          resource_version: 'v1',
          spec,
        }),
  );
  expect(await runtime.observePowerRouting(binding, 'external_connector', 'ce-gre-one')).toMatchObject({
    kind: 'external_connector',
    uid: 'connector-one',
    siteUid: 'site-one',
    resourceVersion: 'v1',
    spec,
  });
});

for (const mode of ['create', 'submitted', 'foreign-attempt', 'delete', 'pending-delete'] as const)
  test(`Terraform power policy ${mode} uses provider-owned execution exclusively`, async () => {
    const contract = fixture(true),
      own = { ...binding, owner: { ...binding.owner, engine: 'terraform' as const } },
      terraformLabels = { ...labels, 'xcsh-ce-engine': 'terraform' },
      name = 'ce-one-tgw-power-policy',
      attemptId = 'a'.repeat(64),
      spec = {
        rules: [
          {
            match: { ip_prefixes: { prefixes: [{ ip_prefixes: '10.200.0.0/16', equal_or_longer_than: {} }] } },
            action: { deny: {} },
          },
        ],
      };
    let child: Record<string, unknown> | undefined = ['delete', 'pending-delete', 'foreign-attempt'].includes(mode)
      ? {
          metadata: {
            name,
            namespace: 'system',
            labels: {
              ...terraformLabels,
              'xcsh-ce-site': own.siteName,
              'xcsh-ce-site-uid': 'site-one',
              'xcsh-ce-power-attempt': mode === 'foreign-attempt' ? 'b'.repeat(64) : attemptId,
            },
          },
          system_metadata: { uid: 'policy-one' },
          resource_version: 'v1',
          spec,
        }
      : undefined;
    const mutations: string[] = [];
    const portContract = new Proxy(contract, {
      get(target, key) {
        if (key === 'routingReplaceRequest')
          return (_kind: unknown, child: Record<string, unknown>, spec: unknown) => ({
            metadata: child.metadata,
            spec,
            resource_version: child.resource_version,
          });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const runtime = new CeRuntime(
      portContract,
      'terraform',
      'https://tenant.test',
      'credential',
      async (url, init) => {
        if (['POST', 'PUT', 'DELETE'].includes(init?.method ?? '')) throw Error('native REST mutation forbidden');
        return String(url).includes('securemesh_site_v2s/')
          ? json({
              metadata: { name: own.siteName, namespace: 'system', labels: terraformLabels },
              system_metadata: { uid: 'site-one' },
            })
          : child
            ? json(child)
            : json({}, 404);
      },
      async (owner, _path, init) => {
        expect(owner).toEqual(own.owner);
        mutations.push(init.method ?? '');
        if (init.method === 'POST')
          child = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'policy-one' }, resource_version: 'v1' };
        if (init.method === 'DELETE' && mode !== 'pending-delete') child = undefined;
        return child ?? {};
      },
    );
    const intent = {
      binding: own,
      siteUid: 'site-one',
      name,
      spec,
      attemptId,
      contractFingerprint: contract.fingerprint,
    };
    const checkpoints: string[] = [];
    const invoke = () =>
      ['delete', 'pending-delete'].includes(mode)
        ? runtime.deleteTerraformPowerRoutingPolicy(
            { ...intent, uid: 'policy-one', resourceVersion: 'v1' },
            'not-submitted',
            async () => {
              checkpoints.push('delete');
            },
          )
        : runtime.createTerraformPowerRoutingPolicy(
            intent,
            mode === 'submitted' ? 'submitted' : 'not-submitted',
            async () => {
              checkpoints.push('create');
            },
          );
    if (mode === 'foreign-attempt') {
      await expect(invoke()).rejects.toThrow();
      expect(mutations).toEqual([]);
    } else {
      const result = await invoke();
      expect(result.status).toBe(
        mode === 'submitted' || mode === 'pending-delete' ? 'pending' : mode === 'delete' ? 'deleted' : 'observed',
      );
      expect(mutations).toEqual(
        mode === 'submitted' ? [] : [mode === 'delete' || mode === 'pending-delete' ? 'DELETE' : 'POST'],
      );
      expect(checkpoints).toEqual(
        mode === 'submitted' ? [] : [mode === 'delete' || mode === 'pending-delete' ? 'delete' : 'create'],
      );
    }
  });

for (const mode of ['stable', 'upgrading', 'offline', 'stale', 'replacement', 'changed-version', 'foreign'] as const)
  test(`owned power version observation ${mode} keeps freshness separate`, async () => {
    let logicalReads = 0,
      physicalReads = 0;
    const calls: string[] = [];
    const runtime = new CeRuntime(fixture(), 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
      calls.push(init?.method ?? 'GET');
      const metadata = { name: binding.siteName, namespace: 'system', labels: mode === 'foreign' ? {} : labels };
      if (new URL(url).pathname.includes('securemesh_site_v2s'))
        return json({
          metadata,
          system_metadata: { uid: mode === 'replacement' && ++logicalReads > 1 ? 'replacement' : 'logical-one' },
        });
      physicalReads++;
      return json({
        metadata,
        system_metadata: { uid: 'physical-one' },
        spec: { site_state: mode === 'offline' ? 'OFFLINE' : 'ONLINE', main_nodes: [{ name: 'node-one' }] },
        status: [
          {
            metadata: {
              uid: 'sw-publisher',
              creator_class: 'maurice',
              status_id: 'software-version',
              publish: 'STATUS_PUBLISH',
              vtrp_stale: mode === 'stale',
            },
            volterra_software_status: {
              last_installed_version:
                mode === 'changed-version' && physicalReads > 1 ? 'crt-20260201-0179' : 'crt-20260201-0178',
              available_version: 'crt-20260201-0179',
              deployment_state: {
                phase: mode === 'upgrading' ? 'UPGRADE_IN_PROGRESS' : 'UPGRADE_COMPLETED',
                result: 'Completed',
              },
            },
          },
          {
            metadata: {
              uid: 'os-publisher',
              creator_class: 'maurice',
              status_id: 'operating-system-version',
              publish: 'STATUS_PUBLISH',
              vtrp_stale: false,
            },
            operating_system_status: {
              available_version: '9.2026.17',
              deployment_state: { version: '9.2026.14', phase: 'UPGRADE_COMPLETED', result: 'success' },
            },
          },
        ],
      });
    });
    const result = await runtime.observePowerVersions(binding);
    expect(result.freshness).toBe('unqualified');
    expect(result.canSatisfyInterfaceMutationGate).toBe(false);
    expect(result.status).toBe(
      ['stale', 'replacement', 'changed-version', 'foreign'].includes(mode) ? 'unknown' : 'observed',
    );
    expect(result.stable).toBe(mode === 'stable');
    expect(calls.every((method) => method === 'GET')).toBe(true);
  });

for (const mode of ['stable', 'replaced', 'configuration-changed'] as const)
  test(`interface observation ${mode} rechecks owned site configuration`, async () => {
    const data = structuredClone(recordedInterfaces),
      selected = {
        ...binding,
        siteName: data.configuration.metadata.name,
        nodes: data.expected.map((row) => row.node).filter((node, i, all) => all.indexOf(node) === i),
      };
    Object.assign(data.configuration.metadata, { labels });
    let reads = 0;
    const runtime = new CeRuntime(fixture(), 'native', 'https://tenant.test', 'test-credential', async (url) => {
      const path = new URL(url).pathname;
      if (path.includes('securemesh_site_v2s')) {
        reads++;
        const configuration = structuredClone(data.configuration);
        if (reads > 1 && mode === 'replaced') configuration.system_metadata.uid = 'replacement';
        if (reads > 1 && mode === 'configuration-changed')
          configuration.spec.aws.not_managed.node_list[0].interface_list[0].mtu = 1400;
        return json(configuration);
      }
      return json(path.includes('network_interfaces') ? data.objects : data.physical);
    });
    const expected = data.expected.map((row) => ({ ...row, role: row.role as 'slo' | 'sli' }));
    const result = await runtime.observeAwsInterfaces(selected, expected);
    expect(result.status).toBe(mode === 'stable' ? 'observed' : 'unknown');
    if (mode !== 'stable') expect(result.interfaces).toHaveLength(0);
    expect(reads).toBe(2);
  });

test('pending admission runtime validates scope and performs only read-only complete observations', async () => {
  const requests: string[] = [];
  const runtime = new CeRuntime(fixture(), 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
    expect(init?.method ?? 'GET').toBe('GET');
    requests.push(String(url));
    if (String(url).includes('/securemesh_site_v2s/'))
      return json({
        metadata: { name: binding.siteName, namespace: 'system', labels },
        system_metadata: { uid: 'logical-uid' },
      });
    if (String(url).includes('/sites/')) return json({}, 404);
    return json({ items: [], errors: [] });
  });
  const ingress = { fingerprint: 'verified-ingress' } as unknown as VerifiedIngressContract;
  expect(() =>
    runtime.pendingAdmissionInventory([{ ...binding, siteName: '../escape' }], ['default'], ingress),
  ).toThrow('binding');
  expect(requests).toHaveLength(0);
  const receipt = await runtime.pendingAdmissionInventory([binding], ['default'], ingress);
  expect(receipt.status).toBe('observed');
  expect(receipt.siteContractFingerprint).toBe(runtime.contract.fingerprint);
  expect(receipt.ingressContractFingerprint).toBe(ingress.fingerprint);
  expect(requests).toHaveLength(18);
});

for (const mode of ['valid', 'foreign-uid', 'absent', 'lost-response'] as const)
  test(`exact bootstrap revocation ${mode} retains UID and owner checks`, async () => {
    let present = mode !== 'absent',
      deletes = 0;
    const runtime = new CeRuntime(fixture(), 'native', 'https://tenant.test', 'test-credential', async (_url, init) => {
      if (init?.method === 'DELETE') {
        deletes++;
        present = false;
        if (mode === 'lost-response') throw new Error('response lost');
        return json({});
      }
      return present
        ? json({
            metadata: {
              name: 'ce-token',
              namespace: 'system',
              labels: { ...labels, 'xcsh-ce-node': binding.nodes[0] },
            },
            system_metadata: { uid: mode === 'foreign-uid' ? 'different-token' : 'token-uid' },
            spec: { site_name: binding.siteName },
          })
        : json({}, 404);
    });
    if (mode === 'foreign-uid')
      await expect(
        runtime.deleteBootstrapTokenExact(binding, binding.nodes[0], 'ce-token', 'token-uid'),
      ).rejects.toThrow('ownership');
    else await runtime.deleteBootstrapTokenExact(binding, binding.nodes[0], 'ce-token', 'token-uid');
    expect(deletes).toBe(['valid', 'lost-response'].includes(mode) ? 1 : 0);
  });

test('observed-only F5 reconciliation uses the typed Terraform owner service', async () => {
  const owner = { ...binding.owner, engine: 'terraform' as const };
  const calls: Array<{ method: unknown; owner: unknown }> = [];
  const runtime = new CeRuntime(
    fixture(),
    'terraform',
    'https://tenant.test',
    'test-credential',
    async () => {
      throw Error('native REST must not execute');
    },
    async (actual, _path, init) => {
      calls.push({ owner: actual, method: init.method });
      return {};
    },
  );
  await runtime.reconcileObservedTerraformResources(owner);
  expect(calls).toEqual([{ owner, method: 'RECONCILE_OBSERVED' }]);
  await expect(runtime.reconcileObservedTerraformResources(binding.owner)).rejects.toThrow('unavailable');
  expect(calls).toHaveLength(1);
});

test('unsubmitted F5 cancellation uses the typed Terraform owner service', async () => {
  const owner = { ...binding.owner, engine: 'terraform' as const };
  const calls: Array<{ method: unknown; owner: unknown }> = [];
  const runtime = new CeRuntime(
    fixture(),
    'terraform',
    'https://tenant.test',
    'test-credential',
    async () => {
      throw Error('native REST must not execute');
    },
    async (actual, _path, init) => {
      calls.push({ owner: actual, method: init.method });
      return {};
    },
  );
  await runtime.cancelUnsubmittedTerraformResources(owner);
  expect(calls).toEqual([{ owner, method: 'CANCEL_UNSUBMITTED' }]);
  await expect(runtime.cancelUnsubmittedTerraformResources(binding.owner)).rejects.toThrow('unavailable');
  expect(calls).toHaveLength(1);
});

for (const identity of ['same', 'foreign-site', 'foreign-contract', 'foreign-tenant'] as const) {
  test(`public replacement retains interface observer bindings only for trusted identity (${identity})`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ce-site-update-binding-'));
    const published = fixture();
    const expected = [{ node: 'node-one', mac: '02:00:00:00:00:01', device: 'ens5', role: 'slo' as const }];
    let site: Record<string, unknown> = {
      metadata: { name: binding.siteName, namespace: 'system', labels },
      system_metadata: { uid: 'public-site-uid' },
      resource_version: 'version-one',
      spec: published.buildSite(intent),
    };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      if (init?.method === 'PUT') {
        const request = JSON.parse(String(init.body));
        site = { ...site, resource_version: 'version-two', spec: request.spec };
      }
      return json(site);
    }) as typeof fetch;
    try {
      const service = createCePlatformService(
        {
          XCSH_API_URL: 'https://tenant.example.test',
          XCSH_API_TOKEN: 'fixture-token',
          XCSH_CE_DEPLOYMENTS_DIR: directory,
        },
        async () => published,
      );
      const storage = await service.storage(binding.owner);
      await storage.write('site-binding-ce-one.json', {
        schemaVersion: 1,
        tenantOrigin: identity === 'foreign-tenant' ? 'https://foreign.example.test' : 'https://tenant.example.test',
        contractFingerprint: identity === 'foreign-contract' ? 'sha256:foreign' : published.fingerprint,
        siteUid: identity === 'foreign-site' ? 'foreign-site-uid' : 'public-site-uid',
        binding,
        expectedInterfaces: expected,
      });
      const runtime = await service.runtime('native');
      await runtime.replaceSite(
        binding,
        intent,
        { uid: 'public-site-uid', resourceVersion: 'version-one' },
        async () => {},
      );
      const after = (await storage.read('site-binding-ce-one.json')) as CeStoredSiteBinding;
      expect(after.expectedInterfaces).toEqual(identity === 'same' ? expected : []);
      expect(after.siteUid).toBe('public-site-uid');
    } finally {
      globalThis.fetch = previousFetch;
      await rm(directory, { recursive: true, force: true });
    }
  });
}

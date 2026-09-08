import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../src/ce/upgrade-contract';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import routingSchema from '../fixtures/aws-routing-schema.json';
import contract from '../fixtures/smsv2-contract-v7.json';
import schema from '../fixtures/smsv2-create-schema.json';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
const hash = (bytes: string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
async function candidate(withRouting = false) {
  const dir = await mkdtemp(join(tmpdir(), 'ce-contract-'));
  dirs.push(dir);
  const assets: Record<string, string> = {};
  const data: Record<string, unknown> = {
    'smsv2-contract.json': contract,
    'sites.json': { components: { schemas: schema.schemas } },
    'smsv2-evidence-receipt.json': { contract_id: contract.contract_id },
  };
  if (withRouting) {
    for (const [file, kind] of [
      ['network', 'bgp'],
      ['marketplace', 'external_connector'],
    ] as const) {
      data[`${file}.json`] = {
        components: { schemas: routingSchema.schemas[file] },
        paths: {
          [`/api/config/namespaces/{metadata.namespace}/${kind}s`]: {
            post: {
              requestBody: {
                content: { 'application/json': { schema: { $ref: `#/components/schemas/${kind}CreateRequest` } } },
              },
            },
          },
        },
      };
    }
  }
  for (const [file, value] of Object.entries(data)) {
    const bytes = JSON.stringify(value);
    assets[file] = hash(bytes);
    await writeFile(join(dir, file), bytes);
  }
  const manifest = JSON.stringify({
    schema_version: 1,
    contract_id: contract.contract_id,
    contract_version: contract.version,
    release: { commit: schema.provenance.commit },
    assets: {
      'smsv2-contract.json': assets['smsv2-contract.json'],
      'smsv2-evidence-receipt.json': assets['smsv2-evidence-receipt.json'],
    },
  });
  assets['smsv2-contract-manifest.json'] = hash(manifest);
  await writeFile(join(dir, 'smsv2-contract-manifest.json'), manifest);
  const receipt = JSON.stringify({
    kind: 'local-candidate',
    publication: 'held',
    repository: 'f5-sales-demo/api-specs-enriched',
    commit: schema.provenance.commit,
    assets,
  });
  await writeFile(join(dir, 'candidate-receipt.json'), receipt);
  return { contract: await VerifiedCeContract.candidate(dir, hash(receipt)), dir, digest: hash(receipt) };
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
  const { contract } = await candidate();
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
  const { contract } = await candidate();
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

test('exact site deletion binds the observed UID and reconciles pending or lost delete responses', async () => {
  const { contract } = await candidate();
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
  const { contract } = await candidate();
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
  const { contract } = await candidate();
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
test('candidate tampering fails before any API request', async () => {
  const { dir, digest } = await candidate();
  await writeFile(join(dir, 'sites.json'), '{}');
  await expect(VerifiedCeContract.candidate(dir, digest)).rejects.toThrow('checksum');
});
test('HTTP errors and malformed responses never expose server bodies', async () => {
  const { contract } = await candidate();
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

test('site-global health never fabricates per-node HA health or accepts foreign identities', async () => {
  const { contract } = await candidate();
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
test('registration health needs exact site/node/instance correlation and complete observations', async () => {
  const { contract } = await candidate();
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

test('registration approval checkpoints before mutation and preserves the server passport', async () => {
  const { contract } = await candidate();
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
  const { contract } = await candidate(true);
  const objects = new Map<string, unknown>();
  const posts: string[] = [];
  const runtime = new CeRuntime(contract, 'native', 'https://tenant.test', 'test-credential', async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.includes('securemesh_site_v2s/'))
      return json({ metadata: { name: binding.siteName, namespace: 'system', labels } });
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
    runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, async () => {
      throw new Error('checkpoint interrupted');
    }),
  ).rejects.toThrow('checkpoint interrupted');
  await runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, async () => {});
  expect(posts).toEqual(['/api/config/namespaces/system/external_connectors', '/api/config/namespaces/system/bgps']);
  await runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, async () => {});
  expect(posts).toHaveLength(2);
  const bgp = objects.get('/api/config/namespaces/system/bgps/ce-one-tgw-bgp') as { spec: { peers: unknown[] } };
  expect(bgp.spec.peers).toHaveLength(2);
});

test('AWS configured creation rejects missing observed devices before any API request', async () => {
  const { contract } = await candidate();
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
  const { contract } = await candidate();
  for (const engine of ['native', 'terraform'] as const) {
    const selected: SiteBinding = {
      ...binding,
      owner: { ...binding.owner, engine },
      initialVersions: { software: 'crt-20251002-0027', os: '9.2026.10' },
    };
    let site: Record<string, unknown> | undefined;
    let posts = 0;
    const runtime = new CeRuntime(contract, engine, 'https://tenant.test', 'test-credential', async (_url, init) => {
      if (init?.method === 'POST') {
        posts++;
        site = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'baseline-site-uid' } };
        return json({});
      }
      return site ? json(site) : json({}, 404);
    });
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

test('rejects unresolved initial version pairs before contacting the API', async () => {
  const { contract } = await candidate();
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
  const { contract } = await candidate();
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
  const { contract } = await candidate();
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
  const { contract } = await candidate(true);
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
  const { contract } = await candidate(true);
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
  const { contract } = await candidate(true);
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
  const desired = contract.buildAwsRouting(binding.siteName, 65010, 64512, interfaces);
  const resources = [
    { kind: 'external_connector' as const, name: 'ce-gre', uid: 'connector' },
    { kind: 'bgp' as const, name: desired.bgp.name, uid: 'bgp' },
  ];
  for (const [index, resource] of resources.entries())
    objects.set(`/api/config/namespaces/system/${resource.kind}s/${resource.name}`, {
      metadata: { name: resource.name, namespace: 'system', labels: { ...labels, 'xcsh-ce-site': binding.siteName } },
      system_metadata: { uid: resource.uid },
      resource_version: '1',
      spec: index ? desired.bgp.spec : desired.connectors[0].spec,
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
    runtime.ensureAwsRouting(binding, 65010, 64512, interfaces, checkpoint, undefined, rebind);
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
  expect(puts).toHaveLength(2);
  siteUid = 'foreign-site';
  await expect(run()).rejects.toThrow('Replacement site UID changed');
  expect(puts).toHaveLength(2);
  siteUid = rebind.siteUid;
  const connector = objects.get('/api/config/namespaces/system/external_connectors/ce-gre');
  if (!connector) throw new Error('Missing test connector');
  connector.system_metadata.uid = 'foreign';
  await expect(run()).rejects.toThrow('Replacement routing object UID changed');
  expect(puts).toHaveLength(2);
});

test('bootstrap revocation reconciles lost responses and requires absence before completion', async () => {
  const { contract } = await candidate();
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

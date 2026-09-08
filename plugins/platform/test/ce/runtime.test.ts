import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import contract from '../fixtures/smsv2-contract-v7.json';
import schema from '../fixtures/smsv2-create-schema.json';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
const hash = (bytes: string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
async function candidate() {
  const dir = await mkdtemp(join(tmpdir(), 'ce-contract-'));
  dirs.push(dir);
  const assets: Record<string, string> = {};
  const data: Record<string, unknown> = {
    'smsv2-contract.json': contract,
    'sites.json': { components: { schemas: schema.schemas } },
    'smsv2-evidence-receipt.json': { contract_id: contract.contract_id },
  };
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
          ethernet_interface: { mac: '02:00:00:00:00:01' },
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

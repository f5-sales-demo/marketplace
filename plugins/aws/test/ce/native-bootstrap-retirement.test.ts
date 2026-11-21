import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { storeBootstrapToken } from '../../../platform/src/ce/token-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { retireAwsNativeBootstrapCredentials } from '../../src/ce/native-bootstrap-retirement';
import { compileAwsNativeTeardown } from '../../src/ce/native-teardown';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function signed(draft: Omit<AwsCePlan, 'planId' | 'planSha256'>): AwsCePlan {
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
}

function fixture() {
  const { planId: _id, planSha256: _sha, ...source } = foundationPlan();
  const actions = [1, 2, 3].flatMap((node) =>
    [0, 1].map((role) => ({
      id: `peer-${node}-${role}`,
      phase: 'routing' as const,
      kind: 'tgw-connect-peer-create' as const,
      description: 'peer',
      node,
      mutates: true,
      destructive: false,
    })),
  );
  const base = signed({
    ...source,
    engine: 'native',
    intent: { ...source.intent, engine: 'native' },
    deploymentName: source.intent.deploymentName,
    accountId: source.intent.accountId,
    region: source.intent.region,
    topology: { nodeCount: 3, availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'] },
    routing: { ...source.intent.routing, profile: 'tgw-connect' },
    actions,
    rollback: { resources: [] },
    ownershipInventory: [],
  } as Omit<AwsCePlan, 'planId' | 'planSha256'>);
  const { planId: _baseId, planSha256: _baseSha, ...baseDraft } = base;
  const cloud = signed({
    ...baseDraft,
    intent: { ...base.intent, operation: 'teardown' },
    actions: [
      {
        id: 'delete-instance',
        phase: 'teardown',
        kind: 'resource-delete',
        description: 'delete',
        command: 'aws',
        args: ['ec2', 'terminate-instances', '--instance-ids', 'i-12345678'],
        resourceId: 'i-12345678',
        mutates: true,
        destructive: true,
      },
    ],
    ownershipInventory: [{ resourceId: 'i-12345678', owned: true, action: 'delete' }],
  } as Omit<AwsCePlan, 'planId' | 'planSha256'>);
  const selected = siteBindings(base);
  const owner = selected[0].binding.owner;
  const drain = {
    schemaVersion: 1 as const,
    owner,
    sourcePlanSha256: base.planSha256,
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    listeners: [],
    origins: [],
    sites: selected.map(({ site, binding }) => ({
      binding,
      siteUid: `uid-${site.name}`,
      routing: [
        { kind: 'bgp' as const, name: `${site.name}-tgw-bgp`, uid: `bgp-${site.name}` },
        {
          kind: 'bgp_routing_policy' as const,
          name: `${site.name}-tgw-export-policy`,
          uid: `policy-${site.name}`,
        },
        ...actions
          .filter((action) => site.nodeIndexes.includes(action.node))
          .map((action) => ({
            kind: 'external_connector' as const,
            name: `ce-gre-${actions.indexOf(action) + 1}`,
            uid: `gre-${actions.indexOf(action) + 1}`,
          })),
      ],
    })),
  };
  const retirement = selected.map(({ binding }) => ({
    siteName: binding.siteName,
    siteUid: `uid-${binding.siteName}`,
    physicalSiteUid: `physical-${binding.siteName}`,
    tokens: binding.nodes.map((node) => ({ node, name: `${node}-token` })),
  }));
  return { base, cloud, drain, retirement };
}

async function setup() {
  const f = fixture();
  const plan = compileAwsNativeTeardown(f.base, f.cloud, f.drain, f.retirement);
  const root = await mkdtemp(join(tmpdir(), 'native-secret-retirement-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, f.drain.owner);
  const token = f.retirement[0].tokens[0];
  const jwt = ['synthetic-header', 'synthetic-payload', 'synthetic-signature'].join('.');
  const secret = { tokenName: token.name, node: token.node, siteName: f.retirement[0].siteName, jwt };
  await store.write(`${token.name}.json`, secret);
  return { ...f, plan, root, store, token, secret };
}

test('retires exact checkpoint and preserves unrelated private state', async () => {
  const f = await setup();
  await f.store.write('unrelated.json', { preserved: true });
  const result = await retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store);
  expect(result.status).toBe('bootstrap-credentials-retired');
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(false);
  expect(await f.store.read('unrelated.json')).toEqual({ preserved: true });
  expect((await retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store)).inventorySha256).toBe(
    result.inventorySha256,
  );
});

test('foreign checkpoint metadata is retained', async () => {
  const f = await setup();
  await f.store.write(`${f.token.name}.json`, { ...f.secret, siteName: 'foreign-site' });
  await expect(retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store)).rejects.toThrow('checkpoint differs');
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(true);
});

test('malformed checkpoint parser context remains private', async () => {
  const f = await setup();
  await writeFile(join(f.store.directory, `${f.token.name}.json`), '{"jwt":"private-parser-context', { mode: 0o600 });
  await expect(retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store)).rejects.toThrow(
    'Malformed CE deployment artifact',
  );
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(true);
});

test('engine mismatch preserves credential material', async () => {
  const f = await setup();
  await expect(
    retireAwsNativeBootstrapCredentials({ ...f.base, engine: 'terraform' }, f.plan, f.store),
  ).rejects.toThrow('owner differs');
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(true);
});

test('retires real opaque storage through the checkpointed binding', async () => {
  const f = await setup();
  const root = join(f.root, 'opaque');
  const binding = siteBindings(f.base)[0].binding;
  const issued = await storeBootstrapToken({
    sessionId: 'native-test',
    token: f.secret.jwt,
    root,
    expiresInSeconds: 60,
    onPrepared: async (checkout) =>
      f.store.write(`bootstrap-checkout-${checkout.reference.split('/').at(-1)}.json`, {
        schemaVersion: 1,
        owner: f.store.owner,
        binding,
        siteUid: f.retirement[0].siteUid,
        contractFingerprint: f.plan.drain.siteContractFingerprint,
        tokenName: f.token.name,
        node: f.token.node,
        checkout,
      }),
  });
  const reference = new URL(issued.reference);
  const tokenFile = join(root, reference.hostname, reference.pathname.slice(1), 'token');
  expect(existsSync(tokenFile)).toBe(true);
  await retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store);
  expect(existsSync(tokenFile)).toBe(false);
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(false);
  await retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store);
});

test('interrupted cloud-init staging is joined to the known node and token', async () => {
  const f = await setup();
  const directory = join(f.store.directory, 'node-ABC123');
  await mkdir(directory, { mode: 0o700 });
  const body = `#cloud-config\nhostname: ${f.token.node}\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: |\n      token: ${f.secret.jwt}\n`;
  await writeFile(join(directory, 'cloud-init.yaml'), body, { mode: 0o600 });
  await retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store);
  expect(existsSync(directory)).toBe(false);
});

test('unrecognized launch files block all credential deletion', async () => {
  const f = await setup();
  const directory = join(f.store.directory, 'node-ABC123');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'unrelated.txt'), 'preserve', { mode: 0o600 });
  await expect(retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store)).rejects.toThrow('inventory differs');
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(true);
  expect(await readFile(join(directory, 'unrelated.txt'), 'utf8')).toBe('preserve');
});

test('aborted journal publication resumes without exposing or deleting changed material', async () => {
  const f = await setup();
  const controller = new AbortController();
  const original = f.store.write.bind(f.store);
  f.store.write = async (...args) => {
    await original(...args);
    if (args[0] === 'aws-native-bootstrap-retirement.json') controller.abort();
  };
  await expect(retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store, controller.signal)).rejects.toThrow();
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(true);
  f.store.write = original;
  await f.store.write(`${f.token.name}.json`, { ...f.secret, jwt: 'changed-private-value' });
  await expect(retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store)).rejects.toThrow(
    'changed after preparation',
  );
  expect(existsSync(join(f.store.directory, `${f.token.name}.json`))).toBe(true);
  await f.store.write(`${f.token.name}.json`, f.secret);
  expect((await retireAwsNativeBootstrapCredentials(f.base, f.plan, f.store)).status).toBe(
    'bootstrap-credentials-retired',
  );
});

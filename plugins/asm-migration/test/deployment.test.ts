import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { convertInput, deploy } from '../src/runtime';

const roots: string[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];
const prior = { ...process.env };
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const key of ['XCSH_API_URL', 'XCSH_API_TOKEN', 'XCSH_USERNAME', 'XCSH_NAMESPACE']) {
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
  }
});
const temporary = () => {
  const root = mkdtempSync(join(tmpdir(), 'asm-deploy-'));
  roots.push(root);
  return root;
};
const fixtures = resolve(import.meta.dir, 'fixtures');

function server(owner = 'operator') {
  const resources = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const instance = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const key = url.pathname;
      calls.push(`${request.method} ${key}`);
      if (request.headers.get('authorization') !== 'APIToken synthetic-secret')
        return new Response('', { status: 401 });
      if (request.method === 'GET') {
        const value = resources.get(key);
        return value ? Response.json(value) : new Response('', { status: 404 });
      }
      if (request.method === 'POST') {
        const body = (await request.json()) as Record<string, any>;
        const created = `${key}/${body.metadata.name}`;
        resources.set(created, { ...body, system_metadata: { creator_id: owner }, server_default: true });
        return Response.json(resources.get(created), { status: 201 });
      }
      if (request.method === 'PUT') {
        const body = (await request.json()) as Record<string, unknown>;
        resources.set(key, { ...body, system_metadata: { creator_id: owner }, server_default: true });
        return Response.json(resources.get(key));
      }
      if (request.method === 'DELETE') {
        resources.delete(key);
        return new Response('', { status: 204 });
      }
      return new Response('', { status: 405 });
    },
  });
  servers.push(instance);
  return { resources, calls, url: `http://127.0.0.1:${instance.port}` };
}
async function artifacts(root: string, namespace = 'lab') {
  const output = join(root, 'artifacts');
  await convertInput({
    policyPath: resolve(fixtures, 'minimal-policy.xml'),
    signaturesPath: resolve(fixtures, 'signatures.json'),
    namespace,
    outputDirectory: output,
    targetName: 'deployment-test',
    cwd: root,
  });
  return output;
}
function configure(url: string, namespace = 'lab') {
  process.env.XCSH_API_URL = url;
  process.env.XCSH_API_TOKEN = 'synthetic-secret';
  process.env.XCSH_USERNAME = 'operator';
  process.env.XCSH_NAMESPACE = namespace;
}

describe('deployment lifecycle', () => {
  test('plans deterministically, applies in dependency order, verifies, and cleans up idempotently', async () => {
    const root = temporary();
    const mock = server();
    configure(mock.url);
    const directory = await artifacts(root);
    const receiptPath = join(root, 'receipt.json');
    const planned = await deploy({ action: 'plan', artifactDirectory: directory, receiptPath, cwd: root });
    expect(statSync(receiptPath).mode & 0o777).toBe(0o600);
    expect(planned.outcomes.map((item) => item.kind)).toEqual(['ip_prefix_set', 'app_firewall', 'service_policy']);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    expect(JSON.stringify(receipt)).not.toContain('synthetic-secret');
    expect(JSON.stringify(receipt)).not.toContain('operator');
    await deploy({
      action: 'apply',
      receiptPath,
      planDigest: planned.planDigest,
      confirmation: `APPLY ${planned.planDigest}`,
      cwd: root,
    });
    expect(mock.calls.filter((call) => call.startsWith('POST')).map((call) => call.split('/').at(-1))).toEqual([
      'ip_prefix_sets',
      'app_firewalls',
      'service_policys',
    ]);
    await deploy({ action: 'verify', receiptPath, cwd: root });
    await deploy({ action: 'cleanup', receiptPath, confirmation: `CLEANUP ${planned.planDigest}`, cwd: root });
    expect(mock.resources.size).toBe(0);
    await deploy({ action: 'cleanup', receiptPath, confirmation: `CLEANUP ${planned.planDigest}`, cwd: root });
    expect(mock.resources.size).toBe(0);
  });

  test('rejects foreign ownership, namespace mismatch, receipt tampering, and missing confirmation', async () => {
    const root = temporary();
    const mock = server('foreign');
    configure(mock.url);
    const directory = await artifacts(root);
    const pack = JSON.parse(readFileSync(join(directory, 'config-pack.json'), 'utf8'));
    const first = pack.resources[0];
    const collection =
      first.kind === 'app_firewall'
        ? 'app_firewalls'
        : first.kind === 'ip_prefix_set'
          ? 'ip_prefix_sets'
          : 'service_policys';
    mock.resources.set(`/api/config/namespaces/lab/${collection}/${first.metadata.name}`, {
      ...first,
      system_metadata: { creator_id: 'foreign' },
    });
    await expect(
      deploy({ action: 'plan', artifactDirectory: directory, receiptPath: join(root, 'foreign.json'), cwd: root }),
    ).rejects.toThrow('not creator-owned');
    configure(mock.url, 'other');
    await expect(
      deploy({ action: 'plan', artifactDirectory: directory, receiptPath: join(root, 'namespace.json'), cwd: root }),
    ).rejects.toThrow('namespace');
    configure(mock.url);
    mock.resources.clear();
    const receiptPath = join(root, 'receipt.json');
    const planned = await deploy({ action: 'plan', artifactDirectory: directory, receiptPath, cwd: root });
    await expect(deploy({ action: 'apply', receiptPath, planDigest: planned.planDigest, cwd: root })).rejects.toThrow(
      'confirmation',
    );
    chmodSync(receiptPath, 0o600);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    receipt.namespace = 'changed';
    await Bun.write(receiptPath, JSON.stringify(receipt));
    await expect(deploy({ action: 'verify', receiptPath, cwd: root })).rejects.toThrow('digest');
  });

  test('produces stable digests and rejects receipts inside artifact directories', async () => {
    const root = temporary();
    const mock = server();
    configure(mock.url);
    const directory = await artifacts(root);
    const first = await deploy({
      action: 'plan',
      artifactDirectory: directory,
      receiptPath: join(root, 'one.json'),
      cwd: root,
    });
    const second = await deploy({
      action: 'plan',
      artifactDirectory: directory,
      receiptPath: join(root, 'two.json'),
      cwd: root,
    });
    expect(second.planDigest).toBe(first.planDigest);
    await expect(
      deploy({ action: 'plan', artifactDirectory: directory, receiptPath: join(directory, 'receipt.json'), cwd: root }),
    ).rejects.toThrow('outside');
  });

  test('updates creator-owned resources and cleanup restores sanitized snapshots', async () => {
    const root = temporary();
    const mock = server();
    configure(mock.url);
    const directory = await artifacts(root);
    const pack = JSON.parse(readFileSync(join(directory, 'config-pack.json'), 'utf8'));
    const desired = pack.resources.find((item: any) => item.kind === 'app_firewall');
    const key = `/api/config/namespaces/lab/app_firewalls/${desired.metadata.name}`;
    const before = {
      ...desired,
      spec: { monitoring: {} },
      system_metadata: { creator_id: 'operator' },
      server_default: 'discard',
    };
    mock.resources.set(key, before);
    const receiptPath = join(root, 'receipt.json');
    const planned = await deploy({ action: 'plan', artifactDirectory: directory, receiptPath, cwd: root });
    expect(planned.outcomes.find((item) => item.kind === 'app_firewall')?.operation).toBe('update');
    await deploy({
      action: 'apply',
      receiptPath,
      planDigest: planned.planDigest,
      confirmation: `APPLY ${planned.planDigest}`,
      cwd: root,
    });
    await deploy({ action: 'cleanup', receiptPath, confirmation: `CLEANUP ${planned.planDigest}`, cwd: root });
    expect(mock.resources.get(key)?.spec as Record<string, unknown>).toEqual({ monitoring: {} });
    expect(mock.resources.get(key)).not.toHaveProperty('server_default', 'discard');
    const repeated = await deploy({
      action: 'cleanup',
      receiptPath,
      confirmation: `CLEANUP ${planned.planDigest}`,
      cwd: root,
    });
    expect(repeated.outcomes.find((item) => item.kind === 'app_firewall')?.status).toBe('already_restored');
  });

  test('detects stale plans, verification drift, and cleanup drift', async () => {
    const root = temporary();
    const mock = server();
    configure(mock.url);
    const directory = await artifacts(root);
    const receiptPath = join(root, 'receipt.json');
    const planned = await deploy({ action: 'plan', artifactDirectory: directory, receiptPath, cwd: root });
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    const first = receipt.resources[0];
    const key = `/api/config/namespaces/lab/${first.collection}/${first.name}`;
    mock.resources.set(key, { ...first.desired, spec: { changed: true }, system_metadata: { creator_id: 'operator' } });
    await expect(
      deploy({
        action: 'apply',
        receiptPath,
        planDigest: planned.planDigest,
        confirmation: `APPLY ${planned.planDigest}`,
        cwd: root,
      }),
    ).rejects.toThrow('live state changed');
    mock.resources.clear();
    const freshPath = join(root, 'fresh.json');
    const fresh = await deploy({ action: 'plan', artifactDirectory: directory, receiptPath: freshPath, cwd: root });
    await deploy({
      action: 'apply',
      receiptPath: freshPath,
      planDigest: fresh.planDigest,
      confirmation: `APPLY ${fresh.planDigest}`,
      cwd: root,
    });
    const freshReceipt = JSON.parse(readFileSync(freshPath, 'utf8'));
    const deployed = freshReceipt.resources[0];
    const deployedKey = `/api/config/namespaces/lab/${deployed.collection}/${deployed.name}`;
    mock.resources.set(deployedKey, {
      ...deployed.desired,
      spec: { drift: true },
      system_metadata: { creator_id: 'operator' },
    });
    await expect(deploy({ action: 'verify', receiptPath: freshPath, cwd: root })).rejects.toThrow('differ');
    await expect(
      deploy({ action: 'cleanup', receiptPath: freshPath, confirmation: `CLEANUP ${fresh.planDigest}`, cwd: root }),
    ).rejects.toThrow('cleanup drift');
  });

  test('fails closed for warnings, contract tampering, missing credentials, and bad digest', async () => {
    const root = temporary();
    const mock = server();
    configure(mock.url);
    const directory = await artifacts(root);
    await Bun.write(join(directory, 'warnings.json'), JSON.stringify([{ code: 'partial', message: 'unsafe' }]));
    await expect(
      deploy({ action: 'plan', artifactDirectory: directory, receiptPath: join(root, 'warnings.json'), cwd: root }),
    ).rejects.toThrow('empty warnings');
    await Bun.write(join(directory, 'warnings.json'), '[]\n');
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    manifest.contract.commit = 'tampered';
    await Bun.write(join(directory, 'manifest.json'), JSON.stringify(manifest));
    await expect(
      deploy({ action: 'plan', artifactDirectory: directory, receiptPath: join(root, 'contract.json'), cwd: root }),
    ).rejects.toThrow('pinned contract');
    await artifacts(root, 'lab').catch(() => undefined);
    delete process.env.XCSH_API_TOKEN;
    await expect(deploy({ action: 'verify', receiptPath: join(root, 'absent.json'), cwd: root })).rejects.toThrow(
      'required',
    );
  });
});

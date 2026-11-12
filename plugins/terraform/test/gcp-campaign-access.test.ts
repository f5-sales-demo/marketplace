import { afterEach, expect, test } from 'bun:test';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import {
  bindOriginalGcpCampaignAccess,
  prepareOriginalGcpCampaignAccess,
  readOriginalGcpCampaignAccess,
} from '../src/gcp-campaign-access';
import { monitorOriginalInputs } from '../src/original-input-monitor';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const owner = {
  deploymentId: 'example-campaign',
  provider: 'gcp' as const,
  engine: 'terraform' as const,
  account: 'example-project',
  region: 'northamerica-northeast1',
};
const request = { platformContext: 'example-context', sshSourceCidr: '192.0.2.4/32' };
const intentSha256 = 'a'.repeat(64);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gcp-campaign-access-'));
  roots.push(root);
  return CeDeploymentStore.open(root, owner);
}

test('creates distinct OpenSSH keys, returns only public data and preserves exact files across restart', async () => {
  const store = await fixture();
  const access = await prepareOriginalGcpCampaignAccess(store, request);
  expect(Object.keys(access).sort()).toEqual(['cePublicKey', 'observerPublicKey', 'schemaVersion']);
  expect(access.cePublicKey).not.toBe(access.observerPublicKey);
  const original = await readOriginalGcpCampaignAccess(store, request);
  expect(original.publicAccess).toEqual(access);
  for (const [name, publicKey] of [
    ['ce_key', access.cePublicKey],
    ['observer_key', access.observerPublicKey],
  ]) {
    const input = original.inputs[name];
    expect(Number((await lstat(input.path)).mode) & 0o777).toBe(0o400);
    const child = Bun.spawn(['/usr/bin/ssh-keygen', '-y', '-f', input.path], { stdout: 'pipe', stderr: 'pipe' });
    expect(await new Response(child.stdout).text()).toBe(`${publicKey}\n`);
    expect(await child.exited).toBe(0);
  }
  expect(await prepareOriginalGcpCampaignAccess(store, request)).toEqual(access);
  expect((await readOriginalGcpCampaignAccess(store, request)).inputs).toEqual(original.inputs);
  expect(JSON.stringify(access)).not.toContain(store.directory);
  expect(JSON.stringify(access)).not.toContain('PRIVATE KEY');
});

test('binds one exact intent and original manifest, never rebinds or mints replacement keys', async () => {
  const store = await fixture();
  const access = await prepareOriginalGcpCampaignAccess(store, request);
  const binding = { ...request, ...access, intentSha256 };
  await bindOriginalGcpCampaignAccess(store, binding);
  const original = await readOriginalGcpCampaignAccess(store, request, intentSha256);
  await bindOriginalGcpCampaignAccess(store, binding);
  expect((await readOriginalGcpCampaignAccess(store, request, intentSha256)).inputs).toEqual(original.inputs);
  await expect(bindOriginalGcpCampaignAccess(store, { ...binding, intentSha256: 'b'.repeat(64) })).rejects.toThrow();
  await expect(
    bindOriginalGcpCampaignAccess(store, { ...binding, cePublicKey: access.observerPublicKey }),
  ).rejects.toThrow();
  await expect(readOriginalGcpCampaignAccess(store, request, 'b'.repeat(64))).rejects.toThrow();
});

test('refuses foreign owner, context, CIDR, engines and caller-injected fields before key creation', async () => {
  const store = await fixture();
  for (const invalid of [
    { ...request, sshSourceCidr: '0.0.0.0/0' },
    { ...request, sshSourceCidr: '192.000.2.4/32' },
    { ...request, platformContext: '../context' },
    { ...request, privateKey: 'injected' },
    { ...request, platformContext: undefined },
  ])
    await expect(prepareOriginalGcpCampaignAccess(store, invalid as never)).rejects.toThrow();
  const foreign = {
    ...store,
    directory: store.directory,
    owner: { ...owner, engine: 'native' as const },
    verify: () => store.verify(),
  };
  await expect(prepareOriginalGcpCampaignAccess(foreign, request)).rejects.toThrow();
  await prepareOriginalGcpCampaignAccess(store, request);
  await expect(
    readOriginalGcpCampaignAccess(store, { ...request, platformContext: 'other-context' }),
  ).rejects.toThrow();
  await expect(readOriginalGcpCampaignAccess(store, { ...request, sshSourceCidr: '192.0.2.5/32' })).rejects.toThrow();
});

test('semantically identical owner fields preserve original keys across normal adapter order', async () => {
  const store = await fixture();
  const access = await prepareOriginalGcpCampaignAccess(store, request);
  const reordered = {
    directory: store.directory,
    owner: {
      region: owner.region,
      engine: owner.engine,
      deploymentId: owner.deploymentId,
      provider: owner.provider,
      account: owner.account,
    },
    verify: () => store.verify(),
  };
  expect((await readOriginalGcpCampaignAccess(reordered, request)).publicAccess).toEqual(access);
  await bindOriginalGcpCampaignAccess(reordered, { ...request, ...access, intentSha256 });
});

test('partial provisioning and existing deployment refuse unchanged recreation', async () => {
  const store = await fixture();
  await mkdir(join(store.directory, 'gcp-campaign-access'), { mode: 0o700 });
  await expect(prepareOriginalGcpCampaignAccess(store, request)).rejects.toThrow();
  await expect(prepareOriginalGcpCampaignAccess(store, request)).rejects.toThrow();
  const other = await fixture();
  await other.write('gcp-terraform-input-identity.json', {});
  await expect(prepareOriginalGcpCampaignAccess(other, request)).rejects.toThrow();
});

test('concurrent provisioning has one original key set and no overwrite', async () => {
  const store = await fixture();
  const results = await Promise.allSettled([
    prepareOriginalGcpCampaignAccess(store, request),
    prepareOriginalGcpCampaignAccess(store, request),
  ]);
  const successes = results.filter((result) => result.status === 'fulfilled');
  expect(successes.length).toBeGreaterThan(0);
  const original = await readOriginalGcpCampaignAccess(store, request);
  for (const result of successes)
    if (result.status === 'fulfilled') expect(result.value).toEqual(original.publicAccess);
});

test('rejects replaced, modified, wide-permission, hard-linked and symlinked original keys', async () => {
  for (const operation of ['replace', 'modify', 'mode', 'hardlink', 'symlink']) {
    const store = await fixture();
    await prepareOriginalGcpCampaignAccess(store, request);
    const original = await readOriginalGcpCampaignAccess(store, request);
    const path = original.inputs.ce_key.path;
    const bytes = await readFile(path);
    if (operation === 'replace') {
      await rename(path, `${path}.old`);
      await writeFile(path, bytes, { mode: 0o400 });
    }
    if (operation === 'modify') {
      await chmod(path, 0o600);
      await writeFile(path, `${bytes.toString()}x`);
      await chmod(path, 0o400);
    }
    if (operation === 'mode') await chmod(path, 0o644);
    if (operation === 'hardlink') await link(path, `${path}.link`);
    if (operation === 'symlink') {
      await rename(path, `${path}.old`);
      await symlink(`${path}.old`, path);
    }
    await expect(readOriginalGcpCampaignAccess(store, request)).rejects.toThrow();
    await expect(prepareOriginalGcpCampaignAccess(store, request)).rejects.toThrow();
  }
});

test('original lifetime monitor remains refused after key contents are restored', async () => {
  const store = await fixture();
  await prepareOriginalGcpCampaignAccess(store, request);
  const original = await readOriginalGcpCampaignAccess(store, request);
  const monitor = await monitorOriginalInputs(original.inputs);
  try {
    const path = original.inputs.ce_key.path,
      bytes = await readFile(path);
    await chmod(path, 0o600);
    await writeFile(path, bytes);
    await chmod(path, 0o400);
    await expect(monitor.assertOriginal()).rejects.toThrow();
    await expect(monitor.assertOriginal()).rejects.toThrow();
  } finally {
    monitor.close();
  }
});

test('bound manifest replacement is refused while cleanup storage remains available without keys', async () => {
  const store = await fixture();
  const access = await prepareOriginalGcpCampaignAccess(store, request);
  await bindOriginalGcpCampaignAccess(store, { ...request, ...access, intentSha256 });
  const original = await readOriginalGcpCampaignAccess(store, request, intentSha256);
  const manifest = original.inputs.campaign_manifest.path;
  const bytes = await readFile(manifest);
  await rename(manifest, `${manifest}.old`);
  await writeFile(manifest, bytes, { mode: 0o400 });
  await expect(readOriginalGcpCampaignAccess(store, request, intentSha256)).rejects.toThrow();
  await expect(prepareOriginalGcpCampaignAccess(store, request)).rejects.toThrow();
  await rm(join(store.directory, 'gcp-campaign-access'), { recursive: true });
  await store.write('cleanup-evidence.json', { guestAccessRequired: false });
  expect(await store.read('cleanup-evidence.json')).toEqual({ guestAccessRequired: false });
  await expect(bindOriginalGcpCampaignAccess(store, { ...request, ...access, intentSha256 })).rejects.toThrow();
});

test('deleted intent binding cannot reset single-use campaign authorization', async () => {
  const store = await fixture();
  const access = await prepareOriginalGcpCampaignAccess(store, request);
  await bindOriginalGcpCampaignAccess(store, { ...request, ...access, intentSha256 });
  const original = await readOriginalGcpCampaignAccess(store, request, intentSha256);
  await rm(original.inputs.campaign_intent.path);
  await expect(
    bindOriginalGcpCampaignAccess(store, { ...request, ...access, intentSha256: 'b'.repeat(64) }),
  ).rejects.toThrow();
  await expect(prepareOriginalGcpCampaignAccess(store, request)).rejects.toThrow();
});

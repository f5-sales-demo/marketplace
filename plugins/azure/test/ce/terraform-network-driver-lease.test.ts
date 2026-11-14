import { afterEach, expect, test } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type AzureTerraformNetworkDriverLease,
  acquireAzureTerraformNetworkDriverLease,
  assertAzureTerraformNetworkDriverLease,
  verifyAzureTerraformNetworkDriverLease,
} from '../../src/ce/terraform-network-driver-lease';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ce1856-driver-lease-'));
  roots.push(directory);
  const owner = await acquireAzureTerraformNetworkDriverLease(directory),
    claim = join(directory, '.terraform-network-driver-lock', 'claim.json'),
    bytes = await readFile(claim);
  return { ...owner, directory, claim, bytes };
}
test('actual process lock issues immutable exact active ownership without rewriting its claim', async () => {
  const f = await fixture();
  try {
    expect(Object.isFrozen(f.lease)).toBe(true);
    assertAzureTerraformNetworkDriverLease(f.lease, f.directory);
    await verifyAzureTerraformNetworkDriverLease(f.lease, f.directory);
    expect((await readFile(f.claim)).equals(f.bytes)).toBe(true);
    await expect(acquireAzureTerraformNetworkDriverLease(f.directory)).rejects.toThrow('held by a live process');
  } finally {
    await f.release();
  }
  await expect(readFile(f.claim)).rejects.toThrow();
  expect(() => assertAzureTerraformNetworkDriverLease(f.lease, f.directory)).toThrow('active exact owning lease');
}, 60000);
test('a forged object or copied lease cannot substitute active ownership', async () => {
  const f = await fixture();
  try {
    for (const lease of [
      {},
      { directory: f.directory },
      structuredClone(f.lease),
    ] as AzureTerraformNetworkDriverLease[]) {
      expect(() => assertAzureTerraformNetworkDriverLease(lease, f.directory)).toThrow('active exact owning lease');
      await expect(verifyAzureTerraformNetworkDriverLease(lease, f.directory)).rejects.toThrow(
        'active exact owning lease',
      );
    }
  } finally {
    await f.release();
  }
}, 60000);
test('a valid active lease cannot authorize another deployment directory', async () => {
  const first = await fixture(),
    second = await fixture();
  try {
    await expect(verifyAzureTerraformNetworkDriverLease(first.lease, second.directory)).rejects.toThrow(
      'active exact owning lease',
    );
    await verifyAzureTerraformNetworkDriverLease(second.lease, second.directory);
  } finally {
    await second.release();
    await first.release();
  }
}, 60000);
for (const change of ['bytes', 'missing', 'symlink', 'permissions', 'directory-permissions'] as const)
  test(`actual driver ownership rejects ${change} claim changes without relinquishing the held lock`, async () => {
    const f = await fixture(),
      backup = `${f.claim}.original`;
    try {
      if (change === 'bytes') await writeFile(f.claim, Buffer.concat([f.bytes, Buffer.from(' ')]), { mode: 0o600 });
      else if (change === 'missing') await unlink(f.claim);
      else if (change === 'symlink') {
        await writeFile(backup, f.bytes, { mode: 0o600 });
        await unlink(f.claim);
        await symlink(backup, f.claim);
      } else if (change === 'permissions') await chmod(f.claim, 0o644);
      else await chmod(join(f.directory, '.terraform-network-driver-lock'), 0o755);
      await expect(verifyAzureTerraformNetworkDriverLease(f.lease, f.directory)).rejects.toThrow();
      assertAzureTerraformNetworkDriverLease(f.lease, f.directory);
    } finally {
      if (change === 'symlink') await unlink(f.claim);
      await writeFile(f.claim, f.bytes, { mode: 0o600 });
      await chmod(f.claim, 0o600);
      await chmod(join(f.directory, '.terraform-network-driver-lock'), 0o700);
      await f.release();
    }
  }, 60000);
test('released ownership cannot be revived by a fresh valid process claim', async () => {
  const f = await fixture();
  await f.release();
  const next = await acquireAzureTerraformNetworkDriverLease(f.directory);
  try {
    await expect(verifyAzureTerraformNetworkDriverLease(f.lease, f.directory)).rejects.toThrow(
      'active exact owning lease',
    );
    await verifyAzureTerraformNetworkDriverLease(next.lease, f.directory);
  } finally {
    await next.release();
  }
}, 60000);

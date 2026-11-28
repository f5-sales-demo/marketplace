import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGcpTerraformPreparationResume } from '../../gcloud/src/ce/terraform-preparation-resume';
import { readOwnedInstalledInput, resolveInstalledGoogleAdcPath } from '../src/installed-runtime';

async function preparation() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'gcp-preparation-boundary-')));
  for (const name of ['owner.json', 'gcp-terraform-input-identity.json', 'gcp-terraform-session-inputs.json'])
    await writeFile(join(directory, name), '{}', { mode: 0o600 });
  return { directory, verify: async () => {} };
}

test('absent runner recovery requires all original preparation records', async () => {
  const store = await preparation();
  try {
    await rm(join(store.directory, 'gcp-terraform-session-inputs.json'));
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', 'current')).rejects.toThrow('reconcile');
  } finally {
    await rm(store.directory, { recursive: true });
  }
});

test('known preparation names cannot conceal symlinks or changed record contents', async () => {
  const store = await preparation();
  const foreign = await realpath(await mkdtemp(join(tmpdir(), 'gcp-preparation-foreign-')));
  try {
    await writeFile(join(foreign, 'inputs.json'), '{}', { mode: 0o600 });
    const path = join(store.directory, 'gcp-terraform-session-inputs.json');
    await rm(path);
    await symlink(join(foreign, 'inputs.json'), path);
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', true)).rejects.toThrow('reconcile');
    await rm(path);
    await writeFile(path, '{}', { mode: 0o600 });
    let checks = 0;
    store.verify = async () => {
      if (++checks === 2) await writeFile(path, '{"changed":true}');
    };
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', true)).rejects.toThrow('changed');
    expect(await readFile(path, 'utf8')).toBe('{"changed":true}');
  } finally {
    await rm(store.directory, { recursive: true });
    await rm(foreign, { recursive: true });
  }
});

test('new authorization, invalid runner types and ownership failures refuse recreation', async () => {
  const store = await preparation();
  try {
    let checks = 0;
    store.verify = async () => {
      if (++checks === 2) await writeFile(join(store.directory, 'authorization.json'), '{}', { mode: 0o600 });
    };
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', true)).rejects.toThrow('changed');
    store.verify = async () => {};
    await writeFile(join(store.directory, 'scope-a'), 'existing-runner');
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', true)).rejects.toThrow('differs');
    await rm(join(store.directory, 'scope-a'));
    await symlink(store.directory, join(store.directory, 'scope-a'));
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', true)).rejects.toThrow('differs');
    store.verify = async () => {
      throw new Error('foreign original owner');
    };
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', true)).rejects.toThrow('foreign');
    await expect(
      resolveGcpTerraformPreparationResume({ ...store, verify: async () => {} }, '../scope-a', true),
    ).rejects.toThrow('identity');
  } finally {
    await rm(store.directory, { recursive: true });
  }
});

test('configured ADC aliases preserve bytes while explicit aliases and unsafe sources remain refused', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-adc-boundary-')));
  try {
    const canonical = join(root, 'canonical');
    await mkdir(canonical, { mode: 0o700 });
    const source = join(canonical, 'application_default_credentials.json');
    await writeFile(source, 'synthetic-owned-source', { mode: 0o600 });
    const alias = join(root, 'configured-home');
    await symlink(canonical, alias);
    const selected = await resolveInstalledGoogleAdcPath({ CLOUDSDK_CONFIG: alias });
    expect(selected).toBe(source);
    expect((await readOwnedInstalledInput(selected)).bytes.toString()).toBe('synthetic-owned-source');
    const explicit = await resolveInstalledGoogleAdcPath({
      GOOGLE_APPLICATION_CREDENTIALS: join(alias, 'application_default_credentials.json'),
    });
    await expect(readOwnedInstalledInput(explicit)).rejects.toThrow('Canonical');
    await chmod(source, 0o666);
    await expect(readOwnedInstalledInput(selected)).rejects.toThrow('Owned');
    await expect(resolveInstalledGoogleAdcPath({ CLOUDSDK_CONFIG: join(root, 'missing') })).rejects.toThrow('ENOENT');
    expect(await readFile(source, 'utf8')).toBe('synthetic-owned-source');
  } finally {
    await rm(root, { recursive: true });
  }
});

import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGcpTerraformPreparationResume } from '../../gcloud/src/ce/terraform-preparation-resume';
import { resolveInstalledGoogleAdcPath } from '../src/installed-runtime';

test('normal home aliases resolve the existing ADC before original file binding without rewriting it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gcp-adc-home-'));
  try {
    const home = join(root, 'home');
    const config = join(root, 'canonical-config');
    await mkdir(home);
    await mkdir(config);
    await mkdir(join(config, 'gcloud'));
    const source = join(config, 'gcloud/application_default_credentials.json');
    await writeFile(source, 'synthetic-owned-credential-source', { mode: 0o600 });
    await symlink(config, join(home, '.config'));
    expect(await resolveInstalledGoogleAdcPath({}, home)).toBe(source);
    expect(await resolveInstalledGoogleAdcPath({ GOOGLE_APPLICATION_CREDENTIALS: source }, home)).toBe(source);
    expect(
      await resolveInstalledGoogleAdcPath(
        { GOOGLE_APPLICATION_CREDENTIALS: join(home, '.config/gcloud/application_default_credentials.json') },
        home,
      ),
    ).toBe(join(home, '.config/gcloud/application_default_credentials.json'));
  } finally {
    await rm(root, { recursive: true });
  }
});

test('matching uninitialized preparation can initialize once; execution or authorization cannot be recreated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gcp-partial-preparation-'));
  try {
    const store = { directory: root, verify: async () => {} };
    await writeFile(join(root, 'owner.json'), '{}');
    await writeFile(join(root, 'gcp-terraform-input-identity.json'), '{}');
    await writeFile(join(root, 'gcp-terraform-session-inputs.json'), '{}');
    await mkdir(join(root, 'gcp-campaign-access'));
    expect(await resolveGcpTerraformPreparationResume(store, 'scope-a', 'current')).toBe(false);
    await writeFile(join(root, 'gcp-tf-deploy-original-authorization.json'), '{}');
    await expect(resolveGcpTerraformPreparationResume(store, 'scope-a', 'current')).rejects.toThrow('reconcile');
    await mkdir(join(root, 'scope-a'));
    expect(await resolveGcpTerraformPreparationResume(store, 'scope-a', 'current')).toBe('current');
  } finally {
    await rm(root, { recursive: true });
  }
});

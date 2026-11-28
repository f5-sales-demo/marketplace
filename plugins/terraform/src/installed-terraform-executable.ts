import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { readOwnedInstalledInput } from './installed-runtime';
import type { InstalledGcpVersionProfile } from './installed-version-profile';
import type { OriginalInputBinding } from './original-input-monitor';

/** Compare already admitted source inputs; this does not issue execution authority. */
export function selectPinnedTerraformInput(
  expectedSha256: string,
  cached: OriginalInputBinding | undefined,
  ambient: OriginalInputBinding | undefined,
): OriginalInputBinding {
  if (cached) {
    if (cached.sha256 !== expectedSha256) throw new Error('Original cached Terraform executable differs');
    return cached;
  }
  if (!ambient || ambient.sha256 !== expectedSha256)
    throw new Error('Install the exact original Terraform executable version');
  return ambient;
}
export function installedTerraformVersionsDirectory(environment: Record<string, string | undefined> = process.env) {
  return environment.XCSH_TERRAFORM_EXECUTABLES_DIR ?? join(homedir(), '.local/share/xcsh/terraform/versions');
}
async function privateOwnedDirectory(path: string) {
  const value = await lstat(path);
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    value.uid !== process.getuid?.() ||
    (value.mode & 0o022) !== 0 ||
    (await realpath(path)) !== path
  )
    throw new Error('Original owned Terraform version cache directory required');
}
/** The installed resolver supplies its compiled profile; tool arguments cannot select a different binary digest. */
export async function resolveInstalledTerraformExecutable(
  profile: Pick<InstalledGcpVersionProfile, 'terraformVersion' | 'terraformSha256'>,
  environment: Record<string, string | undefined> = process.env,
) {
  if (!/^\d+\.\d+\.\d+$/.test(profile.terraformVersion) || !/^[a-f0-9]{64}$/.test(profile.terraformSha256))
    throw new Error('Original Terraform executable profile required');
  const root = installedTerraformVersionsDirectory(environment);
  if (!isAbsolute(root) || resolve(root) !== root)
    throw new Error('Original canonical Terraform version cache required');
  const exists = async (path: string) => {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  };
  if (await exists(root)) await privateOwnedDirectory(root);
  let cached: OriginalInputBinding | undefined;
  const path = join(root, profile.terraformVersion, 'terraform');
  if (await exists(dirname(path))) await privateOwnedDirectory(dirname(path));
  if (await exists(path)) {
    await privateOwnedDirectory(root);
    await privateOwnedDirectory(dirname(path));
    const value = await readOwnedInstalledInput(path);
    if ((Number(value.binding.expectedIdentity?.mode) & 0o100) === 0)
      throw new Error('Original cached Terraform is not executable');
    cached = value.binding;
  }
  if (cached) return selectPinnedTerraformInput(profile.terraformSha256, cached, undefined);
  const command = Bun.which('terraform', { PATH: environment.PATH ?? process.env.PATH });
  const ambient = command ? (await readOwnedInstalledInput(await realpath(command))).binding : undefined;
  if (ambient && (Number(ambient.expectedIdentity?.mode) & 0o100) === 0)
    throw new Error('Original Terraform is not executable');
  return selectPinnedTerraformInput(profile.terraformSha256, undefined, ambient);
}

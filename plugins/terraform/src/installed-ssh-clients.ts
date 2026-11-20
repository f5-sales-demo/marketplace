import { homedir } from 'node:os';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { decodeEvidenceObject } from './evidence-json';
import pins from './gcp-ssh-client-pins.json';
import {
  closeOriginalGcpSshClientProfile,
  openGcpSshClientProfile,
  readOriginalGcpSshClientProfile,
} from './gcp-ssh-client-profile';
import { readOwnedInstalledInput } from './installed-runtime';
import type { OriginalInputBinding } from './original-input-monitor';

export class InstalledGcpSshClientSetupRequired extends Error {
  constructor() {
    super('Install and set up the Terraform plugin SSH clients before GCP guest capture');
  }
}
/** Admit only the shipped installer, artifact and original user installation.
 * Selecting a directory never changes the compiled executable or artifact pins. */
export async function openInstalledGcpSshClientProfile(environment: Record<string, string | undefined> = process.env) {
  const env = { ...environment };
  const root =
    env.XCSH_TERRAFORM_SSH_CLIENTS_DIR ?? join(homedir(), '.local/share/xcsh/terraform/ssh-clients', pins.version);
  const inputs: Record<string, OriginalInputBinding> = {};
  let profile: Awaited<ReturnType<typeof openGcpSshClientProfile>> | undefined;
  try {
    const installer = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/install_ssh_clients.py'));
    if (installer.binding.sha256 !== pins.installerSha256) throw new InstalledGcpSshClientSetupRequired();
    inputs['installation:installer'] = installer.binding;
    for (const [name, expected] of [
      ['archive.zip', pins.archiveSha256],
      ['LICENCE', pins.licenseSha256],
      ['BUILD.json', pins.buildSha256],
    ]) {
      const input = await readOwnedInstalledInput(join(root, name), 16 * 1024 * 1024);
      if (input.binding.sha256 !== expected) throw new InstalledGcpSshClientSetupRequired();
      inputs[`installation:${name}`] = input.binding;
    }
    const declaration = await readOwnedInstalledInput(join(root, 'installation.json'));
    const original = decodeEvidenceObject(declaration.bytes);
    if (
      original.schemaVersion !== 1 ||
      original.scope !== 'user' ||
      original.version !== pins.version ||
      original.platform !== pins.platform ||
      original.privilegedOperations !== false ||
      original.archiveSha256 !== pins.archiveSha256 ||
      original.licenseSha256 !== pins.licenseSha256 ||
      original.buildSha256 !== pins.buildSha256 ||
      fingerprint(original.files) !==
        fingerprint(
          Object.fromEntries(Object.entries(pins.files).map(([name, declaration]) => [name, declaration.sha256])),
        )
    )
      throw new InstalledGcpSshClientSetupRequired();
    inputs['installation:declaration'] = declaration.binding;
    profile = await openGcpSshClientProfile(root, { originalInputs: Object.freeze(inputs) });
    await readOriginalGcpSshClientProfile(profile);
    return profile;
  } catch (error) {
    if (profile) closeOriginalGcpSshClientProfile(profile);
    if (error instanceof InstalledGcpSshClientSetupRequired) throw error;
    throw new InstalledGcpSshClientSetupRequired();
  }
}
export async function assertInstalledGcpSshClientSetup(environment: Record<string, string | undefined> = process.env) {
  const profile = await openInstalledGcpSshClientProfile(environment);
  try {
    await readOriginalGcpSshClientProfile(profile);
  } finally {
    closeOriginalGcpSshClientProfile(profile);
  }
}

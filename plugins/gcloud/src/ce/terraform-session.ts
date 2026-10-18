import type { CePlatformService } from '../../../platform/src/ce/service';
import type { Deployment } from '../../../terraform/src/runner';
import { createCeTerraformService, type TerraformSession } from '../../../terraform/src/service';
import { translateGcpTerraformSiteCompute } from './compute-plan';
import { fingerprint } from './discovery';
import type { GcpCeIntent } from './types';

export interface GcpTerraformInputs {
  intent: GcpCeIntent;
  versions: { terraform: string; google: string; xcsh: string };
  providerLock: string;
  expectedLockSha256: string;
}
/** Cloud adapter binds generated configuration to shared private storage and saved-plan execution. */
export async function openGcpTerraformSession(
  platform: CePlatformService,
  inputs: GcpTerraformInputs,
  resume = false,
): Promise<TerraformSession> {
  if (inputs.intent.engine !== 'terraform') throw new Error('Terraform adapter cannot mutate a native deployment');
  if (!/^sha256:[a-f0-9]{64}$/.test(inputs.expectedLockSha256)) throw new Error('Exact provider lock digest required');
  // Hash raw lock bytes; structural JSON canonicalization is for plans, not artifacts.
  const { createHash } = await import('node:crypto');
  const digest = `sha256:${createHash('sha256').update(inputs.providerLock).digest('hex')}`;
  if (digest !== inputs.expectedLockSha256) throw new Error('GCP Terraform provider lock bytes changed');
  for (const [provider, version] of [
    ['hashicorp/google', inputs.versions.google],
    ['f5-sales-demo/xcsh', inputs.versions.xcsh],
  ]) {
    const blocks = inputs.providerLock
      .split('provider "')
      .filter((block) => block.startsWith(`registry.terraform.io/${provider}"`));
    if (
      blocks.length !== 1 ||
      !blocks[0].includes(`version     = "${version}"`) ||
      !/"(?:h1:[A-Za-z0-9+/=]+|zh:[a-f0-9]{64})"/.test(blocks[0])
    )
      throw new Error('Pinned provider version/checksums missing from lock');
  }
  const translated = translateGcpTerraformSiteCompute(inputs.intent, inputs.versions);
  const owner = {
    deploymentId: inputs.intent.deploymentName,
    engine: 'terraform' as const,
    provider: 'gcp' as const,
    account: inputs.intent.project,
    region: inputs.intent.region,
  };
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    scope: { cloud: 'gcp', account: owner.account, region: owner.region },
    terraformVersion: inputs.versions.terraform,
    configuration: JSON.stringify(translated.configuration),
    providerLock: inputs.providerLock,
    backendIdentity: `local:${owner.deploymentId}`,
  };
  // Opening shared storage is an additional cross-engine boundary before prepare.
  const store = await platform.storage(owner);
  const identity = {
    schemaVersion: 1,
    engine: 'terraform',
    configurationFingerprint: fingerprint(translated.configuration),
    providerLockSha256: digest,
  };
  if (resume) {
    const saved = await store.read('gcp-terraform-input-identity.json');
    if (fingerprint(saved) !== fingerprint(identity)) throw new Error('GCP Terraform resume input identity differs');
  } else {
    let prior: unknown;
    try {
      prior = await store.read('gcp-terraform-input-identity.json');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (prior !== undefined) throw new Error('Existing GCP Terraform deployment must resume');
    await store.write('gcp-terraform-input-identity.json', identity);
  }
  return createCeTerraformService(async () => platform).open(owner, deployment, resume);
}

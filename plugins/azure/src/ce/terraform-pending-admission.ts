import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureTerraformFoundationDeployment } from './terraform-foundation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid Azure pending admission journal');
  return value as Record<string, unknown>;
};
/** Separate failed-admission contract: one issued bootstrap, no successful launch or registration. */
export async function azurePendingAdmissionJournal(
  base: AzureCePlan,
  storage: CeDeploymentStore,
  fingerprint: string,
  verifyManifest = false,
) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  await storage.verify();
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    base.topology.nodeCount !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(binding.owner)
  )
    throw Error('Azure pending admission owner or profile differs');
  const auth = object(await storage.read(`terraform-authorization-${base.planSha256}.json`));
  const workflow = object(await storage.read('terraform-workflow.json'));
  const bootstrap = object(workflow.bootstrapByNode);
  if (
    auth.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    workflow.stage !== 'network-pending' ||
    Object.keys(object(workflow.launchedAtByNode)).length ||
    Object.keys(bootstrap).length !== 1 ||
    typeof bootstrap['1'] !== 'string'
  )
    throw Error('Azure failed-admission journal differs or launch has completed');
  const deployment = await azureTerraformFoundationDeployment(base, { '1': bootstrap['1'] });
  if (workflow.configurationSha256 !== hash(deployment.configuration))
    throw Error('Azure pending admission configuration differs');
  const site = object(await storage.read('terraform-site.json'));
  const saved = object(await storage.read(`site-binding-${base.siteName}.json`));
  if (
    site.siteName !== base.siteName ||
    typeof site.uid !== 'string' ||
    !site.uid.trim() ||
    canonicalSha256(site.owner) !== canonicalSha256(binding.owner) ||
    site.contractFingerprint !== fingerprint ||
    saved.schemaVersion !== 1 ||
    saved.contractFingerprint !== fingerprint ||
    saved.siteUid !== site.uid ||
    canonicalSha256(saved.binding) !== canonicalSha256(binding) ||
    !Array.isArray(saved.expectedInterfaces) ||
    saved.expectedInterfaces.length
  )
    throw Error('Azure pending admission site provenance differs');
  const origin = new URL(String(saved.tenantOrigin));
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('Azure pending tenant origin differs');
  const tokenName = `${base.deploymentName.slice(0, 40)}-1-${base.planSha256.slice(0, 12)}`;
  const token = object(await storage.read(`${tokenName}.json`));
  if (
    token.tokenName !== tokenName ||
    token.siteName !== base.siteName ||
    token.node !== binding.nodes[0] ||
    typeof token.jwt !== 'string' ||
    !token.jwt
  )
    throw Error('Azure pending enrollment provenance differs');
  const admission = object(await storage.read('terraform-admission-plan-node-1.json'));
  if (
    admission.schemaVersion !== 1 ||
    admission.engine !== 'terraform' ||
    admission.deploymentId !== base.deploymentName ||
    admission.backendIdentity !== deployment.backendIdentity ||
    admission.configurationSha256 !== workflow.configurationSha256 ||
    admission.providerLockSha256 !== hash(deployment.providerLock) ||
    typeof admission.planSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(admission.planSha256)
  )
    throw Error('Azure pending admission saved plan differs');
  for (const entry of await readdir(storage.directory))
    if (/^(?:terraform-registration|terraform-routing|ingress-plan-|azure-ce-upgrade-|azure-ce-replace-)/.test(entry))
      throw Error('Azure post-admission lifecycle has started');
  if (verifyManifest) {
    const directory = join(storage.directory, base.deploymentName),
      file = join(directory, 'deployment.json');
    const d = await lstat(directory),
      f = await lstat(file);
    if (
      !d.isDirectory() ||
      d.isSymbolicLink() ||
      d.uid !== process.getuid?.() ||
      (await realpath(directory)) !== directory ||
      !f.isFile() ||
      f.isSymbolicLink() ||
      f.uid !== process.getuid?.() ||
      f.nlink !== 1 ||
      f.mode & 0o077
    )
      throw Error('Azure pending executor ownership differs');
    const { configuration, providerLock, ...identity } = deployment;
    const expected = { ...identity, configurationSha256: hash(configuration), providerLockSha256: hash(providerLock) };
    if (canonicalSha256(JSON.parse(await readFile(file, 'utf8'))) !== canonicalSha256(expected))
      throw Error('Azure pending frozen executor differs');
  }
  return {
    sha256: canonicalSha256({ auth, workflow, site, saved, token, admission }),
    siteUid: site.uid,
    tokenName,
    node: binding.nodes[0],
  };
}
export async function observeAzurePendingAdmission(
  base: AzureCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  const journal = await azurePendingAdmissionJournal(base, storage, runtime.contract.fingerprint);
  const value = await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal);
  const at = Date.parse(value.observedAt);
  if (
    value.status !== 'observed' ||
    canonicalSha256(value.owner) !== canonicalSha256(storage.owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60_000 ||
    value.sites.length !== 1 ||
    value.resources.length > 1 ||
    (value.sites[0].siteUid !== null &&
      (typeof value.sites[0].siteUid !== 'string' || !value.sites[0].siteUid.trim())) ||
    (value.sites[0].physicalSiteUid !== null &&
      (typeof value.sites[0].physicalSiteUid !== 'string' || !value.sites[0].physicalSiteUid.trim())) ||
    (value.sites[0].siteUid !== null && value.sites[0].siteUid === value.sites[0].physicalSiteUid) ||
    value.resources.some((row) => row.uid === value.sites[0].siteUid || row.uid === value.sites[0].physicalSiteUid) ||
    value.sites[0].siteName !== base.siteName ||
    value.resources.some(
      (row) =>
        row.kind !== 'tokens' ||
        row.namespace !== 'system' ||
        typeof row.uid !== 'string' ||
        !row.uid.trim() ||
        row.name !== journal.tokenName ||
        row.node !== journal.node ||
        row.siteName !== base.siteName,
    )
  )
    throw Error('Azure pending admission inventory is incomplete');
  return { value, journal };
}

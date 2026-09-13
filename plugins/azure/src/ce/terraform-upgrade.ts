import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { initialSoftwareSettings } from '../../../platform/src/ce/initial-versions';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from '../../../platform/src/ce/upgrade-transition';
import type { SiteUpgradeIntent } from '../../../platform/src/ce/wire-upgrade';
import { runTerraformCeUpgrade, type TerraformCeUpgradePlan } from '../../../terraform/src/ce-upgrade';
import { loadXcshProviderLock, XCSH_PROVIDER_VERSION } from '../../../terraform/src/provider-lock';
import type { Deployment, TerraformActionIntent } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { AZURE_CE_TERRAFORM_VERSION } from './terraform-foundation';
import type { AzureCePlan } from './types';

export interface AzureTerraformUpgrade extends TerraformCeUpgradePlan {
  schemaVersion: 2;
  engine: 'terraform';
  kind: 'azure-ce-terraform-upgrade';
  expectation: CeUpgradeExpectation;
  deployment: Deployment;
  action: TerraformActionIntent;
}

export function azureUpgradeBinding(plan: AzureCePlan): SiteBinding {
  verifyAzureCePlan(plan);
  return {
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    },
    siteName: plan.siteName,
    nodes: Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`),
  };
}

async function build(
  base: AzureCePlan,
  expectation: CeUpgradeExpectation,
  contract: VerifiedUpgradeContract,
): Promise<AzureTerraformUpgrade> {
  verifyAzureCePlan(base);
  initialSoftwareSettings(expectation.before);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(binding) !== canonicalSha256(expectation.binding) ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version ||
    expectation.contractFingerprint !== contract.fingerprint
  )
    throw new Error('Azure Terraform upgrade identities, scope or effective versions are incomplete');
  const { kind, version } = expectation.target;
  const request = contract.build({ siteName: base.siteName, kind, version });
  const values = { name: base.siteName, namespace: 'system', version, force: false };
  const suffix = kind === 'software' ? 'sw' : 'os';
  if (
    request.method !== 'POST' ||
    request.path !== `/api/config/namespaces/system/sites/${base.siteName}/upgrade_${suffix}` ||
    canonicalSha256(request.body) !== canonicalSha256(values)
  )
    throw new Error('Azure Terraform upgrade wire request differs from the verified action');
  const providerLock = await loadXcshProviderLock();
  const identity = { sourcePlanSha256: base.planSha256, expectation };
  const stage = `upgrade-${kind}-${canonicalSha256(identity).slice(0, 24)}`;
  const type = `xcsh_site_upgrade_${suffix}`;
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: base.subscription.id, region: base.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    providerLock,
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
      action: { [type]: { ce: { config: values } } },
    }),
  };
  const draft = {
    schemaVersion: 2 as const,
    engine: 'terraform' as const,
    kind: 'azure-ce-terraform-upgrade' as const,
    ...identity,
    deployment,
    action: {
      address: `action.${type}.ce`,
      type,
      providerName: 'registry.terraform.io/f5-sales-demo/xcsh',
      configValuesSha256: canonicalSha256(values),
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}

/** Collect effective versions from the platform; cloud health and traffic remain independent evidence. */
export async function prepareAzureTerraformUpgrade(
  base: AzureCePlan,
  target: Pick<SiteUpgradeIntent, 'kind' | 'version'>,
  runtime: Pick<CeRuntime, 'observeUpgrade'>,
  contract: VerifiedUpgradeContract,
  signal?: AbortSignal,
): Promise<AzureTerraformUpgrade> {
  verifyAzureCePlan(base);
  if (base.engine !== 'terraform') throw new Error('Azure CE upgrade requires a Terraform-owned plan');
  contract.build({ siteName: base.siteName, ...target });
  const binding = azureUpgradeBinding(base);
  const observation = await runtime.observeUpgrade(
    binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh Azure upgrade version evidence is unavailable');
  const expectation: CeUpgradeExpectation = {
    binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Azure site version readiness has not converged');
  return build(base, expectation, contract);
}

export async function verifyAzureTerraformUpgrade(
  base: AzureCePlan,
  upgrade: AzureTerraformUpgrade,
  contract: VerifiedUpgradeContract,
): Promise<void> {
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Azure Terraform upgrade schema is obsolete; prepare a new v2 plan');
  const expected = await build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected))
    throw new Error('Saved Azure Terraform upgrade plan changed');
}

export async function runAzureTerraformUpgrade(
  base: AzureCePlan,
  upgrade: AzureTerraformUpgrade,
  authorizedPlanSha256: string,
  runtime: Pick<CeRuntime, 'engine' | 'observeUpgrade'>,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  storage: CeDeploymentStore,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  return runTerraformCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    (candidate) => verifyAzureTerraformUpgrade(base, candidate as AzureTerraformUpgrade, contract),
    runtime,
    contract,
    terraform,
    storage,
    env,
    signal,
  );
}

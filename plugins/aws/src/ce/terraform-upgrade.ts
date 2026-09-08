import { readFile } from 'node:fs/promises';
import { initialSoftwareSettings } from '../../../platform/src/ce/initial-versions';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from '../../../platform/src/ce/upgrade-transition';
import type { SiteUpgradeIntent } from '../../../platform/src/ce/wire-upgrade';
import type { Deployment, TerraformActionIntent } from '../../../terraform/src/runner';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256, sha256Hex } from './canonical';
import { AWS_CE_TERRAFORM_VERSION } from './terraform-foundation';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

const providerVersion = '8.0.0';
const providerLockSha256 = 'a9ccc898377e32d9e7193a1fbc1c2bcedda88eaabf80633ae5f86a1456ad76d1';
export interface AwsTerraformUpgrade {
  schemaVersion: 1;
  kind: 'aws-ce-terraform-upgrade';
  sourcePlanSha256: string;
  expectation: CeUpgradeExpectation;
  deployment: Deployment;
  action: TerraformActionIntent;
  planId: string;
  planSha256: string;
}
async function build(
  base: AwsCePlan,
  expectation: CeUpgradeExpectation,
  contract: VerifiedUpgradeContract,
): Promise<AwsTerraformUpgrade> {
  verifyAwsCePlan(base);
  initialSoftwareSettings(expectation.before);
  if (
    base.deploymentName !== base.intent.deploymentName ||
    base.accountId !== base.intent.accountId ||
    base.region !== base.intent.region ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version
  )
    throw new Error('Terraform upgrade identities, scope or effective versions are incomplete');
  const selected = siteBindings(base).find(({ site }) => site.name === expectation.binding.siteName);
  if (
    base.engine !== 'terraform' ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(expectation.binding) ||
    expectation.contractFingerprint !== contract.fingerprint
  )
    throw new Error('Terraform upgrade scope, owning engine or contract differs');
  const { kind, version } = expectation.target;
  const request = contract.build({ siteName: selected.site.name, kind, version });
  const values = { name: selected.site.name, namespace: 'system', version, force: false };
  const suffix = kind === 'software' ? 'sw' : 'os';
  if (
    request.method !== 'POST' ||
    request.path !== `/api/config/namespaces/system/sites/${selected.site.name}/upgrade_${suffix}` ||
    canonicalSha256(request.body) !== canonicalSha256(values)
  )
    throw new Error('Terraform upgrade wire request differs from the verified action');
  const providerLock = await readFile(new URL('../../terraform/xcsh-provider-lock.hcl', import.meta.url), 'utf8');
  if (sha256Hex(providerLock) !== providerLockSha256) throw new Error('Published XC provider lock changed');
  const identity = { sourcePlanSha256: base.planSha256, expectation };
  const stage = `upgrade-${kind}-${canonicalSha256(identity).slice(0, 24)}`;
  const type = `xcsh_site_upgrade_${suffix}`;
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'aws', account: base.accountId, region: base.region },
    terraformVersion: AWS_CE_TERRAFORM_VERSION,
    providerLock,
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AWS_CE_TERRAFORM_VERSION}`,
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${providerVersion}` } },
      },
      provider: { xcsh: {} },
      action: { [type]: { ce: { config: values } } },
    }),
  };
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-terraform-upgrade' as const,
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
  return { ...draft, planId: `aws-ce-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}

/** Collect version readiness internally. Registration, routing, traffic and serial admission are separate gates. */
export async function prepareAwsTerraformUpgrade(
  base: AwsCePlan,
  siteName: string,
  target: Pick<SiteUpgradeIntent, 'kind' | 'version'>,
  runtime: Pick<CeRuntime, 'observeUpgrade'>,
  contract: VerifiedUpgradeContract,
  signal?: AbortSignal,
): Promise<AwsTerraformUpgrade> {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (base.engine !== 'terraform' || !selected) throw new Error('Select a site owned by this Terraform deployment');
  contract.build({ siteName, ...target });
  const observation = await runtime.observeUpgrade(
    selected.binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh upgrade version evidence is unavailable');
  const expectation: CeUpgradeExpectation = {
    binding: selected.binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Site version readiness has not converged');
  return build(base, expectation, contract);
}

/** Reconstruct the exact action and workspace before opening or resuming its saved plan. */
export async function verifyAwsTerraformUpgrade(
  base: AwsCePlan,
  upgrade: AwsTerraformUpgrade,
  contract: VerifiedUpgradeContract,
): Promise<void> {
  const expected = await build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected)) throw new Error('Saved Terraform upgrade plan changed');
}

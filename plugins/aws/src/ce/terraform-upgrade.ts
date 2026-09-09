import { readFile } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { initialSoftwareSettings } from '../../../platform/src/ce/initial-versions';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from '../../../platform/src/ce/upgrade-transition';
import type { SiteUpgradeIntent } from '../../../platform/src/ce/wire-upgrade';
import type { Deployment, PlanReceipt, TerraformActionIntent } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256, safeHexEqual, sha256Hex } from './canonical';
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

interface UpgradeCheckpoint {
  schemaVersion: 1;
  engine: 'terraform';
  sourcePlanSha256: string;
  upgradePlanSha256: string;
  phase: 'ready' | 'submitted' | 'complete';
  actionPlanSha256?: string;
}

interface SerialUpgradeLedger {
  schemaVersion: 1;
  engine: 'terraform';
  status: 'active' | 'idle';
  activePlanId?: string;
  activePlanSha256?: string;
  lastPlanId?: string;
  lastPlanSha256?: string;
}

async function optional<T>(storage: CeDeploymentStore, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}

function validateActionReceipt(upgrade: AwsTerraformUpgrade, receipt: PlanReceipt): void {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== upgrade.deployment.deploymentId ||
    receipt.backendIdentity !== upgrade.deployment.backendIdentity ||
    receipt.configurationSha256 !== sha256Hex(upgrade.deployment.configuration) ||
    receipt.providerLockSha256 !== sha256Hex(upgrade.deployment.providerLock) ||
    receipt.operation ||
    receipt.noChanges ||
    receipt.changes.length ||
    receipt.actionInvocations?.length !== 1 ||
    canonicalSha256(receipt.actionInvocations[0]) !== canonicalSha256(upgrade.action) ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256)
  )
    throw new Error('Terraform upgrade saved action plan differs');
}

/** Execute one authorized site upgrade. The deployment ledger admits only one active site at a time. */
export async function runAwsTerraformUpgrade(
  base: AwsCePlan,
  input: AwsTerraformUpgrade,
  authorizedPlanSha256: string,
  runtime: Pick<CeRuntime, 'engine' | 'observeUpgrade'>,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  storage: CeDeploymentStore,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const upgrade = structuredClone(input);
  await verifyAwsTerraformUpgrade(base, upgrade, contract);
  if (!safeHexEqual(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact Terraform upgrade authorization is required');
  if (
    runtime.engine !== 'terraform' ||
    storage.owner.engine !== 'terraform' ||
    canonicalSha256(storage.owner) !== canonicalSha256(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning Terraform engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional<AwsTerraformUpgrade>(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (canonicalSha256(saved) !== canonicalSha256(upgrade))
      throw new Error('Saved Terraform upgrade source differs');

    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional<UpgradeCheckpoint>(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.phase === 'ready' && checkpoint.actionPlanSha256 !== undefined) ||
      (checkpoint.phase !== 'ready' && !/^[a-f0-9]{64}$/.test(checkpoint.actionPlanSha256 ?? ''))
    )
      throw new Error('Terraform upgrade checkpoint differs');

    let serial = await optional<SerialUpgradeLedger>(storage, 'aws-terraform-upgrade-serial.json');
    if (serial === undefined) {
      serial = { schemaVersion: 1, engine: 'terraform', status: 'idle' };
    }
    if (
      serial.schemaVersion !== 1 ||
      serial.engine !== 'terraform' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
      serial = {
        schemaVersion: 1,
        engine: 'terraform',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('aws-terraform-upgrade-serial.json', serial);
    }

    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed Terraform upgrade version evidence regressed');
      const action = (await storage.read(`${upgrade.planId}-action-plan.json`)) as PlanReceipt;
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Completed upgrade action plan differs');
      const receipt = (await storage.read(`${upgrade.planId}-receipt.json`)) as Record<string, unknown>;
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        canonicalSha256(receipt.target) !== canonicalSha256(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== checkpoint.actionPlanSha256 ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed Terraform upgrade receipt differs');
      return receipt;
    }
    if (transition === 'failed') throw new Error('Terraform upgrade failed');
    if (transition === 'unknown') throw new Error('Terraform upgrade evidence is unknown');
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 1,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('aws-terraform-upgrade-serial.json', serial);
      return { status: 'target-already-complete' as const, planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized Terraform action');
    if (checkpoint.phase === 'ready') {
      let session: TerraformSession;
      try {
        session = await terraform.open(storage.owner, upgrade.deployment, false);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        session = await terraform.open(storage.owner, upgrade.deployment, 'current');
      }
      const action = await session.planAction(upgrade.action, env, signal);
      validateActionReceipt(upgrade, action);
      await storage.write(`${upgrade.planId}-action-plan.json`, action);
      await storage.verify();
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
      if (transition !== 'ready') throw new Error('Terraform upgrade readiness changed before submission');
      checkpoint = { ...checkpoint, phase: 'submitted', actionPlanSha256: action.planSha256 };
      await storage.write(checkpointName, checkpoint);
      await session.apply(action, env, signal);
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    } else {
      const action = (await storage.read(`${upgrade.planId}-action-plan.json`)) as PlanReceipt;
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Submitted upgrade action plan differs');
    }
    if (transition !== 'versions-complete') {
      if (!['ready', 'converging'].includes(transition)) throw new Error('Terraform upgrade convergence is unknown');
      return { status: 'upgrade-converging' as const, planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    serial = {
      schemaVersion: 1,
      engine: 'terraform',
      status: 'idle',
      lastPlanId: upgrade.planId,
      lastPlanSha256: upgrade.planSha256,
    };
    await storage.write('aws-terraform-upgrade-serial.json', serial);
    const receipt = {
      status: 'upgrade-complete' as const,
      engine: 'terraform' as const,
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      actionPlanSha256: checkpoint.actionPlanSha256,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown' as const,
      routing: 'unknown' as const,
      traffic: 'unknown' as const,
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}

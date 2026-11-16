// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/terraform/src/ce-upgrade.ts
import { createHash, timingSafeEqual } from 'node:crypto';
import { acquireProcessLock, initialSoftwareSettings, verifyAwsCePlan } from './runtime-2srcqb9f.js';
import {
  AWS_CE_TERRAFORM_VERSION,
  loadXcshProviderLock,
  siteBindings,
  XCSH_PROVIDER_VERSION,
} from './runtime-ay1zjq29.js';
import { canonicalSha256 } from './runtime-wvre8ba5.js';
import { assessCeUpgradeTransition } from './runtime-y39p0vy5.js';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
var digest = (value) => createHash('sha256').update(value).digest('hex');
var hash = (value) => digest(canonical(value));
var sameHash = (left, right) =>
  /^[a-f0-9]{64}$/.test(left) &&
  /^[a-f0-9]{64}$/.test(right) &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
function validateActionReceipt(upgrade, receipt) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== upgrade.deployment.deploymentId ||
    receipt.backendIdentity !== upgrade.deployment.backendIdentity ||
    receipt.configurationSha256 !== digest(upgrade.deployment.configuration) ||
    receipt.providerLockSha256 !== digest(upgrade.deployment.providerLock) ||
    receipt.operation ||
    receipt.noChanges ||
    receipt.changes.length ||
    receipt.actionInvocations?.length !== 1 ||
    hash(receipt.actionInvocations[0]) !== hash(upgrade.action) ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256)
  )
    throw new Error('Terraform upgrade saved action plan differs');
}
async function runTerraformCeUpgrade(
  input,
  authorizedPlanSha256,
  verify,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Terraform upgrade schema is obsolete; prepare a new v2 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact Terraform upgrade authorization is required');
  if (
    runtime.engine !== 'terraform' ||
    storage.owner.engine !== 'terraform' ||
    hash(storage.owner) !== hash(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning Terraform engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved Terraform upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 2 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.phase === 'ready' && checkpoint.actionPlanSha256 !== undefined) ||
      (checkpoint.phase !== 'ready' && !/^[a-f0-9]{64}$/.test(checkpoint.actionPlanSha256 ?? ''))
    )
      throw new Error('Terraform upgrade checkpoint differs');
    let serial = await optional(storage, 'terraform-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 2, engine: 'terraform', status: 'idle' };
    if (
      serial.schemaVersion !== 2 ||
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
        schemaVersion: 2,
        engine: 'terraform',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
    }
    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let observation = await observe();
    let transition = assessCeUpgradeTransition(upgrade.expectation, observation);
    let session;
    const completeApplication = async (action) => {
      session ??= await terraform.open(storage.owner, upgrade.deployment, 'current');
      const state = await session.readPlanApplicationState(action);
      if (assessCeUpgradeTransition(upgrade.expectation, observation) !== 'versions-complete')
        throw new Error('Terraform upgrade completion evidence is no longer current');
      if (state === 'planned') throw new Error('Terraform upgrade action was not submitted');
      if (state === 'applying') {
        await session.reconcileApplyFromEvidence(
          action,
          hash({
            owner: storage.owner,
            sourcePlanSha256: upgrade.sourcePlanSha256,
            upgradePlanSha256: upgrade.planSha256,
            action,
            observation,
          }),
        );
        if ((await session.readPlanApplicationState(action)) !== 'applied')
          throw new Error('Terraform upgrade application reconciliation did not converge');
      } else if (state !== 'applied') throw new Error('Terraform upgrade application state is unknown');
    };
    const releaseSerial = async () => {
      await storage.write('terraform-ce-upgrade-serial.json', {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      });
    };
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed Terraform upgrade version evidence regressed');
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Completed upgrade action plan differs');
      const receipt = await storage.read(`${upgrade.planId}-receipt.json`);
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash(receipt.target) !== hash(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== checkpoint.actionPlanSha256 ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed Terraform upgrade receipt differs');
      await completeApplication(action);
      await releaseSerial();
      return receipt;
    }
    if (transition === 'failed') throw new Error('Terraform upgrade failed');
    if (checkpoint.phase === 'ready' && transition === 'unknown')
      throw new Error('Terraform upgrade evidence is unknown');
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized Terraform action');
    if (checkpoint.phase === 'ready') {
      try {
        session = await terraform.open(storage.owner, upgrade.deployment, false);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        session = await terraform.open(storage.owner, upgrade.deployment, 'current');
      }
      const action = await session.planAction(upgrade.action, env, signal);
      validateActionReceipt(upgrade, action);
      await storage.write(`${upgrade.planId}-action-plan.json`, action);
      await storage.verify();
      observation = await observe();
      transition = assessCeUpgradeTransition(upgrade.expectation, observation);
      if (transition !== 'ready') throw new Error('Terraform upgrade readiness changed before submission');
      checkpoint = { ...checkpoint, phase: 'submitted', actionPlanSha256: action.planSha256 };
      await storage.write(checkpointName, checkpoint);
      await session.apply(action, env, signal);
      observation = await observe();
      transition = assessCeUpgradeTransition(upgrade.expectation, observation);
    } else {
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Submitted upgrade action plan differs');
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Terraform upgrade convergence is unknown');
      return { status: 'upgrade-converging', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    const completedAction = await storage.read(`${upgrade.planId}-action-plan.json`);
    validateActionReceipt(upgrade, completedAction);
    if (completedAction.planSha256 !== checkpoint.actionPlanSha256)
      throw new Error('Completed upgrade action plan differs');
    await completeApplication(completedAction);
    const receipt = {
      status: 'upgrade-complete',
      engine: 'terraform',
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      actionPlanSha256: checkpoint.actionPlanSha256,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown',
      routing: 'unknown',
      traffic: 'unknown',
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    await releaseSerial();
    return receipt;
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/terraform-upgrade.ts
async function build(base, expectation, contract) {
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
  const requestValues = { name: selected.site.name, namespace: 'system', version, force: false };
  const actionValues = { site: selected.site.name, [kind === 'software' ? 'software_version' : 'os_version']: version };
  const suffix = kind === 'software' ? 'sw' : 'os';
  if (
    request.method !== 'POST' ||
    request.path !== `/api/config/namespaces/system/sites/${selected.site.name}/upgrade_${suffix}` ||
    canonicalSha256(request.body) !== canonicalSha256(requestValues)
  )
    throw new Error('Terraform upgrade wire request differs from the verified action');
  const providerLock = await loadXcshProviderLock();
  const identity = { sourcePlanSha256: base.planSha256, expectation };
  const stage = `upgrade-${kind}-${canonicalSha256(identity).slice(0, 24)}`;
  const type = `xcsh_site_upgrade_${suffix}`;
  const deployment = {
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
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
      action: { [type]: { ce: { config: actionValues } } },
    }),
  };
  const draft = {
    schemaVersion: 2,
    engine: 'terraform',
    kind: 'aws-ce-terraform-upgrade',
    ...identity,
    deployment,
    action: {
      address: `action.${type}.ce`,
      type,
      providerName: 'registry.terraform.io/f5-sales-demo/xcsh',
      configValuesSha256: canonicalSha256(actionValues),
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsTerraformUpgrade(base, siteName, target, runtime, contract, signal) {
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
  const expectation = {
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
async function verifyAwsTerraformUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('AWS Terraform upgrade schema is obsolete; prepare a new v2 plan');
  const expected = await build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected)) throw new Error('Saved Terraform upgrade plan changed');
}
async function runAwsTerraformUpgrade(
  base,
  upgrade,
  authorizedPlanSha256,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  return runTerraformCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    (candidate) => verifyAwsTerraformUpgrade(base, candidate, contract),
    runtime,
    contract,
    terraform,
    storage,
    env,
    signal,
  );
}

export { prepareAwsTerraformUpgrade, runAwsTerraformUpgrade, verifyAwsTerraformUpgrade };

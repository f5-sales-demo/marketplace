// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import {
  assertAwsTerraformDeploymentActive,
  assessCeUpgradeTransition,
  awsTerraformService,
  VerifiedUpgradeContract,
  withAwsTerraformLifecycle,
} from './runtime-5bbvatrz.js';
import { prepareAwsTerraformUpgrade, runAwsTerraformUpgrade, verifyAwsTerraformUpgrade } from './runtime-gn32pwwb.js';
import { acquireProcessLock, initialSoftwareSettings, loadAwsPlan, verifyAwsCePlan } from './runtime-np6pq61g.js';
import { awsPlatformService } from './runtime-pv55z3nj.js';
import './runtime-fex55vat.js';
import './runtime-30f0rzjf.js';

// plugins/platform/src/ce/native-upgrade.ts
import { createHash, timingSafeEqual } from 'node:crypto';
import { siteBindings } from './runtime-3pc51xt0.js';
import { canonicalSha256, safeHexEqual } from './runtime-x2h4t614.js';

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
var hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
var sameHash = (left, right) =>
  /^[a-f0-9]{64}$/.test(left) &&
  /^[a-f0-9]{64}$/.test(right) &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function exactFields(value, expected) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== expected.toSorted().join(',')
  )
    throw Error('Native upgrade record fields differ');
}
function validateNativeUpgradeReceipt(upgrade, value) {
  exactFields(value, [
    'status',
    'engine',
    'planId',
    'planSha256',
    'siteName',
    'target',
    'observedAt',
    'nodeHealth',
    'routing',
    'traffic',
  ]);
  const time = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN;
  if (
    value.status !== 'upgrade-complete' ||
    value.engine !== 'native' ||
    value.planId !== upgrade.planId ||
    value.planSha256 !== upgrade.planSha256 ||
    value.siteName !== upgrade.expectation.binding.siteName ||
    hash(value.target) !== hash(upgrade.expectation.target) ||
    !Number.isFinite(time) ||
    time > Date.now() ||
    new Date(time).toISOString() !== value.observedAt ||
    value.nodeHealth !== 'unknown' ||
    value.routing !== 'unknown' ||
    value.traffic !== 'unknown'
  )
    throw Error('Completed native upgrade receipt differs');
  return value;
}
function validateNativeUpgradeCheckpoint(upgrade, value) {
  exactFields(value, ['schemaVersion', 'engine', 'sourcePlanSha256', 'upgradePlanSha256', 'phase']);
  if (
    value.schemaVersion !== 1 ||
    value.engine !== 'native' ||
    value.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
    value.upgradePlanSha256 !== upgrade.planSha256 ||
    !['ready', 'submitted', 'complete'].includes(String(value.phase))
  )
    throw Error('Native upgrade checkpoint differs');
  return value;
}
function validateNativeUpgradeSerial(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Native serial upgrade ledger differs');
  const row = value;
  exactFields(row, [
    'schemaVersion',
    'engine',
    'status',
    ...(row.activePlanId !== undefined ? ['activePlanId'] : []),
    ...(row.activePlanSha256 !== undefined ? ['activePlanSha256'] : []),
    ...(row.lastPlanId !== undefined ? ['lastPlanId'] : []),
    ...(row.lastPlanSha256 !== undefined ? ['lastPlanSha256'] : []),
  ]);
  const pair = (id, digest) =>
    typeof id === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) &&
    typeof digest === 'string' &&
    /^[a-f0-9]{64}$/.test(digest);
  if (
    row.schemaVersion !== 1 ||
    row.engine !== 'native' ||
    !['active', 'idle'].includes(String(row.status)) ||
    (row.status === 'idle' && (row.activePlanId !== undefined || row.activePlanSha256 !== undefined)) ||
    (row.status === 'active' && !pair(row.activePlanId, row.activePlanSha256)) ||
    ((row.lastPlanId !== undefined || row.lastPlanSha256 !== undefined) && !pair(row.lastPlanId, row.lastPlanSha256))
  )
    throw Error('Native serial upgrade ledger differs');
  return row;
}
async function runNativeCeUpgrade(input, authorizedPlanSha256, verify, runtime, contract, storage, signal) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Native upgrade schema is obsolete; prepare a new v1 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact native upgrade authorization is required');
  if (
    runtime.engine !== 'native' ||
    storage.owner.engine !== 'native' ||
    hash(storage.owner) !== hash(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning native engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    signal?.throwIfAborted();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved native upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    const loadedCheckpoint = await optional(storage, checkpointName);
    let checkpoint;
    if (loadedCheckpoint === undefined) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    } else checkpoint = loadedCheckpoint;
    checkpoint = validateNativeUpgradeCheckpoint(upgrade, checkpoint);
    let serial = (await optional(storage, 'native-ce-upgrade-serial.json')) ?? {
      schemaVersion: 1,
      engine: 'native',
      status: 'idle',
    };
    serial = validateNativeUpgradeSerial(serial);
    if (
      serial.status === 'active' &&
      (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256)
    )
      throw Error('Another native site upgrade is active');
    if (serial.lastPlanId !== undefined) {
      const last = await optional(storage, `${serial.lastPlanId}.json`);
      if (
        !last ||
        last.planId !== serial.lastPlanId ||
        last.planSha256 !== serial.lastPlanSha256 ||
        last.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
        hash(last.expectation.binding.owner) !== hash(storage.owner)
      )
        throw Error('Native serial upgrade source differs');
      await verify(last);
    }
    if (checkpoint.phase === 'submitted' && serial.status !== 'active')
      throw Error('Submitted native upgrade serial source missing');
    if (checkpoint.phase === 'complete' && serial.status === 'idle' && !serial.lastPlanId)
      throw Error('Completed native upgrade serial source missing');
    if (serial.status === 'idle' && checkpoint.phase === 'ready') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
    }
    const observe = async () => {
      signal?.throwIfAborted();
      const result = await runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
      signal?.throwIfAborted();
      return result;
    };
    const publishComplete = async () => {
      signal?.throwIfAborted();
      let receipt = await optional(storage, `${upgrade.planId}-receipt.json`);
      if (receipt === undefined) {
        if (checkpoint.phase === 'complete') throw Error('Completed native upgrade receipt missing');
        receipt = {
          status: 'upgrade-complete',
          engine: 'native',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
          siteName: upgrade.expectation.binding.siteName,
          target: upgrade.expectation.target,
          observedAt: new Date().toISOString(),
          nodeHealth: 'unknown',
          routing: 'unknown',
          traffic: 'unknown',
        };
        validateNativeUpgradeReceipt(upgrade, receipt);
        signal?.throwIfAborted();
        await storage.write(`${upgrade.planId}-receipt.json`, receipt);
      } else validateNativeUpgradeReceipt(upgrade, receipt);
      signal?.throwIfAborted();
      if (checkpoint.phase !== 'complete') {
        checkpoint = { ...checkpoint, phase: 'complete' };
        await storage.write(checkpointName, checkpoint);
      }
      signal?.throwIfAborted();
      if (serial.status === 'active') {
        serial = {
          schemaVersion: 1,
          engine: 'native',
          status: 'idle',
          lastPlanId: upgrade.planId,
          lastPlanSha256: upgrade.planSha256,
        };
        await storage.write('native-ce-upgrade-serial.json', serial);
      } else if (!serial.lastPlanId) throw Error('Completed native upgrade serial source missing');
      signal?.throwIfAborted();
      return receipt;
    };
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed native upgrade version evidence regressed');
      return await publishComplete();
    }
    if (transition === 'failed') throw new Error('Native upgrade failed');
    if (transition === 'unknown') {
      if (checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      throw new Error('Native upgrade evidence is unknown');
    }
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized native action');
    if (checkpoint.phase === 'ready') {
      let crossedBoundary = false;
      try {
        await runtime.submitUpgrade(
          upgrade.expectation.binding,
          contract,
          upgrade.expectation.target,
          upgrade.expectation.siteUid,
          async () => {
            signal?.throwIfAborted();
            checkpoint = {
              schemaVersion: 1,
              engine: 'native',
              sourcePlanSha256: upgrade.sourcePlanSha256,
              upgradePlanSha256: upgrade.planSha256,
              phase: 'submitted',
            };
            await storage.write(checkpointName, checkpoint);
            crossedBoundary = true;
          },
          signal,
        );
      } catch (error) {
        signal?.throwIfAborted();
        if (!crossedBoundary) throw error;
        return {
          status: 'upgrade-submission-unconfirmed',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      }
      if (!crossedBoundary) throw Error('Native upgrade submission boundary missing');
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown' && checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Native upgrade convergence is unknown');
      return {
        status:
          checkpoint.phase === 'submitted' && transition === 'ready'
            ? 'upgrade-submission-unconfirmed'
            : 'upgrade-converging',
        planId: upgrade.planId,
        planSha256: upgrade.planSha256,
      };
    }
    return await publishComplete();
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/native-upgrade.ts
function build(base, expectation, contract) {
  verifyAwsCePlan(base);
  initialSoftwareSettings(expectation.before);
  const selected = siteBindings(base).find(({ site }) => site.name === expectation.binding.siteName);
  if (
    base.engine !== 'native' ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(expectation.binding) ||
    expectation.contractFingerprint !== contract.fingerprint ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version
  )
    throw new Error('Native upgrade identities, scope or effective versions are incomplete');
  contract.build({ siteName: selected.site.name, ...expectation.target });
  const draft = {
    schemaVersion: 1,
    engine: 'native',
    kind: 'aws-ce-native-upgrade',
    sourcePlanSha256: base.planSha256,
    expectation,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsNativeUpgrade(base, siteName, target, runtime, contract, signal) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (base.engine !== 'native' || !selected) throw new Error('Select a site owned by this native deployment');
  contract.build({ siteName, ...target });
  const observation = await runtime.observeUpgrade(
    selected.binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh native upgrade version evidence is unavailable');
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
    throw new Error('Native site version readiness has not converged');
  return build(base, expectation, contract);
}
function verifyAwsNativeUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('AWS native upgrade schema is obsolete; prepare a new v1 plan');
  const expected = build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected)) throw new Error('Saved native upgrade plan changed');
}
function runAwsNativeUpgrade(base, upgrade, authorizedPlanSha256, runtime, contract, storage, signal) {
  return runNativeCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    async (candidate) => verifyAwsNativeUpgrade(base, candidate, contract),
    runtime,
    contract,
    storage,
    signal,
  );
}

// plugins/aws/src/tools/aws-ce-upgrade.ts
var defaults = {
  platform: awsPlatformService,
  terraform: awsTerraformService,
  contract: (signal) => VerifiedUpgradeContract.release(fetch, signal),
};
async function optional2(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAwsCeUpgradeTool(pi, dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_upgrade',
    label: 'Upgrade AWS Customer Edge',
    description:
      'Prepare or apply an immutable serial software/OS upgrade for a native- or Terraform-owned AWS Customer Edge site. Apply resumes from persisted platform evidence without replaying ambiguous actions. Node, routing and traffic health remain separate evidence.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      siteName: Type.Optional(Type.String()),
      kind: Type.Optional(Type.Union([Type.Literal('software'), Type.Literal('os')])),
      version: Type.Optional(Type.String()),
      upgradePlanId: Type.Optional(Type.String()),
      upgradePlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'kind', 'operation', 'siteName', 'version']
            : ['basePlanId', 'basePlanSha256', 'operation', 'upgradePlanId', 'upgradePlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE upgrade ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'aws',
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        const executeActive = async () => {
          if (plan.engine === 'terraform') await assertAwsTerraformDeploymentActive(storage);
          const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
          const contract = await dependencies.contract(signal);
          if (params.operation === 'prepare') {
            if (!params.siteName || !params.kind || !params.version)
              throw new Error('Upgrade preparation requires siteName, kind and version');
            const upgrade =
              plan.engine === 'terraform'
                ? await prepareAwsTerraformUpgrade(
                    plan,
                    params.siteName,
                    { kind: params.kind, version: params.version },
                    runtime,
                    contract,
                    signal,
                  )
                : await prepareAwsNativeUpgrade(
                    plan,
                    params.siteName,
                    { kind: params.kind, version: params.version },
                    runtime,
                    contract,
                    signal,
                  );
            const existing = await optional2(storage, `${upgrade.planId}.json`);
            if (existing === undefined) await storage.write(`${upgrade.planId}.json`, upgrade);
            else if (canonicalSha256(existing) !== canonicalSha256(upgrade))
              throw new Error('Persisted AWS CE upgrade plan differs');
            const artifactId = await ctx.sessionManager.saveArtifact(
              JSON.stringify({
                kind: upgrade.kind,
                engine: upgrade.engine,
                planId: upgrade.planId,
                planSha256: upgrade.planSha256,
                sourcePlanSha256: upgrade.sourcePlanSha256,
                siteName: upgrade.expectation.binding.siteName,
                target: upgrade.expectation.target,
              }),
              'aws-ce-upgrade-plan',
            );
            if (!artifactId) throw new Error('AWS CE upgrade plan artifact persistence failed');
            return {
              content: [
                {
                  type: 'text',
                  text: `Upgrade plan ID: ${upgrade.planId}
SHA-256: ${upgrade.planSha256}
Site: ${upgrade.expectation.binding.siteName}
Target: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}
Artifact: artifact://${artifactId}`,
                },
              ],
              details: {
                tool: 'aws_ce_upgrade',
                operation: 'prepare',
                artifactId,
                planId: upgrade.planId,
                planSha256: upgrade.planSha256,
              },
            };
          }
          if (!params.upgradePlanId || !params.upgradePlanSha256)
            throw new Error('Upgrade apply requires the exact upgrade plan ID and SHA-256');
          const upgrade = await storage.read(`${params.upgradePlanId}.json`);
          if (plan.engine === 'terraform') await verifyAwsTerraformUpgrade(plan, upgrade, contract);
          else verifyAwsNativeUpgrade(plan, upgrade, contract);
          if (upgrade.planId !== params.upgradePlanId || !safeHexEqual(upgrade.planSha256, params.upgradePlanSha256))
            throw new Error('Persisted AWS CE upgrade plan identity differs');
          const authorizationName = `${upgrade.planId}-authorization.json`;
          const authorization = await optional2(storage, authorizationName);
          if (authorization !== undefined) {
            if (
              !authorization ||
              typeof authorization !== 'object' ||
              authorization.schemaVersion !== 1 ||
              authorization.engine !== plan.engine ||
              authorization.sourcePlanSha256 !== plan.planSha256 ||
              authorization.upgradePlanSha256 !== upgrade.planSha256 ||
              authorization.mutations !== true
            )
              throw new Error('Persisted AWS CE upgrade authorization differs');
          } else {
            if (
              ctx.hasUI &&
              !(await ctx.ui.confirm(
                'Apply immutable AWS CE upgrade plan',
                `${upgrade.planId}
${upgrade.planSha256}
${upgrade.expectation.binding.siteName}: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}`,
              ))
            )
              throw new Error('AWS CE upgrade was not approved');
            await storage.write(authorizationName, {
              schemaVersion: 1,
              engine: plan.engine,
              sourcePlanSha256: plan.planSha256,
              upgradePlanSha256: upgrade.planSha256,
              mutations: true,
            });
          }
          const result =
            plan.engine === 'terraform'
              ? await runAwsTerraformUpgrade(
                  plan,
                  upgrade,
                  params.upgradePlanSha256,
                  runtime,
                  contract,
                  await dependencies.terraform(pi, signal),
                  storage,
                  process.env,
                  signal,
                )
              : await runAwsNativeUpgrade(plan, upgrade, params.upgradePlanSha256, runtime, contract, storage, signal);
          const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-upgrade-checkpoint');
          if (!artifactId) throw new Error('AWS CE upgrade checkpoint artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `AWS CE upgrade ${upgrade.expectation.binding.siteName}: ${String(result.status)}. Node, routing and traffic health require separate collected evidence.`,
              },
            ],
            details: { tool: 'aws_ce_upgrade', operation: 'apply', artifactId, ...result },
          };
        };
        return plan.engine === 'terraform'
          ? await withAwsTerraformLifecycle(storage, signal, executeActive)
          : await executeActive();
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE upgrade failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_upgrade', operation: params.operation },
        };
      }
    },
  };
}

export { createAwsCeUpgradeTool };

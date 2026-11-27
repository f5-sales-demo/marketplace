// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { siteBindings, siteForNode } from './runtime-3pc51xt0.js';
import { makeExecApi } from './runtime-30f0rzjf.js';
import { awsPlatformService } from './runtime-155xe9bc.js';
import {
  assertAwsTerraformDeploymentActive,
  awsTerraformFoundationDeployment,
  awsTerraformService,
  collectAwsNetworkHealth,
  collectAwsTrafficProbe,
  withAwsTerraformLifecycle,
} from './runtime-0605y9h7.js';
import { scopedAwsApi } from './runtime-fex55vat.js';
import { acquireProcessLock, loadAwsCheckpoint, loadAwsPlan, verifyAwsCePlan } from './runtime-np6pq61g.js';
import { canonicalSha256, sha256Hex } from './runtime-x2h4t614.js';

// plugins/aws/src/ce/failover-health.ts
async function collectAwsFailoverBgpHealth(plan, checkpoint, nodeIndex, phase, api, signal) {
  verifyAwsCePlan(plan);
  const site = siteBindings(plan).find(({ site }) => site.nodeIndexes.includes(nodeIndex))?.site;
  if (
    !site ||
    !['outage', 'recovered'].includes(phase) ||
    checkpoint.schemaVersion !== plan.schemaVersion ||
    checkpoint.engine !== plan.engine ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256
  )
    throw new Error('Failover observation node, phase or checkpoint binding differs');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const selected = actions.filter((action) => action.node === nodeIndex);
  if (!selected.length) throw new Error('Failover node has no planned Connect peers');
  const health = await collectAwsNetworkHealth('bgp', plan, checkpoint, api, signal);
  const selectedPeerIds = selected.map((action) => checkpoint.resolvedValues[action.capture?.placeholder ?? '']);
  const expectedSessions = actions.length * 2;
  const expectedEstablishedSessions = expectedSessions - (phase === 'outage' ? selected.length * 2 : 0);
  const binding = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    nodeIndex,
    nodeName: `${plan.deploymentName}-${nodeIndex}`,
    selectedSiteName: site.name,
    phase,
    expectedEstablishedSessions,
  };
  if (
    !['healthy', 'degraded'].includes(String(health.status)) ||
    health.expectedSessions !== expectedSessions ||
    !Array.isArray(health.sessions)
  )
    return { ...health, ...binding, acceptance: 'unknown' };
  const exact =
    health.establishedSessions === expectedEstablishedSessions &&
    health.sessions.length === expectedSessions &&
    health.sessions.every(
      (session) => session.status === (phase === 'outage' && selectedPeerIds.includes(session.peerId) ? 'down' : 'up'),
    );
  return { ...health, ...binding, acceptance: exact ? 'passed' : 'pending' };
}

// plugins/aws/src/ce/native-failover.ts
async function observeAwsNativeFailoverInstance(base, failover, api, signal) {
  signal?.throwIfAborted();
  verifyAwsNativeFailover(base, failover);
  const identity = await api.exec('aws', ['sts', 'get-caller-identity', '--region', base.region, '--output', 'json'], {
    signal,
  });
  if (identity.exitCode !== 0 || JSON.parse(identity.stdout).Account !== base.accountId)
    throw new Error('Native failover account observation differs');
  const response = await api.exec(
    'aws',
    ['ec2', 'describe-instances', '--instance-ids', failover.instanceId, '--region', base.region, '--output', 'json'],
    { signal },
  );
  if (response.exitCode !== 0) throw new Error('Native failover instance observation unavailable');
  const raw = JSON.parse(response.stdout);
  const reservations = Array.isArray(raw.Reservations) ? raw.Reservations : [];
  const rows = reservations.flatMap((value) => {
    const reservation = value;
    return (Array.isArray(reservation.Instances) ? reservation.Instances : []).map((instance) => ({
      owner: reservation.OwnerId,
      instance,
    }));
  });
  if (raw.NextToken || rows.length !== 1 || rows[0].owner !== base.accountId)
    throw new Error('Native failover instance response is incomplete');
  const instance = rows[0].instance;
  const tags = new Map(
    (Array.isArray(instance.Tags) ? instance.Tags : []).map((value) => {
      const tag = value;
      return [String(tag.Key), String(tag.Value)];
    }),
  );
  if (
    instance.InstanceId !== failover.instanceId ||
    tags.size !== (Array.isArray(instance.Tags) ? instance.Tags.length : 0) ||
    tags.get('xcsh-managed-by') !== 'aws-ce' ||
    tags.get('xcsh-execution-engine') !== 'native' ||
    tags.get('xcsh-deployment-id') !== base.deploymentName ||
    tags.get('xcsh-plan-sha256') !== failover.instancePlanSha256 ||
    tags.get('xcsh-node-index') !== String(failover.nodeIndex)
  )
    throw new Error('Native failover instance ownership differs');
  const state = instance.State?.Name;
  if (state === 'running' || state === 'stopped') return state;
  return ['pending', 'stopping'].includes(String(state)) ? 'pending' : 'unknown';
}
function buildAwsNativeFailover(base, nodeIndex, instanceId, instancePlanSha256 = base.planSha256) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.nodeIndexes.includes(nodeIndex));
  if (
    base.engine !== 'native' ||
    base.routing.profile !== 'tgw-connect' ||
    !selected ||
    !Number.isInteger(nodeIndex) ||
    !/^i-[0-9a-f]{8,17}$/.test(instanceId) ||
    !/^[0-9a-f]{64}$/.test(instancePlanSha256)
  )
    throw new Error('AWS native failover source, node or instance differs');
  const draft = {
    schemaVersion: 2,
    engine: 'native',
    kind: 'aws-ce-native-failover',
    sourcePlanSha256: base.planSha256,
    nodeIndex,
    instanceId,
    instancePlanSha256,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAwsNativeFailover(base, failover) {
  if (
    failover.schemaVersion !== 2 ||
    failover.engine !== 'native' ||
    failover.kind !== 'aws-ce-native-failover' ||
    failover.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(
      buildAwsNativeFailover(base, failover.nodeIndex, failover.instanceId, failover.instancePlanSha256),
    ) !== canonicalSha256(failover)
  )
    throw new Error('Saved AWS native failover plan changed');
}
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAwsNativeFailover(
  base,
  failover,
  authorizedPlanSha256,
  storage,
  observeInstance,
  mutate,
  collect,
  signal,
  polling = {
    attempts: 30,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAwsNativeFailover(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256) throw new Error('Exact native failover authorization is required');
  if (
    canonicalSha256(storage.owner) !==
    canonicalSha256({
      deploymentId: base.deploymentName,
      engine: 'native',
      provider: 'aws',
      account: base.accountId,
      region: base.region,
    })
  )
    throw new Error('Only the owning native engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Failover convergence bounds are invalid');
  const release = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const saved = await optional(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(saved) !== canonicalSha256(failover)) throw new Error('Saved failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let checkpoint = await optional(storage, checkpointName);
    if (!checkpoint) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'stop',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'native' ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.failoverPlanSha256 !== failover.planSha256 ||
      !['stop', 'outage', 'start', 'recovered', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.pending !== undefined &&
        (checkpoint.pending.phase !== checkpoint.phase ||
          checkpoint.pending.requestSha256 !==
            canonicalSha256({ phase: checkpoint.pending.phase, instanceId: failover.instanceId })))
    )
      throw new Error('Native failover checkpoint differs');
    let active = checkpoint;
    const convergeInstance = async (expected) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        if ((await observeInstance(signal)) === expected) return;
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Native failover instance ${expected} convergence deadline exceeded`);
    };
    const change = async (phase, next) => {
      const expected = phase === 'stop' ? 'stopped' : 'running';
      if (!active.pending) {
        const before = await observeInstance(signal);
        if (before === expected)
          throw new Error(`Native failover instance was already ${expected} before authorization`);
        if (before !== (phase === 'stop' ? 'running' : 'stopped'))
          throw new Error('Native failover instance state is unavailable');
        active = {
          ...active,
          pending: { phase, requestSha256: canonicalSha256({ phase, instanceId: failover.instanceId }) },
        };
        await storage.write(checkpointName, active);
        await mutate(phase, signal);
      }
      await convergeInstance(expected);
      active = { ...active, phase: next, pending: undefined };
      await storage.write(checkpointName, active);
    };
    const convergeNetwork = async (phase, next) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          active = { ...active, phase: next };
          await storage.write(checkpointName, active);
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Native failover ${phase} convergence deadline exceeded`);
    };
    if (active.phase === 'stop') await change('stop', 'outage');
    if (active.phase === 'outage') await convergeNetwork('outage', 'start');
    if (active.phase === 'start') await change('start', 'recovered');
    if (active.phase === 'recovered') await convergeNetwork('recovered', 'complete');
    const receipt = {
      status: 'failover-complete',
      engine: 'native',
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      observedAt: new Date().toISOString(),
      traffic: 'unknown',
      originControl: 'unknown',
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/terraform-failover.ts
var object = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed failover configuration');
  return value;
};
function awsTerraformFailoverStages(base, nodeIndex, instanceId, configuration, expectedConfigurationSha256) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.nodeIndexes.includes(nodeIndex));
  if (
    base.engine !== 'terraform' ||
    !selected ||
    !Number.isInteger(nodeIndex) ||
    !/^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(instanceId) ||
    sha256Hex(configuration) !== expectedConfigurationSha256
  )
    throw new Error('Terraform failover engine, instance or configuration binding differs');
  const original = object(JSON.parse(configuration));
  const provider = object(object(original.provider).aws);
  if (
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId])
  )
    throw new Error('Terraform failover provider scope differs');
  const resources = object(original.resource);
  if (resources.aws_ec2_instance_state !== undefined) throw new Error('An instance power control is already present');
  const instance = object(object(resources.aws_instance)[`node_${nodeIndex}`]);
  const tags = object(instance.tags);
  if (
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-managed-by'] !== 'aws-ce' ||
    tags['xcsh-deployment-id'] !== base.deploymentName ||
    tags['xcsh-plan-sha256'] !== base.planSha256 ||
    tags['xcsh-node-index'] !== String(nodeIndex) ||
    tags['ves-io-site-name'] !== selected.site.name ||
    instance.count !== undefined ||
    instance.for_each !== undefined ||
    instance.ami !== base.intent.image.amiId ||
    instance.instance_type !== base.intent.instance.type ||
    typeof instance.user_data_base64 !== 'string'
  )
    throw new Error('Terraform failover instance ownership or identity differs');
  const retainedAddresses = Object.entries(resources).flatMap(([type, values]) =>
    Object.keys(object(values)).map((name) => ({ address: `${type}.${name}`, type })),
  );
  const controlAddress = 'aws_ec2_instance_state.ce_failover';
  const power = (state) => {
    const result = structuredClone(original);
    object(result.resource).aws_ec2_instance_state = { ce_failover: { instance_id: instanceId, state, force: false } };
    return JSON.stringify(result);
  };
  const stopped = power('stopped');
  const running = power('running');
  const stage = (phase, text, previous) => ({
    phase,
    deploymentId: base.deploymentName,
    sourcePlanSha256: base.planSha256,
    instanceId,
    instanceAddress: `aws_instance.node_${nodeIndex}`,
    controlAddress,
    previousConfigurationSha256: previous,
    configurationSha256: sha256Hex(text),
    configuration: text,
    retainedAddresses: structuredClone(retainedAddresses),
  });
  return {
    stop: stage('stop', stopped, expectedConfigurationSha256),
    start: stage('start', running, sha256Hex(stopped)),
    release: stage('release', configuration, sha256Hex(running)),
  };
}
function validateAwsTerraformFailoverPlan(stage, receipt) {
  const retained = new Map(stage.retainedAddresses.map((resource) => [resource.address, resource.type]));
  const allowed = { stop: ['create', 'no-op'], start: ['create', 'update', 'no-op'], release: ['delete', 'no-op'] }[
    stage.phase
  ];
  if (
    !allowed ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== stage.deploymentId ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    sha256Hex(stage.configuration) !== stage.configurationSha256 ||
    !Array.isArray(receipt.changes) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length ||
    stage.retainedAddresses.some(
      (resource) => !receipt.changes.some((change) => change.address === resource.address),
    ) ||
    (stage.phase !== 'release' && !receipt.changes.some((change) => change.address === stage.controlAddress)) ||
    receipt.changes.some(
      (change) =>
        change.actions.length !== 1 ||
        (change.address === stage.controlAddress
          ? change.type !== 'aws_ec2_instance_state' || !allowed.includes(change.actions[0])
          : retained.get(change.address) !== change.type || change.actions[0] !== 'no-op'),
    )
  )
    throw new Error('Terraform failover plan changes or omits retained deployment resources');
}
function buildAwsTerraformFailover(base, nodeIndex, instanceId, configuration, expectedConfigurationSha256) {
  const stages = awsTerraformFailoverStages(base, nodeIndex, instanceId, configuration, expectedConfigurationSha256);
  const draft = {
    schemaVersion: 1,
    engine: 'terraform',
    kind: 'aws-ce-terraform-failover',
    sourcePlanSha256: base.planSha256,
    nodeIndex,
    instanceId,
    stages,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAwsTerraformFailover(base, failover) {
  if (
    failover.schemaVersion !== 1 ||
    failover.engine !== 'terraform' ||
    failover.kind !== 'aws-ce-terraform-failover' ||
    failover.sourcePlanSha256 !== base.planSha256
  )
    throw new Error('AWS Terraform failover schema or source differs');
  const expected = buildAwsTerraformFailover(
    base,
    failover.nodeIndex,
    failover.instanceId,
    failover.stages.release.configuration,
    failover.stages.release.configurationSha256,
  );
  if (canonicalSha256(expected) !== canonicalSha256(failover))
    throw new Error('Saved AWS Terraform failover plan changed');
}
async function optional2(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAwsTerraformFailover(
  base,
  failover,
  authorizedPlanSha256,
  session,
  storage,
  collect,
  env,
  signal,
  polling = {
    attempts: 30,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAwsTerraformFailover(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256)
    throw new Error('Exact Terraform failover authorization is required');
  if (
    storage.owner.engine !== 'terraform' ||
    canonicalSha256(storage.owner) !==
      canonicalSha256({
        deploymentId: base.deploymentName,
        engine: 'terraform',
        provider: 'aws',
        account: base.accountId,
        region: base.region,
      })
  )
    throw new Error('Only the owning Terraform engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Failover convergence bounds are invalid');
  const release = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const saved = await optional2(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(saved) !== canonicalSha256(failover)) throw new Error('Saved failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let checkpoint = await optional2(storage, checkpointName);
    if (!checkpoint) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'stop',
      };
      await storage.write(checkpointName, checkpoint);
    }
    const phases = ['stop', 'outage', 'start', 'recovered', 'release', 'complete'];
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.failoverPlanSha256 !== failover.planSha256 ||
      !phases.includes(checkpoint.phase) ||
      (['outage', 'recovered', 'complete'].includes(checkpoint.phase) &&
        checkpoint.submittedPlanSha256 !== undefined) ||
      (['stop', 'start', 'release'].includes(checkpoint.phase) &&
        checkpoint.submittedPlanSha256 !== undefined &&
        !/^[a-f0-9]{64}$/.test(checkpoint.submittedPlanSha256))
    )
      throw new Error('Terraform failover checkpoint differs');
    const now = () => (polling.now ?? Date.now)();
    const timestamp = () => {
      const value = now();
      if (!Number.isFinite(value)) throw new Error('Failover clock is invalid');
      return new Date(value).toISOString();
    };
    for (const [phase, attempt] of Object.entries(checkpoint.attempts ?? {})) {
      if (
        !['stop', 'start'].includes(phase) ||
        !attempt ||
        attempt.instanceId !== failover.instanceId ||
        attempt.sourcePlanSha256 !== base.planSha256 ||
        !/^[a-f0-9]{64}$/.test(attempt.planSha256) ||
        !Number.isFinite(Date.parse(attempt.observedAt)) ||
        Date.parse(attempt.observedAt) > now()
      )
        throw new Error('Failover original attempt binding differs');
    }
    for (const [phase, timing] of Object.entries(checkpoint.timings ?? {})) {
      if (
        !['outage', 'recovered'].includes(phase) ||
        !timing ||
        timing.thresholdMs !== 45000 ||
        !['passed', 'failed', 'unknown'].includes(timing.status)
      )
        throw new Error('Failover timing checkpoint differs');
      const attempt = checkpoint.attempts?.[phase === 'outage' ? 'stop' : 'start'];
      if (timing.status === 'unknown') {
        if (timing.elapsedMs !== undefined || timing.originalAttemptAt !== undefined || timing.observedAt !== undefined)
          throw new Error('Unknown failover timing contains invented evidence');
      } else {
        const elapsed = Date.parse(timing.observedAt ?? '') - Date.parse(attempt?.observedAt ?? '');
        if (
          !attempt ||
          timing.originalAttemptAt !== attempt.observedAt ||
          !Number.isFinite(elapsed) ||
          elapsed < 0 ||
          timing.elapsedMs !== elapsed ||
          Date.parse(timing.observedAt ?? '') > now() ||
          timing.status !== (elapsed <= 45000 ? 'passed' : 'failed')
        )
          throw new Error('Failover timing does not match original attempt');
      }
    }
    let active = checkpoint;
    const mutate = async (name, next) => {
      const stage = failover.stages[name];
      let receipt;
      const resumingSubmitted = !!active.submittedPlanSha256;
      if (active.submittedPlanSha256) {
        receipt = await storage.read(`${failover.planId}-${name}-plan.json`);
        validateAwsTerraformFailoverPlan(stage, receipt);
        if (receipt.planSha256 !== active.submittedPlanSha256)
          throw new Error('Submitted Terraform failover plan differs');
      } else {
        await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
        receipt = await session.plan(env, signal);
        validateAwsTerraformFailoverPlan(stage, receipt);
        await storage.write(`${failover.planId}-${name}-plan.json`, receipt);
        active = { ...active, phase: name, submittedPlanSha256: receipt.planSha256 };
        await storage.write(checkpointName, active);
      }
      if (name !== 'release') {
        const existing = active.attempts?.[name];
        if (existing && existing.planSha256 !== receipt.planSha256)
          throw new Error('Failover original attempt saved plan differs');
        if (!existing && !active.submittedPlanSha256) throw new Error('Failover submitted plan missing');
        if (!existing && !resumingSubmitted) {
          active = {
            ...active,
            attempts: {
              ...active.attempts,
              [name]: {
                observedAt: timestamp(),
                planSha256: receipt.planSha256,
                instanceId: failover.instanceId,
                sourcePlanSha256: base.planSha256,
              },
            },
          };
          await storage.write(checkpointName, active);
        }
      }
      await storage.verify();
      await session.apply(receipt, env, signal);
      active = { ...active, phase: next, submittedPlanSha256: undefined };
      await storage.write(checkpointName, active);
    };
    const converge = async (phase, next) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          const attempt = active.attempts?.[phase === 'outage' ? 'stop' : 'start'];
          const observedAt = timestamp();
          const elapsedMs = attempt ? Date.parse(observedAt) - Date.parse(attempt.observedAt) : undefined;
          const timing =
            elapsedMs !== undefined && elapsedMs >= 0
              ? {
                  status: elapsedMs <= 45000 ? 'passed' : 'failed',
                  thresholdMs: 45000,
                  originalAttemptAt: attempt?.observedAt,
                  observedAt,
                  elapsedMs,
                }
              : { status: 'unknown', thresholdMs: 45000 };
          active = {
            ...active,
            phase: next,
            submittedPlanSha256: undefined,
            timings: { ...active.timings, [phase]: timing },
          };
          await storage.write(checkpointName, active);
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Terraform failover ${phase} convergence deadline exceeded`);
    };
    if (active.phase === 'stop') await mutate('stop', 'outage');
    if (active.phase === 'outage') await converge('outage', 'start');
    if (active.phase === 'start') await mutate('start', 'recovered');
    if (active.phase === 'recovered') await converge('recovered', 'release');
    if (active.phase === 'release') await mutate('release', 'complete');
    const final = await session.plan(env, signal);
    validateAwsTerraformFailoverPlan(failover.stages.release, final);
    if (!final.noChanges || final.changes.some((change) => change.actions[0] !== 'no-op'))
      throw new Error('Terraform failover did not finish with a refresh-enabled no-change plan');
    const withdrawalTiming = active.timings?.outage ?? { status: 'unknown', thresholdMs: 45000 };
    const restorationTiming = active.timings?.recovered ?? { status: 'unknown', thresholdMs: 45000 };
    const acceptance = [withdrawalTiming, restorationTiming].some((t) => t.status === 'failed')
      ? 'failed'
      : [withdrawalTiming, restorationTiming].every((t) => t.status === 'passed')
        ? 'passed'
        : 'unknown';
    const receipt = {
      status:
        acceptance === 'passed'
          ? 'failover-complete'
          : acceptance === 'failed'
            ? 'failover-acceptance-failed'
            : 'failover-acceptance-unknown',
      acceptance,
      withdrawalTiming,
      restorationTiming,
      engine: 'terraform',
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      finalPlanSha256: final.planSha256,
      observedAt: new Date().toISOString(),
      traffic: 'unknown',
      originControl: 'unknown',
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}

// plugins/aws/src/tools/aws-ce-failover.ts
var defaults = {
  platform: awsPlatformService,
  terraform: awsTerraformService,
  makeApi: makeExecApi,
  run: runAwsTerraformFailover,
  runNative: runAwsNativeFailover,
  collect: collectAwsFailoverBgpHealth,
  collectTraffic: collectAwsTrafficProbe,
  observeNative: observeAwsNativeFailoverInstance,
};
var object2 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed failover identity');
  return value;
};
async function optional3(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAwsCeFailoverTool(pi, overrides = {}) {
  const dependencies = { ...defaults, ...overrides };
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_failover',
    label: 'Validate AWS Customer Edge Failover',
    description:
      'Prepare or execute an owning-engine planned CE outage. Apply collects selected BGP withdrawal/restoration and fresh reviewed HTTP traffic on recovery when NLB ingress is configured. Terraform releases its temporary power control and requires a final no-change plan; native execution reconciles ambiguous mutations without replay.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      nodeIndex: Type.Optional(Type.Number()),
      failoverPlanId: Type.Optional(Type.String()),
      failoverPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'nodeIndex', 'operation']
            : ['basePlanId', 'basePlanSha256', 'failoverPlanId', 'failoverPlanSha256', 'operation'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE failover ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (plan.routing.profile !== 'tgw-connect')
          throw new Error('This failover executor requires a TGW Connect deployment');
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
          if (params.operation === 'prepare') {
            if (!Number.isInteger(params.nodeIndex))
              throw new Error('Failover preparation requires an exact nodeIndex');
            let failover;
            if (plan.engine === 'terraform') {
              const terraform = await dependencies.terraform(pi, signal);
              const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan), 'current');
              const marker = object2(await storage.read('terraform-connect-stage.json'));
              if (
                marker.schemaVersion !== 1 ||
                marker.engine !== 'terraform' ||
                marker.planSha256 !== plan.planSha256 ||
                marker.stage !== 'applied' ||
                typeof marker.configurationSha256 !== 'string'
              )
                throw new Error('Terraform Connect deployment has not completed');
              const configuration = await session.readConfiguration(marker.configurationSha256);
              const outputs = await session.readOutputs(['ce_instances'], process.env, signal);
              const instances = object2(outputs.ce_instances);
              const identities = Object.entries(instances).map(([node, value]) => ({ node, value: object2(value) }));
              if (
                identities.length !== plan.intent.topology.nodeCount ||
                new Set(identities.map(({ value }) => value.id)).size !== identities.length ||
                identities.some(
                  ({ node, value }) =>
                    !/^i-[0-9a-f]{8,17}$/.test(String(value.id)) ||
                    value.hostname !== `${plan.deploymentName}-${node}` ||
                    value.site_name !== siteForNode(plan.intent, Number(node)).name,
                )
              )
                throw new Error('Terraform instance output is incomplete');
              const selected = object2(instances[String(params.nodeIndex)]);
              if (typeof selected.id !== 'string')
                throw new Error('Selected Terraform instance identity is unavailable');
              failover = buildAwsTerraformFailover(
                plan,
                params.nodeIndex,
                selected.id,
                configuration,
                marker.configurationSha256,
              );
            } else {
              const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
              const instanceId = checkpoint?.resolvedValues[`__INSTANCE_${params.nodeIndex}__`];
              if (checkpoint?.engine !== 'native' || checkpoint.state !== 'complete' || typeof instanceId !== 'string')
                throw new Error('Completed native deployment identity is unavailable');
              const registration = (plan.actions ?? []).find(
                (action) => action.kind === 'registration-gate' && action.node === params.nodeIndex,
              );
              const replacement = registration
                ? await optional3(storage, `${registration.id}-initial-mtu-replacement.json`)
                : undefined;
              let instancePlanSha256 = plan.planSha256;
              if (replacement !== undefined) {
                const envelope = object2(replacement);
                const child = object2(envelope.plan);
                const binding = object2(child.binding);
                const { planId, planSha256, ...draft } = child;
                const expectedSite = siteForNode(plan.intent, params.nodeIndex);
                if (
                  envelope.sourcePlanSha256 !== plan.planSha256 ||
                  typeof planSha256 !== 'string' ||
                  planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
                  canonicalSha256(draft) !== planSha256 ||
                  binding.siteName !== expectedSite.name ||
                  !Array.isArray(binding.nodes) ||
                  !binding.nodes.includes(`${plan.deploymentName}-${params.nodeIndex}`) ||
                  !checkpoint.childPlanSha256s?.includes(planSha256)
                )
                  throw new Error('Native replacement instance plan identity differs');
                instancePlanSha256 = planSha256;
              }
              failover = buildAwsNativeFailover(plan, params.nodeIndex, instanceId, instancePlanSha256);
            }
            const existing = await optional3(storage, `${failover.planId}.json`);
            if (existing === undefined) await storage.write(`${failover.planId}.json`, failover);
            else if (canonicalSha256(existing) !== canonicalSha256(failover))
              throw new Error('Persisted AWS CE failover plan differs');
            const artifactId = await ctx.sessionManager.saveArtifact(
              JSON.stringify({
                kind: failover.kind,
                engine: failover.engine,
                planId: failover.planId,
                planSha256: failover.planSha256,
                sourcePlanSha256: failover.sourcePlanSha256,
                nodeIndex: failover.nodeIndex,
              }),
              'aws-ce-failover-plan',
            );
            if (!artifactId) throw new Error('AWS CE failover plan artifact persistence failed');
            return {
              content: [
                {
                  type: 'text',
                  text: `Failover plan ID: ${failover.planId}
SHA-256: ${failover.planSha256}
Node: ${failover.nodeIndex}
Artifact: artifact://${artifactId}`,
                },
              ],
              details: {
                tool: 'aws_ce_failover',
                operation: 'prepare',
                artifactId,
                planId: failover.planId,
                planSha256: failover.planSha256,
              },
            };
          }
          if (!params.failoverPlanId || !params.failoverPlanSha256)
            throw new Error('Failover apply requires the exact failover plan identity');
          const failover = await storage.read(`${params.failoverPlanId}.json`);
          if (plan.engine === 'terraform') verifyAwsTerraformFailover(plan, failover);
          else verifyAwsNativeFailover(plan, failover);
          if (failover.planId !== params.failoverPlanId || failover.planSha256 !== params.failoverPlanSha256)
            throw new Error('Persisted AWS CE failover plan identity differs');
          const authorizationName = `${failover.planId}-authorization.json`;
          const authorization = await optional3(storage, authorizationName);
          if (authorization === undefined) {
            if (
              ctx.hasUI &&
              !(await ctx.ui.confirm(
                'Execute planned AWS CE failover',
                `${failover.planId}
${failover.planSha256}
Node ${failover.nodeIndex}`,
              ))
            )
              throw new Error('AWS CE failover was not approved');
            await storage.write(authorizationName, {
              schemaVersion: 1,
              engine: plan.engine,
              sourcePlanSha256: plan.planSha256,
              failoverPlanSha256: failover.planSha256,
              mutations: true,
            });
          } else if (
            canonicalSha256(authorization) !==
            canonicalSha256({
              schemaVersion: 1,
              engine: plan.engine,
              sourcePlanSha256: plan.planSha256,
              failoverPlanSha256: failover.planSha256,
              mutations: true,
            })
          )
            throw new Error('Persisted AWS CE failover authorization differs');
          const api = scopedAwsApi(dependencies.makeApi(ctx.cwd), plan.intent.awsProfile, signal);
          const routing =
            plan.engine === 'terraform'
              ? await storage.read('terraform-routing-checkpoint.json')
              : await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
          if (!routing) throw new Error('AWS CE routing checkpoint is unavailable');
          const collectTraffic = async (currentSignal) => {
            const evidence = await dependencies.collectTraffic(plan, routing, storage, api, currentSignal);
            if (evidence.status !== 'healthy') throw new Error('AWS failover traffic has not converged');
            return evidence;
          };
          const collect = async (phase, currentSignal) => {
            const bgp = await dependencies.collect(plan, routing, failover.nodeIndex, phase, api, currentSignal);
            const selectedSite = siteForNode(plan.intent, failover.nodeIndex);
            if (
              bgp.acceptance !== 'passed' ||
              plan.intent.ingress?.mode !== 'nlb' ||
              (phase === 'outage' && selectedSite.nodeIndexes.length !== 3)
            )
              return bgp;
            const trafficEvidence = await collectTraffic(currentSignal);
            return { ...bgp, traffic: trafficEvidence.status, trafficEvidence };
          };
          const execution =
            plan.engine === 'terraform'
              ? await dependencies.run(
                  plan,
                  failover,
                  params.failoverPlanSha256,
                  await (await dependencies.terraform(pi, signal)).open(
                    owner,
                    await awsTerraformFoundationDeployment(plan),
                    'current',
                  ),
                  storage,
                  collect,
                  process.env,
                  signal,
                )
              : await dependencies.runNative(
                  plan,
                  failover,
                  params.failoverPlanSha256,
                  storage,
                  (currentSignal) => dependencies.observeNative(plan, failover, api, currentSignal),
                  async (phase, currentSignal) => {
                    const response = await api.exec(
                      'aws',
                      [
                        'ec2',
                        phase === 'stop' ? 'stop-instances' : 'start-instances',
                        '--instance-ids',
                        failover.instanceId,
                        '--region',
                        plan.region,
                        '--output',
                        'json',
                      ],
                      { signal: currentSignal },
                    );
                    if (response.exitCode !== 0) throw new Error(`Native failover ${phase} request failed`);
                  },
                  collect,
                  signal,
                );
          const trafficEvidence = plan.intent.ingress?.mode === 'nlb' ? await collectTraffic(signal) : undefined;
          const result = {
            ...execution,
            traffic: trafficEvidence?.status ?? 'unknown',
            ...(trafficEvidence ? { trafficEvidence } : {}),
          };
          const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-failover-receipt');
          if (!artifactId) throw new Error('AWS CE failover receipt persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `AWS CE node ${failover.nodeIndex}: ${result.status}. BGP withdrawal and restoration converged; timing acceptance is reported separately when available. Current HTTP traffic: ${result.traffic}. Origin-control evidence remains separate.`,
              },
            ],
            ...('acceptance' in result && result.acceptance !== 'passed' ? { isError: true } : {}),
            details: { tool: 'aws_ce_failover', operation: 'apply', artifactId, ...result },
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
              text: `AWS CE failover failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_failover', operation: params.operation },
        };
      }
    },
  };
}

export { createAwsCeFailoverTool };

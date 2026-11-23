// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/azure/src/ce/failover-traffic.ts
import { randomBytes } from 'node:crypto';
// plugins/azure/src/ce/failover.ts
import { isIP } from 'node:net';
import {
  AZURE_CE_TERRAFORM_VERSION,
  acquireProcessLock,
  azureUpgradeBinding,
  collectAzureRouteServerFailoverHealth,
  verifyAzureCePlan,
} from './runtime-0s0phy0m.js';
import {
  AZURE_CE_AZAPI_PROVIDER_VERSION,
  collectAzureTrafficProbe,
  renderTerraformConfigurationJson,
  validateAzureTrafficCheckpoint,
} from './runtime-0wh24qrj.js';
import { canonicalSha256 } from './runtime-6j4b2rhv.js';

var require2 = (value, message) => {
  if (!value) throw Error(`Azure failover traffic: ${message}`);
};
var object = (value) => {
  require2(value && typeof value === 'object' && !Array.isArray(value), 'malformed history');
  return value;
};
var keys = (value, required, optional = []) =>
  require2(
    required.every((key) => key in value) &&
      Object.keys(value).every((key) => required.includes(key) || optional.includes(key)),
    'history fields differ',
  );
var timestamp = (value) => {
  require2(
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
    'history timestamp differs',
  );
  return Date.parse(String(value));
};
var prefix = (failover, phase) => `${failover.planId}-${phase}-traffic-`;
var azureFailoverTrafficHistoryName = (failover, phase) => `${prefix(failover, phase)}observations.json`;
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function validateAzureFailoverTrafficHistory(base, failover, phase, input, checkpoints) {
  verifyAzureCeFailoverPlan(base, failover);
  require2(['baseline', 'outage', 'recovered'].includes(phase), 'phase differs');
  const history = object(input);
  keys(history, ['schemaVersion', 'sourcePlanSha256', 'failoverPlanSha256', 'phase', 'observations']);
  require2(
    history.schemaVersion === 1 &&
      history.sourcePlanSha256 === base.planSha256 &&
      history.failoverPlanSha256 === failover.planSha256 &&
      history.phase === phase &&
      Array.isArray(history.observations) &&
      history.observations.length > 0 &&
      history.observations.length <= 1000,
    'history source or phase differs',
  );
  const names = new Set();
  let previous = 0,
    complete = 0,
    pending = 0;
  for (const raw of history.observations) {
    const row = object(raw);
    keys(row, ['checkpointKey', 'requestedAt'], ['checkpointSha256']);
    require2(
      typeof row.checkpointKey === 'string' &&
        row.checkpointKey.startsWith(prefix(failover, phase)) &&
        /^[a-f0-9]{32}$/.test(row.checkpointKey.slice(prefix(failover, phase).length)) &&
        !names.has(row.checkpointKey),
      'distinct source-bound checkpoint key required',
    );
    const name = `${row.checkpointKey}.json`;
    names.add(String(row.checkpointKey));
    const requested = timestamp(row.requestedAt);
    require2(requested >= previous, 'history collection order differs');
    previous = requested;
    const checkpoint = checkpoints.get(name);
    if (row.checkpointSha256 !== undefined)
      require2(
        typeof row.checkpointSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(row.checkpointSha256) &&
          checkpoint !== undefined &&
          canonicalSha256(checkpoint) === row.checkpointSha256,
        'completed checkpoint changed or missing',
      );
    if (checkpoint === undefined) {
      pending++;
      continue;
    }
    const evidence = validateAzureTrafficCheckpoint(base, checkpoint);
    require2(
      timestamp(object(checkpoint).sourceObservedAt) >= requested,
      'checkpoint predates the requested observation',
    );
    if (evidence) {
      require2(timestamp(evidence.observedAt) >= requested, 'HTTP observation predates its phase request');
      complete++;
    } else {
      require2(row.checkpointSha256 === undefined, 'completed checkpoint cannot be pending');
      pending++;
    }
  }
  require2(
    [...checkpoints.keys()].every((name) => names.has(name.slice(0, -5)) && name.endsWith('.json')),
    'foreign checkpoint inventory',
  );
  return { complete, pending, history, currentTrafficQualified: false };
}
async function collectAzureFailoverTraffic(base, failover, phase, storage, api, signal) {
  verifyAzureCeFailoverPlan(base, failover);
  require2(['baseline', 'outage', 'recovered'].includes(phase), 'phase differs');
  require2(canonicalSha256(storage.owner) === canonicalSha256(azureFailoverOwner(base)), 'storage owner differs');
  signal?.throwIfAborted();
  await storage.verify();
  const unlock = await acquireProcessLock(`${storage.directory}/.failover-traffic-${phase}-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const name = azureFailoverTrafficHistoryName(failover, phase);
    let history = await optional(storage, name);
    if (history) {
      const raw = object(history);
      require2(Array.isArray(raw.observations), 'malformed observation inventory');
      const scope = {
        ...raw,
        observations: raw.observations.map((row) => {
          const { checkpointSha256: _digest, ...identity } = object(row);
          return identity;
        }),
      };
      validateAzureFailoverTrafficHistory(base, failover, phase, scope, new Map());
      const checkpoints = new Map();
      for (const row of history.observations) {
        const checkpoint = await optional(storage, `${row.checkpointKey}.json`);
        if (checkpoint !== undefined) checkpoints.set(`${row.checkpointKey}.json`, checkpoint);
      }
      validateAzureFailoverTrafficHistory(base, failover, phase, history, checkpoints);
    } else
      history = {
        schemaVersion: 1,
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase,
        observations: [],
      };
    require2(history.observations.length < 1000, 'phase observation bound exhausted');
    const row = {
      checkpointKey: `${prefix(failover, phase)}${randomBytes(16).toString('hex')}`,
      requestedAt: new Date().toISOString(),
    };
    require2(
      (await optional(storage, `${row.checkpointKey}.json`)) === undefined,
      'new checkpoint identity already exists',
    );
    signal?.throwIfAborted();
    history.observations.push(row);
    await storage.write(name, history);
    signal?.throwIfAborted();
    const evidence = await collectAzureTrafficProbe(base, storage, api, signal, row.checkpointKey);
    signal?.throwIfAborted();
    const checkpoint = await storage.read(`${row.checkpointKey}.json`);
    require2(
      canonicalSha256(validateAzureTrafficCheckpoint(base, checkpoint)) === canonicalSha256(evidence) &&
        timestamp(evidence.observedAt) >= timestamp(row.requestedAt),
      'new HTTP receipt differs',
    );
    const active = history.observations.at(-1);
    if (!active) throw Error('Azure failover traffic: current observation missing');
    active.checkpointSha256 = canonicalSha256(checkpoint);
    await storage.write(name, history);
    signal?.throwIfAborted();
    return { checkpointKey: row.checkpointKey, requestedAt: row.requestedAt, evidence };
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/failover.ts
var object2 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure failover evidence');
  return value;
};
var lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
function validateAzureFailoverCheckpoint(base, failover, input) {
  verifyAzureCeFailoverPlan(base, failover);
  const value = object2(input);
  const required = ['schemaVersion', 'engine', 'sourcePlanSha256', 'failoverPlanSha256', 'phase'];
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => ![...required, 'pending'].includes(key)) ||
    value.schemaVersion !== 1 ||
    value.engine !== base.engine ||
    value.sourcePlanSha256 !== base.planSha256 ||
    value.failoverPlanSha256 !== failover.planSha256 ||
    !['baseline', 'stop', 'outage', 'start', 'recovered', 'release', 'complete'].includes(String(value.phase))
  )
    throw Error('Azure failover checkpoint differs');
  if (value.pending !== undefined) {
    const pending = object2(value.pending);
    if (
      Object.keys(pending).sort().join(',') !== 'phase,requestSha256' ||
      !['stop', 'start'].includes(String(pending.phase)) ||
      pending.phase !== value.phase ||
      pending.requestSha256 !==
        canonicalSha256({ phase: pending.phase, vmResourceId: failover.vmResourceId, vmId: failover.vmId })
    )
      throw Error('Azure failover pending request differs');
  }
  return structuredClone(value);
}
function validateAzureFailoverReceipt(base, failover, input) {
  verifyAzureCeFailoverPlan(base, failover);
  const value = object2(input);
  if (
    Object.keys(value).sort().join(',') !==
      'engine,nodeIndex,observedAt,planId,planSha256,sessionSequence,status,traffic' ||
    value.status !== 'failover-complete' ||
    value.engine !== base.engine ||
    value.planId !== failover.planId ||
    value.planSha256 !== failover.planSha256 ||
    value.nodeIndex !== failover.nodeIndex ||
    value.traffic !== 'healthy' ||
    canonicalSha256(value.sessionSequence) !== canonicalSha256([6, 4, 6]) ||
    typeof value.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.observedAt)) ||
    Date.parse(value.observedAt) > Date.now()
  )
    throw Error('Azure failover receipt differs');
  return structuredClone(value);
}
function azureFailoverOwner(plan) {
  verifyAzureCePlan(plan);
  return {
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  };
}
function plannedVm(plan, nodeIndex) {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 1 || nodeIndex > plan.topology.nodeCount)
    throw new Error('Azure failover requires an exact planned node index');
  const matches = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === nodeIndex);
  if (matches.length !== 1 || typeof matches[0].resourceId !== 'string')
    throw new Error('Azure failover VM resource identity is unavailable');
  return matches[0].resourceId;
}
async function observeAzureFailoverVm(plan, nodeIndex, api, signal) {
  verifyAzureCePlan(plan);
  signal?.throwIfAborted();
  const run = async (args) => {
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure failover identity observation unavailable');
    let value;
    try {
      value = object2(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure failover identity observation');
    }
    if (!Object.keys(value).length || value.nextLink) throw new Error('Incomplete Azure failover identity observation');
    return value;
  };
  const account = await run(['account', 'show']);
  if (
    lower(account.id) !== lower(plan.subscription.id) ||
    lower(account.tenantId) !== lower(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure failover account observation differs from deployment');
  const vmResourceId = plannedVm(plan, nodeIndex);
  const expectedScope = `/subscriptions/${plan.subscription.id}/resourcegroups/${plan.intent.resourceGroup}/providers/microsoft.compute/virtualmachines/`;
  if (!lower(vmResourceId).startsWith(expectedScope.toLowerCase()))
    throw new Error('Azure failover VM is outside the deployment scope');
  const vm = await run(['vm', 'show', '--ids', vmResourceId, '--show-details']);
  const tags = object2(vm.tags);
  const power = lower(vm.powerState).replace(/^vm\s+/, '');
  if (
    lower(vm.id) !== lower(vmResourceId) ||
    lower(vm.location) !== lower(plan.region) ||
    vm.provisioningState !== 'Succeeded' ||
    !uuid(vm.vmId) ||
    power !== 'running' ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Azure failover VM identity, readiness, or ownership differs');
  return {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: plan.subscription.id,
    region: plan.region,
    engine: plan.engine,
    deploymentId: plan.deploymentName,
    sourcePlanSha256: plan.planSha256,
    nodeIndex,
    vmResourceId,
    vmId: String(vm.vmId),
    powerState: 'running',
    observedAt: new Date().toISOString(),
  };
}
function buildAzureCeFailoverPlan(base, evidence) {
  verifyAzureCePlan(base);
  const vmResourceId = plannedVm(base, evidence.nodeIndex);
  if (
    base.routing.mode !== 'route-server' ||
    !base.topology.ha ||
    base.topology.nodeCount !== 3 ||
    base.intent.ingress?.mode !== 'platform-http' ||
    evidence.schemaVersion !== 1 ||
    evidence.source !== 'azure-cli-live' ||
    evidence.subscriptionId !== base.subscription.id ||
    evidence.region !== base.region ||
    evidence.engine !== base.engine ||
    evidence.deploymentId !== base.deploymentName ||
    evidence.sourcePlanSha256 !== base.planSha256 ||
    lower(evidence.vmResourceId) !== lower(vmResourceId) ||
    !uuid(evidence.vmId) ||
    evidence.powerState !== 'running' ||
    !Number.isFinite(Date.parse(evidence.observedAt))
  )
    throw new Error('Azure failover preparation evidence differs from the owning deployment');
  const draft = {
    schemaVersion: 1,
    engine: base.engine,
    kind: 'azure-ce-failover',
    sourcePlanSha256: base.planSha256,
    nodeIndex: evidence.nodeIndex,
    vmResourceId,
    vmId: evidence.vmId,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAzureCeFailoverPlan(base, failover) {
  const evidence = {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: base.subscription.id,
    region: base.region,
    engine: base.engine,
    deploymentId: base.deploymentName,
    sourcePlanSha256: base.planSha256,
    nodeIndex: failover.nodeIndex,
    vmResourceId: failover.vmResourceId,
    vmId: failover.vmId,
    powerState: 'running',
    observedAt: new Date(0).toISOString(),
  };
  const expected = buildAzureCeFailoverPlan(base, evidence);
  if (canonicalSha256(expected) !== canonicalSha256(failover)) throw new Error('Saved Azure CE failover plan changed');
}
function requireAzureFailoverExecutionContract(base, failover, value) {
  verifyAzureCeFailoverPlan(base, failover);
  const checkpoint = object2(value);
  const binding = azureUpgradeBinding(base);
  const expectedKeys = [
    'contractFingerprint',
    'expectedSessions',
    'interfaces',
    'kind',
    'localAsn',
    'name',
    'owner',
    'remoteAsn',
    'routeServerAddresses',
    'siteName',
    'siteUid',
    'uid',
  ];
  const interfaces = Array.isArray(checkpoint.interfaces) ? checkpoint.interfaces : [];
  const addresses = Array.isArray(checkpoint.routeServerAddresses) ? checkpoint.routeServerAddresses : [];
  if (
    canonicalSha256(Object.keys(checkpoint).sort()) !== canonicalSha256(expectedKeys) ||
    checkpoint.kind !== 'bgp' ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(checkpoint.name) ||
    typeof checkpoint.uid !== 'string' ||
    !checkpoint.uid.trim() ||
    checkpoint.siteName !== base.siteName ||
    typeof checkpoint.siteUid !== 'string' ||
    !checkpoint.siteUid.trim() ||
    canonicalSha256(checkpoint.owner) !== canonicalSha256(binding.owner) ||
    checkpoint.localAsn !== base.routing.localAsn ||
    checkpoint.remoteAsn !== 65515 ||
    checkpoint.expectedSessions !== 6 ||
    interfaces.length !== 3 ||
    interfaces.some(
      (entry, index) =>
        !entry ||
        typeof entry !== 'object' ||
        entry.node !== binding.nodes[index] ||
        typeof entry.interfaceName !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(entry.interfaceName) ||
        entry.interfaceName.includes('__'),
    ) ||
    new Set(interfaces.map((entry) => entry.interfaceName)).size !== 3 ||
    addresses.length !== 2 ||
    new Set(addresses).size !== 2 ||
    addresses.some((address) => typeof address !== 'string' || isIP(address) !== 4) ||
    typeof checkpoint.contractFingerprint !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(checkpoint.contractFingerprint)
  )
    throw new Error('Azure failover routing checkpoint differs from the owning six-session topology');
  return structuredClone(checkpoint);
}
async function optional2(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function observeAzureFailoverVmState(plan, failover, api, signal) {
  verifyAzureCeFailoverPlan(plan, failover);
  signal?.throwIfAborted();
  const execute = async (args) => {
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure failover VM observation unavailable');
    try {
      return object2(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure failover VM observation');
    }
  };
  const account = await execute(['account', 'show']);
  if (
    lower(account.id) !== lower(plan.subscription.id) ||
    lower(account.tenantId) !== lower(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure failover account observation differs from deployment');
  const vm = await execute(['vm', 'show', '--ids', failover.vmResourceId, '--show-details']);
  const tags = object2(vm.tags);
  if (
    lower(vm.id) !== lower(failover.vmResourceId) ||
    lower(vm.location) !== lower(plan.region) ||
    vm.provisioningState !== 'Succeeded' ||
    lower(vm.vmId) !== lower(failover.vmId) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Azure failover VM identity, readiness, or ownership differs');
  const state = lower(vm.powerState).replace(/^vm\s+/, '');
  if (state === 'running' || state === 'deallocated') return state;
  return ['starting', 'stopping', 'deallocating'].includes(state) ? 'pending' : 'unknown';
}
async function collectAzureFailoverAcceptance(base, failover, routingValue, phase, runtime, storage, api, signal) {
  const routing = requireAzureFailoverExecutionContract(base, failover, routingValue);
  if (!['baseline', 'outage', 'recovered'].includes(phase)) throw new Error('Azure failover evidence phase differs');
  const binding = azureUpgradeBinding(base);
  const selectedNode = binding.nodes[failover.nodeIndex - 1];
  const interfaces =
    phase === 'outage' ? routing.interfaces.filter((item) => item.node !== selectedNode) : routing.interfaces;
  const expectedSessions = interfaces.flatMap((item) =>
    routing.routeServerAddresses.map((peerAddress) => ({ ...item, peerAddress })),
  );
  const sessions = await runtime.observeBgpSessions(binding, expectedSessions, signal);
  const routes = await runtime.observeBgpRoutesForNodes(
    binding,
    interfaces.map((item) => item.node),
    signal,
  );
  const cloud = await collectAzureRouteServerFailoverHealth(
    base,
    failover.nodeIndex,
    phase === 'outage' ? 'outage' : 'recovered',
    api,
    signal,
  );
  const trafficObservation = await collectAzureFailoverTraffic(base, failover, phase, storage, api, signal);
  const traffic = trafficObservation.evidence;
  const expected = phase === 'outage' ? 4 : 6;
  if (
    sessions.status !== 'healthy' ||
    sessions.establishedSessions !== expected ||
    sessions.expectedSessions !== expected ||
    routes.status !== 'observed' ||
    routes.nodes.length !== interfaces.length ||
    cloud.status !== 'healthy' ||
    cloud.expectedEstablishedSessions !== expected ||
    traffic.status !== 'healthy' ||
    sessions.contractFingerprint !== routing.contractFingerprint ||
    routes.contractFingerprint !== routing.contractFingerprint
  )
    throw new Error(`Azure failover ${phase} acceptance has not converged`);
  return {
    acceptance: 'passed',
    phase,
    expectedEstablishedSessions: expected,
    sessions,
    effectiveRoutes: routes,
    routeServer: cloud,
    traffic,
    trafficCheckpointKey: trafficObservation.checkpointKey,
    trafficRequestedAt: trafficObservation.requestedAt,
    observedAt: new Date().toISOString(),
  };
}
async function runAzureCeFailover(
  base,
  failover,
  authorizedPlanSha256,
  storage,
  observeVm,
  mutate,
  collect,
  release = async () => {},
  signal,
  polling = {
    attempts: 90,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  base = structuredClone(base);
  failover = structuredClone(failover);
  signal?.throwIfAborted();
  verifyAzureCeFailoverPlan(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256) throw new Error('Exact Azure failover authorization is required');
  if (canonicalSha256(storage.owner) !== canonicalSha256(azureFailoverOwner(base)))
    throw new Error('Only the owning Azure engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Azure failover convergence bounds are invalid');
  const unlock = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const source = await optional2(storage, sourceName);
    if (source === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(source) !== canonicalSha256(failover))
      throw new Error('Saved Azure failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let active = await optional2(storage, checkpointName);
    if (!active) {
      active = {
        schemaVersion: 1,
        engine: base.engine,
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'baseline',
      };
      await storage.write(checkpointName, active);
    }
    active = validateAzureFailoverCheckpoint(base, failover, active);
    const receiptName = `${failover.planId}-receipt.json`;
    const savedReceipt = await optional2(storage, receiptName);
    let receipt = savedReceipt === undefined ? undefined : validateAzureFailoverReceipt(base, failover, savedReceipt);
    if (receipt && !['release', 'complete'].includes(active.phase))
      throw Error('Azure failover receipt precedes durable release');
    if (active.phase === 'complete' && !receipt)
      throw Error('Azure failover complete checkpoint has no durable receipt');
    signal?.throwIfAborted();
    let current = active;
    const save = async (next) => {
      signal?.throwIfAborted();
      current = validateAzureFailoverCheckpoint(base, failover, next);
      await storage.write(checkpointName, current);
      signal?.throwIfAborted();
    };
    const convergeVm = async (expected) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const observed = await observeVm(signal);
        signal?.throwIfAborted();
        if (observed === expected) return;
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Azure failover VM ${expected} convergence deadline exceeded`);
    };
    const change = async (phase, next) => {
      const expected = phase === 'stop' ? 'deallocated' : 'running';
      signal?.throwIfAborted();
      if (!current.pending) {
        const before = await observeVm(signal);
        signal?.throwIfAborted();
        if (before === expected) throw new Error(`Azure failover VM was already ${expected} before authorization`);
        if (before !== (phase === 'stop' ? 'running' : 'deallocated'))
          throw new Error('Azure failover VM state is unavailable');
        await save({
          ...current,
          pending: {
            phase,
            requestSha256: canonicalSha256({ phase, vmResourceId: failover.vmResourceId, vmId: failover.vmId }),
          },
        });
        signal?.throwIfAborted();
        await mutate(phase, signal);
        signal?.throwIfAborted();
      } else {
        const before = await observeVm(signal);
        signal?.throwIfAborted();
        if (before === (phase === 'stop' ? 'running' : 'deallocated')) {
          await mutate(phase, signal);
          signal?.throwIfAborted();
        }
      }
      await convergeVm(expected);
      await save({ ...current, phase: next, pending: undefined });
    };
    const convergeNetwork = async (phase, next) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        signal?.throwIfAborted();
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          signal?.throwIfAborted();
          await save({ ...current, phase: next });
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Azure failover ${phase} convergence deadline exceeded`);
    };
    if (active.phase === 'stop' && !active.pending) await convergeNetwork('baseline', 'stop');
    if (current.phase === 'baseline') await convergeNetwork('baseline', 'stop');
    if (current.phase === 'stop') await change('stop', 'outage');
    if (current.phase === 'outage') await convergeNetwork('outage', 'start');
    if (current.phase === 'start') await change('start', 'recovered');
    if (current.phase === 'recovered') await convergeNetwork('recovered', 'release');
    if (current.phase === 'release') {
      if (!receipt) {
        signal?.throwIfAborted();
        await release(signal);
        signal?.throwIfAborted();
        receipt = validateAzureFailoverReceipt(base, failover, {
          status: 'failover-complete',
          engine: base.engine,
          planId: failover.planId,
          planSha256: failover.planSha256,
          nodeIndex: failover.nodeIndex,
          sessionSequence: [6, 4, 6],
          traffic: 'healthy',
          observedAt: new Date().toISOString(),
        });
        await storage.write(receiptName, receipt);
        signal?.throwIfAborted();
      }
      await save({ ...current, phase: 'complete' });
    }
    if (!receipt) throw Error('Azure failover completion receipt unavailable');
    signal?.throwIfAborted();
    return receipt;
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/terraform-failover.ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

var digest = (value) => createHash('sha256').update(value).digest('hex');
var interruptedApplyMessage = 'Reconcile interrupted Terraform apply before revising configuration';
function configuration(base, failover, phase) {
  const resource =
    phase === 'release'
      ? {}
      : {
          azapi_resource_action: {
            ce_failover: {
              type: 'Microsoft.Compute/virtualMachines@2024-07-01',
              resource_id: failover.vmResourceId,
              action: phase === 'stop' ? 'deallocate' : 'start',
              method: 'POST',
              when: 'apply',
              locks: [failover.vmResourceId],
            },
          },
        };
  return renderTerraformConfigurationJson({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
      },
    },
    provider: { azapi: { subscription_id: base.subscription.id, tenant_id: base.subscription.tenantId } },
    resource,
  });
}
async function azureTerraformFailoverDeployment(base, failover, phase = 'stop') {
  verifyAzureCeFailoverPlan(base, failover);
  if (base.engine !== 'terraform' || failover.engine !== 'terraform')
    throw new Error('Azure Terraform failover requires Terraform ownership');
  const text = configuration(base, failover, phase);
  const stage = `failover-${failover.planSha256.slice(0, 24)}`;
  return {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: base.subscription.id, region: base.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: text,
    providerLock: await readFile(
      new URL('./assets/plugins/azure/terraform/azapi-provider-lock.hcl', import.meta.url),
      'utf8',
    ),
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
  };
}
function validateReceipt(deployment, stage, receipt, final = false) {
  const allowed = stage.phase === 'release' ? ['delete', 'no-op'] : ['create', 'update', 'no-op'];
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    Array.isArray(receipt) ||
    Object.keys(receipt).some(
      (key) =>
        ![
          'schemaVersion',
          'deploymentId',
          'engine',
          'backendIdentity',
          'configurationSha256',
          'providerLockSha256',
          'planSha256',
          'changes',
          'noChanges',
          'actionInvocations',
          'imports',
          'relinquishments',
        ].includes(key),
    ) ||
    receipt.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    typeof receipt.noChanges !== 'boolean' ||
    !Array.isArray(receipt.changes) ||
    [receipt.actionInvocations, receipt.imports, receipt.relinquishments].some(
      (value) => value !== undefined && (!Array.isArray(value) || value.length > 0),
    ) ||
    receipt.changes.some(
      (value) =>
        !value ||
        Object.keys(value).sort().join(',') !== 'actions,address,type' ||
        !Array.isArray(value.actions) ||
        value.actions.length !== 1,
    ) ||
    receipt.noChanges !== receipt.changes.every((value) => value.actions[0] === 'no-op') ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== deployment.deploymentId ||
    receipt.backendIdentity !== deployment.backendIdentity ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    receipt.providerLockSha256 !== digest(deployment.providerLock) ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
    (final
      ? !receipt.noChanges || receipt.changes.length !== 0
      : stage.phase === 'release' && receipt.noChanges && receipt.changes.length === 0
        ? false
        : receipt.changes.length !== 1 ||
          receipt.changes[0].address !== stage.address ||
          receipt.changes[0].type !== 'azapi_resource_action' ||
          receipt.changes[0].actions.length !== 1 ||
          !allowed.includes(receipt.changes[0].actions[0]))
  )
    throw new Error(
      `Azure Terraform failover ${final ? 'final' : stage.phase} plan differs from the exact power action`,
    );
}
async function validateAzureTerraformFailoverPlan(base, failover, phase, input, final = false) {
  if (!['stop', 'start', 'release'].includes(phase) || (final && phase !== 'release'))
    throw Error('Azure Terraform failover plan phase differs');
  const deployment = await azureTerraformFailoverDeployment(base, failover, phase);
  const receipt = structuredClone(input);
  validateReceipt(
    deployment,
    {
      phase,
      configuration: deployment.configuration,
      configurationSha256: digest(deployment.configuration),
      address: 'azapi_resource_action.ce_failover',
    },
    receipt,
    final,
  );
  return receipt;
}
async function optional3(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function createAzureTerraformFailoverController(base, failover, terraform, storage, observeVm, env, signal) {
  const deployments = {
    stop: await azureTerraformFailoverDeployment(base, failover, 'stop'),
    start: await azureTerraformFailoverDeployment(base, failover, 'start'),
    release: await azureTerraformFailoverDeployment(base, failover, 'release'),
  };
  const stages = Object.fromEntries(
    ['stop', 'start', 'release'].map((phase) => [
      phase,
      {
        phase,
        configuration: deployments[phase].configuration,
        configurationSha256: digest(deployments[phase].configuration),
        address: 'azapi_resource_action.ce_failover',
      },
    ]),
  );
  let session;
  try {
    session = await terraform.open(storage.owner, deployments.stop, false, env, signal);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    session = await terraform.open(storage.owner, deployments.stop, 'current', env, signal);
  }
  const currentSha256 = async () => {
    const value = await session.readConfigurationSha256?.();
    if (!value) throw new Error('Terraform failover configuration identity is unavailable');
    return value;
  };
  const settle = async (phase, currentSignal) => {
    const receipt = await optional3(storage, `${failover.planId}-${phase}-plan.json`);
    if (!receipt) return;
    validateReceipt(deployments[phase], stages[phase], receipt);
    if (typeof session.reconcileApplyFromEvidence !== 'function')
      throw new Error('Terraform interrupted failover reconciliation is unavailable');
    await session.reconcileApplyFromEvidence(receipt, canonicalSha256(await observeVm(currentSignal)));
  };
  const select = async (phase, currentSignal) => {
    const desired = stages[phase];
    const current = await currentSha256();
    if (current === desired.configurationSha256) return;
    const predecessor = phase === 'start' ? 'stop' : phase === 'release' ? 'start' : undefined;
    if (!predecessor || current !== stages[predecessor].configurationSha256)
      throw new Error('Terraform failover configuration differs from the exact phase sequence');
    try {
      await session.reviseConfiguration(current, desired.configuration);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== interruptedApplyMessage) throw error;
      await settle(predecessor, currentSignal);
      await session.reviseConfiguration(current, desired.configuration);
    }
  };
  const apply = async (phase, currentSignal) => {
    await select(phase, currentSignal);
    const name = `${failover.planId}-${phase}-plan.json`;
    let receipt = await optional3(storage, name);
    if (!receipt) {
      receipt = await session.plan(env, currentSignal ?? signal);
      validateReceipt(deployments[phase], stages[phase], receipt);
      await storage.write(name, receipt);
    } else validateReceipt(deployments[phase], stages[phase], receipt);
    if (!receipt.noChanges) await session.apply(receipt, env, currentSignal ?? signal);
  };
  const release = async (currentSignal) => {
    await select('release', currentSignal);
    const receipt = await session.plan(env, currentSignal ?? signal);
    validateReceipt(deployments.release, stages.release, receipt);
    await storage.write(`${failover.planId}-release-plan.json`, receipt);
    if (!receipt.noChanges) await session.apply(receipt, env, currentSignal ?? signal);
    const final = await session.plan(env, currentSignal ?? signal);
    validateReceipt(deployments.release, stages.release, final, true);
    await storage.write(`${failover.planId}-final-plan.json`, final);
  };
  return { mutate: apply, release };
}
async function validateAzureTerraformFailoverRetirement(base, failover, input, evidenceSha256) {
  const deployment = await azureTerraformFailoverDeployment(base, failover, 'release');
  const value = input;
  const required = [
    'schemaVersion',
    'status',
    'owner',
    'sourcePlanSha256',
    'failoverPlanSha256',
    'deploymentSha256',
    'evidenceSha256',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => ![...required, 'receipt', 'receiptSha256', 'result'].includes(key)) ||
    value.schemaVersion !== 1 ||
    !['preparing', 'retiring', 'retired'].includes(String(value.status)) ||
    canonicalSha256(value.owner) !== canonicalSha256(azureFailoverOwner(base)) ||
    value.sourcePlanSha256 !== base.planSha256 ||
    value.failoverPlanSha256 !== failover.planSha256 ||
    value.deploymentSha256 !== canonicalSha256(deployment) ||
    typeof value.evidenceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.evidenceSha256) ||
    (evidenceSha256 !== undefined && value.evidenceSha256 !== evidenceSha256)
  )
    throw Error('Failover stage retirement checkpoint differs');
  if (value.status === 'preparing') {
    if (value.receipt !== undefined || value.receiptSha256 !== undefined || value.result !== undefined)
      throw Error('Preparing failover retirement has terminal evidence');
  } else {
    await validateAzureTerraformFailoverPlan(base, failover, 'release', value.receipt, true);
    if (value.receiptSha256 !== canonicalSha256(value.receipt)) throw Error('Failover retirement final digest differs');
    if (value.status === 'retiring' && value.result !== undefined)
      throw Error('Uncommitted failover retirement result');
    if (value.status === 'retired') {
      const result = value.result;
      const { configuration, providerLock, ...identity } = deployment;
      if (
        !result ||
        Object.keys(result).sort().join(',') !==
          'evidenceSha256,finalPlanSha256,independentCleanupSha256,inventorySha256,manifestSha256,retiredArtifacts,status' ||
        result.status !== 'runner-artifacts-retired' ||
        result.evidenceSha256 !== value.evidenceSha256 ||
        result.finalPlanSha256 !== value.receipt.planSha256 ||
        result.manifestSha256 !==
          canonicalSha256({
            ...identity,
            configurationSha256: digest(configuration),
            providerLockSha256: digest(providerLock),
          }) ||
        ![result.inventorySha256, result.independentCleanupSha256].every(
          (sha) => typeof sha === 'string' && /^[a-f0-9]{64}$/.test(sha),
        ) ||
        !Number.isSafeInteger(result.retiredArtifacts) ||
        Number(result.retiredArtifacts) < 0
      )
        throw Error('Failover runner retirement result differs');
    }
  }
  return structuredClone(value);
}

export {
  azureFailoverOwner,
  azureTerraformFailoverDeployment,
  buildAzureCeFailoverPlan,
  collectAzureFailoverAcceptance,
  collectAzureFailoverTraffic,
  createAzureTerraformFailoverController,
  observeAzureFailoverVm,
  observeAzureFailoverVmState,
  requireAzureFailoverExecutionContract,
  runAzureCeFailover,
  validateAzureFailoverCheckpoint,
  validateAzureFailoverReceipt,
  validateAzureFailoverTrafficHistory,
  validateAzureTerraformFailoverPlan,
  validateAzureTerraformFailoverRetirement,
  verifyAzureCeFailoverPlan,
};

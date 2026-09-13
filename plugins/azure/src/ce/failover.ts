import { isIP } from 'node:net';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeOwner, CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { collectAzureRouteServerFailoverHealth } from './route-server-health';
import { azureUpgradeBinding } from './terraform-upgrade';
import { collectAzureTrafficProbe } from './traffic-probe';
import type { AzureCePlan } from './types';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure failover evidence');
  return value as Record<string, unknown>;
};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export interface AzureCeFailoverPlan {
  schemaVersion: 1;
  engine: 'native' | 'terraform';
  kind: 'azure-ce-failover';
  sourcePlanSha256: string;
  nodeIndex: number;
  vmResourceId: string;
  vmId: string;
  planId: string;
  planSha256: string;
}

export interface AzureCeFailoverPreparationEvidence {
  schemaVersion: 1;
  source: 'azure-cli-live';
  subscriptionId: string;
  region: string;
  engine: 'native' | 'terraform';
  deploymentId: string;
  sourcePlanSha256: string;
  nodeIndex: number;
  vmResourceId: string;
  vmId: string;
  powerState: 'running';
  observedAt: string;
}

export interface AzureCeRoutingCheckpoint {
  kind: 'bgp';
  name: string;
  uid: string;
  siteName: string;
  siteUid: string;
  owner: CeOwner;
  localAsn: number;
  remoteAsn: 65515;
  interfaces: Array<{ node: string; interfaceName: string }>;
  expectedSessions: 6;
  routeServerAddresses: [string, string];
  contractFingerprint: string;
}

interface AzureFailoverCheckpoint {
  schemaVersion: 1;
  engine: 'native' | 'terraform';
  sourcePlanSha256: string;
  failoverPlanSha256: string;
  phase: 'baseline' | 'stop' | 'outage' | 'start' | 'recovered' | 'release' | 'complete';
  pending?: { phase: 'stop' | 'start'; requestSha256: string };
}

export function azureFailoverOwner(plan: AzureCePlan): CeOwner {
  verifyAzureCePlan(plan);
  return {
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  };
}

function plannedVm(plan: AzureCePlan, nodeIndex: number): string {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 1 || nodeIndex > plan.topology.nodeCount)
    throw new Error('Azure failover requires an exact planned node index');
  const matches = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === nodeIndex);
  if (matches.length !== 1 || typeof matches[0].resourceId !== 'string')
    throw new Error('Azure failover VM resource identity is unavailable');
  return matches[0].resourceId;
}

export async function observeAzureFailoverVm(
  plan: AzureCePlan,
  nodeIndex: number,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<AzureCeFailoverPreparationEvidence> {
  verifyAzureCePlan(plan);
  signal?.throwIfAborted();
  const run = async (args: string[]) => {
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure failover identity observation unavailable');
    let value: Record<string, unknown>;
    try {
      value = object(JSON.parse(result.stdout));
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
  const tags = object(vm.tags);
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

export function buildAzureCeFailoverPlan(
  base: AzureCePlan,
  evidence: AzureCeFailoverPreparationEvidence,
): AzureCeFailoverPlan {
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
    schemaVersion: 1 as const,
    engine: base.engine,
    kind: 'azure-ce-failover' as const,
    sourcePlanSha256: base.planSha256,
    nodeIndex: evidence.nodeIndex,
    vmResourceId,
    vmId: evidence.vmId,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}

export function verifyAzureCeFailoverPlan(base: AzureCePlan, failover: AzureCeFailoverPlan): void {
  const evidence: AzureCeFailoverPreparationEvidence = {
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

export function requireAzureFailoverExecutionContract(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  value: unknown,
): AzureCeRoutingCheckpoint {
  verifyAzureCeFailoverPlan(base, failover);
  const checkpoint = object(value) as unknown as AzureCeRoutingCheckpoint;
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

async function optional<T>(storage: Pick<CeDeploymentStore, 'read'>, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Revalidate exact Azure VM identity and ownership at each failover mutation boundary. */
export async function observeAzureFailoverVmState(
  plan: AzureCePlan,
  failover: AzureCeFailoverPlan,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<'running' | 'deallocated' | 'pending' | 'unknown'> {
  verifyAzureCeFailoverPlan(plan, failover);
  signal?.throwIfAborted();
  const execute = async (args: string[]) => {
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure failover VM observation unavailable');
    try {
      return object(JSON.parse(result.stdout));
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
  const tags = object(vm.tags);
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

/** Collect fresh platform, Azure Route Server and content-bound traffic evidence for 6 -> 4 -> 6. */
export async function collectAzureFailoverAcceptance(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  routingValue: unknown,
  phase: 'baseline' | 'outage' | 'recovered',
  runtime: Pick<CeRuntime, 'observeBgpSessions' | 'observeBgpRoutesForNodes'>,
  storage: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
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
  const traffic = await collectAzureTrafficProbe(base, storage, api, signal, `${failover.planId}-${phase}-traffic`);
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
    acceptance: 'passed' as const,
    phase,
    expectedEstablishedSessions: expected,
    sessions,
    effectiveRoutes: routes,
    routeServer: cloud,
    traffic,
    observedAt: new Date().toISOString(),
  };
}

/** Execute one Azure outage and recovery with durable intent before every cloud mutation. */
export async function runAzureCeFailover(
  base: AzureCePlan,
  failover: AzureCeFailoverPlan,
  authorizedPlanSha256: string,
  storage: CeDeploymentStore,
  observeVm: (signal?: AbortSignal) => Promise<'running' | 'deallocated' | 'pending' | 'unknown'>,
  mutate: (phase: 'stop' | 'start', signal?: AbortSignal) => Promise<void>,
  collect: (phase: 'baseline' | 'outage' | 'recovered', signal?: AbortSignal) => Promise<{ acceptance?: unknown }>,
  release: (signal?: AbortSignal) => Promise<void> = async () => {},
  signal?: AbortSignal,
  polling: { attempts: number; intervalMs: number; wait(ms: number): Promise<void> } = {
    attempts: 90,
    intervalMs: 10_000,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
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
    const source = await optional<AzureCeFailoverPlan>(storage, sourceName);
    if (source === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(source) !== canonicalSha256(failover))
      throw new Error('Saved Azure failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let active = await optional<AzureFailoverCheckpoint>(storage, checkpointName);
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
    if (
      active.schemaVersion !== 1 ||
      active.engine !== base.engine ||
      active.sourcePlanSha256 !== base.planSha256 ||
      active.failoverPlanSha256 !== failover.planSha256 ||
      !['baseline', 'stop', 'outage', 'start', 'recovered', 'release', 'complete'].includes(active.phase) ||
      (active.pending !== undefined &&
        (active.pending.phase !== active.phase ||
          active.pending.requestSha256 !==
            canonicalSha256({ phase: active.pending.phase, vmResourceId: failover.vmResourceId, vmId: failover.vmId })))
    )
      throw new Error('Azure failover checkpoint differs');
    let current: AzureFailoverCheckpoint = active;
    const save = async (next: AzureFailoverCheckpoint) => {
      current = next;
      await storage.write(checkpointName, current);
    };
    const convergeVm = async (expected: 'running' | 'deallocated') => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        if ((await observeVm(signal)) === expected) return;
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Azure failover VM ${expected} convergence deadline exceeded`);
    };
    const change = async (phase: 'stop' | 'start', next: AzureFailoverCheckpoint['phase']) => {
      const expected = phase === 'stop' ? 'deallocated' : 'running';
      if (!current.pending) {
        const before = await observeVm(signal);
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
        await mutate(phase, signal);
      } else {
        const before = await observeVm(signal);
        if (before === (phase === 'stop' ? 'running' : 'deallocated')) await mutate(phase, signal);
      }
      await convergeVm(expected);
      await save({ ...current, phase: next, pending: undefined });
    };
    const convergeNetwork = async (
      phase: 'baseline' | 'outage' | 'recovered',
      next: AzureFailoverCheckpoint['phase'],
    ) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          await save({ ...current, phase: next });
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Azure failover ${phase} convergence deadline exceeded`);
    };
    if (current.phase === 'baseline') await convergeNetwork('baseline', 'stop');
    if (current.phase === 'stop') await change('stop', 'outage');
    if (current.phase === 'outage') await convergeNetwork('outage', 'start');
    if (current.phase === 'start') await change('start', 'recovered');
    if (current.phase === 'recovered') await convergeNetwork('recovered', 'release');
    if (current.phase === 'release') {
      await release(signal);
      await save({ ...current, phase: 'complete' });
    }
    const receipt = {
      status: 'failover-complete' as const,
      engine: base.engine,
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      sessionSequence: [6, 4, 6] as const,
      traffic: 'healthy' as const,
      observedAt: new Date().toISOString(),
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await unlock();
  }
}

import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';
import { type AwsPowerServiceInventory, validatePowerServiceInventory } from './whole-site-power-service-binding';

export interface AwsPowerBindings {
  sourcePlanSha256: string;
  owner: CeDeploymentStore['owner'];
  nodes: Array<{
    nodeIndex: number;
    nodeName: string;
    siteName: string;
    instanceId: string;
    interfaces: Array<{ index: number; role: string; id: string; mac: string; device: string }>;
  }>;
  /** Digest of the exact owned route/target/listener configuration retained for restoration. */
  servicesSha256: string;
  servicesInventory?: AwsPowerServiceInventory;
}

export interface AwsPowerMaintenance {
  schemaVersion: 1;
  kind: 'aws-ce-stopped';
  sourcePlanSha256: string;
  transitionId: string;
  stopPlanSha256: string;
  bindingsSha256: string;
  stoppedEvidenceSha256: string;
  originalAttemptAt: string;
  observedAt: string;
  receiptSha256: string;
}

export interface AwsWholeSitePowerPlan {
  schemaVersion: 1;
  kind: 'aws-ce-whole-site-power';
  engine: 'native' | 'terraform';
  operation: 'stop' | 'start';
  transitionId: string;
  sourcePlanId: string;
  sourcePlanSha256: string;
  bindings: AwsPowerBindings;
  bindingsSha256: string;
  maintenance?: AwsPowerMaintenance;
  planId: string;
  planSha256: string;
}

type Effect = 'withdraw' | 'stop' | 'start' | 'restore' | 'release';
export type AwsPowerGate = 'ready-to-stop' | 'withdrawn' | 'stopped' | 'ready-to-start' | 'running' | 'restored';

/** Collector time is an observation receipt time, never an original CE heartbeat. */
export interface AwsPowerEvidence {
  source: 'live';
  planSha256: string;
  bindingsSha256: string;
  gate: AwsPowerGate;
  collectedAt: string;
  identity: 'verified' | 'unknown';
  cloud: 'running' | 'stopped' | 'unknown';
  services: 'active' | 'withdrawn' | 'unknown';
  traffic: 'passing' | 'blocked' | 'unknown';
  registration: 'healthy' | 'unknown';
  configuration: 'verified' | 'unknown';
  versions: 'stable' | 'unknown';
  interfaces: 'up' | 'down' | 'unknown';
  canSatisfyInterfaceMutationGate: boolean;
}

/** Only an engine-owned adapter can implement these effects; no caller-supplied evidence is accepted publicly. */
export interface AwsWholeSitePowerDriver {
  engine: 'native' | 'terraform';
  readBindings(signal?: AbortSignal): Promise<AwsPowerBindings>;
  observe(plan: AwsWholeSitePowerPlan, gate: AwsPowerGate, signal?: AbortSignal): Promise<AwsPowerEvidence>;
  execute(plan: AwsWholeSitePowerPlan, effect: Effect, signal?: AbortSignal): Promise<void>;
  reconcile(
    plan: AwsWholeSitePowerPlan,
    effect: Effect,
    originalAttemptAt: string,
    signal?: AbortSignal,
  ): Promise<'completed' | 'pending' | 'unknown' | 'not-submitted'>;
  /** Terraform must release temporary power controls and prove a refresh-enabled no-change plan. */
  finish(
    plan: AwsWholeSitePowerPlan,
    signal?: AbortSignal,
  ): Promise<{ engine: 'native' | 'terraform'; noChanges: true }>;
}

interface Attempt {
  effect: Effect;
  originalAttemptAt: string;
  requestSha256: string;
}
interface PowerCheckpoint {
  schemaVersion: 1;
  planSha256: string;
  bindingsSha256: string;
  step: number;
  attempts: Partial<Record<Effect, Attempt>>;
  pending?: Attempt;
  evidence: Partial<Record<AwsPowerGate, AwsPowerEvidence>>;
  complete: boolean;
}

const sha = /^[a-f0-9]{64}$/;
const sequence = {
  stop: ['ready-to-stop', 'withdraw', 'withdrawn', 'stop', 'stopped'],
  start: ['ready-to-start', 'start', 'running', 'restore', 'restored', 'release'],
} as const;
const effects = new Set<string>(['withdraw', 'stop', 'start', 'restore', 'release']);

function validateBindings(base: AwsCePlan, bindings: AwsPowerBindings): void {
  validatePowerServiceInventory(base, bindings);
  const owner = {
    deploymentId: base.deploymentName,
    engine: base.engine,
    provider: 'aws',
    account: base.accountId,
    region: base.region,
  };
  const expected = siteBindings(base).flatMap(({ site, binding }) =>
    site.nodeIndexes.map((nodeIndex, index) => ({ nodeIndex, nodeName: binding.nodes[index], siteName: site.name })),
  );
  if (
    bindings.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(bindings.owner) !== canonicalSha256(owner) ||
    !sha.test(bindings.servicesSha256) ||
    bindings.nodes.length !== expected.length ||
    new Set(bindings.nodes.map((node) => node.instanceId)).size !== expected.length
  )
    throw new Error('Whole-site power deployment ownership or service binding differs');
  const allInterfaces = bindings.nodes.flatMap((node) => node.interfaces);
  if (
    new Set(allInterfaces.map((item) => item.id)).size !== allInterfaces.length ||
    new Set(allInterfaces.map((item) => item.mac.toLowerCase())).size !== allInterfaces.length
  )
    throw new Error('Whole-site power interface identities are duplicated');
  for (const expectedNode of expected) {
    const matches = bindings.nodes.filter((node) => node.nodeIndex === expectedNode.nodeIndex);
    if (matches.length !== 1) throw new Error('Whole-site power node discovery is incomplete or duplicated');
    const node = matches[0];
    if (
      node.nodeName !== expectedNode.nodeName ||
      node.siteName !== expectedNode.siteName ||
      !/^i-[a-f0-9]{8,17}$/.test(node.instanceId) ||
      node.interfaces.length !== base.interfaces.length
    )
      throw new Error('Whole-site power node or interface cardinality differs');
    for (const expectedInterface of base.interfaces) {
      const items = node.interfaces.filter((item) => item.index === expectedInterface.index);
      if (
        items.length !== 1 ||
        items[0].role !== expectedInterface.role ||
        !/^eni-[a-f0-9]{8,17}$/.test(items[0].id) ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(items[0].mac) ||
        !/^[a-zA-Z0-9_.:-]+$/.test(items[0].device) ||
        (expectedInterface.guestDevice !== undefined && items[0].device !== expectedInterface.guestDevice)
      )
        throw new Error('Whole-site power interface MAC/device/role binding differs or remains unresolved');
    }
  }
}

export function buildAwsWholeSitePowerPlan(
  base: AwsCePlan,
  operation: 'stop' | 'start',
  bindings: AwsPowerBindings,
  transitionId: string,
  maintenance?: AwsPowerMaintenance,
): AwsWholeSitePowerPlan {
  verifyAwsCePlan(base);
  if (base.intent.operation !== 'deploy' || !['stop', 'start'].includes(operation))
    throw new Error('Whole-site power requires the exact original deployment plan');
  validateBindings(base, bindings);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(transitionId))
    throw new Error('Whole-site power requires an immutable transition UUID');
  const bindingsSha256 = canonicalSha256(bindings);
  if (operation === 'start') {
    if (!maintenance) throw new Error('Whole-site start requires the exact verified stopped maintenance receipt');
    const { receiptSha256, ...body } = maintenance;
    if (
      maintenance.schemaVersion !== 1 ||
      maintenance.kind !== 'aws-ce-stopped' ||
      maintenance.sourcePlanSha256 !== base.planSha256 ||
      maintenance.transitionId !== transitionId ||
      maintenance.bindingsSha256 !== bindingsSha256 ||
      !sha.test(maintenance.stopPlanSha256) ||
      !sha.test(maintenance.stoppedEvidenceSha256) ||
      canonicalSha256(body) !== receiptSha256 ||
      !Number.isFinite(Date.parse(maintenance.originalAttemptAt)) ||
      !Number.isFinite(Date.parse(maintenance.observedAt)) ||
      Date.parse(maintenance.observedAt) < Date.parse(maintenance.originalAttemptAt)
    )
      throw new Error('Whole-site start maintenance receipt is malformed or belongs to another deployment');
  } else if (maintenance) throw new Error('Whole-site stop cannot consume an unrelated maintenance receipt');
  const body = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-whole-site-power' as const,
    engine: base.engine,
    operation,
    transitionId,
    sourcePlanId: base.planId,
    sourcePlanSha256: base.planSha256,
    bindings: structuredClone(bindings),
    bindingsSha256,
    ...(maintenance ? { maintenance: structuredClone(maintenance) } : {}),
  };
  const planSha256 = canonicalSha256(body);
  return { ...body, planSha256, planId: `aws-ce-power-${planSha256.slice(0, 24)}` };
}

export function verifyAwsWholeSitePowerPlan(base: AwsCePlan, plan: AwsWholeSitePowerPlan): void {
  const expected = buildAwsWholeSitePowerPlan(base, plan.operation, plan.bindings, plan.transitionId, plan.maintenance);
  if (canonicalSha256(plan) !== canonicalSha256(expected)) throw new Error('Whole-site power immutable plan differs');
}

// Collector receipt-age policy does not establish original CE sample freshness.
export function evidencePasses(
  plan: AwsWholeSitePowerPlan,
  gate: AwsPowerGate,
  value: AwsPowerEvidence,
  now: number,
): boolean {
  if (
    value.source !== 'live' ||
    value.planSha256 !== plan.planSha256 ||
    value.bindingsSha256 !== plan.bindingsSha256 ||
    value.gate !== gate ||
    value.identity !== 'verified' ||
    !Number.isFinite(Date.parse(value.collectedAt)) ||
    Date.parse(value.collectedAt) > now ||
    now - Date.parse(value.collectedAt) > 30_000
  )
    return false;
  if (gate === 'stopped' || gate === 'ready-to-start')
    return value.cloud === 'stopped' && value.services === 'withdrawn' && value.traffic === 'blocked';
  if (gate === 'withdrawn')
    return value.cloud === 'running' && value.services === 'withdrawn' && value.traffic === 'blocked';
  const healthy =
    value.cloud === 'running' &&
    value.registration === 'healthy' &&
    value.configuration === 'verified' &&
    value.versions === 'stable' &&
    value.interfaces === 'up' &&
    value.canSatisfyInterfaceMutationGate === true;
  if (gate === 'running') return healthy && value.services === 'withdrawn';
  return healthy && value.services === 'active' && value.traffic === 'passing';
}

async function optional<T>(storage: CeDeploymentStore, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}

/** Persistent stop and explicit subsequent start; acknowledgements never satisfy an observation gate. */
export async function runAwsWholeSitePower(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorizedPlanSha256: string,
  storage: CeDeploymentStore,
  driver: AwsWholeSitePowerDriver,
  signal?: AbortSignal,
  clock: () => number = Date.now,
) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    authorizedPlanSha256 !== plan.planSha256 ||
    driver.engine !== base.engine ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw new Error('Whole-site power authorization, owning engine or deployment store differs');
  // Existing AWS mutation qualification remains single-node and non-HA.
  if (base.topology.nodeCount !== 1 || plan.bindings.nodes.length !== 1)
    throw new Error('Whole-site power requires a separately qualified multi-node lifecycle contract');
  const release = await acquireProcessLock(`${storage.directory}/.whole-site-power-lock`);
  try {
    await storage.verify();
    if (plan.operation === 'start') {
      const maintenance = plan.maintenance;
      if (!maintenance) throw new Error('Whole-site start maintenance receipt is missing');
      const prior = await storage.read(`aws-ce-power-${maintenance.stopPlanSha256.slice(0, 24)}-maintenance.json`);
      if (canonicalSha256(prior) !== canonicalSha256(plan.maintenance))
        throw new Error('Whole-site start requires the privately retained owning-engine stopped receipt');
    }
    const sourceName = `${plan.planId}.json`;
    const saved = await optional<AwsWholeSitePowerPlan>(storage, sourceName);
    if (saved && canonicalSha256(saved) !== canonicalSha256(plan))
      throw new Error('Saved whole-site power plan differs');
    if (!saved) await storage.write(sourceName, plan);
    const checkpointName = `${plan.planId}-checkpoint.json`;
    const savedCheckpoint = await optional<PowerCheckpoint>(storage, checkpointName);
    const steps = sequence[plan.operation];
    let state: PowerCheckpoint = savedCheckpoint ?? {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      step: 0,
      attempts: {},
      evidence: {},
      complete: false,
    };
    if (!savedCheckpoint) await storage.write(checkpointName, state);
    const now = clock();
    if (
      !Number.isFinite(now) ||
      state.schemaVersion !== 1 ||
      state.planSha256 !== plan.planSha256 ||
      state.bindingsSha256 !== plan.bindingsSha256 ||
      !Number.isInteger(state.step) ||
      state.step < 0 ||
      state.step > steps.length ||
      state.complete !== (state.step === steps.length) ||
      (state.pending && state.pending.effect !== steps[state.step])
    )
      throw new Error('Whole-site power checkpoint differs');
    for (const [effect, attempt] of Object.entries(state.attempts)) {
      if (
        !effects.has(effect) ||
        !steps.some((step) => step === effect) ||
        !attempt ||
        attempt.effect !== effect ||
        attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
        !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
        Date.parse(attempt.originalAttemptAt) > now
      )
        throw new Error('Whole-site power original attempt binding differs');
    }
    for (const completed of steps.slice(0, state.step)) {
      if (effects.has(completed)) {
        if (!state.attempts[completed as Effect])
          throw new Error('Completed whole-site effect lacks an original attempt');
      } else {
        const evidence = state.evidence[completed as AwsPowerGate];
        if (!evidence || !evidencePasses(plan, completed as AwsPowerGate, evidence, Date.parse(evidence.collectedAt)))
          throw new Error('Completed whole-site gate lacks valid bound evidence');
      }
    }
    if (state.pending && canonicalSha256(state.pending) !== canonicalSha256(state.attempts[state.pending.effect]))
      throw new Error('Whole-site power submitted attempt differs');
    const assertCurrentBindings = async () => {
      await storage.verify();
      const current = await driver.readBindings(signal);
      validateBindings(base, current);
      if (canonicalSha256(current) !== plan.bindingsSha256)
        throw new Error('Whole-site power live identities or retained services changed');
    };
    const pending = (reason: string) => ({
      status: 'power-pending' as const,
      reason,
      operation: plan.operation,
      engine: plan.engine,
      planId: plan.planId,
      planSha256: plan.planSha256,
      step: state.step,
      fullCeAcceptance: false as const,
    });
    for (; state.step < steps.length; ) {
      signal?.throwIfAborted();
      await assertCurrentBindings();
      const step = steps[state.step];
      if (effects.has(step)) {
        const effect = step as Effect;
        if (state.pending) {
          let observed = await driver.reconcile(plan, effect, state.pending.originalAttemptAt, signal);
          if (observed === 'not-submitted') {
            // An engine-owned write-ahead dispatch marker proves no provider call occurred.
            // Recheck the gate and reuse the original attempt instead of resetting timing.
            const preceding = [...steps.slice(0, state.step)]
              .reverse()
              .find((value) => !effects.has(value)) as AwsPowerGate;
            const evidence = await driver.observe(plan, preceding, signal);
            if (!evidencePasses(plan, preceding, evidence, clock()))
              return pending(`prerequisite-${preceding}-unknown`);
            await driver.execute(plan, effect, signal);
            observed = await driver.reconcile(plan, effect, state.pending.originalAttemptAt, signal);
          }
          if (observed !== 'completed') return pending(`submitted-${effect}-${observed}`);
          state = { ...state, pending: undefined, step: state.step + 1, complete: state.step + 1 === steps.length };
          await storage.write(checkpointName, state);
          continue;
        }
        // Recollect the prerequisite immediately before each effect; a previously passed gate may have drifted.
        const preceding = [...steps.slice(0, state.step)]
          .reverse()
          .find((value) => !effects.has(value)) as AwsPowerGate;
        const evidence = await driver.observe(plan, preceding, signal);
        if (!evidencePasses(plan, preceding, evidence, clock())) return pending(`prerequisite-${preceding}-unknown`);
        const attempt = {
          effect,
          originalAttemptAt: new Date(clock()).toISOString(),
          requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect }),
        };
        if (state.attempts[effect])
          throw new Error('Whole-site power effect cannot be resubmitted from a prior attempt');
        state = { ...state, pending: attempt, attempts: { ...state.attempts, [effect]: attempt } };
        await storage.write(checkpointName, state);
        await driver.execute(plan, effect, signal);
        // Even an acknowledged effect requires independent reconciliation before proceeding.
        const observed = await driver.reconcile(plan, effect, attempt.originalAttemptAt, signal);
        if (observed !== 'completed') return pending(`submitted-${effect}-${observed}`);
        state = { ...state, pending: undefined, step: state.step + 1 };
      } else {
        const gate = step as AwsPowerGate;
        const evidence = await driver.observe(plan, gate, signal);
        await storage.write(`${plan.planId}-${gate}-last-evidence.json`, evidence);
        if (!evidencePasses(plan, gate, evidence, clock())) return pending(`${gate}-unknown`);
        state = { ...state, step: state.step + 1, evidence: { ...state.evidence, [gate]: evidence } };
      }
      state = { ...state, complete: state.step === steps.length };
      await storage.write(checkpointName, state);
    }
    await assertCurrentBindings();
    const finalGate = plan.operation === 'stop' ? 'stopped' : 'restored';
    const finalEvidence = await driver.observe(plan, finalGate, signal);
    if (!evidencePasses(plan, finalGate, finalEvidence, clock()))
      return pending(`completed-${finalGate}-evidence-unavailable`);
    if (plan.operation === 'stop') {
      const attempt = state.attempts.stop;
      if (!attempt) throw new Error('Whole-site stop original attempt is missing');
      const evidenceName = `${plan.planId}-final-stopped-evidence.json`;
      const captured = (await optional<AwsPowerEvidence>(storage, evidenceName)) ?? finalEvidence;
      if (
        !evidencePasses(plan, 'stopped', captured, Date.parse(captured.collectedAt)) ||
        Date.parse(captured.collectedAt) > clock() ||
        Date.parse(captured.collectedAt) < Date.parse(attempt.originalAttemptAt)
      )
        throw new Error('Retained stopped evidence differs from the original power attempt');
      await storage.write(evidenceName, captured);
      const maintenanceName = `${plan.planId}-maintenance.json`;
      const prior = await optional<AwsPowerMaintenance>(storage, maintenanceName);
      let maintenance: AwsPowerMaintenance;
      if (prior) {
        // Validate the retained receipt using the same rules as a subsequent start.
        buildAwsWholeSitePowerPlan(base, 'start', plan.bindings, plan.transitionId, prior);
        if (
          prior.stopPlanSha256 !== plan.planSha256 ||
          prior.originalAttemptAt !== attempt.originalAttemptAt ||
          prior.stoppedEvidenceSha256 !== canonicalSha256(captured) ||
          prior.observedAt !== captured.collectedAt
        )
          throw new Error('Retained stopped maintenance receipt differs');
        maintenance = prior;
      } else {
        const body = {
          schemaVersion: 1 as const,
          kind: 'aws-ce-stopped' as const,
          sourcePlanSha256: base.planSha256,
          transitionId: plan.transitionId,
          stopPlanSha256: plan.planSha256,
          bindingsSha256: plan.bindingsSha256,
          stoppedEvidenceSha256: canonicalSha256(captured),
          originalAttemptAt: attempt.originalAttemptAt,
          observedAt: captured.collectedAt,
        };
        maintenance = { ...body, receiptSha256: canonicalSha256(body) };
        await storage.write(maintenanceName, maintenance);
      }
      return {
        status: 'site-stopped' as const,
        operation: plan.operation,
        engine: plan.engine,
        planId: plan.planId,
        planSha256: plan.planSha256,
        maintenance,
        evidence: finalEvidence,
        originalCeHeartbeat: 'unknown' as const,
        fullCeAcceptance: false as const,
      };
    }
    const final = await driver.finish(plan, signal);
    if (final.engine !== plan.engine || final.noChanges !== true)
      throw new Error('Whole-site start final owning-engine no-change verification failed');
    return {
      status: 'site-started' as const,
      operation: plan.operation,
      engine: plan.engine,
      planId: plan.planId,
      planSha256: plan.planSha256,
      evidence: finalEvidence,
      noChanges: true,
      originalCeHeartbeat: 'unknown' as const,
      fullCeAcceptance: false as const,
    };
  } finally {
    await release();
  }
}

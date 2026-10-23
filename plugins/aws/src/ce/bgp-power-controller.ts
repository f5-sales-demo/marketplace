import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import type { AwsCePlan } from './types';
import {
  type AwsPowerEvidence,
  type AwsWholeSitePowerPlan,
  evidencePasses,
  verifyAwsWholeSitePowerPlan,
} from './whole-site-power';
import { collectAwsPowerBgpServices } from './whole-site-power-bgp-services';
import { powerServiceComponentSha256 } from './whole-site-power-service-binding';

type Effect = 'withdraw' | 'restore';
type Observation = Awaited<ReturnType<typeof collectAwsPowerBgpServices>>;
type Snapshot = Observation['snapshots'][number];
type PolicyIntent = Parameters<CeRuntime['createPowerRoutingPolicy']>[0];
type Policy = Extract<Awaited<ReturnType<CeRuntime['createPowerRoutingPolicy']>>, { status: 'observed' }>;
async function optional<T>(storage: CeDeploymentStore, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
async function context(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect | 'release',
  storage: CeDeploymentStore,
) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    !['native', 'terraform'].includes(base.engine) ||
    base.topology.nodeCount !== 1 ||
    plan.bindings.nodes.length !== 1 ||
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('Native BGP owner or immutable plan differs');
  const cp = (await storage.read(`${plan.planId}-checkpoint.json`)) as {
    schemaVersion: number;
    planSha256: string;
    bindingsSha256: string;
    step: number;
    complete: boolean;
    pending?: { effect: string; originalAttemptAt: string; requestSha256: string };
    attempts?: Record<string, unknown>;
  };
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : effect === 'restore' ? 3 : 5) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    canonicalSha256(cp.attempts?.[effect]) !== canonicalSha256(attempt) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now()
  )
    throw Error('Native BGP original attempt differs');
  return {
    schemaVersion: 1,
    engine: base.engine,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'bgp'),
    attempt,
  };
}
type Marker = Awaited<ReturnType<typeof context>>;
interface Preparation {
  marker: Marker;
  services: Observation['services'];
  servicesSha256: string;
  snapshots: Snapshot[];
  policies: PolicyIntent[];
}
function filename(plan: AwsWholeSitePowerPlan, effect: Effect, suffix: string) {
  return `${plan.planId}-${effect}-${plan.engine}-bgp-${suffix}.json`;
}
function validatePreparation(prep: Preparation, marker: Marker) {
  if (
    canonicalSha256(prep.marker) !== canonicalSha256(marker) ||
    prep.servicesSha256 !== marker.servicesSha256 ||
    canonicalSha256(prep.services) !== marker.servicesSha256 ||
    prep.services.platform.length !== 1 ||
    prep.snapshots.length !== 1 ||
    prep.policies.length !== 1
  )
    throw Error('Native BGP retained preparation differs');
  const s = prep.services.platform[0],
    snapshot = prep.snapshots[0],
    policy = prep.policies[0];
  if (
    snapshot.kind !== 'bgp' ||
    canonicalSha256(snapshot.binding) !== canonicalSha256(s.binding) ||
    snapshot.name !== s.bgpName ||
    snapshot.uid !== s.bgpUid ||
    snapshot.siteUid !== s.siteUid ||
    snapshot.contractFingerprint !== s.contractFingerprint ||
    !snapshot.resourceVersion ||
    (marker.attempt.effect === 'withdraw' &&
      policy.attemptId !== canonicalSha256({ marker, siteUid: s.siteUid, policy: s.revision.policy })) ||
    canonicalSha256(snapshot.spec) !==
      canonicalSha256(marker.attempt.effect === 'withdraw' ? s.originalSpec : s.revision.bgpSpec) ||
    canonicalSha256(policy.binding) !== canonicalSha256(s.binding) ||
    policy.siteUid !== s.siteUid ||
    policy.name !== s.revision.policy.name ||
    canonicalSha256(policy.spec) !== canonicalSha256(s.revision.policy.spec) ||
    policy.contractFingerprint !== s.contractFingerprint ||
    !/^[a-f0-9]{64}$/.test(policy.attemptId)
  )
    throw Error('Native BGP prepared snapshot or policy differs');
}
async function observe(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  prep?: Preparation,
  signal?: AbortSignal,
) {
  const observed = await collectAwsPowerBgpServices(base, values, api, runtime, signal, prep?.services.platform);
  if (observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'bgp'))
    throw Error('Native BGP service identity differs');
  return observed;
}
function policyDispatch(intent: PolicyIntent) {
  return { ...intent, kind: 'bgp_routing_policy', phase: 'power-policy-create-dispatch' };
}
function replacementDispatch(snapshot: Snapshot) {
  return {
    kind: snapshot.kind,
    name: snapshot.name,
    uid: snapshot.uid,
    siteUid: snapshot.siteUid,
    resourceVersion: snapshot.resourceVersion,
    contractFingerprint: snapshot.contractFingerprint,
    phase: 'power-routing-dispatch',
  };
}
async function policy(
  storage: CeDeploymentStore,
  plan: AwsWholeSitePowerPlan,
  prep: Preparation,
  runtime: CeRuntime,
  submit: boolean,
  signal?: AbortSignal,
): Promise<Policy | undefined> {
  const intent = prep.policies[0],
    name = filename(plan, 'withdraw', 'policy-dispatch'),
    expected = { marker: prep.marker, intent, record: policyDispatch(intent) },
    saved = await optional(storage, name);
  if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
    throw Error('Native BGP policy dispatch differs');
  const createPolicy = (
    plan.engine === 'native' ? runtime.createPowerRoutingPolicy : runtime.createTerraformPowerRoutingPolicy
  ).bind(runtime);
  const result = await createPolicy(
    intent,
    saved !== undefined || !submit ? 'submitted' : 'not-submitted',
    async (record) => {
      if (canonicalSha256(record) !== canonicalSha256(expected.record))
        throw Error('Native BGP policy callback differs');
      await storage.write(name, expected);
    },
    signal,
  );
  if (result.status !== 'observed') return undefined;
  const { status: _status, collectedAt: _time, kind: _kind, uid: _uid, resourceVersion: _rv, ...actualIntent } = result;
  if (canonicalSha256(actualIntent) !== canonicalSha256(intent) || !result.uid || !result.resourceVersion)
    throw Error('Native BGP policy readback differs');
  const receiptName = filename(plan, 'withdraw', 'policy-created'),
    retained = await optional<Policy>(storage, receiptName);
  if (
    retained &&
    (retained.uid !== result.uid ||
      retained.resourceVersion !== result.resourceVersion ||
      canonicalSha256({ ...retained, collectedAt: '' }) !== canonicalSha256({ ...result, collectedAt: '' }))
  )
    throw Error('Native BGP policy created identity changed');
  if (!retained) await storage.write(receiptName, result);
  return retained ?? result;
}
async function retainedStop(base: AwsCePlan, plan: AwsWholeSitePowerPlan, storage: CeDeploymentStore) {
  if (!plan.maintenance) throw Error('Native BGP restoration maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = (await storage.read(`${id}.json`)) as AwsWholeSitePowerPlan;
  verifyAwsWholeSitePowerPlan(base, stop);
  const prep = (await storage.read(filename(stop, 'withdraw', 'preparation'))) as Preparation;
  const outcome = (await storage.read(filename(stop, 'withdraw', 'outcome'))) as {
    marker: Marker;
    observed: Observation;
  };
  validatePreparation(prep, outcome.marker);
  const checkpoint = (await storage.read(`${stop.planId}-checkpoint.json`)) as {
    schemaVersion: number;
    planSha256: string;
    bindingsSha256: string;
    attempts?: Record<string, unknown>;
  };
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== stop.planSha256 ||
    checkpoint.bindingsSha256 !== stop.bindingsSha256 ||
    canonicalSha256(checkpoint.attempts?.withdraw) !== canonicalSha256(prep.marker.attempt)
  )
    throw Error('Native BGP retained original withdrawal attempt differs');

  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256 ||
    outcome.marker.planSha256 !== stop.planSha256 ||
    outcome.marker.bindingsSha256 !== stop.bindingsSha256 ||
    outcome.marker.attempt.effect !== 'withdraw' ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'bgp') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'bgp') ||
    canonicalSha256(outcome.observed.snapshots[0].spec) !== canonicalSha256(prep.services.platform[0].revision.bgpSpec)
  )
    throw Error('Native BGP completed withdrawal differs');
  const created = (await storage.read(filename(stop, 'withdraw', 'policy-created'))) as Policy;
  const { status, collectedAt: _time, kind, uid, resourceVersion, ...intent } = created;
  if (
    status !== 'observed' ||
    kind !== 'bgp_routing_policy' ||
    !uid ||
    !resourceVersion ||
    canonicalSha256(intent) !== canonicalSha256(prep.policies[0])
  )
    throw Error('Native BGP retained created policy differs');
  const creation = await storage.read(filename(stop, 'withdraw', 'policy-dispatch'));
  if (
    canonicalSha256(creation) !==
    canonicalSha256({ marker: prep.marker, intent: prep.policies[0], record: policyDispatch(prep.policies[0]) })
  )
    throw Error('Native BGP retained creation dispatch differs');

  const dispatch = await storage.read(filename(stop, 'withdraw', 'replacement-dispatch'));
  if (
    canonicalSha256(dispatch) !==
    canonicalSha256({
      marker: prep.marker,
      snapshot: prep.snapshots[0],
      desired: prep.services.platform[0].revision.bgpSpec,
      policy: created,
      record: replacementDispatch(prep.snapshots[0]),
    })
  )
    throw Error('Native BGP retained replacement differs');
  return { stop, prep };
}
async function assertNoDispatchWithoutPreparation(
  storage: CeDeploymentStore,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
) {
  for (const suffix of [
    'replacement-dispatch',
    'outcome',
    ...(effect === 'withdraw' ? ['policy-dispatch', 'policy-created'] : []),
  ])
    if ((await optional(storage, filename(plan, effect, suffix))) !== undefined)
      throw Error('Native BGP submitted attempt preparation missing');
}
async function prepare(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  marker: Marker,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
) {
  const saved = await optional<Preparation>(storage, filename(plan, effect, 'preparation'));
  if (!saved) await assertNoDispatchWithoutPreparation(storage, plan, effect);
  const prior = effect === 'restore' ? await retainedStop(base, plan, storage) : undefined;
  if (saved) {
    validatePreparation(saved, marker);
    return { prep: saved, prior };
  }
  const observed = await observe(base, plan, values, api, runtime, prior?.prep, signal);
  if (observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
    throw Error('Native BGP prerequisite pending');
  const policies =
    prior?.prep.policies ??
    observed.services.platform.map((s) => ({
      binding: s.binding,
      siteUid: s.siteUid,
      name: s.revision.policy.name,
      spec: s.revision.policy.spec,
      contractFingerprint: s.contractFingerprint,
      attemptId: canonicalSha256({ marker, siteUid: s.siteUid, policy: s.revision.policy }),
    }));
  const prep = {
    marker,
    services: observed.services,
    servicesSha256: observed.servicesSha256,
    snapshots: observed.snapshots,
    policies,
  };
  validatePreparation(prep, marker);
  signal?.throwIfAborted();
  await storage.write(filename(plan, effect, 'preparation'), prep);
  return { prep, prior };
}
/** Internal owning adapter. Submitted mutations reconcile without replay; operational gates remain the coordinator's responsibility. */
export async function dispatchAwsNativeBgpPower(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  effect: Effect,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<void> {
  if (base.engine !== 'native') throw Error('BGP owning engine differs');
  return dispatchAwsOwnedBgpPower(base, plan, authorization, effect, storage, values, api, runtime, signal);
}
export async function dispatchAwsTerraformBgpPower(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  effect: Effect,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<void> {
  if (base.engine !== 'terraform') throw Error('BGP owning engine differs');
  return dispatchAwsOwnedBgpPower(base, plan, authorization, effect, storage, values, api, runtime, signal);
}
async function dispatchAwsOwnedBgpPower(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  effect: Effect,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<void> {
  if (authorization !== plan.planSha256) throw Error('Native BGP authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-bgp-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage),
      { prep, prior } = await prepare(base, plan, effect, marker, storage, values, api, runtime, signal);
    const created = await policy(
      storage,
      prior?.stop ?? plan,
      prior?.prep ?? prep,
      runtime,
      effect === 'withdraw',
      signal,
    );
    if (!created) throw Error('Native BGP policy creation pending; reconcile original attempt');
    const current = await observe(base, plan, values, api, runtime, prep, signal),
      snapshot = prep.snapshots[0],
      desired =
        effect === 'withdraw' ? prep.services.platform[0].revision.bgpSpec : prep.services.platform[0].originalSpec,
      expected = { marker, snapshot, desired, policy: created, record: replacementDispatch(snapshot) },
      name = filename(plan, effect, 'replacement-dispatch'),
      saved = await optional<{ policy: Policy }>(storage, name);
    // Collection time is not part of immutable policy identity, but retain the original receipt in the dispatch.
    if (saved) expected.policy = saved.policy;
    if (
      saved &&
      canonicalSha256({ ...saved, policy: { ...saved.policy, collectedAt: '' } }) !==
        canonicalSha256({ ...expected, policy: { ...created, collectedAt: '' } })
    )
      throw Error('Native BGP replacement dispatch differs');
    if (saved) {
      if (canonicalSha256(current.snapshots[0].spec) !== canonicalSha256(desired))
        throw Error('Native BGP submitted replacement pending; reconcile original attempt');
      return;
    }
    if (
      canonicalSha256(current.snapshots[0].spec) !== canonicalSha256(snapshot.spec) ||
      current.snapshots[0].resourceVersion !== snapshot.resourceVersion
    )
      throw Error('Native BGP original revision changed');
    await runtime.replacePowerRouting(
      { ...snapshot, kind: 'bgp' },
      desired,
      async (record) => {
        if (canonicalSha256(record) !== canonicalSha256(expected.record))
          throw Error('Native BGP replacement callback differs');
        await storage.write(name, expected);
      },
      signal,
    );
  } finally {
    await release();
  }
}
export async function reconcileAwsNativeBgpPower(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'not-submitted'> {
  if (base.engine !== 'native') throw Error('BGP owning engine differs');
  return reconcileAwsOwnedBgpPower(base, plan, effect, originalAttemptAt, storage, values, api, runtime, signal);
}
export async function reconcileAwsTerraformBgpPower(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'not-submitted'> {
  if (base.engine !== 'terraform') throw Error('BGP owning engine differs');
  return reconcileAwsOwnedBgpPower(base, plan, effect, originalAttemptAt, storage, values, api, runtime, signal);
}
async function reconcileAwsOwnedBgpPower(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'not-submitted'> {
  const release = await acquireProcessLock(`${storage.directory}/.native-bgp-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    if (marker.attempt.originalAttemptAt !== originalAttemptAt) throw Error('Native BGP original attempt differs');
    const prep = await optional<Preparation>(storage, filename(plan, effect, 'preparation'));
    if (!prep) {
      await assertNoDispatchWithoutPreparation(storage, plan, effect);
      return 'not-submitted';
    }
    validatePreparation(prep, marker);
    const prior = effect === 'restore' ? await retainedStop(base, plan, storage) : undefined;
    const created = await policy(storage, prior?.stop ?? plan, prior?.prep ?? prep, runtime, false, signal);
    const dispatch = await optional<{ policy: Policy }>(storage, filename(plan, effect, 'replacement-dispatch'));
    if (!dispatch) {
      const submitted = await optional(storage, filename(prior?.stop ?? plan, 'withdraw', 'policy-dispatch'));
      return submitted && !created ? 'pending' : 'not-submitted';
    }
    if (!created) throw Error('Native BGP retained policy missing');
    const desired =
      effect === 'withdraw' ? prep.services.platform[0].revision.bgpSpec : prep.services.platform[0].originalSpec;
    if (
      canonicalSha256({ ...dispatch, policy: { ...dispatch.policy, collectedAt: '' } }) !==
      canonicalSha256({
        marker,
        snapshot: prep.snapshots[0],
        desired,
        policy: { ...created, collectedAt: '' },
        record: replacementDispatch(prep.snapshots[0]),
      })
    )
      throw Error('Native BGP replacement dispatch differs');
    const observed = await observe(base, plan, values, api, runtime, prep, signal);
    if (
      canonicalSha256(observed.snapshots[0].spec) !== canonicalSha256(desired) ||
      observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')
    )
      return 'pending';
    await storage.write(filename(plan, effect, 'outcome'), { marker, observed, collectedAt: new Date().toISOString() });
    return 'completed';
  } finally {
    await release();
  }
}

/** Retire only after the owning coordinator's restored gate and independent original-BGP membership readback. */
export async function retireAwsNativeBgpPowerPolicy(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending'> {
  if (base.engine !== 'native') throw Error('BGP owning engine differs');
  return retireAwsOwnedBgpPowerPolicy(base, plan, authorization, storage, values, api, runtime, signal);
}
export async function retireAwsTerraformBgpPowerPolicy(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending'> {
  if (base.engine !== 'terraform') throw Error('BGP owning engine differs');
  return retireAwsOwnedBgpPowerPolicy(base, plan, authorization, storage, values, api, runtime, signal);
}
async function retireAwsOwnedBgpPowerPolicy(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending'> {
  if (authorization !== plan.planSha256) throw Error('Native BGP retirement authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-bgp-power-lock`);
  try {
    const marker = await context(base, plan, 'release', storage),
      prior = await retainedStop(base, plan, storage);
    if (
      canonicalSha256(await storage.read(`${prior.stop.planId}-maintenance.json`)) !== canonicalSha256(plan.maintenance)
    )
      throw Error('Native BGP retained maintenance differs');
    const cp = (await storage.read(`${plan.planId}-checkpoint.json`)) as { evidence?: { restored?: AwsPowerEvidence } };
    const currentGate = (await storage.read(`${plan.planId}-restored-last-evidence.json`)) as AwsPowerEvidence;
    if (
      !cp.evidence?.restored ||
      !evidencePasses(plan, 'restored', cp.evidence.restored, Date.now()) ||
      !evidencePasses(plan, 'restored', currentGate, Date.now())
    )
      throw Error('Native BGP restored gate unavailable');
    const prep = (await storage.read(filename(plan, 'restore', 'preparation'))) as Preparation;
    const outcome = (await storage.read(filename(plan, 'restore', 'outcome'))) as {
      marker: Marker;
      observed: Observation;
    };
    validatePreparation(prep, outcome.marker);
    if (
      outcome.marker.planSha256 !== plan.planSha256 ||
      outcome.marker.bindingsSha256 !== plan.bindingsSha256 ||
      outcome.marker.attempt.effect !== 'restore' ||
      outcome.observed.status !== 'active' ||
      outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'bgp') ||
      canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'bgp')
    )
      throw Error('Native BGP retained restored outcome differs');
    const created = (await storage.read(filename(prior.stop, 'withdraw', 'policy-created'))) as Policy;
    const restoredDispatch = await storage.read(filename(plan, 'restore', 'replacement-dispatch'));
    if (
      canonicalSha256(restoredDispatch) !==
      canonicalSha256({
        marker: prep.marker,
        snapshot: prep.snapshots[0],
        desired: prep.services.platform[0].originalSpec,
        policy: created,
        record: replacementDispatch(prep.snapshots[0]),
      })
    )
      throw Error('Native BGP retained restoration dispatch differs');
    const observed = await observe(base, plan, values, api, runtime, prep, signal);
    if (
      observed.status !== 'active' ||
      canonicalSha256(observed.snapshots[0].spec) !== canonicalSha256(prep.services.platform[0].originalSpec)
    )
      return 'pending';
    const { status: _status, collectedAt: _time, kind: _kind, ...snapshot } = created;
    const record = { ...snapshot, kind: 'bgp_routing_policy', phase: 'power-policy-delete-dispatch' },
      expected = { marker, snapshot, record },
      name = filename(plan, 'restore', 'policy-delete-dispatch'),
      saved = await optional(storage, name);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
      throw Error('Native BGP retirement dispatch differs');
    const deletePolicy = (
      plan.engine === 'native' ? runtime.deletePowerRoutingPolicy : runtime.deleteTerraformPowerRoutingPolicy
    ).bind(runtime);
    const result = await deletePolicy(
      snapshot,
      saved === undefined ? 'not-submitted' : 'submitted',
      async (actual) => {
        if (canonicalSha256(actual) !== canonicalSha256(record)) throw Error('Native BGP retirement callback differs');
        await storage.write(name, expected);
      },
      signal,
    );
    if (
      canonicalSha256({ ...result, status: undefined, collectedAt: undefined }) !==
      canonicalSha256({ ...snapshot, status: undefined, collectedAt: undefined })
    )
      throw Error('Native BGP retirement readback differs');
    await storage.write(filename(plan, 'restore', 'policy-retirement-outcome'), { marker, result, observed });
    return result.status === 'deleted' ? 'completed' : 'pending';
  } finally {
    await release();
  }
}

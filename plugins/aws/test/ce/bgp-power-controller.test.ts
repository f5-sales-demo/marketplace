import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import {
  dispatchAwsNativeBgpPower,
  dispatchAwsTerraformBgpPower,
  reconcileAwsNativeBgpPower,
  reconcileAwsTerraformBgpPower,
  retireAwsNativeBgpPowerPolicy,
  retireAwsTerraformBgpPowerPolicy,
} from '../../src/ce/bgp-power-controller';
import { canonicalSha256 } from '../../src/ce/canonical';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { collectAwsPowerBgpServices } from '../../src/ce/whole-site-power-bgp-services';
import { continueAwsPowerServices, reconcileAwsPowerServices } from '../../src/ce/whole-site-power-service-controller';
import { collectAwsPowerServiceInventory } from '../../src/ce/whole-site-power-service-inventory';
import { bgpPowerFixture } from './whole-site-power-bgp-fixtures';
import { nlbPowerFixture } from './whole-site-power-nlb-fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const d of directories.splice(0)) await rm(d, { recursive: true });
});
export async function bgpControllerFixture(
  engine: 'native' | 'terraform' = 'native',
  composed: boolean | 'combined' = false,
) {
  const f = bgpPowerFixture(engine);
  let nlb: Awaited<ReturnType<typeof nlbPowerFixture>> | undefined;
  let nlbSubmissions = 0;
  if (composed === 'combined') {
    nlb = await nlbPowerFixture(engine);
    const original = f.api.exec;
    const oldSha = f.base.planSha256;
    const { planId: _id, planSha256: _sha, ...body } = f.base;
    body.intent = { ...body.intent, ingress: nlb.base.intent.ingress };
    const sha = canonicalSha256(body);
    f.base = { ...body, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
    Object.assign(f.values, nlb.values);
    f.api.exec = async (command, args) => {
      if (args[1] === 'deregister-targets') {
        nlbSubmissions++;
        nlb?.membership([]);
        throw Error('lost NLB response');
      }
      const result = await (args[0] === 'elbv2'
        ? nlb
          ? nlb.api.exec(command, args)
          : Promise.reject(Error('Fixture NLB missing'))
        : original(command, args));
      return {
        ...result,
        stdout: result.stdout.replaceAll(oldSha, sha).replaceAll(nlb?.base.planSha256 ?? 'fixture-missing', sha),
      };
    };
  }
  const observed = await collectAwsPowerBgpServices(f.base, f.values, f.api, f.runtime);
  const inventory = composed ? await collectAwsPowerServiceInventory(f.base, f.values, f.api, f.runtime) : undefined;
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: f.binding.owner,
    nodes: [
      {
        nodeIndex: 1,
        nodeName: 'ce-1',
        siteName: 'site-a',
        instanceId: f.values.__INSTANCE_1__,
        interfaces: [0, 1].map((index) => ({
          index,
          role: index ? 'sli' : 'slo',
          id: f.values[`__ENI_1_${index}__`],
          mac: f.values[`__ENI_1_${index}_MAC__`],
          device: index ? 'ens6' : 'ens5',
        })),
      },
    ],
    servicesSha256: inventory?.servicesSha256 ?? observed.servicesSha256,
    ...(inventory ? { servicesInventory: inventory.services } : {}),
  };
  const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
  const directory = await mkdtemp(join(tmpdir(), 'native-bgp-power-'));
  directories.push(directory);
  const storage = await CeDeploymentStore.open(directory, bindings.owner);
  const attempt = {
    effect: 'withdraw',
    originalAttemptAt: new Date(Date.now() - 1000).toISOString(),
    requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect: 'withdraw' }),
  };
  await storage.write(`${plan.planId}.json`, plan);
  await storage.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: 1,
    complete: false,
    pending: attempt,
    attempts: { withdraw: attempt },
  });
  let policy: Record<string, unknown> | undefined,
    loseCreate = false,
    loseReplace = false,
    stall = false,
    stallReplace = false;
  const mutations: string[] = [];
  f.runtime.createPowerRoutingPolicy = async (intent, disposition, checkpoint) => {
    if (!policy && disposition === 'not-submitted') {
      await checkpoint({ ...intent, kind: 'bgp_routing_policy', phase: 'power-policy-create-dispatch' });
      mutations.push('POST');
      if (!stall)
        policy = {
          ...intent,
          kind: 'bgp_routing_policy',
          uid: 'policy-one',
          resourceVersion: 'p1',
          status: 'observed',
          collectedAt: new Date().toISOString(),
        };
      if (loseCreate) throw Error('lost create response');
    }
    return (policy ?? { ...intent, status: 'pending', collectedAt: new Date().toISOString() }) as Awaited<
      ReturnType<typeof f.runtime.createPowerRoutingPolicy>
    >;
  };
  f.runtime.replacePowerRouting = async (snapshot, desired, checkpoint) => {
    await checkpoint({
      kind: snapshot.kind,
      name: snapshot.name,
      uid: snapshot.uid,
      siteUid: snapshot.siteUid,
      resourceVersion: snapshot.resourceVersion,
      contractFingerprint: snapshot.contractFingerprint,
      phase: 'power-routing-dispatch',
    });
    mutations.push('PUT');
    if (!stallReplace) {
      const current = f.snapshot(snapshot.name);
      current.spec = structuredClone(desired);
      current.resourceVersion = 'v2';
    }
    if (loseReplace) throw Error('lost replace response');
  };
  if (engine === 'terraform') {
    f.runtime.createTerraformPowerRoutingPolicy = f.runtime.createPowerRoutingPolicy;
  }
  return {
    ...f,
    plan,
    storage,
    attempt,
    mutations,
    nlbSubmissions: () => nlbSubmissions,
    dispatch: () =>
      (engine === 'native' ? dispatchAwsNativeBgpPower : dispatchAwsTerraformBgpPower)(
        f.base,
        plan,
        plan.planSha256,
        'withdraw',
        storage,
        f.values,
        f.api,
        f.runtime,
      ),
    reconcile: () =>
      (engine === 'native' ? reconcileAwsNativeBgpPower : reconcileAwsTerraformBgpPower)(
        f.base,
        plan,
        'withdraw',
        attempt.originalAttemptAt,
        storage,
        f.values,
        f.api,
        f.runtime,
      ),
    loseCreate: () => {
      loseCreate = true;
    },
    loseReplace: () => {
      loseReplace = true;
    },
    stall: () => {
      stall = true;
    },
    stallReplace: () => {
      stallReplace = true;
    },
  };
}
test('native BGP write-ahead creation and replacement require independent membership convergence', async () => {
  const f = await bgpControllerFixture();
  expect(await f.reconcile()).toBe('not-submitted');
  await f.dispatch();
  expect(f.mutations).toEqual(['POST', 'PUT']);
  expect(await f.reconcile()).toBe('pending');
  f.withdraw();
  expect(await f.reconcile()).toBe('completed');
  const outcome = (await f.storage.read(`${f.plan.planId}-withdraw-native-bgp-outcome.json`)) as {
    observed: { freshness: string; traffic: string };
  };
  expect(outcome.observed.freshness).toBe('unqualified');
  expect(outcome.observed.traffic).toBe('unknown');
  await f.dispatch();
  expect(f.mutations).toEqual(['POST', 'PUT']);
});
test('lost policy creation resumes using the same attempt without replaying POST', async () => {
  const f = await bgpControllerFixture();
  f.loseCreate();
  await expect(f.dispatch()).rejects.toThrow('lost create');
  await f.dispatch();
  expect(f.mutations).toEqual(['POST', 'PUT']);
});
test('lost BGP replacement reconciles without repeating PUT', async () => {
  const f = await bgpControllerFixture();
  f.loseReplace();
  await expect(f.dispatch()).rejects.toThrow('lost replace');
  await f.dispatch();
  f.withdraw();
  expect(await f.reconcile()).toBe('completed');
  expect(f.mutations).toEqual(['POST', 'PUT']);
});
test('ambiguous absent creation remains pending without replay', async () => {
  const f = await bgpControllerFixture();
  f.stall();
  await expect(f.dispatch()).rejects.toThrow('pending');
  await expect(f.dispatch()).rejects.toThrow('pending');
  expect(await f.reconcile()).toBe('pending');
  expect(f.mutations).toEqual(['POST']);
});
test('changed original attempt or saved preparation rejects before replay', async () => {
  const f = await bgpControllerFixture();
  await f.dispatch();
  const name = `${f.plan.planId}-withdraw-native-bgp-preparation.json`;
  const prep = (await f.storage.read(name)) as Record<string, unknown>;
  await f.storage.write(name, { ...prep, servicesSha256: 'f'.repeat(64) });
  await expect(f.dispatch()).rejects.toThrow();
  expect(f.mutations).toEqual(['POST', 'PUT']);
});
test('wrong authorization and missing checkpoint reject before any mutation', async () => {
  const f = await bgpControllerFixture();
  await expect(
    dispatchAwsNativeBgpPower(f.base, f.plan, 'f'.repeat(64), 'withdraw', f.storage, f.values, f.api, f.runtime),
  ).rejects.toThrow('authorization');
  await f.storage.write(`${f.plan.planId}-checkpoint.json`, { schemaVersion: 1 });
  await expect(f.dispatch()).rejects.toThrow();
  expect(f.mutations).toEqual([]);
});

test('completed policy creation with no BGP dispatch permits the next original-attempt stage', async () => {
  const f = await bgpControllerFixture();
  f.loseCreate();
  await expect(f.dispatch()).rejects.toThrow('lost create');
  expect(await f.reconcile()).toBe('not-submitted');
  await f.dispatch();
  expect(f.mutations).toEqual(['POST', 'PUT']);
});

for (const engine of ['native', 'terraform'] as const)
  test(`${engine} restoration requires retained withdrawal and restores the exact original object without new policy creation`, async () => {
    const f = await bgpControllerFixture(engine);
    await f.dispatch();
    f.withdraw();
    expect(await f.reconcile()).toBe('completed');
    const body = {
      schemaVersion: 1 as const,
      kind: 'aws-ce-stopped' as const,
      sourcePlanSha256: f.base.planSha256,
      transitionId: f.plan.transitionId,
      stopPlanSha256: f.plan.planSha256,
      bindingsSha256: f.plan.bindingsSha256,
      stoppedEvidenceSha256: 'a'.repeat(64),
      originalAttemptAt: f.attempt.originalAttemptAt,
      observedAt: new Date().toISOString(),
    };
    const maintenance = { ...body, receiptSha256: canonicalSha256(body) };
    const start = buildAwsWholeSitePowerPlan(f.base, 'start', f.plan.bindings, f.plan.transitionId, maintenance);
    await f.storage.write(`${f.plan.planId}-maintenance.json`, maintenance);
    const attempt = {
      effect: 'restore',
      originalAttemptAt: new Date().toISOString(),
      requestSha256: canonicalSha256({ planSha256: start.planSha256, effect: 'restore' }),
    };
    await f.storage.write(`${start.planId}.json`, start);
    await f.storage.write(`${start.planId}-checkpoint.json`, {
      schemaVersion: 1,
      planSha256: start.planSha256,
      bindingsSha256: start.bindingsSha256,
      step: 3,
      complete: false,
      pending: attempt,
      attempts: { restore: attempt },
    });
    await (engine === 'native' ? dispatchAwsNativeBgpPower : dispatchAwsTerraformBgpPower)(
      f.base,
      start,
      start.planSha256,
      'restore',
      f.storage,
      f.values,
      f.api,
      f.runtime,
    );
    expect(f.mutations).toEqual(['POST', 'PUT', 'PUT']);
    expect(
      await (engine === 'native' ? reconcileAwsNativeBgpPower : reconcileAwsTerraformBgpPower)(
        f.base,
        start,
        'restore',
        attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
        f.runtime,
      ),
    ).toBe('pending');
    f.restore();
    expect(
      await (engine === 'native' ? reconcileAwsNativeBgpPower : reconcileAwsTerraformBgpPower)(
        f.base,
        start,
        'restore',
        attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
        f.runtime,
      ),
    ).toBe('completed');
    await (engine === 'native' ? dispatchAwsNativeBgpPower : dispatchAwsTerraformBgpPower)(
      f.base,
      start,
      start.planSha256,
      'restore',
      f.storage,
      f.values,
      f.api,
      f.runtime,
    );
    expect(f.mutations).toEqual(['POST', 'PUT', 'PUT']);
    const releaseAttempt = {
      effect: 'release',
      originalAttemptAt: new Date().toISOString(),
      requestSha256: canonicalSha256({ planSha256: start.planSha256, effect: 'release' }),
    };
    const evidence = {
      source: 'live',
      planSha256: start.planSha256,
      bindingsSha256: start.bindingsSha256,
      gate: 'restored',
      collectedAt: new Date().toISOString(),
      identity: 'verified',
      cloud: 'running',
      services: 'active',
      traffic: 'passing',
      registration: 'healthy',
      configuration: 'verified',
      versions: 'stable',
      interfaces: 'up',
      canSatisfyInterfaceMutationGate: true,
    };
    await f.storage.write(`${start.planId}-checkpoint.json`, {
      schemaVersion: 1,
      planSha256: start.planSha256,
      bindingsSha256: start.bindingsSha256,
      step: 5,
      complete: false,
      pending: releaseAttempt,
      attempts: { restore: attempt, release: releaseAttempt },
      evidence: { restored: evidence },
    });
    await f.storage.write(`${start.planId}-restored-last-evidence.json`, { ...evidence, traffic: 'unknown' });
    let deleted = false;
    f.runtime.deletePowerRoutingPolicy = async (snapshot, disposition, checkpoint) => {
      if (!deleted && disposition === 'not-submitted') {
        await checkpoint({ ...snapshot, kind: 'bgp_routing_policy', phase: 'power-policy-delete-dispatch' });
        f.mutations.push('DELETE');
        deleted = true;
        throw Error('lost delete response');
      }
      return { ...snapshot, status: deleted ? 'deleted' : 'pending', collectedAt: new Date().toISOString() };
    };
    if (engine === 'terraform') f.runtime.deleteTerraformPowerRoutingPolicy = f.runtime.deletePowerRoutingPolicy;
    await expect(
      (engine === 'native' ? retireAwsNativeBgpPowerPolicy : retireAwsTerraformBgpPowerPolicy)(
        f.base,
        start,
        start.planSha256,
        f.storage,
        f.values,
        f.api,
        f.runtime,
      ),
    ).rejects.toThrow('restored gate');
    expect(f.mutations).toEqual(['POST', 'PUT', 'PUT']);
    await f.storage.write(`${start.planId}-restored-last-evidence.json`, evidence);
    await expect(
      (engine === 'native' ? retireAwsNativeBgpPowerPolicy : retireAwsTerraformBgpPowerPolicy)(
        f.base,
        start,
        start.planSha256,
        f.storage,
        f.values,
        f.api,
        f.runtime,
      ),
    ).rejects.toThrow('lost delete');
    expect(
      await (engine === 'native' ? retireAwsNativeBgpPowerPolicy : retireAwsTerraformBgpPowerPolicy)(
        f.base,
        start,
        start.planSha256,
        f.storage,
        f.values,
        f.api,
        f.runtime,
      ),
    ).toBe('completed');
    expect(f.mutations).toEqual(['POST', 'PUT', 'PUT', 'DELETE']);
  });

test('policy retirement rejects missing restored operational and traffic evidence before DELETE', async () => {
  const f = await bgpControllerFixture();
  await f.dispatch();
  await expect(
    retireAwsNativeBgpPowerPolicy(f.base, f.plan, f.plan.planSha256, f.storage, f.values, f.api, f.runtime),
  ).rejects.toThrow();
  expect(f.mutations).toEqual(['POST', 'PUT']);
});

test('submitted stalled replacement remains pending and never repeats PUT', async () => {
  const f = await bgpControllerFixture();
  f.stallReplace();
  await f.dispatch();
  expect(await f.reconcile()).toBe('pending');
  await expect(f.dispatch()).rejects.toThrow('submitted replacement pending');
  expect(f.mutations).toEqual(['POST', 'PUT']);
});
test('concurrent dispatch and foreign current identity preserve one original mutation pair', async () => {
  const f = await bgpControllerFixture();
  const results = await Promise.allSettled([f.dispatch(), f.dispatch()]);
  expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
  expect(f.mutations).toEqual(['POST', 'PUT']);
  f.snapshot(f.wire.bgp.name).uid = 'foreign';
  await expect(f.reconcile()).rejects.toThrow();
  expect(f.mutations).toEqual(['POST', 'PUT']);
});
test('reconciliation cannot reset the original attempt timestamp', async () => {
  const f = await bgpControllerFixture();
  await f.dispatch();
  await expect(
    reconcileAwsNativeBgpPower(
      f.base,
      f.plan,
      'withdraw',
      new Date().toISOString(),
      f.storage,
      f.values,
      f.api,
      f.runtime,
    ),
  ).rejects.toThrow('original attempt');
  expect(f.mutations).toEqual(['POST', 'PUT']);
});

test('missing preparation with an existing mutation marker cannot claim not-submitted', async () => {
  const f = await bgpControllerFixture();
  await f.dispatch();
  await f.storage.remove(`${f.plan.planId}-withdraw-native-bgp-preparation.json`);
  await expect(f.reconcile()).rejects.toThrow('preparation');
  expect(f.mutations).toEqual(['POST', 'PUT']);
});

test('tampered policy and replacement markers reject without replay', async () => {
  for (const suffix of ['policy-dispatch', 'replacement-dispatch']) {
    const f = await bgpControllerFixture();
    await f.dispatch();
    const name = `${f.plan.planId}-withdraw-native-bgp-${suffix}.json`;
    const saved = (await f.storage.read(name)) as Record<string, unknown>;
    await f.storage.write(name, { ...saved, marker: { foreign: true } });
    await expect(f.reconcile()).rejects.toThrow();
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.mutations).toEqual(['POST', 'PUT']);
  }
});

test('Terraform BGP controller preserves owning engine and journals policy, BGP and cloud membership', async () => {
  const f = await bgpControllerFixture('terraform');
  await expect(
    dispatchAwsNativeBgpPower(f.base, f.plan, f.plan.planSha256, 'withdraw', f.storage, f.values, f.api, f.runtime),
  ).rejects.toThrow('engine');
  expect(await f.reconcile()).toBe('not-submitted');
  await f.dispatch();
  expect(await f.reconcile()).toBe('pending');
  f.withdraw();
  expect(await f.reconcile()).toBe('completed');
  await f.dispatch();
  expect(f.mutations).toEqual(['POST', 'PUT']);
  const prep = (await f.storage.read(`${f.plan.planId}-withdraw-terraform-bgp-preparation.json`)) as {
    marker: { engine: string };
  };
  expect(prep.marker.engine).toBe('terraform');
});
test('Terraform BGP lost creation continues without replaying the provider request', async () => {
  const f = await bgpControllerFixture('terraform');
  f.loseCreate();
  await expect(f.dispatch()).rejects.toThrow('lost create');
  expect(await f.reconcile()).toBe('not-submitted');
  await f.dispatch();
  expect(f.mutations).toEqual(['POST', 'PUT']);
});

for (const engine of ['native', 'terraform'] as const)
  test(`${engine} BGP controller consumes complete inventory without replacing original attempt`, async () => {
    const f = await bgpControllerFixture(engine, true);
    expect(await f.reconcile()).toBe('not-submitted');
    await f.dispatch();
    f.withdraw();
    expect(await f.reconcile()).toBe('completed');
    await f.dispatch();
    expect(f.mutations).toEqual(['POST', 'PUT']);
    const outcome = (await f.storage.read(`${f.plan.planId}-withdraw-${engine}-bgp-outcome.json`)) as {
      marker: { planSha256: string; bindingsSha256: string; servicesSha256: string; attempt: unknown };
    };
    expect(outcome.marker.planSha256).toBe(f.plan.planSha256);
    expect(outcome.marker.bindingsSha256).toBe(f.plan.bindingsSha256);
    expect(outcome.marker.servicesSha256).toBe(f.plan.bindings.servicesInventory?.components[0].servicesSha256);
    expect(outcome.marker.attempt).toEqual(f.attempt);
  });

test('combined BGP/NLB continuation preserves completed BGP and lost NLB original attempt', async () => {
  const f = await bgpControllerFixture('native', 'combined');
  const continueServices = () =>
    continueAwsPowerServices(
      f.base,
      f.plan,
      'withdraw',
      f.attempt.originalAttemptAt,
      f.storage,
      f.values,
      f.api,
      f.runtime,
    );
  expect(await continueServices()).toBe('pending');
  expect(f.mutations).toEqual(['POST', 'PUT']);
  expect(f.nlbSubmissions()).toBe(0);
  f.withdraw();
  await expect(continueServices()).rejects.toThrow('lost NLB response');
  expect(f.nlbSubmissions()).toBe(1);
  expect(
    await reconcileAwsPowerServices(
      f.base,
      f.plan,
      'withdraw',
      f.attempt.originalAttemptAt,
      f.storage,
      f.values,
      f.api,
      f.runtime,
    ),
  ).toBe('completed');
  expect(await continueServices()).toBe('completed');
  expect(f.mutations).toEqual(['POST', 'PUT']);
  expect(f.nlbSubmissions()).toBe(1);
});
for (const engine of ['native', 'terraform'] as const)
  test(`${engine} BGP service coordinator never resets or replays completed attempt`, async () => {
    const f = await bgpControllerFixture(engine, true);
    const continueServices = () =>
      continueAwsPowerServices(
        f.base,
        f.plan,
        'withdraw',
        f.attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
        f.runtime,
      );
    expect(await continueServices()).toBe('pending');
    f.withdraw();
    expect(await continueServices()).toBe('completed');
    expect(await continueServices()).toBe('completed');
    expect(f.mutations).toEqual(['POST', 'PUT']);
  });

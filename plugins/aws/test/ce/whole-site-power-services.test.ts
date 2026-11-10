import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AWS_CE_PROVIDER_LOCK_SHA256 } from '../../src/ce/execution-contract';
import {
  dispatchAwsNativeNlbMembership,
  dispatchAwsTerraformNlbMembership,
  reconcileAwsNativeNlbMembership,
  reconcileAwsTerraformNlbMembership,
} from '../../src/ce/nlb-power-controller';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { continueAwsPowerServices, reconcileAwsPowerServices } from '../../src/ce/whole-site-power-service-controller';
import { collectAwsPowerServiceInventory } from '../../src/ce/whole-site-power-service-inventory';
import {
  collectAwsPowerNlbServices,
  reviseAwsTerraformNlbMembership,
  validateAwsTerraformNlbMembershipReceipt,
} from '../../src/ce/whole-site-power-services';
import { powerIdentityFixture } from './whole-site-power-fixtures';
import { nlbPowerFixture as fixture } from './whole-site-power-nlb-fixtures';

for (const engine of ['native', 'terraform'] as const)
  test(`${engine}: NLB service binding verifies retained identity and actual membership without mutation`, async () => {
    const f = await fixture(engine);
    const first = await collectAwsPowerNlbServices(f.base, f.values, f.api);
    expect(first.status).toBe('active');
    expect(first.traffic).toBe('unknown');
    f.membership([]);
    const withdrawn = await collectAwsPowerNlbServices(f.base, f.values, f.api);
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.servicesSha256).toBe(first.servicesSha256);
    expect(f.calls.every((a) => a[1]?.startsWith('describe-') || a[0] === 'sts')).toBe(true);
  });
for (const mode of [
  'foreign',
  'partial',
  'listener',
  'duplicate',
  'missing-health',
  'draining',
  'foreign-target',
  'unresolved',
] as const)
  test(`NLB ${mode} cannot qualify active or withdrawn`, async () => {
    const f = await fixture();
    if (mode === 'foreign') f.foreign();
    if (mode === 'partial') f.partial();
    if (mode === 'listener') f.listener();
    if (mode === 'duplicate')
      f.membership([
        { Target: f.target, TargetHealth: { State: 'healthy' } },
        { Target: f.target, TargetHealth: { State: 'healthy' } },
      ]);
    if (mode === 'missing-health') f.membership([{ Target: f.target }]);
    if (mode === 'draining') f.membership([{ Target: f.target, TargetHealth: { State: 'draining' } }]);
    if (mode === 'foreign-target')
      f.membership([{ Target: { ...f.target, Id: '10.0.4.11' }, TargetHealth: { State: 'healthy' } }]);
    if (mode === 'unresolved') f.values.__NLB_ARN__ = '__NLB_ARN__';
    if (mode === 'draining') expect((await collectAwsPowerNlbServices(f.base, f.values, f.api)).status).toBe('pending');
    else await expect(collectAwsPowerNlbServices(f.base, f.values, f.api)).rejects.toThrow();
  });

test('Terraform membership revisions remove and restore only exact retained attachment', async () => {
  const f = await fixture('terraform');
  const binding = await collectAwsPowerNlbServices(f.base, f.values, f.api);
  const attachment = {
    target_group_arn: `\${aws_lb_target_group.ce.arn}`,
    target_id: binding.services.target.Id,
    port: 443,
    availability_zone: 'all',
    depends_on: ['aws_instance.node_1'],
  };
  const configuration = JSON.stringify({
    terraform: {
      required_version: '= 1.16.5',
      required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
    },
    provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
    resource: {
      aws_lb_target_group_attachment: { node_1: attachment },
      aws_instance: { node_1: { user_data_base64: 'PRIVATE' } },
      aws_lb_listener: { ce: { port: 443 } },
    },
  });
  const withdrawal = reviseAwsTerraformNlbMembership(f.base, binding.services, configuration, 'withdraw');
  expect(JSON.parse(withdrawal.configuration).resource.aws_lb_target_group_attachment).toBeUndefined();
  expect(JSON.parse(withdrawal.configuration).resource.aws_instance).toEqual(
    JSON.parse(configuration).resource.aws_instance,
  );
  const restored = reviseAwsTerraformNlbMembership(
    f.base,
    binding.services,
    withdrawal.configuration,
    'restore',
    withdrawal,
  );
  expect(JSON.parse(restored.configuration)).toEqual(JSON.parse(configuration));
  expect(restored.expectedActions).toEqual(['create']);
  expect(withdrawal.expectedActions).toEqual(['delete']);
});
for (const mode of [
  'foreign-target',
  'extra-attachment',
  'wrong-account',
  'wrong-provider',
  'native',
  'missing-retained',
] as const)
  test(`Terraform membership ${mode} rejects without mutation`, async () => {
    const f = await fixture('terraform');
    const binding = await collectAwsPowerNlbServices(f.base, f.values, f.api);
    const configuration = {
      terraform: {
        required_version: '= 1.16.5',
        required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
      },
      provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
      resource: {
        aws_lb_target_group_attachment: {
          node_1: {
            target_group_arn: `\${aws_lb_target_group.ce.arn}`,
            target_id: binding.services.target.Id,
            port: 443,
            availability_zone: 'all',
            depends_on: ['aws_instance.node_1'],
          },
        },
      },
    };
    if (mode === 'foreign-target') configuration.resource.aws_lb_target_group_attachment.node_1.target_id = '10.0.4.11';
    if (mode === 'extra-attachment')
      Object.assign(configuration.resource.aws_lb_target_group_attachment, {
        foreign: configuration.resource.aws_lb_target_group_attachment.node_1,
      });
    if (mode === 'wrong-account') configuration.provider.aws.allowed_account_ids = ['999999999999'];
    if (mode === 'wrong-provider') configuration.terraform.required_providers.aws.version = '= 1.0.0';
    if (mode === 'native') binding.services.engine = 'native';
    expect(() =>
      reviseAwsTerraformNlbMembership(
        f.base,
        binding.services,
        JSON.stringify(configuration),
        mode === 'missing-retained' ? 'restore' : 'withdraw',
      ),
    ).toThrow();
  });

for (const effect of ['withdraw', 'restore'] as const)
  test(`Terraform ${effect} saved plan requires exact resolved membership projection`, async () => {
    const f = await fixture('terraform');
    const b = await collectAwsPowerNlbServices(f.base, f.values, f.api);
    const attachment = {
      target_group_arn: `\${aws_lb_target_group.ce.arn}`,
      target_id: b.services.target.Id,
      port: 443,
      availability_zone: 'all',
      depends_on: ['aws_instance.node_1'],
    };
    const c = JSON.stringify({
      terraform: {
        required_version: '= 1.16.5',
        required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
      },
      provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
      resource: { aws_lb_target_group_attachment: { node_1: attachment } },
    });
    const withdrawal = reviseAwsTerraformNlbMembership(f.base, b.services, c, 'withdraw');
    const revision =
      effect === 'withdraw'
        ? withdrawal
        : reviseAwsTerraformNlbMembership(f.base, b.services, withdrawal.configuration, 'restore', withdrawal);
    const receipt = {
      schemaVersion: 1 as const,
      engine: 'terraform' as const,
      deploymentId: f.base.deploymentName,
      backendIdentity: `local:${f.base.deploymentName}`,
      configurationSha256: revision.afterSha256,
      providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
      planSha256: 'a'.repeat(64),
      noChanges: false,
      changes: [
        { address: revision.address, type: 'aws_lb_target_group_attachment', actions: revision.expectedActions },
      ],
    };
    const owned = {
      target_group_arn: b.services.targetGroupArn,
      target_id: b.services.target.Id,
      port: 443,
      availability_zone: 'all',
    };
    const before = { [revision.address]: effect === 'withdraw' ? owned : null };
    const after = { [revision.address]: effect === 'restore' ? owned : null };
    expect(() =>
      validateAwsTerraformNlbMembershipReceipt(f.base, b.services, revision, receipt, before, after),
    ).not.toThrow();
    expect(() =>
      validateAwsTerraformNlbMembershipReceipt(
        f.base,
        b.services,
        revision,
        {
          ...receipt,
          changes: [...receipt.changes, { address: 'aws_instance.node_1', type: 'aws_instance', actions: ['update'] }],
        },
        before,
        after,
      ),
    ).toThrow();
    expect(() =>
      validateAwsTerraformNlbMembershipReceipt(f.base, b.services, revision, receipt, before, {
        [revision.address]: { ...owned, target_id: '__SLI_IP__' },
      }),
    ).toThrow();
    expect(() =>
      validateAwsTerraformNlbMembershipReceipt(
        f.base,
        b.services,
        revision,
        { ...receipt, providerLockSha256: 'b'.repeat(64) },
        before,
        after,
      ),
    ).toThrow();
  });

async function nativeFixture(
  effect: 'withdraw' | 'restore' = 'withdraw',
  engine: 'native' | 'terraform' = 'native',
  composed = false,
) {
  const f = await fixture(engine);
  const collected = await collectAwsPowerNlbServices(f.base, f.values, f.api);
  const identity = await powerIdentityFixture(engine).read();
  const inventory = composed
    ? await collectAwsPowerServiceInventory(f.base, f.values, f.api, {} as CeRuntime)
    : undefined;
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identity.owner,
    nodes: identity.nodes,
    servicesSha256: inventory?.servicesSha256 ?? collected.servicesSha256,
    ...(inventory ? { servicesInventory: inventory.services } : {}),
  };
  const stop = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
  const body = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-stopped' as const,
    sourcePlanSha256: f.base.planSha256,
    transitionId: stop.transitionId,
    stopPlanSha256: stop.planSha256,
    bindingsSha256: stop.bindingsSha256,
    stoppedEvidenceSha256: 'a'.repeat(64),
    originalAttemptAt: '2026-10-19T00:00:00Z',
    observedAt: '2026-10-19T00:00:01Z',
  };
  const plan =
    effect === 'withdraw'
      ? stop
      : buildAwsWholeSitePowerPlan(f.base, 'start', bindings, stop.transitionId, {
          ...body,
          receiptSha256: canonicalSha256(body),
        });
  const directory = await mkdtemp(join(tmpdir(), 'nlb-power-test-'));
  const storage = await CeDeploymentStore.open(directory, bindings.owner);
  const attempt = {
    effect,
    originalAttemptAt: '2026-10-19T00:00:02Z',
    requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect }),
  };
  await storage.write(`${plan.planId}.json`, plan);
  await storage.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: effect === 'withdraw' ? 1 : 3,
    complete: false,
    pending: attempt,
    attempts: { [effect]: attempt },
  });
  let count = 0;
  let lost = false;
  const original = f.api.exec;
  f.api.exec = async (cmd, args, opts) => {
    if (!['register-targets', 'deregister-targets'].includes(args[1])) return original(cmd, args, opts);
    count++;
    if (lost) throw Error('lost response');
    return { exitCode: 0, stderr: '', stdout: '{}' };
  };
  if (effect === 'restore') f.membership([]);
  return {
    ...f,
    plan,
    stop,
    storage,
    attempt,
    count: () => count,
    lose: () => {
      lost = true;
    },
    clean: () => rm(directory, { recursive: true }),
    dispatch: () => dispatchAwsNativeNlbMembership(f.base, plan, plan.planSha256, effect, storage, f.values, f.api),
    reconcile: () =>
      reconcileAwsNativeNlbMembership(f.base, plan, effect, attempt.originalAttemptAt, storage, f.values, f.api),
  };
}
for (const effect of ['withdraw', 'restore'] as const)
  test(`native ${effect} NLB original attempt applies once and awaits actual membership`, async () => {
    const f = await nativeFixture(effect);
    try {
      await f.dispatch();
      expect(f.count()).toBe(1);
      expect(await f.reconcile()).toBe('pending');
      f.membership(effect === 'withdraw' ? [] : [{ Target: f.target, TargetHealth: { State: 'healthy' } }]);
      expect(await f.reconcile()).toBe('completed');
      await expect(f.dispatch()).rejects.toThrow('submitted');
      expect(f.count()).toBe(1);
    } finally {
      await f.clean();
    }
  });
test('native NLB lost response cannot replay mutation', async () => {
  const f = await nativeFixture();
  try {
    f.lose();
    await expect(f.dispatch()).rejects.toThrow('lost response');
    f.membership([]);
    expect(await f.reconcile()).toBe('completed');
    await expect(f.dispatch()).rejects.toThrow('submitted');
    expect(f.count()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('native NLB foreign retained service rejects before mutation', async () => {
  const f = await nativeFixture();
  try {
    f.listener();
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.count()).toBe(0);
  } finally {
    await f.clean();
  }
});

async function terraformFixture(effect: 'withdraw' | 'restore' = 'withdraw', composed = false) {
  const f = await nativeFixture(effect, 'terraform', composed);
  const observed = await collectAwsPowerNlbServices(f.base, f.values, f.api);
  const configuration = JSON.stringify({
    terraform: {
      required_version: '= 1.16.5',
      required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
    },
    provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
    resource: {
      aws_lb_target_group_attachment: {
        node_1: {
          target_group_arn: `\${aws_lb_target_group.ce.arn}`,
          target_id: observed.services.target.Id,
          port: 443,
          availability_zone: 'all',
          depends_on: ['aws_instance.node_1'],
        },
      },
    },
  });
  const withdrawal = reviseAwsTerraformNlbMembership(f.base, observed.services, configuration, 'withdraw');
  let current = effect === 'withdraw' ? configuration : withdrawal.configuration;
  let journal: 'planned' | 'applying' | 'applied' = 'planned';
  let applies = 0;
  let plans = 0;
  let lost = false;
  let reconciled = 0;
  let interrupted = false;
  const address = withdrawal.address;
  const owned = {
    target_group_arn: observed.services.targetGroupArn,
    target_id: observed.services.target.Id,
    port: 443,
    availability_zone: 'all',
  };
  let applied: Record<string, unknown> | null = effect === 'withdraw' ? owned : null;
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const receipt = (): PlanReceipt => ({
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.base.deploymentName,
    backendIdentity: `local:${f.base.deploymentName}`,
    configurationSha256: sha(current),
    providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
    planSha256: 'b'.repeat(64),
    noChanges: false,
    changes: [
      { address, type: 'aws_lb_target_group_attachment', actions: [effect === 'withdraw' ? 'delete' : 'create'] },
    ],
  });
  const session = {
    readConfigurationSha256: async () => sha(current),
    readConfiguration: async (expected: string) => {
      if (expected !== sha(current)) throw Error('revision');
      return current;
    },
    reviseConfiguration: async (expected: string, next: string) => {
      if (expected !== sha(current)) throw Error('revision');
      current = next;
      return sha(next);
    },
    plan: async () => {
      plans++;
      return receipt();
    },
    readPlanApplicationState: async () => journal,
    readPlannedResourceFields: async () => ({ [address]: effect === 'withdraw' ? owned : null }),
    readProposedResourceFields: async () => ({ [address]: effect === 'withdraw' ? null : owned }),
    readAppliedResourceFields: async () => ({ [address]: applied }),
    apply: async () => {
      if (interrupted) {
        interrupted = false;
        throw Error('before submission');
      }
      applies++;
      journal = 'applying';
      if (lost) throw Error('lost response');
      journal = 'applied';
    },
    reconcileApplyFromEvidence: async () => {
      reconciled++;
      journal = 'applied';
    },
  } as unknown as TerraformSession;
  const terraform: CeTerraformService = {
    open: async (owner, _, mode) => {
      expect(owner).toEqual(f.storage.owner);
      expect(mode).toBe('current');
      return session;
    },
  };
  const priorMarker = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: f.stop.planSha256,
    bindingsSha256: f.stop.bindingsSha256,
    servicesSha256: observed.servicesSha256,
    attempt: {
      effect: 'withdraw',
      originalAttemptAt: '2026-10-19T00:00:00Z',
      requestSha256: canonicalSha256({ planSha256: f.stop.planSha256, effect: 'withdraw' }),
    },
  };
  const priorReceipt = {
    ...receipt(),
    configurationSha256: withdrawal.afterSha256,
    changes: [{ address, type: 'aws_lb_target_group_attachment', actions: ['delete'] }],
  };
  const preparationName = `${f.stop.planId}-withdraw-terraform-nlb-preparation.json`;
  if (effect === 'restore') {
    await f.storage.write(`${f.stop.planId}.json`, f.stop);
    await f.storage.write(preparationName, {
      marker: priorMarker,
      source: configuration,
      revision: withdrawal,
      receipt: priorReceipt,
    });
    await f.storage.write(`${f.stop.planId}-withdraw-terraform-nlb-dispatch.json`, {
      marker: priorMarker,
      receipt: priorReceipt,
    });
    await f.storage.write(`${f.stop.planId}-withdraw-terraform-nlb-outcome.json`, {
      marker: priorMarker,
      receipt: priorReceipt,
      observed,
      applied: { [address]: null },
      collectedAt: new Date().toISOString(),
    });
  }
  return {
    ...f,
    terraform,
    dispatch: () =>
      dispatchAwsTerraformNlbMembership(
        f.base,
        f.plan,
        f.plan.planSha256,
        effect,
        f.storage,
        f.values,
        f.api,
        terraform,
      ),
    reconcile: () =>
      reconcileAwsTerraformNlbMembership(
        f.base,
        f.plan,
        effect,
        f.attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
        terraform,
      ),
    applies: () => applies,
    plans: () => plans,
    reconciled: () => reconciled,
    lose: () => {
      lost = true;
    },
    interrupt: () => {
      interrupted = true;
    },
    actual: (value: Record<string, unknown> | null) => {
      applied = value;
    },
    owned,
    removeOutcome: () => rm(join(f.storage.directory, `${f.stop.planId}-withdraw-terraform-nlb-outcome.json`)),
  };
}
for (const effect of ['withdraw', 'restore'] as const)
  test(`Terraform NLB ${effect} requires applied identity and independent membership`, async () => {
    const f = await terraformFixture(effect);
    try {
      await f.dispatch();
      expect(f.applies()).toBe(1);
      expect(await f.reconcile()).toBe('pending');
      f.actual(effect === 'withdraw' ? null : f.owned);
      expect(await f.reconcile()).toBe('pending');
      f.membership(effect === 'withdraw' ? [] : [{ Target: f.target, TargetHealth: { State: 'healthy' } }]);
      expect(await f.reconcile()).toBe('completed');
      expect(f.reconciled()).toBe(1);
      await expect(f.dispatch()).rejects.toThrow('submitted');
      expect(f.applies()).toBe(1);
    } finally {
      await f.clean();
    }
  });
test('Terraform NLB lost apply response never resubmits', async () => {
  const f = await terraformFixture();
  try {
    f.lose();
    await expect(f.dispatch()).rejects.toThrow('lost response');
    await expect(f.dispatch()).rejects.toThrow('submitted');
    expect(f.applies()).toBe(1);
    f.actual(null);
    f.membership([]);
    expect(await f.reconcile()).toBe('completed');
  } finally {
    await f.clean();
  }
});
test('Terraform NLB pre-submission interruption reuses saved plan', async () => {
  const f = await terraformFixture();
  try {
    f.interrupt();
    await expect(f.dispatch()).rejects.toThrow('before submission');
    expect(await f.reconcile()).toBe('not-submitted');
    await f.dispatch();
    expect(f.plans()).toBe(1);
    expect(f.applies()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('Terraform NLB restoration requires completed withdrawal outcome', async () => {
  const f = await terraformFixture('restore');
  try {
    await f.removeOutcome();
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.applies()).toBe(0);
  } finally {
    await f.clean();
  }
});
test('Terraform NLB foreign applied attachment rejects reconciliation', async () => {
  const f = await terraformFixture('restore');
  try {
    await f.dispatch();
    f.actual({ ...f.owned, target_id: '10.0.4.11' });
    await expect(f.reconcile()).rejects.toThrow('identity');
    expect(f.reconciled()).toBe(0);
  } finally {
    await f.clean();
  }
});

for (const mode of [
  'foreign-outcome',
  'missing-applied',
  'foreign-membership',
  'wrong-attempt',
  'authorization',
] as const)
  test(`Terraform NLB ${mode} rejects before completion or dispatch`, async () => {
    const f = await terraformFixture('restore');
    try {
      if (mode === 'foreign-outcome') {
        const name = `${f.stop.planId}-withdraw-terraform-nlb-outcome.json`;
        const saved = (await f.storage.read(name)) as { applied: unknown };
        await f.storage.write(name, { ...saved, applied: { foreign: null } });
        await expect(f.dispatch()).rejects.toThrow();
        expect(f.applies()).toBe(0);
      } else if (mode === 'authorization') {
        await expect(
          dispatchAwsTerraformNlbMembership(f.base, f.plan, 'foreign', 'restore', f.storage, f.values, f.api, {
            open: async () => {
              throw Error('must not open');
            },
          }),
        ).rejects.toThrow('authorization');
        expect(f.applies()).toBe(0);
      } else if (mode === 'wrong-attempt') {
        const name = `${f.plan.planId}-checkpoint.json`;
        const cp = (await f.storage.read(name)) as { pending: Record<string, unknown> };
        await f.storage.write(name, { ...cp, pending: { ...cp.pending, originalAttemptAt: '2026-10-19T00:00:03Z' } });
        await expect(f.dispatch()).rejects.toThrow('attempt');
        expect(f.applies()).toBe(0);
      } else {
        await f.dispatch();
        if (mode === 'missing-applied') f.actual({});
        else f.membership([{ Target: { ...f.target, Id: '10.0.4.11' }, TargetHealth: { State: 'healthy' } }]);
        await expect(f.reconcile()).rejects.toThrow();
        expect(f.reconciled()).toBe(0);
      }
    } finally {
      await f.clean();
    }
  });

for (const effect of ['withdraw', 'restore'] as const)
  test(`native NLB ${effect} consumes complete inventory and reconciles without replay`, async () => {
    const f = await nativeFixture(effect, 'native', true);
    try {
      await f.dispatch();
      expect(await f.reconcile()).toBe('pending');
      f.membership(effect === 'withdraw' ? [] : [{ Target: f.target, TargetHealth: { State: 'healthy' } }]);
      expect(await f.reconcile()).toBe('completed');
      await expect(f.dispatch()).rejects.toThrow('submitted');
      expect(f.count()).toBe(1);
      const outcome = (await f.storage.read(`${f.plan.planId}-${effect}-native-nlb-outcome.json`)) as {
        marker: { planSha256: string; bindingsSha256: string; servicesSha256: string; attempt: unknown };
      };
      expect(outcome.marker.planSha256).toBe(f.plan.planSha256);
      expect(outcome.marker.bindingsSha256).toBe(f.plan.bindingsSha256);
      expect(outcome.marker.servicesSha256).toBe(f.plan.bindings.servicesInventory?.components[0].servicesSha256);
      expect(outcome.marker.attempt).toEqual(f.attempt);
    } finally {
      await f.clean();
    }
  });

test('service coordinator continues unsubmitted owned NLB then reconciles without replay', async () => {
  const f = await nativeFixture('withdraw', 'native', true);
  try {
    expect(
      await reconcileAwsPowerServices(
        f.base,
        f.plan,
        'withdraw',
        f.attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
        {} as CeRuntime,
      ),
    ).toBe('not-submitted');
    expect(
      await continueAwsPowerServices(
        f.base,
        f.plan,
        'withdraw',
        f.attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
        {} as CeRuntime,
      ),
    ).toBe('pending');
    expect(f.count()).toBe(1);
    f.membership([]);
    expect(
      await continueAwsPowerServices(
        f.base,
        f.plan,
        'withdraw',
        f.attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
        {} as CeRuntime,
      ),
    ).toBe('completed');
    expect(f.count()).toBe(1);
    await expect(
      continueAwsPowerServices(
        f.base,
        f.plan,
        'withdraw',
        '2026-10-19T00:00:03Z',
        f.storage,
        f.values,
        f.api,
        {} as CeRuntime,
      ),
    ).rejects.toThrow();
    expect(f.count()).toBe(1);
  } finally {
    await f.clean();
  }
});

test('Terraform NLB service coordinator uses provider owner and independently reconciles one apply', async () => {
  const f = await terraformFixture('withdraw', true);
  const advance = () =>
    continueAwsPowerServices(
      f.base,
      f.plan,
      'withdraw',
      f.attempt.originalAttemptAt,
      f.storage,
      f.values,
      f.api,
      {} as CeRuntime,
      undefined,
      f.terraform,
    );
  try {
    expect(await advance()).toBe('pending');
    expect(f.applies()).toBe(1);
    f.actual(null);
    f.membership([]);
    expect(await advance()).toBe('completed');
    expect(await advance()).toBe('completed');
    expect(f.applies()).toBe(1);
  } finally {
    await f.clean();
  }
});

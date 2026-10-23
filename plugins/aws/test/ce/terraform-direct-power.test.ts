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
  reviseAwsTerraformDirectServiceRoutes,
  validateAwsTerraformDirectServiceReceipt,
} from '../../src/ce/terraform-direct-power';
import {
  dispatchAwsTerraformDirectRoutes,
  reconcileAwsTerraformDirectRoutes,
} from '../../src/ce/terraform-direct-power-controller';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { createAwsWholeSitePowerDriver } from '../../src/ce/whole-site-power-driver';
import { collectAwsPowerDirectRoutes } from '../../src/ce/whole-site-power-routes';
import { continueAwsPowerServices, reconcileAwsPowerServices } from '../../src/ce/whole-site-power-service-controller';
import { collectAwsPowerServiceInventory } from '../../src/ce/whole-site-power-service-inventory';
import { powerIdentityFixture } from './whole-site-power-fixtures';

async function fixture(multiple = false) {
  const f = powerIdentityFixture('terraform');
  const { planId: _id, planSha256: _sha, ...body } = f.base;
  body.intent = {
    ...body.intent,
    routing: { ...body.intent.routing, profile: 'direct-eni' },
    routes: [{ routeTableId: 'rtb-0123456789abcdef0', destinationCidr: '10.9.0.0/16', node: 1 }],
    brownfield: { ...body.intent.brownfield, routeTableIds: ['rtb-0123456789abcdef0'] },
  };
  if (multiple) body.intent.routes.push({ ...body.intent.routes[0], destinationCidr: '10.10.0.0/16' });
  const sha = canonicalSha256(body);
  const base = { ...body, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  let route: unknown = {
    DestinationCidrBlock: '10.9.0.0/16',
    NetworkInterfaceId: f.resolved.__ENI_1_1__,
    State: 'active',
    Origin: 'CreateRoute',
  };
  let extraRoute: unknown = multiple
    ? {
        DestinationCidrBlock: '10.10.0.0/16',
        NetworkInterfaceId: f.resolved.__ENI_1_1__,
        State: 'active',
        Origin: 'CreateRoute',
      }
    : null;
  let account = base.accountId;
  let partial = false;
  let slo = false;
  let duplicate = false;
  const tables = () => [
    {
      RouteTableId: 'rtb-0123456789abcdef0',
      VpcId: 'vpc-0123456789abcdef0',
      OwnerId: base.accountId,
      Associations: [
        {
          SubnetId: slo ? 'subnet-11111111111111111' : 'subnet-22222222222222222',
          AssociationState: { State: 'associated' },
        },
      ],
      Routes: [
        { DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local', State: 'active', Origin: 'CreateRouteTable' },
        ...(route ? [route] : []),
        ...(extraRoute ? [extraRoute] : []),
      ],
    },
  ];
  const api = {
    exec: async (_cmd: string, args: string[]) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        args[0] === 'sts'
          ? { Account: account }
          : args[1] === 'describe-network-interfaces'
            ? {
                NetworkInterfaces: [
                  {
                    NetworkInterfaceId: f.resolved.__ENI_1_0__,
                    OwnerId: base.accountId,
                    SubnetId: 'subnet-11111111111111111',
                    Attachment: { InstanceId: f.resolved.__INSTANCE_1__, DeviceIndex: 0 },
                  },
                ],
              }
            : {
                RouteTables: duplicate ? [...tables(), ...tables()] : tables(),
                ...(partial ? { NextToken: 'next' } : {}),
              },
      ),
    }),
  };
  return {
    base,
    values: f.resolved,
    api,
    extra: (value: unknown) => {
      extraRoute = value;
    },
    absentExtra: () => {
      extraRoute = null;
    },
    active: () => {
      route = {
        DestinationCidrBlock: '10.9.0.0/16',
        NetworkInterfaceId: f.resolved.__ENI_1_1__,
        State: 'active',
        Origin: 'CreateRoute',
      };
    },
    absent: () => {
      route = null;
    },
    blackhole: () => {
      route = { ...(route as object), State: 'blackhole' };
    },
    foreign: () => {
      route = { ...(route as object), NetworkInterfaceId: 'eni-fffffffffffffffff' };
    },
    slo: () => {
      slo = true;
    },
    partial: () => {
      partial = true;
    },
    duplicate: () => {
      duplicate = true;
    },
    account: () => {
      account = String(BigInt(base.accountId) + 1n);
    },
  };
}
async function terraformRevisionFixture() {
  const f = await fixture();
  const observed = await collectAwsPowerDirectRoutes(f.base, f.values, f.api);
  const original = JSON.stringify({
    terraform: {
      required_version: '= 1.16.5',
      required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
    },
    provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
    resource: {
      aws_route: {
        direct_0: {
          route_table_id: 'rtb-0123456789abcdef0',
          destination_cidr_block: '10.9.0.0/16',
          network_interface_id: f.values.__ENI_1_1__,
        },
        internet: {
          route_table_id: 'rtb-11111111111111111',
          destination_cidr_block: '0.0.0.0/0',
          gateway_id: 'igw-12345678',
        },
      },
      aws_instance: { node_1: { user_data_base64: 'private-bootstrap' } },
    },
    output: { retained: { value: 'same' } },
  });
  return { ...f, original, observed };
}
test('only selected direct routes withdraw and restore; management/support/private configuration is retained', async () => {
  const f = await terraformRevisionFixture();
  const withdrawal = reviseAwsTerraformDirectServiceRoutes(f.base, f.observed.services, f.original, 'withdraw');
  const next = JSON.parse(withdrawal.configuration);
  expect(next.resource.aws_route.direct_0).toBeUndefined();
  expect(next.resource.aws_route.internet).toEqual(JSON.parse(f.original).resource.aws_route.internet);
  expect(next.resource.aws_instance).toEqual(JSON.parse(f.original).resource.aws_instance);
  const restored = reviseAwsTerraformDirectServiceRoutes(
    f.base,
    f.observed.services,
    withdrawal.configuration,
    'restore',
    withdrawal,
  );
  expect(JSON.parse(restored.configuration)).toEqual(JSON.parse(f.original));
});
for (const drift of [
  'account',
  'region',
  'provider',
  'foreign-target',
  'unresolved',
  'extra-direct',
  'missing-route',
  'missing-retained',
  'changed-retained',
] as const)
  test(`direct configuration ${drift} rejects`, async () => {
    const f = await terraformRevisionFixture();
    const c = JSON.parse(f.original);
    if (drift === 'account') c.provider.aws.allowed_account_ids = ['999999999999'];
    if (drift === 'region') c.provider.aws.region = 'us-west-2';
    if (drift === 'provider') c.terraform.required_providers.aws.version = '= 1.0.0';
    if (drift === 'foreign-target') c.resource.aws_route.direct_0.network_interface_id = 'eni-fffffffffffffffff';
    if (drift === 'unresolved') c.resource.aws_route.direct_0.network_interface_id = '__ENI_1_1__';
    if (drift === 'extra-direct') c.resource.aws_route.direct_1 = c.resource.aws_route.direct_0;
    if (drift === 'missing-route') delete c.resource.aws_route.direct_0;
    if (drift.endsWith('retained')) {
      const w = reviseAwsTerraformDirectServiceRoutes(f.base, f.observed.services, f.original, 'withdraw');
      expect(() =>
        reviseAwsTerraformDirectServiceRoutes(
          f.base,
          f.observed.services,
          w.configuration,
          'restore',
          drift === 'missing-retained' ? undefined : { ...w, servicesSha256: 'f'.repeat(64) },
        ),
      ).toThrow();
    } else
      expect(() =>
        reviseAwsTerraformDirectServiceRoutes(f.base, f.observed.services, JSON.stringify(c), 'withdraw'),
      ).toThrow();
  });
async function terraformDirectControllerFixture(effect: 'withdraw' | 'restore' = 'withdraw', composed = false) {
  const f = await terraformRevisionFixture();
  const observed = f.observed;
  const identity = await powerIdentityFixture('terraform').read();
  const inventory = composed
    ? await collectAwsPowerServiceInventory(f.base, f.values, f.api, {} as CeRuntime)
    : undefined;
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identity.owner,
    nodes: identity.nodes,
    servicesSha256: inventory?.servicesSha256 ?? observed.servicesSha256,
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
  const directory = await mkdtemp(join(tmpdir(), 'terraform-direct-'));
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
  const withdrawal = reviseAwsTerraformDirectServiceRoutes(f.base, observed.services, f.original, 'withdraw');
  let current = effect === 'withdraw' ? f.original : withdrawal.configuration;
  const address = 'aws_route.direct_0';
  const owned = {
    destination_cidr_block: '10.9.0.0/16',
    network_interface_id: f.values.__ENI_1_1__,
    route_table_id: 'rtb-0123456789abcdef0',
  };
  let applied: Record<string, unknown> | null = effect === 'withdraw' ? owned : null;
  let journal: 'planned' | 'applying' | 'applied' = 'planned';
  let applies = 0;
  let plans = 0;
  let lost = false;
  let interrupted = false;
  let reconciled = 0;
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const receipt = (): PlanReceipt => ({
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.base.deploymentName,
    backendIdentity: `local:${f.base.deploymentName}`,
    configurationSha256: sha(current),
    providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
    planSha256: 'a'.repeat(64),
    noChanges: false,
    changes: [{ address, type: 'aws_route', actions: [effect === 'withdraw' ? 'delete' : 'create'] }],
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
      return sha(current);
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
      expect(owner).toEqual(storage.owner);
      expect(mode).toBe('current');
      return session;
    },
  };
  const priorMarker = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: stop.planSha256,
    bindingsSha256: stop.bindingsSha256,
    servicesSha256: observed.servicesSha256,
    attempt: {
      effect: 'withdraw',
      originalAttemptAt: '2026-10-19T00:00:00Z',
      requestSha256: canonicalSha256({ planSha256: stop.planSha256, effect: 'withdraw' }),
    },
  };
  const priorReceipt = {
    ...receipt(),
    configurationSha256: withdrawal.afterSha256,
    changes: [{ address, type: 'aws_route', actions: ['delete'] }],
  };
  if (effect === 'restore') {
    f.absent();
    const withdrawn = await collectAwsPowerDirectRoutes(f.base, f.values, f.api);
    await storage.write(`${stop.planId}.json`, stop);
    await storage.write(`${stop.planId}-withdraw-terraform-direct-preparation.json`, {
      marker: priorMarker,
      source: f.original,
      revision: withdrawal,
      receipt: priorReceipt,
    });
    await storage.write(`${stop.planId}-withdraw-terraform-direct-dispatch.json`, {
      marker: priorMarker,
      receipt: priorReceipt,
    });
    await storage.write(`${stop.planId}-withdraw-terraform-direct-outcome.json`, {
      marker: priorMarker,
      receipt: priorReceipt,
      observed: withdrawn,
      applied: { [address]: null },
      collectedAt: new Date().toISOString(),
    });
  }
  return {
    ...f,
    plan,
    stop,
    storage,
    terraform,
    attempt,
    dispatch: () =>
      dispatchAwsTerraformDirectRoutes(f.base, plan, plan.planSha256, effect, storage, f.values, f.api, terraform),
    reconcile: () =>
      reconcileAwsTerraformDirectRoutes(
        f.base,
        plan,
        effect,
        attempt.originalAttemptAt,
        storage,
        f.values,
        f.api,
        terraform,
      ),
    actual: (value: Record<string, unknown> | null) => {
      applied = value;
    },
    owned,
    lose: () => {
      lost = true;
    },
    interrupt: () => {
      interrupted = true;
    },
    applies: () => applies,
    plans: () => plans,
    reconciled: () => reconciled,
    clean: () => rm(directory, { recursive: true }),
  };
}
for (const effect of ['withdraw', 'restore'] as const)
  test(`Terraform direct routes ${effect} requires actual state and independent route evidence`, async () => {
    const f = await terraformDirectControllerFixture(effect);
    try {
      await f.dispatch();
      expect(f.applies()).toBe(1);
      expect(await f.reconcile()).toBe('pending');
      f.actual(effect === 'withdraw' ? null : f.owned);
      expect(await f.reconcile()).toBe('pending');
      if (effect === 'withdraw') f.absent();
      else f.active();
      expect(await f.reconcile()).toBe('completed');
      expect(f.reconciled()).toBe(1);
      await expect(f.dispatch()).rejects.toThrow('submitted');
      expect(f.applies()).toBe(1);
    } finally {
      await f.clean();
    }
  });
test('Terraform direct routes lost response never replays', async () => {
  const f = await terraformDirectControllerFixture();
  try {
    f.lose();
    await expect(f.dispatch()).rejects.toThrow('lost response');
    await expect(f.dispatch()).rejects.toThrow('submitted');
    f.actual(null);
    f.absent();
    expect(await f.reconcile()).toBe('completed');
    expect(f.applies()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('Terraform direct routes unsubmitted plan resumes exact receipt', async () => {
  const f = await terraformDirectControllerFixture();
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
test('Terraform direct routes foreign actual route cannot reconcile', async () => {
  const f = await terraformDirectControllerFixture('restore');
  try {
    await f.dispatch();
    f.actual({ ...f.owned, network_interface_id: 'eni-fffffffffffffffff' });
    await expect(f.reconcile()).rejects.toThrow('identity');
    expect(f.reconciled()).toBe(0);
  } finally {
    await f.clean();
  }
});
test('Terraform direct routes restore requires completed withdrawal outcome', async () => {
  const f = await terraformDirectControllerFixture('restore');
  try {
    await rm(join(f.storage.directory, `${f.stop.planId}-withdraw-terraform-direct-outcome.json`));
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.applies()).toBe(0);
  } finally {
    await f.clean();
  }
});

for (const effect of ['withdraw', 'restore'] as const)
  test(`complete Terraform direct ${effect} service coordinator uses owning session`, async () => {
    const f = await terraformDirectControllerFixture(effect, true);
    try {
      const run = () =>
        continueAwsPowerServices(
          f.base,
          f.plan,
          effect,
          f.attempt.originalAttemptAt,
          f.storage,
          f.values,
          f.api,
          {} as CeRuntime,
          undefined,
          f.terraform,
        );
      expect(() =>
        createAwsWholeSitePowerDriver(f.base, f.plan, f.values, f.storage, f.api, {} as CeRuntime, f.terraform),
      ).not.toThrow();
      expect(await run()).toBe('pending');
      expect(f.applies()).toBe(1);
      f.actual(effect === 'withdraw' ? null : f.owned);
      if (effect === 'withdraw') f.absent();
      else f.active();
      expect(await run()).toBe('completed');
      expect(f.applies()).toBe(1);
    } finally {
      await f.clean();
    }
  });
for (const drift of [
  'unrelated',
  'replacement',
  'duplicate',
  'unknown',
  'partial',
  'lock',
  'backend',
  'action',
  'no-changes',
] as const)
  test(`direct saved-plan ${drift} rejects`, async () => {
    const f = await terraformRevisionFixture();
    const revision = reviseAwsTerraformDirectServiceRoutes(f.base, f.observed.services, f.original, 'withdraw');
    const receipt: PlanReceipt = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: f.base.deploymentName,
      backendIdentity: `local:${f.base.deploymentName}`,
      configurationSha256: revision.afterSha256,
      providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
      planSha256: 'a'.repeat(64),
      changes: [{ address: 'aws_route.direct_0', type: 'aws_route', actions: ['delete'] }],
      noChanges: false,
    };
    const before: Record<string, Record<string, unknown> | null> = { 'aws_route.direct_0': revision.routes.direct_0 };
    const after = { 'aws_route.direct_0': null };
    expect(() =>
      validateAwsTerraformDirectServiceReceipt(f.base, f.observed.services, revision, receipt, before, after),
    ).not.toThrow();
    if (drift === 'unrelated')
      receipt.changes.push({ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['update'] });
    if (drift === 'replacement') receipt.changes[0].actions = ['delete', 'create'];
    if (drift === 'duplicate') receipt.changes.push(receipt.changes[0]);
    if (drift === 'unknown')
      before['aws_route.direct_0'] = { ...revision.routes.direct_0, network_interface_id: '__ENI_1_1__' };
    if (drift === 'partial') delete before['aws_route.direct_0'];
    if (drift === 'lock') receipt.providerLockSha256 = 'f'.repeat(64);
    if (drift === 'backend') receipt.backendIdentity = 'local:foreign';
    if (drift === 'action') Object.assign(receipt, { actionInvocations: [{ address: 'action.foreign' }] });
    if (drift === 'no-changes') receipt.noChanges = true;
    expect(() =>
      validateAwsTerraformDirectServiceReceipt(f.base, f.observed.services, revision, receipt, before, after),
    ).toThrow();
  });
for (const drift of ['slo', 'foreign', 'partial', 'duplicate', 'account'] as const)
  test(`Terraform direct ${drift} cloud evidence blocks dispatch`, async () => {
    const f = await terraformDirectControllerFixture();
    try {
      f[drift]();
      await expect(f.dispatch()).rejects.toThrow();
      expect(f.applies()).toBe(0);
    } finally {
      await f.clean();
    }
  });
test('missing Terraform service and changed original pending attempt reject', async () => {
  const f = await terraformDirectControllerFixture('withdraw', true);
  try {
    expect(() => createAwsWholeSitePowerDriver(f.base, f.plan, f.values, f.storage, f.api, {} as CeRuntime)).toThrow();
    await expect(
      reconcileAwsPowerServices(
        f.base,
        f.plan,
        'withdraw',
        '2026-10-19T00:00:03Z',
        f.storage,
        f.values,
        f.api,
        {} as CeRuntime,
        undefined,
        f.terraform,
      ),
    ).rejects.toThrow('attempt');
    expect(f.applies()).toBe(0);
  } finally {
    await f.clean();
  }
});

for (const drift of ['native', 'foreign-owner', 'unresolved-instance', 'unresolved-sli', 'slo-target'] as const)
  test(`direct service binding ${drift} rejects`, async () => {
    const f = await terraformRevisionFixture();
    const services = structuredClone(f.observed.services);
    if (drift === 'native') services.engine = 'native';
    if (drift === 'foreign-owner') services.accountId = '999999999999';
    if (drift === 'unresolved-instance') services.instanceId = '__INSTANCE_1__';
    if (drift === 'unresolved-sli') services.routes[0].networkInterfaceId = '__ENI_1_1__';
    if (drift === 'slo-target') services.routes[0].networkInterfaceId = services.sloNetworkInterfaceId;
    expect(() => reviseAwsTerraformDirectServiceRoutes(f.base, services, f.original, 'withdraw')).toThrow();
  });
for (const drift of ['request', 'schema', 'applied', 'observation', 'dispatch', 'timestamp'] as const)
  test(`retained direct withdrawal ${drift} rejects restore`, async () => {
    const f = await terraformDirectControllerFixture('restore');
    try {
      const name = `${f.stop.planId}-withdraw-terraform-direct-outcome.json`;
      const outcome = (await f.storage.read(name)) as {
        marker: { schemaVersion: number; attempt: { requestSha256: string } };
        applied: Record<string, unknown>;
        observed: { status: string };
        collectedAt: string;
      };
      if (drift === 'applied') outcome.applied = {};
      if (drift === 'observation') outcome.observed.status = 'active';
      if (drift === 'timestamp') outcome.collectedAt = 'not-a-timestamp';
      if (drift === 'dispatch') await f.storage.write(`${f.stop.planId}-withdraw-terraform-direct-dispatch.json`, {});
      if (drift === 'request' || drift === 'schema') {
        if (drift === 'request') outcome.marker.attempt.requestSha256 = 'f'.repeat(64);
        else outcome.marker.schemaVersion = 2;
        const prepName = `${f.stop.planId}-withdraw-terraform-direct-preparation.json`;
        const prep = (await f.storage.read(prepName)) as { marker: unknown; receipt: unknown };
        prep.marker = outcome.marker;
        await f.storage.write(prepName, prep);
        await f.storage.write(`${f.stop.planId}-withdraw-terraform-direct-dispatch.json`, {
          marker: outcome.marker,
          receipt: prep.receipt,
        });
      }
      await f.storage.write(name, outcome);
      await expect(f.dispatch()).rejects.toThrow();
      expect(f.applies()).toBe(0);
    } finally {
      await f.clean();
    }
  });
test('multiple direct routes preserve stable addresses across owning withdrawal/restoration', async () => {
  const f = await fixture(true);
  const observed = await collectAwsPowerDirectRoutes(f.base, f.values, f.api);
  const single = await terraformRevisionFixture();
  const c = JSON.parse(single.original);
  for (const key of Object.keys(c.resource.aws_route)) if (key.startsWith('direct_')) delete c.resource.aws_route[key];
  for (const [i, r] of observed.services.routes.entries())
    c.resource.aws_route[`direct_${i}`] = {
      route_table_id: r.routeTableId,
      destination_cidr_block: r.destinationCidr,
      network_interface_id: r.networkInterfaceId,
    };
  const original = JSON.stringify(c);
  const w = reviseAwsTerraformDirectServiceRoutes(f.base, observed.services, original, 'withdraw');
  expect(Object.keys(w.routes).sort()).toEqual(['direct_0', 'direct_1']);
  const restored = reviseAwsTerraformDirectServiceRoutes(f.base, observed.services, w.configuration, 'restore', w);
  expect(JSON.parse(restored.configuration)).toEqual(c);
});

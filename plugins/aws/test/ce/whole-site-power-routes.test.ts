import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  dispatchAwsNativeDirectRoutes,
  reconcileAwsNativeDirectRoutes,
} from '../../src/ce/direct-route-power-controller';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { collectAwsPowerDirectRoutes } from '../../src/ce/whole-site-power-routes';
import { powerIdentityFixture } from './whole-site-power-fixtures';

async function fixture(multiple = false) {
  const f = powerIdentityFixture('native');
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
test('direct routes retain exact SLI binding across withdrawal without traffic inference', async () => {
  const f = await fixture();
  const up = await collectAwsPowerDirectRoutes(f.base, f.values, f.api);
  expect(up.status).toBe('active');
  expect(up.traffic).toBe('unknown');
  f.absent();
  const down = await collectAwsPowerDirectRoutes(f.base, f.values, f.api);
  expect(down.status).toBe('withdrawn');
  expect(down.servicesSha256).toBe(up.servicesSha256);
});
for (const mode of ['foreign', 'slo', 'partial', 'duplicate', 'account'] as const)
  test(`direct route ${mode} rejects`, async () => {
    const f = await fixture();
    f[mode]();
    await expect(collectAwsPowerDirectRoutes(f.base, f.values, f.api)).rejects.toThrow();
  });
test('blackhole route is pending, never explicit withdrawal', async () => {
  const f = await fixture();
  f.blackhole();
  expect((await collectAwsPowerDirectRoutes(f.base, f.values, f.api)).status).toBe('pending');
});

async function controllerFixture(multiple = false) {
  const f = await fixture(multiple);
  const observed = await collectAwsPowerDirectRoutes(f.base, f.values, f.api);
  const identities = await powerIdentityFixture().read();
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identities.owner,
    nodes: identities.nodes,
    servicesSha256: observed.servicesSha256,
  };
  const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
  const directory = await mkdtemp(join(tmpdir(), 'direct-route-power-'));
  const storage = await CeDeploymentStore.open(directory, bindings.owner);
  const attempt = {
    effect: 'withdraw',
    originalAttemptAt: '2026-10-19T00:00:00Z',
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
  let submitted = 0;
  let lost = false;
  const original = f.api.exec;
  f.api.exec = async (cmd, args) => {
    if (args[1] !== 'delete-route') return original(cmd, args);
    submitted++;
    if (lost) throw Error('lost response');
    return { exitCode: 0, stdout: '{}', stderr: '' };
  };
  return {
    ...f,
    plan,
    storage,
    submitted: () => submitted,
    lose: () => {
      lost = true;
    },
    dispatch: () => dispatchAwsNativeDirectRoutes(f.base, plan, plan.planSha256, 'withdraw', storage, f.values, f.api),
    reconcile: () =>
      reconcileAwsNativeDirectRoutes(f.base, plan, 'withdraw', attempt.originalAttemptAt, storage, f.values, f.api),
    clean: () => rm(directory, { recursive: true }),
  };
}
test('native direct route request acknowledgement cannot complete withdrawal', async () => {
  const f = await controllerFixture();
  try {
    await f.dispatch();
    expect(f.submitted()).toBe(1);
    expect(await f.reconcile()).toBe('pending');
    f.absent();
    expect(await f.reconcile()).toBe('completed');
    await f.dispatch();
    expect(f.submitted()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('native direct route lost response never replays submitted route', async () => {
  const f = await controllerFixture();
  try {
    f.lose();
    await expect(f.dispatch()).rejects.toThrow('lost response');
    await expect(f.dispatch()).rejects.toThrow('pending');
    expect(f.submitted()).toBe(1);
    f.absent();
    expect(await f.reconcile()).toBe('completed');
    await f.dispatch();
    expect(f.submitted()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('native direct route protects SLO before dispatch', async () => {
  const f = await controllerFixture();
  try {
    f.slo();
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.submitted()).toBe(0);
  } finally {
    await f.clean();
  }
});

test('native direct route restore requires completed original withdrawal and observed target', async () => {
  const f = await controllerFixture();
  try {
    await f.dispatch();
    f.absent();
    expect(await f.reconcile()).toBe('completed');
    const body = {
      schemaVersion: 1 as const,
      kind: 'aws-ce-stopped' as const,
      sourcePlanSha256: f.base.planSha256,
      transitionId: f.plan.transitionId,
      stopPlanSha256: f.plan.planSha256,
      bindingsSha256: f.plan.bindingsSha256,
      stoppedEvidenceSha256: 'a'.repeat(64),
      originalAttemptAt: '2026-10-19T00:00:00Z',
      observedAt: '2026-10-19T00:00:01Z',
    };
    const start = buildAwsWholeSitePowerPlan(f.base, 'start', f.plan.bindings, f.plan.transitionId, {
      ...body,
      receiptSha256: canonicalSha256(body),
    });
    const attempt = {
      effect: 'restore',
      originalAttemptAt: '2026-10-19T00:00:02Z',
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
    let creates = 0;
    const original = f.api.exec;
    f.api.exec = async (cmd, args) => {
      if (args[1] !== 'create-route') return original(cmd, args);
      creates++;
      return { exitCode: 0, stdout: '{"Return":true}', stderr: '' };
    };
    const dispatch = () =>
      dispatchAwsNativeDirectRoutes(f.base, start, start.planSha256, 'restore', f.storage, f.values, f.api);
    const reconcile = () =>
      reconcileAwsNativeDirectRoutes(f.base, start, 'restore', attempt.originalAttemptAt, f.storage, f.values, f.api);
    await dispatch();
    expect(creates).toBe(1);
    expect(await reconcile()).toBe('pending');
    f.active();
    expect(await reconcile()).toBe('completed');
    await dispatch();
    expect(creates).toBe(1);
    const outcomeName = `${f.plan.planId}-withdraw-native-route-outcome.json`;
    const outcome = (await f.storage.read(outcomeName)) as { observed: Record<string, unknown> };
    await f.storage.write(outcomeName, { ...outcome, observed: { ...outcome.observed, status: 'active' } });
    await expect(dispatch()).rejects.toThrow('withdrawal');
    expect(creates).toBe(1);
  } finally {
    await f.clean();
  }
});

test('native multiple routes resume only the unsubmitted route after observed first outcome', async () => {
  const f = await controllerFixture(true);
  try {
    const original = f.api.exec;
    const abort = new AbortController();
    let first = true;
    let submitted = 0;
    f.api.exec = async (cmd, args) => {
      if (args[1] !== 'delete-route') return original(cmd, args);
      submitted++;
      if (first) {
        first = false;
        if (args[args.indexOf('--destination-cidr-block') + 1] === '10.10.0.0/16') f.absentExtra();
        else f.absent();
        abort.abort();
      } else {
        if (args[args.indexOf('--destination-cidr-block') + 1] === '10.10.0.0/16') f.absentExtra();
        else f.absent();
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    };
    await expect(
      dispatchAwsNativeDirectRoutes(
        f.base,
        f.plan,
        f.plan.planSha256,
        'withdraw',
        f.storage,
        f.values,
        f.api,
        abort.signal,
      ),
    ).rejects.toThrow();
    expect(submitted).toBe(1);
    expect(await f.reconcile()).toBe('not-submitted');
    await f.dispatch();
    expect(submitted).toBe(2);
    expect(await f.reconcile()).toBe('completed');
    await f.dispatch();
    expect(submitted).toBe(2);
  } finally {
    await f.clean();
  }
});

for (const destination of ['10.9.1.0/24', '10.8.0.0/15', '0.0.0.0/0'])
  test(`direct withdrawal with overlapping route ${destination} remains pending`, async () => {
    const f = await fixture();
    f.absent();
    f.extra({
      DestinationCidrBlock: destination,
      NetworkInterfaceId: f.values.__ENI_1_1__,
      State: 'active',
      Origin: 'CreateRoute',
    });
    expect((await collectAwsPowerDirectRoutes(f.base, f.values, f.api)).status).toBe('pending');
  });

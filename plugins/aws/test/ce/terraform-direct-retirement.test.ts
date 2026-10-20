import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { runAwsTerraformCloudTeardown } from '../../src/ce/terraform-cloud-teardown';
import { renderAwsTerraformDirectImport } from '../../src/ce/terraform-direct-import';
import { collectAwsTerraformDirectRouteOwnership } from '../../src/ce/terraform-direct-ownership';
import { retireAwsTerraformDirectRoutes } from '../../src/ce/terraform-direct-retirement';
import { renderAwsTerraformDirectTransition } from '../../src/ce/terraform-direct-transition';
import { directOwnershipFixture } from './terraform-direct-fixture';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const f = directOwnershipFixture();
  const ownership = await collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api);
  const original = renderAwsTerraformDirectImport(
    f.base,
    ownership,
    JSON.stringify({ resource: { aws_instance: { node_1: {} } }, output: { ce_vpc_id: { value: ownership.vpcId } } }),
  );
  let configuration = renderAwsTerraformDirectTransition(
    f.base,
    ownership,
    original.configuration,
    'original',
    'ce',
  ).configuration;
  const cloud = f.table.Routes[0] as Record<string, unknown>;
  delete cloud.GatewayId;
  cloud.NetworkInterfaceId = f.values.__ENI_1_1__;
  const records = new Map<string, unknown>([['terraform-direct-ownership.json', ownership]]);
  let actions = 0,
    lostResponseAt = 0,
    journalState: 'planned' | 'applying' | 'applied' = 'planned',
    latestReceipt: PlanReceipt | undefined,
    preserveFailure = false,
    relinquished = false;
  const owner = {
    deploymentId: f.base.deploymentName,
    engine: 'terraform' as const,
    provider: 'aws' as const,
    account: f.base.accountId,
    region: f.base.region,
  };
  const storage = {
    owner,
    verify: async () => {},
    read: async (name: string) => {
      if (!records.has(name)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
      return structuredClone(records.get(name));
    },
    write: async (name: string, value: unknown) => {
      records.set(name, structuredClone(value));
    },
  };
  const receipt = (actions: string[], intents?: unknown[]) => ({
    schemaVersion: 1 as const,
    deploymentId: f.base.deploymentName,
    engine: 'terraform' as const,
    backendIdentity: 'local:owned',
    configurationSha256: hash(configuration),
    providerLockSha256: 'a'.repeat(64),
    planSha256: 'b'.repeat(64),
    noChanges: actions[0] === 'no-op',
    changes: [{ address: 'aws_route.direct_0', type: 'aws_route', actions }],
    ...(intents ? { relinquishments: intents } : {}),
  });
  const saved = (value: PlanReceipt) => {
    latestReceipt = value;
    journalState = 'planned';
    return value;
  };
  const session = {
    readConfigurationSha256: async () => hash(configuration),
    readConfiguration: async (expected: string) => {
      if (expected !== hash(configuration)) throw Error('revision differs');
      return configuration;
    },
    reviseConfiguration: async (expected: string, next: string) => {
      if (expected !== hash(configuration)) throw Error('revision differs');
      configuration = next;
      return hash(next);
    },
    plan: async () =>
      saved({
        ...receipt([cloud.GatewayId ? 'no-op' : 'update']),
        ...(relinquished ? { changes: [] } : {}),
      }),
    readPlannedResourceIds: async () => ({ 'aws_route.direct_0': 'r-rtb-123456782746858862' }),
    readPlannedResourceFields: async () => ({
      'aws_route.direct_0': {
        route_table_id: 'rtb-12345678',
        destination_cidr_block: '192.0.2.0/24',
        network_interface_id: f.values.__ENI_1_1__,
        gateway_id: null,
        nat_gateway_id: null,
        transit_gateway_id: null,
        vpc_peering_connection_id: null,
      },
    }),
    readProposedResourceFields: async () => ({
      'aws_route.direct_0': {
        route_table_id: 'rtb-12345678',
        destination_cidr_block: '192.0.2.0/24',
        network_interface_id: null,
        gateway_id: 'igw-12345678',
        nat_gateway_id: null,
        transit_gateway_id: null,
        vpc_peering_connection_id: null,
      },
    }),
    planRelinquishments: async (intents: unknown[]) => saved(receipt(['forget'], intents) as PlanReceipt),
    readPlanApplicationState: async (value: PlanReceipt) => {
      if (!latestReceipt || canonicalSha256(value) !== canonicalSha256(latestReceipt)) throw Error('journal differs');
      return journalState;
    },
    reconcileApplyFromEvidence: async (value: PlanReceipt, sha: string) => {
      if (
        !latestReceipt ||
        canonicalSha256(value) !== canonicalSha256(latestReceipt) ||
        journalState !== 'applying' ||
        !/^[a-f0-9]{64}$/.test(sha)
      )
        throw Error('reconciliation differs');
      journalState = 'applied';
    },
    readAppliedResourceFields: async () => ({
      'aws_route.direct_0': relinquished
        ? null
        : {
            id: 'r-rtb-123456782746858862',
            route_table_id: 'rtb-12345678',
            destination_cidr_block: '192.0.2.0/24',
            gateway_id: cloud.GatewayId ?? 'wrong',
          },
    }),
    readResourceIdentities: async () =>
      relinquished ? [] : [{ address: 'aws_route.direct_0', type: 'aws_route', id: 'r-rtb-123456782746858862' }],
    apply: async (plan: { relinquishments?: unknown[] }) => {
      actions++;
      journalState = 'applying';
      if (plan.relinquishments) relinquished = true;
      else if (!preserveFailure) {
        delete cloud.NetworkInterfaceId;
        cloud.GatewayId = 'igw-12345678';
      }
      if (actions === lostResponseAt) throw Error('response lost');
      journalState = 'applied';
    },
  } as unknown as TerraformSession;
  return {
    ...f,
    ownership,
    storage,
    session,
    records,
    run: () => retireAwsTerraformDirectRoutes(f.base, ownership, session, storage, f.api, {}),
    actions: () => actions,
    interrupt: (at = 1) => {
      lostResponseAt = at;
    },
    failPreservation: () => {
      preserveFailure = true;
    },
  };
}
test('owning direct retirement restores routes then independently verifies before forgetting exact state IDs', async () => {
  const f = await fixture();
  await expect(f.run()).resolves.toHaveProperty('status', 'direct-routes-preserved');
  expect(f.actions()).toBe(2);
  expect(f.records.get('terraform-direct-retirement.json')).toHaveProperty('phase', 'preserved');
});
test('direct retirement refuses forget when restored cloud evidence is absent', async () => {
  const f = await fixture();
  f.failPreservation();
  await expect(f.run()).rejects.toThrow();
  expect(f.actions()).toBe(1);
});
test('direct retirement rejects unrelated mutations before apply', async () => {
  const f = await fixture();
  const plan = f.session.plan;
  f.session.plan = async (...args) => ({
    ...(await plan(...args)),
    changes: [{ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['update'] }],
  });
  await expect(f.run()).rejects.toThrow();
  expect(f.actions()).toBe(0);
});
test('direct retirement reconciles proved restoration without replay', async () => {
  const f = await fixture();
  f.interrupt();
  await expect(f.run()).rejects.toThrow('response lost');
  await expect(f.run()).resolves.toHaveProperty('status', 'direct-routes-preserved');
  expect(f.actions()).toBe(2);
  expect(f.records.has('terraform-direct-restoration-reconciliation.json')).toBe(true);
});
test('direct retirement rejects foreign durable owner and missing runner capability', async () => {
  const f = await fixture();
  f.storage.owner.account = '000000000000';
  await expect(f.run()).rejects.toThrow();
  expect(f.actions()).toBe(0);
  const g = await fixture();
  g.session.planRelinquishments = undefined;
  await expect(g.run()).rejects.toThrow();
  expect(g.actions()).toBe(0);
});

for (const mode of [
  'foreign-prior-id',
  'missing-fields',
  'foreign-proposed-target',
  'state-drift',
  'wrong-forget',
  'state-retained',
])
  test(`direct retirement rejects ${mode}`, async () => {
    const f = await fixture();
    if (mode === 'foreign-prior-id')
      f.session.readPlannedResourceIds = async () => ({ 'aws_route.direct_0': 'rtb-12345678_192.0.2.0/24' });
    if (mode === 'missing-fields') f.session.readPlannedResourceFields = async () => ({ 'aws_route.direct_0': null });
    if (mode === 'foreign-proposed-target')
      f.session.readProposedResourceFields = async () => ({
        'aws_route.direct_0': {
          route_table_id: 'rtb-12345678',
          destination_cidr_block: '192.0.2.0/24',
          gateway_id: 'igw-ffffffff',
        },
      });
    if (mode === 'state-drift') {
      const ids = f.session.readPlannedResourceIds;
      let reads = 0;
      f.session.readPlannedResourceIds = async (...args) =>
        ++reads === 1 ? ids(...args) : { 'aws_route.direct_0': 'r-rtb-ffffffff2746858862' };
    }
    if (mode === 'wrong-forget') {
      const forget = f.session.planRelinquishments;
      if (!forget) throw Error('fixture capability missing');
      f.session.planRelinquishments = async (...args) => ({
        ...(await forget(...args)),
        changes: [{ address: 'aws_route.direct_0', type: 'aws_route', actions: ['delete'] }],
      });
    }
    if (mode === 'state-retained')
      f.session.readResourceIdentities = async () => [
        { address: 'aws_route.direct_0', type: 'aws_route', id: 'r-rtb-123456782746858862' },
      ];
    await expect(f.run()).rejects.toThrow();
    expect(f.actions()).toBe(
      ['foreign-prior-id', 'missing-fields', 'foreign-proposed-target'].includes(mode)
        ? 0
        : mode === 'state-retained'
          ? 2
          : 1,
    );
    expect(f.records.get('terraform-direct-retirement.json')).not.toHaveProperty('phase', 'preserved');
  });

test('completed direct retirement resumes only after fresh state, configuration and cloud verification', async () => {
  const f = await fixture();
  await f.run();
  await expect(f.run()).resolves.toHaveProperty('status', 'direct-routes-preserved');
  expect(f.actions()).toBe(2);
});
for (const mode of ['marker', 'source', 'configuration', 'state', 'cloud', 'plan'] as const)
  test(`completed direct retirement rejects resumed ${mode} drift without apply`, async () => {
    const f = await fixture();
    await f.run();
    if (mode === 'marker') {
      const marker = f.records.get('terraform-direct-retirement.json') as Record<string, unknown>;
      f.records.set('terraform-direct-retirement.json', { ...marker, ownershipSha256: '0'.repeat(64) });
    }
    if (mode === 'source') f.records.set('terraform-direct-retirement-source.json', null);
    if (mode === 'configuration') f.session.readConfigurationSha256 = async () => '0'.repeat(64);
    if (mode === 'state')
      f.session.readResourceIdentities = async () => [
        { address: 'aws_route.direct_0', type: 'aws_route', id: 'r-rtb-123456782746858862' },
      ];
    if (mode === 'cloud') f.table.Routes[0].GatewayId = 'igw-ffffffff';
    if (mode === 'plan') {
      const current = f.session.plan;
      f.session.plan = async (...args) => ({ ...(await current(...args)), noChanges: false });
    }
    await expect(f.run()).rejects.toThrow();
    expect(f.actions()).toBe(2);
  });

test('cloud teardown restores and relinquishes original routes before its first destroy plan', async () => {
  const f = await fixture();
  let destroyPlans = 0;
  f.session.planDestroy = async () => {
    destroyPlans++;
    expect(f.actions()).toBe(2);
    expect(f.records.get('terraform-direct-retirement.json')).toHaveProperty('phase', 'preserved');
    throw Error('destroy boundary reached');
  };
  await expect(runAwsTerraformCloudTeardown(f.base, f.session, f.storage, f.api, {})).rejects.toThrow(
    'destroy boundary reached',
  );
  expect(destroyPlans).toBe(1);
});
for (const mode of ['missing', 'foreign', 'interrupted'] as const)
  test(`cloud teardown rejects ${mode} direct ownership before any destroy plan`, async () => {
    const f = await fixture();
    let destroyPlans = 0;
    f.session.planDestroy = async () => {
      destroyPlans++;
      throw Error('unsafe destroy');
    };
    if (mode === 'missing') f.records.delete('terraform-direct-ownership.json');
    if (mode === 'foreign')
      f.records.set('terraform-direct-ownership.json', { ...f.ownership, accountId: '000000000000' });
    if (mode === 'interrupted') {
      f.interrupt();
      f.failPreservation();
      await expect(f.run()).rejects.toThrow('response lost');
    }
    await expect(runAwsTerraformCloudTeardown(f.base, f.session, f.storage, f.api, {})).rejects.toThrow();
    expect(destroyPlans).toBe(0);
  });

test('direct retirement reconciles proved relinquishment without replay', async () => {
  const f = await fixture();
  f.interrupt(2);
  await expect(f.run()).rejects.toThrow('response lost');
  await expect(f.run()).resolves.toHaveProperty('status', 'direct-routes-preserved');
  expect(f.actions()).toBe(2);
  expect(f.records.has('terraform-direct-relinquishment-reconciliation.json')).toBe(true);
});
for (const mode of ['state', 'cloud', 'source', 'journal', 'checkpoint', 'duplicate', 'unavailable'] as const)
  test(`interrupted restoration rejects ${mode} evidence without replay`, async () => {
    const f = await fixture();
    f.interrupt();
    await expect(f.run()).rejects.toThrow('response lost');
    if (mode === 'state') f.session.readAppliedResourceFields = async () => ({ 'aws_route.direct_0': null });
    if (mode === 'cloud') f.table.Routes[0].GatewayId = 'igw-ffffffff';
    if (mode === 'source') f.records.set('terraform-direct-retirement-source.json', null);
    if (mode === 'journal')
      f.session.readPlanApplicationState = async () => {
        throw Error('journal differs');
      };
    if (mode === 'checkpoint') f.records.set('terraform-direct-retirement.json', { phase: 'restoration-pending' });
    if (mode === 'duplicate')
      f.session.readAppliedResourceFields = async () => ({ 'aws_route.direct_0': null, 'aws_route.foreign': null });
    if (mode === 'unavailable')
      f.session.readAppliedResourceFields = async () => {
        throw Error('service unavailable');
      };
    await expect(f.run()).rejects.toThrow();
    expect(f.actions()).toBe(1);
    expect(f.records.get('terraform-direct-retirement.json')).not.toHaveProperty('phase', 'preserved');
  });

for (const at of [1, 2])
  test(`direct retirement resumes exact unsubmitted plan ${at}`, async () => {
    const f = await fixture();
    const apply = f.session.apply;
    let calls = 0;
    f.session.apply = async (...args) => {
      if (++calls === at) throw Error('cancelled before submission');
      return apply(...args);
    };
    await expect(f.run()).rejects.toThrow('cancelled before submission');
    const result = await f.run();
    expect(result).toHaveProperty('status', 'direct-routes-preserved');
    expect(f.actions()).toBe(2);
  });
for (const mode of [
  'retained',
  'foreign-cloud',
  'changed-between-reads',
  'reconciliation-write',
  'journal-write',
] as const)
  test(`interrupted relinquishment rejects ${mode} without replay`, async () => {
    const f = await fixture();
    f.interrupt(2);
    await expect(f.run()).rejects.toThrow('response lost');
    if (mode === 'retained')
      f.session.readAppliedResourceFields = async () => ({ 'aws_route.direct_0': { id: 'retained' } });
    if (mode === 'foreign-cloud') f.table.Routes[0].GatewayId = 'igw-ffffffff';
    if (mode === 'changed-between-reads') {
      let reads = 0;
      f.session.readAppliedResourceFields = async () => ({
        'aws_route.direct_0': ++reads === 1 ? null : { id: 'reappeared' },
      });
    }
    if (mode === 'reconciliation-write') {
      const write = f.storage.write;
      f.storage.write = async (name, value) => {
        if (name.includes('reconciliation')) throw Error('disk unavailable');
        return write(name, value);
      };
    }
    if (mode === 'journal-write')
      f.session.reconcileApplyFromEvidence = async () => {
        throw Error('journal unavailable');
      };
    await expect(f.run()).rejects.toThrow();
    expect(f.actions()).toBe(2);
    expect(f.records.get('terraform-direct-retirement.json')).not.toHaveProperty('phase', 'preserved');
  });

for (const at of [1, 2])
  test(`direct retirement recovers runner-completed response loss ${at}`, async () => {
    const f = await fixture();
    const apply = f.session.apply;
    let calls = 0;
    f.session.apply = async (...args) => {
      await apply(...args);
      if (++calls === at) throw Error('completed response lost');
    };
    await expect(f.run()).rejects.toThrow('completed response lost');
    await expect(f.run()).resolves.toHaveProperty('status', 'direct-routes-preserved');
    expect(f.actions()).toBe(2);
  });
test('direct retirement recovers final checkpoint write failure without replay', async () => {
  const f = await fixture();
  const write = f.storage.write;
  let failed = false;
  f.storage.write = async (name, value) => {
    if (!failed && name === 'terraform-direct-retirement.json' && (value as { phase?: string }).phase === 'preserved') {
      failed = true;
      throw Error('checkpoint write lost');
    }
    return write(name, value);
  };
  await expect(f.run()).rejects.toThrow('checkpoint write lost');
  await expect(f.run()).resolves.toHaveProperty('status', 'direct-routes-preserved');
  expect(f.actions()).toBe(2);
});
test('missing interrupted relinquishment plan cannot regenerate a plan or replay', async () => {
  const f = await fixture();
  f.interrupt(2);
  await expect(f.run()).rejects.toThrow('response lost');
  f.records.delete('terraform-direct-relinquishment-plan.json');
  f.session.planRelinquishments = async () => {
    throw Error('unsafe replanning');
  };
  await expect(f.run()).rejects.toThrow('no durable exact plan');
  expect(f.actions()).toBe(2);
});

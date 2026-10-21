import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  activateAwsTerraformDirectRoutes,
  normalizeAwsTerraformDirectPreflight,
} from '../../src/ce/terraform-direct-activation';
import { renderAwsTerraformDirectImport } from '../../src/ce/terraform-direct-import';
import { collectAwsTerraformDirectRouteOwnership } from '../../src/ce/terraform-direct-ownership';
import type { AwsCeObservation } from '../../src/ce/types';
import { directOwnershipFixture } from './terraform-direct-fixture';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const f = directOwnershipFixture();
  const ownership = await collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api);
  let configuration = renderAwsTerraformDirectImport(
    f.base,
    ownership,
    JSON.stringify({
      resource: { aws_instance: { node_1: { ami: 'ami-12345678' } } },
      output: { ce_vpc_id: { value: 'vpc-12345678' } },
    }),
  ).configuration;
  const initialConfiguration = JSON.stringify({
    resource: { aws_instance: { node_1: { ami: 'ami-12345678' } } },
    output: { ce_vpc_id: { value: 'vpc-12345678' } },
  });
  const imported = {
    schemaVersion: 1,
    sourcePlanSha256: f.base.planSha256,
    ownership,
    initialConfiguration,
    importedConfiguration: configuration,
  };
  const files = new Map<string, unknown>([
    ['terraform-direct-ownership.json', ownership],
    ['terraform-direct-import-source.json', imported],
    [
      'terraform-direct-import-stage.json',
      { schemaVersion: 1, engine: 'terraform', sourceSha256: canonicalSha256(imported), phase: 'imported' },
    ],
  ]);
  const storage = {
    owner: {
      deploymentId: f.base.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: f.base.accountId,
      region: f.base.region,
    },
    verify: async () => {},
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  };
  let journal: 'planned' | 'applying' | 'applied' = 'planned';
  let applies = 0,
    plans = 0,
    upReads = 0;
  let phase: 'original' | 'ce' = 'original';
  let interruption = '';
  const fields = (desired: 'original' | 'ce') => ({
    'aws_route.direct_0': {
      id: 'r-rtb-123456782746858862',
      route_table_id: 'rtb-12345678',
      destination_cidr_block: '192.0.2.0/24',
      gateway_id: desired === 'original' ? 'igw-12345678' : null,
      nat_gateway_id: null,
      network_interface_id: desired === 'ce' ? ownership.interfaces[1].id : null,
      transit_gateway_id: null,
      vpc_peering_connection_id: null,
    },
  });
  const session = {
    readConfigurationSha256: async () => hash(configuration),
    readConfiguration: async (sha: string) => {
      if (sha !== hash(configuration)) throw Error('stale');
      return configuration;
    },
    reviseConfiguration: async (sha: string, next: string) => {
      if (sha !== hash(configuration)) throw Error('stale');
      configuration = next;
      if (interruption === 'revision') {
        interruption = '';
        throw Error('revision lost');
      }
      return hash(next);
    },
    readResourceIdentities: async () => [
      { address: 'aws_route.direct_0', type: 'aws_route', id: 'r-rtb-123456782746858862' },
    ],
    plan: async () => {
      plans++;
      if (interruption === 'plan') {
        interruption = '';
        throw Error('plan lost');
      }
      journal = 'planned';
      return {
        schemaVersion: 1,
        engine: 'terraform',
        deploymentId: f.base.deploymentName,
        configurationSha256: hash(configuration),
        providerLockSha256: 'a'.repeat(64),
        planSha256: String(plans).padStart(64, 'b'),
        backendIdentity: 'local:owned',
        noChanges: phase === 'ce',
        changes: [{ address: 'aws_route.direct_0', type: 'aws_route', actions: [phase === 'ce' ? 'no-op' : 'update'] }],
      };
    },
    readPlannedResourceFields: async () => fields(phase),
    readProposedResourceFields: async () => fields('ce'),
    readAppliedResourceFields: async () => fields(phase),
    readPlannedResourceIds: async () => ({ 'aws_route.direct_0': 'r-rtb-123456782746858862' }),
    readPlanApplicationState: async () => journal,
    apply: async () => {
      applies++;
      journal = 'applying';
      phase = 'ce';
      const route = f.table.Routes[0] as Record<string, unknown>;
      delete route.GatewayId;
      route.NetworkInterfaceId = ownership.interfaces[1].id;
      if (interruption === 'apply') {
        interruption = '';
        throw Error('apply lost');
      }
      journal = 'applied';
    },
    reconcileApplyFromEvidence: async () => {
      journal = 'applied';
    },
  } as unknown as TerraformSession;
  const observeUp = async (): Promise<{
    status: 'observed' | 'unknown' | 'down';
    observedAt: string;
    interfaces: ObservedCeInterface[];
  }> => {
    upReads++;
    return {
      status: 'observed' as const,
      observedAt: new Date().toISOString(),
      interfaces: ownership.interfaces.map((i, index) => ({
        node: f.base.deploymentName + '-1',
        role: index ? ('sli' as const) : ('slo' as const),
        mac: i.mac,
        device: f.base.interfaces[index].guestDevice,
        interfaceName: 'actual-' + index,
        mtu: 1500,
        linkUp: true,
        ipv4: null,
      })),
    };
  };
  const run = () =>
    activateAwsTerraformDirectRoutes(f.base, ownership, session, storage, f.api, observeUp, async () => {}, {});
  return {
    ...f,
    ownership,
    storage,
    files,
    session,
    observeUp,
    run,
    fields,
    applies: () => applies,
    plans: () => plans,
    upReads: () => upReads,
    interrupt: (v: string) => {
      interruption = v;
    },
  };
}
test('activation changes only imported routes once and verifies completed resume', async () => {
  const f = await fixture();
  expect(await f.run()).toHaveProperty('status', 'pending-route-and-traffic-acceptance');
  expect(await f.run()).toHaveProperty('terraformNoChanges', true);
  expect(f.applies()).toBe(1);
  expect(f.upReads()).toBeGreaterThanOrEqual(3);
  expect(f.table.Routes[0]).toHaveProperty('NetworkInterfaceId', f.ownership.interfaces[1].id);
});
for (const mode of ['revision', 'plan', 'apply'])
  test('activation recovers ' + mode + ' interruption without replay', async () => {
    const f = await fixture();
    f.interrupt(mode);
    await expect(f.run()).rejects.toThrow('lost');
    expect(await f.run()).toHaveProperty('terraformNoChanges', true);
    expect(f.applies()).toBe(1);
  });
for (const mode of [
  'unknown',
  'down',
  'partial',
  'foreign-mac',
  'wrong-device',
  'duplicate',
  'duplicate-name',
  'blank-name',
])
  test('activation rejects ' + mode + ' interface evidence before mutation', async () => {
    const f = await fixture();
    const observe = async () => {
      const v = await f.observeUp();
      if (mode === 'unknown' || mode === 'down') v.status = mode;
      if (mode === 'partial') v.interfaces.pop();
      if (mode === 'foreign-mac') v.interfaces[1].mac = '02:ff:ff:ff:ff:ff';
      if (mode === 'wrong-device') v.interfaces[1].device = 'other';
      if (mode === 'duplicate') v.interfaces[1] = v.interfaces[0];
      if (mode === 'duplicate-name') v.interfaces[1].interfaceName = v.interfaces[0].interfaceName;
      if (mode === 'blank-name') v.interfaces[1].interfaceName = ' ';
      return v;
    };
    await expect(
      activateAwsTerraformDirectRoutes(f.base, f.ownership, f.session, f.storage, f.api, observe, async () => {}, {}),
    ).rejects.toThrow();
    expect(f.applies()).toBe(0);
    expect(f.plans()).toBe(0);
  });
for (const mode of ['foreign-owner', 'mutating-plan', 'wrong-prior', 'wrong-proposed', 'wrong-applied', 'cloud-drift'])
  test('activation rejects ' + mode, async () => {
    const f = await fixture();
    if (mode === 'foreign-owner') f.storage.owner.account = '000000000000';
    if (mode === 'mutating-plan') {
      const p = f.session.plan;
      f.session.plan = async (...a) => {
        const r = await p(...a);
        r.changes.push({ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['update'] });
        return r;
      };
    }
    if (mode === 'wrong-prior') f.session.readPlannedResourceFields = async () => f.fields('ce');
    if (mode === 'wrong-proposed') f.session.readProposedResourceFields = async () => f.fields('original');
    if (mode === 'wrong-applied') f.session.readAppliedResourceFields = async () => f.fields('original');
    if (mode === 'cloud-drift') f.table.VpcId = 'vpc-ffffffff';
    await expect(f.run()).rejects.toThrow();
    expect(f.applies()).toBe(mode === 'wrong-applied' ? 1 : 0);
  });
test('lost submission marker resumes exact unsubmitted activation', async () => {
  const f = await fixture();
  const write = f.storage.write;
  let fail = true;
  f.storage.write = async (name, value) => {
    await write(name, value);
    if (
      fail &&
      name === 'terraform-direct-activation-stage.json' &&
      (value as { phase?: unknown }).phase === 'submission-pending'
    ) {
      fail = false;
      throw Error('marker lost');
    }
  };
  await expect(f.run()).rejects.toThrow('marker lost');
  expect(f.applies()).toBe(0);
  expect(await f.run()).toHaveProperty('terraformNoChanges', true);
  expect(f.applies()).toBe(1);
});

test('preflight accepts only complete journaled CE targets and preserves unrelated drift', async () => {
  const f = await fixture();
  await f.run();
  const current = {
    resources: [
      {
        id: f.ownership.routes[0].routeTableId,
        state: { RouteTables: [structuredClone(f.table)] },
        region: f.base.region,
        exists: true,
        owned: false,
        tags: {},
      },
    ],
  } as unknown as AwsCeObservation;
  const normalized = await normalizeAwsTerraformDirectPreflight(f.base, current, f.storage, f.api);
  expect(
    (normalized.resources[0].state.RouteTables as Array<{ Routes: Array<Record<string, unknown>> }>)[0].Routes[0],
  ).toHaveProperty('GatewayId', 'igw-12345678');
  expect(
    (current.resources[0].state.RouteTables as Array<{ Routes: Array<Record<string, unknown>> }>)[0].Routes[0],
  ).toHaveProperty('NetworkInterfaceId', f.ownership.interfaces[1].id);
  (current.resources[0].state.RouteTables as Array<{ Routes: Array<Record<string, unknown>> }>)[0].Routes[1].GatewayId =
    'foreign';
  expect(
    (
      (await normalizeAwsTerraformDirectPreflight(f.base, current, f.storage, f.api)).resources[0].state
        .RouteTables as Array<{ Routes: Array<Record<string, unknown>> }>
    )[0].Routes[1].GatewayId,
  ).toBe('foreign');
});
test('preflight rejects forged checkpoint, receipt and inconsistent selected targets', async () => {
  for (const mode of ['checkpoint', 'receipt', 'extra-target']) {
    const f = await fixture();
    await f.run();
    const current = {
      resources: [{ id: f.ownership.routes[0].routeTableId, state: { RouteTables: [structuredClone(f.table)] } }],
    } as unknown as AwsCeObservation;
    if (mode === 'checkpoint') f.files.set('terraform-direct-activation-stage.json', {});
    if (mode === 'receipt') f.files.set('terraform-direct-activation-plan.json', {});
    if (mode === 'extra-target')
      (
        current.resources[0].state.RouteTables as Array<{ Routes: Array<Record<string, unknown>> }>
      )[0].Routes[0].GatewayId = 'foreign';
    await expect(normalizeAwsTerraformDirectPreflight(f.base, current, f.storage, f.api)).rejects.toThrow();
  }
});

test('activation recovery after lost source write does not adopt a changed configuration', async () => {
  const f = await fixture();
  const write = f.storage.write;
  let fail = true;
  f.storage.write = async (name, value) => {
    await write(name, value);
    if (fail && name === 'terraform-direct-activation-source.json') {
      fail = false;
      throw Error('source lost');
    }
  };
  await expect(f.run()).rejects.toThrow('source lost');
  expect(await f.run()).toHaveProperty('terraformNoChanges', true);
  expect(f.applies()).toBe(1);
});
test('lost refresh response never replays activation after runner journal replacement', async () => {
  const f = await fixture();
  const plan = f.session.plan;
  let fail = true;
  f.session.plan = async (...args) => {
    const r = await plan(...args);
    if (r.noChanges && fail) {
      fail = false;
      throw Error('refresh lost');
    }
    return r;
  };
  await expect(f.run()).rejects.toThrow('refresh lost');
  expect(await f.run()).toHaveProperty('terraformNoChanges', true);
  expect(f.applies()).toBe(1);
});
test('up evidence lost at submission rejects without applying the saved plan', async () => {
  const f = await fixture();
  let reads = 0;
  const observe = async () => {
    const v = await f.observeUp();
    if (++reads === 4) v.status = 'unknown';
    return v;
  };
  await expect(
    activateAwsTerraformDirectRoutes(f.base, f.ownership, f.session, f.storage, f.api, observe, async () => {}, {}),
  ).rejects.toThrow('verified up');
  expect(f.applies()).toBe(0);
});

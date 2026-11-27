import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { TerraformSession } from '../../../terraform/src/service';
import { importAwsTerraformDirectRoutes } from '../../src/ce/terraform-direct-stage';
import { directOwnershipFixture } from './terraform-direct-fixture';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function fixture() {
  const f = directOwnershipFixture();
  let configuration = JSON.stringify({
    resource: { aws_instance: { node_1: { ami: 'ami-12345678' } } },
    output: { ce_vpc_id: { value: 'vpc-12345678' } },
  });
  const files = new Map<string, unknown>();
  let journal: 'planned' | 'applying' | 'applied' = 'planned';
  let applied = false;
  let applies = 0;
  let loseResponse = false;
  let failRevision = false;
  let failPlan = false;
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
    write: async (name: string, v: unknown) => {
      files.set(name, structuredClone(v));
    },
  };
  const session = {
    readConfigurationSha256: async () => hash(configuration),
    readConfiguration: async (sha: string) => {
      if (sha !== hash(configuration)) throw Error('stale');
      return configuration;
    },
    reviseConfiguration: async (sha: string, next: string) => {
      if (sha !== hash(configuration)) throw Error('stale');
      configuration = next;
      if (failRevision) {
        failRevision = false;
        throw Error('revision response lost');
      }
      return hash(next);
    },
    readResourceIdentities: async () =>
      applied ? [{ address: 'aws_route.direct_0', type: 'aws_route', id: 'r-rtb-123456782746858862' }] : [],
    planImports: async (imports: unknown[]) => {
      if (failPlan) {
        failPlan = false;
        throw Error('plan interrupted');
      }
      journal = 'planned';
      return {
        schemaVersion: 1,
        engine: 'terraform',
        deploymentId: f.base.deploymentName,
        configurationSha256: hash(configuration),
        providerLockSha256: 'a'.repeat(64),
        planSha256: 'b'.repeat(64),
        backendIdentity: 'local:owned',
        noChanges: false,
        imports,
        changes: [{ address: 'aws_route.direct_0', type: 'aws_route', actions: ['no-op'] }],
      };
    },
    apply: async () => {
      applies++;
      journal = 'applying';
      applied = true;
      if (loseResponse) {
        loseResponse = false;
        throw Error('apply response lost');
      }
      journal = 'applied';
    },
    readPlanApplicationState: async () => journal,
    readAppliedResourceFields: async () => ({
      'aws_route.direct_0': applied
        ? {
            id: 'r-rtb-123456782746858862',
            route_table_id: 'rtb-12345678',
            destination_cidr_block: '192.0.2.0/24',
            gateway_id: 'igw-12345678',
            nat_gateway_id: null,
            network_interface_id: null,
            transit_gateway_id: null,
            vpc_peering_connection_id: null,
          }
        : null,
    }),
    reconcileApplyFromEvidence: async () => {
      journal = 'applied';
    },
  } as unknown as TerraformSession;
  const run = () => importAwsTerraformDirectRoutes(f.base, f.values, session, storage, f.api, async () => {}, {});
  return {
    ...f,
    storage,
    files,
    session,
    run,
    applies: () => applies,
    loseResponse: () => {
      loseResponse = true;
    },
    failRevision: () => {
      failRevision = true;
    },
    failPlan: () => {
      failPlan = true;
    },
  };
}
test('imports original targets once, persists ownership and verifies completed resume', async () => {
  const f = fixture();
  expect(await f.run()).toHaveProperty('status', 'pending-direct-route-transition');
  expect(await f.run()).toHaveProperty('originalRoutesImported', true);
  expect(f.applies()).toBe(1);
  expect(f.table.Routes[0].GatewayId).toBe('igw-12345678');
  expect(await f.storage.read('terraform-direct-import-stage.json')).toHaveProperty('phase', 'imported');
});
for (const mode of ['revision', 'plan', 'apply'] as const)
  test(`direct import resumes ${mode} interruption without duplicate submission`, async () => {
    const f = fixture();
    if (mode === 'revision') f.failRevision();
    if (mode === 'plan') f.failPlan();
    if (mode === 'apply') f.loseResponse();
    await expect(f.run()).rejects.toThrow();
    expect(await f.run()).toHaveProperty('originalRoutesImported', true);
    expect(f.applies()).toBe(1);
  });
for (const mode of [
  'foreign-owner',
  'mutating-plan',
  'foreign-import',
  'wrong-state',
  'missing-receipt',
  'cloud-drift',
] as const)
  test(`direct import rejects ${mode}`, async () => {
    const f = fixture();
    if (mode === 'foreign-owner') f.storage.owner.account = '000000000000';
    if (mode === 'mutating-plan' || mode === 'foreign-import') {
      const plan = f.session.planImports;
      if (!plan) throw Error('fixture missing');
      f.session.planImports = async (...args) => {
        const p = await plan(...args);
        if (mode === 'mutating-plan') p.changes[0].actions = ['update'];
        else p.imports = [];
        return p;
      };
    }
    if (mode === 'wrong-state') f.session.readAppliedResourceFields = async () => ({ 'aws_route.direct_0': null });
    if (mode === 'missing-receipt' || mode === 'cloud-drift') {
      await f.run();
      if (mode === 'missing-receipt') f.files.delete('terraform-direct-import-plan.json');
      else f.table.VpcId = 'vpc-ffffffff';
    }
    await expect(f.run()).rejects.toThrow();
    expect(f.applies()).toBe(mode === 'wrong-state' || mode === 'missing-receipt' || mode === 'cloud-drift' ? 1 : 0);
  });

test('source write interruption recovers only unchanged configuration and empty route state', async () => {
  const f = fixture();
  const write = f.storage.write;
  let fail = true;
  f.storage.write = async (name, value) => {
    await write(name, value);
    if (fail && name === 'terraform-direct-import-source.json') {
      fail = false;
      throw Error('source response lost');
    }
  };
  await expect(f.run()).rejects.toThrow('source response lost');
  expect(await f.run()).toHaveProperty('originalRoutesImported', true);
  expect(f.applies()).toBe(1);
});

test('submission marker interruption resumes exact unsubmitted plan', async () => {
  const f = fixture();
  const write = f.storage.write;
  let fail = true;
  f.storage.write = async (name, value) => {
    await write(name, value);
    if (
      fail &&
      name === 'terraform-direct-import-stage.json' &&
      (value as { phase: string }).phase === 'submission-pending'
    ) {
      fail = false;
      throw Error('marker response lost');
    }
  };
  await expect(f.run()).rejects.toThrow('marker response lost');
  expect(f.applies()).toBe(0);
  expect(await f.run()).toHaveProperty('originalRoutesImported', true);
  expect(f.applies()).toBe(1);
});

test('completed import rejects modified durable ownership and does not resubmit', async () => {
  const f = fixture();
  await f.run();
  f.files.set('terraform-direct-ownership.json', {});
  await expect(f.run()).rejects.toThrow('durable original ownership differs');
  expect(f.applies()).toBe(1);
});

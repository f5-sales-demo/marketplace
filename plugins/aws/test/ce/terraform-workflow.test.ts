import { expect, test } from 'bun:test';
import type { CeTerraformService } from '../../../terraform/src/service';
import { runAwsTerraformAdmission } from '../../src/ce/terraform-workflow';
import { admissionFixture } from './terraform-admission-fixture';

function fixture(brownfield = false) {
  const f = admissionFixture(false, false, brownfield);
  const opens: Array<boolean | 'current'> = [];
  let prepared = false;
  let checks = 0;
  const terraform: CeTerraformService = {
    async open(_owner, _deployment, resume) {
      opens.push(resume);
      if (!resume && prepared) throw Object.assign(new Error('existing workspace'), { code: 'EEXIST' });
      prepared = true;
      return f.session;
    },
  };
  const run = () =>
    runAwsTerraformAdmission(
      f.plan,
      terraform,
      f.runtime,
      f.storage,
      f.api,
      async () => {
        checks++;
      },
      {},
    );
  return { ...f, terraform, opens, run, checks: () => checks };
}
test('workflow prepares foundation and resumes cumulative registration using private current configuration', async () => {
  const f = fixture();
  expect((await f.run()).status).toBe('pending-registration');
  expect(f.opens).toEqual([false]);
  expect(f.checks()).toBe(3);
  f.healthy();
  expect((await f.run()).status).toBe('registered');
  expect(f.opens).toEqual([false, 'current']);
  expect(f.bootstrapped).toEqual(['ce-1', 'ce-2', 'ce-3']);
  expect(await f.storage.read('terraform-workflow.json')).toHaveProperty('stage', 'registered');
});
test('interrupted foundation apply reconciles through existing workspace before registration', async () => {
  const f = fixture();
  f.interrupt();
  await expect(f.run()).rejects.toThrow('interrupted');
  expect(f.bootstrapped).toEqual([]);
  expect(await f.storage.read('terraform-workflow.json')).toHaveProperty('stage', 'network-pending');
  f.healthy();
  expect((await f.run()).status).toBe('registered');
  expect(f.opens).toEqual([false, false, 'current']);
});
test('workflow rejects wrong plan ownership, replacement plans and failed revalidation before apply', async () => {
  const f = fixture();
  await f.storage.write('terraform-workflow.json', {
    schemaVersion: 1,
    engine: 'native',
    planSha256: f.plan.planSha256,
    stage: 'network-pending',
  });
  await expect(f.run()).rejects.toThrow('checkpoint differs');
  expect(f.opens).toEqual([]);
  const other = fixture();
  const original = other.session.plan.bind(other.session);
  other.session.plan = async (...args) => ({
    ...(await original(...args)),
    changes: [{ address: 'aws_vpc.foreign', type: 'aws_vpc', actions: ['delete'] }],
  });
  await expect(other.run()).rejects.toThrow('existing resources');
  expect(other.bootstrapped).toEqual([]);
  const blocked = fixture();
  await expect(
    runAwsTerraformAdmission(
      blocked.plan,
      blocked.terraform,
      blocked.runtime,
      blocked.storage,
      blocked.api,
      async () => {
        throw new Error('identity changed');
      },
      {},
    ),
  ).rejects.toThrow('identity changed');
  expect(blocked.bootstrapped).toEqual([]);
});

test('brownfield admission preserves qualified placement through launch and registered resume', async () => {
  const f = fixture(true);
  const revisions: string[] = [];
  const revise = f.session.reviseConfiguration.bind(f.session);
  f.session.reviseConfiguration = async (expected, next) => {
    revisions.push(next);
    return revise(expected, next);
  };
  expect((await f.run()).status).toBe('pending-registration');
  f.healthy();
  expect((await f.run()).status).toBe('registered');
  expect(f.bootstrapped).toEqual(['ce-1']);
  expect(f.opens).toEqual([false, 'current']);
  expect(revisions.length).toBe(1);
  for (const configuration of revisions) {
    const rendered = JSON.parse(configuration);
    expect(rendered.resource.aws_vpc).toBeUndefined();
    expect(rendered.resource.aws_subnet).toBeUndefined();
    expect(configuration).toContain('subnet-12345678');
    expect(configuration).toContain('subnet-23456789');
  }
  expect(await f.storage.read('terraform-brownfield-placement.json')).toHaveProperty('vpcId', 'vpc-12345678');
});

for (const mode of ['owner', 'drift', 'unavailable', 'forged'] as const)
  test(`brownfield admission rejects ${mode} before opening a runner`, async () => {
    const f = fixture(true);
    if (mode === 'owner') f.storage.owner.account = '000000000000';
    if (!f.brownfieldObservation) throw new Error('brownfield fixture missing');
    if (mode === 'drift')
      (f.brownfieldObservation.resources[0].state.Vpcs as Array<Record<string, unknown>>)[0].CidrBlock = '10.9.0.0/16';
    if (mode === 'unavailable') f.api.exec = async () => ({ exitCode: 1, stderr: 'unavailable', stdout: '' });
    if (mode === 'forged')
      await f.storage.write('terraform-brownfield-placement.json', { sourcePlanSha256: f.plan.planSha256 });
    const message = {
      owner: 'durable owner differs',
      drift: 'immutable snapshot drift',
      unavailable: 'observation unavailable',
      forged: 'Persisted brownfield placement differs',
    }[mode];
    await expect(f.run()).rejects.toThrow(message);
    expect(f.opens).toEqual([]);
    expect(f.bootstrapped).toEqual([]);
  });

test('brownfield admission resumes interrupted bootstrap apply with the exact placement', async () => {
  const f = fixture(true);
  const apply = f.session.apply.bind(f.session);
  let calls = 0;
  f.session.apply = async (...args) => {
    if (++calls === 2) throw new Error('bootstrap apply interrupted');
    return apply(...args);
  };
  await expect(f.run()).rejects.toThrow('bootstrap apply interrupted');
  f.healthy();
  expect((await f.run()).status).toBe('registered');
  expect(f.bootstrapped).toEqual(['ce-1']);
});

test('brownfield resume requires an existing binding and fresh unchanged references', async () => {
  const f = fixture(true);
  await f.run();
  if (!f.brownfieldObservation) throw new Error('brownfield fixture missing');
  (f.brownfieldObservation.resources[0].state.Vpcs as Array<Record<string, unknown>>)[0].CidrBlock = '10.9.0.0/16';
  await expect(f.run()).rejects.toThrow('immutable snapshot drift');
  expect(f.opens).toEqual([false]);
  const missing = fixture(true);
  await missing.storage.write('terraform-workflow.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: missing.plan.planSha256,
    stage: 'registration-pending',
  });
  await expect(missing.run()).rejects.toThrow('missing');
  expect(missing.opens).toEqual([]);
});

test('brownfield reference drift during bootstrap rejects before instance apply', async () => {
  const f = fixture(true);
  const bootstrap = f.runtime.bootstrap.bind(f.runtime);
  f.runtime.bootstrap = async (...args) => {
    const material = await bootstrap(...args);
    if (!f.brownfieldObservation) throw new Error('brownfield fixture missing');
    (f.brownfieldObservation.resources[0].state.Vpcs as Array<Record<string, unknown>>)[0].CidrBlock = '10.9.0.0/16';
    return material;
  };
  await expect(f.run()).rejects.toThrow('immutable snapshot drift');
  expect(f.nodes.size).toBe(0);
});

test('admission cannot recreate a deployment whose retirement has started', async () => {
  const f = fixture();
  await f.storage.write('aws-terraform-lifecycle-retirement.json', { status: 'retiring' });
  await expect(f.run()).rejects.toThrow('retirement');
  expect(f.opens).toEqual([]);
  expect(f.bootstrapped).toEqual([]);
});

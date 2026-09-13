import { expect, test } from 'bun:test';
import type { CeTerraformService } from '../../../terraform/src/service';
import { runAwsTerraformAdmission } from '../../src/ce/terraform-workflow';
import { admissionFixture } from './terraform-admission-fixture';

function fixture() {
  const f = admissionFixture();
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

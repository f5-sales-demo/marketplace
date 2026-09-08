import { expect, it } from 'bun:test';
import { admitAwsTerraformSites } from '../../src/ce/terraform-admission';
import { admissionFixture as fixture } from './terraform-admission-fixture';

it('admits independent sites cumulatively and waits for registration before the next site', async () => {
  const f = fixture();
  expect((await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).status).toBe(
    'pending-registration',
  );
  expect([...f.nodes]).toEqual([1]);
  f.healthy();
  expect((await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).status).toBe('registered');
  expect([...f.nodes]).toEqual([1, 2, 3]);
  expect(f.bootstrapped).toEqual(['ce-1', 'ce-2', 'ce-3']);
  const checkpoint = (await f.storage.read('terraform-admission.json')) as { bootstrapByNode: Record<string, string> };
  expect(checkpoint.bootstrapByNode['1']).toContain('hostname: ce-1');
});
it('resumes after interrupted apply without minting bootstrap again or omitting earlier nodes', async () => {
  const f = fixture();
  f.interrupt();
  await expect(admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).rejects.toThrow(
    'interrupted',
  );
  f.healthy();
  expect((await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).status).toBe('registered');
  expect(f.bootstrapped).toEqual(['ce-1', 'ce-2', 'ce-3']);
  expect([...f.nodes]).toEqual([1, 2, 3]);
});

it('rejects update/replacement work during initial admission', async () => {
  const f = fixture();
  const plan = f.session.plan.bind(f.session);
  f.session.plan = async (...args) => ({
    ...(await plan(...args)),
    changes: [{ address: 'aws_instance.existing', type: 'aws_instance', actions: ['delete', 'create'] }],
  });
  await expect(admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).rejects.toThrow(
    'alter or replace',
  );
  expect([...f.nodes]).toEqual([]);
});

it('does not admit the next site when server-populated interface configuration is unverified', async () => {
  const f = fixture();
  f.healthy();
  const runtime = {
    ...f.runtime,
    async observeAwsRegisteredConfiguration() {
      return { status: 'unknown' as const };
    },
  };
  const result = await admitAwsTerraformSites(f.plan, f.session, runtime, f.storage, f.api, {});
  expect(result.status).toBe('pending-interface-configuration');
  expect([...f.nodes]).toEqual([1]);
});

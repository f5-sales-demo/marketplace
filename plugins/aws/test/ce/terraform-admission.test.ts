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
it('mints and launches all HA nodes through resumable serial boundaries before registration', async () => {
  const f = fixture(true);
  const result = await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {}, undefined, 0);
  expect(result.status).toBe('pending-registration');
  expect([...f.nodes]).toEqual([1, 2, 3]);
  expect(f.bootstrapped).toEqual(['ce-1', 'ce-2', 'ce-3']);
  expect(f.ensuredSites).toHaveLength(1);
  expect(f.ensuredSites[0]?.haMode).toBe('three-node');
  expect(
    f.ensuredSites[0]?.nodes.map((node) => ({
      hostname: node.hostname,
      interfaces: node.interfaces.map(({ ethernet_interface }) => ethernet_interface),
    })),
  ).toEqual([
    {
      hostname: 'ce-1',
      interfaces: [
        { device: 'ens5', mac: '00:11:22:33:01:00' },
        { device: 'ens6', mac: '00:11:22:33:01:01' },
      ],
    },
    {
      hostname: 'ce-2',
      interfaces: [
        { device: 'ens5', mac: '00:11:22:33:02:00' },
        { device: 'ens6', mac: '00:11:22:33:02:01' },
      ],
    },
    {
      hostname: 'ce-3',
      interfaces: [
        { device: 'ens5', mac: '00:11:22:33:03:00' },
        { device: 'ens6', mac: '00:11:22:33:03:01' },
      ],
    },
  ]);
  const checkpoint = (await f.storage.read('terraform-admission.json')) as {
    launchedAtByNode: Record<string, string>;
  };
  expect(Object.keys(checkpoint.launchedAtByNode)).toEqual(['1', '2', '3']);
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

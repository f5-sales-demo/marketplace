import { expect, it } from 'bun:test';
import { buildWireSite, type WireSiteIntent } from '../../../platform/src/ce/wire-site';
import schema from '../../../platform/test/fixtures/smsv2-create-schema.json';
import { admitAwsTerraformSites } from '../../src/ce/terraform-admission';
import { admissionFixture as fixture } from './terraform-admission-fixture';

it('persists initial admission before a site mutation can fail', async () => {
  for (const staticAddressing of [false, true]) {
    const f = fixture(false, staticAddressing);
    const fail = async () => {
      const checkpoint = await f.storage.read('terraform-admission.json');
      expect(checkpoint).toMatchObject({
        planSha256: f.plan.planSha256,
        bootstrapByNode: {},
        launchedAtByNode: {},
        admittedSites: [],
      });
      throw Error('site submission interrupted');
    };
    const runtime = { ...f.runtime, reserveSite: fail, ensureSite: fail };
    await expect(admitAwsTerraformSites(f.plan, f.session, runtime, f.storage, f.api, {})).rejects.toThrow(
      'site submission interrupted',
    );
    expect(f.bootstrapped).toEqual([]);
    expect([...f.nodes]).toEqual([]);
  }
});

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

it('configures static independent sites through the pinned SMSv2 schema before bootstrap', async () => {
  const f = fixture(false, true);
  const order: string[] = [];
  const originalEnsure = f.runtime.ensureSite.bind(f.runtime);
  const originalBootstrap = f.runtime.bootstrap.bind(f.runtime);
  f.runtime.ensureSite = async (binding, value) => {
    const intent = value as WireSiteIntent;
    const wire = buildWireSite(intent, schema.schemas);
    expect(wire.disable_ha).toEqual({});
    const interfaces = intent.nodes[0].interfaces;
    expect(interfaces[0].static_ip).toEqual({
      ip_address: '10.0.1.20/24',
      default_gw: '10.0.1.1',
      dns_server: '10.0.0.2',
    });
    expect(interfaces[1].static_ip).toEqual({ ip_address: '10.0.4.20/24' });
    expect(interfaces.every((item) => !Object.hasOwn(item, 'dhcp_client'))).toBe(true);
    order.push('ensure');
    await originalEnsure(binding, value);
  };
  f.runtime.bootstrap = async (binding, node) => {
    order.push('bootstrap');
    return originalBootstrap(binding, node);
  };
  await admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {});
  expect(order).toEqual(['ensure', 'bootstrap']);
  expect(f.ensuredSites).toHaveLength(1);
});

it('rejects a cloud/output address that agrees with itself but differs from the static plan', async () => {
  const f = fixture(false, true);
  const originalOutputs = f.session.readOutputs.bind(f.session);
  f.session.readOutputs = async (...args) => {
    const output = await originalOutputs(...args);
    const interfaces = output.ce_interfaces as Record<string, { private_ip: string }>;
    interfaces['1:0'].private_ip = '10.0.1.21';
    return output;
  };
  const originalExec = f.api.exec.bind(f.api);
  f.api.exec = async (...args) => {
    const result = await originalExec(...args);
    const response = JSON.parse(result.stdout);
    if (response.NetworkInterfaces) response.NetworkInterfaces[0].PrivateIpAddress = '10.0.1.21';
    return { ...result, stdout: JSON.stringify(response) };
  };
  await expect(admitAwsTerraformSites(f.plan, f.session, f.runtime, f.storage, f.api, {})).rejects.toThrow(
    'resource binding',
  );
  expect(f.bootstrapped).toEqual([]);
});

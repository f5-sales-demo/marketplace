import { expect, it } from 'bun:test';
import { GCP_CE_API_RELEASE } from '../../../gcloud/src/ce/contract';
import { intent } from '../../../gcloud/test/ce/fixtures';
import { GcpPlatformLifecycle } from '../../src/ce/gcp-lifecycle';

function fixture() {
  const i = intent();
  const files = new Map<string, unknown>();
  const store = {
    read: async (n: string) => {
      if (!files.has(n)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(n));
    },
    write: async (n: string, v: unknown) => {
      files.set(n, structuredClone(v));
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
  const contract = {
    release: GCP_CE_API_RELEASE,
    fingerprint: 'verified',
    availability: 'unavailable' as const,
    reason: 'gcp_provider_requires_consumer_qualification' as const,
    singleNodeLifecycle: {
      node_count: 1,
      interface_count: 2,
      site_create: { spec: { gcp: { not_managed: {} }, disable_ha: {} } },
    },
  };
  const site = {
    metadata: {
      name: i.sites[0].name,
      namespace: 'system',
      labels: { 'xcsh-deployment': i.deploymentName, 'xcsh-engine': 'native' },
    },
    system_metadata: { uid: 'site-uid' },
  };
  return { i, store, contract, site };
}
it('lost site create response is reconciled from owned identity without duplicate mutation', async () => {
  const f = fixture();
  let live: unknown = null,
    creates = 0;
  const port = {
    read: async () => live as Record<string, unknown> | null,
    mutate: async () => {
      creates++;
      live = f.site;
      throw new Error('lost response');
    },
  };
  const driver = new GcpPlatformLifecycle(f.store, f.i, f.contract, port);
  await expect(driver.ensureSite()).rejects.toThrow('lost response');
  expect((await driver.ensureSite()).created).toBe(true);
  expect(creates).toBe(1);
});
it('deletion uses exact site UID and reconciles a lost response without a second delete', async () => {
  const f = fixture();
  let live: Record<string, unknown> | null = null,
    deletes = 0;
  const port = {
    read: async () => live,
    mutate: async (_path: string, method: 'POST' | 'DELETE') => {
      if (method === 'POST') {
        live = f.site;
        return {};
      }
      deletes++;
      live = null;
      throw new Error('lost delete');
    },
  };
  const driver = new GcpPlatformLifecycle(f.store, f.i, f.contract, port);
  await driver.ensureSite();
  await expect(driver.deleteSite()).rejects.toThrow('lost delete');
  expect((await driver.deleteSite()).absent).toBe(true);
  expect(deletes).toBe(1);
});
it('foreign preexisting sites and missing lifecycle mappings cannot mutate', async () => {
  const f = fixture();
  let calls = 0;
  const port = {
    read: async () => f.site,
    mutate: async () => {
      calls++;
      return {};
    },
  };
  expect(() => new GcpPlatformLifecycle(f.store, f.i, { ...f.contract, singleNodeLifecycle: undefined }, port)).toThrow(
    'Qualified',
  );
  await expect(new GcpPlatformLifecycle(f.store, f.i, f.contract, port).ensureSite()).rejects.toThrow('collision');
  expect(calls).toBe(0);
});

it('token revocation requires exact node/site labels and reconciles lost deletion', async () => {
  const f = fixture();
  let live: Record<string, unknown> | null = {
    metadata: {
      name: 'node-a-token',
      namespace: 'system',
      labels: { 'xcsh-deployment': f.i.deploymentName, 'xcsh-engine': 'native', 'xcsh-node': 'node-a' },
    },
    spec: { site_name: f.i.sites[0].name },
  };
  let deletes = 0;
  const driver = new GcpPlatformLifecycle(f.store, f.i, f.contract, {
    read: async () => live,
    mutate: async () => {
      deletes++;
      live = null;
      throw new Error('lost token delete');
    },
  });
  await expect(driver.revokeToken('node-a-token')).rejects.toThrow('lost token delete');
  expect((await driver.revokeToken('node-a-token')).absent).toBe(true);
  expect(deletes).toBe(1);
  live = {
    metadata: {
      name: 'node-a-token',
      namespace: 'system',
      labels: { 'xcsh-deployment': 'foreign', 'xcsh-engine': 'native', 'xcsh-node': 'node-a' },
    },
    spec: { site_name: f.i.sites[0].name },
  };
  await expect(driver.revokeToken('node-a-token')).rejects.toThrow('ownership');
  expect(deletes).toBe(1);
});

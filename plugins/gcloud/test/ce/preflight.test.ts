import { expect, it } from 'bun:test';
import { planGcpCe } from '../../src/ce/planner';
import { collectGcpLaunchPreflight, GCP_CREATE_PERMISSIONS, type GcpPreflightPort } from '../../src/ce/preflight';
import { discovery, intent } from './fixtures';

function fixture() {
  const i = intent();
  i.routing.destinationCidrs = [];
  const reads: string[] = [];
  const port: GcpPreflightPort = {
    query: async (path: string) => {
      reads.push(path);
      if (path.endsWith(':testIamPermissions')) return { permissions: [...GCP_CREATE_PERMISSIONS], token: 'PRIVATE' };
      if (path.endsWith('/machineTypes/n2-standard-8')) return { name: i.machineType, guestCpus: 8, memoryMb: 32768 };
      if (path.endsWith('/zones/northamerica-northeast1-a')) return { name: i.sites[0].nodes[0].zone, status: 'UP' };
      if (path.endsWith('/regions/northamerica-northeast1'))
        return {
          quotas: [
            { metric: 'N2_CPUS', limit: 100, usage: 0 },
            { metric: 'SSD_TOTAL_GB', limit: 1000, usage: 0 },
            { metric: 'IN_USE_ADDRESSES', limit: 10, usage: 0 },
          ],
        };
      if (path.endsWith('/projects/test-project')) return { quotas: [{ metric: 'NETWORKS', limit: 10, usage: 0 }] };
      if (path.endsWith('/images/f5xc-cecrt-test')) return i.image;
      if (path.includes('/licenses/')) return { chargesUseFee: false };
      throw new Error('unexpected request');
    },
    policy: async (_project: string, constraint: string) => ({
      spec: {
        rules: [
          constraint === 'compute.requireShieldedVm'
            ? { enforce: false }
            : constraint === 'compute.disableSerialPortAccess'
              ? { enforce: true }
              : { allowAll: true },
        ],
      },
    }),
  };
  return { i, port, reads };
}
function haFixture() {
  const f = fixture();
  const node = f.i.sites[0].nodes[0];
  f.i.sites[0].nodes.push(
    { ...structuredClone(node), name: 'node-b', zone: 'northamerica-northeast1-b' },
    { ...structuredClone(node), name: 'node-c', zone: 'northamerica-northeast1-c' },
  );
  const query = f.port.query;
  f.port.query = async (path) => {
    if (/\/zones\/northamerica-northeast1-[bc]$/.test(path)) {
      f.reads.push(path);
      return { name: path.split('/').at(-1), status: 'UP' };
    }
    return query(path);
  };
  return f;
}

it('balanced disks use SSD quota even when standard disk quota is exhausted', async () => {
  const f = haFixture();
  const query = f.port.query;
  f.port.query = async (path) =>
    path.endsWith('/regions/northamerica-northeast1')
      ? {
          quotas: [
            { metric: 'N2_CPUS', limit: 24, usage: 0 },
            { metric: 'SSD_TOTAL_GB', limit: 250, usage: 10 },
            { metric: 'DISKS_TOTAL_GB', limit: 0, usage: 0 },
            { metric: 'IN_USE_ADDRESSES', limit: 3, usage: 0 },
          ],
        }
      : query(path);
  expect((await collectGcpLaunchPreflight(f.i, f.port)).checks.quota).toBe('verified');
});

it('balanced disks cannot borrow standard quota when SSD quota is missing, ambiguous or insufficient', async () => {
  for (const ssd of [
    [],
    [{ metric: 'SSD_TOTAL_GB', limit: 240, usage: 1 }],
    [
      { metric: 'SSD_TOTAL_GB', limit: 240, usage: 0 },
      { metric: 'SSD_TOTAL_GB', limit: 240, usage: 0 },
    ],
  ]) {
    const f = haFixture();
    const query = f.port.query;
    f.port.query = async (path) =>
      path.endsWith('/regions/northamerica-northeast1')
        ? {
            quotas: [
              { metric: 'N2_CPUS', limit: 24, usage: 0 },
              { metric: 'DISKS_TOTAL_GB', limit: 1000, usage: 0 },
              { metric: 'IN_USE_ADDRESSES', limit: 3, usage: 0 },
              ...ssd,
            ],
          }
        : query(path);
    expect((await collectGcpLaunchPreflight(f.i, f.port)).checks.quota).toBe('unavailable');
  }
});
it('collects read-only HA prerequisites from every zone and accounts for all nodes and shared VPCs', async () => {
  const f = haFixture();
  const query = f.port.query;
  f.port.query = async (path) => {
    if (path.endsWith('/regions/northamerica-northeast1'))
      return {
        quotas: [
          { metric: 'N2_CPUS', limit: 24, usage: 0 },
          { metric: 'SSD_TOTAL_GB', limit: 240, usage: 0 },
          { metric: 'IN_USE_ADDRESSES', limit: 3, usage: 0 },
        ],
      };
    if (path.endsWith('/projects/test-project')) return { quotas: [{ metric: 'NETWORKS', limit: 2, usage: 0 }] };
    return query(path);
  };
  const result = await collectGcpLaunchPreflight(f.i, f.port);
  expect(result.checks.quota).toBe('verified');
  expect(result.checks.machineNicLimit).toBe('verified');
  expect(result.checks.zone).toBe('verified');
  for (const zone of ['a', 'b', 'c']) {
    expect(f.reads).toContain(`/compute/v1/projects/test-project/zones/northamerica-northeast1-${zone}`);
    expect(f.reads).toContain(
      `/compute/v1/projects/test-project/zones/northamerica-northeast1-${zone}/machineTypes/n2-standard-8`,
    );
  }
  expect(result.checks.zoneCapacity).toBe('not-reserved');
  expect(result.intentFingerprint).toBeDefined();
});
it('cannot pass HA quota from headroom sufficient for only part of the deployment', async () => {
  for (const scarce of ['N2_CPUS', 'SSD_TOTAL_GB', 'IN_USE_ADDRESSES']) {
    const f = haFixture();
    const query = f.port.query;
    f.port.query = async (path) =>
      path.endsWith('/regions/northamerica-northeast1')
        ? {
            quotas: [
              { metric: 'N2_CPUS', limit: scarce === 'N2_CPUS' ? 23 : 24, usage: 0 },
              { metric: 'SSD_TOTAL_GB', limit: scarce === 'SSD_TOTAL_GB' ? 239 : 240, usage: 0 },
              { metric: 'IN_USE_ADDRESSES', limit: scarce === 'IN_USE_ADDRESSES' ? 2 : 3, usage: 0 },
            ],
          }
        : query(path);
    expect((await collectGcpLaunchPreflight(f.i, f.port)).checks.quota).toBe('unavailable');
  }
});
it('one unreadable HA machine or unavailable zone keeps its aggregate gate unavailable', async () => {
  for (const failed of ['machine', 'zone']) {
    const f = haFixture();
    const query = f.port.query;
    f.port.query = async (path) => {
      if (
        path.endsWith(
          failed === 'machine'
            ? '/zones/northamerica-northeast1-b/machineTypes/n2-standard-8'
            : '/zones/northamerica-northeast1-b',
        )
      )
        throw new Error('PRIVATE');
      return query(path);
    };
    const result = await collectGcpLaunchPreflight(f.i, f.port);
    expect(result.checks[failed === 'machine' ? 'machineNicLimit' : 'zone']).toBe('unavailable');
    if (failed === 'machine') expect(result.checks.quota).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }
});
it('collects scoped prerequisites and leaves human legal acceptance and capacity explicit', async () => {
  const f = fixture();
  const result = await collectGcpLaunchPreflight(f.i, f.port);
  expect(result.checks.iam).toBe('verified');
  expect(result.checks.quota).toBe('verified');
  expect(result.checks.organizationPolicy).toBe('verified');
  expect(result.checks.image).toBe('verified');
  expect(result.checks.machineNicLimit).toBe('verified');
  expect(result.checks.legalAcceptance).toBe('unknown');
  expect(result.checks.zoneCapacity).toBe('not-reserved');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('missing permission, quota metric or read failure never becomes a passing gate', async () => {
  for (const bad of ['iam', 'quota', 'transport'] as const) {
    const f = fixture();
    const query = f.port.query;
    f.port.query = async (path) => {
      if (bad === 'transport') throw new Error('PRIVATE');
      if (bad === 'iam' && path.endsWith(':testIamPermissions')) return { permissions: [] };
      if (bad === 'quota' && path.includes('/regions/')) return { quotas: [] };
      return query(path);
    };
    const result = await collectGcpLaunchPreflight(f.i, f.port);
    expect(result.checks[bad === 'transport' ? 'image' : bad]).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }
});
it('rejects unsupported topology before issuing any query', async () => {
  const f = fixture();
  f.i.sites[0].nodes.push(structuredClone(f.i.sites[0].nodes[0]));
  await expect(collectGcpLaunchPreflight(f.i, f.port)).rejects.toThrow();
  expect(f.reads).toHaveLength(0);
});

it('normalizes omitted default x86 architecture without accepting a changed image identity', async () => {
  const f = fixture();
  const query = f.port.query;
  f.port.query = async (path) => {
    const result = await query(path);
    if (path.includes('/images/')) {
      const { architecture: _architecture, ...image } = result as typeof f.i.image;
      return image;
    }
    return result;
  };
  expect((await collectGcpLaunchPreflight(f.i, f.port)).checks.image).toBe('verified');
  f.port.query = async (path) => (path.includes('/images/') ? { ...f.i.image, id: '456' } : query(path));
  expect((await collectGcpLaunchPreflight(f.i, f.port)).checks.image).toBe('unavailable');
});

it('conditional policies and duplicate quota metrics remain unavailable', async () => {
  const f = fixture();
  const query = f.port.query;
  f.port.query = async (path) => {
    const result = await query(path);
    if (path.includes('/regions/')) {
      const value = result as { quotas: unknown[] };
      value.quotas.push(value.quotas[0]);
    }
    return result;
  };
  f.port.policy = async () =>
    ({ spec: { rules: [{ allowAll: true, condition: { expression: 'conditional' } }] } }) as never;
  const result = await collectGcpLaunchPreflight(f.i, f.port);
  expect(result.checks.quota).toBe('unavailable');
  expect(result.checks.organizationPolicy).toBe('unavailable');
});

it('readiness hashes fresh preflight receipts and rejects stale or altered intent bindings', async () => {
  const f = fixture();
  const evidence = await collectGcpLaunchPreflight(f.i, f.port);
  const plan = planGcpCe(f.i, discovery(), Date.now(), undefined, evidence);
  expect(plan.unavailable).not.toContain('quota_headroom_not_qualified');
  expect(plan.unavailable).not.toContain('iam_not_verified');
  expect(plan.unavailable).toContain('licenseAcceptance_not_verified');
  expect(plan.executable).toBe(false);
  const changed = structuredClone(evidence);
  changed.receipts[0].sha256 = `sha256:${'b'.repeat(64)}`;
  expect(planGcpCe(f.i, discovery(), Date.now(), undefined, changed).planHash).not.toBe(plan.planHash);
  expect(() =>
    planGcpCe(f.i, discovery(), Date.now(), undefined, { ...evidence, intentFingerprint: 'foreign' }),
  ).toThrow('scope/intent');
  expect(() => planGcpCe(f.i, discovery(), Date.now(), undefined, { ...evidence, observedAt: '2000-01-01' })).toThrow(
    'stale',
  );
});

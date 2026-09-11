import { expect, it } from 'bun:test';
import { collectAzurePlatformHealth } from '../../src/ce/platform-health';
import type { AzureCePlan } from '../../src/ce/types';

const plan = {
  planId: 'plan',
  planSha256: 'a'.repeat(64),
  engine: 'native',
  subscription: { id: 'sub' },
  intent: { resourceGroup: 'rg' },
  region: 'eastus',
  deploymentName: 'ce',
  siteName: 'ce-site',
  topology: { nodeCount: 1 },
} as unknown as AzureCePlan;
const vm = {
  id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ce-1',
  name: 'ce-1',
  location: 'eastus',
  vmId: '00000000-0000-0000-0000-000000000001',
  tags: {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': 'ce',
    'xcsh-execution-engine': 'native',
    'xcsh-plan-sha256': 'a'.repeat(64),
  },
};
const runtime = {
  async observeHealth(binding: unknown) {
    expect(binding).toMatchObject({
      siteName: 'ce-site',
      owner: { provider: 'azure', engine: 'native', account: plan.subscription.id },
      nodes: ['ce-1'],
    });
    return { status: 'healthy' };
  },
  async observeRegistrations(_binding: unknown, instances: unknown) {
    expect(instances).toEqual({ 'ce-1': vm.vmId });
    return { status: 'healthy' };
  },
};
it('binds platform observations to Azure VM UUIDs without claiming routing or node health', async () => {
  expect(await collectAzurePlatformHealth(plan, [vm], runtime)).toMatchObject({
    status: 'healthy',
    scope: 'site-global-and-registration-only',
    nodeHealth: 'unknown',
    bgp: 'unknown',
    routes: 'unknown',
    traffic: 'unknown',
  });
});
it('accepts only the original owner-plan hash frozen by a lifecycle gate', async () => {
  const lifecycle = {
    ...plan,
    planSha256: 'c'.repeat(64),
    actions: [
      {
        kind: 'vm-state-gate',
        node: 1,
        expectedOwnerPlanSha256: 'a'.repeat(64),
      },
    ],
  } as AzureCePlan;
  expect(await collectAzurePlatformHealth(lifecycle, [vm], runtime)).toMatchObject({ status: 'healthy' });
  expect(
    (
      await collectAzurePlatformHealth(
        lifecycle,
        [{ ...vm, tags: { ...vm.tags, 'xcsh-plan-sha256': 'b'.repeat(64) } }],
        runtime,
      )
    ).status,
  ).toBe('unknown');
});
it('uses the unique immutable owner hash from a network lifecycle mutation', async () => {
  const lifecycle = {
    ...plan,
    planSha256: 'c'.repeat(64),
    actions: [
      { kind: 'vm-deallocate', node: 1, expectedOwnerPlanSha256: 'a'.repeat(64) },
      { kind: 'vm-start', node: 1, expectedOwnerPlanSha256: 'a'.repeat(64) },
      { kind: 'health-gate', node: 1 },
    ],
  } as AzureCePlan;
  expect(await collectAzurePlatformHealth(lifecycle, [vm], runtime)).toMatchObject({ status: 'healthy' });
});
it('does not query platform for missing, malformed, ambiguous or foreign cloud identities', async () => {
  const forbidden = {
    observeHealth: async () => {
      throw new Error('must not call');
    },
    observeRegistrations: async () => {
      throw new Error('must not call');
    },
  };
  for (const vms of [
    undefined,
    {},
    [],
    [vm, vm],
    [null],
    [{ ...vm, location: 123 }],
    [{ ...vm, vmId: 'missing' }],
    [{ ...vm, id: vm.id.replace('/sub/', '/foreign/') }],
    [{ ...vm, tags: { ...vm.tags, 'xcsh-execution-engine': 'terraform' } }],
    [{ ...vm, tags: { ...vm.tags, 'xcsh-plan-sha256': 'b'.repeat(64) } }],
  ]) {
    const result = await collectAzurePlatformHealth(plan, vms, forbidden);
    expect(result.status).toBe('unknown');
    expect((result as { reason: string }).reason).not.toBe('platform-observation-unavailable');
  }
});
it('preserves unknown and degraded observations and sanitizes platform failures', async () => {
  for (const status of ['unknown', 'degraded'])
    expect(
      (
        await collectAzurePlatformHealth(plan, [vm], {
          ...runtime,
          observeHealth: async () => ({ status }),
        })
      ).status,
    ).toBe(status);
  const result = await collectAzurePlatformHealth(plan, [vm], {
    ...runtime,
    observeHealth: async () => {
      throw new Error('secret-token');
    },
  });
  expect(result.status).toBe('unknown');
  expect(JSON.stringify(result)).not.toContain('secret-token');
});
it('propagates cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    collectAzurePlatformHealth(
      plan,
      [vm],
      {
        ...runtime,
        observeHealth: async () => {
          throw new Error('cancelled');
        },
      },
      controller.signal,
    ),
  ).rejects.toThrow('cancelled');
});

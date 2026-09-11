import { describe, expect, it } from 'bun:test';
import {
  assertActionOwnership,
  assertApplyAllowed,
  assertAzureCeRoutingExecutable,
  assertObservationFresh,
} from '../../src/ce/apply';
import { fingerprintObservation } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCurrentObservation } from '../../src/ce/recovery';
import { assertAzureTerraformApplyOperation } from '../../src/ce/terraform-apply';
import type { AzureCeAction } from '../../src/ce/types';
import { intent, observation, sharedContractUrl, subscriptionId } from './fixtures';

describe('Azure CE apply protections', () => {
  const plan = compileAzureCePlan(intent, observation);

  for (const kind of ['vm-start', 'vm-stop', 'vm-deallocate', 'vm-resize', 'vm-delete', 'route-create'] as const) {
    it(`rejects ${kind} without a canonical target before cloud access`, async () => {
      const action: AzureCeAction = {
        id: 'missing-target',
        phase: 'nodes',
        kind,
        description: 'missing target',
        mutates: true,
        destructive: true,
      };
      let calls = 0;
      await expect(
        assertActionOwnership(plan, action, {
          exec: async () => {
            calls++;
            throw new Error('Unexpected cloud access');
          },
        }),
      ).rejects.toThrow(/canonical resource ID/);
      expect(calls).toBe(0);
    });
  }

  it('rejects cross-subscription mutation targets even when ownership tags could match', async () => {
    const selected = plan.actions.find((item) => item.kind === 'vm-create');
    if (!selected?.resourceId) throw new Error('fixture has no VM create action');
    const action = {
      ...selected,
      resourceId: selected.resourceId.replace(subscriptionId, subscriptionId.replaceAll('1', '3')),
    };
    let calls = 0;
    await expect(
      assertActionOwnership(plan, action, {
        exec: async () => {
          calls++;
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              id: action.resourceId,
              tags: {
                'xcsh-managed-by': 'azure-ce',
                'xcsh-deployment-id': plan.deploymentName,
                'xcsh-execution-engine': plan.engine,
                'xcsh-plan-sha256': plan.planSha256,
              },
            }),
          };
        },
      }),
    ).rejects.toThrow(/selected subscription/);
    expect(calls).toBe(0);
  });

  it('rejects changed observations before mutation', () => {
    const changed = structuredClone(observation);
    changed.image.version = '1.0.1';
    changed.image.urn = 'f5-networks:f5xc-customer-edge:f5xc-ce:1.0.1';
    expect(() => assertObservationFresh(plan, changed)).toThrow(/stale/i);
  });

  it('normalizes only quota consumed by exact VMs created by the immutable deploy plan', () => {
    const current = structuredClone(observation);
    current.regions[0].quotaAvailable -= 8;
    const vmId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-1`;
    current.resources.push({
      id: vmId,
      location: plan.region,
      exists: true,
      owned: true,
      state: { provisioningState: 'Succeeded' },
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-deployment-id': plan.deploymentName,
        'xcsh-execution-engine': plan.engine,
        'xcsh-plan-sha256': plan.planSha256,
      },
    });
    expect(fingerprintCurrentObservation(plan, current)).toBe(plan.observationFingerprint);
    expect(() => assertObservationFresh(plan, current)).not.toThrow();

    current.resources[0].tags['xcsh-plan-sha256'] = '0'.repeat(64);
    expect(() => assertObservationFresh(plan, current)).toThrow(/stale/i);
    current.resources[0].tags['xcsh-plan-sha256'] = plan.planSha256;
    current.regions[0].quotaAvailable--;
    expect(() => assertObservationFresh(plan, current)).toThrow(/stale/i);
  });

  it('preserves three-node Terraform admission when self-consumption temporarily trips quota eligibility', () => {
    const baseline = structuredClone(observation);
    baseline.regions[0].quotaAvailable = 24;
    baseline.regions[0].reasons = ['fewer-than-three-zones'];
    const ha = compileAzureCePlan({ ...intent, engine: 'terraform', topology: { ha: true } }, baseline);
    const current = structuredClone(baseline);
    current.regions[0].quotaAvailable = 0;
    current.regions[0].eligible = false;
    current.regions[0].reasons = ['quota', 'fewer-than-three-zones'];
    current.resources = [1, 2, 3].map((node) => ({
      id: `/subscriptions/${ha.subscription.id}/resourceGroups/${ha.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${ha.deploymentName}-${node}`,
      location: ha.region,
      exists: true,
      owned: true,
      state: { provisioningState: 'Succeeded' },
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-deployment-id': ha.deploymentName,
        'xcsh-execution-engine': ha.engine,
        'xcsh-plan-sha256': ha.planSha256,
      },
    }));
    expect(() => assertObservationFresh(ha, current)).not.toThrow();
  });

  it('rejects a changed MCN contract digest before mutation', () => {
    const changed = structuredClone(observation);
    changed.research.sharedContract.normalizedSha256 = '4'.repeat(64);
    const sharedReceipt = changed.research.sourceReceipts.find((receipt) => receipt.url === sharedContractUrl);
    expect(sharedReceipt).toBeDefined();
    if (!sharedReceipt) throw new Error('shared contract fixture receipt is missing');
    sharedReceipt.normalizedSha256 = '4'.repeat(64);
    expect(() => assertObservationFresh(plan, changed)).toThrow(/stale/i);
  });

  it('accepts an exact post-action checkpoint fingerprint and rejects later drift', () => {
    const current = structuredClone(observation);
    current.image.termsAccepted = false;
    const expected = fingerprintObservation(current, []);
    expect(() => assertObservationFresh(plan, current, expected)).not.toThrow();
    current.regions[0].quotaAvailable = 9;
    expect(() => assertObservationFresh(plan, current, expected)).toThrow(/stale/i);
  });

  it('requires exact plan identity', () => {
    expect(() =>
      assertApplyAllowed(plan, { planId: plan.planId, planSha256: '0'.repeat(64), hasUI: true, env: {} }),
    ).toThrow(/hash/i);
  });

  it('fails closed for headless mutation without the environment gate', () => {
    expect(() =>
      assertApplyAllowed(plan, { planId: plan.planId, planSha256: plan.planSha256, hasUI: false, env: {} }),
    ).toThrow(/HEADLESS/);
  });

  it('requires an independent destructive gate for teardown', () => {
    const teardown = compileAzureCePlan({ ...intent, operation: 'teardown' }, observation);
    expect(() =>
      assertApplyAllowed(teardown, {
        planId: teardown.planId,
        planSha256: teardown.planSha256,
        hasUI: false,
        env: { XCSH_CE_HEADLESS_MUTATIONS: '1' },
      }),
    ).toThrow(/ALLOW_DESTROY/);
  });

  it('rejects unmanaged create collisions and resource-ID substitution before mutation', async () => {
    const create = plan.actions.find((action) => action.kind === 'vm-create');
    expect(create?.resourceId).toBeDefined();
    if (!create) throw new Error('fixture has no VM create action');
    const api = {
      exec: async () => ({
        stdout: JSON.stringify({ id: create?.resourceId, tags: { owner: 'someone-else' } }),
        stderr: '',
        exitCode: 0,
      }),
    };
    await expect(assertActionOwnership(plan, create, api)).rejects.toThrow(/unmanaged/i);
  });

  it('allows only exact allowlisted brownfield targets', async () => {
    const changed = {
      id: 'substitution',
      phase: 'routing' as const,
      kind: 'route-association-update' as const,
      description: 'substituted target',
      resourceId: `/subscriptions/${subscriptionId}/resourceGroups/other/providers/Microsoft.Network/routeTables/substituted`,
      mutates: true,
      destructive: false,
    };
    await expect(
      assertActionOwnership(plan, changed, { exec: async () => ({ stdout: '', stderr: '', exitCode: 1 }) }),
    ).rejects.toThrow(/allowlist/i);
  });
});

it('requires an expected Route Server route exchange and rejects unattached greenfield UDR execution', () => {
  const routeServer = compileAzureCePlan(
    {
      ...intent,
      engine: 'terraform',
      routing: { mode: 'route-server', destinationCidrs: [], localAsn: 64512 },
    },
    observation,
  );
  expect(() => assertAzureCeRoutingExecutable(routeServer)).toThrow(/expected learned prefix/);
  const executable = compileAzureCePlan(
    {
      ...intent,
      engine: 'terraform',
      routing: { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 },
    },
    observation,
  );
  expect(() => assertAzureCeRoutingExecutable(executable)).not.toThrow();

  const unattached = compileAzureCePlan(
    { ...intent, engine: 'terraform', routing: { mode: 'udr', destinationCidrs: ['10.30.0.0/16'] } },
    observation,
  );
  expect(() => assertAzureCeRoutingExecutable(unattached)).toThrow(/target subnet association/);
});

it('preserves explicit Terraform intent and forbids native execution of that plan', () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  expect(plan.engine).toBe('terraform');
  expect(plan.intent.engine).toBe('terraform');
  expect(plan.ownershipTagTemplate['xcsh-execution-engine']).toBe('terraform');
  expect(() =>
    assertApplyAllowed(plan, { planId: plan.planId, planSha256: plan.planSha256, hasUI: true, env: {} }),
  ).toThrow('execution engine differs');
  expect(() =>
    assertApplyAllowed(plan, {
      planId: plan.planId,
      planSha256: plan.planSha256,
      hasUI: true,
      env: {},
      executionEngine: 'terraform',
    }),
  ).not.toThrow();
});

it('fails closed instead of routing unsupported Terraform operations through initial admission', () => {
  for (const operation of ['reconcile', 'repair', 'update-network', 'teardown'] as const) {
    const selected = structuredClone(intent);
    selected.engine = 'terraform';
    selected.operation = operation;
    if (operation === 'teardown') selected.image = { ...selected.image };
    const observed = structuredClone(observation);
    if (operation === 'update-network') {
      const owner = 'a'.repeat(64);
      observed.resources = [
        {
          id: `/subscriptions/${subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${selected.deploymentName}-1`,
          location: selected.region,
          exists: true,
          owned: true,
          state: {},
          tags: {
            'xcsh-managed-by': 'azure-ce',
            'xcsh-deployment-id': selected.deploymentName,
            'xcsh-execution-engine': 'terraform',
            'xcsh-plan-sha256': owner,
          },
        },
        ...selected.nics.map((_nic, index) => ({
          id: `/subscriptions/${subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${selected.deploymentName}-1-nic${index}`,
          location: selected.region,
          exists: true,
          owned: true,
          state: {},
          tags: {
            'xcsh-managed-by': 'azure-ce',
            'xcsh-deployment-id': selected.deploymentName,
            'xcsh-execution-engine': 'terraform',
            'xcsh-plan-sha256': owner,
          },
        })),
      ];
    }
    const lifecycle = compileAzureCePlan(selected, observed);
    expect(() => assertAzureTerraformApplyOperation(lifecycle)).toThrow(/not executable through Azure CE apply/);
  }
});

it('refuses mutation when live resource ownership belongs to another engine', async () => {
  const plan = compileAzureCePlan(intent, observation);
  const action = plan.actions.find((entry) => entry.kind === 'vm-create');
  if (!action) throw new Error('missing VM action');
  const api = {
    exec: async () => ({
      stdout: JSON.stringify({
        id: action.resourceId,
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-deployment-id': plan.deploymentName,
          'xcsh-plan-sha256': plan.planSha256,
          'xcsh-execution-engine': 'terraform',
        },
      }),
      stderr: '',
      exitCode: 0,
    }),
  };
  await expect(assertActionOwnership(plan, action, api)).rejects.toThrow('another or unknown execution engine');
});

it('rechecks exact brownfield ownership and refuses a conflicting engine despite allowlist approval', async () => {
  const target = `/subscriptions/${subscriptionId}/resourceGroups/brownfield/providers/Microsoft.Network/routeTables/existing`;
  const plan = compileAzureCePlan(intent, observation);
  plan.ownershipInventory.push({ resourceId: target, owned: false, action: 'modify-approved' });
  const action = {
    id: 'brownfield',
    phase: 'routing' as const,
    kind: 'route-association-update' as const,
    resourceId: target,
    description: 'approved route update',
    mutates: true,
    destructive: true,
  };
  const api = (value: unknown) => ({
    exec: async (_command: string, args: string[]) => {
      expect(args).toContain(target);
      expect(args).toContain(subscriptionId);
      return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
    },
  });
  await assertActionOwnership(plan, action, api({ id: target, tags: { owner: 'existing-network' } }));
  for (const value of [
    { id: target, tags: { 'xcsh-execution-engine': 'terraform' } },
    {
      id: target,
      tags: { 'xcsh-managed-by': 'azure-ce', 'xcsh-deployment-id': 'other', 'xcsh-execution-engine': 'native' },
    },
    { id: `${target}-substituted` },
    {},
    { id: target, tags: [] },
  ])
    await expect(assertActionOwnership(plan, action, api(value))).rejects.toThrow();
});

it('reuses persisted apply authorization for the same immutable plan without requiring renewed headless flags', () => {
  const plan = compileAzureCePlan(intent, observation);
  const request = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    hasUI: false,
    env: {},
    authorization: { apply: true, terms: false, destroy: false },
  };
  expect(() => assertApplyAllowed(plan, request)).not.toThrow();
  expect(() => assertApplyAllowed(plan, { ...request, planSha256: '0'.repeat(64) })).toThrow('hash');
  expect(() =>
    assertApplyAllowed(plan, { ...request, authorization: { ...request.authorization, apply: false } }),
  ).toThrow('HEADLESS');
});

it('does not promote apply authorization into Marketplace terms or teardown authorization', () => {
  const plan = compileAzureCePlan(intent, observation);
  const request = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    hasUI: false,
    env: {},
    authorization: { apply: true, terms: false, destroy: false },
  };
  expect(() => assertApplyAllowed({ ...plan, intent: { ...plan.intent, operation: 'teardown' } }, request)).toThrow(
    'ALLOW_DESTROY',
  );
  const termsPlan = {
    ...plan,
    actions: [
      {
        id: 'terms',
        phase: 'preflight' as const,
        kind: 'marketplace-terms-accept' as const,
        description: 'terms',
        mutates: true,
        destructive: false,
      },
    ],
  };
  expect(() => assertApplyAllowed(termsPlan, request)).toThrow('completed by a human');
  expect(() =>
    assertApplyAllowed(termsPlan, { ...request, authorization: { ...request.authorization, terms: true } }),
  ).toThrow('completed by a human');
});

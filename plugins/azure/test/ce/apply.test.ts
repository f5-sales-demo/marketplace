import { describe, expect, it } from 'bun:test';
import {
  assertActionOwnership,
  assertApplyAllowed,
  assertAzureCeRoutingExecutable,
  assertObservationFresh,
} from '../../src/ce/apply';
import { canonicalSha256, fingerprintObservation } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCurrentObservation } from '../../src/ce/recovery';
import {
  assertAzureTerraformApplyOperation,
  reconcileAzureTerraformMarketplaceTermsAcceptance,
} from '../../src/ce/terraform-apply';
import type { AzureCeAction } from '../../src/ce/types';
import { intent, observation, sharedContractUrl, subscriptionId } from './fixtures';

describe('Azure CE apply protections', () => {
  const plan = compileAzureCePlan(intent, observation);

  it('ignores unselected catalog drift and canonicalizes selected set-like observations', () => {
    const baseline = structuredClone(observation);
    baseline.regions[0].rank = 7;
    baseline.regions[0].reasons = ['advisory-two', 'advisory-one'];
    baseline.regions[0].zones = ['3', '1', '2'];
    baseline.regions[0].vmSizes[0].zones = ['2', '3', '1'];
    baseline.regions[0].vmSizes.push({
      name: 'Standard_E8s_v5',
      maxNics: 4,
      vCpus: 8,
      memoryGb: 64,
      zones: ['1'],
      restricted: false,
    });
    baseline.regions.push({
      name: 'eastus',
      rank: 1,
      eligible: false,
      reasons: ['quota'],
      zones: ['1'],
      routeServerSupported: false,
      quotaAvailable: 0,
      policyAllowed: true,
      vmSizes: [],
    });
    const selected = compileAzureCePlan(intent, baseline);
    const current = structuredClone(baseline);
    current.regions.reverse();
    current.research.commands.reverse();
    current.research.officialSources.reverse();
    current.research.sourceReceipts.reverse();
    const selectedRegion = current.regions.find((region) => region.name === 'canadacentral');
    const unselectedRegion = current.regions.find((region) => region.name === 'eastus');
    if (!selectedRegion || !unselectedRegion) throw new Error('catalog fixture is incomplete');
    selectedRegion.rank = 99;
    selectedRegion.proximity = 123;
    selectedRegion.reasons.reverse();
    selectedRegion.zones.reverse();
    selectedRegion.vmSizes.reverse();
    const alternateSize = selectedRegion.vmSizes.find((size) => size.name === 'Standard_E8s_v5');
    const selectedSize = selectedRegion.vmSizes.find((size) => size.name === 'Standard_D8s_v5');
    if (!alternateSize || !selectedSize) throw new Error('VM catalog fixture is incomplete');
    alternateSize.memoryGb = 128;
    selectedSize.zones.reverse();
    Object.assign(unselectedRegion, {
      ...unselectedRegion,
      rank: 42,
      reasons: ['policy-deny'],
      quotaAvailable: 999,
      vmSizes: [{ name: 'alternate', maxNics: 1, vCpus: 1, memoryGb: 1, zones: [], restricted: true }],
    });
    expect(() => assertObservationFresh(selected, current)).not.toThrow();
  });

  it('rejects drift in every selected deployment identity and safety field', () => {
    const mutations: Array<[string, (value: typeof observation) => void]> = [
      [
        'subscription',
        (value) => {
          value.subscription.id = '00000000-0000-4000-8000-000000000002';
        },
      ],
      [
        'tenant',
        (value) => {
          value.subscription.tenantId = value.subscription.tenantId.replaceAll('2', '3');
        },
      ],
      [
        'cloud',
        (value) => {
          value.subscription.cloud = 'AzureUSGovernment';
        },
      ],
      [
        'publisher',
        (value) => {
          value.image.publisher = 'foreign-publisher';
        },
      ],
      [
        'offer',
        (value) => {
          value.image.offer = 'foreign-offer';
        },
      ],
      [
        'plan',
        (value) => {
          value.image.plan = 'foreign-plan';
        },
      ],
      [
        'version',
        (value) => {
          value.image.version = '1.0.1';
        },
      ],
      [
        'URN',
        (value) => {
          value.image.urn = `${value.image.urn}-changed`;
        },
      ],
      [
        'terms',
        (value) => {
          value.image.termsAccepted = false;
        },
      ],
      [
        'source receipt',
        (value) => {
          value.research.sourceReceipts[0].normalizedSha256 = '4'.repeat(64);
        },
      ],
      [
        'shared contract',
        (value) => {
          value.research.sharedContract.normalizedSha256 = '4'.repeat(64);
        },
      ],
      [
        'region name',
        (value) => {
          value.regions[0].name = 'eastus';
        },
      ],
      [
        'region eligibility',
        (value) => {
          value.regions[0].eligible = false;
        },
      ],
      [
        'region reasons',
        (value) => {
          value.regions[0].reasons.push('quota');
        },
      ],
      [
        'region zones',
        (value) => {
          value.regions[0].zones.push('2');
        },
      ],
      [
        'Route Server support',
        (value) => {
          value.regions[0].routeServerSupported = false;
        },
      ],
      [
        'quota',
        (value) => {
          value.regions[0].quotaAvailable++;
        },
      ],
      [
        'policy',
        (value) => {
          value.regions[0].policyAllowed = false;
        },
      ],
      [
        'VM name',
        (value) => {
          value.regions[0].vmSizes[0].name = 'Standard_E8s_v5';
        },
      ],
      [
        'VM NIC limit',
        (value) => {
          value.regions[0].vmSizes[0].maxNics++;
        },
      ],
      [
        'VM vCPU',
        (value) => {
          value.regions[0].vmSizes[0].vCpus++;
        },
      ],
      [
        'VM memory',
        (value) => {
          value.regions[0].vmSizes[0].memoryGb++;
        },
      ],
      [
        'VM restriction',
        (value) => {
          value.regions[0].vmSizes[0].restricted = true;
        },
      ],
      [
        'VM zones',
        (value) => {
          value.regions[0].vmSizes[0].zones.push('2');
        },
      ],
    ];
    for (const [field, mutate] of mutations) {
      const current = structuredClone(observation);
      mutate(current);
      expect(() => assertObservationFresh(plan, current), field).toThrow();
    }
  });

  it('binds and canonically sorts every approved brownfield resource observation', () => {
    const firstId = `/subscriptions/${subscriptionId}/resourceGroups/network/providers/Microsoft.Network/routeTables/first`;
    const secondId = `/subscriptions/${subscriptionId}/resourceGroups/network/providers/Microsoft.Network/routeTables/second`;
    const baseline = structuredClone(observation);
    baseline.resources = [
      { id: secondId, exists: true, owned: false, tags: { owner: 'network' }, state: { routes: [] } },
      { id: firstId, exists: true, owned: false, tags: {}, state: { routes: [] } },
    ];
    const brownfieldPlan = compileAzureCePlan(
      { ...intent, brownfield: { resourceIds: [firstId, secondId], routeChanges: [] } },
      baseline,
    );
    const reordered = structuredClone(baseline);
    reordered.resources.reverse();
    expect(() => assertObservationFresh(brownfieldPlan, reordered)).not.toThrow();
    reordered.resources[0].state = { routes: [{ name: 'drift' }] };
    expect(() => assertObservationFresh(brownfieldPlan, reordered)).toThrow(/stale/i);
  });

  it('rebinds only the exact initial Terraform Marketplace acceptance observation', () => {
    const terraformPlan = compileAzureCePlan(
      { ...intent, engine: 'terraform' },
      { ...observation, image: { ...observation.image, termsAccepted: false } },
    );
    const accepted = structuredClone(observation);
    expect(reconcileAzureTerraformMarketplaceTermsAcceptance(terraformPlan, accepted)).toMatch(/^[a-f0-9]{64}$/);
    accepted.image.offer = 'foreign-offer';
    expect(() => reconcileAzureTerraformMarketplaceTermsAcceptance(terraformPlan, accepted)).toThrow(
      /Stale Azure CE plan/,
    );
    for (const changed of [
      { subscription: { ...observation.subscription, id: '00000000-0000-4000-8000-000000000002' } },
      { image: { ...observation.image, version: '2.0.0' } },
      {
        research: {
          ...observation.research,
          sharedContract: { ...observation.research.sharedContract, normalizedSha256: '4'.repeat(64) },
        },
      },
    ]) {
      const drifted = { ...structuredClone(observation), ...changed };
      expect(() => reconcileAzureTerraformMarketplaceTermsAcceptance(terraformPlan, drifted)).toThrow(
        /Stale Azure CE plan/,
      );
    }
  });

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

    for (const mutate of [
      (value: typeof current) => {
        value.resources[0].tags['xcsh-plan-sha256'] = '0'.repeat(64);
      },
      (value: typeof current) => {
        value.resources[0].tags['xcsh-execution-engine'] = 'terraform';
      },
      (value: typeof current) => {
        value.resources[0].tags['xcsh-deployment-id'] = 'foreign';
      },
      (value: typeof current) => {
        value.resources[0].owned = false;
      },
      (value: typeof current) => {
        value.resources[0].id = `${vmId.slice(0, -1)}2`;
      },
    ]) {
      const rejected = structuredClone(current);
      mutate(rejected);
      expect(() => assertObservationFresh(plan, rejected)).toThrow(/stale/i);
    }

    current.regions[0].quotaAvailable--;
    expect(() => assertObservationFresh(plan, current)).toThrow(/stale/i);
  });

  it('normalizes quota consumed by the exact plan-owned Terraform workload fixture VM', () => {
    const fixturePlan = compileAzureCePlan(
      {
        ...intent,
        engine: 'terraform',
        routing: {
          mode: 'route-server',
          destinationCidrs: ['10.30.0.0/24'],
          localAsn: 64512,
          peerAsn: 64512,
        },
        workloadFixture: {
          subnetName: 'workload',
          cidr: '10.30.0.0/24',
          privateIp: '10.30.0.4',
          port: 8080,
        },
      },
      observation,
    );
    const current = structuredClone(observation);
    current.regions[0].quotaAvailable--;
    current.resources.push({
      id: `/subscriptions/${fixturePlan.subscription.id}/resourceGroups/${fixturePlan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${fixturePlan.deploymentName}-workload`,
      location: fixturePlan.region,
      exists: true,
      owned: true,
      state: { provisioningState: 'Succeeded' },
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-deployment-id': fixturePlan.deploymentName,
        'xcsh-execution-engine': fixturePlan.engine,
        'xcsh-plan-sha256': fixturePlan.planSha256,
      },
    });
    expect(() => assertObservationFresh(fixturePlan, current)).not.toThrow();

    for (const field of ['xcsh-plan-sha256', 'xcsh-execution-engine', 'xcsh-deployment-id'] as const) {
      const rejected = structuredClone(current);
      rejected.resources[0].tags[field] = 'foreign';
      expect(() => assertObservationFresh(fixturePlan, rejected), field).toThrow(/stale/i);
    }
    const rejected = structuredClone(current);
    rejected.resources[0].id = rejected.resources[0].id.replace('-workload', '-foreign');
    expect(() => assertObservationFresh(fixturePlan, rejected)).toThrow(/stale/i);
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

  it('accepts an exact post-transition deployment fingerprint and rejects later drift', () => {
    const current = structuredClone(observation);
    current.image.termsAccepted = false;
    const expected = fingerprintCurrentObservation(plan, current);
    expect(() => assertObservationFresh(plan, current, expected)).not.toThrow();
    current.regions[0].quotaAvailable = 9;
    expect(() => assertObservationFresh(plan, current, expected)).toThrow(/stale/i);
  });

  it('rejects obsolete full-catalog deploy fingerprints and preserves strict non-deploy fingerprints', () => {
    const oldPlan = structuredClone(plan);
    oldPlan.observationFingerprint = fingerprintObservation(observation, []);
    const { planId: _planId, planSha256: _planSha256, ...oldDraft } = oldPlan;
    oldPlan.planSha256 = canonicalSha256(oldDraft);
    oldPlan.planId = `azure-ce-${oldPlan.planSha256.slice(0, 24)}`;
    expect(() => assertObservationFresh(oldPlan, observation)).toThrow(/stale/i);

    const lifecycleObservation = structuredClone(observation);
    lifecycleObservation.regions.push({
      name: 'eastus',
      rank: 2,
      eligible: false,
      reasons: ['quota'],
      zones: [],
      routeServerSupported: true,
      quotaAvailable: 0,
      policyAllowed: true,
      vmSizes: [],
    });
    for (const operation of ['reconcile', 'teardown'] as const) {
      const lifecycle = compileAzureCePlan({ ...intent, operation }, lifecycleObservation);
      const current = structuredClone(lifecycleObservation);
      current.regions[1].rank++;
      expect(() => assertObservationFresh(lifecycle, current), operation).toThrow(/stale/i);
    }
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

it('does not promote apply authorization into an ad hoc Marketplace terms action or teardown authorization', () => {
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
  expect(() => assertApplyAllowed(termsPlan, request)).toThrow('exact initial Terraform foundation action');
  expect(() =>
    assertApplyAllowed(termsPlan, { ...request, authorization: { ...request.authorization, terms: true } }),
  ).toThrow('exact initial Terraform foundation action');
});

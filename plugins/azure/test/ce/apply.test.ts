import { describe, expect, it } from 'bun:test';
import { assertActionOwnership, assertApplyAllowed, assertObservationFresh } from '../../src/ce/apply';
import { fingerprintObservation } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import type { AzureCeIntent, AzureCeObservation } from '../../src/ce/types';

const subscriptionId = '11111111-1111-4111-8111-111111111111';
const sharedContractUrl = 'https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt';
const intent: AzureCeIntent = {
  schemaVersion: 2,
  operation: 'deploy',
  subscriptionId,
  deploymentName: 'ce-demo',
  siteName: 'ce-demo',
  namespace: 'system',
  resourceGroup: 'rg-ce-demo',
  region: 'canadacentral',
  topology: { ha: false },
  nics: [{ name: 'slo', role: 'slo', subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'slo' } }],
  egress: { mode: 'public-ip' },
  routing: { mode: 'auto', destinationCidrs: [] },
  securityRules: [],
  image: { publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce' },
  vm: { size: 'Standard_D8s_v5' },
  brownfield: { resourceIds: [], routeChanges: [] },
};
const observation: AzureCeObservation = {
  schemaVersion: 2,
  subscription: { id: subscriptionId, tenantId: '22222222-2222-4222-8222-222222222222', cloud: 'AzureCloud' },
  image: {
    publisher: 'f5-networks',
    offer: 'f5xc-customer-edge',
    plan: 'f5xc-ce',
    version: '1.0.0',
    urn: 'f5-networks:f5xc-customer-edge:f5xc-ce:1.0.0',
    termsAccepted: true,
  },
  regions: [
    {
      name: 'canadacentral',
      rank: 1,
      eligible: true,
      reasons: [],
      zones: ['1'],
      routeServerSupported: true,
      quotaAvailable: 8,
      policyAllowed: true,
      vmSizes: [{ name: 'Standard_D8s_v5', maxNics: 8, vCpus: 8, memoryGb: 32, zones: ['1'], restricted: false }],
    },
  ],
  resources: [],
  research: {
    method: 'azure-cli-live',
    officialSourceRetrieval: 'live',
    catalogRegion: 'canadacentral',
    commands: [
      'az vm image list-publishers',
      'az vm image list-offers',
      'az vm image list-skus',
      'az vm image list',
      'az vm image terms show',
      'az vm list-skus --all',
    ],
    officialSources: ['https://docs.cloud.f5.com/example', 'https://learn.microsoft.com/example'],
    sourceReceipts: [
      { url: 'https://docs.cloud.f5.com/example', normalizedSha256: '1'.repeat(64) },
      { url: 'https://learn.microsoft.com/example', normalizedSha256: '2'.repeat(64) },
      { url: sharedContractUrl, normalizedSha256: '3'.repeat(64) },
    ],
    sharedContract: {
      url: sharedContractUrl,
      contractId: 'f5xc-ce-automation',
      contractVersion: 'v1',
      normalizedSha256: '3'.repeat(64),
    },
  },
};

describe('Azure CE apply protections', () => {
  const plan = compileAzureCePlan(intent, observation);

  it('rejects changed observations before mutation', () => {
    const changed = structuredClone(observation);
    changed.image.version = '1.0.1';
    changed.image.urn = 'f5-networks:f5xc-customer-edge:f5xc-ce:1.0.1';
    expect(() => assertObservationFresh(plan, changed)).toThrow(/stale/i);
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

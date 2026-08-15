import { describe, expect, it } from 'bun:test';
import { discoverAzureCompute } from '../../src/ce/discovery';
import type { AzExecApi } from '../../src/az/exec';

function api(fixtures: Record<string, unknown>): AzExecApi {
  return {
    async exec(_command, args) {
      const key = args.filter((arg) => arg !== '--output' && arg !== 'json').join(' ');
      const value = fixtures[key];
      if (value === undefined && key.startsWith('group show ')) return { stdout: '', stderr: 'ResourceGroupNotFound', exitCode: 1 };
      if (value === undefined && key.startsWith('vm image show ')) return { stdout: '{}', stderr: '', exitCode: 0 };
      if (value === undefined) return { stdout: '', stderr: `missing fixture: ${key}`, exitCode: 1 };
      return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
    },
  };
}

const subscriptionId = '11111111-1111-4111-8111-111111111111';
const baseFixtures: Record<string, unknown> = {
  'account show --subscription 11111111-1111-4111-8111-111111111111': {
    id: subscriptionId, tenantId: '22222222-2222-4222-8222-222222222222', environmentName: 'AzureCloud',
  },
  'rest --method get --url https://management.azure.com/subscriptions/11111111-1111-4111-8111-111111111111/locations?api-version=2022-12-01': { value: [
    { name: 'eastus', metadata: { regionType: 'Physical' } },
    { name: 'canadacentral', metadata: { regionType: 'Physical' } },
  ] },
  'vm image list --publisher f5-networks --offer f5xc-customer-edge --sku f5xc-ce --all --subscription 11111111-1111-4111-8111-111111111111': [
    { publisher: 'f5-networks', offer: 'f5xc-customer-edge', sku: 'f5xc-ce', version: '2026.08.14', urn: 'f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.14' },
    { publisher: 'f5-networks', offer: 'f5xc-customer-edge', sku: 'f5xc-ce', version: '2026.08.15', urn: 'f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.15' },
  ],
  'vm image terms show --urn f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.15 --subscription 11111111-1111-4111-8111-111111111111': { accepted: true, plan: 'f5xc-ce' },
  'vm list-skus --all --subscription 11111111-1111-4111-8111-111111111111': [{
    name: 'Standard_D8s_v5', resourceType: 'virtualMachines', restrictions: [], capabilities: [{ name: 'MaxNetworkInterfaces', value: '8' }, { name: 'vCPUs', value: '8' }, { name: 'MemoryGB', value: '32' }],
    locationInfo: [
      { location: 'eastus', zones: ['1', '2', '3'] },
      { location: 'canadacentral', zones: ['1', '2', '3'] },
    ],
  }],
  'provider show --namespace Microsoft.Network --subscription 11111111-1111-4111-8111-111111111111': {
    resourceTypes: [{ resourceType: 'virtualHubs', locations: ['East US', 'Canada Central'] }],
  },
  'policy state list --subscription 11111111-1111-4111-8111-111111111111': [],
  'resource list --tag xcsh-deployment-id=ce-demo --subscription 11111111-1111-4111-8111-111111111111': [],
  'vm list-usage --location canadacentral --subscription 11111111-1111-4111-8111-111111111111': [{ name: { value: 'cores' }, currentValue: 4, limit: 32 }],
  'vm list-usage --location eastus --subscription 11111111-1111-4111-8111-111111111111': [{ name: { value: 'cores' }, currentValue: 31, limit: 32 }],
};

describe('discoverAzureCompute', () => {
  it('pins the newest exact non-latest image and ranks every physical region', async () => {
    const result = await discoverAzureCompute({
      subscriptionId, publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce',
      deploymentName: 'ce-demo', resourceGroup: 'rg-ce-demo',
      vmSize: 'Standard_D8s_v5', requiredNics: 8, nodeCount: 3, brownfieldResourceIds: [],
    }, api(baseFixtures));
    expect(result.image.version).toBe('2026.08.15');
    expect(result.regions.map((region) => region.name).sort()).toEqual(['canadacentral', 'eastus']);
    expect(result.regions.find((region) => region.name === 'canadacentral')?.eligible).toBe(true);
    expect(result.regions.find((region) => region.name === 'eastus')?.eligible).toBe(false);
    expect(result.regions[0].name).toBe('canadacentral');
  });

  it('records terms, policy, NIC, zone, quota, and Route Server restrictions as reasons', async () => {
    const fixtures = structuredClone(baseFixtures);
    fixtures['policy state list --subscription 11111111-1111-4111-8111-111111111111'] = [
      { complianceState: 'NonCompliant', resourceLocation: 'canadacentral', policyDefinitionAction: 'deny' },
    ];
    const result = await discoverAzureCompute({
      subscriptionId, publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce',
      deploymentName: 'ce-demo', resourceGroup: 'rg-ce-demo',
      vmSize: 'Standard_D8s_v5', requiredNics: 8, nodeCount: 3, requireRouteServer: true, brownfieldResourceIds: [],
    }, api(fixtures));
    expect(result.regions.find((region) => region.name === 'canadacentral')?.reasons).toContain('policy-deny');
  });

  it('keeps an otherwise valid HA region eligible when zones require a declared fallback', async () => {
    const fixtures = structuredClone(baseFixtures);
    const skus = fixtures['vm list-skus --all --subscription 11111111-1111-4111-8111-111111111111'] as Array<Record<string, any>>;
    skus[0].locationInfo[1].zones = ['1'];
    const result = await discoverAzureCompute({
      subscriptionId, publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce',
      deploymentName: 'ce-demo', resourceGroup: 'rg-ce-demo', vmSize: 'Standard_D8s_v5', requiredNics: 2,
      nodeCount: 3, brownfieldResourceIds: [],
    }, api(fixtures));
    const canada = result.regions.find((region) => region.name === 'canadacentral');
    expect(canada?.eligible).toBe(true);
    expect(canada?.reasons).toContain('fewer-than-three-zones');
  });

  it('selects the matching regional record when Azure repeats a VM size per location', async () => {
    const fixtures = structuredClone(baseFixtures);
    fixtures['vm list-skus --all --subscription 11111111-1111-4111-8111-111111111111'] = [
      { name: 'Standard_D8s_v5', resourceType: 'virtualMachines', restrictions: [], capabilities: [{ name: 'MaxNetworkInterfaces', value: '8' }, { name: 'vCPUs', value: '8' }, { name: 'MemoryGB', value: '32' }], locationInfo: [{ location: 'eastus', zones: ['1'] }] },
      { name: 'Standard_D8s_v5', resourceType: 'virtualMachines', restrictions: [], capabilities: [{ name: 'MaxNetworkInterfaces', value: '8' }, { name: 'vCPUs', value: '8' }, { name: 'MemoryGB', value: '32' }], locationInfo: [{ location: 'canadacentral', zones: ['1', '2', '3'] }] },
    ];
    const result = await discoverAzureCompute({
      subscriptionId, publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce',
      deploymentName: 'ce-demo', resourceGroup: 'rg-ce-demo', vmSize: 'Standard_D8s_v5', requiredNics: 2,
      nodeCount: 1, brownfieldResourceIds: [],
    }, api(fixtures));
    expect(result.regions.find((region) => region.name === 'canadacentral')?.eligible).toBe(true);
  });

  it('rejects latest and resource IDs from another subscription before CLI calls', async () => {
    await expect(discoverAzureCompute({
      subscriptionId, publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce', version: 'latest',
      deploymentName: 'ce-demo', resourceGroup: 'rg-ce-demo',
      vmSize: 'Standard_D8s_v5', requiredNics: 2, nodeCount: 1, brownfieldResourceIds: [],
    }, api(baseFixtures))).rejects.toThrow(/latest/i);

    await expect(discoverAzureCompute({
      subscriptionId, publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce',
      deploymentName: 'ce-demo', resourceGroup: 'rg-ce-demo',
      vmSize: 'Standard_D8s_v5', requiredNics: 2, nodeCount: 1,
      brownfieldResourceIds: ['/subscriptions/33333333-3333-4333-8333-333333333333/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet'],
    }, api(baseFixtures))).rejects.toThrow(/subscription/i);
  });
});

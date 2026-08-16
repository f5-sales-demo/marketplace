import { describe, expect, it } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import {
  type AzureComputeDiscoveryInput,
  discoverAzureCompute as discoverAzureComputeWithOfficialResearch,
} from '../../src/ce/discovery';

const officialFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = url.includes('/automation-contract.txt')
    ? 'contract_id: f5xc-ce-automation\ncontract_version: v1\ncombined: f5xc-ce-automation/v1\n' +
      'provider-neutral guidance '.repeat(12)
    : 'official guidance '.repeat(20);
  return new Response(body, { status: 200 });
}) as typeof fetch;

function discoverAzureCompute(input: AzureComputeDiscoveryInput, azureApi: AzExecApi) {
  return discoverAzureComputeWithOfficialResearch(input, azureApi, officialFetch);
}

function api(fixtures: Record<string, unknown>, calls: string[] = []): AzExecApi {
  return {
    async exec(_command, args) {
      const key = args.filter((arg) => arg !== '--output' && arg !== 'json').join(' ');
      calls.push(key);
      const value = fixtures[key];
      if (value === undefined && key.startsWith('group show '))
        return { stdout: '', stderr: 'ResourceGroupNotFound', exitCode: 1 };
      if (value === undefined && key.startsWith('vm image show ')) return { stdout: '{}', stderr: '', exitCode: 0 };
      if (value === undefined) return { stdout: '', stderr: `missing fixture: ${key}`, exitCode: 1 };
      return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
    },
  };
}

const subscriptionId = '11111111-1111-4111-8111-111111111111';
const baseFixtures: Record<string, unknown> = {
  'account show --subscription 11111111-1111-4111-8111-111111111111': {
    id: subscriptionId,
    tenantId: '22222222-2222-4222-8222-222222222222',
    environmentName: 'AzureCloud',
  },
  'rest --method get --url https://management.azure.com/subscriptions/11111111-1111-4111-8111-111111111111/locations?api-version=2022-12-01':
    {
      value: [
        { name: 'eastus', metadata: { regionType: 'Physical' } },
        { name: 'canadacentral', metadata: { regionType: 'Physical' } },
      ],
    },
  'vm image list-publishers --location canadacentral --subscription 11111111-1111-4111-8111-111111111111': [
    { name: 'Canonical' },
    { name: 'f5-networks' },
  ],
  'vm image list-offers --location canadacentral --publisher f5-networks --subscription 11111111-1111-4111-8111-111111111111':
    [{ name: 'f5-big-ip-best' }, { name: 'f5xc_customer_edge' }],
  'vm image list-skus --location canadacentral --publisher f5-networks --offer f5xc_customer_edge --subscription 11111111-1111-4111-8111-111111111111':
    [
      { name: 'f5-distributed-cloud-customer-edge-internal' },
      { name: 'f5xc-ce-crt-20250701' },
      { name: 'f5xc-ce-crt-20260201' },
    ],
  'vm image list --location canadacentral --publisher f5-networks --offer f5xc_customer_edge --sku f5xc-ce-crt-20260201 --all --subscription 11111111-1111-4111-8111-111111111111':
    [
      {
        publisher: 'f5-networks',
        offer: 'f5xc_customer_edge',
        sku: 'f5xc-ce-crt-20260201',
        version: '20260201.0177.1',
        urn: 'f5-networks:f5xc_customer_edge:f5xc-ce-crt-20260201:20260201.0177.1',
      },
      {
        publisher: 'f5-networks',
        offer: 'f5xc_customer_edge',
        sku: 'f5xc-ce-crt-20260201',
        version: '20260201.0178.1',
        urn: 'f5-networks:f5xc_customer_edge:f5xc-ce-crt-20260201:20260201.0178.1',
      },
    ],
  'vm image terms show --urn f5-networks:f5xc_customer_edge:f5xc-ce-crt-20260201:20260201.0178.1 --subscription 11111111-1111-4111-8111-111111111111':
    { accepted: true, plan: 'f5xc-ce-crt-20260201' },
  'vm image list --publisher f5-networks --offer f5xc-customer-edge --sku f5xc-ce --all --subscription 11111111-1111-4111-8111-111111111111':
    [
      {
        publisher: 'f5-networks',
        offer: 'f5xc-customer-edge',
        sku: 'f5xc-ce',
        version: '2026.08.14',
        urn: 'f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.14',
      },
      {
        publisher: 'f5-networks',
        offer: 'f5xc-customer-edge',
        sku: 'f5xc-ce',
        version: '2026.08.15',
        urn: 'f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.15',
      },
    ],
  'vm image terms show --urn f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.15 --subscription 11111111-1111-4111-8111-111111111111':
    { accepted: true, plan: 'f5xc-ce' },
  'vm list-skus --all --subscription 11111111-1111-4111-8111-111111111111': [
    {
      name: 'Standard_D8s_v5',
      resourceType: 'virtualMachines',
      restrictions: [],
      capabilities: [
        { name: 'MaxNetworkInterfaces', value: '8' },
        { name: 'vCPUs', value: '8' },
        { name: 'MemoryGB', value: '32' },
      ],
      locationInfo: [
        { location: 'eastus', zones: ['1', '2', '3'] },
        { location: 'canadacentral', zones: ['1', '2', '3'] },
      ],
    },
  ],
  'provider show --namespace Microsoft.Network --subscription 11111111-1111-4111-8111-111111111111': {
    resourceTypes: [{ resourceType: 'virtualHubs', locations: ['East US', 'Canada Central'] }],
  },
  'policy state list --subscription 11111111-1111-4111-8111-111111111111': [],
  'resource list --tag xcsh-deployment-id=ce-demo --subscription 11111111-1111-4111-8111-111111111111': [],
  'vm list-usage --location canadacentral --subscription 11111111-1111-4111-8111-111111111111': [
    { name: { value: 'cores' }, currentValue: 4, limit: 32 },
  ],
  'vm list-usage --location eastus --subscription 11111111-1111-4111-8111-111111111111': [
    { name: { value: 'cores' }, currentValue: 31, limit: 32 },
  ],
};

describe('discoverAzureCompute', () => {
  it('fails closed when current official guidance cannot be retrieved', async () => {
    const unavailable = (async () => new Response('unavailable', { status: 503 })) as typeof fetch;
    const calls: string[] = [];
    await expect(
      discoverAzureComputeWithOfficialResearch(
        {
          subscriptionId,
          deploymentName: 'ce-demo',
          resourceGroup: 'rg-ce-demo',
          requiredNics: 2,
          nodeCount: 1,
          brownfieldResourceIds: [],
        },
        api(baseFixtures, calls),
        unavailable,
      ),
    ).rejects.toThrow(/Official CE research failed/);
    expect(calls).toEqual([]);
  });

  it('researches the live catalog and compatible VM sizes without guessed identifiers', async () => {
    const calls: string[] = [];
    const result = await discoverAzureCompute(
      {
        subscriptionId,
        deploymentName: 'ce-demo',
        resourceGroup: 'rg-ce-demo',
        requiredNics: 8,
        nodeCount: 3,
        brownfieldResourceIds: [],
      },
      api(baseFixtures, calls),
    );

    expect(result.image).toEqual({
      publisher: 'f5-networks',
      offer: 'f5xc_customer_edge',
      plan: 'f5xc-ce-crt-20260201',
      version: '20260201.0178.1',
      urn: 'f5-networks:f5xc_customer_edge:f5xc-ce-crt-20260201:20260201.0178.1',
      termsAccepted: true,
    });
    expect(result.regions[0].vmSizes[0].name).toBe('Standard_D8s_v5');
    expect(result.research.method).toBe('azure-cli-live');
    expect(result.research.officialSourceRetrieval).toBe('live');
    expect(result.schemaVersion).toBe(2);
    expect(result.research.sharedContract).toMatchObject({
      contractId: 'f5xc-ce-automation',
      contractVersion: 'v1',
    });
    expect(result.research.sharedContract.normalizedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.research.sourceReceipts).toHaveLength(4);
    expect(result.research.catalogRegion).toBe('canadacentral');
    expect(calls).toContain(
      'vm image list-publishers --location canadacentral --subscription 11111111-1111-4111-8111-111111111111',
    );
    expect(calls).toContain(
      'vm image list-offers --location canadacentral --publisher f5-networks --subscription 11111111-1111-4111-8111-111111111111',
    );
    expect(calls).toContain(
      'vm image list-skus --location canadacentral --publisher f5-networks --offer f5xc_customer_edge --subscription 11111111-1111-4111-8111-111111111111',
    );
  });

  it('pins the newest exact non-latest image and ranks every physical region', async () => {
    const result = await discoverAzureCompute(
      {
        subscriptionId,
        deploymentName: 'ce-demo',
        resourceGroup: 'rg-ce-demo',
        vmSize: 'Standard_D8s_v5',
        requiredNics: 8,
        nodeCount: 3,
        brownfieldResourceIds: [],
      },
      api(baseFixtures),
    );
    expect(result.image.version).toBe('20260201.0178.1');
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
    const result = await discoverAzureCompute(
      {
        subscriptionId,
        deploymentName: 'ce-demo',
        resourceGroup: 'rg-ce-demo',
        vmSize: 'Standard_D8s_v5',
        requiredNics: 8,
        nodeCount: 3,
        requireRouteServer: true,
        brownfieldResourceIds: [],
      },
      api(fixtures),
    );
    expect(result.regions.find((region) => region.name === 'canadacentral')?.reasons).toContain('policy-deny');
  });

  it('selects a live compatible VM candidate instead of a restricted lower-cost size', async () => {
    const fixtures = structuredClone(baseFixtures);
    const skus = fixtures['vm list-skus --all --subscription 11111111-1111-4111-8111-111111111111'] as Array<
      Record<string, unknown>
    >;
    skus[0].restrictions = [{ restrictionInfo: { locations: ['canadacentral'] } }];
    skus.push({
      name: 'Standard_E8s_v5',
      resourceType: 'virtualMachines',
      restrictions: [],
      capabilities: [
        { name: 'MaxNetworkInterfaces', value: '8' },
        { name: 'vCPUs', value: '8' },
        { name: 'MemoryGB', value: '64' },
      ],
      locationInfo: [{ location: 'canadacentral', zones: ['1', '2', '3'] }],
    });
    const result = await discoverAzureCompute(
      {
        subscriptionId,
        deploymentName: 'ce-demo',
        resourceGroup: 'rg-ce-demo',
        requiredNics: 8,
        nodeCount: 1,
        brownfieldResourceIds: [],
      },
      api(fixtures),
    );
    expect(result.regions[0].name).toBe('canadacentral');
    expect(result.regions[0].vmSizes[0].name).toBe('Standard_E8s_v5');
  });

  it('keeps an otherwise valid HA region eligible when zones require a declared fallback', async () => {
    const fixtures = structuredClone(baseFixtures);
    const skus = fixtures['vm list-skus --all --subscription 11111111-1111-4111-8111-111111111111'] as Array<{
      locationInfo: Array<{ zones: string[] }>;
    }>;
    skus[0].locationInfo[1].zones = ['1'];
    const result = await discoverAzureCompute(
      {
        subscriptionId,
        deploymentName: 'ce-demo',
        resourceGroup: 'rg-ce-demo',
        vmSize: 'Standard_D8s_v5',
        requiredNics: 2,
        nodeCount: 3,
        brownfieldResourceIds: [],
      },
      api(fixtures),
    );
    const canada = result.regions.find((region) => region.name === 'canadacentral');
    expect(canada?.eligible).toBe(true);
    expect(canada?.reasons).toContain('fewer-than-three-zones');
  });

  it('selects the matching regional record when Azure repeats a VM size per location', async () => {
    const fixtures = structuredClone(baseFixtures);
    fixtures['vm list-skus --all --subscription 11111111-1111-4111-8111-111111111111'] = [
      {
        name: 'Standard_D8s_v5',
        resourceType: 'virtualMachines',
        restrictions: [],
        capabilities: [
          { name: 'MaxNetworkInterfaces', value: '8' },
          { name: 'vCPUs', value: '8' },
          { name: 'MemoryGB', value: '32' },
        ],
        locationInfo: [{ location: 'eastus', zones: ['1'] }],
      },
      {
        name: 'Standard_D8s_v5',
        resourceType: 'virtualMachines',
        restrictions: [],
        capabilities: [
          { name: 'MaxNetworkInterfaces', value: '8' },
          { name: 'vCPUs', value: '8' },
          { name: 'MemoryGB', value: '32' },
        ],
        locationInfo: [{ location: 'canadacentral', zones: ['1', '2', '3'] }],
      },
    ];
    const result = await discoverAzureCompute(
      {
        subscriptionId,
        deploymentName: 'ce-demo',
        resourceGroup: 'rg-ce-demo',
        vmSize: 'Standard_D8s_v5',
        requiredNics: 2,
        nodeCount: 1,
        brownfieldResourceIds: [],
      },
      api(fixtures),
    );
    expect(result.regions.find((region) => region.name === 'canadacentral')?.eligible).toBe(true);
  });

  it('rejects latest and resource IDs from another subscription before CLI calls', async () => {
    await expect(
      discoverAzureCompute(
        {
          subscriptionId,
          version: 'latest',
          deploymentName: 'ce-demo',
          resourceGroup: 'rg-ce-demo',
          vmSize: 'Standard_D8s_v5',
          requiredNics: 2,
          nodeCount: 1,
          brownfieldResourceIds: [],
        },
        api(baseFixtures),
      ),
    ).rejects.toThrow(/latest/i);

    await expect(
      discoverAzureCompute(
        {
          subscriptionId,
          deploymentName: 'ce-demo',
          resourceGroup: 'rg-ce-demo',
          vmSize: 'Standard_D8s_v5',
          requiredNics: 2,
          nodeCount: 1,
          brownfieldResourceIds: [
            '/subscriptions/33333333-3333-4333-8333-333333333333/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet',
          ],
        },
        api(baseFixtures),
      ),
    ).rejects.toThrow(/subscription/i);
  });
});

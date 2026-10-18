import type { AzureCeIntent, AzureCeObservation } from '../../src/ce/types';

export const subscriptionId = '00000000-0000-4000-8000-000000000001';
export const sharedContractUrl =
  'https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt';
export const intent: AzureCeIntent = {
  schemaVersion: 3,
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
export const observation: AzureCeObservation = {
  schemaVersion: 3,
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
      contractId: 'f5xc-ce-automation-policy',
      contractVersion: 'v2',
      normalizedSha256: '3'.repeat(64),
    },
  },
};

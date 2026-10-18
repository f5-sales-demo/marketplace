import type { GcpCeDiscovery, GcpCeIntent } from '../../src/ce/types';

const image = {
  id: '123',
  name: 'f5xc-cecrt-test',
  selfLink: 'https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/images/f5xc-cecrt-test',
  licenses: ['https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/licenses/ce-test'],
  architecture: 'X86_64',
  status: 'READY',
};
export function intent(): GcpCeIntent {
  return {
    schemaVersion: 1,
    project: 'test-project',
    region: 'northamerica-northeast1',
    deploymentName: 'ce-test',
    platformContext: 'lab',
    engine: 'native',
    operation: 'deploy',
    sites: [
      {
        name: 'ce-site',
        nodes: [
          {
            name: 'node-a',
            zone: 'northamerica-northeast1-a',
            interfaces: [
              { index: 0, role: 'slo', vrf: 'outside', network: 'outside', subnet: 'outside', cidr: '10.1.0.0/24' },
              { index: 1, role: 'sli', vrf: 'inside', network: 'inside', subnet: 'inside', cidr: '10.2.0.0/24' },
            ],
          },
        ],
      },
    ],
    machineType: 'n2-standard-8',
    diskGiB: 80,
    image,
    ipForwarding: true,
    egress: { mode: 'external-ip' },
    ingress: { profile: 'none' },
    routing: { profile: 'static-insertion', destinationCidrs: ['10.3.0.0/24'] },
  };
}
export function discovery(): GcpCeDiscovery {
  return {
    schemaVersion: 1,
    project: 'test-project',
    region: 'northamerica-northeast1',
    observedAt: new Date().toISOString(),
    receipts: [],
    images: [image],
    machineTypes: [{ name: 'n2-standard-8', zone: 'northamerica-northeast1-a', guestCpus: 8, memoryMb: 32768 }],
    billingEnabled: true,
    enabledApis: ['compute.googleapis.com', 'serviceusage.googleapis.com'],
    quotas: [],
    checks: {
      iam: 'unknown',
      organizationPolicy: 'unknown',
      zoneCapacity: 'unknown',
      machineNicLimit: 'unknown',
      licenseAcceptance: 'unknown',
    },
  };
}

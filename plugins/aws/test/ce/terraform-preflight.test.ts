import { expect, test } from 'bun:test';
import { assertAwsTerraformPreflight } from '../../src/ce/terraform-preflight';
import type { AwsCeObservation, AwsCePlan } from '../../src/ce/types';

function fixture() {
  const image = { id: 'ami-0123456789abcdef0', ssmVersion: 16, allowedByPolicy: true };
  const baseline = {
    identity: { accountId: '123456789012', partition: 'aws', awsProfile: 'approved' },
    agreement: { active: true, productId: 'approved-product' },
    f5CapabilitiesSha256: 'pinned-capabilities',
    research: { sourceReceipts: [{ url: 'https://docs.example.test', normalizedSha256: 'pinned-document' }] },
    regions: [
      {
        name: 'ca-west-1',
        enabled: true,
        eligible: true,
        ami: image,
        instanceTypes: [{ name: 'm5.2xlarge', supported: true, availabilityZones: ['ca-west-1a'] }],
        elasticIpCapacity: { available: 4, allocated: 1, reusableOwned: 1, requiredAdditional: 0 },
      },
    ],
  };
  const plan = {
    accountId: '123456789012',
    partition: 'aws',
    region: 'ca-west-1',
    intent: { awsProfile: 'approved' },
    f5CapabilitiesSha256: 'pinned-capabilities',
    image,
    instance: { type: 'm5.2xlarge' },
    topology: { availabilityZones: ['ca-west-1a'] },
  } as AwsCePlan;
  return {
    baseline,
    plan,
    check: (current: typeof baseline) =>
      assertAwsTerraformPreflight(
        plan,
        baseline as unknown as AwsCeObservation,
        current as unknown as AwsCeObservation,
      ),
  };
}
test('preflight permits capacity consumption by this deployment while retaining immutable input checks', () => {
  const f = fixture();
  const current = structuredClone(f.baseline);
  current.regions[0].elasticIpCapacity = { available: 2, allocated: 3, reusableOwned: 3, requiredAdditional: 0 };
  expect(() => f.check(current)).not.toThrow();
});
test('preflight rejects changed identity, agreement, capabilities, source receipts, image, capacity and offerings', () => {
  const f = fixture();
  const mutations: Array<(value: typeof f.baseline) => void> = [
    (v) => {
      v.identity.accountId = '000000000000';
    },
    (v) => {
      v.identity.awsProfile = 'foreign';
    },
    (v) => {
      v.agreement.active = false;
    },
    (v) => {
      v.f5CapabilitiesSha256 = 'changed';
    },
    (v) => {
      v.research.sourceReceipts[0].normalizedSha256 = 'changed';
    },
    (v) => {
      v.regions[0].ami.ssmVersion++;
    },
    (v) => {
      v.regions[0].eligible = false;
    },
    (v) => {
      v.regions[0].instanceTypes[0].supported = false;
    },
    (v) => {
      v.regions[0].instanceTypes[0].availabilityZones = [];
    },
    (v) => {
      v.regions.push(structuredClone(v.regions[0]));
    },
  ];
  for (const mutate of mutations) {
    const current = structuredClone(f.baseline);
    mutate(current);
    expect(() => f.check(current)).toThrow();
  }
});

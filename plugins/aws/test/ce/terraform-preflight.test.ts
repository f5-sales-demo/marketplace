import { expect, test } from 'bun:test';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { assertAwsTerraformPreflight, revalidateAwsTerraformPlan } from '../../src/ce/terraform-preflight';
import type { AwsCeObservation, AwsCePlan } from '../../src/ce/types';
import { brownfieldPlacementFixture } from './terraform-brownfield-fixture';

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

test('preflight rejects drift and missing evidence for referenced TGW resources', () => {
  const f = fixture();
  const plan = {
    ...f.plan,
    intent: {
      ...f.plan.intent,
      routing: { profile: 'tgw-connect', transitGatewayId: 'tgw-12345678', associations: [], propagations: [] },
    },
  } as AwsCePlan;
  const baseline = {
    ...f.baseline,
    resources: [
      {
        id: 'tgw-12345678',
        region: 'ca-west-1',
        exists: true,
        owned: false,
        tags: {},
        state: { TransitGateways: [{ TransitGatewayId: 'tgw-12345678', Options: { AmazonSideAsn: 64512 } }] },
      },
    ],
  } as unknown as AwsCeObservation;
  expect(() => assertAwsTerraformPreflight(plan, baseline, structuredClone(baseline))).not.toThrow();
  expect(() => assertAwsTerraformPreflight(plan, baseline, { ...baseline, resources: [] })).toThrow('reference');
  const changed = structuredClone(baseline);
  changed.resources[0].state = {
    TransitGateways: [{ TransitGatewayId: 'tgw-12345678', Options: { AmazonSideAsn: 65000 } }],
  };
  expect(() => assertAwsTerraformPreflight(plan, baseline, changed)).toThrow('reference');
});

test('preflight retains independently observed direct route tables and rejects drift or missing references', () => {
  const f = fixture();
  const plan = {
    ...f.plan,
    intent: {
      ...f.plan.intent,
      routing: { profile: 'direct-eni' },
      routes: [{ routeTableId: 'rtb-12345678', destinationCidr: '192.0.2.0/24', node: 1 }],
      brownfield: { routeTableIds: ['rtb-12345678'] },
    },
  } as AwsCePlan;
  const baseline = {
    ...f.baseline,
    resources: [
      {
        id: 'rtb-12345678',
        region: 'ca-west-1',
        exists: true,
        owned: false,
        tags: {},
        state: {
          RouteTables: [
            {
              RouteTableId: 'rtb-12345678',
              OwnerId: plan.accountId,
              VpcId: 'vpc-12345678',
              Associations: [],
              Routes: [
                {
                  DestinationCidrBlock: '192.0.2.0/24',
                  GatewayId: 'igw-12345678',
                  Origin: 'CreateRoute',
                  State: 'active',
                },
              ],
            },
          ],
        },
      },
    ],
  } as unknown as AwsCeObservation;
  expect(() => assertAwsTerraformPreflight(plan, baseline, structuredClone(baseline))).not.toThrow();
  expect(() => assertAwsTerraformPreflight(plan, baseline, { ...baseline, resources: [] })).toThrow('reference');
  const changed = structuredClone(baseline);
  changed.resources[0].state = {};
  expect(() => assertAwsTerraformPreflight(plan, baseline, changed)).toThrow('reference');
  const duplicate = { ...baseline, resources: [baseline.resources[0], baseline.resources[0]] };
  expect(() => assertAwsTerraformPreflight(plan, baseline, duplicate)).toThrow('reference');
});

test('real brownfield preflight validates snapshots and reaches scoped cloud inventory', async () => {
  const f = brownfieldPlacementFixture();
  f.plan = { ...f.plan, region: f.plan.intent.region } as AwsCePlan;
  const { canonicalSha256 } = await import('../../src/ce/canonical');
  const { planId: _id, planSha256: _sha, ...draft } = f.plan;
  const sha = canonicalSha256(draft);
  f.plan = { ...draft, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` } as AwsCePlan;
  let calls = 0;
  await expect(
    revalidateAwsTerraformPlan(f.plan, f.observation, {} as CePlatformService, {
      async exec(_command, args) {
        calls++;
        expect(args.slice(0, 2)).toEqual(['ec2', 'describe-addresses']);
        expect(args.slice(-2)).toEqual(['--profile', 'ce-profile']);
        return { exitCode: 1, stderr: 'unavailable', stdout: '' };
      },
    }),
  ).rejects.toThrow('EIP ownership is unavailable');
  expect(calls).toBe(1);
});

test('brownfield preflight retains all six immutable references and rejects missing or changed evidence', () => {
  const b = brownfieldPlacementFixture();
  const f = fixture();
  const plan = { ...f.plan, intent: { ...b.plan.intent, awsProfile: 'approved', routes: [] } } as AwsCePlan;
  const baseline = {
    ...f.baseline,
    resources: b.observation.resources.map((r) => ({ ...r, region: 'ca-west-1' })),
  } as unknown as AwsCeObservation;
  expect(() => assertAwsTerraformPreflight(plan, baseline, structuredClone(baseline))).not.toThrow();
  for (const reference of baseline.resources) {
    const missing = structuredClone(baseline);
    missing.resources = missing.resources.filter((r) => r.id !== reference.id);
    expect(() => assertAwsTerraformPreflight(plan, baseline, missing)).toThrow('reference');
    const changed = structuredClone(baseline);
    const row = changed.resources.find((r) => r.id === reference.id);
    if (!row) throw new Error('fixture reference missing');
    row.state = {};
    expect(() => assertAwsTerraformPreflight(plan, baseline, changed)).toThrow('reference');
  }
});

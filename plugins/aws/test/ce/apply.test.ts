import { describe, expect, it } from 'bun:test';
import { assertAwsApplyAllowed, assertAwsObservationFresh } from '../../src/ce/apply';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAwsCePlan } from '../../src/ce/planner';
import type { AwsCeIntent, AwsCeObservation } from '../../src/ce/types';
import {
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
} from '../../src/ce/types';

const intent: AwsCeIntent = {
  schemaVersion: 1,
  operation: 'deploy',
  accountId: '123456789012',
  partition: 'aws',
  region: 'us-east-1',
  deploymentName: 'ce-demo',
  siteName: 'ce-demo',
  namespace: 'system',
  topology: { nodeCount: 1 },
  vpc: { mode: 'greenfield', cidr: '10.0.0.0/16' },
  interfaces: [
    {
      index: 0,
      role: 'slo',
      vrf: 'default',
      subnets: [{ availabilityZone: 'us-east-1a', cidr: '10.0.0.0/24' }],
      addressing: { mode: 'dhcp' },
    },
  ],
  egress: { mode: 'elastic-ip' },
  routing: { profile: 'direct-eni', destinationCidrs: [], associations: [], propagations: [] },
  image: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, amiId: 'ami-0123456789abcdef0' },
  instance: { type: 'm6i.2xlarge', diskGiB: AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB },
  securityGroups: [],
  routes: [],
  brownfield: { resourceIds: [], routeTableIds: [], transitGatewayRouteTableIds: [] },
};
const capabilities = {
  smsv2ContractVersion: 'v2' as const,
  supportedProviders: ['aws' as const],
  bootstrapDrivers: ['api' as const],
  providerNetworkingProfiles: { aws: ['direct-eni'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};
const observation: AwsCeObservation = {
  schemaVersion: 1,
  identity: { accountId: '123456789012', partition: 'aws', arn: 'arn:aws:iam::123456789012:role/example' },
  agreement: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, active: true, agreementIds: ['agreement'] },
  resources: [],
  ownershipPlanSha256s: [],
  f5Capabilities: capabilities,
  f5CapabilitiesSha256: canonicalSha256(capabilities),
  regions: [
    {
      name: 'us-east-1',
      optInStatus: 'opt-in-not-required',
      enabled: true,
      rank: 1,
      eligible: true,
      reasons: [],
      ami: {
        id: 'ami-0123456789abcdef0',
        ssmParameter: AWS_CE_SSM_PARAMETER,
        ssmVersion: 1,
        ownerAlias: 'aws-marketplace',
        ownerId: '679593333241',
        productCodes: ['code'],
        architecture: 'x86_64',
        creationDate: '2026-08-01',
        state: 'available',
        rootDeviceName: '/dev/sda1',
        rootVolumeGiB: 80,
        launchPermission: true,
        allowedByPolicy: true,
      },
      instanceTypes: [
        {
          name: 'm6i.2xlarge',
          vCpus: 8,
          memoryMiB: 32768,
          maxEnis: 8,
          ipv4PerEni: 30,
          availabilityZones: ['us-east-1a'],
          supported: true,
          reasons: [],
        },
      ],
      vcpuQuota: 64,
      networkQuotas: [],
      transitGatewaySupported: true,
      brownfieldProximity: 0,
    },
  ],
  research: {
    method: 'aws-cli-live',
    officialSourceRetrieval: 'live',
    commands: [
      'aws sts get-caller-identity',
      'aws ec2 describe-regions --all-regions',
      `aws ssm get-parameter --name ${AWS_CE_SSM_PARAMETER}`,
      'aws ec2 describe-images',
      'aws ec2 describe-image-attribute',
      'aws ec2 get-allowed-images-settings',
      'aws ec2 describe-instance-types',
      'aws ec2 describe-instance-type-offerings',
      'aws service-quotas get-service-quota',
      'aws service-quotas list-service-quotas',
      'aws marketplace-agreement search-agreements',
    ],
    officialSources: [AWS_CE_F5_GUIDE_URL],
    sourceReceipts: [
      { url: AWS_CE_SHARED_CONTRACT_URL, normalizedSha256: '1'.repeat(64) },
      { url: AWS_CE_F5_GUIDE_URL, normalizedSha256: '2'.repeat(64) },
    ],
    sharedContract: {
      url: AWS_CE_SHARED_CONTRACT_URL,
      contractId: 'f5xc-ce-automation',
      contractVersion: 'v1',
      normalizedSha256: '1'.repeat(64),
    },
    f5AwsGuide: { url: AWS_CE_F5_GUIDE_URL, normalizedSha256: '2'.repeat(64), tgwConnectDocumented: false },
  },
};

describe('AWS CE apply protections', () => {
  const plan = compileAwsCePlan(intent, observation);
  it('rejects changed source/capability observations before mutation', () => {
    const changed = structuredClone(observation);
    changed.research.sharedContract.normalizedSha256 = '3'.repeat(64);
    expect(() => assertAwsObservationFresh(plan, changed)).toThrow(/stale/i);
  });
  it('requires exact identity and provider-neutral headless gates', () => {
    expect(() =>
      assertAwsApplyAllowed(plan, { planId: plan.planId, planSha256: '0'.repeat(64), hasUI: true, env: {} }),
    ).toThrow(/hash/i);
    expect(() =>
      assertAwsApplyAllowed(plan, { planId: plan.planId, planSha256: plan.planSha256, hasUI: false, env: {} }),
    ).toThrow(/XCSH_CE_HEADLESS/);
  });
});

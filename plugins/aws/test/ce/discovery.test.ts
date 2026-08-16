import { describe, expect, it } from 'bun:test';
import type { AwsExecApi } from '../../src/aws/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { discoverAwsCompute, extractF5AwsGuideDocument, isF5Smsv2TgwConnectDocumented } from '../../src/ce/discovery';
import { AWS_CE_SHARED_CONTRACT_URL, AWS_CE_SSM_PARAMETER } from '../../src/ce/types';

const capabilities = {
  smsv2ContractVersion: 'v2' as const,
  supportedProviders: ['aws' as const],
  bootstrapDrivers: ['api' as const],
  providerNetworkingProfiles: { aws: ['direct-eni', 'nlb-ingress', 'tgw-static'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};

function fetcher(url: string | URL | Request): Promise<Response> {
  const href = String(url);
  const body =
    href === AWS_CE_SHARED_CONTRACT_URL
      ? `contract_id: f5xc-ce-automation\ncontract_version: v1\ncontract: f5xc-ce-automation/v1\n${'provider neutral safety '.repeat(8)}`
      : `${href}\nSecure Mesh Site v2 Customer Edge current official documentation. ${'verified provider guidance '.repeat(8)}`;
  return Promise.resolve(new Response(body, { status: 200 }));
}

class FixtureApi implements AwsExecApi {
  calls: string[][] = [];
  constructor(private readonly denyImageAttribute = false) {}
  async exec(_command: string, args: string[]) {
    this.calls.push(args);
    const operation = `${args[0]} ${args[1]}`;
    if (operation === 'ec2 describe-image-attribute' && this.denyImageAttribute)
      return { stdout: '', stderr: 'AuthFailure: Not authorized for public Marketplace image attribute', exitCode: 1 };
    const output = (() => {
      switch (operation) {
        case 'sts get-caller-identity':
          return { Account: '123456789012', Arn: 'arn:aws:iam::123456789012:role/fixture', UserId: 'fixture' };
        case 'ec2 describe-regions':
          return {
            Regions: [
              { RegionName: 'us-west-2', OptInStatus: 'not-opted-in' },
              { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
            ],
          };
        case 'marketplace-agreement search-agreements':
          return { agreementViewSummaries: [{ agreementId: 'agreement-1', status: 'ACTIVE' }] };
        case 'ssm get-parameter':
          return { Parameter: { Value: 'ami-0123456789abcdef0', Version: 12 } };
        case 'ec2 get-allowed-images-settings':
          return { State: 'disabled' };
        case 'ec2 describe-images':
          return {
            Images: [
              {
                ImageId: 'ami-0123456789abcdef0',
                ImageOwnerAlias: 'aws-marketplace',
                OwnerId: '679593333241',
                ProductCodes: [{ ProductCodeId: 'marketplace-code' }],
                Architecture: 'x86_64',
                CreationDate: '2026-08-01T00:00:00Z',
                State: 'available',
                Public: true,
                RootDeviceName: '/dev/sda1',
                BlockDeviceMappings: [{ DeviceName: '/dev/sda1', Ebs: { VolumeSize: 80 } }],
              },
            ],
          };
        case 'ec2 describe-image-attribute':
          return { LaunchPermissions: [{ Group: 'all' }] };
        case 'ec2 describe-instance-types':
          return {
            InstanceTypes: [
              {
                InstanceType: 'm6i.2xlarge',
                VCpuInfo: { DefaultVCpus: 8 },
                MemoryInfo: { SizeInMiB: 32768 },
                NetworkInfo: { MaximumNetworkInterfaces: 8, Ipv4AddressesPerInterface: 30 },
              },
            ],
          };
        case 'ec2 describe-instance-type-offerings':
          return {
            InstanceTypeOfferings: ['a', 'b', 'c'].map((zone) => ({
              InstanceType: 'm6i.2xlarge',
              Location: `us-east-1${zone}`,
            })),
          };
        case 'service-quotas get-service-quota':
          return { Quota: { Value: 64 } };
        case 'service-quotas list-service-quotas':
          return {
            Quotas: [
              { QuotaCode: 'L-EIP', QuotaName: 'EC2-VPC Elastic IPs per Region', Value: 20 },
              { QuotaCode: 'L-NLB', QuotaName: 'Network Load Balancers per Region', Value: 50 },
            ],
          };
        case 'ec2 describe-transit-gateways':
          return { TransitGateways: [] };
        default:
          throw new Error(`Unexpected fixture command: ${operation}`);
      }
    })();
    return { stdout: JSON.stringify(output), stderr: '', exitCode: 0 };
  }
}

describe('discoverAwsCompute', () => {
  it('ignores ancillary HTML references when checking the F5 TGW Connect release gate', () => {
    const compiledSource = `${'Secure Mesh Site v2 AWS guide. '.repeat(8)}No supported TGW Connect schema is documented.`;
    const payload = JSON.stringify({ props: { pageProps: { docData: { compiledSource } } } });
    const html = `<html><body>Transit Gateway Connect GRE BGP legacy navigation<script id="__NEXT_DATA__" type="application/json">${payload}</script></body></html>`;
    const extracted = extractF5AwsGuideDocument(html);
    expect(extracted).toBe(compiledSource);
    expect(isF5Smsv2TgwConnectDocumented(extracted)).toBe(false);
  });

  it('retrieves current sources, authenticates, and ranks every region deterministically', async () => {
    const api = new FixtureApi();
    const observation = await discoverAwsCompute(
      {
        accountId: '123456789012',
        partition: 'aws',
        deploymentName: 'fixture',
        requiredEnis: 8,
        nodeCount: 3,
        instanceTypes: ['m6i.2xlarge'],
        brownfieldResourceIds: [],
        egressMode: 'elastic-ip',
        routingProfile: 'nlb-ingress',
        f5Capabilities: capabilities,
      },
      api,
      fetcher as typeof fetch,
    );
    expect(observation.regions.map((region) => region.name)).toEqual(['us-east-1', 'us-west-2']);
    expect(observation.regions[0].ami?.ssmParameter).toBe(AWS_CE_SSM_PARAMETER);
    expect(observation.regions[0].ami?.ssmVersion).toBe(12);
    expect(observation.regions[0].networkQuotas.length).toBeGreaterThan(0);
    expect(observation.regions[1].reasons).toEqual(['region-disabled']);
    expect(observation.agreement.active).toBe(true);
    expect(observation.f5CapabilitiesSha256).toBe(canonicalSha256(capabilities));
    expect(observation.research.sourceReceipts.length).toBeGreaterThan(6);
    expect(observation.research.f5AwsGuide.tgwConnectDocumented).toBe(false);
    expect(api.calls.filter((args) => args.includes('us-west-2'))).toHaveLength(0);
    expect(api.calls.find((args) => args[0] === 'marketplace-agreement')?.join(' ')).toContain('AgreementType');
  });

  it('uses the public Marketplace AMI flag when its seller-owned launchPermission attribute is unreadable', async () => {
    const observation = await discoverAwsCompute(
      {
        accountId: '123456789012',
        partition: 'aws',
        deploymentName: 'fixture',
        requiredEnis: 1,
        nodeCount: 1,
        instanceTypes: ['m6i.2xlarge'],
        brownfieldResourceIds: [],
        egressMode: 'elastic-ip',
        routingProfile: 'direct-eni',
        f5Capabilities: capabilities,
      },
      new FixtureApi(true),
      fetcher as typeof fetch,
    );
    expect(observation.regions[0].ami?.launchPermission).toBe(true);
    expect(observation.regions[0].eligible).toBe(true);
  });

  it('fails before cloud calls when the canonical contract identity is invalid', async () => {
    const api = new FixtureApi();
    const invalid = (() => Promise.resolve(new Response('invalid '.repeat(30), { status: 200 }))) as typeof fetch;
    await expect(
      discoverAwsCompute(
        {
          accountId: '123456789012',
          partition: 'aws',
          deploymentName: 'fixture',
          requiredEnis: 1,
          nodeCount: 1,
          brownfieldResourceIds: [],
          f5Capabilities: capabilities,
        },
        api,
        invalid,
      ),
    ).rejects.toThrow(/f5xc-ce-automation\/v1/);
    expect(api.calls).toHaveLength(0);
  });
});

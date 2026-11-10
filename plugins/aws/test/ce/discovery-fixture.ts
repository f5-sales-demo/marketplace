import type { AwsExecApi } from '../../src/aws/exec';
import { AWS_CE_SHARED_CONTRACT_URL, AWS_CE_TGW_GUIDE_URL } from '../../src/ce/types';

export const discoveryFixtureCapabilities = {
  smsv2ContractVersion: 'v2' as const,
  supportedProviders: ['aws' as const],
  bootstrapDrivers: ['console' as const],
  providerNetworkingProfiles: { aws: ['direct-eni', 'nlb-ingress', 'tgw-static'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};

export function discoveryFixtureFetch(url: string | URL | Request): Promise<Response> {
  const href = String(url);
  const body =
    href === AWS_CE_SHARED_CONTRACT_URL
      ? `contract_id: f5xc-ce-automation-policy\ncontract_version: v2\ncontract: f5xc-ce-automation-policy/v2\n${'provider neutral safety '.repeat(8)}`
      : href === AWS_CE_TGW_GUIDE_URL
        ? 'MCN deploys three independent Secure Mesh Site v2 sites, with six GRE Connect peers and twelve BGP sessions. Both transport roles select SLI payload.'
        : `${href}\nSecure Mesh Site v2 Customer Edge current official documentation. ${'verified provider guidance '.repeat(8)}`;
  return Promise.resolve(new Response(body, { status: 200 }));
}

export class DiscoveryFixtureApi implements AwsExecApi {
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
                InstanceType: args.some((arg) => arg.includes('m6i.4xlarge')) ? 'm6i.4xlarge' : 'm6i.2xlarge',
                ProcessorInfo: { SupportedArchitectures: ['x86_64'] },
                VCpuInfo: { DefaultVCpus: args.some((arg) => arg.includes('m6i.4xlarge')) ? 16 : 8 },
                MemoryInfo: { SizeInMiB: args.some((arg) => arg.includes('m6i.4xlarge')) ? 65536 : 32768 },
                NetworkInfo: {
                  MaximumNetworkInterfaces: args.some((arg) => arg.includes('m6i.4xlarge')) ? 8 : 4,
                  Ipv4AddressesPerInterface: args.some((arg) => arg.includes('m6i.4xlarge')) ? 30 : 15,
                },
              },
            ],
          };
        case 'ec2 describe-instance-type-offerings':
          return {
            InstanceTypeOfferings: ['a', 'b', 'c'].map((zone) => ({
              InstanceType: args.some((arg) => arg.includes('m6i.4xlarge')) ? 'm6i.4xlarge' : 'm6i.2xlarge',
              Location: `us-east-1${zone}`,
            })),
          };
        case 'service-quotas get-service-quota':
          return { Quota: { Value: 64 } };
        case 'service-quotas list-service-quotas':
          return {
            Quotas: [
              { QuotaCode: 'L-VPC', QuotaName: 'VPCs per Region', Value: 5 },
              { QuotaCode: 'L-IGW', QuotaName: 'Internet gateways per Region', Value: 5 },
              { QuotaCode: 'L-EIP', QuotaName: 'EC2-VPC Elastic IPs per Region', Value: 20 },
              { QuotaCode: 'L-NLB', QuotaName: 'Network Load Balancers per Region', Value: 50 },
            ],
          };
        case 'ec2 describe-vpcs':
          return { Vpcs: [] };
        case 'ec2 describe-internet-gateways':
          return { InternetGateways: [] };
        case 'ec2 describe-instances':
          return { Reservations: [] };
        case 'ec2 describe-addresses':
          return { Addresses: [] };
        case 'ec2 describe-transit-gateways':
          return { TransitGateways: [] };
        default:
          throw new Error(`Unexpected fixture command: ${operation}`);
      }
    })();
    return { stdout: JSON.stringify(output), stderr: '', exitCode: 0 };
  }
}

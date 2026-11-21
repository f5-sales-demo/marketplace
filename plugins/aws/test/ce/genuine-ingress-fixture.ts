import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { CeIngressLifecycle } from '../../../platform/src/ce/ingress-lifecycle';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import { CeApiError, type CeRuntime, type SiteBinding } from '../../../platform/src/ce/runtime';
import { buildInsideHttpListener, projectInsideHttpListener } from '../../../platform/src/ce/wire-ingress';
import { buildSiteLocalHttpOrigin, projectSiteLocalHttpOrigin } from '../../../platform/src/ce/wire-origin';
import { createWireValidator } from '../../../platform/src/ce/wire-schema';
import listenerCompact from '../../../platform/test/fixtures/inside-listener-schema.json';
import { resolveCeSchemaFixture } from '../../../platform/test/fixtures/resolve-schema-fixture';
import originCompact from '../../../platform/test/fixtures/site-local-origin-schema.json';
import type { PluginInterface } from '../../src/aws/types';
import { saveAwsDiscovery } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { ensureAwsPlatformIngress } from '../../src/ce/platform-ingress';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCeF5Capabilities, AwsCeIntent, AwsCeObservation } from '../../src/ce/types';
import {
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
  AWS_CE_TGW_GUIDE_URL,
} from '../../src/ce/types';
import { createAwsCePlanTool } from '../../src/tools/aws-ce-plan';

const capabilities: AwsCeF5Capabilities = {
  smsv2ContractVersion: 'v2',
  supportedProviders: ['aws', 'azure'],
  bootstrapDrivers: ['console'],
  providerNetworkingProfiles: { aws: ['direct-eni', 'nlb-ingress', 'tgw-static'], azure: ['direct-nic'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};

function interfaces(nodeCount: 1 | 3, count: number): AwsCeIntent['interfaces'] {
  const zones = nodeCount === 1 ? ['us-east-1a'] : ['us-east-1a', 'us-east-1b', 'us-east-1c'];
  return Array.from({ length: count }, (_, index) => ({
    index,
    guestDevice: `ens${5 + index}`,
    role: index === 0 ? ('slo' as const) : index === 1 ? ('sli' as const) : ('service' as const),
    vrf: `vrf-${index}`,
    subnets: zones.map((availabilityZone, node) => ({ availabilityZone, cidr: `10.${index}.${node}.0/24` })),
    addressing: { mode: 'dhcp' as const },
  }));
}

function intent(overrides: Partial<AwsCeIntent> = {}): AwsCeIntent {
  return {
    schemaVersion: 2,
    engine: 'native',
    operation: 'deploy',
    accountId: '123456789012',
    partition: 'aws',
    region: 'us-east-1',
    deploymentName: 'ce-demo',
    siteName: 'ce-demo',
    namespace: 'system',
    topology: { nodeCount: 1 },
    vpc: { mode: 'greenfield', cidr: '10.0.0.0/16' },
    interfaces: interfaces(1, 2),
    egress: { mode: 'elastic-ip' },
    routing: { profile: 'direct-eni', destinationCidrs: [], associations: [], propagations: [] },
    image: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, amiId: 'ami-0123456789abcdef0' },
    instance: { type: 'm6i.2xlarge', diskGiB: AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB },
    securityGroups: [{ name: 'ce', ingress: [], egress: [] }],
    routes: [],
    brownfield: { resourceIds: [], routeTableIds: [], transitGatewayRouteTableIds: [] },
    ...overrides,
  };
}

function observation(overrides: Partial<AwsCeObservation> = {}): AwsCeObservation {
  return {
    schemaVersion: 2,
    identity: { accountId: '123456789012', partition: 'aws', arn: 'arn:aws:iam::123456789012:role/example' },
    agreement: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, active: true, agreementIds: ['agreement-example'] },
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
          ssmVersion: 7,
          ownerAlias: 'aws-marketplace',
          ownerId: '679593333241',
          productCodes: ['marketplace-code'],
          architecture: 'x86_64',
          creationDate: '2026-08-01T00:00:00.000Z',
          state: 'available',
          rootDeviceName: '/dev/xvda',
          rootVolumeGiB: 79,
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
            availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
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
    resources: [],
    ownershipPlanSha256s: [],
    f5Capabilities: capabilities,
    f5CapabilitiesSha256: canonicalSha256(overrides.f5Capabilities ?? capabilities),
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
        contractId: 'f5xc-ce-automation-policy',
        contractVersion: 'v2',
        normalizedSha256: '1'.repeat(64),
      },
      f5AwsGuide: { url: AWS_CE_F5_GUIDE_URL, normalizedSha256: '2'.repeat(64), tgwConnectDocumented: false },
    },
    ...overrides,
  };
}

function primaryIntent(engine: 'native' | 'terraform', ha: boolean): AwsCeIntent {
  return intent({
    engine,
    vpc: { mode: 'greenfield', cidr: '10.0.0.0/8' },
    topology: {
      nodeCount: 3,
      sites: ha
        ? [{ name: 'ce-demo', nodeIndexes: [1, 2, 3] }]
        : [1, 2, 3].map((n) => ({ name: `ce-${n}`, nodeIndexes: [n] })),
    },
    interfaces: interfaces(3, 2),
    routing: {
      profile: 'tgw-static',
      transitGatewayId: 'tgw-0123456789abcdef0',
      destinationCidrs: [],
      associations: [],
      propagations: [],
    },
    brownfield: {
      resourceIds: [
        'i-0feedface12345678',
        'vpc-0bbbbbbbbbbbbbbbb',
        'subnet-0cccccccccccccccc',
        'tgw-0123456789abcdef0',
      ],
      routeTableIds: [],
      transitGatewayRouteTableIds: [],
    },
    ingress: {
      mode: 'nlb',
      scheme: 'internal',
      port: 8443,
      loadBalancer: {
        vpcId: 'vpc-0bbbbbbbbbbbbbbbb',
        subnetIds: ['subnet-0cccccccccccccccc'],
        privateAddresses: ['10.9.0.10'],
      },
      listener: {
        name: 'ce-listener',
        namespace: 'default',
        domain: 'ce.example.invalid',
        usePrimaryInterfaceAddress: true,
        originPool: { name: 'ce-origin', namespace: 'default' },
      },
      probe: {
        sourceInstanceId: 'i-0feedface12345678',
        path: '/healthz',
        expectedStatus: 200,
        expectedBodySha256: '4'.repeat(64),
      },
    } as AwsCeIntent['ingress'],
  });
}
function primaryObservation(): AwsCeObservation {
  const result = observation();
  result.regions[0].networkQuotas = [
    {
      serviceCode: 'elasticloadbalancing',
      quotaCode: 'L-69A177A2',
      quotaName: 'Network Load Balancers per Region',
      value: 50,
    },
  ];
  result.resources.push(
    {
      id: 'i-0feedface12345678',
      region: 'us-east-1',
      exists: true,
      owned: false,
      tags: {},
      state: { State: { Name: 'running' } },
    },
    {
      id: 'tgw-0123456789abcdef0',
      region: 'us-east-1',
      exists: true,
      owned: false,
      tags: {},
      state: {
        TransitGateways: [
          { TransitGatewayId: 'tgw-0123456789abcdef0', State: 'available', Options: { AmazonSideAsn: 64512 } },
        ],
      },
    },
    { id: 'vpc-0bbbbbbbbbbbbbbbb', region: 'us-east-1', exists: true, owned: false, tags: {}, state: {} },
    {
      id: 'subnet-0cccccccccccccccc',
      region: 'us-east-1',
      exists: true,
      owned: false,
      tags: {},
      state: { VpcId: 'vpc-0bbbbbbbbbbbbbbbb' },
    },
  );
  return result;
}
export async function genuineIngressFixture(engine: 'native' | 'terraform', ha: boolean, directory: string) {
  const input = primaryIntent(engine, ha);
  input.routing = {
    profile: 'tgw-connect',
    transitGatewayId: 'tgw-0123456789abcdef0',
    customerAsn: 65010,
    transitGatewayAsn: 64512,
    destinationCidrs: [],
    associations: [],
    propagations: [],
    connectPeers: [1, 2, 3].flatMap((node) =>
      [0, 1].map((peer) => ({
        node,
        transportInterfaceIndex: 1 as const,
        insideCidr: `169.254.${10 + (node - 1) * 2 + peer}.0/29`,
      })),
    ),
  };
  const observation = primaryObservation();
  observation.f5Capabilities = {
    ...capabilities,
    providerNetworkingProfiles: { aws: ['tgw-connect', 'nlb-ingress'] },
    awsSmsv2TgwConnect: { supported: true, schemaVersion: 'f5xc-smsv2-aws-tgw-telemetry/v2' },
  };
  observation.f5CapabilitiesSha256 = canonicalSha256(observation.f5Capabilities);
  observation.research.mcnTgwGuide = { url: AWS_CE_TGW_GUIDE_URL, normalizedSha256: '3'.repeat(64), documented: true };
  observation.research.sourceReceipts.push({ url: AWS_CE_TGW_GUIDE_URL, normalizedSha256: '3'.repeat(64) });
  const gateway = observation.resources.find((row) => row.id === input.routing.transitGatewayId);
  if (!gateway) throw new Error('Synthetic discovery gateway is missing');
  gateway.state = {
    TransitGateways: [
      {
        TransitGatewayId: gateway.id,
        State: 'available',
        Options: {
          AmazonSideAsn: 64512,
          TransitGatewayCidrBlocks: ['172.31.240.0/24'],
        },
      },
    ],
  };
  let sequence = 0;
  const sessionManager = {
    getSessionId: () => directory,
    getArtifactsDir: () => directory,
    async saveArtifact(content: string) {
      const id = String(++sequence);
      await writeFile(join(directory, `${id}.json`), content);
      return id;
    },
    async getArtifactPath(id: string) {
      return join(directory, `${id}.json`);
    },
  };
  const discoveryId = await saveAwsDiscovery(sessionManager, observation);
  const tool = createAwsCePlanTool({ typebox: { Type } } as unknown as PluginInterface);
  const planned = await tool.execute(
    'genuine-plan',
    { discoveryArtifactId: discoveryId ?? '', intent: input },
    undefined,
    undefined,
    { sessionManager },
  );
  const plan = planned.details.plan;
  if (planned.isError || !plan) throw new Error(planned.content[0].text);
  const binding = siteBindings(plan)[0].binding;
  const store = await CeDeploymentStore.open(directory, binding.owner);
  const state = { posts: 0, origins: 0, lost: false, fault: '', objects: new Map<string, Record<string, unknown>>() };
  const listenerFixture = resolveCeSchemaFixture(listenerCompact);
  const originFixture = resolveCeSchemaFixture(originCompact);
  const validate = createWireValidator(listenerFixture.schemas, listenerFixture.provenance.root);
  const validateOrigin = createWireValidator(originFixture.schemas, originFixture.provenance.root);
  const contract = {
    fingerprint: `sha256:${listenerFixture.provenance.sha256}`,
    projectObserved: (spec: unknown) => projectInsideHttpListener(spec, listenerFixture.schemas, validate),
    build: (input: Parameters<typeof buildInsideHttpListener>[0]) => buildInsideHttpListener(input, validate),
    buildOrigin: (input: Parameters<typeof buildSiteLocalHttpOrigin>[0]) =>
      buildSiteLocalHttpOrigin(input, validateOrigin),
    projectOriginObserved: (spec: unknown) => projectSiteLocalHttpOrigin(spec, originFixture.schemas, validateOrigin),
  } as VerifiedIngressContract;
  const observe = async (_binding: SiteBinding, expected: ExpectedCeInterface[]) => {
    const node = Number(expected[0].node.slice(-1));
    return {
      status: 'observed' as const,
      observedAt: state.fault === 'stale' && node === 2 ? '2000-01-01T00:00:00Z' : new Date().toISOString(),
      interfaces: [
        {
          node: expected[0].node,
          role: 'sli' as const,
          mac: state.fault === 'foreign-mac' && node === 2 ? '02:00:00:ff:00:02' : `02:00:00:00:00:0${node}`,
          device: state.fault === 'wrong-device' && node === 2 ? 'ens9' : 'ens6',
          interfaceName: `interface-${node}`,
          mtu: 1500,
          linkUp: !(state.fault === 'down' && node === 2),
          ipv4: {
            address: state.fault === 'wrong-ip' && node === 2 ? '10.1.1.20' : `10.1.${node - 1}.5`,
            prefixLength: 24,
          },
        },
      ],
    };
  };
  const port = {
    engine,
    siteFingerprint: 'site-contract',
    async observeOwnedSite(site: SiteBinding) {
      return { system_metadata: { uid: `site-uid-${site.siteName}` } };
    },
    observeAwsInterfaces: observe,
    observeAzureInterfaces: observe,
    async request(path: string, init?: RequestInit) {
      const isOrigin = path.includes('/origin_pools');
      const key = isOrigin ? 'origin' : 'listener';
      if (init?.method === 'POST') {
        if (isOrigin) state.origins++;
        else state.posts++;
        state.objects.set(key, { ...JSON.parse(String(init.body)), system_metadata: { uid: `${key}-uid` } });
        if (state.lost) throw new CeApiError('transient');
        return {};
      }
      const value = state.objects.get(key);
      if (!value) throw new CeApiError('not-found');
      return structuredClone(value);
    },
  };
  const lifecycle = new CeIngressLifecycle(port, contract, store);
  const runtime = { ingress: () => lifecycle } as unknown as CeRuntime;
  const resolved = Object.fromEntries(
    [1, 2, 3].flatMap((node) => [
      [`__ENI_${node}_1__`, `eni-0000000000000000${node}`],
      [`__ENI_${node}_1_MAC__`, `02:00:00:00:00:0${node}`],
      [`__NODE_${node}_SLI_IP__`, `10.1.${node - 1}.5`],
    ]),
  );
  const api = {
    async exec() {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          Reservations: [
            {
              Instances: [
                { InstanceId: 'i-0feedface12345678', PrivateIpAddress: '192.0.2.10', State: { Name: 'running' } },
              ],
            },
          ],
        }),
      };
    },
  };
  const install = () => ensureAwsPlatformIngress(plan, runtime, store, contract, resolved, api);
  const receipt = await install();
  const bootstrap = Object.fromEntries(
    [1, 2, 3].map((node) => [
      String(node),
      `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-${node}\n`,
    ]),
  );
  return { plan, observation, store, state, resolved, bootstrap, receipt };
}

import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { CeIngressLifecycle, type CeIngressPlan } from '../../../platform/src/ce/ingress-lifecycle';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import { CeApiError, type CeRuntime, type SiteBinding } from '../../../platform/src/ce/runtime';
import { buildInsideHttpListener, projectInsideHttpListener } from '../../../platform/src/ce/wire-ingress';
import { buildSiteLocalHttpOrigin, projectSiteLocalHttpOrigin } from '../../../platform/src/ce/wire-origin';
import { createWireValidator } from '../../../platform/src/ce/wire-schema';
import listenerCompact from '../../../platform/test/fixtures/inside-listener-schema.json';
import { resolveCeSchemaFixture } from '../../../platform/test/fixtures/resolve-schema-fixture';
import originCompact from '../../../platform/test/fixtures/site-local-origin-schema.json';
import { loadAwsPlan, saveAwsDiscovery, verifyAwsCePlan } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { awsCeInterfacePrivateAddresses, compileAwsCePlan } from '../../src/ce/planner';
import { ensureAwsPlatformIngress } from '../../src/ce/platform-ingress';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCeF5Capabilities, AwsCeIntent, AwsCeObservation } from '../../src/ce/types';
import {
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
} from '../../src/ce/types';

const capabilities: AwsCeF5Capabilities = {
  smsv2ContractVersion: 'v2',
  supportedProviders: ['aws', 'azure'],
  bootstrapDrivers: ['console'],
  providerNetworkingProfiles: { aws: ['direct-eni', 'nlb-ingress', 'tgw-static'], azure: ['direct-nic'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};

import { type TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { PluginInterface } from '../../src/aws/types';
import { createAwsCePlanTool } from '../../src/tools/aws-ce-plan';

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
for (const engine of ['native', 'terraform'] as const)
  for (const ha of [false, true])
    it(`${engine} genuine ${ha ? 'HA' : 'independent'} creation binds NLB targets to each primary SLI without aliases`, () => {
      const input = primaryIntent(engine, ha);
      const plan = compileAwsCePlan(input, primaryObservation());
      verifyAwsCePlan(plan);
      expect(siteBindings(plan).map((row) => row.binding.nodes.length)).toEqual(ha ? [3] : [1, 1, 1]);
      const target = plan.actions.find((row) => row.kind === 'nlb-register-targets');
      expect(target?.args).toEqual(
        expect.arrayContaining([1, 2, 3].map((node) => `Id=__NODE_${node}_SLI_IP__,AvailabilityZone=all`)),
      );
      for (let node = 1; node <= 3; node++) {
        expect(awsCeInterfacePrivateAddresses(plan.intent, node, 1)).toEqual([`10.1.${node - 1}.5`]);
        const eni = plan.actions.find(
          (row) => row.kind === 'eni-create' && row.node === node && row.description.endsWith('ENI 1'),
        );
        expect(eni?.args?.filter((arg) => arg.startsWith('PrivateIpAddress='))).toEqual([
          `PrivateIpAddress=10.1.${node - 1}.5,Primary=true`,
        ]);
      }
      if (engine === 'terraform') {
        const rendered = JSON.parse(
          renderAwsTerraformFoundation(
            plan,
            Object.fromEntries(
              [1, 2, 3].map((node) => [
                node,
                `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-${node}\n`,
              ]),
            ),
          ),
        );
        for (let node = 1; node <= 3; node++) {
          expect(rendered.resource.aws_network_interface[`node_${node}_nic_1`].private_ip_list).toEqual([
            `10.1.${node - 1}.5`,
          ]);
          expect(rendered.resource.aws_lb_target_group_attachment[`node_${node}`].target_id).toBe(
            `\${aws_network_interface.node_${node}_nic_1.private_ip}`,
          );
        }
      }
    });
it('primary mode pins static primary addresses and rejects conflicting or incomplete execution identities', () => {
  const input = primaryIntent('native', true);
  input.interfaces[1].addressing = { mode: 'static', addresses: ['10.1.0.20/24', '10.1.1.20/24', '10.1.2.20/24'] };
  const plan = compileAwsCePlan(input, primaryObservation());
  expect(awsCeInterfacePrivateAddresses(plan.intent, 2, 1)).toEqual(['10.1.1.20']);
  for (const mutate of [
    (value: AwsCeIntent) => {
      if (value.ingress?.mode === 'nlb') value.ingress.listener.privateAddresses = ['10.1.0.10'];
    },
    (value: AwsCeIntent) => {
      if (value.ingress?.mode === 'nlb') Object.assign(value.ingress.listener, { usePrimaryInterfaceAddress: false });
    },
    (value: AwsCeIntent) => {
      delete value.interfaces[1].guestDevice;
    },
    (value: AwsCeIntent) => {
      delete value.interfaces[1].subnets[1].cidr;
    },
    (value: AwsCeIntent) => {
      value.topology.sites = [{ name: 'ce-demo', nodeIndexes: [1, 2] }];
    },
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    expect(() => compileAwsCePlan(invalid, primaryObservation())).toThrow();
  }
});
it('the public plan schema accepts explicit primary mode and requires exactly one listener address mode', () => {
  const tool = createAwsCePlanTool({ typebox: { Type } } as unknown as PluginInterface);
  const input = { discoveryArtifactId: `aws-ce-discovery-${'a'.repeat(24)}`, intent: primaryIntent('native', true) };
  expect(Value.Check(tool.parameters as TSchema, input)).toBe(true);
  for (const listener of [
    {
      ...(input.intent.ingress?.mode === 'nlb' ? input.intent.ingress.listener : {}),
      usePrimaryInterfaceAddress: false,
    },
    {
      name: 'ce-listener',
      namespace: 'default',
      domain: 'ce.example.invalid',
      originPool: { name: 'ce-origin', namespace: 'default' },
    },
  ]) {
    const invalid = structuredClone(input);
    if (invalid.intent.ingress?.mode === 'nlb') invalid.intent.ingress.listener = listener as never;
    expect(Value.Check(tool.parameters as TSchema, invalid)).toBe(false);
  }
});

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
async function installFixture(engine: 'native' | 'terraform', ha: boolean) {
  const plan = compileAwsCePlan(primaryIntent(engine, ha), primaryObservation());
  const binding = siteBindings(plan)[0].binding;
  const directory = await mkdtemp(join(tmpdir(), 'aws-primary-ingress-'));
  directories.push(directory);
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
  return { plan, store, state, resolved, install };
}
for (const engine of ['native', 'terraform'] as const)
  for (const ha of [false, true])
    it(`${engine} public ingress installer uses a genuine ${ha ? 'HA' : 'independent'} plan and real platform lifecycle`, async () => {
      const f = await installFixture(engine, ha);
      f.state.lost = true;
      const result = await f.install();
      expect(result?.listener).toBe('configured');
      expect(result?.traffic).toBe('unknown');
      await f.install();
      expect(f.state.posts).toBe(1);
      expect(f.state.origins).toBe(1);
      const marker = (await f.store.read('aws-platform-ingress.json')) as { ingressPlanId: string };
      const saved = (await f.store.read(`ingress-plan-${marker.ingressPlanId}.json`)) as CeIngressPlan;
      expect(saved.material.placements.map((row) => row.interface.ipv4?.address)).toEqual([
        '10.1.0.5',
        '10.1.1.5',
        '10.1.2.5',
      ]);
      expect(saved.request.spec.advertise_custom.advertise_where).toHaveLength(ha ? 1 : 3);
      expect(JSON.stringify(saved.request.spec.advertise_custom)).not.toContain('"ip"');
      f.state.fault = 'wrong-ip';
      await expect(f.install()).rejects.toThrow();
      expect(f.state.posts).toBe(1);
    });
for (const failure of [
  'stale',
  'down',
  'foreign-mac',
  'wrong-device',
  'wrong-ip',
  'missing-eni',
  'missing-ip',
  'duplicate-mac',
  'duplicate-eni',
] as const)
  it(`primary installer rejects ${failure} before origin or listener creation`, async () => {
    const f = await installFixture('native', true);
    f.state.fault = failure;
    if (failure === 'missing-eni') delete f.resolved.__ENI_2_1__;
    if (failure === 'missing-ip') delete f.resolved.__NODE_2_SLI_IP__;
    if (failure === 'duplicate-eni') f.resolved.__ENI_2_1__ = f.resolved.__ENI_1_1__;
    if (failure === 'duplicate-mac') f.resolved.__ENI_2_1_MAC__ = f.resolved.__ENI_1_1_MAC__;
    await expect(f.install()).rejects.toThrow();
    expect(f.state.posts).toBe(0);
    expect(f.state.origins).toBe(0);
  });

for (const engine of ['native', 'terraform'] as const)
  it(`actual aws_ce_plan execution saves and reloads the ${engine} HA primary-interface contract`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aws-primary-public-plan-'));
    directories.push(directory);
    let sequence = 0;
    const sessionManager = {
      getSessionId: () => directory,
      getArtifactsDir: () => directory,
      async saveArtifact(content: string, _type: string) {
        const id = String(++sequence);
        await writeFile(join(directory, `${id}.json`), content);
        return id;
      },
      async getArtifactPath(id: string) {
        return join(directory, `${id}.json`);
      },
    };
    const id = await saveAwsDiscovery(sessionManager, primaryObservation());
    expect(id).toBe('1');
    const tool = createAwsCePlanTool({ typebox: { Type } } as unknown as PluginInterface);
    const result = await tool.execute(
      'test',
      { discoveryArtifactId: id ?? '', intent: primaryIntent(engine, true) },
      undefined,
      undefined,
      { sessionManager },
    );
    expect(result.isError).not.toBe(true);
    const plan = result.details.plan;
    expect(plan?.engine).toBe(engine);
    if (!plan) throw new Error('Public tool did not return a creation plan');
    const reloaded = await loadAwsPlan(sessionManager, plan.planId, plan.planSha256);
    expect(reloaded.plan).toEqual(plan);
    expect(plan.intent.ingress?.mode === 'nlb' && plan.intent.ingress.listener.usePrimaryInterfaceAddress).toBe(true);
    expect(plan.actions.some((row) => row.kind === 'f5-ingress-configure')).toBe(true);
  });

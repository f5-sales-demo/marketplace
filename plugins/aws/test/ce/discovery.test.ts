import { describe, expect, it } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  discoverAwsCompute,
  extractF5AwsGuideDocument,
  isF5Smsv2TgwConnectDocumented,
  isMcnAwsTgwConnectDocumented,
  observeAwsResources,
} from '../../src/ce/discovery';
import { AWS_CE_SSM_PARAMETER, AWS_CE_TGW_GUIDE_URL } from '../../src/ce/types';
import {
  discoveryFixtureCapabilities as capabilities,
  DiscoveryFixtureApi as FixtureApi,
  discoveryFixtureFetch as fetcher,
} from './discovery-fixture';

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
    expect(observation.research.mcnTgwGuide?.documented).toBe(true);
    expect(observation.research.sourceReceipts.find((row) => row.url === AWS_CE_TGW_GUIDE_URL)?.normalizedSha256).toBe(
      observation.research.mcnTgwGuide?.normalizedSha256,
    );
    expect(api.calls.filter((args) => args.includes('us-west-2'))).toHaveLength(0);
    expect(api.calls.find((args) => args[0] === 'marketplace-agreement')?.join(' ')).toContain('AgreementType');
  });

  it('includes an eight-ENI instance size in default discovery', async () => {
    const api = new FixtureApi();
    const observation = await discoverAwsCompute(
      {
        accountId: '123456789012',
        partition: 'aws',
        deploymentName: 'fixture',
        requiredEnis: 8,
        nodeCount: 1,
        brownfieldResourceIds: [],
        egressMode: 'elastic-ip',
        routingProfile: 'direct-eni',
        f5Capabilities: capabilities,
      },
      api,
      fetcher as typeof fetch,
    );
    const instanceArgs = api.calls.find((args) => args[0] === 'ec2' && args[1] === 'describe-instance-types');
    expect(instanceArgs).toContain('m6i.4xlarge');
    expect(observation.regions[0].instanceTypes[0]?.name).toBe('m6i.4xlarge');
    expect(observation.regions[0].reasons).toEqual([]);
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
    ).rejects.toThrow(/f5xc-ce-automation-policy\/v2/);
    expect(api.calls).toHaveLength(0);
  });
});

it('binds ownership tags to the exact resource instead of nested or reordered tags', async () => {
  const id = 'i-0123456789abcdef0';
  const digest = 'a'.repeat(64);
  const tags = [
    { Value: 'aws-ce', Key: 'xcsh-managed-by' },
    { Value: 'native', Key: 'xcsh-execution-engine' },
    { Value: 'ce-demo', Key: 'xcsh-deployment-id' },
    { Value: digest, Key: 'xcsh-plan-sha256' },
  ];
  let raw: unknown = {
    Reservations: [
      {
        Instances: [
          {
            InstanceId: id,
            Tags: tags,
            NetworkInterfaces: [
              {
                NetworkInterfaceId: 'eni-0123456789abcdef0',
                Tags: [{ Key: 'xcsh-execution-engine', Value: 'terraform' }],
              },
            ],
          },
        ],
      },
    ],
  };
  const api = { exec: async () => ({ exitCode: 0, stderr: '', stdout: JSON.stringify(raw) }) };
  const observe = () =>
    observeAwsResources(api, [id], 'us-east-1', { deploymentName: 'ce-demo', planSha256s: [digest] });
  expect((await observe())[0].owned).toBe(true);
  raw = {
    Reservations: [
      {
        Instances: [
          { InstanceId: id, NetworkInterfaces: [{ NetworkInterfaceId: 'eni-0123456789abcdef0', Tags: tags }] },
        ],
      },
    ],
  };
  expect((await observe())[0].owned).toBe(false);
  raw = { Reservations: [] };
  expect((await observe())[0].exists).toBe(false);
});

it('checks unused Elastic IP capacity and leaves incomplete usage evidence ineligible', async () => {
  for (const mode of ['exhausted', 'incomplete', 'available']) {
    const fixture = new FixtureApi();
    const observation = await discoverAwsCompute(
      {
        accountId: '123456789012',
        partition: 'aws',
        deploymentName: 'fixture',
        requiredEnis: 2,
        nodeCount: 1,
        brownfieldResourceIds: [],
        egressMode: 'elastic-ip',
        routingProfile: 'direct-eni',
        f5Capabilities: capabilities,
      },
      {
        exec: async (command, args) => {
          if (args[0] === 'ec2' && args[1] === 'describe-addresses')
            return {
              exitCode: 0,
              stderr: '',
              stdout: JSON.stringify(
                mode === 'incomplete'
                  ? { NextToken: 'more', Addresses: [] }
                  : {
                      Addresses: Array.from({ length: mode === 'exhausted' ? 20 : 19 }, (_, index) => ({
                        AllocationId: `eipalloc-${String(index).padStart(8, '0')}`,
                      })),
                    },
              ),
            };
          return fixture.exec(command, args);
        },
      },
      fetcher as typeof fetch,
    );
    const region = observation.regions.find((item) => item.name === 'us-east-1');
    if (mode === 'exhausted') {
      expect(region?.reasons).toContain('elastic-ip-quota');
      expect(region?.elasticIpCapacity?.available).toBe(0);
    }
    if (mode === 'incomplete') {
      expect(region?.reasons).toContain('elastic-ip-usage-observation-failed');
      expect(region?.elasticIpCapacity).toBeUndefined();
    }
    if (mode === 'available') {
      expect(region?.elasticIpCapacity?.available).toBe(1);
      expect(region?.reasons).not.toContain('elastic-ip-quota');
    }
  }
});

it('binds ENI ownership to authoritative TagSet and rejects ambiguous tag representations', async () => {
  const id = 'eni-0123456789abcdef0';
  const digest = 'a'.repeat(64);
  const TagSet = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': 'ce-demo',
    'xcsh-plan-sha256': digest,
  }).map(([Key, Value]) => ({ Key, Value }));
  const query = (extra: Record<string, unknown> = {}) =>
    observeAwsResources(
      {
        async exec() {
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ NetworkInterfaces: [{ NetworkInterfaceId: id, TagSet, ...extra }] }),
          };
        },
      },
      [id],
      'us-east-1',
      { deploymentName: 'ce-demo', planSha256s: [digest] },
    );
  expect((await query())[0].owned).toBe(true);
  expect((await query())[0].tags['xcsh-execution-engine']).toBe('native');
  await expect(query({ Tags: TagSet })).rejects.toThrow('ambiguous');
});

it('observes EIP associations through the supported association-id filter', async () => {
  const id = 'eipassoc-0123456789abcdef0';
  await observeAwsResources(
    {
      async exec(_command, args) {
        expect(args).toContain(`Name=association-id,Values=${id}`);
        expect(args).not.toContain('--association-ids');
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            Addresses: [{ AssociationId: id, AllocationId: 'eipalloc-0123456789abcdef0', Tags: [] }],
          }),
        };
      },
    },
    [id],
    'us-east-1',
    { deploymentName: 'ce-demo', planSha256s: [] },
  );
});

it('treats retained TGW deletion tombstones as absent', async () => {
  const id = 'tgw-attach-0123456789abcdef0';
  const [observed] = await observeAwsResources(
    {
      async exec() {
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ TransitGatewayAttachments: [{ TransitGatewayAttachmentId: id, State: 'deleted' }] }),
        };
      },
    },
    [id],
    'us-east-1',
    { deploymentName: 'ce-demo', planSha256s: [] },
  );
  expect(observed.exists).toBe(false);
  expect(observed.owned).toBe(false);
});

it('binds an untagged listener to its exact owned load balancer parent', async () => {
  const digest = 'a'.repeat(64);
  const listener =
    'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/net/ce-demo/0123456789abcdef/0123456789abcdef';
  const parent = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/ce-demo/0123456789abcdef';
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': 'ce-demo',
    'xcsh-plan-sha256': digest,
  }).map(([Key, Value]) => ({ Key, Value }));
  const observed = await observeAwsResources(
    {
      async exec(_command, args) {
        if (args[1] === 'describe-listeners')
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ Listeners: [{ ListenerArn: listener, LoadBalancerArn: parent }] }),
          };
        const selected = args[args.indexOf('--resource-arns') + 1];
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            TagDescriptions: [{ ResourceArn: selected, Tags: selected === parent ? tags : [] }],
          }),
        };
      },
    },
    [listener],
    'us-east-1',
    { deploymentName: 'ce-demo', planSha256s: [digest] },
  );
  expect(observed[0].owned).toBe(true);
  expect(observed[0].tags['xcsh-plan-sha256']).toBe(digest);
});

it('keeps the MCN routing recipe distinct from generic deployment or legacy TGW text', () => {
  expect(isMcnAwsTgwConnectDocumented('Secure Mesh Site v2 AWS deployment guide')).toBe(false);
  expect(isMcnAwsTgwConnectDocumented('Legacy AWS TGW orchestrated GRE and BGP')).toBe(false);
  expect(
    isMcnAwsTgwConnectDocumented(
      'MCN deploys three independent Secure Mesh Site v2 sites with six GRE Connect peers and twelve BGP sessions using SLI payload.',
    ),
  ).toBe(true);
});

it('rejects truncated TGW association, route-table and propagation evidence', async () => {
  for (const truncated of [
    'get-transit-gateway-route-table-associations',
    'describe-transit-gateway-route-tables',
    'get-transit-gateway-route-table-propagations',
  ]) {
    const api: AwsExecApi = {
      async exec(_command, args) {
        const body =
          args[1] === 'get-transit-gateway-route-table-associations'
            ? { Associations: [] }
            : args[1] === 'describe-transit-gateway-route-tables'
              ? { TransitGatewayRouteTables: [] }
              : { TransitGatewayRouteTablePropagations: [] };
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ ...body, ...(args[1] === truncated ? { NextToken: 'more' } : {}) }),
        };
      },
    };
    await expect(
      observeAwsResources(api, ['tgw-rtb-12345678'], 'ca-west-1', { deploymentName: 'ce', planSha256s: [] }),
    ).rejects.toThrow('Incomplete');
  }
});

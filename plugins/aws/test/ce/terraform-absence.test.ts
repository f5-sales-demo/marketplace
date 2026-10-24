import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsTerraformAbsence } from '../../src/ce/terraform-absence';
import { foundationPlan } from './terraform-fixtures';

function absencePlan() {
  const plan = foundationPlan();
  plan.intent.partition = 'aws';
  const { planId: _id, planSha256: _sha, ...material } = plan;
  plan.planSha256 = canonicalSha256(material);
  plan.planId = `aws-ce-${plan.planSha256.slice(0, 24)}`;
  return plan;
}

function fixture(mode = 'absent') {
  const plan = absencePlan();
  const material = {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    accountId: plan.intent.accountId,
    region: plan.intent.region,
    deploymentId: plan.intent.deploymentName,
    sourcePlanSha256: plan.planSha256,
    terraformPlanSha256: 'a'.repeat(64),
    resources: [
      { type: 'aws_vpc', id: 'vpc-12345678' },
      { type: 'aws_instance', id: 'i-12345678' },
      { type: 'aws_ebs_volume', id: 'vol-12345678' },
      { type: 'aws_ec2_transit_gateway_connect', id: 'tgw-attach-12345678' },
    ],
    tgwEdges: [{ kind: 'association' as const, tableId: 'tgw-rtb-12345678', attachmentId: 'tgw-attach-12345678' }],
  };
  const inventory = { ...material, sha256: canonicalSha256(material) };
  const calls: string[] = [];
  const api = {
    async exec(_cmd: string, args: string[]) {
      expect(args[args.indexOf('--region') + 1]).toBe(plan.intent.region);
      expect(args[args.indexOf('--profile') + 1]).toBe(plan.intent.awsProfile);
      const operation = args[1];
      calls.push(operation);
      if (mode === 'forbidden') return { stdout: '', stderr: 'UnauthorizedOperation', exitCode: 1 };
      if (operation === 'get-caller-identity')
        return {
          stdout: JSON.stringify({ Account: mode === 'wrong-account' ? '999999999999' : plan.intent.accountId }),
          stderr: '',
          exitCode: 0,
        };
      const input = JSON.parse(args[args.indexOf('--cli-input-json') + 1]);
      const response: Record<string, unknown> = {
        'describe-tags': {
          Tags:
            mode === 'orphan'
              ? [{ Key: 'xcsh-deployment-id', Value: plan.intent.deploymentName, ResourceId: 'vol-87654321' }]
              : [],
          ...(mode === 'partial' ? { NextToken: 'repeat' } : {}),
        },
        'get-resources': { ResourceTagMappingList: [], PaginationToken: '' },
        'describe-vpcs':
          mode === 'malformed'
            ? {}
            : {
                Vpcs:
                  mode === 'present'
                    ? [{ VpcId: 'vpc-12345678' }]
                    : mode === 'foreign'
                      ? [{ VpcId: 'vpc-87654321' }]
                      : [],
              },
        'describe-instances': {
          Reservations:
            mode === 'terminated' ? [{ Instances: [{ InstanceId: 'i-12345678', State: { Name: 'terminated' } }] }] : [],
        },
        'describe-volumes': { Volumes: mode === 'orphan' ? [{ VolumeId: 'vol-87654321', State: 'available' }] : [] },
        'describe-transit-gateway-connects': { TransitGatewayConnects: [] },
        'describe-transit-gateway-route-tables': {
          TransitGatewayRouteTables: [{ TransitGatewayRouteTableId: 'tgw-rtb-12345678', State: 'available' }],
        },
        'get-transit-gateway-route-table-associations': {
          Associations:
            mode === 'edge' ? [{ TransitGatewayAttachmentId: 'tgw-attach-12345678', State: 'associated' }] : [],
        },
      };
      if (mode === 'pages' && operation === 'describe-vpcs')
        response[operation] = input.NextToken ? { Vpcs: [] } : { Vpcs: [], NextToken: 'second-page' };
      return { stdout: JSON.stringify(response[operation]), stderr: '', exitCode: 0 };
    },
  };
  return { plan, inventory, api, calls };
}
test('absence collector requires fresh scoped identity reads, tag inventory and TGW relationship disappearance', async () => {
  for (const mode of ['absent', 'terminated', 'pages', 'present', 'orphan', 'edge']) {
    const f = fixture(mode);
    const receipt = await collectAwsTerraformAbsence(f.plan, f.inventory, f.api);
    expect(receipt.status).toBe(['present', 'orphan', 'edge'].includes(mode) ? 'pending' : 'absent-or-retired');
    expect(f.calls).toContain('describe-tags');
    expect(f.calls).toContain('get-transit-gateway-route-table-associations');
    if (mode === 'pages') expect(f.calls.filter((row) => row === 'describe-vpcs').length).toBe(2);
  }
});
test('absence collector keeps incomplete, unauthorized and substituted evidence unknown', async () => {
  for (const mode of ['partial', 'malformed', 'foreign', 'forbidden', 'wrong-account']) {
    const f = fixture(mode);
    expect((await collectAwsTerraformAbsence(f.plan, f.inventory, f.api)).status).toBe('unknown');
  }
});
test('absence collector rejects forged inventory and cancellation without issuing requests', async () => {
  const f = fixture();
  await expect(collectAwsTerraformAbsence(f.plan, { ...f.inventory, resources: [] }, f.api)).rejects.toThrow();
  await expect(collectAwsTerraformAbsence(f.plan, f.inventory, f.api, AbortSignal.abort())).rejects.toThrow();
  expect(f.calls).toEqual([]);
});

test('captured ELB ARN scope must match deployment before any AWS request', async () => {
  for (const scope of ['aws:us-west-1:123456789012', 'aws:us-east-1:999999999999', 'aws-cn:us-east-1:123456789012']) {
    const f = fixture();
    const [partition, region, account] = scope.split(':');
    const { sha256: _sha, ...material } = f.inventory;
    material.resources = [
      { type: 'aws_lb', id: `arn:${partition}:elasticloadbalancing:${region}:${account}:loadbalancer/net/ce/abcdef12` },
    ];
    material.tgwEdges = [];
    const inventory = { ...material, sha256: canonicalSha256(material) };
    await expect(collectAwsTerraformAbsence(f.plan, inventory, f.api)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  }
});

test('tagging API EC2 identities require exact scoped ownership and independent absence reads', async () => {
  for (const mode of ['captured', 'absent', 'retained']) {
    const f = fixture();
    const id = mode === 'captured' ? 'vol-12345678' : 'vol-87654321';
    const exec = f.api.exec.bind(f.api);
    f.api.exec = async (command, args) => {
      if (args[1] === 'get-resources')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            ResourceTagMappingList: [
              {
                ResourceARN: `arn:${f.plan.intent.partition}:ec2:${f.plan.intent.region}:${f.plan.intent.accountId}:volume/${id}`,
                Tags: ownershipTags(f.plan),
              },
            ],
            PaginationToken: '',
          }),
        };
      if (args[1] === 'describe-volumes') {
        const input = JSON.parse(args[args.indexOf('--cli-input-json') + 1]);
        expect(input.Filters[0].Values).toContain(id);
        f.calls.push(args[1]);
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            Volumes: mode === 'retained' ? [{ VolumeId: id, State: 'available' }] : [],
          }),
        };
      }
      return exec(command, args);
    };
    const receipt = await collectAwsTerraformAbsence(f.plan, f.inventory, f.api);
    expect(receipt.status).toBe(mode === 'retained' ? 'pending' : 'absent-or-retired');
    expect(f.calls).toContain('describe-volumes');
    if (mode === 'retained') expect(receipt.remaining).toContain(id);
  }
});

function ownershipTags(plan: ReturnType<typeof foundationPlan>) {
  return [
    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
    { Key: 'xcsh-execution-engine', Value: 'terraform' },
    { Key: 'xcsh-deployment-id', Value: plan.intent.deploymentName },
    { Key: 'xcsh-plan-sha256', Value: plan.planSha256 },
  ];
}

test('tagging API cannot hide malformed, unsupported, foreign or duplicate resources', async () => {
  const f = fixture();
  const prefix = `arn:${f.plan.intent.partition}:ec2:${f.plan.intent.region}:${f.plan.intent.accountId}`;
  const good = { ResourceARN: `${prefix}:volume/vol-12345678`, Tags: ownershipTags(f.plan) };
  const invalid = [
    [{}],
    [{ ...good, ResourceARN: 42 }],
    [{ ...good, ResourceARN: 'not-an-arn' }],
    [{ ...good, ResourceARN: `arn:aws:s3:::leftover-bucket` }],
    [{ ...good, ResourceARN: `${prefix}:snapshot/snap-12345678` }],
    [{ ...good, ResourceARN: `${prefix}:subnet/vol-12345678` }],
    [{ ...good, ResourceARN: good.ResourceARN.replace(`:${f.plan.intent.region}:`, ':us-west-1:') }],
    [{ ...good, ResourceARN: good.ResourceARN.replace(f.plan.intent.accountId, '999999999999') }],
    [{ ...good, ResourceARN: good.ResourceARN.replace('arn:aws:', 'arn:aws-cn:') }],
    [{ ...good, Tags: undefined }],
    [{ ...good, Tags: good.Tags.slice(1) }],
    [{ ...good, Tags: [...good.Tags, good.Tags[0]] }],
    [
      {
        ...good,
        Tags: good.Tags.map((row) => (row.Key === 'xcsh-plan-sha256' ? { ...row, Value: 'b'.repeat(64) } : row)),
      },
    ],
    [good, good],
  ];
  const exec = f.api.exec.bind(f.api);
  for (const mappings of invalid) {
    f.api.exec = async (command, args) =>
      args[1] === 'get-resources'
        ? { exitCode: 0, stderr: '', stdout: JSON.stringify({ ResourceTagMappingList: mappings, PaginationToken: '' }) }
        : exec(command, args);
    expect((await collectAwsTerraformAbsence(f.plan, f.inventory, f.api)).status).toBe('unknown');
  }
});

test('tagging API joins captured attachment ARNs without substituting their qualified resource type', async () => {
  const f = fixture();
  const exec = f.api.exec.bind(f.api);
  f.api.exec = async (command, args) =>
    args[1] === 'get-resources'
      ? {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            ResourceTagMappingList: [
              {
                ResourceARN: `arn:aws:ec2:${f.plan.intent.region}:${f.plan.intent.accountId}:transit-gateway-attachment/tgw-attach-12345678`,
                Tags: ownershipTags(f.plan),
              },
            ],
            PaginationToken: '',
          }),
        }
      : exec(command, args);
  const receipt = await collectAwsTerraformAbsence(f.plan, f.inventory, f.api);
  expect(receipt.status).toBe('absent-or-retired');
  expect(receipt.resourceCount).toBe(f.inventory.resources.length);
  expect(f.calls).toContain('describe-transit-gateway-connects');
  expect(f.calls).not.toContain('describe-transit-gateway-attachments');
});

test('tagging API rejects repeated ARNs across pages and unsupported continuation fields', async () => {
  for (const mode of ['duplicate-pages', 'NextToken', 'NextMarker', 'nextToken', 'Marker']) {
    const f = fixture();
    const exec = f.api.exec.bind(f.api);
    f.api.exec = async (command, args) => {
      if (args[1] !== 'get-resources') return exec(command, args);
      const input = JSON.parse(args[args.indexOf('--cli-input-json') + 1]);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          ResourceTagMappingList:
            mode === 'duplicate-pages'
              ? [
                  {
                    ResourceARN: `arn:aws:ec2:${f.plan.intent.region}:${f.plan.intent.accountId}:volume/vol-12345678`,
                    Tags: ownershipTags(f.plan),
                  },
                ]
              : [],
          PaginationToken: mode === 'duplicate-pages' && !input.PaginationToken ? 'second' : '',
          ...(mode === 'duplicate-pages' ? {} : { [mode]: 'unprocessed' }),
        }),
      };
    };
    expect((await collectAwsTerraformAbsence(f.plan, f.inventory, f.api)).status).toBe('unknown');
  }
});

test('absence collector recognizes deleted and retained NLB ARNs separately', async () => {
  const plan = absencePlan();
  const prefix = `arn:aws:elasticloadbalancing:${plan.intent.region}:${plan.intent.accountId}`;
  const resources = [
    { type: 'aws_lb', id: `${prefix}:loadbalancer/net/ce/abcdef12` },
    { type: 'aws_lb_target_group', id: `${prefix}:targetgroup/ce/abcdef12` },
    { type: 'aws_lb_listener', id: `${prefix}:listener/net/ce/abcdef12/abcdef12` },
  ];
  const material = {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    accountId: plan.intent.accountId,
    region: plan.intent.region,
    deploymentId: plan.intent.deploymentName,
    sourcePlanSha256: plan.planSha256,
    terraformPlanSha256: 'a'.repeat(64),
    resources,
    tgwEdges: [],
  };
  const inventory = { ...material, sha256: canonicalSha256(material) };
  let retained = false;
  let unexpected: string | undefined;
  const api = {
    async exec(_command: string, args: string[]) {
      const operation = args[1];
      if (operation === 'get-caller-identity')
        return { exitCode: 0, stdout: JSON.stringify({ Account: plan.intent.accountId }), stderr: '' };
      if (operation === 'describe-tags') return { exitCode: 0, stdout: JSON.stringify({ Tags: [] }), stderr: '' };
      if (operation === 'get-resources')
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ResourceTagMappingList: unexpected
              ? [
                  {
                    ResourceARN: unexpected,
                    Tags: [
                      { Key: 'xcsh-managed-by', Value: 'aws-ce' },
                      { Key: 'xcsh-execution-engine', Value: 'terraform' },
                      { Key: 'xcsh-deployment-id', Value: plan.intent.deploymentName },
                      { Key: 'xcsh-plan-sha256', Value: plan.planSha256 },
                    ],
                  },
                ]
              : [],
            PaginationToken: '',
          }),
          stderr: '',
        };
      const input = JSON.parse(args[args.indexOf('--cli-input-json') + 1]);
      const [id] = input.LoadBalancerArns ?? input.TargetGroupArns ?? input.ListenerArns;
      if (!retained) return { exitCode: 1, stdout: '', stderr: `${operation}NotFound` };
      const [collection, key] =
        operation === 'describe-load-balancers'
          ? ['LoadBalancers', 'LoadBalancerArn']
          : operation === 'describe-target-groups'
            ? ['TargetGroups', 'TargetGroupArn']
            : ['Listeners', 'ListenerArn'];
      return { exitCode: 0, stdout: JSON.stringify({ [collection]: [{ [key]: id }] }), stderr: '' };
    },
  };
  expect((await collectAwsTerraformAbsence(plan, inventory, api)).status).toBe('absent-or-retired');
  retained = true;
  const present = await collectAwsTerraformAbsence(plan, inventory, api);
  expect(present.status).toBe('pending');
  expect(present.remaining).toEqual(resources.map((row) => row.id));
  unexpected = `${prefix}:loadbalancer/net/unexpected/abcdef12`;
  const expanded = await collectAwsTerraformAbsence(plan, inventory, api);
  expect(expanded.status).toBe('pending');
  expect(expanded.remaining).toContain(unexpected);
});

function emptyFixture(mode = 'absent') {
  const f = fixture(mode);
  const { sha256: _sha, ...material } = f.inventory;
  const emptyState = {
    schemaVersion: 1 as const,
    source: 'owning-empty-destroy-plan' as const,
    terraformPlanSha256: material.terraformPlanSha256,
    configurationSha256: 'b'.repeat(64),
    providerLockSha256: 'c'.repeat(64),
    backendIdentity: `local:${f.plan.intent.deploymentName}`,
    resourceProjectionSha256: canonicalSha256({ 'aws_vpc.ce': null }),
  };
  const inventory = { ...material, resources: [], tgwEdges: [], emptyState };
  return { ...f, inventory: { ...inventory, sha256: canonicalSha256(inventory) } };
}
test('verified empty destroy inventory still requires current account and deployment-wide absence', async () => {
  for (const mode of ['absent', 'orphan', 'partial', 'forbidden', 'wrong-account']) {
    const f = emptyFixture(mode);
    const result = await collectAwsTerraformAbsence(f.plan, f.inventory, f.api);
    expect(result.status).toBe(mode === 'absent' ? 'absent-or-retired' : mode === 'orphan' ? 'pending' : 'unknown');
    if (mode === 'absent') {
      expect(f.calls).toEqual(['get-caller-identity', 'describe-tags', 'get-resources']);
      expect(result.resourceCount).toBe(0);
    }
  }
});
test('empty inventory provenance rejects missing, altered, extended and inconsistent bindings before reads', async () => {
  const f = emptyFixture();
  for (const emptyState of [
    undefined,
    { ...f.inventory.emptyState, terraformPlanSha256: 'd'.repeat(64) },
    { ...f.inventory.emptyState, backendIdentity: 'local:other' },
    { ...f.inventory.emptyState, configurationSha256: '' },
    { ...f.inventory.emptyState, resourceProjectionSha256: 'd'.repeat(64) },
    { ...f.inventory.emptyState, extra: true },
  ]) {
    const { sha256: _sha, ...material } = f.inventory;
    const altered = { ...material, emptyState };
    await expect(
      collectAwsTerraformAbsence(f.plan, { ...altered, sha256: canonicalSha256(altered) }, f.api),
    ).rejects.toThrow();
  }
  expect(f.calls).toEqual([]);
});

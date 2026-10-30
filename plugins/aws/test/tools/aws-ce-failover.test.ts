import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { PluginInterface } from '../../src/aws/types';
import { type AwsCeToolContext, saveAwsCheckpoint, saveAwsPlan } from '../../src/ce/artifacts';
import { canonicalSha256, sha256Hex } from '../../src/ce/canonical';
import { renderAwsTerraformConnect } from '../../src/ce/terraform-connect';
import type { AwsTerraformFailover } from '../../src/ce/terraform-failover';
import { siteForNode } from '../../src/ce/topology';
import { createAwsCeFailoverTool } from '../../src/tools/aws-ce-failover';
import { connectFixture } from '../ce/terraform-connect-fixture';

type ToolResponse = { isError?: boolean; details: Record<string, unknown> };
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const typebox = {
  Type: {
    Object: (value: unknown) => value,
    String: () => ({}),
    Number: () => ({}),
    Optional: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
  },
} as unknown as PluginInterface['typebox'];

test('public failover prepares a private plan and applies it with one durable authorization', async () => {
  const fixture = connectFixture();
  const { planId: _id, planSha256: _sha, ...draft } = fixture.plan;
  draft.routing = structuredClone(draft.intent.routing);
  const normalized = {
    ...draft,
    accountId: fixture.plan.intent.accountId,
    region: fixture.plan.intent.region,
    deploymentName: fixture.plan.intent.deploymentName,
  };
  const planSha256 = canonicalSha256(normalized);
  const plan = { ...normalized, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  const configuration = renderAwsTerraformConnect(plan, fixture.observation, fixture.bootstrap);
  const directory = await mkdtemp(join(tmpdir(), 'aws-ce-failover-tool-'));
  directories.push(directory);
  const owner = {
    deploymentId: plan.deploymentName,
    engine: 'terraform' as const,
    provider: 'aws' as const,
    account: plan.accountId,
    region: plan.region,
  };
  const storage = await CeDeploymentStore.open(directory, owner);
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: sha256Hex(configuration),
    stage: 'applied',
  });
  await storage.write('terraform-routing-checkpoint.json', {
    schemaVersion: 2,
    engine: 'terraform',
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    resolvedValues: {},
    state: 'running',
  });
  const session = {
    async readConfiguration(expected: string) {
      expect(expected).toBe(sha256Hex(configuration));
      return configuration;
    },
    async readOutputs() {
      return {
        ce_instances: Object.fromEntries(
          Array.from({ length: plan.intent.topology.nodeCount }, (_, index) => [
            String(index + 1),
            {
              id: `i-${String(index + 1).repeat(17)}`,
              hostname: `${plan.deploymentName}-${index + 1}`,
              site_name: plan.intent.topology.sites?.[index]?.name,
            },
          ]),
        ),
      };
    },
  } as unknown as TerraformSession;
  const terraform = { open: async () => session } as unknown as CeTerraformService;
  const platform = { storage: async () => storage } as unknown as CePlatformService;
  const artifacts: string[] = [];
  let confirms = 0;
  let runs = 0;
  let acceptance: 'passed' | 'failed' = 'passed';
  const ctx = {
    cwd: '/tmp',
    hasUI: true,
    ui: {
      async confirm() {
        confirms++;
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => 'failover-tool-test',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      async saveArtifact(value: string) {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  } satisfies AwsCeToolContext;
  await saveAwsPlan(ctx.sessionManager, plan, fixture.observation);
  const tool = createAwsCeFailoverTool({ typebox } as PluginInterface, {
    platform: async () => platform,
    terraform: async () => terraform,
    makeApi: () => ({ exec: async () => ({ exitCode: 0, stdout: '{}', stderr: '' }) }),
    collect: async (base, _checkpoint, nodeIndex, phase) => ({
      planId: base.planId,
      planSha256: base.planSha256,
      nodeIndex,
      nodeName: `${base.deploymentName}-${nodeIndex}`,
      selectedSiteName: siteForNode(base.intent, nodeIndex).name,
      phase,
      expectedEstablishedSessions:
        (base.actions ?? []).filter(
          (action) => action.kind === 'tgw-connect-peer-create' && (phase !== 'outage' || action.node !== nodeIndex),
        ).length * 2,
      acceptance: 'passed' as const,
    }),
    runNative: async () => {
      throw new Error('unexpected native failover');
    },
    observeNative: async () => {
      throw new Error('unexpected native observation');
    },
    async run(_base, failover, authorized) {
      runs++;
      expect(authorized).toBe(failover.planSha256);
      return {
        status: acceptance === 'passed' ? ('failover-complete' as const) : ('failover-acceptance-failed' as const),
        acceptance,
        withdrawalTiming: { status: 'passed' as const, thresholdMs: 45000 as const },
        restorationTiming: { status: acceptance, thresholdMs: 45000 as const },
        engine: 'terraform' as const,
        planId: failover.planId,
        planSha256: failover.planSha256,
        nodeIndex: failover.nodeIndex,
        finalPlanSha256: 'f'.repeat(64),
        observedAt: new Date().toISOString(),
        traffic: 'unknown' as const,
        originControl: 'unknown' as const,
      };
    },
  });
  const prepared = (await tool.execute(
    '1',
    { operation: 'prepare', basePlanId: plan.planId, basePlanSha256: plan.planSha256, nodeIndex: 1 },
    undefined,
    undefined,
    ctx,
  )) as { isError?: boolean; details: { planId: string; planSha256: string } };
  if (prepared.isError) throw new Error((prepared as unknown as { content: Array<{ text: string }> }).content[0].text);
  expect(prepared.isError).toBeUndefined();
  const privatePlan = (await storage.read(`${prepared.details.planId}.json`)) as AwsTerraformFailover;
  expect(privatePlan.stages.stop.configuration).toContain('aws_ec2_instance_state');
  expect(artifacts[0]).not.toContain('user_data_base64');
  const input = {
    operation: 'apply' as const,
    basePlanId: plan.planId,
    basePlanSha256: plan.planSha256,
    failoverPlanId: prepared.details.planId,
    failoverPlanSha256: prepared.details.planSha256,
  };
  expect(((await tool.execute('2', input, undefined, undefined, ctx)) as ToolResponse).isError).toBeUndefined();
  expect(((await tool.execute('3', input, undefined, undefined, ctx)) as ToolResponse).isError).toBeUndefined();
  expect(confirms).toBe(1);
  expect(runs).toBe(2);
  acceptance = 'failed';
  const failed = (await tool.execute('4', input, undefined, undefined, ctx)) as ToolResponse;
  expect(failed.isError).toBe(true);
  expect(failed.details.status).toBe('failover-acceptance-failed');
  expect(artifacts.at(-1)).toContain('"acceptance":"failed"');
  expect(confirms).toBe(1);
});

for (const trafficMode of ['unconfigured', 'healthy', 'failed', 'stale'] as const)
  test(`public native failover collects fresh recovered and final traffic: ${trafficMode}`, async () => {
    const fixture = connectFixture();
    const { planId: _id, planSha256: _sha, ...draft } = fixture.plan;
    draft.engine = 'native';
    draft.intent = { ...draft.intent, engine: 'native' };
    Object.assign(draft, {
      accountId: draft.intent.accountId,
      region: draft.intent.region,
      deploymentName: draft.intent.deploymentName,
      routing: structuredClone(draft.intent.routing),
    });
    const source = 'i-0feedface12345678';
    const arn = `arn:aws:elasticloadbalancing:${draft.intent.region}:${draft.intent.accountId}:loadbalancer/net/demo/abcdef12`;
    if (trafficMode !== 'unconfigured') {
      draft.partition = 'aws';
      draft.ownershipInventory = [{ resourceId: source, owned: false, action: 'modify-approved' }];
      draft.intent.brownfield = { resourceIds: [source], routeTableIds: [], transitGatewayRouteTableIds: [] };
      draft.intent.ingress = {
        mode: 'nlb',
        port: 8443,
        scheme: 'internal',
        loadBalancer: {
          vpcId: 'vpc-0bbbbbbbbbbbbbbbb',
          subnetIds: ['subnet-0cccccccccccccccc'],
          privateAddresses: ['10.9.0.10'],
        },
        listener: {
          name: 'ce-listener',
          namespace: 'default',
          domain: 'ce.example.invalid',
          privateAddresses: ['10.0.4.10', '10.0.5.10', '10.0.6.10'],
          originPool: { name: 'ce-origin', namespace: 'default' },
        },
        probe: { sourceInstanceId: source, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
      };
    }
    const planSha256 = canonicalSha256(draft);
    const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
    const directory = await mkdtemp(join(tmpdir(), 'aws-ce-native-failover-tool-'));
    directories.push(directory);
    const storage = await CeDeploymentStore.open(directory, {
      deploymentId: plan.deploymentName,
      engine: 'native',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    });
    let artifactCount = 0;
    const artifacts: string[] = [];
    const ctx = {
      cwd: '/tmp',
      hasUI: false,
      ui: { confirm: async () => true },
      sessionManager: {
        getSessionId: () => 'native-failover-tool-test',
        getArtifactsDir: () => directory,
        getArtifactPath: async () => null,
        async saveArtifact(value: string, type: string) {
          artifacts.push(value);
          const id = String(++artifactCount);
          await writeFile(join(directory, `${id}.${type}.log`), value);
          return id;
        },
      },
    } satisfies AwsCeToolContext;
    await saveAwsPlan(ctx.sessionManager, plan, fixture.observation);
    await saveAwsCheckpoint(ctx.sessionManager, {
      schemaVersion: 2,
      engine: 'native',
      planId: plan.planId,
      planSha256: plan.planSha256,
      completedActionIds: [],
      resolvedValues: { __INSTANCE_1__: 'i-0123456789abcdef0', __NLB_ARN__: arn },
      state: 'complete',
    });
    let nativeRuns = 0;
    let sends = 0;
    let recoveryCollections = 0;
    const tool = createAwsCeFailoverTool({ typebox } as PluginInterface, {
      platform: async () => ({ storage: async () => storage }) as unknown as CePlatformService,
      terraform: async () => {
        throw new Error('Terraform must not open for native ownership');
      },
      makeApi: () => ({
        async exec(_command, args) {
          const operation = `${args[0]}:${args[1]}`;
          let value: unknown = {};
          if (operation === 'sts:get-caller-identity') value = { Account: plan.accountId };
          if (operation === 'ec2:describe-instances')
            value = { Reservations: [{ Instances: [{ InstanceId: source, State: { Name: 'running' } }] }] };
          if (operation === 'ssm:describe-instance-information')
            value = { InstanceInformationList: [{ InstanceId: source, PingStatus: 'Online', PlatformType: 'Linux' }] };
          if (operation === 'elbv2:describe-load-balancers')
            value = {
              LoadBalancers: [{ LoadBalancerArn: arn, Scheme: 'internal', DNSName: 'internal-ce.example.aws' }],
            };
          if (operation === 'ssm:send-command')
            value = { Command: { CommandId: `12345678-1234-1234-1234-123456789ab${++sends}` } };
          if (operation === 'ssm:get-command-invocation') {
            const offset = trafficMode === 'stale' ? 60000 : 0;
            value = {
              CommandId: args[args.indexOf('--command-id') + 1],
              InstanceId: source,
              DocumentName: 'AWS-RunShellScript',
              DocumentVersion: '1',
              ExecutionStartDateTime: new Date(Date.now() - offset - 1000).toISOString(),
              ExecutionEndDateTime: new Date(Date.now() - offset).toISOString(),
              Status: trafficMode === 'failed' ? 'Failed' : 'Success',
              ResponseCode: trafficMode === 'failed' ? 1 : 0,
              StandardOutputContent: `200 10.9.0.10 ${'4'.repeat(64)}\n`,
              StandardErrorContent: trafficMode === 'failed' ? 'synthetic outage' : '',
            };
          }
          return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
        },
      }),
      collect: async (base, _checkpoint, nodeIndex, phase) => ({
        planId: base.planId,
        planSha256: base.planSha256,
        nodeIndex,
        nodeName: `${base.deploymentName}-${nodeIndex}`,
        selectedSiteName: siteForNode(base.intent, nodeIndex).name,
        phase,
        expectedEstablishedSessions:
          (base.actions ?? []).filter(
            (action) => action.kind === 'tgw-connect-peer-create' && (phase !== 'outage' || action.node !== nodeIndex),
          ).length * 2,
        acceptance: 'passed' as const,
      }),
      run: async () => {
        throw new Error('Terraform failover must not run for native ownership');
      },
      observeNative: async () => 'running',
      async runNative(_base, failover, authorized, _storage, _observe, _mutate, collect) {
        nativeRuns++;
        expect(authorized).toBe(failover.planSha256);
        expect((await collect('outage')).acceptance).toBe('passed');
        const recovered = await collect('recovered');
        expect(recovered.acceptance).toBe('passed');
        recoveryCollections++;
        return {
          status: 'failover-complete' as const,
          engine: 'native' as const,
          planId: failover.planId,
          planSha256: failover.planSha256,
          nodeIndex: failover.nodeIndex,
          observedAt: new Date().toISOString(),
          traffic: 'unknown' as const,
          originControl: 'unknown' as const,
        };
      },
    });
    const prepared = (await tool.execute(
      '1',
      { operation: 'prepare', basePlanId: plan.planId, basePlanSha256: plan.planSha256, nodeIndex: 1 },
      undefined,
      undefined,
      ctx,
    )) as { isError?: boolean; details: { planId: string; planSha256: string } };
    if (prepared.isError)
      throw new Error((prepared as unknown as { content: Array<{ text: string }> }).content[0].text);
    expect(prepared.isError).toBeUndefined();
    const applied = (await tool.execute(
      '2',
      {
        operation: 'apply',
        basePlanId: plan.planId,
        basePlanSha256: plan.planSha256,
        failoverPlanId: prepared.details.planId,
        failoverPlanSha256: prepared.details.planSha256,
      },
      undefined,
      undefined,
      ctx,
    )) as ToolResponse;
    expect(nativeRuns).toBe(1);
    if (trafficMode === 'failed' || trafficMode === 'stale') {
      expect(applied.isError).toBe(true);
      expect(sends).toBe(1);
      expect(recoveryCollections).toBe(0);
      return;
    }
    expect(applied.isError).toBeUndefined();
    expect(recoveryCollections).toBe(1);
    if (trafficMode === 'healthy') {
      expect(applied.details.traffic).toBe('healthy');
      expect(sends).toBe(2);
      const receipt = (await storage.read('aws-traffic-probe.json')) as { receipts: unknown[]; phase: string };
      expect(receipt.phase).toBe('complete');
      expect(receipt.receipts).toHaveLength(1);
      expect(artifacts.at(-1)).toContain('aws:ssm:get-command-invocation');
    } else {
      expect(applied.details.traffic).toBe('unknown');
      expect(sends).toBe(0);
    }
    expect(artifacts.some((value) => value.includes('aws-ce-native-failover'))).toBe(true);
  });

for (const marker of ['aws-terraform-lifecycle-retirement.json', 'terraform-f5-cancellation-pending.json'])
  test(`public Terraform failover rejects ${marker} before provider access`, async () => {
    const fixture = connectFixture(),
      { planId: _id, planSha256: _sha, ...draft } = fixture.plan;
    draft.routing = structuredClone(draft.intent.routing);
    const normalized = {
      ...draft,
      accountId: fixture.plan.intent.accountId,
      region: fixture.plan.intent.region,
      deploymentName: fixture.plan.intent.deploymentName,
    };
    const planSha256 = canonicalSha256(normalized),
      plan = { ...normalized, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
    const directory = await mkdtemp(join(tmpdir(), 'aws-ce-failover-retired-'));
    directories.push(directory);
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: plan.accountId,
      region: plan.region,
    };
    const storage = await CeDeploymentStore.open(directory, owner);
    await storage.write(marker, { malformed: true });
    let providers = 0;
    const platform = { storage: async () => storage } as unknown as CePlatformService;
    const ctx = {
      cwd: directory,
      hasUI: false,
      ui: {
        confirm: async () => {
          throw Error('approval forbidden');
        },
      },
      sessionManager: {
        getSessionId: () => directory,
        getArtifactsDir: () => null,
        getArtifactPath: async () => null,
        saveArtifact: async () => 'saved',
      },
    } satisfies AwsCeToolContext;
    await saveAwsPlan(ctx.sessionManager, plan, {} as never);
    const tool = createAwsCeFailoverTool({ typebox } as PluginInterface, {
      platform: async () => platform,
      terraform: async () => {
        providers++;
        throw Error('provider forbidden');
      },
    });
    for (const operation of ['prepare', 'apply'] as const) {
      const result = (await tool.execute(
        `retired-${operation}`,
        {
          operation,
          basePlanId: plan.planId,
          basePlanSha256: plan.planSha256,
          ...(operation === 'prepare' ? { nodeIndex: 1 } : {}),
        },
        undefined,
        undefined,
        ctx,
      )) as { isError: boolean; content: unknown };
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('retirement');
      expect(providers).toBe(0);
    }
  });

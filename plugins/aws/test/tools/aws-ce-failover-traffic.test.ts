import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../../src/aws/exec';
import type { PluginInterface } from '../../src/aws/types';
import { type AwsCeToolContext, saveAwsCheckpoint, saveAwsPlan } from '../../src/ce/artifacts';
import { canonicalSha256, sha256Hex } from '../../src/ce/canonical';
import { runAwsNativeFailover } from '../../src/ce/native-failover';
import { renderAwsTerraformConnect } from '../../src/ce/terraform-connect';
import { runAwsTerraformFailover } from '../../src/ce/terraform-failover';
import { siteForNode } from '../../src/ce/topology';
import type { AwsCeCheckpoint } from '../../src/ce/types';
import { createAwsCeFailoverTool } from '../../src/tools/aws-ce-failover';
import { genuineIngressFixture } from '../ce/genuine-ingress-fixture';

type Json = Record<string, unknown>;
type Mode = 'healthy' | 'failed-recovery' | 'stale-recovery' | 'failed-outage';
type Response = { isError?: boolean; content: Array<{ text: string }>; details: Json };
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
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

async function fixture(engine: 'native' | 'terraform', profile: 'independent' | 'ha', initialMode: Mode) {
  const directory = await mkdtemp(join(tmpdir(), 'public-genuine-failover-'));
  directories.push(directory);
  const ingress = await genuineIngressFixture(engine, profile === 'ha', directory);
  const { plan, observation, bootstrap, store: storage } = ingress;
  expect(ingress.receipt?.listener).toBe('configured');
  expect(ingress.receipt?.traffic).toBe('unknown');
  expect(ingress.state.posts).toBe(1);
  expect(ingress.state.origins).toBe(1);
  const planSha256 = plan.planSha256;
  const source = 'i-0feedface12345678';
  const instanceId = 'i-11111111111111111';
  const peers = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  expect(peers).toHaveLength(6);
  const resolvedValues: Record<string, string> = {
    ...ingress.resolved,
    __INSTANCE_1__: instanceId,
    __NLB_ARN__: `arn:aws:elasticloadbalancing:${plan.region}:${plan.accountId}:loadbalancer/net/demo/abcdef12`,
  };
  for (const [index, action] of peers.entries()) {
    const capture = action.capture?.placeholder;
    const attachment = action.args?.[action.args.indexOf('--transit-gateway-attachment-id') + 1];
    if (!capture || !attachment) throw new Error('Genuine peer plan does not resolve its capture and attachment');
    resolvedValues[capture] = `tgw-connect-peer-${String(index + 1).repeat(17)}`;
    resolvedValues[attachment] = `tgw-attach-${(index < 4 ? '1' : '2').repeat(17)}`;
  }
  const checkpoint: AwsCeCheckpoint = {
    schemaVersion: plan.schemaVersion,
    engine,
    planId: plan.planId,
    planSha256,
    completedActionIds: [],
    resolvedValues,
    state: 'complete',
  };
  const artifacts: string[] = [];
  let confirms = 0;
  const ctx: AwsCeToolContext = {
    cwd: directory,
    hasUI: true,
    ui: {
      confirm: async () => {
        confirms++;
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => directory,
      getArtifactsDir: () => directory,
      getArtifactPath: async () => null,
      saveArtifact: async (value, type) => {
        artifacts.push(value);
        const id = String(artifacts.length);
        await writeFile(join(directory, `${id}.${type}.log`), value);
        return id;
      },
    },
  };
  await saveAwsPlan(ctx.sessionManager, plan, observation);
  await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
  await storage.write('terraform-routing-checkpoint.json', checkpoint);
  let state: 'running' | 'stopped' = 'running';
  let mode = initialMode;
  let sends = 0;
  let stops = 0;
  let starts = 0;
  let releases = 0;
  const samples: Array<{ id: string; phase: 'outage' | 'recovered' }> = [];
  const api: AwsExecApi = {
    async exec(_command, args) {
      const operation = `${args[0]}:${args[1]}`;
      let value: unknown;
      if (operation === 'sts:get-caller-identity') value = { Account: plan.accountId };
      else if (operation === 'ec2:describe-instances') {
        const requested = args[args.indexOf('--instance-ids') + 1];
        const instance =
          requested === source
            ? { InstanceId: source, State: { Name: 'running' } }
            : {
                InstanceId: instanceId,
                State: { Name: state },
                Tags: [
                  { Key: 'xcsh-managed-by', Value: 'aws-ce' },
                  { Key: 'xcsh-execution-engine', Value: engine },
                  { Key: 'xcsh-deployment-id', Value: plan.deploymentName },
                  { Key: 'xcsh-plan-sha256', Value: plan.planSha256 },
                  { Key: 'xcsh-node-index', Value: '1' },
                ],
              };
        value = { Reservations: [{ OwnerId: plan.accountId, Instances: [instance] }] };
      } else if (operation === 'ec2:stop-instances' || operation === 'ec2:start-instances') {
        expect(args[args.indexOf('--instance-ids') + 1]).toBe(instanceId);
        state = operation === 'ec2:stop-instances' ? 'stopped' : 'running';
        if (state === 'stopped') stops++;
        else starts++;
        value = {};
      } else if (operation === 'ec2:describe-transit-gateway-connect-peers') {
        value = {
          TransitGatewayConnectPeers: peers.map((action, index) => ({
            TransitGatewayConnectPeerId: resolvedValues[action.capture?.placeholder ?? ''],
            TransitGatewayAttachmentId:
              resolvedValues[action.args?.[action.args.indexOf('--transit-gateway-attachment-id') + 1] ?? ''],
            State: 'available',
            Tags: [
              { Key: 'xcsh-managed-by', Value: 'aws-ce' },
              { Key: 'xcsh-deployment-id', Value: plan.deploymentName },
              { Key: 'xcsh-execution-engine', Value: engine },
            ],
            ConnectPeerConfiguration: {
              PeerAddress: resolvedValues[`__NODE_${action.node}_SLI_IP__`],
              TransitGatewayAddress: `100.64.0.${index + 1}`,
              InsideCidrBlocks: [`169.254.${index + 10}.0/29`],
              Protocol: 'gre',
              BgpConfigurations: [2, 3].map((last) => ({
                TransitGatewayAddress: `169.254.${index + 10}.${last}`,
                PeerAddress: `169.254.${index + 10}.1`,
                PeerAsn: plan.routing.customerAsn,
                TransitGatewayAsn: plan.routing.transitGatewayAsn,
                BgpStatus: action.node === 1 && state === 'stopped' ? 'down' : 'up',
              })),
            },
          })),
        };
      } else if (operation === 'ssm:describe-instance-information')
        value = { InstanceInformationList: [{ InstanceId: source, PingStatus: 'Online', PlatformType: 'Linux' }] };
      else if (operation === 'elbv2:describe-load-balancers')
        value = {
          LoadBalancers: [
            { LoadBalancerArn: resolvedValues.__NLB_ARN__, Scheme: 'internal', DNSName: 'internal-ce.example.aws' },
          ],
        };
      else if (operation === 'ssm:send-command') {
        const id = `12345678-1234-1234-1234-${(++sends).toString(16).padStart(12, '0')}`;
        samples.push({ id, phase: state === 'stopped' ? 'outage' : 'recovered' });
        value = { Command: { CommandId: id } };
      } else if (operation === 'ssm:get-command-invocation') {
        const failed =
          mode === 'failed-outage' ? state === 'stopped' : mode === 'failed-recovery' && state === 'running';
        const offset = mode === 'stale-recovery' && state === 'running' ? 60000 : 0;
        value = {
          CommandId: args[args.indexOf('--command-id') + 1],
          InstanceId: source,
          DocumentName: 'AWS-RunShellScript',
          DocumentVersion: '1',
          ExecutionStartDateTime: new Date(Date.now() - offset - 1000).toISOString(),
          ExecutionEndDateTime: new Date(Date.now() - offset).toISOString(),
          Status: failed ? 'Failed' : 'Success',
          ResponseCode: failed ? 1 : 0,
          StandardOutputContent: `200 10.9.0.10 ${'4'.repeat(64)}\n`,
          StandardErrorContent: failed ? 'synthetic outage' : '',
        };
      } else throw Error(`Unexpected synthetic AWS operation: ${operation}`);
      return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
    },
  };

  // Simulated Terraform session models only exact saved power plans and a refresh read;
  // the real public tool and owning coordinator perform admission and journal transitions.
  const configuration = engine === 'terraform' ? renderAwsTerraformConnect(plan, observation, bootstrap) : '';
  let current = configuration;
  let appliedControl: 'running' | 'stopped' | undefined;
  let latest: PlanReceipt | undefined;
  let planNumber = 0;
  const session = {
    readConfiguration: async (expected: string) => {
      expect(expected).toBe(sha256Hex(current));
      return current;
    },
    readOutputs: async () => ({
      ce_instances: Object.fromEntries(
        [1, 2, 3].map((node) => [
          String(node),
          {
            id: `i-${String(node).repeat(17)}`,
            hostname: `${plan.deploymentName}-${node}`,
            site_name: siteForNode(plan.intent, node).name,
          },
        ]),
      ),
    }),
    reviseConfiguration: async (expected: string, next: string) => {
      expect(expected).toBe(sha256Hex(current));
      current = next;
    },
    plan: async () => {
      const resources = JSON.parse(current).resource as Record<string, Json>;
      const control = resources.aws_ec2_instance_state?.ce_failover as
        | { state: 'running' | 'stopped'; instance_id: string }
        | undefined;
      const changes = Object.entries(resources).flatMap(([type, rows]) =>
        Object.keys(rows).map((name) => ({
          address: `${type}.${name}`,
          type,
          actions: [
            type === 'aws_ec2_instance_state'
              ? appliedControl === undefined
                ? 'create'
                : control?.state === appliedControl
                  ? 'no-op'
                  : 'update'
              : 'no-op',
          ],
        })),
      );
      if (!control && appliedControl)
        changes.push({
          address: 'aws_ec2_instance_state.ce_failover',
          type: 'aws_ec2_instance_state',
          actions: ['delete'],
        });
      latest = {
        schemaVersion: 1,
        engine: 'terraform',
        deploymentId: plan.deploymentName,
        backendIdentity: `local:${plan.deploymentName}`,
        configurationSha256: sha256Hex(current),
        providerLockSha256: 'a'.repeat(64),
        planSha256: canonicalSha256({ current, planNumber: ++planNumber, changes }),
        changes,
        noChanges: changes.every((change) => change.actions[0] === 'no-op'),
      };
      return latest;
    },
    apply: async (receipt: PlanReceipt) => {
      if (!latest) throw new Error('Synthetic apply requires an exact saved plan');
      expect(receipt.planSha256).toBe(latest.planSha256);
      expect(receipt.configurationSha256).toBe(sha256Hex(current));
      const control = JSON.parse(current).resource.aws_ec2_instance_state?.ce_failover as
        | { state: 'running' | 'stopped'; instance_id: string }
        | undefined;
      if (control) {
        expect(control.instance_id).toBe(instanceId);
        state = control.state;
        if (state === 'stopped') stops++;
        else starts++;
        appliedControl = state;
      } else {
        appliedControl = undefined;
        releases++;
      }
    },
  } as unknown as TerraformSession;
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256,
    stage: 'applied',
    configurationSha256: sha256Hex(configuration),
  });
  const platform = { storage: async () => storage } as unknown as CePlatformService;
  const terraform = { open: async () => session } as unknown as CeTerraformService;
  const tool = createAwsCeFailoverTool({ typebox } as PluginInterface, {
    platform: async () => platform,
    terraform: async () => terraform,
    makeApi: () => api,
    runNative: (api, plan, checkpoint, failover, resume, storage, health, traffic) =>
      runAwsNativeFailover(api, plan, checkpoint, failover, resume, storage, health, traffic, {
        attempts: 1,
        intervalMs: 0,
        wait: async () => {},
      }),
    run: (session, plan, checkpoint, failover, resume, storage, health, traffic) =>
      runAwsTerraformFailover(session, plan, checkpoint, failover, resume, storage, health, traffic, {
        attempts: 1,
        intervalMs: 0,
        wait: async () => {},
      }),
  });
  const prepared = (await tool.execute(
    'prepare',
    { operation: 'prepare', nodeIndex: 1, basePlanId: plan.planId, basePlanSha256: planSha256 },
    undefined,
    undefined,
    ctx,
  )) as Response;
  if (prepared.isError) throw Error(prepared.content[0].text);
  const input = {
    operation: 'apply' as const,
    basePlanId: plan.planId,
    basePlanSha256: planSha256,
    failoverPlanId: String(prepared.details.planId),
    failoverPlanSha256: String(prepared.details.planSha256),
  };
  return {
    storage,
    artifacts,
    samples,
    engine,
    profile,
    input,
    execute: async () => (await tool.execute('apply', input, undefined, undefined, ctx)) as Response,
    recoverEvidence: () => {
      mode = 'healthy';
    },
    counts: () => ({ stops, starts, releases, sends, confirms, state, current, finalPlan: latest }),
  };
}

for (const engine of ['native', 'terraform'] as const)
  for (const profile of ['independent', 'ha'] as const)
    for (const mode of [
      'healthy',
      'failed-recovery',
      'stale-recovery',
      ...(profile === 'ha' ? (['failed-outage'] as const) : []),
    ] as const)
      test(`actual public ${engine} ${profile} failover after genuine creation/ingress with default BGP/HTTP collectors: ${mode}`, async () => {
        const f = await fixture(engine, profile, mode);
        let result = await f.execute();
        if (mode !== 'healthy') {
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain('has not converged');
          const checkpoint = (await f.storage.read(`${f.input.failoverPlanId}-checkpoint.json`)) as { phase: string };
          expect(checkpoint.phase).toBe(mode === 'failed-outage' ? 'outage' : 'recovered');
          expect(f.counts().stops).toBe(1);
          expect(f.counts().starts).toBe(mode === 'failed-outage' ? 0 : 1);
          expect(f.counts().releases).toBe(0);
          expect(f.artifacts.some((value) => value.includes('aws-ce-failover-receipt'))).toBe(false);
          f.recoverEvidence();
          result = await f.execute();
        }
        if (result.isError) throw Error(result.content[0].text);
        expect(result.details.traffic).toBe('healthy');
        expect(result.details.status).toBe('failover-complete');
        expect(f.counts().stops).toBe(1);
        expect(f.counts().starts).toBe(1);
        expect(f.counts().confirms).toBe(1);
        expect(f.counts().state).toBe('running');
        expect(f.samples.filter((sample) => sample.phase === 'outage')).toHaveLength(
          profile === 'ha' ? (mode === 'failed-outage' ? 2 : 1) : 0,
        );
        expect(new Set(f.samples.map((sample) => sample.id)).size).toBe(f.samples.length);
        const recovered = (await f.storage.read(`${f.input.failoverPlanId}-recovered-evidence.json`)) as {
          trafficEvidence: { commandId: string };
          acceptance: string;
        };
        const final = result.details.trafficEvidence as { commandId: string; source: string };
        expect(recovered.acceptance).toBe('passed');
        expect(recovered.trafficEvidence.commandId).not.toBe(final.commandId);
        expect(final.source).toBe('aws:ssm:get-command-invocation');
        if (engine === 'terraform') {
          expect(f.counts().releases).toBe(1);
          expect(f.counts().finalPlan?.noChanges).toBe(true);
          expect(JSON.parse(f.counts().current).resource.aws_ec2_instance_state).toBeUndefined();
          expect(result.details.restorationTiming).toMatchObject({ thresholdMs: 45000, status: 'passed' });
        }
        const before = f.counts();
        const retry = await f.execute();
        if (retry.isError) throw Error(retry.content[0].text);
        expect(f.counts().stops).toBe(before.stops);
        expect(f.counts().starts).toBe(before.starts);
        expect(f.counts().releases).toBe(before.releases);
        expect(f.counts().sends).toBe(before.sends + 1);
        expect(f.counts().confirms).toBe(1);
        if (engine === 'terraform') expect(retry.details.restorationTiming).toEqual(result.details.restorationTiming);
      });

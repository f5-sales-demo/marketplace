import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { saveAwsPlan } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { createAwsCeDiagnoseTool } from '../../src/tools/aws-ce-diagnose';
import { createAwsCeStatusTool } from '../../src/tools/aws-ce-status';
import { foundationPlan } from '../ce/terraform-fixtures';

test('public Terraform status and passive diagnosis use current workspace IDs without routing checkpoint', async () => {
  const initial = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const topology = { nodeCount: 1 };
  const material = {
    ...draft,
    topology,
    siteName: initial.intent.siteName,
    routing: { profile: 'direct-eni' },
    intent: { ...initial.intent, topology, routing: { profile: 'direct-eni' } },
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
  };
  const sha = canonicalSha256(material);
  const plan = { ...material, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const id = 'i-0123456789abcdef0';
  const old = 'i-11111111111111111';
  const artifacts: string[] = [];
  const ctx = {
    cwd: '/tmp',
    hasUI: false,
    ui: { confirm: async () => false },
    sessionManager: {
      getSessionId: () => 'status-current-instance',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async (value: string) => {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  };
  await saveAwsPlan(ctx.sessionManager, plan, {} as never);
  let unavailable = false;
  let registrationCalls = 0;
  const session = {
    readOutputs: async () => ({
      ce_instances: { '1': { id, hostname: `${plan.deploymentName}-1`, site_name: plan.siteName } },
    }),
    readResourceIdentities: async () => [{ address: 'aws_instance.node_1', type: 'aws_instance', id }],
  };
  const platform = {
    storage: async () => ({
      verify: async () => {},
      read: async (name: string) => {
        if (name === 'terraform-workflow.json')
          return { schemaVersion: 1, engine: 'terraform', planSha256: sha, stage: 'registration-pending' };
        throw Object.assign(Error('missing'), { code: 'ENOENT' });
      },
    }),
    runtime: async () => ({
      observeHealth: async () => ({ status: 'unknown' }),
      observeRegistrations: async (_: unknown, ids: unknown) => {
        registrationCalls++;
        expect(ids).toEqual({ [`${plan.deploymentName}-1`]: id });
        return { status: 'healthy' };
      },
    }),
  };
  const pi = {
    typebox: { Type },
    events: {
      emit: (channel: string, request: any) => {
        if (channel.includes('ce-platform')) request.resolve(platform);
        else
          request.resolve({
            open: async (owner: any, deployment: any, resume: any) => {
              expect(owner.engine).toBe('terraform');
              expect(deployment.scope.account).toBe(plan.accountId);
              expect(resume).toBe('current');
              if (unavailable) throw Error('workspace unavailable');
              return session;
            },
          });
      },
    },
  } as never;
  const calls: string[][] = [];
  const instance = (instanceId: string, state: string) => ({
    InstanceId: instanceId,
    State: { Name: state },
    NetworkInterfaces: [],
    Tags: Object.entries({
      'xcsh-managed-by': 'aws-ce',
      'xcsh-deployment-id': plan.deploymentName,
      'xcsh-execution-engine': 'terraform',
      'xcsh-plan-sha256': sha,
      'ves-io-site-name': plan.siteName,
      'xcsh-node-index': '1',
    }).map(([Key, Value]) => ({ Key, Value })),
  });
  const api = {
    exec: async (_: string, args: string[]) => {
      calls.push(args);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[0] === 'sts'
            ? { Account: plan.accountId }
            : args[1] === 'describe-instances'
              ? { Reservations: [{ Instances: [instance(old, 'terminated'), instance(id, 'running')] }] }
              : args[1] === 'describe-network-interfaces'
                ? { NetworkInterfaces: [] }
                : {},
        ),
      };
    },
  };
  const params = { planId: plan.planId, planSha256: sha };
  const result = await createAwsCeStatusTool(pi, () => api).execute('status', params, undefined, undefined, ctx);
  expect(result.isError).not.toBe(true);
  expect((result.details.status as any).aws.status).toBe('observed');
  expect((result.details.status as any).aws.historicalNodes[0].instanceId).toBe(old);
  const diagnosis = await createAwsCeDiagnoseTool(pi, () => api).execute(
    'diagnose',
    { ...params, mode: 'passive' },
    undefined,
    undefined,
    ctx,
  );
  expect(diagnosis.isError).not.toBe(true);
  expect((diagnosis.details as any).passive.scope.instanceIds).toEqual([id]);
  expect(calls.filter((args) => args[1] === 'get-console-output').every((args) => !args.includes(old))).toBe(true);
  unavailable = true;
  const missing = await createAwsCeStatusTool(pi, () => api).execute('missing', params, undefined, undefined, ctx);
  expect((missing.details.status as any).f5.registration.status).toBe('unknown');
  expect(registrationCalls).toBe(2);
});

import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { collectAwsCeStatus } from '../../src/ce/status';
import type { AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';
import { createAwsCeStatusTool } from '../../src/tools/aws-ce-status';

const id = 'i-0123456789abcdef0';
const plan = {
  accountId: '123456789012',
  region: 'us-east-1',
  deploymentName: 'demo',
  siteName: 'site-a',
  engine: 'native',
  topology: { nodeCount: 1 },
  intent: { awsProfile: 'profile', siteName: 'site-a', topology: { nodeCount: 1 } },
} as AwsCePlan;
const checkpoint = {
  state: 'complete',
  completedActionIds: ['one'],
  resolvedValues: { __INSTANCE_1__: id },
} as AwsCeCheckpoint;
const resource = {
  InstanceId: id,
  State: { Name: 'running' },
  NetworkInterfaces: [],
  Tags: [
    { Key: 'ves-io-site-name', Value: 'site-a' },
    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
    { Key: 'xcsh-deployment-id', Value: 'demo' },
    { Key: 'xcsh-execution-engine', Value: 'native' },
    { Key: 'xcsh-plan-sha256', Value: 'a'.repeat(64) },
  ],
};
const api = {
  exec: async (_command: string, args: string[]) => ({
    exitCode: 0,
    stderr: '',
    stdout: JSON.stringify(
      args[0] === 'sts'
        ? { Account: plan.accountId }
        : args[1] === 'describe-instances'
          ? { Reservations: [{ Instances: [resource] }] }
          : { NetworkInterfaces: [] },
    ),
  }),
};
test('status collects registration only after current AWS identity correlation and never infers traffic health', async () => {
  let registered = 0;
  const runtime = {
    observeHealth: async () => ({ status: 'healthy', source: 'fixture-api' }),
    observeRegistrations: async (_binding: unknown, instances: Record<string, string>) => {
      registered++;
      expect(instances).toEqual({ 'demo-1': id });
      return { status: 'healthy', source: 'fixture-api' };
    },
  };
  const result = await collectAwsCeStatus(plan, checkpoint, api, runtime);
  expect(result.aws.counts).toEqual({ instances: 1, interfaces: 0 });
  expect(result.f5.registration.status).toBe('healthy');
  expect(result.traffic.status).toBe('unknown');
  expect(result.routing.status).toBe('unknown');
  const missing = await collectAwsCeStatus(plan, undefined, api, runtime);
  expect(missing.f5.registration.status).toBe('unknown');
  expect(registered).toBe(1);
});
test('status keeps failed collection unknown and rejects caller health before reading a plan', async () => {
  const unavailable = await collectAwsCeStatus(plan, checkpoint, {
    exec: async () => {
      throw new Error('credential expired');
    },
  });
  expect(unavailable.aws.status).toBe('unknown');
  expect(unavailable.aws.counts).toBeUndefined();
  expect(unavailable.f5.health.status).toBe('unknown');
  const tool = createAwsCeStatusTool({ typebox: { Type } } as never);
  const result = await tool.execute(
    'test',
    { planId: 'fake', planSha256: 'fake', f5Evidence: { healthyNodes: [1] } } as never,
    undefined,
    undefined,
    {} as never,
  );
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).not.toContain('healthyNodes');
});

test('observes each independent site using only its own cloud instance binding', async () => {
  const sites = [
    { name: 'site-a', nodeIndexes: [1] },
    { name: 'site-b', nodeIndexes: [2] },
    { name: 'site-c', nodeIndexes: [3] },
  ];
  const independent = {
    ...plan,
    topology: { nodeCount: 3 },
    intent: { ...plan.intent, topology: { nodeCount: 3, sites } },
  } as AwsCePlan;
  const instances = sites.map((site, index) => ({
    ...resource,
    InstanceId: `i-${String(index + 1).repeat(17)}`,
    Tags: resource.Tags.map((tag) => (tag.Key === 'ves-io-site-name' ? { ...tag, Value: site.name } : tag)),
  }));
  const state = {
    ...checkpoint,
    resolvedValues: Object.fromEntries(
      instances.map((instance, index) => [`__INSTANCE_${index + 1}__`, instance.InstanceId]),
    ),
  };
  const api = {
    exec: async (_command: string, args: string[]) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        args[0] === 'sts'
          ? { Account: plan.accountId }
          : args[1] === 'describe-instances'
            ? { Reservations: [{ Instances: instances }] }
            : { NetworkInterfaces: [] },
      ),
    }),
  };
  const observed: string[] = [];
  const result = await collectAwsCeStatus(independent, state, api, {
    observeHealth: async () => ({ status: 'healthy' }),
    observeRegistrations: async (binding, ids) => {
      observed.push(binding.siteName);
      const index = sites.findIndex((site) => site.name === binding.siteName);
      expect(ids).toEqual({ [`demo-${index + 1}`]: instances[index].InstanceId });
      return { status: 'healthy' };
    },
  });
  expect(observed).toEqual(['site-a', 'site-b', 'site-c']);
  expect(result.f5.sites).toHaveLength(3);
  expect(result.f5.registration.status).toBe('healthy');
});

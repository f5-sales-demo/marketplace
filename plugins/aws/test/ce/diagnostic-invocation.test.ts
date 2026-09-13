import { expect, it } from 'bun:test';
import { observeDiagnosticInvocation, verifyDiagnosticInstance } from '../../src/ce/diagnostic-invocation';
import type { AwsCePlan } from '../../src/ce/types';

const instanceId = 'i-1234567890abcdef0';
const commandId = '00000000-0000-0000-0000-000000000001';
const plan = {
  accountId: '123456789012',
  deploymentName: 'ce',
  engine: 'native',
  region: 'us-east-1',
  intent: { siteName: 'site', topology: { nodeCount: 1 } },
} as unknown as AwsCePlan;
const tags = {
  'xcsh-managed-by': 'aws-ce',
  'xcsh-deployment-id': 'ce',
  'xcsh-execution-engine': 'native',
  'ves-io-site-name': 'site',
};
const instance = {
  InstanceId: instanceId,
  State: { Name: 'running' },
  Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
};
const response = (value: unknown) => ({ stdout: JSON.stringify(value), stderr: '', exitCode: 0 });
it('requires exact account, instance, engine and site ownership for guest execution', async () => {
  const valid = { Reservations: [{ OwnerId: plan.accountId, Instances: [instance] }] };
  await verifyDiagnosticInstance({ exec: async () => response(valid) }, plan, instanceId, 1);
  for (const value of [
    {},
    { ...valid, NextToken: 'more' },
    { Reservations: [{ OwnerId: 'foreign', Instances: [instance] }] },
    { Reservations: [{ OwnerId: plan.accountId, Instances: [instance, instance] }] },
    {
      Reservations: [
        {
          OwnerId: plan.accountId,
          Instances: [{ ...instance, Tags: instance.Tags.filter((tag) => tag.Key !== 'xcsh-execution-engine') }],
        },
      ],
    },
  ])
    await expect(
      verifyDiagnosticInstance({ exec: async () => response(value) }, plan, instanceId, 1),
    ).rejects.toThrow();
});
it('polls eventual consistency and pending execution before reporting TCP connection evidence', async () => {
  let calls = 0;
  const result = await observeDiagnosticInvocation(
    {
      exec: async () => {
        calls++;
        if (calls === 1) return { stdout: '', stderr: 'InvocationDoesNotExist', exitCode: 1 };
        return response({
          CommandId: commandId,
          InstanceId: instanceId,
          DocumentName: 'AWS-RunShellScript',
          Status: calls === 2 ? 'InProgress' : 'Success',
          ResponseCode: calls === 2 ? -1 : 0,
          StandardOutputContent: 'secret',
          StandardOutputUrl: 'secret',
        });
      },
    },
    commandId,
    instanceId,
    plan.region,
    'tcp',
    undefined,
    async () => {},
  );
  expect(calls).toBe(3);
  expect(result).toMatchObject({ status: 'healthy', scope: 'tcp-connect-only' });
  expect(JSON.stringify(result)).not.toContain('secret');
});
it('keeps UDP, wrong identity, failed response codes and unrecognized states from claiming healthy', async () => {
  for (const [change, protocol, expected] of [
    [{}, 'udp', 'unknown'],
    [{ InstanceId: 'foreign' }, 'tcp', 'unknown'],
    [{ ResponseCode: 1 }, 'tcp', 'unknown'],
    [{ Status: 'unexpected' }, 'tcp', 'unknown'],
    [{ Status: 'Failed' }, 'tcp', 'degraded'],
  ] as const) {
    const result = await observeDiagnosticInvocation(
      {
        exec: async () =>
          response({
            CommandId: commandId,
            InstanceId: instanceId,
            DocumentName: 'AWS-RunShellScript',
            Status: 'Success',
            ResponseCode: 0,
            ...change,
          }),
      },
      commandId,
      instanceId,
      plan.region,
      protocol,
      undefined,
      async () => {},
    );
    expect(result.status).toBe(expected);
  }
});
it('bounds polling, rejects missing command IDs and propagates cancellation', async () => {
  let calls = 0;
  const api = {
    exec: async () => {
      calls++;
      return response({
        CommandId: commandId,
        InstanceId: instanceId,
        DocumentName: 'AWS-RunShellScript',
        Status: 'Pending',
      });
    },
  };
  expect(
    (await observeDiagnosticInvocation(api, commandId, instanceId, plan.region, 'tcp', undefined, async () => {}))
      .status,
  ).toBe('unknown');
  expect(calls).toBe(30);
  await expect(observeDiagnosticInvocation(api, 'missing', instanceId, plan.region, 'tcp')).rejects.toThrow(
    'do not resubmit',
  );
  await expect(
    observeDiagnosticInvocation(api, commandId, instanceId, plan.region, 'tcp', AbortSignal.abort()),
  ).rejects.toThrow();
  expect(calls).toBe(30);
});

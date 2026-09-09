import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { collectAwsTrafficProbe } from '../../src/ce/traffic-probe';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

function fixture() {
  const sourceInstanceId = 'i-0feedface12345678';
  const plan = foundationPlan() as AwsCePlan;
  plan.accountId = plan.intent.accountId;
  plan.region = plan.intent.region;
  plan.deploymentName = plan.intent.deploymentName;
  plan.partition = 'aws';
  plan.interfaces = plan.intent.interfaces;
  plan.ownershipInventory = [{ resourceId: sourceInstanceId, owned: false, action: 'modify-approved' }];
  plan.intent.brownfield = {
    resourceIds: [sourceInstanceId],
    routeTableIds: [],
    transitGatewayRouteTableIds: [],
  };
  plan.intent.ingress = {
    mode: 'nlb',
    port: 8443,
    scheme: 'internal',
    listener: {
      name: 'ce-listener',
      namespace: 'default',
      domain: 'ce.example.invalid',
      originPool: { name: 'ce-origin', namespace: 'default' },
    },
    probe: {
      sourceInstanceId,
      path: '/healthz',
      expectedStatus: 200,
      expectedBodySha256: '4'.repeat(64),
    },
  };
  const arn = `arn:aws:elasticloadbalancing:${plan.region}:${plan.accountId}:loadbalancer/net/ce/abcdef12`;
  const values = new Map<string, unknown>();
  const calls: string[][] = [];
  const storage = {
    async verify() {},
    async read(name: string) {
      if (!values.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(values.get(name));
    },
    async write(name: string, value: unknown) {
      values.set(name, structuredClone(value));
    },
  } as unknown as CeDeploymentStore;
  const api = {
    async exec(_command: string, args: string[]) {
      calls.push(args);
      const operation = `${args[0]}:${args[1]}`;
      const response =
        operation === 'sts:get-caller-identity'
          ? { Account: plan.accountId }
          : operation === 'ec2:describe-instances'
            ? {
                Reservations: [
                  {
                    Instances: [{ InstanceId: sourceInstanceId, State: { Name: 'running' } }],
                  },
                ],
              }
            : operation === 'ssm:describe-instance-information'
              ? {
                  InstanceInformationList: [
                    {
                      InstanceId: sourceInstanceId,
                      PingStatus: 'Online',
                      PlatformType: 'Linux',
                    },
                  ],
                }
              : operation === 'elbv2:describe-load-balancers'
                ? { LoadBalancers: [{ LoadBalancerArn: arn, Scheme: 'internal', DNSName: 'internal-ce.example.aws' }] }
                : operation === 'ssm:send-command'
                  ? { Command: { CommandId: '12345678-1234-1234-1234-123456789abc' } }
                  : operation === 'ssm:get-command-invocation'
                    ? {
                        CommandId: '12345678-1234-1234-1234-123456789abc',
                        InstanceId: sourceInstanceId,
                        DocumentName: 'AWS-RunShellScript',
                        DocumentVersion: '1',
                        Status: 'Success',
                        ResponseCode: 0,
                        StandardOutputContent: `200 ${'4'.repeat(64)}\n`,
                        StandardErrorContent: '',
                      }
                    : {};
      return { exitCode: 0, stdout: JSON.stringify(response), stderr: '' };
    },
  };
  return { plan, arn, values, calls, storage, api };
}

test('collects content-bound SSM traffic evidence and resumes without another request', async () => {
  const f = fixture();
  const first = await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api);
  const second = await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api);
  expect(first).toEqual(second);
  expect(first.status).toBe('healthy');
  expect(f.calls.filter((args) => args[0] === 'ssm' && args[1] === 'send-command')).toHaveLength(1);
  const serialized = JSON.stringify(f.values.get('aws-traffic-probe.json'));
  expect(serialized).not.toContain('curl');
  expect(serialized).not.toContain('StandardOutputContent');
  const forged = f.values.get('aws-traffic-probe.json') as Record<string, unknown>;
  f.values.set('aws-traffic-probe.json', {
    ...forged,
    evidence: { ...(forged.evidence as Record<string, unknown>), bodySha256: '5'.repeat(64) },
  });
  await expect(
    collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api),
  ).rejects.toThrow('Persisted traffic evidence');
});

test('rejects a probe source outside the reviewed inventory before AWS calls', async () => {
  const f = fixture();
  f.plan.ownershipInventory = [];
  await expect(
    collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api),
  ).rejects.toThrow('outside the reviewed');
  expect(f.calls).toHaveLength(0);
});

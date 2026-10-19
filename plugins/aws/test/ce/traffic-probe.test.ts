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

test('checkpoints a failed request and retries without manual state repair', async () => {
  const f = fixture();
  let sends = 0;
  const api = {
    async exec(command: string, args: string[]) {
      if (args[0] === 'ssm' && args[1] === 'send-command') {
        sends++;
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ Command: { CommandId: `12345678-1234-1234-1234-123456789ab${sends}` } }),
        };
      }
      if (args[0] === 'ssm' && args[1] === 'get-command-invocation') {
        const failed = sends === 1;
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            CommandId: `12345678-1234-1234-1234-123456789ab${sends}`,
            InstanceId: f.plan.intent.ingress?.mode === 'nlb' ? f.plan.intent.ingress.probe.sourceInstanceId : '',
            DocumentName: 'AWS-RunShellScript',
            DocumentVersion: '1',
            Status: failed ? 'Failed' : 'Success',
            ResponseCode: failed ? 1 : 0,
            StandardOutputContent: failed ? `000 ${'e3b0'.padEnd(64, '0')}\n` : `200 ${'4'.repeat(64)}\n`,
            StandardErrorContent: failed ? 'connection timed out' : '',
          }),
        };
      }
      return f.api.exec(command, args);
    },
  };
  await expect(
    collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, api),
  ).rejects.toThrow('has not converged');
  const pending = f.values.get('aws-traffic-probe.json') as Record<string, unknown>;
  expect(pending.phase).toBe('ready');
  expect(JSON.stringify(pending)).not.toContain('connection timed out');
  const result = await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, api);
  expect(result.status).toBe('healthy');
  expect(sends).toBe(2);
});

test('rejects a probe source outside the reviewed inventory before AWS calls', async () => {
  const f = fixture();
  f.plan.ownershipInventory = [];
  await expect(
    collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api),
  ).rejects.toThrow('outside the reviewed');
  expect(f.calls).toHaveLength(0);
});

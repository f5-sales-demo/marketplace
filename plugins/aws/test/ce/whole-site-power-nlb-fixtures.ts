import type { AwsExecApi } from '../../src/aws/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { powerIdentityFixture } from './whole-site-power-fixtures';

export async function nlbPowerFixture(engine: 'native' | 'terraform' = 'native') {
  const f = powerIdentityFixture(engine);
  const { planId: _id, planSha256: _sha, ...draft } = f.base;
  draft.intent = {
    ...draft.intent,
    routing: { ...draft.intent.routing, profile: 'nlb-ingress' },
    ingress: {
      mode: 'nlb',
      port: 443,
      scheme: 'internal',
      loadBalancer: {
        vpcId: 'vpc-0123456789abcdef0',
        subnetIds: ['subnet-0123456789abcdef0'],
        privateAddresses: ['10.0.2.10'],
      },
      listener: {
        name: 'listener',
        namespace: 'demo',
        domain: 'app.example.test',
        privateAddresses: ['10.0.4.10'],
        originPool: { name: 'origin', namespace: 'demo' },
      },
      probe: {
        sourceInstanceId: 'i-11111111111111111',
        path: '/',
        expectedStatus: 200,
        expectedBodySha256: 'a'.repeat(64),
      },
    },
  };
  const sha = canonicalSha256(draft);
  const base = { ...draft, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const prefix = `arn:aws:elasticloadbalancing:${base.region}:${base.accountId}:`;
  const lb = `${prefix}loadbalancer/net/ce/0123456789abcdef`;
  const tg = `${prefix}targetgroup/ce/0123456789abcdef`;
  const listener = `${prefix}listener/net/ce/0123456789abcdef/0123456789abcdef`;
  const values = { __NLB_ARN__: lb, __NLB_TARGET_GROUP_ARN__: tg, __NLB_LISTENER_ARN__: listener };
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-execution-engine': engine,
    'xcsh-plan-sha256': sha,
  }).map(([Key, Value]) => ({ Key, Value }));
  const target = { Id: '10.0.4.10', Port: 443, AvailabilityZone: 'all' };
  let membership: unknown = [{ Target: target, TargetHealth: { State: 'healthy' } }];
  let foreign = false;
  let partial = false;
  let wrongListener = false;
  const calls: string[][] = [];
  const api: AwsExecApi = {
    exec: async (_cmd, args) => {
      calls.push(args);
      let data: unknown;
      if (args[0] === 'sts') data = { Account: base.accountId };
      else if (args[1] === 'describe-tags')
        data = {
          TagDescriptions: [lb, tg, listener].map((ResourceArn) => ({ ResourceArn, Tags: foreign ? [] : tags })),
        };
      else if (args[1] === 'describe-load-balancers')
        data = {
          LoadBalancers: [
            {
              LoadBalancerArn: lb,
              Type: 'network',
              Scheme: 'internal',
              VpcId: 'vpc-0123456789abcdef0',
              State: { Code: 'active' },
              AvailabilityZones: [
                { SubnetId: 'subnet-0123456789abcdef0', LoadBalancerAddresses: [{ PrivateIPv4Address: '10.0.2.10' }] },
              ],
            },
          ],
        };
      else if (args[1] === 'describe-target-groups')
        data = {
          TargetGroups: [
            {
              TargetGroupArn: tg,
              TargetType: 'ip',
              Protocol: 'TCP',
              Port: 443,
              VpcId: 'vpc-0123456789abcdef0',
              LoadBalancerArns: [lb],
            },
          ],
        };
      else if (args[1] === 'describe-listeners')
        data = {
          Listeners: [
            {
              ListenerArn: listener,
              LoadBalancerArn: lb,
              Port: 443,
              Protocol: 'TCP',
              DefaultActions: [
                {
                  Type: 'forward',
                  TargetGroupArn: wrongListener ? `${prefix}targetgroup/foreign/0123456789abcdef` : tg,
                },
              ],
            },
          ],
        };
      else data = { TargetHealthDescriptions: membership, ...(partial ? { NextToken: 'next' } : {}) };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(data) };
    },
  };
  return {
    base,
    values,
    api,
    calls,
    foreign: () => {
      foreign = true;
    },
    partial: () => {
      partial = true;
    },
    listener: () => {
      wrongListener = true;
    },
    membership: (v: unknown) => {
      membership = v;
    },
    target,
  };
}

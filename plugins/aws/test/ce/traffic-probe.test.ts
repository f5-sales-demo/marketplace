import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { collectAwsTrafficProbe, readAwsTrafficProbeEvidence } from '../../src/ce/traffic-probe';
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
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    },
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
                        ExecutionStartDateTime: new Date(Date.now() - 1000).toISOString(),
                        ExecutionEndDateTime: new Date().toISOString(),
                        Status: 'Success',
                        ResponseCode: 0,
                        StandardOutputContent: `200 10.9.0.10 ${'4'.repeat(64)}\n`,
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
            ExecutionStartDateTime: new Date(Date.now() - 1000).toISOString(),
            ExecutionEndDateTime: new Date().toISOString(),
            Status: failed ? 'Failed' : 'Success',
            ResponseCode: failed ? 1 : 0,
            StandardOutputContent: failed
              ? `000 10.9.0.10 ${'e3b0'.padEnd(64, '0')}\n`
              : `200 10.9.0.10 ${'4'.repeat(64)}\n`,
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

test('stale HTTP receipt is recollected and never passed as current traffic evidence', async () => {
  const f = fixture(),
    checkpoint = { resolvedValues: { __NLB_ARN__: f.arn } };
  await collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api);
  const saved = f.values.get('aws-traffic-probe.json') as { evidence: { observedAt: string } };
  saved.evidence.observedAt = new Date(Date.now() - 60000).toISOString();
  Object.assign(saved.evidence, {
    startedAt: new Date(Date.now() - 62000).toISOString(),
    executedAt: new Date(Date.now() - 61000).toISOString(),
  });
  f.values.set('aws-traffic-probe.json', saved);
  const result = await collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api);
  expect(Date.now() - Date.parse(String(result.observedAt))).toBeLessThan(30000);
  expect(f.calls.filter((args) => args[1] === 'send-command')).toHaveLength(2);
});
test('future HTTP receipt rejects rather than satisfying current traffic', async () => {
  const f = fixture(),
    checkpoint = { resolvedValues: { __NLB_ARN__: f.arn } };
  await collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api);
  const saved = f.values.get('aws-traffic-probe.json') as { evidence: { observedAt: string } };
  saved.evidence.observedAt = new Date(Date.now() + 60000).toISOString();
  f.values.set('aws-traffic-probe.json', saved);
  await expect(collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api)).rejects.toThrow(
    'Persisted traffic evidence',
  );
});

test('read-only traffic receipt inspection exposes only current exact content and source bindings', async () => {
  const f = fixture(),
    checkpoint = { resolvedValues: { __NLB_ARN__: f.arn } };
  await collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api);
  const before = f.calls.length;
  expect((await readAwsTrafficProbeEvidence(f.plan, f.storage, { __NLB_ARN__: f.arn })).status).toBe('healthy');
  expect(f.calls.length).toBe(before);
  const saved = f.values.get('aws-traffic-probe.json') as { evidence: { observedAt: string } };
  saved.evidence.observedAt = new Date(Date.now() - 60000).toISOString();
  Object.assign(saved.evidence, {
    startedAt: new Date(Date.now() - 62000).toISOString(),
    executedAt: new Date(Date.now() - 61000).toISOString(),
  });
  f.values.set('aws-traffic-probe.json', saved);
  expect((await readAwsTrafficProbeEvidence(f.plan, f.storage, { __NLB_ARN__: f.arn })).status).toBe('unknown');
  expect(f.calls.length).toBe(before);
});
for (const mode of ['wrong-plan', 'wrong-source', 'wrong-content', 'future', 'missing'] as const)
  test(`read-only traffic receipt ${mode} stays unknown`, async () => {
    const f = fixture(),
      checkpoint = { resolvedValues: { __NLB_ARN__: f.arn } };
    await collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api);
    const saved = f.values.get('aws-traffic-probe.json') as Record<string, unknown>,
      evidence = saved.evidence as Record<string, unknown>;
    if (mode === 'wrong-plan') saved.planSha256 = 'f'.repeat(64);
    if (mode === 'wrong-source') evidence.sourceInstanceId = 'i-11111111111111111';
    if (mode === 'wrong-content') evidence.bodySha256 = 'f'.repeat(64);
    if (mode === 'future') evidence.observedAt = new Date(Date.now() + 60000).toISOString();
    if (mode === 'missing') f.values.delete('aws-traffic-probe.json');
    else f.values.set('aws-traffic-probe.json', saved);
    expect((await readAwsTrafficProbeEvidence(f.plan, f.storage, { __NLB_ARN__: f.arn })).status).toBe('unknown');
  });

test('read-only traffic receipt rejects a different deployment store owner', async () => {
  const f = fixture(),
    checkpoint = { resolvedValues: { __NLB_ARN__: f.arn } };
  await collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api);
  const foreign = { ...f.storage, owner: { ...f.storage.owner, deploymentId: 'foreign' } } as typeof f.storage;
  expect((await readAwsTrafficProbeEvidence(f.plan, foreign)).status).toBe('unknown');
});

for (const mode of ['stale', 'future', 'missing', 'reversed'] as const)
  test(`SSM ${mode} execution timestamps cannot qualify fresh HTTP traffic`, async () => {
    const f = fixture(),
      original = f.api.exec;
    const api = {
      exec: async (command: string, args: string[]) => {
        const result = await original(command, args);
        if (args[1] !== 'get-command-invocation') return result;
        const data = JSON.parse(result.stdout);
        if (mode === 'stale') {
          data.ExecutionStartDateTime = new Date(Date.now() - 61000).toISOString();
          data.ExecutionEndDateTime = new Date(Date.now() - 60000).toISOString();
        }
        if (mode === 'future') data.ExecutionEndDateTime = new Date(Date.now() + 60000).toISOString();
        if (mode === 'missing') delete data.ExecutionEndDateTime;
        if (mode === 'reversed') data.ExecutionStartDateTime = new Date(Date.now() + 1000).toISOString();
        return { ...result, stdout: JSON.stringify(data) };
      },
    };
    await expect(
      collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, api),
    ).rejects.toThrow();
    expect((await readAwsTrafficProbeEvidence(f.plan, f.storage, { __NLB_ARN__: f.arn })).status).toBe('unknown');
  });
test('fresh collection time cannot refresh an old original HTTP sample', async () => {
  const f = fixture();
  await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api);
  const saved = f.values.get('aws-traffic-probe.json') as { evidence: Record<string, unknown> };
  saved.evidence.executedAt = new Date(Date.now() - 60000).toISOString();
  saved.evidence.observedAt = new Date().toISOString();
  f.values.set('aws-traffic-probe.json', saved);
  expect((await readAwsTrafficProbeEvidence(f.plan, f.storage, { __NLB_ARN__: f.arn })).status).toBe('unknown');
});

test('traffic collector rejects a foreign deployment store before cloud calls', async () => {
  const f = fixture(),
    foreign = { ...f.storage, owner: { ...f.storage.owner, deploymentId: 'foreign' } } as typeof f.storage;
  await expect(
    collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, foreign, f.api),
  ).rejects.toThrow('store owner');
  expect(f.calls).toHaveLength(0);
});

test('changed NLB endpoint invalidates cached HTTP evidence', async () => {
  const f = fixture(),
    checkpoint = { resolvedValues: { __NLB_ARN__: f.arn } };
  await collectAwsTrafficProbe(f.plan, checkpoint, f.storage, f.api);
  const original = f.api.exec;
  const api = {
    exec: async (command: string, args: string[]) => {
      const result = await original(command, args);
      if (args[1] !== 'describe-load-balancers') return result;
      const data = JSON.parse(result.stdout);
      data.LoadBalancers[0].DNSName = 'changed-ce.example.aws';
      return { ...result, stdout: JSON.stringify(data) };
    },
  };
  await expect(collectAwsTrafficProbe(f.plan, checkpoint, f.storage, api)).rejects.toThrow('endpoint');
  expect(f.calls.filter((args) => args[1] === 'send-command')).toHaveLength(1);
});

test('read-only receipt rejects a foreign retained NLB endpoint', async () => {
  const f = fixture();
  await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api);
  const saved = f.values.get('aws-traffic-probe.json') as { evidence: Record<string, unknown> };
  saved.evidence.loadBalancerArn = f.arn.replace('abcdef12', 'ffffffff');
  f.values.set('aws-traffic-probe.json', saved);
  expect((await readAwsTrafficProbeEvidence(f.plan, f.storage, { __NLB_ARN__: f.arn })).status).toBe('unknown');
});

test('read-only receipt requires resolved trusted NLB binding', async () => {
  const f = fixture();
  await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api);
  expect((await readAwsTrafficProbeEvidence(f.plan, f.storage)).status).toBe('unknown');
});

test('traffic probe rejects a response peer outside retained NLB private addresses', async () => {
  const f = fixture(),
    original = f.api.exec;
  const api = {
    exec: async (command: string, args: string[]) => {
      const result = await original(command, args);
      if (args[1] !== 'get-command-invocation') return result;
      const data = JSON.parse(result.stdout);
      data.StandardOutputContent = `200 10.99.0.10 ${'4'.repeat(64)}\n`;
      return { ...result, stdout: JSON.stringify(data) };
    },
  };
  await expect(
    collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, api),
  ).rejects.toThrow();
});
test('traffic receipt records the remote peer and disables proxy routing', async () => {
  const f = fixture();
  const result = await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api);
  expect(result.remoteAddress).toBe('10.9.0.10');
  const send = f.calls.find((args) => args[1] === 'send-command');
  expect(send).toBeDefined();
  if (!send) throw Error('missing probe submission');
  expect(send[send.indexOf('--parameters') + 1]).toContain("--noproxy '*'");
});

test('generated probe shell emits status peer digest and checks HTTP success', async () => {
  const f = fixture();
  await collectAwsTrafficProbe(f.plan, { resolvedValues: { __NLB_ARN__: f.arn } }, f.storage, f.api);
  const send = f.calls.find((args) => args[1] === 'send-command');
  if (!send) throw Error('missing probe submission');
  const command = JSON.parse(send[send.indexOf('--parameters') + 1]).commands[0] as string;
  const directory = await mkdtemp(join(tmpdir(), 'ce-probe-shell-'));
  try {
    await writeFile(
      join(directory, 'curl'),
      '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "--output" ]; then shift; output="$1"; fi; shift; done\nprintf fixture-body > "$output"\nprintf "200 10.9.0.10"\n',
      { mode: 0o700 },
    );
    const digest = createHash('sha256').update('fixture-body').digest('hex');
    const actual = spawnSync('sh', ['-c', command.replaceAll('4'.repeat(64), digest)], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
    });
    expect(actual.status).toBe(0);
    expect(actual.stdout).toBe(`200 10.9.0.10 ${digest}\n`);
    expect(actual.stderr).toBe('');
  } finally {
    await rm(directory, { recursive: true });
  }
});

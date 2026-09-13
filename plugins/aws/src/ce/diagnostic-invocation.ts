import { setTimeout as delay } from 'node:timers/promises';
import type { AwsExecApi } from '../aws/exec';
import { siteForNode } from './topology';
import type { AwsCePlan } from './types';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Revalidate cloud ownership immediately before a guest execution boundary. */
export async function verifyDiagnosticInstance(api: AwsExecApi, plan: AwsCePlan, instanceId: string, node: number) {
  if (!/^i-[0-9a-f]{8,17}$/.test(instanceId)) throw new Error('Invalid diagnostic instance identity');
  const result = await api.exec('aws', [
    'ec2',
    'describe-instances',
    '--instance-ids',
    instanceId,
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Diagnostic instance ownership is unavailable');
  const data = object(JSON.parse(result.stdout));
  if (data.NextToken || !Array.isArray(data.Reservations) || data.Reservations.length !== 1)
    throw new Error('Diagnostic instance response is incomplete');
  const reservation = object(data.Reservations[0]);
  const instances = reservation.Instances;
  if (reservation.OwnerId !== plan.accountId || !Array.isArray(instances) || instances.length !== 1)
    throw new Error('Diagnostic instance account is unverified');
  const instance = object(instances[0]);
  const tags = Array.isArray(instance.Tags) ? instance.Tags.map(object) : [];
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': plan.engine,
    'ves-io-site-name': siteForNode(plan.intent, node).name,
  };
  if (
    instance.InstanceId !== instanceId ||
    object(instance.State).Name !== 'running' ||
    Object.entries(expected).some(
      ([key, value]) =>
        tags.filter((tag) => tag.Key === key).length !== 1 || tags.find((tag) => tag.Key === key)?.Value !== value,
    )
  )
    throw new Error('Diagnostic instance ownership or state differs from plan');
}

/** Submission is not execution proof. Never return raw guest output or URLs. */
export async function observeDiagnosticInvocation(
  api: AwsExecApi,
  commandId: string,
  instanceId: string,
  region: string,
  protocol: 'tcp' | 'udp',
  signal?: AbortSignal,
  pause = (ms: number) => delay(ms, undefined, { signal }),
) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(commandId))
    throw new Error('SSM submission returned no usable command identity; do not resubmit automatically');
  const base = { commandId, instanceId, region, protocol, source: 'ssm:get-command-invocation' };
  for (let attempt = 0; attempt < 30; attempt++) {
    signal?.throwIfAborted();
    const result = await api.exec('aws', [
      'ssm',
      'get-command-invocation',
      '--command-id',
      commandId,
      '--instance-id',
      instanceId,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) {
      if (!result.stderr.includes('InvocationDoesNotExist'))
        return { ...base, status: 'unknown', reason: 'invocation-unavailable' };
    } else {
      const invocation = object(JSON.parse(result.stdout));
      if (
        invocation.CommandId !== commandId ||
        invocation.InstanceId !== instanceId ||
        invocation.DocumentName !== 'AWS-RunShellScript'
      )
        return { ...base, status: 'unknown', reason: 'invocation-identity-mismatch' };
      if (invocation.Status === 'Success')
        return {
          ...base,
          status: invocation.ResponseCode === 0 && protocol === 'tcp' ? 'healthy' : 'unknown',
          scope: protocol === 'tcp' ? 'tcp-connect-only' : 'udp-response-unverified',
          observedAt: new Date().toISOString(),
        };
      if (['Failed', 'Cancelled', 'TimedOut'].includes(String(invocation.Status)))
        return { ...base, status: 'degraded', state: invocation.Status, observedAt: new Date().toISOString() };
      if (!['Pending', 'InProgress', 'Delayed', 'Cancelling'].includes(String(invocation.Status)))
        return { ...base, status: 'unknown', reason: 'invocation-state-unrecognized' };
    }
    if (attempt < 29) await pause(2000);
  }
  return { ...base, status: 'unknown', reason: 'invocation-not-converged' };
}

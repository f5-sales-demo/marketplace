import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from './types';

type Json = Record<string, unknown>;
const drivers: Record<string, { describe: string; list: string; result: string; id: string }> = {
  'create-vpc': { describe: 'describe-vpcs', list: 'Vpcs', result: 'Vpc', id: 'VpcId' },
  'create-subnet': { describe: 'describe-subnets', list: 'Subnets', result: 'Subnet', id: 'SubnetId' },
  'create-internet-gateway': {
    describe: 'describe-internet-gateways',
    list: 'InternetGateways',
    result: 'InternetGateway',
    id: 'InternetGatewayId',
  },
  'create-route-table': {
    describe: 'describe-route-tables',
    list: 'RouteTables',
    result: 'RouteTable',
    id: 'RouteTableId',
  },
  'create-security-group': { describe: 'describe-security-groups', list: 'SecurityGroups', result: '', id: 'GroupId' },
  'create-network-interface': {
    describe: 'describe-network-interfaces',
    list: 'NetworkInterfaces',
    result: 'NetworkInterface',
    id: 'NetworkInterfaceId',
  },
  'allocate-address': { describe: 'describe-addresses', list: 'Addresses', result: '', id: 'AllocationId' },
  'run-instances': { describe: 'describe-instances', list: 'Reservations', result: 'Instances', id: 'InstanceId' },
};
export function prepareRecoverableAction(action: AwsCeAction): void {
  if (action.command !== 'aws' || action.args?.[0] !== 'ec2' || !drivers[action.args[1]]) return;
  const start = action.args.indexOf('--tag-specifications');
  if (start < 0) throw new Error('Recoverable creation requires atomic ownership tags');
  for (let index = start + 1; index < action.args.length && !action.args[index].startsWith('--'); index++) {
    if (!action.args[index].endsWith(']')) throw new Error('Malformed atomic AWS ownership tags');
    action.args[index] = `${action.args[index].slice(0, -1)},{Key=xcsh-action-id,Value=${action.id}}]`;
  }
}
export function hasCreateRecovery(action: AwsCeAction): boolean {
  return action.args?.[0] === 'ec2' && !!drivers[action.args[1]];
}

/** An ambiguous non-idempotent create is observed again; it is never blindly repeated. */
export async function executeRecoverableCreate(
  api: AwsExecApi,
  plan: AwsCePlan,
  action: AwsCeAction,
  args: string[],
  checkpoint: AwsCeCheckpoint,
  persist: () => Promise<unknown>,
  signal?: AbortSignal,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const driver = drivers[args[1]];
  if (!driver) throw new Error('AWS create recovery driver is unavailable');
  // Bootstrap files are private transient paths. Bind to the immutable plan, action and resolved resource arguments.
  const requestSha256 = canonicalSha256({
    plan: plan.planSha256,
    action: action.id,
    args: args.map((arg, index) => (args[index - 1] === '--user-data' ? 'issued-site-bound-bootstrap' : arg)),
  });
  const pending = checkpoint.pendingCreate;
  if (pending && (pending.actionId !== action.id || pending.requestSha256 !== requestSha256))
    throw new Error('Pending AWS creation differs from the immutable request');
  if (!pending) {
    checkpoint.pendingCreate = { actionId: action.id, requestSha256 };
    try {
      await persist(); // No cloud mutation if durable checkpointing fails.
    } catch (error) {
      checkpoint.pendingCreate = undefined;
      throw error;
    }
    try {
      const result = await api.exec('aws', args, { signal });
      if (result.exitCode === 0) {
        // Do not clear pending until captures and the completed action are durable.
        return result;
      }
    } catch {
      signal?.throwIfAborted();
    }
  }
  signal?.throwIfAborted();
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'xcsh-action-id': action.id,
  };
  const result = await api.exec(
    'aws',
    [
      'ec2',
      driver.describe,
      '--filters',
      ...Object.entries(expected).map(([key, value]) => `Name=tag:${key},Values=${value}`),
      '--region',
      plan.region,
      '--output',
      'json',
    ],
    { signal },
  );
  if (result.exitCode !== 0) throw new Error('AWS ambiguous creation observation is unavailable');
  let raw: Json;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('AWS creation observation is malformed');
  }
  if (!raw || raw.NextToken || !Array.isArray(raw[driver.list]))
    throw new Error('AWS creation observation is incomplete');
  let candidates = raw[driver.list] as Json[];
  if (args[1] === 'run-instances') {
    if (candidates.some((item) => !item || !Array.isArray(item.Instances)))
      throw new Error('AWS creation observation is malformed');
    candidates = candidates.flatMap((item) => item.Instances as Json[]);
  }
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'AWS creation identity is ambiguous'
        : 'AWS creation outcome remains unknown; resume observation before retrying',
    );
  const resource = candidates[0];
  if (!resource || typeof resource[driver.id] !== 'string' || !Array.isArray(resource.Tags))
    throw new Error('AWS creation identity is malformed');
  const tags = new Map<string, string>();
  for (const item of resource.Tags as Json[]) {
    if (!item || typeof item.Key !== 'string' || typeof item.Value !== 'string' || tags.has(item.Key))
      throw new Error('AWS creation ownership tags are malformed');
    tags.set(item.Key, item.Value);
  }
  if (Object.entries(expected).some(([key, value]) => tags.get(key) !== value))
    throw new Error('AWS creation belongs to another owner');
  const response =
    driver.result === 'Instances'
      ? { Instances: [resource] }
      : driver.result
        ? { [driver.result]: resource }
        : resource;
  return { exitCode: 0, stderr: '', stdout: JSON.stringify(response) };
}

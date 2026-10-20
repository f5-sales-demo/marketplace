import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../../src/aws/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import type { AwsCePlan } from '../../src/ce/types';
import { collectAwsPowerIdentities } from '../../src/ce/whole-site-power-identities';
import { foundationPlan } from './terraform-fixtures';

export function powerIdentityFixture(engine: 'native' | 'terraform' = 'native') {
  const { planId: _id, planSha256: _sha, ...body } = foundationPlan();
  body.engine = engine;
  body.intent = { ...body.intent, engine, topology: { nodeCount: 1, sites: [{ name: 'site', nodeIndexes: [1] }] } };
  Object.assign(body, {
    interfaces: body.intent.interfaces,
    topology: body.intent.topology,
    accountId: body.intent.accountId,
    region: body.intent.region,
    deploymentName: body.intent.deploymentName,
  });
  const planSha256 = canonicalSha256(body);
  const base = { ...body, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as AwsCePlan;
  const instanceId = 'i-0123456789abcdef0';
  const resolved: Record<string, string> = { __INSTANCE_1__: instanceId };
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': engine,
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-plan-sha256': planSha256,
    'xcsh-node-index': '1',
    'ves-io-site-name': 'site',
  }).map(([Key, Value]) => ({ Key, Value }));
  const enis = [0, 1].map((index) => {
    const id = `eni-0123456789abcdef${index}`;
    const mac = `02:00:00:00:00:0${index}`;
    resolved[`__ENI_1_${index}__`] = id;
    resolved[`__ENI_1_${index}_MAC__`] = mac;
    return {
      NetworkInterfaceId: id,
      OwnerId: base.accountId,
      MacAddress: mac,
      Status: 'in-use',
      Attachment: { InstanceId: instanceId, DeviceIndex: index },
      TagSet: [...tags, { Key: 'xcsh-interface-index', Value: String(index) }],
    };
  });
  const instance = {
    InstanceId: instanceId,
    State: { Name: 'running' },
    Tags: tags,
    NetworkInterfaces: enis.map((eni) => ({
      NetworkInterfaceId: eni.NetworkInterfaceId,
      MacAddress: eni.MacAddress,
      Attachment: eni.Attachment,
    })),
  };
  let identity = { Account: base.accountId };
  let rawInstances: unknown = { Reservations: [{ OwnerId: base.accountId, Instances: [instance] }] };
  let rawEnis: unknown = { NetworkInterfaces: enis };
  let hardware = {
    status: 'observed',
    interfaces: enis.map((eni, index) => ({
      node: 'ce-1',
      role: index ? 'sli' : 'slo',
      mac: eni.MacAddress,
      device: index ? 'ens6' : 'ens5',
    })),
  };
  const calls: string[][] = [];
  const api: AwsExecApi = {
    exec: async (_command, args) => {
      calls.push(args);
      const value = args[0] === 'sts' ? identity : args[1] === 'describe-instances' ? rawInstances : rawEnis;
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const runtime = { observeRegisteredDevices: async () => hardware } as unknown as Pick<
    CeRuntime,
    'observeRegisteredDevices'
  >;
  return {
    base,
    resolved,
    enis,
    instance,
    calls,
    api,
    runtime,
    identity: () => {
      identity = { Account: String(0).repeat(12) };
    },
    instances: (value: unknown) => {
      rawInstances = value;
    },
    interfaces: (value: unknown) => {
      rawEnis = value;
    },
    hardware: (value: typeof hardware) => {
      hardware = value;
    },
    read: () => collectAwsPowerIdentities(base, resolved, api, runtime),
  };
}

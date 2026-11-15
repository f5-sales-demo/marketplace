import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { scopedAwsApi } from './scoped-exec';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';
import type { AwsPowerBindings } from './whole-site-power';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed power identity evidence');
  return value as Json;
};
const array = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw new Error('Missing power identity collection');
  return value.map(object);
};
function tags(value: unknown, expected: Record<string, string>): void {
  const rows = array(value);
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row.Key !== 'string' || typeof row.Value !== 'string' || seen.has(row.Key))
      throw new Error('Duplicate or malformed power ownership tags');
    seen.add(row.Key);
  }
  if (Object.entries(expected).some(([key, value]) => !rows.some((r) => r.Key === key && r.Value === value)))
    throw new Error('Whole-site power cloud ownership differs');
}

/** Exact cloud resources and registration hardware identity only; never link-health or CE-freshness evidence. */
export async function collectAwsPowerIdentities(
  base: AwsCePlan,
  resolved: Record<string, string>,
  rawApi: AwsExecApi,
  runtime: Pick<CeRuntime, 'observeRegisteredDevices'>,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(base);
  if (base.intent.operation !== 'deploy') throw new Error('Power identities require the original deployment plan');
  const selections = siteBindings(base);
  const expected = selections.flatMap(({ site, binding }) =>
    site.nodeIndexes.map((nodeIndex, offset) => ({ nodeIndex, nodeName: binding.nodes[offset], siteName: site.name })),
  );
  const instanceIds = expected.map((node) => resolved[`__INSTANCE_${node.nodeIndex}__`]);
  const interfaceIds = expected.flatMap((node) =>
    base.interfaces.map((item) => resolved[`__ENI_${node.nodeIndex}_${item.index}__`]),
  );
  const macs = expected.flatMap((node) =>
    base.interfaces.map((item) => resolved[`__ENI_${node.nodeIndex}_${item.index}_MAC__`]?.toLowerCase()),
  );
  if (
    instanceIds.some((id) => !/^i-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    interfaceIds.some((id) => !/^eni-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    macs.some((mac) => !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(mac ?? '')) ||
    new Set(instanceIds).size !== expected.length ||
    new Set(interfaceIds).size !== interfaceIds.length ||
    new Set(macs).size !== macs.length
  )
    throw new Error('Power execution identifiers are unresolved or duplicated');
  const api = scopedAwsApi(rawApi, base.intent.awsProfile ?? 'default', signal);
  const read = async (args: string[]) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode !== 0) throw new Error('Power identity observation unavailable');
    const value = object(JSON.parse(result.stdout));
    if (['NextToken', 'NextMarker', 'nextToken'].some((key) => value[key] !== undefined))
      throw new Error('Partial power identity response');
    return value;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw new Error('Power authenticated account differs');
  const reservations = array(
    (await read(['ec2', 'describe-instances', '--instance-ids', ...instanceIds])).Reservations,
  );
  if (reservations.some((row) => row.OwnerId !== base.accountId)) throw new Error('Power reservation owner differs');
  const instances = reservations.flatMap((row) => array(row.Instances));
  const enis = array(
    (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', ...interfaceIds])).NetworkInterfaces,
  );
  if (instances.length !== expected.length || enis.length !== interfaceIds.length)
    throw new Error('Power cloud resource discovery is incomplete');
  const nodes: AwsPowerBindings['nodes'] = [];
  const states: string[] = [];
  for (const node of expected) {
    const instanceId = resolved[`__INSTANCE_${node.nodeIndex}__`];
    const matches = instances.filter((row) => row.InstanceId === instanceId);
    if (matches.length !== 1) throw new Error('Duplicate or missing power instance');
    const instance = matches[0];
    const ownerTags = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': base.engine,
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-plan-sha256': base.planSha256,
      'xcsh-node-index': String(node.nodeIndex),
      'ves-io-site-name': node.siteName,
    };
    tags(instance.Tags, ownerTags);
    const state = object(instance.State).Name;
    if (!['running', 'stopped', 'pending', 'stopping'].includes(String(state)))
      throw new Error('Power instance lifecycle state is unavailable');
    states.push(String(state));
    const attached = array(instance.NetworkInterfaces);
    if (attached.length !== base.interfaces.length) throw new Error('Power instance interface count differs');
    const interfaces = base.interfaces.map((item) => {
      const id = resolved[`__ENI_${node.nodeIndex}_${item.index}__`];
      const mac = resolved[`__ENI_${node.nodeIndex}_${item.index}_MAC__`].toLowerCase();
      const rows = enis.filter((row) => row.NetworkInterfaceId === id);
      const attachments = attached.filter((row) => row.NetworkInterfaceId === id);
      if (rows.length !== 1 || attachments.length !== 1) throw new Error('Power ENI identity is duplicated or missing');
      const eni = rows[0],
        attachment = object(eni.Attachment),
        embedded = attachments[0];
      tags(eni.TagSet, { ...ownerTags, 'xcsh-interface-index': String(item.index) });
      if (
        eni.OwnerId !== base.accountId ||
        eni.Status !== 'in-use' ||
        attachment.InstanceId !== instanceId ||
        attachment.DeviceIndex !== item.index ||
        object(embedded.Attachment).DeviceIndex !== item.index ||
        String(eni.MacAddress).toLowerCase() !== mac ||
        String(embedded.MacAddress).toLowerCase() !== mac
      )
        throw new Error('Power ENI ownership, attachment or MAC differs');
      if (!['slo', 'sli', 'data'].includes(item.role))
        throw new Error('Power interface role has no registration mapping');
      return { index: item.index, role: item.role, id, mac, device: '' };
    });
    nodes.push({ ...node, instanceId, interfaces });
  }
  for (const { binding } of selections) {
    const selected = nodes.filter((node) => node.siteName === binding.siteName);
    const expectedInterfaces: ExpectedCeInterface[] = selected.flatMap((node) =>
      node.interfaces.map((item) => ({
        node: node.nodeName,
        role: item.role as ExpectedCeInterface['role'],
        mac: item.mac,
      })),
    );
    const evidence = await runtime.observeRegisteredDevices(
      binding,
      Object.fromEntries(selected.map((node) => [node.nodeName, node.instanceId])),
      expectedInterfaces,
      signal,
    );
    if (evidence.status !== 'observed' || evidence.interfaces.length !== expectedInterfaces.length)
      throw new Error('Power registration hardware identity unavailable');
    const devices = new Set<string>();
    for (const node of selected)
      for (const item of node.interfaces) {
        const matches = evidence.interfaces.filter(
          (row) => row.node === node.nodeName && row.role === item.role && row.mac.toLowerCase() === item.mac,
        );
        const device = matches[0]?.device;
        const desired = base.interfaces.find((row) => row.index === item.index)?.guestDevice;
        if (
          matches.length !== 1 ||
          !device ||
          !/^[a-zA-Z0-9_.:-]+$/.test(device) ||
          devices.has(`${node.nodeName}/${device}`) ||
          (desired !== undefined && device !== desired)
        )
          throw new Error('Power registration device identity differs');
        devices.add(`${node.nodeName}/${device}`);
        item.device = device;
      }
  }
  return {
    sourcePlanSha256: base.planSha256,
    owner: {
      deploymentId: base.deploymentName,
      engine: base.engine,
      provider: 'aws' as const,
      account: base.accountId,
      region: base.region,
    },
    nodes,
    cloud: states.every((s) => s === 'running')
      ? ('running' as const)
      : states.every((s) => s === 'stopped')
        ? ('stopped' as const)
        : ('unknown' as const),
    source: 'aws-cli-and-registration-hardware' as const,
    observedAt: new Date().toISOString(),
    originalCeHeartbeat: 'unknown' as const,
    canSatisfyInterfaceMutationGate: false as const,
  };
}

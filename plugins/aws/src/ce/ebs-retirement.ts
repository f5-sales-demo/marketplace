import type { AwsCeIntent, AwsCeObservation, AwsCeResourceObservation } from './types';

const INSTANCE = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const DEVICE = /^\/dev\/[a-zA-Z0-9._-]{1,32}$/;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed AWS EBS volume evidence');
  return value as Record<string, unknown>;
}

/** Exact EC2 volume state, independent from tag ownership. Empty exact results mean absence. */
export function awsEbsVolume(state: Record<string, unknown>, id: string) {
  if (['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(state, key)))
    throw Error('Incomplete AWS EBS volume collection');
  if (!Array.isArray(state.Volumes) || state.Volumes.length > 1) throw Error('Ambiguous AWS EBS volume collection');
  if (!state.Volumes.length) return undefined;
  const row = object(state.Volumes[0]);
  if (
    row.VolumeId !== id ||
    typeof row.State !== 'string' ||
    !['creating', 'available', 'in-use', 'deleting', 'deleted', 'error'].includes(row.State) ||
    !Array.isArray(row.Attachments) ||
    row.Attachments.length > 1
  )
    throw Error('Malformed or foreign AWS EBS volume identity/state');
  const attachments = row.Attachments.map((value) => {
    const attachment = object(value);
    if (
      attachment.VolumeId !== id ||
      typeof attachment.InstanceId !== 'string' ||
      !INSTANCE.test(attachment.InstanceId) ||
      typeof attachment.Device !== 'string' ||
      !DEVICE.test(attachment.Device) ||
      !['attaching', 'attached', 'detaching', 'detached', 'busy'].includes(String(attachment.State))
    )
      throw Error('Malformed AWS EBS volume attachment');
    return { instanceId: attachment.InstanceId, device: attachment.Device, state: String(attachment.State) };
  });
  if (
    (row.State === 'in-use' && attachments.length !== 1) ||
    (['available', 'deleted'].includes(row.State) && attachments.length !== 0)
  )
    throw Error('Inconsistent AWS EBS volume state/attachments');
  return { state: row.State, attachments };
}

export function assertAwsEbsVolumeAvailable(resource: AwsCeResourceObservation) {
  const volume = awsEbsVolume(resource.state, resource.id);
  if (volume?.state !== 'available' || volume.attachments.length)
    throw Error('AWS EBS volume must be available and unattached before deletion; resume with the same plan');
}

/** An attached disk may retire only with the exact owned instance and matching block-device mapping. */
export function assertAwsEbsTeardown(
  intent: Pick<AwsCeIntent, 'accountId'>,
  observation: Pick<AwsCeObservation, 'resources'>,
) {
  const ownedInstances = observation.resources.filter((r) => r.owned && r.exists && r.id.startsWith('i-'));
  const instances = ownedInstances.flatMap((resource) => {
    const reservations = resource.state.Reservations;
    if (!Array.isArray(reservations)) return [];
    return reservations.flatMap((value) => {
      const reservation = object(value);
      if (!Array.isArray(reservation.Instances)) throw Error('Malformed AWS EBS instance evidence');
      return reservation.Instances.map((value) => ({ resource, reservation, row: object(value) }));
    });
  });
  for (const resource of observation.resources.filter((r) => r.owned && r.id.startsWith('vol-'))) {
    if (!resource.exists) throw Error('AWS EBS volume ownership contradicts absence');
    const volume = awsEbsVolume(resource.state, resource.id);
    if (!volume || !['available', 'in-use'].includes(volume.state))
      throw Error('AWS EBS volume is not ready for retirement');
    if (volume.state === 'available') continue;
    const attachment = volume.attachments[0];
    const matches = instances.filter(
      (i) => i.resource.id === attachment.instanceId && i.row.InstanceId === attachment.instanceId,
    );
    if (matches.length !== 1 || matches[0].reservation.OwnerId !== intent.accountId || attachment.state !== 'attached')
      throw Error('AWS EBS volume attachment is outside the exact owned instance');
    const instance = matches[0];
    if (
      resource.region !== instance.resource.region ||
      ['xcsh-managed-by', 'xcsh-execution-engine', 'xcsh-deployment-id', 'xcsh-plan-sha256'].some(
        (key) => resource.tags[key] !== instance.resource.tags[key],
      ) ||
      resource.tags['xcsh-node-index'] !== instance.resource.tags['xcsh-node-index'] ||
      !/^[1-3]$/.test(resource.tags['xcsh-node-index'] ?? '')
    )
      throw Error('AWS EBS volume/node ownership joins differ');
    const mappings = instance.row.BlockDeviceMappings;
    if (!Array.isArray(mappings)) throw Error('Missing AWS EBS instance block-device mappings');
    const joined = mappings.map(object).filter((m) => object(m.Ebs).VolumeId === resource.id);
    if (
      joined.length !== 1 ||
      joined[0].DeviceName !== attachment.device ||
      object(joined[0].Ebs).Status !== 'attached' ||
      typeof object(joined[0].Ebs).DeleteOnTermination !== 'boolean'
    )
      throw Error('AWS EBS volume/device/DeleteOnTermination mapping differs');
  }
  // Instance termination can itself delete volumes. It must never bypass disk ownership checks.
  for (const { resource, row } of instances) {
    if (!Array.isArray(row.BlockDeviceMappings)) continue;
    for (const mapping of row.BlockDeviceMappings.map(object)) {
      const ebs = object(mapping.Ebs);
      if (!observation.resources.some((d) => d.id === ebs.VolumeId && d.exists && d.owned && d.id.startsWith('vol-')))
        throw Error(`AWS EBS volume evidence is missing or foreign for owned instance ${resource.id}`);
    }
  }
}

/** Volume IDs to reobserve before terminating an instance, including disks whose tags were lost. */
export function awsEbsInstanceVolumeIds(resource: AwsCeResourceObservation): string[] {
  const reservations = resource.state.Reservations;
  if (!Array.isArray(reservations)) throw Error('Missing AWS EBS instance collection');
  const rows = reservations.flatMap((value) => {
    const reservation = object(value);
    if (!Array.isArray(reservation.Instances)) throw Error('Malformed AWS EBS instance collection');
    return reservation.Instances.map(object);
  });
  if (rows.length !== 1 || rows[0].InstanceId !== resource.id) throw Error('Ambiguous AWS EBS instance identity');
  if (rows[0].BlockDeviceMappings === undefined) return [];
  if (!Array.isArray(rows[0].BlockDeviceMappings)) throw Error('Malformed AWS EBS block-device mappings');
  const ids = rows[0].BlockDeviceMappings.map((value) => object(object(value).Ebs).VolumeId);
  if (
    ids.some((id) => typeof id !== 'string' || !/^vol-[0-9a-f]{8}(?:[0-9a-f]{9})?$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw Error('Malformed or duplicate AWS EBS volume mapping IDs');
  return ids.map(String);
}

import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AwsExecApi } from '../aws/exec';
import type { AwsCeSessionManager } from './artifacts';
import { canonicalSha256 } from './canonical';
import { observeAwsResources } from './discovery';
import { type AwsNativeInitialCreationProjection, projectAwsNativeInitialCreation } from './native-creation-projection';
import { scopedAwsApi } from './scoped-exec';
import { siteBindings } from './topology';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Original native cloud response is malformed');
  return value as Json;
}

/** Read only the original deployment's immutable creation fields and current owned hardware.
 * This is not permission to retire any supporting resource outside the reviewed cloud plan.
 */
export async function readAwsNativeInitialCreation(
  plan: AwsCePlan,
  manager: AwsCeSessionManager,
  rawApi: AwsExecApi,
  signal?: AbortSignal,
): Promise<AwsNativeInitialCreationProjection> {
  const directory = manager.getArtifactsDir();
  if (!directory) throw Error('Original native checkpoint directory is unavailable');
  const snapshot = async () => {
    signal?.throwIfAborted();
    const checkpoints: AwsCeCheckpoint[] = [];
    for (const name of (await readdir(directory)).filter((n) => n.endsWith('.aws-ce-checkpoint.log'))) {
      const path = join(directory, name),
        info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1)
        throw Error('Original native checkpoint file ownership differs');
      let envelope: Json;
      try {
        envelope = object(JSON.parse(await readFile(path, 'utf8')));
      } catch {
        throw Error('Original native checkpoint collection is malformed');
      }
      if (envelope.kind !== 'aws-ce-checkpoint') throw Error('Original native checkpoint envelope differs');
      const c = object(envelope.checkpoint);
      if (c.planId === plan.planId && c.planSha256 === plan.planSha256)
        checkpoints.push(c as unknown as AwsCeCheckpoint);
    }
    return projectAwsNativeInitialCreation(plan, checkpoints);
  };
  const before = await snapshot(),
    api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const result = await api.exec('aws', ['sts', 'get-caller-identity', '--region', plan.region, '--output', 'json'], {
    signal,
  });
  if (result.exitCode !== 0) throw Error('Original native cloud identity is unavailable');
  const identity = object(JSON.parse(result.stdout));
  if (
    identity.Account !== plan.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.partition}:`) ||
    identity.Arn.split(':')[4] !== plan.accountId
  )
    throw Error('Original native cloud account or partition differs');
  const ids = [before.instanceId, ...before.interfaces.map((i) => i.id)];
  const observed = await observeAwsResources(api, ids, plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [plan.planSha256],
  });
  if (observed.length !== ids.length || new Set(observed.map((r) => r.id)).size !== ids.length)
    throw Error('Original native hardware inventory is partial or duplicated');
  const binding = siteBindings(plan)[0].binding;
  for (const resource of observed) {
    if (
      !ids.includes(resource.id) ||
      !resource.exists ||
      !resource.owned ||
      resource.region !== plan.region ||
      resource.tags['xcsh-execution-engine'] !== 'native' ||
      resource.tags['xcsh-plan-sha256'] !== plan.planSha256 ||
      resource.tags['ves-io-site-name'] !== binding.siteName ||
      resource.tags['xcsh-node-index'] !== '1'
    )
      throw Error('Original native hardware ownership differs');
  }
  const vm = observed.find((r) => r.id === before.instanceId);
  const reservations = vm?.state.Reservations;
  if (!Array.isArray(reservations) || reservations.length !== 1)
    throw Error('Original native instance reservation is incomplete');
  const reservation = object(reservations[0]);
  if (
    reservation.OwnerId !== plan.accountId ||
    !Array.isArray(reservation.Instances) ||
    reservation.Instances.length !== 1
  )
    throw Error('Original native instance reservation owner differs');
  const instance = object(reservation.Instances[0]);
  if (
    instance.InstanceId !== before.instanceId ||
    instance.ImageId !== before.imageId ||
    !['pending', 'running', 'stopping', 'stopped'].includes(String(object(instance.State).Name))
  )
    throw Error('Original native instance/image identity differs or has retired');
  const attached = instance.NetworkInterfaces;
  if (
    !Array.isArray(attached) ||
    attached.length !== before.interfaces.length ||
    new Set(attached.map((r) => object(r).NetworkInterfaceId)).size !== attached.length
  )
    throw Error('Original native instance interface coverage is incomplete');
  for (const iface of before.interfaces) {
    const resource = observed.find((r) => r.id === iface.id),
      list = resource?.state.NetworkInterfaces;
    if (
      !resource ||
      resource.tags['xcsh-interface-index'] !== String(iface.index) ||
      !Array.isArray(list) ||
      list.length !== 1
    )
      throw Error('Original native interface snapshot is incomplete');
    const live = object(list[0]),
      attachment = object(live.Attachment);
    if (
      live.NetworkInterfaceId !== iface.id ||
      live.MacAddress !== iface.mac ||
      live.OwnerId !== plan.accountId ||
      attachment.InstanceId !== before.instanceId ||
      attachment.DeviceIndex !== iface.index ||
      attachment.Status !== 'attached' ||
      !attached.some(
        (r) => object(r).NetworkInterfaceId === iface.id && object(object(r).Attachment).DeviceIndex === iface.index,
      )
    )
      throw Error('Original native node/interface/MAC/device-index join differs');
  }
  const after = await snapshot();
  if (canonicalSha256(before) !== canonicalSha256(after))
    throw Error('Original native creation identity changed during current hardware collection');
  signal?.throwIfAborted();
  return before;
}

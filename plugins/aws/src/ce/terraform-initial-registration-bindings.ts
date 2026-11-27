import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { scopedAwsApi } from './scoped-exec';
import { awsTerraformMetadataProjection } from './terraform-metadata-retirement';
import { siteTopology } from './topology';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed original instance retirement evidence');
  return value as Json;
};

/** Read the exact original instance without claiming authority over unrelated network resources.
 * The existing full cloud destroy ownership guard still runs at the mutation boundary.
 */
export async function readAwsInitialRegistrationRetirementBindings(
  plan: AwsCePlan,
  session: TerraformSession,
  rawApi: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  verifyAwsCePlan(plan);
  const sites = siteTopology(plan.intent);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.topology.nodeCount !== 1 ||
    sites.length !== 1 ||
    sites[0].nodeIndexes.join(',') !== '1' ||
    plan.intent.operation !== 'deploy'
  )
    throw new Error('Initial registration retirement requires a single owned Terraform node');
  const receipt = await session.planDestroy(env, signal);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== plan.intent.deploymentName ||
    receipt.backendIdentity !== `local:${plan.intent.deploymentName}` ||
    (receipt.actionInvocations?.length ?? 0) ||
    (receipt.imports?.length ?? 0) ||
    (receipt.relinquishments?.length ?? 0) ||
    [receipt.planSha256, receipt.configurationSha256, receipt.providerLockSha256].some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    )
  )
    throw new Error('Original saved instance destroy plan identity differs');
  const selected = receipt.changes.filter((row) => row.type === 'aws_instance');
  if (
    selected.length !== 1 ||
    selected[0].address !== 'aws_instance.node_1' ||
    selected[0].actions.join(',') !== 'delete'
  )
    throw new Error('Original saved plan does not contain exactly the selected instance');
  const fields = await session.readPlannedResourceFields(
    receipt,
    { 'aws_instance.node_1': ['id', 'region'] },
    env,
    signal,
  );
  const instance = object(fields['aws_instance.node_1']);
  if (
    Object.keys(fields).length !== 1 ||
    typeof instance.id !== 'string' ||
    !/^i-[0-9a-f]{8,17}$/.test(instance.id) ||
    instance.region !== plan.intent.region
  )
    throw new Error('Original saved instance ID or region is unavailable');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const run = async (service: string, operation: string, arguments_: string[] = []): Promise<Json> => {
    const result = await api.exec('aws', [
      service,
      operation,
      ...arguments_,
      '--region',
      plan.intent.region,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) throw new Error('Original instance cloud ownership read is unavailable');
    let value: Json;
    try {
      value = object(JSON.parse(result.stdout));
    } catch {
      throw new Error('Original instance cloud read returned malformed JSON');
    }
    if (value.NextToken || value.NextMarker) throw new Error('Original instance cloud inventory is incomplete');
    return value;
  };
  if ((await run('sts', 'get-caller-identity')).Account !== plan.intent.accountId)
    throw new Error('Original instance cloud account differs');
  const result = await run('ec2', 'describe-instances', ['--instance-ids', instance.id]);
  if (!Array.isArray(result.Reservations) || result.Reservations.length !== 1)
    throw new Error('Original instance reservation is ambiguous');
  const reservation = object(result.Reservations[0]);
  if (
    reservation.OwnerId !== plan.intent.accountId ||
    !Array.isArray(reservation.Instances) ||
    reservation.Instances.length !== 1
  )
    throw new Error('Original instance reservation ownership differs');
  const live = object(reservation.Instances[0]);
  if (live.InstanceId !== instance.id) throw new Error('Original cloud instance was substituted');
  const tags = awsTerraformMetadataProjection(plan, 'aws_instance.node_1', live.Tags);
  if (tags.find((tag) => tag.Key === 'ves-io-site-name')?.Value !== sites[0].name)
    throw new Error('Original cloud instance site ownership differs');
  return { [`${plan.intent.deploymentName}-1`]: instance.id };
}

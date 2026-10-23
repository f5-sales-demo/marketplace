import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import {
  type AwsTerraformBrownfieldPlacement,
  assertAwsTerraformBrownfieldPlacement,
  qualifyAwsTerraformBrownfieldPlacement,
} from './terraform-brownfield-placement';
import type { AwsCeObservation, AwsCePlan } from './types';

const file = 'terraform-brownfield-placement.json';
type Store = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>;
type Observation = Pick<AwsCeObservation, 'identity' | 'resources'>;
function original(plan: AwsCePlan): Observation {
  return {
    identity: {
      accountId: plan.intent.accountId,
      partition: plan.intent.partition,
      awsProfile: plan.intent.awsProfile,
      arn: '',
    },
    resources: plan.rollback.resources.map((r) => ({
      id: r.id,
      region: plan.intent.region,
      exists: true,
      owned: false,
      tags: {},
      state: structuredClone(r.before),
    })),
  };
}
/** Validates immutable plan snapshots for translation only; fresh cloud qualification remains required. */
export function awsTerraformBrownfieldPlacementBaseline(plan: AwsCePlan) {
  verifyAwsCePlan(plan);
  return qualifyAwsTerraformBrownfieldPlacement(plan, original(plan));
}
async function observe(
  plan: AwsCePlan,
  binding: AwsTerraformBrownfieldPlacement,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal);
  const read = async (args: string[]) => {
    const result = await api.exec('aws', [...args, '--region', plan.intent.region, '--output', 'json']);
    if (result.exitCode) throw Error('Brownfield placement cloud observation unavailable');
    const value = JSON.parse(result.stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Malformed brownfield placement cloud observation');
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(value, k)))
      throw Error('Partial brownfield placement cloud observation');
    return value as Record<string, unknown>;
  };
  const identity = await read(['sts', 'get-caller-identity']);
  if (
    identity.Account !== plan.intent.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.intent.partition}:`) ||
    identity.Arn.split(':')[4] !== plan.intent.accountId
  )
    throw Error('Brownfield placement cloud account or partition differs');
  const take = async (): Promise<Observation> => {
    const resources = [];
    for (const id of binding.referenceIds) {
      const command = id.startsWith('vpc-')
        ? 'describe-vpcs'
        : id.startsWith('subnet-')
          ? 'describe-subnets'
          : id.startsWith('rtb-')
            ? 'describe-route-tables'
            : 'describe-internet-gateways';
      const selector = id.startsWith('vpc-')
        ? '--vpc-ids'
        : id.startsWith('subnet-')
          ? '--subnet-ids'
          : id.startsWith('rtb-')
            ? '--route-table-ids'
            : '--internet-gateway-ids';
      resources.push({
        id,
        region: plan.intent.region,
        exists: true,
        owned: false,
        tags: {},
        state: await read(['ec2', command, selector, id]),
      });
    }
    return {
      identity: {
        accountId: plan.intent.accountId,
        partition: plan.intent.partition,
        awsProfile: plan.intent.awsProfile,
        arn: identity.Arn as string,
      },
      resources,
    };
  };
  const first = await take(),
    second = await take();
  if (canonicalSha256(first) !== canonicalSha256(second))
    throw Error('Brownfield placement changed during observation');
  const qualified = qualifyAwsTerraformBrownfieldPlacement(plan, second);
  if (canonicalSha256(qualified) !== canonicalSha256(binding))
    throw Error('Brownfield placement observed binding differs');
  return { binding: qualified, evidenceSha256: canonicalSha256(second), observedAt: new Date().toISOString() };
}
async function scope(plan: AwsCePlan, storage: Store) {
  verifyAwsCePlan(plan);
  const owner = storage.owner;
  if (
    plan.engine !== 'terraform' ||
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.account !== plan.intent.accountId ||
    owner.region !== plan.intent.region ||
    owner.deploymentId !== plan.intent.deploymentName
  )
    throw Error('Brownfield placement durable owner differs');
  await storage.verify();
}
/** Read-only qualification; never admits deployment mutations or changes existing network state. */
export async function prepareAwsTerraformBrownfieldBinding(
  plan: AwsCePlan,
  storage: Store,
  api: AwsExecApi,
  signal?: AbortSignal,
) {
  await scope(plan, storage);
  signal?.throwIfAborted();
  const baseline = awsTerraformBrownfieldPlacementBaseline(plan);
  let prior: unknown;
  try {
    prior = await storage.read(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (prior !== undefined && canonicalSha256(prior) !== canonicalSha256(baseline))
    throw Error('Persisted brownfield placement differs');
  const observation = await observe(plan, baseline, api, signal);
  await storage.verify();
  if (prior === undefined) await storage.write(file, baseline);
  await storage.write('terraform-brownfield-placement-preparation-observation.json', observation);
  return baseline;
}
/** Reload only an existing binding and freshly verify its immutable cloud references before opening a runner. */
export async function loadAwsTerraformBrownfieldBinding(
  plan: AwsCePlan,
  storage: Store,
  api: AwsExecApi,
  signal?: AbortSignal,
) {
  await scope(plan, storage);
  signal?.throwIfAborted();
  const binding = (await storage.read(file)) as AwsTerraformBrownfieldPlacement;
  assertAwsTerraformBrownfieldPlacement(plan, binding);
  const baseline = awsTerraformBrownfieldPlacementBaseline(plan);
  if (canonicalSha256(binding) !== canonicalSha256(baseline))
    throw Error('Persisted brownfield placement original snapshot differs');
  const observation = await observe(plan, binding, api, signal);
  await storage.verify();
  let terminal = false;
  try {
    await storage.read('aws-terraform-terminal-cleanup.json');
    terminal = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!terminal) await storage.write('terraform-brownfield-placement-opening-observation.json', observation);
  return binding;
}

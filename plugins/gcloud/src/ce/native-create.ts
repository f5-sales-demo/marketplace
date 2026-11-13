import type { GcpBootstrapStore } from './bootstrap-checkout';
import { type GcpNativeAction, translateGcpNativeCompute } from './compute-plan';
import { fingerprint } from './discovery';
import { assertGcpResourceOwnership, type GcpResourceIdentity, recordGcpResource } from './ownership';
import type { GcpCeIntent } from './types';

export interface GcpNativeCreateDriver {
  observe(action: GcpNativeAction, signal?: AbortSignal): Promise<GcpResourceIdentity | null>;
  submit(action: GcpNativeAction, executionId: string, signal?: AbortSignal): Promise<unknown>;
  reconcile(
    action: GcpNativeAction,
    executionId: string,
    receipt: unknown,
    signal?: AbortSignal,
  ): Promise<'pending' | 'done' | 'failed'>;
  /** New drivers bind final capture to the original create result; legacy drivers remain unchanged. */
  assertCreatedIdentity?(action: GcpNativeAction, executionId: string, observed: GcpResourceIdentity): Promise<void>;
}
interface CreationCheckpoint {
  planHash: string;
  actions: Record<string, { state: 'submitting' | 'pending' | 'done' | 'failed'; receipt?: unknown }>;
}
/** Internal cloud creation journal. Bootstrap/site admission remains with the owning Platform lifecycle. */
export async function applyGcpNativeCreation(
  store: GcpBootstrapStore,
  intent: GcpCeIntent,
  reviewedHash: string,
  driver: GcpNativeCreateDriver,
  signal?: AbortSignal,
  beforeInstance?: (action: GcpNativeAction, signal?: AbortSignal) => Promise<void>,
) {
  const plan = translateGcpNativeCompute(intent);
  if (reviewedHash !== plan.sha256) throw new Error('Reviewed native creation plan differs');
  signal?.throwIfAborted();
  return store.exclusive(async () => {
    const name = `gcp-create-${plan.sha256.slice(7)}.json`;
    let checkpoint: CreationCheckpoint;
    try {
      checkpoint = (await store.read(name)) as CreationCheckpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      checkpoint = { planHash: plan.sha256, actions: {} };
    }
    if (
      checkpoint.planHash !== reviewedHash ||
      !checkpoint.actions ||
      typeof checkpoint.actions !== 'object' ||
      Array.isArray(checkpoint.actions) ||
      Object.keys(checkpoint.actions).some((id) => !plan.actions.some((action) => action.id === id))
    )
      throw new Error('Native creation checkpoint differs');
    for (const action of plan.actions) {
      signal?.throwIfAborted();
      const prior = checkpoint.actions[action.id];
      if (prior && !['submitting', 'pending', 'done', 'failed'].includes(prior.state))
        throw new Error('Invalid creation checkpoint state');
      if (action.dependencies.some((id) => checkpoint.actions[id]?.state !== 'done'))
        return { state: 'pending', actionId: action.id };
      if (prior?.state === 'failed') throw new Error('Creation failed; reviewed repair plan required');
      const executionId = `create-${fingerprint({ plan: plan.sha256, action: action.id }).slice(7, 47)}`;
      if (prior?.state === 'done') {
        const observed = await driver.observe(action, signal);
        if (!observed) throw new Error('Created resource disappeared');
        await assertGcpResourceOwnership(store, observed, observed);
        continue;
      }
      if (!prior) {
        if (await driver.observe(action, signal)) throw new Error('Preexisting cloud resource collision');
        if (action.kind === 'instance') await beforeInstance?.(action, signal);
        checkpoint.actions[action.id] = { state: 'submitting' };
        await store.write(name, checkpoint);
        signal?.throwIfAborted();
        const receipt = await driver.submit(action, executionId, signal);
        checkpoint.actions[action.id] = { state: 'pending', receipt };
        await store.write(name, checkpoint);
      }
      const current = checkpoint.actions[action.id];
      const result = await driver.reconcile(action, executionId, current.receipt, signal);
      if (result !== 'done') {
        if (result === 'failed') {
          current.state = 'failed';
          await store.write(name, checkpoint);
        }
        return { state: result, actionId: action.id };
      }
      const observed = await driver.observe(action, signal);
      if (
        !observed ||
        observed.project !== intent.project ||
        observed.deploymentName !== intent.deploymentName ||
        observed.engine !== 'native' ||
        observed.kind !== action.kind
      )
        throw new Error('Created cloud identity differs');
      const node = intent.sites.flatMap((site) => site.nodes).find((node) => action.id === `instance-${node.name}`);
      const resourceName = action.argv[action.kind === 'subnetwork' ? 4 : 3];
      const scope =
        action.kind === 'instance'
          ? `zones/${node?.zone}`
          : action.kind === 'subnetwork'
            ? `regions/${intent.region}`
            : 'global';
      const collection =
        action.kind === 'instance' ? 'instances' : action.kind === 'subnetwork' ? 'subnetworks' : 'networks';
      if (
        observed.selfLink !==
        `https://www.googleapis.com/compute/v1/projects/${intent.project}/${scope}/${collection}/${resourceName}`
      )
        throw new Error('Created resource is not the exact planned identity');
      await driver.assertCreatedIdentity?.(action, executionId, observed);
      await recordGcpResource(store, observed);
      current.state = 'done';
      await store.write(name, checkpoint);
    }
    return { state: 'done', planHash: plan.sha256 };
  });
}

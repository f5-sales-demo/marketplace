import type { GcpBootstrapStore } from './bootstrap-checkout';
import { fingerprint } from './discovery';
import { assertGcpResourceOwnership, type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';

export interface GcpLifecycleAction {
  id: string;
  argv: string[];
  dependencies: string[];
  resources: GcpResourceIdentity[];
}
export interface GcpLifecyclePlan {
  schemaVersion: 1;
  engine: 'native';
  project: string;
  deploymentName: string;
  actions: GcpLifecycleAction[];
  sha256: string;
}
export interface GcpNativeDriver {
  observe(resource: GcpResourceIdentity): Promise<{ id: string; selfLink: string }>;
  submit(action: GcpLifecycleAction): Promise<unknown>;
  reconcile(action: GcpLifecycleAction, receipt: unknown): Promise<'pending' | 'done' | 'failed'>;
  assertPreconditions?(action: GcpLifecycleAction): Promise<void>;
}
interface ActionCheckpoint {
  state: 'prepared' | 'submitting' | 'pending' | 'done' | 'failed';
  receipt?: unknown;
}
interface Checkpoint {
  schemaVersion: 1;
  planSha256: string;
  approvedPlanSha256: string;
  actions: Record<string, ActionCheckpoint>;
}
function validate(plan: GcpLifecyclePlan, approvedHash: string) {
  const { sha256, ...body } = plan;
  if (plan.schemaVersion !== 1 || plan.engine !== 'native' || sha256 !== fingerprint(body) || approvedHash !== sha256)
    throw new Error('Reviewed lifecycle plan identity differs');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(plan.project) || !/^[a-z][a-z0-9-]{0,62}$/.test(plan.deploymentName))
    throw new Error('Invalid lifecycle scope');
  const seen = new Set<string>();
  for (const action of plan.actions) {
    if (
      !/^[a-z][a-z0-9-]{0,62}$/.test(action.id) ||
      seen.has(action.id) ||
      action.dependencies.some((id) => !seen.has(id))
    )
      throw new Error('Lifecycle dependencies must be ordered and unique');
    seen.add(action.id);
    if (!action.resources.length) throw new Error('Lifecycle action requires exact owned inventory');
    for (const resource of action.resources) {
      validateGcpResourceIdentity(resource);
      if (
        resource.engine !== 'native' ||
        resource.project !== plan.project ||
        resource.deploymentName !== plan.deploymentName
      )
        throw new Error('Action ownership differs');
    }
    // This executor handles exact owned VM power/resize operations only. Other
    // operations need their own capability and result/ownership contracts.
    if (
      action.argv[0] !== 'compute' ||
      action.argv[1] !== 'instances' ||
      !['start', 'stop', 'set-machine-type'].includes(action.argv[2]) ||
      action.resources.length !== 1 ||
      action.resources[0].kind !== 'instance'
    )
      throw new Error('Unsupported lifecycle action');
    const resource = action.resources[0],
      segments = resource.selfLink.split('/');
    const expectedName = segments.at(-1),
      zone = segments[8];
    if (
      action.argv[3] !== expectedName ||
      !action.argv.includes(`--project=${plan.project}`) ||
      !action.argv.includes(`--zone=${zone}`)
    )
      throw new Error('Action argv does not match owned identity');
    if (
      !action.argv.includes('--format=json') ||
      (action.argv[2] === 'set-machine-type' &&
        action.argv.filter((arg) => arg.startsWith('--machine-type=')).length !== 1) ||
      (action.argv[2] !== 'set-machine-type' && !action.argv.includes('--async'))
    )
      throw new Error('Lifecycle action lacks exact operation/result flags');
    const allowed = new Set([`--project=${plan.project}`, `--zone=${zone}`, '--async', '--quiet', '--format=json']);
    for (const arg of action.argv.slice(4)) {
      if (
        !allowed.has(arg) &&
        !(action.argv[2] === 'set-machine-type' && /^--machine-type=[a-z][a-z0-9-]{0,62}$/.test(arg))
      )
        throw new Error('Unsupported lifecycle argument');
    }
    if (new Set(action.argv.slice(4).map((arg) => arg.split('=')[0])).size !== action.argv.slice(4).length)
      throw new Error('Duplicate lifecycle flags');
  }
}
/** Durable exact-plan native execution. Ambiguous submission is reconciled, never blindly retried. */
export async function applyGcpNativeLifecycle(
  store: GcpBootstrapStore,
  plan: GcpLifecyclePlan,
  approvedHash: string,
  driver: GcpNativeDriver,
) {
  validate(plan, approvedHash);
  return store.exclusive(async () => {
    let checkpoint: Checkpoint;
    try {
      checkpoint = (await store.read('gcp-lifecycle-checkpoint.json')) as Checkpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      checkpoint = { schemaVersion: 1, planSha256: plan.sha256, approvedPlanSha256: approvedHash, actions: {} };
    }
    if (
      checkpoint?.schemaVersion !== 1 ||
      checkpoint.planSha256 !== plan.sha256 ||
      checkpoint.approvedPlanSha256 !== approvedHash ||
      !checkpoint.actions ||
      typeof checkpoint.actions !== 'object' ||
      Array.isArray(checkpoint.actions)
    )
      throw new Error('Resume checkpoint is not bound to reviewed authorization');
    const actionIds = new Set(plan.actions.map((action) => action.id));
    if (Object.keys(checkpoint.actions).some((id) => !actionIds.has(id)))
      throw new Error('Checkpoint includes foreign lifecycle actions');
    for (const action of plan.actions) {
      const recorded = checkpoint.actions[action.id];
      if (recorded && Object.keys(recorded).some((key) => !['state', 'receipt'].includes(key)))
        throw new Error('Malformed lifecycle action evidence');
      if (recorded?.state === 'done' && action.dependencies.some((id) => checkpoint.actions[id]?.state !== 'done'))
        throw new Error('Checkpoint violates lifecycle dependency order');
    }
    const save = () => store.write('gcp-lifecycle-checkpoint.json', checkpoint);
    await save();
    for (const action of plan.actions) {
      if (action.dependencies.some((id) => checkpoint.actions[id]?.state !== 'done'))
        return { state: 'pending', actionId: action.id };
      let current = checkpoint.actions[action.id];
      if (current?.state === 'done') continue;
      if (current?.state === 'failed')
        throw new Error('Lifecycle operation failed; repair requires a new reviewed plan');
      if (current && !['prepared', 'submitting', 'pending'].includes(current.state))
        throw new Error('Malformed lifecycle action checkpoint');
      for (const resource of action.resources)
        await assertGcpResourceOwnership(store, resource, await driver.observe(resource));
      if (!current) {
        current = { state: 'prepared' };
        checkpoint.actions[action.id] = current;
        await save();
      }
      if (current.state === 'prepared') {
        if (action.argv[2] === 'set-machine-type' && !driver.assertPreconditions)
          throw new Error('Resize requires fresh stopped-state and sizing prechecks');
        await driver.assertPreconditions?.(action);
        current.state = 'submitting';
        await save();
        // Persist 'submitting' first. If submit or the following durable write
        // fails, the next invocation must use outcome reconciliation.
        current.receipt = await driver.submit(action);
        current.state = 'pending';
        await save();
      }
      const result = await driver.reconcile(action, current.receipt);
      if (!['pending', 'done', 'failed'].includes(result)) throw new Error('Unknown native operation outcome');
      current.state = result;
      await save();
      if (result === 'failed') throw new Error('Lifecycle operation failed');
      if (result === 'pending') return { state: 'pending', actionId: action.id };
    }
    return { state: 'done', planSha256: plan.sha256 };
  });
}

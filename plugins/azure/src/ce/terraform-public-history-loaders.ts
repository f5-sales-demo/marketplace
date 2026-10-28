import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { readAzureCePlanInventory, type SessionManagerLike, verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import { AzureTerraformOutcomeAbsent, loadAzureTerraformOutcome } from './terraform-outcome';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

/** Bind exhaustive public source/outcome reads to the selected owning deployment and session.
 * This supplies historical artifact identity only; acceptance verifiers remain separate. */
export async function createAzureTerraformPublicHistoryLoaders(
  original: AzureCePlan,
  session: SessionManagerLike,
  store: CeDeploymentStore,
  signal?: AbortSignal,
): Promise<AzureTerraformNetworkHistoryLoaders> {
  const source = structuredClone(original),
    owner = structuredClone(store.owner),
    directory = store.directory,
    verifyStore = store.verify;
  const callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact],
    sessionId = session.getSessionId(),
    publicDirectory = session.getArtifactsDir();
  const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
  verifyAzureCePlan(source);
  if (
    source.engine !== 'terraform' ||
    source.intent.operation !== 'deploy' ||
    !same(azureUpgradeBinding(source).owner, owner)
  )
    throw Error('Azure public history requires its original owning Terraform deployment');
  const seal = () => {
    signal?.throwIfAborted();
    if (
      !same(original, source) ||
      !same(store.owner, owner) ||
      store.directory !== directory ||
      store.verify !== verifyStore ||
      session.getSessionId() !== sessionId ||
      session.getArtifactsDir() !== publicDirectory ||
      callbacks.some(
        (callback, index) =>
          callback !==
          [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
      )
    )
      throw Error('Azure public history owning context changed');
  };
  const bounded = async <T>(work: (active: AbortSignal) => Promise<T>): Promise<T> => {
    seal();
    const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      active.throwIfAborted();
      const result = await Promise.race([work(active), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verifyStore.call(store));
  const inventory = await bounded((active) => readAzureCePlanInventory(session, active));
  const plans = new Map(inventory.plans.map((envelope) => [envelope.plan.planSha256, structuredClone(envelope.plan)]));
  if (!plans.has(source.planSha256) || !same(plans.get(source.planSha256), source))
    throw Error('Azure public history original source is unresolved');
  const selected = (digest: string) => {
    seal();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw Error('Azure public history execution identifier is unresolved');
    const plan = plans.get(digest);
    if (!plan) throw Error('Azure public history execution source is unresolved');
    verifyAzureCePlan(plan);
    if (plan.engine !== 'terraform' || !same(azureUpgradeBinding(plan), azureUpgradeBinding(source)))
      throw Error('Azure public history execution source belongs to a different deployment');
    return plan;
  };
  const inspect = async (active: AbortSignal) => {
    await verifyStore.call(store);
    seal();
    // Each loader invocation is a new native observation with one unchanged deadline.
    // Compare against frozen original inventory bytes, never reuse an expired observer witness.
    const current = await readAzureCePlanInventory(session, active);
    if (current.sourceSha256 !== inventory.sourceSha256 || !same(current.plans, inventory.plans))
      throw Error('Azure public history frozen source inventory changed');
    seal();
  };
  return Object.freeze({
    async loadSource(digest: string) {
      const plan = selected(digest);
      await bounded(inspect);
      return structuredClone(plan);
    },
    async loadOutcome(request: AzureCePlan) {
      const plan = selected(request.planSha256);
      if (!same(request, plan)) throw Error('Azure public history requested outcome source differs');
      const requested = structuredClone(request);
      return bounded(async (active) => {
        await inspect(active);
        let outcome: Record<string, unknown>;
        try {
          outcome = await loadAzureTerraformOutcome(session, plan, active);
        } catch (error) {
          if (error instanceof AzureTerraformOutcomeAbsent) {
            await inspect(active);
            if (!same(request, requested))
              throw Error('Azure public history outcome request changed during inspection');
          }
          throw error;
        }
        await inspect(active);
        if (!same(request, requested)) throw Error('Azure public history outcome request changed during inspection');
        return structuredClone(outcome);
      });
    },
  });
}

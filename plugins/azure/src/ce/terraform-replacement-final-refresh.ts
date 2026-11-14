import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureCePlan } from './types';

/** Native origin records submission intent only. Cloud acceptance and receipt publication
 * remain separate. An equal configuration or receipt acknowledgement cannot supply origin. */
export async function planAzureTerraformReplacementFinalRefresh(
  plan: AzureCePlan,
  store: CeDeploymentStore,
  session: TerraformSession,
  binding: {
    journalSha256: string;
    sourceBindingSha256: string;
    checkpointSha256: string;
    configurationSha256: string;
    providerLockSha256: string;
  },
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<PlanReceipt> {
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const request = structuredClone({ plan, owner: store.owner, binding }),
    origin = canonicalSha256({ schemaVersion: 1, kind: 'azure-terraform-replacement-final-refresh', ...request }),
    read = session.readCurrentPlanJournal,
    execute = session.plan;
  if (typeof read !== 'function') throw Error('Native current final-refresh journal reader required');
  const seal = () => {
    deadline.throwIfAborted();
    if (
      !canonicalEqual(request, { plan, owner: store.owner, binding }) ||
      session.readCurrentPlanJournal !== read ||
      session.plan !== execute
    )
      throw Error('Owning final-refresh request or native readers changed');
  };
  const step = async <T>(work: () => Promise<T>): Promise<T> => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([work(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const deployment = await step(() => azureTerraformCurrentDeployment(plan)),
    { configuration: _source, providerLock, ...identity } = deployment,
    manifestSha256 = canonicalSha256({
      ...identity,
      configurationSha256: binding.configurationSha256,
      providerLockSha256: createHash('sha256').update(providerLock).digest('hex'),
    });
  if (createHash('sha256').update(providerLock).digest('hex') !== binding.providerLockSha256)
    throw Error('Owning final-refresh provider lock differs');
  seal();
  const actual = await step(() => read.call(session, binding.configurationSha256, deadline)),
    observed = structuredClone(actual);
  const sealObserved = () => {
    seal();
    if (!canonicalEqual(actual, observed)) throw Error('Owning final-refresh observation changed across callbacks');
  };
  sealObserved();
  if (observed.receipt?.refreshOriginSha256 === origin) {
    const receipt = observed.receipt;
    if (
      observed.schemaVersion !== 1 ||
      observed.scope !== 'current-saved-plan-byte-and-journal-binding' ||
      observed.planSemanticsQualified !== false ||
      !['planned', 'applied'].includes(observed.state) ||
      observed.manifestSha256 !== manifestSha256 ||
      observed.savedPlanSha256 !== receipt.planSha256 ||
      !/^[a-f0-9]{64}$/.test(observed.journalSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(observed.executionSha256 ?? '') ||
      observed.ordinaryRefreshEnabled !== true ||
      receipt.schemaVersion !== 1 ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== plan.deploymentName ||
      receipt.backendIdentity !== `local:${plan.deploymentName}` ||
      receipt.configurationSha256 !== binding.configurationSha256 ||
      receipt.providerLockSha256 !== binding.providerLockSha256 ||
      receipt.noChanges !== true ||
      receipt.changes.some((change) => change.actions.join(',') !== 'no-op') ||
      [receipt.operation, receipt.actionInvocations, receipt.imports, receipt.relinquishments].some(
        (value) => value !== undefined,
      )
    )
      throw Error('Owning lost final-refresh native evidence differs');
    let published: unknown;
    try {
      published = await step(() => store.read(`${plan.planId}-terraform-replacement-final-plan.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    sealObserved();
    const fresh = await step(() => read.call(session, binding.configurationSha256, deadline));
    sealObserved();
    if (!canonicalEqual(fresh, observed)) throw Error('Owning lost final-refresh journal changed across callbacks');
    if (published === undefined || !canonicalEqual(published, receipt)) return structuredClone(receipt);
  }
  const reply = await step(() => execute.call(session, env, deadline, origin)),
    receipt = structuredClone(reply);
  seal();
  if (receipt.refreshOriginSha256 !== origin) throw Error('Native final-refresh origin was not persisted');
  const saved = await step(() => read.call(session, binding.configurationSha256, deadline));
  seal();
  if (!canonicalEqual(reply, receipt)) throw Error('Owning final-refresh reply changed during native verification');
  if (
    saved.schemaVersion !== 1 ||
    saved.scope !== 'current-saved-plan-byte-and-journal-binding' ||
    saved.planSemanticsQualified !== false ||
    !canonicalEqual(saved.receipt, receipt) ||
    saved.state !== 'planned' ||
    saved.manifestSha256 !== manifestSha256 ||
    saved.savedPlanSha256 !== receipt.planSha256 ||
    !/^[a-f0-9]{64}$/.test(saved.journalSha256 ?? '') ||
    !/^[a-f0-9]{64}$/.test(saved.executionSha256 ?? '') ||
    saved.ordinaryRefreshEnabled !== true
  )
    throw Error('Native final-refresh journal does not authenticate the owning reply');
  return structuredClone(receipt);
}

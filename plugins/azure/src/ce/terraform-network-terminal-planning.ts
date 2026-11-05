import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import {
  qualifyAzureTerraformNetworkCancelledMainBinding,
  recheckAzureTerraformNetworkCancelledMainBinding,
  refreshAzureTerraformNetworkCancelledMainBinding,
} from './terraform-network-cancelled-main-binding';
import {
  type AzureTerraformNetworkDestroyJournalContext,
  qualifyAzureTerraformNetworkDestroyJournalCustody,
} from './terraform-network-destroy-journal-custody';
import { compileAzureTerraformTeardown } from './terraform-teardown';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const name = 'azure-terraform-terminal-cleanup.json';
const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure network terminal planning: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v as Record<string, unknown>;
}
/** Owning lifecycle-lock cancellation/planning operation. Freeze the current authenticated
 * destroy source and child custody before cancelling. Recover an already-created ordinary
 * native plan without replanning. Independent fresh cloud/platform absence is supplied by
 * the caller before every mutation; no retirement or public cleanup claim is returned here.
 */
export async function prepareAzureTerraformNetworkTerminalPlanning(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkDestroyJournalContext,
  freshAbsence: (signal: AbortSignal) => Promise<unknown>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    site = structuredClone(context.site),
    environment = { ...env },
    { terraform, publicSession, loaders, verifier, replacementVerifier } = context;
  const dependencies: Array<{ target: object; key: string; value: unknown }> = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, original) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      same(context.destroyTeardown, teardown) &&
      same(context.site, site) &&
      context.terraform === terraform &&
      context.publicSession === publicSession &&
      context.loaders === loaders &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      same(env, environment) &&
      dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await step(() => store.verify());
  require(same(azureUpgradeBinding(original).owner, owner) &&
    same(
      compileAzureTerraformTeardown(
        original,
        teardown.drain,
        teardown.retirement,
        teardown.pendingAdmissionJournalSha256,
      ),
      teardown,
    ), 'compiled teardown differs');
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const readConfiguration = session.readConfiguration,
    readDigest = session.readConfigurationSha256,
    cancel = session.cancelUnsubmittedPlan,
    plan = session.plan,
    readCancellation = session.readUnsubmittedPlanCancellation;
  require(typeof readConfiguration === 'function' &&
    typeof readDigest === 'function' &&
    typeof cancel === 'function' &&
    typeof plan === 'function' &&
    typeof readCancellation === 'function', 'native current, cancellation and planning interfaces required');
  for (const key of [
    'readConfiguration',
    'readConfigurationSha256',
    'cancelUnsubmittedPlan',
    'plan',
    'readUnsubmittedPlanCancellation',
  ])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  let checkpoint: Record<string, unknown> | undefined;
  try {
    checkpoint = object(await step(() => store.read(name)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!checkpoint) {
    const custody = await step(() =>
      qualifyAzureTerraformNetworkDestroyJournalCustody(request, store, context, deadline),
    );
    const destroy = object(
      await step(() => store.read('azure-terraform-cloud-destroy-final.json')),
    ) as unknown as PlanReceipt;
    const currentDigest = await step(() => readDigest.call(session));
    require(currentDigest === destroy.configurationSha256, 'current destroy configuration differs');
    const retainedDestroyConfiguration = await step(() => readConfiguration.call(session, destroy.configurationSha256));
    require(hash(retainedDestroyConfiguration) === destroy.configurationSha256, 'retained destroy bytes differ');
    const retained = object(JSON.parse(retainedDestroyConfiguration));
    require(same(
      { terraform: retained.terraform, provider: retained.provider },
      JSON.parse(deployment.configuration),
    ), 'retained provider identity differs');
    const evidence = { ...object(await step(() => freshAbsence(deadline))), network: structuredClone(custody) };
    // Publishing a retained checkpoint is reversible. The subsequent absent-phase observer
    // reauthenticates its full collector result after fresh absence and before cancellation;
    // a changed source cannot authorize a native command.
    await step(() => store.verify());
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      configurationSha256: destroy.configurationSha256,
      emptyConfiguration: deployment.configuration,
      emptyConfigurationSha256: hash(deployment.configuration),
      destroy,
      evidence,
      evidenceSha256: canonicalSha256(evidence),
      checkpointSha256: canonicalSha256({
        configurationSha256: destroy.configurationSha256,
        emptyConfiguration: deployment.configuration,
        destroy,
        evidence,
      }),
      retainedDestroyConfiguration,
      retainedNetworkCustody: structuredClone(custody),
      phase: 'cancelling',
    };
    await step(() => store.write(name, checkpoint, deadline));
  }
  require(['cancelling', 'planning'].includes(String(checkpoint.phase)), 'cancellation/planning phase required');
  const qualify = (current: Record<string, unknown>) => {
    const boundContext = { ...context, terminalCleanup: current };
    return {
      boundContext,
      read: () => step(() => qualifyAzureTerraformNetworkCancelledMainBinding(request, store, boundContext, deadline)),
    };
  };
  const assertSaved = (current: Record<string, unknown>) =>
    step(async () => {
      require(same(await store.read(name), current), 'saved checkpoint changed');
    });
  if (checkpoint.phase === 'cancelling') {
    const { boundContext, read } = qualify(checkpoint),
      observed = await read();
    if (!observed.cancellationQualified) {
      await step(() => freshAbsence(deadline));
      await step(() =>
        recheckAzureTerraformNetworkCancelledMainBinding(observed, request, store, boundContext, deadline),
      );
      await assertSaved(checkpoint);
      const cancelling = checkpoint;
      const actual = await step(() =>
        cancel.call(
          session,
          cancelling.destroy as PlanReceipt,
          cancelling.configurationSha256 as string,
          cancelling.emptyConfiguration as string,
          cancelling.evidenceSha256 as string,
        ),
      );
      require(actual === hash(deployment.configuration), 'native cancelled configuration differs');
      const cancellation = await step(() =>
        readCancellation.call(
          session,
          cancelling.destroy as PlanReceipt,
          cancelling.configurationSha256 as string,
          hash(deployment.configuration),
          cancelling.evidenceSha256 as string,
          deadline,
        ),
      );
      require(cancellation.cancellationQualified &&
        cancellation.status === 'cancelled' &&
        cancellation.currentConfigurationSha256 ===
          hash(deployment.configuration), 'native cancellation is incomplete');
    }
    await assertSaved(checkpoint);
    checkpoint = { ...checkpoint, phase: 'planning' };
    await step(() => store.write(name, checkpoint, deadline));
  }
  const { boundContext, read } = qualify(checkpoint),
    observed = await read();
  require(observed.cancellationQualified, 'ordinary planning requires completed native cancellation');
  let final = observed.currentPlanReceipt;
  let current = observed;
  const recoveredExistingPlan = final !== null;
  let retirementEvidence: Record<string, unknown> | undefined;
  if (!final) {
    require(observed.ordinaryPlanReady, 'exact absent current slot required');
    await step(() => freshAbsence(deadline));
    await step(() =>
      recheckAzureTerraformNetworkCancelledMainBinding(observed, request, store, boundContext, deadline),
    );
    await assertSaved(checkpoint);
    final = await step(() => plan.call(session, environment, deadline));
    retirementEvidence = object(await step(() => freshAbsence(deadline)));
    const after = await step(() =>
      refreshAzureTerraformNetworkCancelledMainBinding(observed, request, store, boundContext, deadline),
    );
    current = after;
    require(after.ordinaryCurrentJournalQualified &&
      same(after.currentPlanReceipt, final), 'ordinary native plan lacks exact continuation proof');
  }
  require(current.ordinaryCurrentJournalQualified &&
    same(current.currentPlanReceipt, final), 'native ordinary continuation changed');
  if (recoveredExistingPlan) {
    retirementEvidence = object(await step(() => freshAbsence(deadline)));
    await step(() => recheckAzureTerraformNetworkCancelledMainBinding(current, request, store, boundContext, deadline));
  }
  require(retirementEvidence, 'fresh retirement evidence required');
  await assertSaved(checkpoint);
  checkpoint = {
    ...checkpoint,
    phase: 'retiring',
    final: structuredClone(final),
    retirementEvidence,
    retirementEvidenceSha256: canonicalSha256(retirementEvidence),
  };
  await step(() => store.write(name, checkpoint, deadline));
  return {
    checkpoint: structuredClone(checkpoint),
    recoveredExistingPlan,
    mainRunnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    independentCloudCleanupQualified: false as const,
  };
}

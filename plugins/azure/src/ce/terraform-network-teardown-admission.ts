import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { SessionManagerLike } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkAllOriginalCustody } from './terraform-network-retirement-lineage';
import type { AzureCePlan } from './types';

export type AzureTerraformNetworkTeardownAdmissionContext = {
  publicSession: SessionManagerLike;
  terraform: CeTerraformService;
  loaders: AzureTerraformNetworkHistoryLoaders;
  site: { siteUid: string; siteConfigurationSha256: string };
  verifier: AzureTerraformNetworkAcceptanceVerifier;
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier;
};
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkTeardownAdmissionContext;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network teardown admission: ${message}`);
}

/** Pre-destroy history admission only, under the owning lifecycle lock. Authenticate the
 * complete public original/main/replacement journals and each derived retired power runner.
 * Neither an immutable preparation nor stage spelling grants admission. After a global
 * destroy changes the main journals, separate terminal cleanup evidence is required.
 * This read-only witness never authorizes destruction, main retirement or parent cleanup.
 */
export async function qualifyAzureTerraformNetworkTeardownAdmission(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkTeardownAdmissionContext,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    site = structuredClone(context.site),
    { publicSession, terraform, loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
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
    require(canonicalSha256(request) === canonicalSha256(original) &&
      canonicalSha256(store.owner) === canonicalSha256(owner) &&
      store.directory === directory &&
      context.publicSession === publicSession &&
      context.terraform === terraform &&
      context.loaders === loaders &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      canonicalSha256(context.site) === canonicalSha256(site) &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning request, context or dependency changed');
  };
  const collect = async (parentSignal?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const history = await Promise.race([
        readAzureTerraformNetworkAllOriginalCustody(
          original,
          publicSession,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
        ),
        canceled.promise,
      ]);
      active.throwIfAborted();
      seal();
      require(history.allPublicRequestCustodyQualified &&
        history.sharedMain.status === 'complete' &&
        history.sharedMain.allNativeReceiptsAccounted &&
        history.sharedMain.originalDeploymentJournalsQualified &&
        history.sharedMain.unrecognizedRootEntrySha256s?.length ===
          0, 'complete original and public native journal custody required');
      const powers = history.rows.flatMap((row) => {
        require(row.main.originalPublishedJournalsQualified &&
          row.main.terminalPublishedJournalsQualified &&
          row.power.rows.length > 0 &&
          row.power.rows.every(
            (power) => power.status === 'retired' && power.retirement?.runnerRetirementQualified === true,
          ), 'complete published network and retired power custody required');
        return row.power.rows.map((power) => ({ planSha256: row.planSha256, ...power }));
      });
      const stages = powers.map((power) => power.stage).sort();
      require(new Set(stages).size === stages.length, 'duplicate authenticated power stage');
      return { history, stages };
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const first = await collect(),
    historySha256 = canonicalSha256(first.history);
  const result = {
    schemaVersion: 1 as const,
    scope: 'pre-destroy-authenticated-network-stage-history' as const,
    originalPlanSha256: original.planSha256,
    owner,
    site,
    stages: first.stages,
    historySha256,
    publicJournalCustodyQualified: true as const,
    powerRunnerRetirementQualified: true as const,
    mainRunnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parentSignal) {
      seal();
      require(canonicalSha256(result) === digest, 'authenticated witness changed');
      const current = await collect(parentSignal);
      require(canonicalSha256(current.history) === historySha256 &&
        canonicalSha256(current.stages) ===
          canonicalSha256(result.stages), 'authenticated network stage history changed');
      seal();
    },
  });
  return result;
}

export async function recheckAzureTerraformNetworkTeardownAdmission(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkTeardownAdmissionContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning authenticated admission witness required');
  await bound.recheck(signal);
  require(canonicalSha256(witness) === bound.digest, 'authenticated witness changed');
}

import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { observeAzureCeRetirementAbsence } from './relay-retirement';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import {
  qualifyAzureTerraformNetworkFreshRetiredServices,
  recheckAzureTerraformNetworkFrozenRetiredServices,
} from './terraform-network-frozen-retired-services';
import { compileAzureTerraformTeardown } from './terraform-teardown';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure fresh parent absence: ${message}`);
}
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkEmptyMainBindingContext;
    runtime: CeRuntime;
    contract: VerifiedIngressContract;
    api: AzExecApi;
    digest: string;
    recheck(signal?: AbortSignal): Promise<unknown>;
  }
>();

/** Fresh independent external observation after native main/child retirement.
 * Current owning cloud/F5 reads are mandatory. Permanent native evidence anchors
 * identity and final runner retirement; it is never reused as current absence.
 * Platform scope is sites, registrations, owner-filtered tokens/routing/ingress.
 * This collector does not enumerate interface telemetry; exact interface absence
 * remains a separate acceptance gate. No packet/token deletion, parent cleanup,
 * installed or live acceptance claim.
 */
export async function qualifyAzureTerraformNetworkFreshParentAbsence(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    terminal = structuredClone(context.terminalCleanup),
    teardown = structuredClone(context.destroyTeardown),
    siteContract = runtime.contract,
    siteFingerprint = runtime.contract.fingerprint,
    ingressFingerprint = contract.fingerprint;
  const runtimeAbsence = runtime.unregisteredAbsence,
    exec = api.exec,
    read = store.read,
    verify = store.verify;
  const originalSha256 = canonicalSha256({ value: original }),
    ownerSha256 = canonicalSha256({ value: owner }),
    terminalSha256 = canonicalSha256({ value: terminal }),
    teardownSha256 = canonicalSha256({ value: teardown });
  const guard = () => {
    active.throwIfAborted();
    require(canonicalSha256({ value: request }) === originalSha256 &&
      canonicalSha256({ value: store.owner }) === ownerSha256 &&
      store.directory === root &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, terminalSha256) &&
      canonicalSha256({ value: context.destroyTeardown }) === teardownSha256 &&
      runtime.engine === 'terraform' &&
      runtime.contract === siteContract &&
      runtime.contract.fingerprint === siteFingerprint &&
      contract.fingerprint === ingressFingerprint &&
      runtime.unregisteredAbsence === runtimeAbsence &&
      api.exec === exec &&
      store.read === read &&
      store.verify === verify, 'owning context or dependency changed');
  };
  guard();
  const binding = azureUpgradeBinding(request);
  require(same(binding.owner, owner) &&
    same(
      compileAzureTerraformTeardown(
        request,
        teardown.drain,
        teardown.retirement,
        teardown.pendingAdmissionJournalSha256,
      ),
      teardown,
    ) &&
    teardown.drain.siteContractFingerprint === siteFingerprint &&
    teardown.drain.ingressContractFingerprint === ingressFingerprint, 'exact compiled identity and contracts required');
  const namespaces = new Set(['default']);
  for (const name of [
    ...teardown.drain.listeners.map((row) => row.namespace),
    ...teardown.drain.origins.map((row) => row.origin.namespace),
  ]) {
    require(typeof name === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name), 'exact namespace required');
    namespaces.add(name);
  }
  const native = await qualifyAzureTerraformNetworkFreshRetiredServices(request, store, context, active);
  guard();
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    guard();
    const current = AbortSignal.any([active, ...(parent ? [parent] : [])]);
    current.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(current.reason);
    current.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      current.throwIfAborted();
      guard();
      return result;
    } finally {
      current.removeEventListener('abort', onAbort);
    }
  };
  const inspect = async (parent?: AbortSignal) => {
    await step(
      () =>
        recheckAzureTerraformNetworkFrozenRetiredServices(
          native,
          request,
          store,
          context,
          parent ? AbortSignal.any([active, parent]) : active,
        ),
      parent,
    );
    const start = Date.now();
    const platform = await step(
      () =>
        runtimeAbsence.call(
          runtime,
          [binding],
          [...namespaces].sort(),
          contract,
          parent ? AbortSignal.any([active, parent]) : active,
        ),
      parent,
    );
    const began = Date.parse(platform.startedAt),
      at = Date.parse(platform.observedAt);
    require(platform.status === 'absent' &&
      same(platform.owner, owner) &&
      platform.siteContractFingerprint === siteFingerprint &&
      platform.ingressContractFingerprint === ingressFingerprint &&
      Number.isFinite(began) &&
      Number.isFinite(at) &&
      began >= start &&
      at >= began &&
      at <= Date.now() &&
      Date.now() - at <= 60000 &&
      Array.isArray(platform.sources) &&
      platform.sources.length > 0, 'current complete platform absence required');
    const cloudStart = Date.now();
    const cloud = await step(
      () => observeAzureCeRetirementAbsence(request, api, parent ? AbortSignal.any([active, parent]) : active),
      parent,
    );
    const cloudAt = Date.parse(cloud.observedAt);
    require(cloud.status === 'absent' &&
      cloud.engine === 'terraform' &&
      cloud.sourcePlanSha256 === request.planSha256 &&
      Number.isFinite(cloudAt) &&
      cloudAt >= cloudStart &&
      cloudAt <= Date.now() &&
      Date.now() - cloudAt <= 60000 &&
      cloud.reads.length === 3, 'current complete cloud absence required');
    await step(
      () =>
        recheckAzureTerraformNetworkFrozenRetiredServices(
          native,
          request,
          store,
          context,
          parent ? AbortSignal.any([active, parent]) : active,
        ),
      parent,
    );
    require(Date.now() - at <= 60000 && Date.now() - cloudAt <= 60000, 'external observations became stale');
    return { platform, cloud };
  };
  const evidence = await inspect();
  const result = {
    schemaVersion: 1 as const,
    scope: 'fresh-native-bound-azure-cloud-and-platform-resource-absence' as const,
    owner,
    originalPlanSha256: request.planSha256,
    teardownPlanSha256: teardown.planSha256,
    frozenParentInventorySha256: native.frozenParentInventorySha256,
    mainMarkerSha256: native.mainMarkerSha256,
    evidence,
    evidenceSha256: canonicalSha256(evidence),
    interfaceAbsenceQualified: false as const,
    fullExternalCleanupQualified: false as const,
    bootstrapRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    installedQualified: false as const,
    liveQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    request,
    store,
    context,
    runtime,
    contract,
    api,
    digest,
    async recheck(parent) {
      require(canonicalSha256(result) === digest, 'absence witness changed');
      return inspect(parent);
    },
  });
  return result;
}
export async function recheckAzureTerraformNetworkFreshParentAbsence(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    bound.runtime === runtime &&
    bound.contract === contract &&
    bound.api === api &&
    canonicalSha256(witness) === bound.digest, 'owning fresh absence witness required');
  return bound.recheck(signal);
}

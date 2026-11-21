import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { type SessionManagerLike, verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSnapshot } from './canonical';
import { createAzureNetworkOperationalAcceptance } from './network-operational-acceptance';
import { createAzureOperationalAcquisitionSession } from './network-operational-session';
import { createAzureReplacementReadingsAcceptance } from './network-replacement-readings-acceptance';
import { createAzureReplacementReadingsAcquisitionSession } from './network-replacement-readings-session';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

/** Resolve each historical signature against its actual source's original native issuer.
 * Source loaders and these factories are owning service/session capabilities, not public
 * callback inputs. Current collection and verification reuse the same acquisition instance.
 */
export function createAzureTerraformPublicOperationalVerifiers(
  request: AzureCePlan,
  native: SessionManagerLike,
  terraform: CeTerraformService,
  runtime: CeRuntime,
  api: AzExecApi,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    matches = canonicalSnapshot(request),
    binding = azureUpgradeBinding(original),
    directory = store.directory,
    nativeDirectory = native.getArtifactsDir(),
    sessionId = native.getSessionId();
  verifyAzureCePlan(original);
  const refs = [
    terraform.open,
    api.exec,
    store.verify,
    store.read,
    store.write,
    loaders.loadSource,
    native.getSessionId,
    native.getArtifactsDir,
    native.getArtifactPath,
    native.saveArtifact,
  ];
  const runtimeRefs = [
    runtime.observeOwnedSite,
    runtime.ownedSiteConfiguration,
    runtime.observeRegistrations,
    runtime.observeAzureInterfaces,
    runtime.observeNodeReadiness,
    runtime.observeForwardingRoutes,
    runtime.observeBgpSessions,
    runtime.observeBgpRoutes,
  ];
  const seal = () => {
    signal?.throwIfAborted();
    if (
      !matches(request) ||
      !matches(original) ||
      original.engine !== 'terraform' ||
      original.intent.operation !== 'deploy' ||
      runtime.engine !== 'terraform' ||
      !canonicalEqual(store.owner, binding.owner) ||
      store.directory !== directory ||
      native.getArtifactsDir() !== nativeDirectory ||
      native.getSessionId() !== sessionId ||
      refs.some(
        (fn, i) =>
          fn !==
          [
            terraform.open,
            api.exec,
            store.verify,
            store.read,
            store.write,
            loaders.loadSource,
            native.getSessionId,
            native.getArtifactsDir,
            native.getArtifactPath,
            native.saveArtifact,
          ][i],
      ) ||
      runtimeRefs.some(
        (fn, i) =>
          fn !==
          [
            runtime.observeOwnedSite,
            runtime.ownedSiteConfiguration,
            runtime.observeRegistrations,
            runtime.observeAzureInterfaces,
            runtime.observeNodeReadiness,
            runtime.observeForwardingRoutes,
            runtime.observeBgpSessions,
            runtime.observeBgpRoutes,
          ][i],
      )
    )
      throw Error('Public operational verifier owning context changed');
  };
  seal();
  const source = async (sha: string, active?: AbortSignal) => {
    seal();
    active?.throwIfAborted();
    const plan = await loaders.loadSource(sha);
    seal();
    active?.throwIfAborted();
    verifyAzureCePlan(plan);
    if (plan.planSha256 !== sha || plan.engine !== 'terraform' || !canonicalEqual(azureUpgradeBinding(plan), binding))
      throw Error('Public operational source differs');
    return plan;
  };
  type Network = ReturnType<typeof createAzureNetworkOperationalAcceptance>;
  type Replacement = ReturnType<typeof createAzureReplacementReadingsAcceptance>;
  const networks = new Map<string, Promise<Network>>(),
    replacements = new Map<string, Promise<Replacement>>();
  const replacementSessions = new Map<string, TerraformSession>();
  const network = async (sha: string, active?: AbortSignal) => {
    const plan = await source(sha, active);
    if (plan.intent.operation !== 'update-network') throw Error('Public network observation source differs');
    let opening = networks.get(sha);
    if (!opening) {
      opening = createAzureOperationalAcquisitionSession(
        plan,
        runtime,
        api,
        store,
        native,
        undefined,
        AbortSignal.any([...(signal ? [signal] : []), ...(active ? [active] : [])]),
      ).then(createAzureNetworkOperationalAcceptance);
      networks.set(sha, opening);
    }
    const acquired = await opening;
    seal();
    active?.throwIfAborted();
    return acquired;
  };
  const replacement = async (sha: string, current?: TerraformSession, active?: AbortSignal) => {
    const plan = await source(sha, active);
    if (plan.intent.operation !== 'replace-node' || !plan.terraformNetworkReplacementProfile)
      throw Error('Public replacement observation source differs');
    if (current && replacementSessions.has(sha) && replacementSessions.get(sha) !== current)
      throw Error('Public replacement acquisition session differs');
    let opening = replacements.get(sha);
    if (!opening) {
      opening = (async () => {
        const owning =
          current ?? (await terraform.open(binding.owner, await azureTerraformCurrentDeployment(plan), 'current'));
        seal();
        active?.throwIfAborted();
        replacementSessions.set(sha, owning);
        return createAzureReplacementReadingsAcceptance(
          await createAzureReplacementReadingsAcquisitionSession(
            plan,
            runtime,
            api,
            store,
            owning,
            { loaders, qualifyHistorical: qualifyNetwork, qualifyReplacementCompleted: qualifyReplacement },
            native,
            AbortSignal.any([...(signal ? [signal] : []), ...(active ? [active] : [])]),
          ),
        );
      })();
      replacements.set(sha, opening);
    }
    const acquired = await opening;
    seal();
    active?.throwIfAborted();
    if (current && replacementSessions.get(sha) !== current)
      throw Error('Public replacement acquisition session differs');
    return acquired;
  };
  const qualifyNetwork: AzureTerraformNetworkAcceptanceVerifier = async (receipt, identity, mode, active) =>
    (await network(identity.planSha256, active)).qualifyAcceptance(receipt, identity, mode, active);
  const qualifyReplacement: AzureTerraformNetworkReplacementCompletedVerifier = async (
    receipt,
    identity,
    mode,
    active,
  ) =>
    (await replacement(identity.planSha256, undefined, active)).qualifyCompletedOperational(
      receipt,
      identity,
      mode,
      active,
    );
  return Object.freeze({ network, replacement, qualifyNetwork, qualifyReplacement });
}

import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { observeAzureTerraformNetworkReplacementCurrent } from './terraform-network-replacement-current';
import { readAzureTerraformNetworkReplacementExecutionBinding } from './terraform-network-replacement-execution-journal';
import type { ReplacementCheckpoint } from './terraform-replacement';
import type { AzureCePlan } from './types';

type Current = Awaited<ReturnType<typeof observeAzureTerraformNetworkReplacementCurrent>>;
type Phase = Current['phase'];
export interface AzureTerraformNetworkReplacementOperationalIdentity {
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  journalSha256: string;
  sourceBindingSha256: string;
  configurationSha256: string;
  site: { siteUid: string; siteConfigurationSha256: string };
  phase: 'intact' | 'launched';
  nodes: Current['nodes'];
}
/** Private owning dependencies. Public execution must bind a qualified current generation observer;
 * historical network acceptance or registration alone cannot satisfy this operational contract. */
export interface AzureTerraformNetworkReplacementExecutionDependencies {
  loaders: AzureTerraformNetworkHistoryLoaders;
  site: AzureTerraformNetworkReplacementOperationalIdentity['site'];
  journalSha256: string;
  sourceBindingSha256: string;
  qualifyHistorical: AzureTerraformNetworkAcceptanceVerifier;
  collectOperational(
    identity: AzureTerraformNetworkReplacementOperationalIdentity,
    purpose: 'preflight' | 'final',
    signal?: AbortSignal,
  ): Promise<unknown>;
  qualifyCompletedOperational: AzureTerraformNetworkReplacementCompletedVerifier;
  qualifyOperational(
    receipt: unknown,
    identity: AzureTerraformNetworkReplacementOperationalIdentity,
    signal?: AbortSignal,
  ): Promise<{ status: 'verified'; scope: 'node-interfaces-routing-traffic'; evidenceSha256: string }>;
}
const same = canonicalEqual;
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure Terraform network replacement execution: ${message}`);
}

/** Fixed journal/source/full cloud identity enforcement used by the actual owning executor.
 * Initialization happened before entry under the same process lock; this reader never acquires it.
 * Operational callbacks are sealed by repeated fixed identity reads, never treated as cloud evidence. */
export async function openAzureTerraformNetworkReplacementExecution(
  request: AzureCePlan,
  store: CeDeploymentStore,
  session: TerraformSession,
  api: AzExecApi,
  dependencies: AzureTerraformNetworkReplacementExecutionDependencies,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    site = structuredClone(dependencies.site),
    journalSha256 = dependencies.journalSha256,
    sourceBindingSha256 = dependencies.sourceBindingSha256;
  require(typeof dependencies.collectOperational === 'function' &&
    typeof dependencies.qualifyOperational === 'function' &&
    typeof dependencies.qualifyCompletedOperational ===
      'function', 'owning current operational observer and verifier required');
  const deadline = signal ?? new AbortController().signal;
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    const operation = AbortSignal.any([AbortSignal.timeout(180000), deadline]);
    operation.throwIfAborted();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(operation.reason);
    operation.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      operation.throwIfAborted();
      return result;
    } finally {
      operation.removeEventListener('abort', onAbort);
    }
  };
  const unchanged = () =>
    require(same(request, plan) &&
      same(dependencies.site, site) &&
      dependencies.journalSha256 === journalSha256 &&
      dependencies.sourceBindingSha256 === sourceBindingSha256, 'owning execution request changed');
  const authenticate = async () => {
    unchanged();
    const qualified = await readAzureTerraformNetworkReplacementExecutionBinding(
      plan,
      store,
      dependencies.loaders,
      site,
      journalSha256,
      dependencies.qualifyHistorical,
      deadline,
      undefined,
      dependencies.qualifyCompletedOperational,
    );
    require(qualified.execution.journal.sourceBindingSha256 === sourceBindingSha256 &&
      qualified.source.sourceBindingSha256 === sourceBindingSha256, 'journal source-binding digest differs');
    unchanged();
    return qualified.source.binding;
  };
  const binding = await authenticate(),
    retainedPlan = structuredClone(await bounded(() => dependencies.loaders.loadSource(binding.retainedPlanSha256)));
  await authenticate();
  const verifyConfiguration = async (configurationSha256: string) => {
    require((await bounded(() => session.readConfigurationSha256?.() ?? Promise.resolve(undefined))) ===
      configurationSha256, 'current private configuration revision differs');
    require(digest(await bounded(() => session.readConfiguration(configurationSha256))) ===
      configurationSha256, 'current private configuration bytes differ');
  };
  const check = async (configurationSha256: string, phase: Phase, newVmId?: string) => {
    await authenticate();
    await verifyConfiguration(configurationSha256);
    const current = await observeAzureTerraformNetworkReplacementCurrent(
      { plan, retainedPlan, binding, sourceBindingSha256, phase, ...(newVmId !== undefined ? { newVmId } : {}) },
      api,
      deadline,
    );
    await verifyConfiguration(configurationSha256);
    await authenticate();
    await verifyConfiguration(configurationSha256);
    return current;
  };
  const compare = (
    source: string,
    state: Pick<
      ReplacementCheckpoint,
      'oldVmIds' | 'ownerPlanSha256ByNode' | 'retainedNics' | 'siteUid' | 'siteConfigurationSha256'
    >,
  ) => {
    const oldVmIds: Record<string, string> = {},
      ownerPlanSha256ByNode: Record<string, string> = {},
      retainedNics: ReplacementCheckpoint['retainedNics'] = {};
    for (const [node, vm] of Object.entries(binding.before.nodes)) {
      const name = `${plan.deploymentName}-${node}`;
      oldVmIds[name] = vm.vmId;
      ownerPlanSha256ByNode[name] = vm.ownerPlanSha256;
      for (const [index, nic] of Object.entries(vm.nics))
        retainedNics[`${node}:${index}`] = {
          resourceId: nic.resourceId,
          subnetId: nic.subnetId,
          mac: nic.mac,
          privateIp: nic.privateIp,
          ownerPlanSha256: nic.ownerPlanSha256,
        };
    }
    require(source === binding.source &&
      same(state, {
        oldVmIds,
        ownerPlanSha256ByNode,
        retainedNics,
        ...site,
      }), 'executor original source or full frozen identity projection differs');
  };
  const operational = async (
    configurationSha256: string,
    phase: 'intact' | 'launched',
    purpose: 'preflight' | 'final',
    newVmId?: string,
  ) => {
    const before = await check(configurationSha256, phase, newVmId);
    const identity: AzureTerraformNetworkReplacementOperationalIdentity = {
      owner: structuredClone(store.owner),
      planSha256: plan.planSha256,
      journalSha256,
      sourceBindingSha256,
      configurationSha256,
      site: structuredClone(site),
      phase,
      nodes: structuredClone(before.nodes),
    };
    let packet:
      | {
          receipt: unknown;
          verification: { status: 'verified'; scope: 'node-interfaces-routing-traffic'; evidenceSha256: string };
        }
      | undefined;
    try {
      const receipt = await bounded(() =>
        dependencies.collectOperational(structuredClone(identity), purpose, deadline),
      );
      const verification = await bounded(() =>
        dependencies.qualifyOperational(structuredClone(receipt), structuredClone(identity), deadline),
      );
      require(same(Object.keys(verification).sort(), ['evidenceSha256', 'scope', 'status']) &&
        verification.status === 'verified' &&
        verification.scope === 'node-interfaces-routing-traffic' &&
        typeof verification.evidenceSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(verification.evidenceSha256), 'complete current operational scope required');
      packet = { receipt: structuredClone(receipt), verification: structuredClone(verification) };
    } catch {
      deadline.throwIfAborted();
    }
    // Guard failures are outside the operational-unavailability catch and must reject execution.
    const after = await check(configurationSha256, phase, newVmId);
    require(same(before.nodes, after.nodes), 'current identities changed across operational collection');
    return packet ? { identity, ...packet } : undefined;
  };
  return {
    journalSha256,
    sourceBindingSha256,
    sourceConfigurationSha256: binding.sourceConfigurationSha256,
    check,
    compare,
    operational,
  };
}
export type AzureTerraformNetworkReplacementExecution = Awaited<
  ReturnType<typeof openAzureTerraformNetworkReplacementExecution>
>;

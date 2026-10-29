import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureNetworkUpdateInventory, captureAzureNetworkUpdateInventory } from './network-update';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import { qualifyAzureTerraformNetworkBoundReplacementSource } from './terraform-network-bound-replacement-source';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import { readAzureTerraformNetworkCompletionOne } from './terraform-network-completion-history';
import {
  type AzureTerraformNetworkHistoryLoaders,
  runAzureTerraformNetworkGenerationHistory,
} from './terraform-network-generation-history';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { observeAzureTerraformNetworkReplacementCurrent } from './terraform-network-replacement-current';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import {
  verifyAzureTerraformNetworkPhysicalState,
  verifyAzureTerraformNetworkUpdateState,
} from './terraform-network-update-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export interface AzureTerraformNetworkReplacementSourceBinding {
  schemaVersion: 1;
  kind: 'azure-terraform-network-replacement-original-source';
  engine: 'terraform';
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  originalPlanSha256: string;
  retainedPlanSha256: string;
  source: string;
  sourceConfigurationSha256: string;
  providerLockSha256: string;
  before: AzureNetworkUpdateInventory;
  outputs: Record<string, unknown>;
  site: { siteUid: string; siteConfigurationSha256: string };
  qualification: Awaited<ReturnType<typeof qualifyAzureTerraformNetworkBoundReplacementSource>>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network replacement source binding: ${message}`);
}

/** Structural identity only; callers must authenticate historical provenance separately. */
export function validateAzureTerraformNetworkReplacementBindingIdentity(
  plan: AzureCePlan,
  owner: CeDeploymentStore['owner'],
  retained: AzureCePlan,
  lock: string,
  site: { siteUid: string; siteConfigurationSha256: string },
  input: unknown,
): AzureTerraformNetworkReplacementSourceBinding {
  verifyAzureCePlan(plan);
  verifyAzureCePlan(retained);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require(retained.planSha256 === profile.retainedPlanSha256 &&
    same(owner, azureUpgradeBinding(plan).owner) &&
    same(owner, azureUpgradeBinding(retained).owner) &&
    lock === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'exact owning retained plan and qualified provider required');
  require(input && typeof input === 'object' && !Array.isArray(input), 'complete immutable source record required');
  const row = input as AzureTerraformNetworkReplacementSourceBinding;
  require(same(Object.keys(row).sort(), [
    'before',
    'engine',
    'kind',
    'originalPlanSha256',
    'outputs',
    'owner',
    'planSha256',
    'providerLockSha256',
    'qualification',
    'retainedPlanSha256',
    'schemaVersion',
    'site',
    'source',
    'sourceConfigurationSha256',
  ]) &&
    row.schemaVersion === 1 &&
    row.kind === 'azure-terraform-network-replacement-original-source' &&
    row.engine === 'terraform' &&
    same(row.owner, owner) &&
    row.planSha256 === plan.planSha256 &&
    row.originalPlanSha256 === profile.originalPlanSha256 &&
    row.retainedPlanSha256 === profile.retainedPlanSha256 &&
    row.providerLockSha256 === lock &&
    same(row.site, site) &&
    typeof row.source === 'string' &&
    hash(row.source) === row.sourceConfigurationSha256, 'saved source schema or identity differs');
  require(row.outputs &&
    typeof row.outputs === 'object' &&
    !Array.isArray(row.outputs) &&
    same(Object.keys(row.outputs).sort(), [
      'ce_instances',
      'ce_interfaces',
    ]), 'exact requested Terraform output schema required');
  require(row.qualification &&
    row.qualification.retainedInventorySha256 ===
      canonicalSha256(row.before), 'saved complete inventory differs from source qualification');
  if (retained.terraformNetworkReplacementProfile)
    verifyAzureTerraformNetworkPhysicalState(retained, row.before, row.outputs);
  else verifyAzureTerraformNetworkUpdateState(retained, row.before, row.outputs);
  return row;
}

/** Freeze private full inventory and predecessor bytes before enrollment or replacement stages.
 * Replay authenticates the original historical boundary without querying a selected VM which may
 * already be absent/replaced. Owning execution must separately check current stage and operational
 * evidence; this record never grants current operational acceptance or completion.
 */
export async function bindAzureTerraformNetworkReplacementSource(
  request: AzureCePlan,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner);
  verifyAzureCePlan(plan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require(same(owner, azureUpgradeBinding(plan).owner) &&
    Object.keys(site).sort().join(',') === 'siteConfigurationSha256,siteUid' &&
    typeof site.siteUid === 'string' &&
    site.siteUid &&
    typeof site.siteConfigurationSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(site.siteConfigurationSha256) &&
    typeof qualifyAcceptance === 'function', 'exact owning Terraform replacement and resolved site required');
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const optional = async (name: string): Promise<unknown | undefined> => {
    try {
      return await bounded(() => store.read(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  const verifyOwner = async () => {
    require(same(owner, store.owner) &&
      same(plan, request) &&
      same(site, siteRequest), 'requested identity changed during binding');
    await bounded(() => store.verify());
  };
  await verifyOwner();
  const deployment = await bounded(() => azureTerraformCurrentDeployment(plan)),
    lock = hash(deployment.providerLock);
  require(lock === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'qualified exact provider lock required');
  // Share the owning executor's exclusion. Acquire is atomic and must finish before cancellation
  // is observed, so a cancelled acquisition cannot leave an unowned late lock claim.
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-replacement-lock`);
  try {
    deadline.throwIfAborted();
    await verifyOwner();
    const packets = new Map<string, string>(),
      sources = new Map<string, string>(),
      outcomes = new Map<string, { plan: AzureCePlan; digest: string }>();
    const remember = (records: Map<string, string>, name: string, value: unknown) => {
      const digest = canonicalSha256(value);
      require(!records.has(name) || records.get(name) === digest, 'historical packet or source changed during binding');
      records.set(name, digest);
    };
    const readonlyStore = new Proxy(store, {
      get(target, key) {
        if (key === 'read')
          return async (name: string) => {
            const value = await bounded(() => store.read(name));
            remember(packets, name, value);
            return structuredClone(value);
          };
        if (key === 'verify') return verifyOwner;
        if (['write', 'remove', 'retire'].includes(String(key)))
          return () => {
            throw Error('Source qualification must not mutate storage');
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const tracked: AzureTerraformNetworkHistoryLoaders = {
      async loadSource(digest) {
        const value = await bounded(() => loaders.loadSource(digest));
        verifyAzureCePlan(value);
        require(value.planSha256 === digest, 'loaded predecessor digest differs');
        remember(sources, digest, value);
        return structuredClone(value);
      },
      async loadOutcome(p) {
        const value = await bounded(() => loaders.loadOutcome(structuredClone(p))),
          digest = canonicalSha256(value);
        require(!outcomes.has(p.planSha256) ||
          outcomes.get(p.planSha256)?.digest === digest, 'original outcome changed during binding');
        outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
        return structuredClone(value);
      },
    };
    const original = await tracked.loadSource(profile.originalPlanSha256),
      retained = await tracked.loadSource(profile.retainedPlanSha256);
    const previous = retained.terraformNetworkReplacementProfile
      ? (
          await bounded(() =>
            runAzureTerraformNetworkGenerationHistory(
              retained,
              readonlyStore,
              tracked,
              qualifyAcceptance,
              readAzureTerraformNetworkCompletionOne,
              undefined,
              deadline,
              replacementVerifier,
            ),
          )
        ).completion
      : undefined;
    if (retained.terraformNetworkReplacementProfile) require(previous, 'owning completed replacement required');
    const qualify = (source: string, inventory: AzureNetworkUpdateInventory) =>
      bounded(() =>
        qualifyAzureTerraformNetworkBoundReplacementSource(
          {
            plan,
            networkPlan: retained,
            originalPlan: original,
            source,
            inventory,
            providerLockSha256: lock,
            site,
          },
          readonlyStore,
          tracked,
          qualifyAcceptance,
          deadline,
          replacementVerifier,
          previous,
        ),
      );
    const name = `${plan.planId}-terraform-network-replacement-source.json`;
    const recheck = async () => {
      await verifyOwner();
      for (const [name, digest] of sources)
        require(canonicalSha256(await bounded(() => loaders.loadSource(name))) ===
          digest, 'predecessor source changed before binding');
      for (const { plan: p, digest } of outcomes.values())
        require(canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(p)))) ===
          digest, 'original outcome changed before binding');
      for (const [packetName, digest] of packets)
        require(canonicalSha256(await bounded(() => store.read(packetName))) ===
          digest, 'historical packet changed before source binding');
      await verifyOwner();
      // Seal the owning root after external callbacks and every historical packet check.
      const bindingDigest = packets.get(name);
      if (bindingDigest !== undefined)
        require(canonicalSha256(await bounded(() => store.read(name))) ===
          bindingDigest, 'owning binding changed at final preparation boundary');
    };
    const verifyOutputs = (inventory: AzureNetworkUpdateInventory, outputs: Record<string, unknown>) => {
      require(outputs &&
        typeof outputs === 'object' &&
        !Array.isArray(outputs) &&
        same(Object.keys(outputs).sort(), [
          'ce_instances',
          'ce_interfaces',
        ]), 'exact requested Terraform output schema required');
      if (retained.terraformNetworkReplacementProfile)
        verifyAzureTerraformNetworkPhysicalState(retained, inventory, outputs);
      else verifyAzureTerraformNetworkUpdateState(retained, inventory, outputs);
    };
    const validate = async (input: unknown) => {
      const row = validateAzureTerraformNetworkReplacementBindingIdentity(plan, owner, retained, lock, site, input);
      require(same(
        row.qualification,
        await qualify(row.source, row.before),
      ), 'saved predecessor qualification differs');
      return row;
    };
    const saved = await optional(name);
    if (saved !== undefined) {
      remember(packets, name, saved);
      const binding = await validate(saved);
      const session = await bounded(() => terraform.open(owner, deployment, 'current'));
      await recheck();
      return { session, binding };
    }
    const token = `${plan.deploymentName.slice(0, 40)}-${plan.intent.replacementNode}-${plan.planSha256.slice(0, 12)}`;
    const laterNames = [
      `${plan.planId}-terraform-network-replacement-execution.json`,
      `${plan.planId}-terraform-replacement.json`,
      `${plan.planId}-terraform-replacement-source.json`,
      `${plan.planId}-terraform-quiesce-plan.json`,
      `${plan.planId}-terraform-launch-plan.json`,
      `${plan.planId}-terraform-quiesce-recovery.json`,
      `${plan.planId}-terraform-launch-recovery.json`,
      `${plan.planId}-terraform-replacement-final-plan.json`,
      `${plan.planId}-terraform-network-replacement-complete.json`,
      `${plan.planId}-terraform-replacement-registration.json`,
      `${token}.json`,
    ];
    const noLater = async () => {
      for (const later of laterNames)
        require((await optional(later)) ===
          undefined, 'original binding missing after enrollment or stage publication');
    };
    await noLater();
    const session = await bounded(() => terraform.open(owner, deployment, 'current'));
    const readRevision = session.readConfigurationSha256?.bind(session);
    require(readRevision, 'owning current configuration capability required');
    const revision = await bounded(readRevision);
    require(typeof revision === 'string' &&
      /^[a-f0-9]{64}$/.test(revision), 'resolved current private source revision required');
    const source = await bounded(() => session.readConfiguration(revision));
    require(typeof source === 'string' && hash(source) === revision, 'current private source bytes differ');
    const boundedApi: AzExecApi = { exec: (...args) => bounded(() => api.exec(...args)) };
    const capture = async (): Promise<AzureNetworkUpdateInventory> => {
      if (!retained.terraformNetworkReplacementProfile)
        return captureAzureNetworkUpdateInventory(retained, boundedApi, deadline);
      require(previous?.kind ===
        'azure-terraform-network-replacement-completion-history', 'distinct completed replacement required');
      const raw = await bounded(() =>
        readonlyStore.read(`${retained.planId}-terraform-network-replacement-source.json`),
      );
      require(canonicalSha256(raw) ===
        previous.sourceBindingSha256, 'owning predecessor source-binding digest differs');
      const predecessorBinding = raw as AzureTerraformNetworkReplacementSourceBinding;
      const predecessorRetained = await tracked.loadSource(
        verifyAzureTerraformNetworkReplacementProfile(retained).retainedPlanSha256,
      );
      const current = await observeAzureTerraformNetworkReplacementCurrent(
        {
          plan: retained,
          retainedPlan: predecessorRetained,
          binding: predecessorBinding,
          sourceBindingSha256: previous.sourceBindingSha256,
          phase: 'launched',
          newVmId: previous.nodes[String(retained.intent.replacementNode)].vmId ?? undefined,
        },
        boundedApi,
        deadline,
      );
      return {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: retained.planSha256,
        collectedAt: current.collectedAt,
        nodes: Object.fromEntries(
          Object.entries(current.nodes).map(([node, vm]) => {
            require(vm.vmState === 'present' &&
              vm.vmId &&
              vm.ownerPlanSha256, 'complete current replacement physical vector required');
            const { vmState: _state, nics, ...identity } = vm;
            return [
              node,
              {
                ...identity,
                vmId: vm.vmId,
                ownerPlanSha256: vm.ownerPlanSha256,
                nics: Object.fromEntries(
                  Object.entries(nics).map(([index, nic]) => {
                    const { attachment: _attachment, ...physical } = nic;
                    return [index, physical];
                  }),
                ),
              },
            ];
          }),
        ),
      };
    };
    const before = await capture(),
      outputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, deadline));
    verifyOutputs(before, outputs);
    const qualification = await qualify(source, before);
    const binding: AzureTerraformNetworkReplacementSourceBinding = {
      schemaVersion: 1,
      kind: 'azure-terraform-network-replacement-original-source',
      engine: 'terraform',
      owner,
      planSha256: plan.planSha256,
      originalPlanSha256: profile.originalPlanSha256,
      retainedPlanSha256: profile.retainedPlanSha256,
      source,
      sourceConfigurationSha256: revision,
      providerLockSha256: lock,
      before,
      outputs,
      site,
      qualification,
    };
    // Collection times differ; all physical identities and values must remain exact across this read.
    const current = await capture(),
      currentOutputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, deadline));
    verifyOutputs(current, currentOutputs);
    require(same(current.nodes, before.nodes) &&
      same(currentOutputs, outputs), 'full current inventory or outputs changed during binding');
    await validate(binding);
    require((await bounded(readRevision)) === revision &&
      (await bounded(() => session.readConfiguration(revision))) ===
        source, 'private source changed before publication');
    await noLater();
    require((await optional(name)) === undefined, 'original source appeared during binding');
    await recheck();
    // Provenance loaders may publish later-stage evidence; reject it before freezing a source.
    await noLater();
    require((await optional(name)) === undefined, 'original source appeared during final binding recheck');
    await bounded(() => store.write(name, binding));
    remember(packets, name, binding);
    await recheck();
    return { session, binding };
  } finally {
    await unlock();
  }
}

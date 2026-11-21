import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  captureAzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
} from './network-update';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import { qualifyAzureTerraformNetworkGenerationSource } from './terraform-network-completion-history';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { verifyAzureTerraformNetworkUpdateState } from './terraform-network-update-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export interface AzureTerraformNetworkSourceBinding {
  schemaVersion: 1;
  kind: 'azure-terraform-network-original-source';
  engine: 'terraform';
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  source: string;
  sourceConfigurationSha256: string;
  providerLockSha256: string;
  before: AzureNetworkUpdateInventory;
  outputs: Record<string, unknown>;
  qualification: Awaited<ReturnType<typeof qualifyAzureTerraformNetworkGenerationSource>>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network source binding: ${message}`);
}

/** Freeze the original source before serial execution; enrollment material stays in owning private storage.
 * Replays validate historical provenance without querying consumed journals or treating saved inventory as current.
 * The serial driver must independently qualify each current revision, UUID/NIC boundary and operational gate.
 */
export async function bindAzureTerraformNetworkUpdateSource(
  request: AzureCePlan,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  loaders: {
    loadSource(digest: string): Promise<AzureCePlan>;
    loadOutcome(source: AzureCePlan): Promise<Record<string, unknown>>;
  },
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  signal?: AbortSignal,
  qualifyAcceptance?: AzureTerraformNetworkAcceptanceVerifier,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  signal = deadline;
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner);
  const sourceLoader = loaders.loadSource,
    outcomeLoader = loaders.loadOutcome;
  const open = terraform.open,
    execute = api.exec;
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
  const context = () =>
    require(same(plan, request) &&
      same(site, siteRequest) &&
      same(owner, store.owner) &&
      loaders.loadSource === sourceLoader &&
      loaders.loadOutcome === outcomeLoader &&
      terraform.open === open &&
      api.exec === execute, 'requested identity or loader changed during binding');
  const verifyOwner = async () => {
    context();
    await bounded(() => store.verify());
    context();
  };
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    same(owner, azureUpgradeBinding(plan).owner), 'exact owning Terraform network intent required');
  await verifyOwner();
  const deployment = await bounded(() => azureTerraformCurrentDeployment(plan)),
    lock = hash(deployment.providerLock);
  require(lock === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'qualified provider lock required');
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-source-lock`);
  try {
    signal?.throwIfAborted();
    await verifyOwner();
    const name = `${plan.planId}-terraform-network-source.json`;
    const packets = new Map<string, string>(),
      sources = new Map<string, string>(),
      outcomes = new Map<string, { plan: AzureCePlan; digest: string }>(),
      absent = new Set<string>();
    const remember = (records: Map<string, string>, name: string, value: unknown) => {
      const digest = canonicalSha256(value);
      require(!records.has(name) || records.get(name) === digest, 'historical source or packet changed during binding');
      records.set(name, digest);
    };
    const optional = async (_store: CeDeploymentStore, item: string): Promise<unknown | undefined> => {
      try {
        const value = await bounded(() => store.read(item));
        require(!absent.has(item), 'missing artifact appeared during source binding');
        remember(packets, item, value);
        return structuredClone(value);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        require(!packets.has(item), 'historical artifact disappeared during binding');
        absent.add(item);
      }
    };
    const readonlyStore = new Proxy(store, {
      get(target, key) {
        if (key === 'verify') return verifyOwner;
        if (key === 'read')
          return async (item: string) => {
            const value = await bounded(() => store.read(item));
            remember(packets, item, value);
            return structuredClone(value);
          };
        if (['write', 'remove', 'retire'].includes(String(key)))
          return () => {
            throw Error('Source qualification must not mutate storage');
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const tracked = {
      async loadSource(digest: string) {
        context();
        const value = await bounded(() => sourceLoader.call(loaders, digest));
        verifyAzureCePlan(value);
        require(value.planSha256 === digest, 'predecessor source digest differs');
        remember(sources, digest, value);
        return structuredClone(value);
      },
      async loadOutcome(p: AzureCePlan) {
        context();
        const value = await bounded(() => outcomeLoader.call(loaders, structuredClone(p))),
          digest = canonicalSha256(value);
        require(!outcomes.has(p.planSha256) ||
          outcomes.get(p.planSha256)?.digest === digest, 'predecessor outcome changed during binding');
        outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
        return structuredClone(value);
      },
    };
    const recheck = async () => {
      await verifyOwner();
      for (const [digest, expected] of sources)
        require(canonicalSha256(await bounded(() => sourceLoader.call(loaders, digest))) ===
          expected, 'predecessor source changed before binding');
      for (const { plan: p, digest } of outcomes.values())
        require(canonicalSha256(await bounded(() => outcomeLoader.call(loaders, structuredClone(p)))) ===
          digest, 'predecessor outcome changed before binding');
      for (const [item, digest] of packets)
        require(canonicalSha256(await bounded(() => store.read(item))) ===
          digest, 'historical packet changed before binding');
      for (const item of absent) {
        try {
          await bounded(() => store.read(item));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        throw Error('Azure Terraform network source binding: missing artifact appeared during source binding');
      }
      await verifyOwner();
      if (packets.has(name))
        require(canonicalSha256(await bounded(() => store.read(name))) ===
          packets.get(name), 'owning source root changed at final boundary');
      context();
    };
    const qualify = (source: string, before: AzureNetworkUpdateInventory) =>
      qualifyAzureTerraformNetworkGenerationSource(
        plan,
        source,
        before,
        readonlyStore,
        tracked,
        lock,
        site,
        qualifyAcceptance,
        signal,
        replacementVerifier,
      );
    const validate = async (input: unknown) => {
      require(input && typeof input === 'object' && !Array.isArray(input), 'complete saved binding required');
      const row = input as AzureTerraformNetworkSourceBinding;
      require(same(Object.keys(row).sort(), [
        'before',
        'engine',
        'kind',
        'outputs',
        'owner',
        'planSha256',
        'providerLockSha256',
        'qualification',
        'schemaVersion',
        'source',
        'sourceConfigurationSha256',
      ]) &&
        row.schemaVersion === 1 &&
        row.kind === 'azure-terraform-network-original-source' &&
        row.engine === 'terraform' &&
        same(row.owner, store.owner) &&
        row.planSha256 === plan.planSha256 &&
        row.providerLockSha256 === lock &&
        typeof row.source === 'string' &&
        hash(row.source) === row.sourceConfigurationSha256, 'saved source identity or schema differs');
      validateAzureNetworkUpdateInventory(plan, row.before);
      verifyAzureTerraformNetworkUpdateState(plan, row.before, row.outputs);
      require(same(row.qualification, await qualify(row.source, row.before)), 'saved source qualification changed');
      signal?.throwIfAborted();
      await verifyOwner();
      return structuredClone(row);
    };
    const saved = await optional(store, name);
    if (saved !== undefined) {
      const binding = await validate(saved);
      signal?.throwIfAborted();
      const session = await bounded(() => open.call(terraform, owner, deployment, 'current'));
      signal?.throwIfAborted();
      await recheck();
      return { session, binding };
    }
    // An absent original snapshot cannot be reconstructed from a later public/stage boundary.
    const laterNames = [
      `${plan.planId}-terraform-network-driver-checkpoint.json`,
      `${plan.planId}-terraform-network-driver-root.json`,
      `${plan.planId}-terraform-network-driver-current-final.json`,
      `${plan.planId}-terraform-network-driver-complete.json`,
    ];
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const prefix = `${plan.planId}-terraform-network-node-${node}`;
      for (const suffix of [
        'preflight',
        'prepared',
        'nic-binding',
        'mutation-plan',
        'mutation-outcome',
        'mutation-complete',
        'final-plan',
        'current-no-change-plan',
      ])
        laterNames.push(`${prefix}-${suffix}.json`);
      laterNames.push(`${prefix}-routing-prepared.json`);
      for (const operation of ['deallocate', 'start', 'routing'])
        for (const suffix of [
          'mutation-plan',
          'mutation-binding',
          'mutation-outcome',
          'mutation-complete',
          'release-plan',
          'release-binding',
          'release-outcome',
          'release-complete',
          'final-plan',
          'current-no-change-plan',
        ])
          laterNames.push(`${prefix}-${operation}-${suffix}.json`);
    }
    for (const later of laterNames)
      require((await optional(store, later)) === undefined, 'original source missing after stage publication');
    signal?.throwIfAborted();
    const session = await bounded(() => open.call(terraform, owner, deployment, 'current'));
    const readRevision = session.readConfigurationSha256?.bind(session);
    require(readRevision, 'current private configuration capability required');
    const sourceConfigurationSha256 = await bounded(readRevision);
    require(typeof sourceConfigurationSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(sourceConfigurationSha256), 'resolved private source revision required');
    const source = await bounded(() => session.readConfiguration(sourceConfigurationSha256));
    require(typeof source === 'string' && hash(source) === sourceConfigurationSha256, 'private source bytes differ');
    const before = await captureAzureNetworkUpdateInventory(
        plan,
        { exec: (...args) => bounded(() => execute.call(api, ...args)) },
        signal,
      ),
      outputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal));
    verifyAzureTerraformNetworkUpdateState(plan, before, outputs);
    const qualification = await qualify(source, before);
    const binding: AzureTerraformNetworkSourceBinding = {
      schemaVersion: 1,
      kind: 'azure-terraform-network-original-source',
      engine: 'terraform',
      owner,
      planSha256: plan.planSha256,
      source,
      sourceConfigurationSha256,
      providerLockSha256: lock,
      before,
      outputs,
      qualification,
    };
    // Recheck independent cloud/output/configuration identities after the full provenance read.
    const current = await captureAzureNetworkUpdateInventory(
        plan,
        { exec: (...args) => bounded(() => execute.call(api, ...args)) },
        signal,
      ),
      currentOutputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal));
    verifyAzureTerraformNetworkUpdateState(plan, current, currentOutputs);
    require(same(current.nodes, before.nodes) &&
      same(currentOutputs, outputs) &&
      (await bounded(readRevision)) === sourceConfigurationSha256, 'source boundary changed during qualification');
    await validate(binding);
    signal?.throwIfAborted();
    require((await bounded(readRevision)) === sourceConfigurationSha256, 'source changed before publication');
    const privateUnchanged = async () => {
      require((await bounded(readRevision)) === sourceConfigurationSha256 &&
        (await bounded(() => session.readConfiguration(sourceConfigurationSha256))) ===
          source, 'private source bytes changed at final publication boundary');
      await verifyOwner();
      if (packets.has(name))
        require(canonicalSha256(await bounded(() => store.read(name))) ===
          packets.get(name), 'owning source root changed after private read');
      context();
    };
    await recheck();
    await privateUnchanged();
    await bounded(() => store.write(name, structuredClone(binding)));
    absent.delete(name);
    remember(packets, name, binding);
    await recheck();
    await privateUnchanged();
    signal?.throwIfAborted();
    return { session, binding };
  } finally {
    await unlock();
  }
}

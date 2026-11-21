import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import { qualifyAzureTerraformNetworkBoundReplacementSource } from './terraform-network-bound-replacement-source';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type {
  AzureTerraformNetworkCompletedGeneration,
  AzureTerraformNetworkHistoryLoaders,
} from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import {
  type AzureTerraformNetworkReplacementSourceBinding,
  validateAzureTerraformNetworkReplacementBindingIdentity,
} from './terraform-network-replacement-source-binding';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network replacement binding reader: ${message}`);
}

/** Owning private historical reader, including while the executor holds its process lock.
 * Expected digest comes from the owning execution journal or the just-prepared binding, never
 * public acknowledgment. No Terraform session, cloud observation, enrollment or mutation is
 * performed; the full private source must not be returned from a public tool. Current stage,
 * bootstrap, VM/NIC and operational acceptance remain independent executor responsibilities.
 */
export async function readAzureTerraformNetworkReplacementSourceBinding(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  expectedSourceBindingSha256: string,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  qualifiedPrevious?: AzureTerraformNetworkCompletedGeneration,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  owningRead?: (
    binding: AzureTerraformNetworkReplacementSourceBinding,
    readonlyStore: CeDeploymentStore,
  ) => Promise<void>,
): Promise<{
  schemaVersion: 1;
  kind: 'azure-terraform-network-replacement-binding-read';
  sourceBindingSha256: string;
  binding: AzureTerraformNetworkReplacementSourceBinding;
  currentOperationalAcceptanceQualified: false;
}> {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(siteRequest);
  verifyAzureCePlan(plan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require(typeof expectedSourceBindingSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(expectedSourceBindingSha256) &&
    same(owner, azureUpgradeBinding(plan).owner) &&
    typeof verifier === 'function' &&
    site &&
    Object.keys(site).sort().join(',') === 'siteConfigurationSha256,siteUid' &&
    typeof site.siteUid === 'string' &&
    site.siteUid &&
    typeof site.siteConfigurationSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(
      site.siteConfigurationSha256,
    ), 'resolved owning plan, site and source-binding digest required');
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const verifyOwner = async () => {
    require(same(plan, request) &&
      same(site, siteRequest) &&
      same(owner, store.owner), 'requested identity changed during reading');
    await bounded(() => store.verify());
  };
  await verifyOwner();
  const packets = new Map<string, string>(),
    sources = new Map<string, string>(),
    outcomes = new Map<string, { plan: AzureCePlan; digest: string }>();
  const remember = (map: Map<string, string>, name: string, value: unknown) => {
    const digest = canonicalSha256(value);
    require(!map.has(name) || map.get(name) === digest, 'source or historical packet changed during reading');
    map.set(name, digest);
  };
  const read = async (name: string) => {
    const value = await bounded(() => store.read(name));
    remember(packets, name, value);
    return structuredClone(value);
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return verifyOwner;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Binding reader must not mutate storage');
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
        outcomes.get(p.planSha256)?.digest === digest, 'original outcome changed during reading');
      outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
      return structuredClone(value);
    },
  };
  const original = await tracked.loadSource(profile.originalPlanSha256),
    retained = await tracked.loadSource(profile.retainedPlanSha256);
  const deployment = await bounded(() => azureTerraformCurrentDeployment(plan)),
    lock = createHash('sha256').update(deployment.providerLock).digest('hex');
  const raw = await read(`${plan.planId}-terraform-network-replacement-source.json`);
  require(canonicalSha256(raw) === expectedSourceBindingSha256, 'saved binding differs from owning journal digest');
  const binding = validateAzureTerraformNetworkReplacementBindingIdentity(plan, owner, retained, lock, site, raw);
  const qualification = await bounded(() =>
    qualifyAzureTerraformNetworkBoundReplacementSource(
      {
        plan,
        originalPlan: original,
        networkPlan: retained,
        source: binding.source,
        inventory: binding.before,
        providerLockSha256: lock,
        site,
      },
      readonlyStore,
      tracked,
      verifier,
      deadline,
      replacementVerifier,
      qualifiedPrevious,
    ),
  );
  require(same(binding.qualification, qualification), 'saved source qualification differs');
  // Include the owning journal read in this qualification span. Its reads join the
  // tracked packets, and every source/outcome/packet seal runs after its callbacks.
  // This performs no caching or qualification reuse across execution boundaries.
  if (owningRead) await bounded(() => owningRead(structuredClone(binding), readonlyStore));
  for (const [name, digest] of sources)
    require(canonicalSha256(await bounded(() => loaders.loadSource(name))) ===
      digest, 'predecessor source changed before returning binding');
  for (const { plan: p, digest } of outcomes.values())
    require(canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(p)))) ===
      digest, 'original outcome changed before returning binding');
  for (const [name, digest] of packets)
    require(canonicalSha256(await bounded(() => store.read(name))) ===
      digest, 'historical packet changed before returning binding');
  await verifyOwner();
  // External loaders run before persisted packet rechecks. Seal the owning root last across
  // the entire read, including provider/site/owner verification and every historical packet.
  require(canonicalSha256(
    await bounded(() => store.read(`${plan.planId}-terraform-network-replacement-source.json`)),
  ) === expectedSourceBindingSha256, 'owning binding changed at final read boundary');
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-replacement-binding-read',
    sourceBindingSha256: expectedSourceBindingSha256,
    binding: structuredClone(binding),
    currentOperationalAcceptanceQualified: false,
  };
}

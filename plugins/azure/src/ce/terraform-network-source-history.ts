import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { validateAzureNetworkUpdateInventory } from './network-update';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import { qualifyAzureTerraformNetworkGenerationSource } from './terraform-network-completion-history';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import type { AzureTerraformNetworkSourceBinding } from './terraform-network-source-binding';
import { verifyAzureTerraformNetworkUpdateState } from './terraform-network-update-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network source history: ${message}`);
}

/** Private read-only original-source qualification. The returned binding contains enrollment
 * material and must never be returned by public tools. Serial packets, current operational
 * acceptance and independent terminal absence/runner retirement remain separate contracts.
 */
export async function readAzureTerraformNetworkSourceHistory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory,
    read = store.read,
    verify = store.verify,
    loadSource = loaders.loadSource,
    loadOutcome = loaders.loadOutcome;
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    same(owner, azureUpgradeBinding(plan).owner) &&
    typeof verifier === 'function' &&
    same(Object.keys(site).sort(), ['siteConfigurationSha256', 'siteUid']) &&
    typeof site.siteUid === 'string' &&
    !!site.siteUid &&
    /^[a-f0-9]{64}$/.test(site.siteConfigurationSha256), 'exact original owning network and site binding required');
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const unchanged = () =>
    require(same(request, plan) &&
      same(siteRequest, site) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      store.read === read &&
      store.verify === verify &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome ===
        loadOutcome, 'request, owner, storage or loaders changed during historical qualification');
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verify.call(store));
  const packetSha256ByName: Record<string, string> = {},
    sources = new Map<string, string>(),
    outcomes = new Map<string, { plan: AzureCePlan; digest: string }>();
  const trackedRead = async (name: string) => {
    const value = await bounded(() => read.call(store, name)),
      digest = canonicalSha256(value);
    require(packetSha256ByName[name] === undefined ||
      packetSha256ByName[name] === digest, 'packet changed between history reads');
    packetSha256ByName[name] = digest;
    return structuredClone(value);
  };
  const trackedVerify = () => bounded(() => verify.call(store));
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return trackedRead;
      if (key === 'verify') return trackedVerify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Historical source qualification must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const trackedLoaders: AzureTerraformNetworkHistoryLoaders = {
    async loadSource(digest) {
      const value = await bounded(() => loadSource.call(loaders, digest));
      verifyAzureCePlan(value);
      const actual = canonicalSha256(value);
      require(value.planSha256 === digest &&
        (!sources.has(digest) ||
          sources.get(digest) === actual), 'predecessor source changed or declared digest differs');
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(source) {
      const value = await bounded(() => loadOutcome.call(loaders, structuredClone(source))),
        digest = canonicalSha256(value);
      require(!outcomes.has(source.planSha256) ||
        outcomes.get(source.planSha256)?.digest === digest, 'predecessor outcome changed between reads');
      outcomes.set(source.planSha256, { plan: structuredClone(source), digest });
      return structuredClone(value);
    },
  };
  const name = `${plan.planId}-terraform-network-source.json`;
  const input = await trackedRead(name);
  require(input && typeof input === 'object' && !Array.isArray(input), 'original source packet unavailable');
  const binding = input as AzureTerraformNetworkSourceBinding;
  require(same(Object.keys(binding).sort(), [
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
    binding.schemaVersion === 1 &&
    binding.engine === 'terraform' &&
    binding.kind === 'azure-terraform-network-original-source' &&
    same(binding.owner, owner) &&
    binding.planSha256 === plan.planSha256 &&
    binding.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
    typeof binding.source === 'string' &&
    hash(binding.source) ===
      binding.sourceConfigurationSha256, 'original source packet identity, schema or bytes differ');
  validateAzureNetworkUpdateInventory(plan, binding.before);
  verifyAzureTerraformNetworkUpdateState(plan, binding.before, binding.outputs);
  const historical: AzureTerraformNetworkAcceptanceVerifier = (receipt, identity, mode) => {
    require(mode === 'historical', 'original-source history cannot request current acceptance');
    return bounded(() => verifier(structuredClone(receipt), structuredClone(identity), mode, deadline));
  };
  const qualification = await bounded(() =>
    qualifyAzureTerraformNetworkGenerationSource(
      plan,
      binding.source,
      binding.before,
      readonlyStore,
      trackedLoaders,
      binding.providerLockSha256,
      site,
      historical,
      deadline,
      replacementVerifier,
    ),
  );
  require(same(
    binding.qualification,
    qualification,
  ), 'original source qualification differs from owning generation history');
  for (const [digest, expected] of sources)
    require(canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) ===
      expected, 'predecessor source changed before final history boundary');
  for (const { plan: source, digest } of outcomes.values())
    require(canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(source)))) ===
      digest, 'predecessor outcome changed before final history boundary');
  for (const [packet, digest] of Object.entries(packetSha256ByName))
    require(canonicalSha256(await bounded(() => read.call(store, packet))) ===
      digest, 'packet changed before final history boundary');
  await bounded(() => verify.call(store));
  require(canonicalSha256(await bounded(() => read.call(store, name))) ===
    packetSha256ByName[name], 'original source root changed at final boundary');
  return {
    schemaVersion: 1 as const,
    scope: 'original-network-source-history' as const,
    binding: structuredClone(binding),
    packetSha256ByName,
    currentOperationalAcceptanceQualified: false as const,
    retirementQualified: false as const,
  };
}

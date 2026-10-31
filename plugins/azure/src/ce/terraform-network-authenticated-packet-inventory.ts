import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from './terraform-network-replacement-receipt-provenance';
import { readAzureTerraformNetworkRetirementGraph } from './terraform-network-retirement-graph';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const identity = (stat: { dev: number; ino: number; birthtimeMs: number }) =>
  `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure authenticated network packet inventory: ${message}`);
}
export interface AzureTerraformNetworkPacketInventoryContext {
  loaders: AzureTerraformNetworkHistoryLoaders;
  site: { siteUid: string; siteConfigurationSha256: string };
  verifier: AzureTerraformNetworkAcceptanceVerifier;
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier;
}
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkPacketInventoryContext;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();

/** Read-only packet provenance for future parent enrollment. Only records consumed by the
 * owning graph or completed-replacement reader are authenticated. A matching filename or
 * presence in the native root snapshot does not authorize a record. No child, main, parent,
 * cloud, installed or operational acceptance, command, deletion or publication is granted.
 */
export async function readAzureTerraformNetworkAuthenticatedPacketInventory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkPacketInventoryContext,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    site = structuredClone(context.site),
    { loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, plan) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      same(context.site, site) &&
      context.loaders === loaders &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
  };
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  require(plan.engine === 'terraform' &&
    same(azureUpgradeBinding(plan).owner, owner) &&
    !!(
      plan.terraformNetworkProfile || plan.terraformNetworkReplacementProfile
    ), 'exact owning network request required');
  await step(() => store.verify());
  const snapshot = async (parent?: AbortSignal) => {
    const before = await step(() => lstat(directory), parent);
    require(before.isDirectory() &&
      !before.isSymbolicLink() &&
      before.uid === process.getuid?.() &&
      (before.mode & 0o077) === 0 &&
      (await step(() => realpath(directory), parent)) === directory, 'private root ownership differs');
    const names = (await step(() => readdir(directory), parent)).sort();
    const packets: Record<string, { identity: string; bytesSha256: string; packetSha256: string }> = {};
    for (const name of names.filter((name) => name.endsWith('.json'))) {
      require(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'private root packet filename differs');
      const path = join(directory, name),
        handle = await step(() => open(path, constants.O_RDONLY | constants.O_NOFOLLOW), parent);
      try {
        const first = await step(() => handle.stat(), parent),
          bytes = await step(() => handle.readFile(), parent),
          last = await step(() => handle.stat(), parent),
          named = await step(() => lstat(path), parent);
        require(first.isFile() &&
          first.uid === process.getuid?.() &&
          first.nlink === 1 &&
          (first.mode & 0o077) === 0 &&
          identity(first) === identity(last) &&
          first.size === last.size &&
          first.mtimeMs === last.mtimeMs &&
          first.ctimeMs === last.ctimeMs &&
          named.isFile() &&
          !named.isSymbolicLink() &&
          identity(named) === identity(first) &&
          named.uid === first.uid &&
          named.nlink === 1 &&
          (named.mode & 0o077) === 0, 'native packet custody differs');
        let logical: unknown;
        try {
          logical = JSON.parse(bytes.toString());
        } catch {
          throw Error('Azure authenticated network packet inventory: malformed native packet');
        }
        packets[name] = { identity: identity(first), bytesSha256: hash(bytes), packetSha256: canonicalSha256(logical) };
      } finally {
        await handle.close();
      }
    }
    const after = await step(() => lstat(directory), parent);
    require(after.isDirectory() &&
      !after.isSymbolicLink() &&
      identity(after) === identity(before) &&
      after.uid === before.uid &&
      (after.mode & 0o077) === 0 &&
      same((await step(() => readdir(directory), parent)).sort(), names), 'native namespace changed during collection');
    return { identity: identity(before), names, packets };
  };
  const original = await snapshot();
  const inspect = async (parent?: AbortSignal) => {
    require(same(await snapshot(parent), original), 'native packet bytes, inode or namespace changed');
    const consumed = new Map<string, string>(),
      absent = new Set<string>();
    const read = async (name: string) => {
      require(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'owning reader requested a foreign packet path');
      let value: unknown;
      try {
        value = await step(() => store.read(name), parent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        require(!original.packets[name] && !consumed.has(name), 'logical absence differs from native publication');
        absent.add(name);
        throw error;
      }
      const digest = canonicalSha256(value),
        native = original.packets[name];
      require(native &&
        !absent.has(name) &&
        native.packetSha256 === digest &&
        (!consumed.has(name) || consumed.get(name) === digest), 'semantic packet differs from native publication');
      consumed.set(name, digest);
      return structuredClone(value);
    };
    const verify = () => step(() => store.verify(), parent);
    const rejectMutation = () => {
      throw Error('Authenticated packet inventory must not mutate storage');
    };
    const methods = new Map<PropertyKey, { value: unknown; bound: unknown }>();
    const readonlyStore = new Proxy(store, {
      get(target, key) {
        if (key === 'read') return read;
        if (key === 'verify') return verify;
        if (['write', 'remove', 'retire'].includes(String(key))) return rejectMutation;
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        const cached = methods.get(key);
        if (cached && cached.value === value) return cached.bound;
        const bound = value.bind(target);
        methods.set(key, { value, bound });
        return bound;
      },
    });
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    let provenance: unknown;
    if (plan.terraformNetworkReplacementProfile) {
      require(replacementVerifier, 'owning completed-replacement verifier required');
      provenance = await step(
        () =>
          readAzureTerraformNetworkReplacementReceiptProvenance(
            plan,
            readonlyStore,
            loaders,
            site,
            verifier,
            replacementVerifier,
            active,
          ),
        parent,
      );
    } else {
      provenance = await step(
        () =>
          readAzureTerraformNetworkRetirementGraph(
            plan,
            readonlyStore,
            loaders,
            site,
            verifier,
            active,
            replacementVerifier,
          ),
        parent,
      );
    }
    require(consumed.size > 0, 'owning reader consumed no authenticated packets');
    require(same(
      await snapshot(parent),
      original,
    ), 'native packet bytes, inode or namespace changed across authentication');
    await step(() => store.verify(), parent);
    return {
      provenanceSha256: canonicalSha256(provenance),
      packets: [...consumed.keys()].sort().map((name) => {
        const native = original.packets[name];
        require(native, 'consumed native packet missing');
        return { name, ...native };
      }),
      absentPackets: [...absent].sort(),
    };
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1 as const,
    scope: 'authenticated-network-parent-enrollment-packet-inventory' as const,
    owner,
    site,
    sourcePlanSha256: plan.planSha256,
    kind: plan.terraformNetworkReplacementProfile ? ('completed-replacement' as const) : ('network-graph' as const),
    rootIdentity: original.identity,
    nativeRootSnapshotSha256: canonicalSha256(original),
    namespaceNames: original.names,
    ...first,
    unconsumedRootPackets: Object.keys(original.packets)
      .filter((name) => !first.packets.some((packet) => packet.name === name))
      .sort(),
    completeParentInventoryQualified: false as const,
    nativeChildRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parent) {
      require(canonicalSha256(result) === digest &&
        same(await inspect(parent), first), 'authenticated packet inventory changed');
    },
  });
  return result;
}
export async function recheckAzureTerraformNetworkAuthenticatedPacketInventory(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkPacketInventoryContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning authenticated packet inventory witness required');
  await bound.recheck(signal);
}

import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { canonicalSha256 } from './canonical';
import { qualifiedAzureTerraformFailoverStages } from './terraform-failover-retirement';
import {
  qualifyAzureTerraformNetworkCancelledMainBinding,
  recheckAzureTerraformNetworkCancelledMainBinding,
} from './terraform-network-cancelled-main-binding';
import {
  type AzureTerraformNetworkDestroyJournalContext,
  qualifyAzureTerraformNetworkDestroyJournalCustody,
  qualifyAzureTerraformNetworkTerminalJournalCustody,
  recheckAzureTerraformNetworkDestroyJournalCustody,
} from './terraform-network-destroy-journal-custody';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import {
  qualifyAzureTerraformNetworkFreshRetiredServices,
  recheckAzureTerraformNetworkFrozenRetiredServices,
} from './terraform-network-frozen-retired-services';
import { recheckAzureTerraformNetworkRetiredMainCustody } from './terraform-network-retired-main-custody';
import {
  type AzureTerraformNetworkTeardownAdmissionContext,
  qualifyAzureTerraformNetworkTeardownAdmission,
  recheckAzureTerraformNetworkTeardownAdmission,
} from './terraform-network-teardown-admission';
import { azureUpgradeBinding } from './terraform-upgrade';
import { qualifiedAzureTerraformUpgradeStages } from './terraform-upgrade-retirement';
import type { AzureCePlan } from './types';

const stageHistoryWitnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: Parameters<typeof qualifyAzureTerraformTeardownStageHistory>[3];
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();
/** Recheck only an exact genuine proof and its original context. This does not renew
 * the mint's deadline, skip native/public observations, or authorize mutation. */
export async function recheckAzureTerraformTeardownStageHistory(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  signal?: AbortSignal,
  context?: Parameters<typeof qualifyAzureTerraformTeardownStageHistory>[3],
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? stageHistoryWitnesses.get(witness) : undefined;
  if (
    !bound ||
    bound.request !== request ||
    bound.store !== store ||
    bound.context !== context ||
    canonicalSha256(witness) !== bound.digest
  )
    throw Error('Azure owning stage history witness required');
  const aborted = Promise.withResolvers<never>(),
    onAbort = () => aborted.reject(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await Promise.race([bound.recheck(signal), aborted.promise]);
    signal?.throwIfAborted();
    if (canonicalSha256(witness) !== bound.digest) throw Error('Azure stage history witness changed');
    return witness as Awaited<ReturnType<typeof qualifyAzureTerraformTeardownStageHistory>>;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
/** Private existing-stage provenance, checked before destruction and again before retirement.
 * Network stages require separate actual public/native custody admission. Unknown stages
 * cannot authorize destructive teardown; main/global cleanup remains a separate contract.
 * This check does not establish runner or parent cleanup.
 */
export async function qualifyAzureTerraformTeardownStageHistory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  signal?: AbortSignal,
  networkContext?: AzureTerraformNetworkTeardownAdmissionContext &
    Partial<Pick<AzureTerraformNetworkDestroyJournalContext, 'destroyTeardown'>> & { terminalCleanup?: unknown },
) {
  const base = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    read = store.read,
    verify = store.verify;
  const phase = () =>
    canonicalSha256({
      provided: !!networkContext && Object.hasOwn(networkContext, 'destroyTeardown'),
      value: networkContext?.destroyTeardown,
      terminalProvided: !!networkContext && Object.hasOwn(networkContext, 'terminalCleanup'),
      terminal: networkContext?.terminalCleanup,
    });
  const requestedPhaseSha256 = phase();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    if (
      phase() !== requestedPhaseSha256 ||
      base.engine !== 'terraform' ||
      canonicalSha256(request) !== canonicalSha256(base) ||
      canonicalSha256(store.owner) !== canonicalSha256(owner) ||
      canonicalSha256(owner) !== canonicalSha256(azureUpgradeBinding(base).owner) ||
      store.directory !== directory ||
      store.read !== read ||
      store.verify !== verify
    )
      throw Error('Azure teardown stage owner or dependency changed');
  };
  const step = async <T>(work: () => Promise<T>) => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([work(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const privateDirectories = new Map<string, string>();
  const privateDirectory = async (path: string) => {
    const stat = await step(() => lstat(path));
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0 ||
      (await step(() => realpath(path))) !== path
    )
      throw Error('Azure teardown stage private directory ownership differs');
    const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    if (privateDirectories.has(path) && privateDirectories.get(path) !== identity)
      throw Error('Azure teardown stage directory identity changed');
    privateDirectories.set(path, identity);
  };
  const stagesRoot = join(directory, 'terraform-stages');
  const inventory = async () => {
    try {
      await privateDirectory(stagesRoot);
      return await step(() => readdir(stagesRoot));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return [];
    }
  };
  await privateDirectory(directory);
  await step(() => verify.call(store));
  const stages = (await inventory()).sort();
  for (const stage of stages) await privateDirectory(join(stagesRoot, stage));
  if (
    networkContext &&
    Object.hasOwn(networkContext, 'destroyTeardown') &&
    (!networkContext.destroyTeardown || typeof networkContext.destroyTeardown !== 'object')
  )
    throw Error('Malformed Azure post-destroy stage context');
  const destroyContext = networkContext?.destroyTeardown
    ? (networkContext as AzureTerraformNetworkDestroyJournalContext)
    : undefined;
  if (
    networkContext &&
    Object.hasOwn(networkContext, 'terminalCleanup') &&
    (!destroyContext || !networkContext.terminalCleanup || typeof networkContext.terminalCleanup !== 'object')
  )
    throw Error('Malformed Azure terminal empty-main stage context');
  const terminalPlanning =
    !!networkContext?.terminalCleanup &&
    typeof networkContext.terminalCleanup === 'object' &&
    ['cancelling', 'planning'].includes(String(Reflect.get(networkContext.terminalCleanup, 'phase')));
  const postPlaintext =
    !!networkContext?.terminalCleanup &&
    typeof networkContext.terminalCleanup === 'object' &&
    Reflect.get(networkContext.terminalCleanup, 'phase') === 'retired' &&
    !Object.hasOwn(networkContext.terminalCleanup, 'retainedDestroyConfiguration');
  const retiredNetwork = postPlaintext
    ? await step(() =>
        qualifyAzureTerraformNetworkFreshRetiredServices(
          request,
          store,
          networkContext as AzureTerraformNetworkEmptyMainBindingContext,
          deadline,
        ),
      )
    : undefined;
  const network = postPlaintext
    ? undefined
    : terminalPlanning
      ? await step(() =>
          qualifyAzureTerraformNetworkCancelledMainBinding(
            request,
            store,
            networkContext as AzureTerraformNetworkEmptyMainBindingContext,
            deadline,
          ),
        )
      : networkContext && Object.hasOwn(networkContext, 'terminalCleanup')
        ? await step(() =>
            qualifyAzureTerraformNetworkTerminalJournalCustody(
              request,
              store,
              networkContext as AzureTerraformNetworkEmptyMainBindingContext,
              deadline,
            ),
          )
        : destroyContext
          ? await step(() =>
              qualifyAzureTerraformNetworkDestroyJournalCustody(request, store, destroyContext, deadline),
            )
          : networkContext
            ? await step(() => qualifyAzureTerraformNetworkTeardownAdmission(request, store, networkContext, deadline))
            : undefined;
  const networkStages = retiredNetwork ? retiredNetwork.children.map((child) => child.stage) : (network?.stages ?? []);
  if (
    networkStages.some((stage) => !stages.includes(stage)) ||
    stages.some(
      (stage) => !networkStages.includes(stage) && !/^(?:upgrade-(?:software|os)|failover)-[a-f0-9]{24}$/.test(stage),
    )
  )
    throw Error('Unqualified Azure stage blocks terminal cleanup');
  for (const stage of stages) await privateDirectory(join(stagesRoot, stage));
  const records = new Map<string, string>();
  const readSource = async (name: string) => {
    const value = structuredClone(await step(() => read.call(store, name)));
    const digest = canonicalSha256(value);
    if (records.has(name) && records.get(name) !== digest)
      throw Error('Azure teardown stage source changed during qualification');
    records.set(name, digest);
    return value;
  };
  const sourceInventory = () =>
    step(async () =>
      (await readdir(directory))
        .filter((name) => /^azure-ce-(?:failover|upgrade)-[a-f0-9]{24}\.json$/.test(name))
        .sort(),
    );
  const sourceNames = await sourceInventory();
  const readers = new Map<PropertyKey, unknown>([
    ['read', readSource],
    ['verify', () => step(() => verify.call(store))],
  ]);
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (readers.has(key)) return readers.get(key);
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Stage history qualification cannot mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const failoverStages = stages.filter((stage) => stage.startsWith('failover-')),
    upgradeStages = stages.filter((stage) => stage.startsWith('upgrade-'));
  const failovers = await step(() => qualifiedAzureTerraformFailoverStages(base, readonlyStore, failoverStages));
  const upgradeContract = upgradeStages.length
    ? await step(() => VerifiedUpgradeContract.release(fetch, deadline))
    : undefined;
  const upgrades = upgradeContract
    ? await step(() => qualifiedAzureTerraformUpgradeStages(base, readonlyStore, upgradeStages, upgradeContract))
    : [];
  const recheckPrivateBefore = async () => {
    if (canonicalSha256((await inventory()).sort()) !== canonicalSha256(stages))
      throw Error('Azure teardown stage inventory changed during qualification');
    for (const stage of stages) await privateDirectory(join(stagesRoot, stage));
    for (const name of records.keys()) await readSource(name);
    if (canonicalSha256(await sourceInventory()) !== canonicalSha256(sourceNames))
      throw Error('Azure teardown stage source inventory changed during qualification');
  };
  const recheckNative = async (parent?: AbortSignal) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    if (retiredNetwork)
      await step(() =>
        recheckAzureTerraformNetworkFrozenRetiredServices(
          retiredNetwork,
          request,
          store,
          networkContext as AzureTerraformNetworkEmptyMainBindingContext,
          active,
        ),
      );
    else if (network && terminalPlanning)
      await step(() =>
        recheckAzureTerraformNetworkCancelledMainBinding(
          network,
          request,
          store,
          networkContext as AzureTerraformNetworkEmptyMainBindingContext,
          active,
        ),
      );
    else if (
      network &&
      networkContext?.terminalCleanup &&
      typeof networkContext.terminalCleanup === 'object' &&
      Reflect.get(networkContext.terminalCleanup, 'phase') === 'retired'
    )
      await step(() =>
        recheckAzureTerraformNetworkRetiredMainCustody(
          network,
          request,
          store,
          networkContext as AzureTerraformNetworkEmptyMainBindingContext,
          active,
        ),
      );
    else if (network && destroyContext)
      await step(() =>
        recheckAzureTerraformNetworkDestroyJournalCustody(network, request, store, destroyContext, active),
      );
    else if (network && networkContext)
      await step(() => recheckAzureTerraformNetworkTeardownAdmission(network, request, store, networkContext, active));
    active.throwIfAborted();
  };
  const recheckPrivateAfter = async () => {
    // Network requalification invokes owning evidence readers. Seal the complete existing-stage
    // namespace again after those callbacks, rather than trusting the preceding inventory.
    if (canonicalSha256((await inventory()).sort()) !== canonicalSha256(stages))
      throw Error('Azure teardown stage inventory changed after network qualification');
    for (const stage of stages) await privateDirectory(join(stagesRoot, stage));
    for (const name of records.keys()) await readSource(name);
    if (canonicalSha256(await sourceInventory()) !== canonicalSha256(sourceNames))
      throw Error('Azure teardown stage source inventory changed after network qualification');
    await step(() => verify.call(store));
    await privateDirectory(directory);
    seal();
  };
  await recheckPrivateBefore();
  await recheckNative();
  await recheckPrivateAfter();
  const sourceSha256 = canonicalSha256({
    stages,
    ...(network ? { network } : {}),
    ...(retiredNetwork ? { retiredNetwork } : {}),
    sourceNames,
    records: [...records].sort(([a], [b]) => a.localeCompare(b)),
    directories: [...privateDirectories].sort(([a], [b]) => a.localeCompare(b)),
  });
  const result = {
    stages,
    failovers,
    upgrades,
    upgradeContract,
    sourceSha256,
    ...(network ? { network } : {}),
    ...(retiredNetwork ? { retiredNetwork } : {}),
  };
  const digest = canonicalSha256(result);
  stageHistoryWitnesses.set(result, {
    request,
    store,
    context: networkContext,
    digest,
    async recheck(parent) {
      seal();
      if (canonicalSha256(result) !== digest) throw Error('Azure stage history witness changed');
      await recheckPrivateBefore();
      await recheckNative(parent);
      await recheckPrivateAfter();
      seal();
    },
  });
  return result;
}

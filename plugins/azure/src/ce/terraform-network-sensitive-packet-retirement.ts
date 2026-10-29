import { createHash } from 'node:crypto';
import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import { recheckAzureTerraformNetworkFreshParentAbsence } from './terraform-network-fresh-parent-absence';
import {
  qualifyAzureTerraformNetworkFreshRetiredServices,
  recheckAzureTerraformNetworkFrozenRetiredServices,
} from './terraform-network-frozen-retired-services';
import type { readAzureTerraformNetworkParentInventory } from './terraform-network-parent-inventory';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import type { AzureCePlan } from './types';

const nonBootstrapMarkerName = 'azure-terraform-network-packet-retirement.json';
const bootstrapMarkerName = 'azure-terraform-network-bootstrap-packet-retirement.json';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const safe = (path: string) =>
  path !== '' && path.split('/').every((part) => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure network packet retirement: ${message}`);
}
type Inventory = Awaited<ReturnType<typeof readAzureTerraformNetworkParentInventory>>;
type Checkpoint = {
  schemaVersion: 1;
  scope: 'native-bound-non-bootstrap-packet-retirement' | 'fresh-native-bound-bootstrap-packet-retirement';
  owner: CeDeploymentStore['owner'];
  originalPlanSha256: string;
  teardownPlanSha256: string;
  frozenInventorySha256: string;
  mainMarkerSha256: string;
  actions: Inventory['parentArtifactDecisions'];
  deferredBootstrap: Inventory['parentArtifactDecisions'];
  status: 'retiring' | 'packets-retired';
  deleted: string[];
  pending: string | null;
};

type BootstrapObservation = Awaited<ReturnType<typeof qualifyAzureTerraformNetworkRetiredBootstrapPackets>>;
const bootstrapObservations = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkEmptyMainBindingContext;
    absence: unknown;
    runtime: CeRuntime;
    contract: VerifiedIngressContract;
    api: AzExecApi;
    digest: string;
    deadline: AbortSignal;
    recheck(): Promise<void>;
  }
>();
/** Recheck one genuine completed native custody observation. Its original deadline,
 * native services, exact private namespace, and fresh external absence all remain
 * required. Serialized copies and different owner contexts grant no authority.
 */
export async function recheckAzureTerraformNetworkRetiredBootstrapPackets(
  observation: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  absence: unknown,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<BootstrapObservation> {
  signal?.throwIfAborted();
  const bound = observation && typeof observation === 'object' ? bootstrapObservations.get(observation) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    bound.absence === absence &&
    bound.runtime === runtime &&
    bound.contract === contract &&
    bound.api === api &&
    canonicalSha256(observation) === bound.digest, 'genuine owning completed bootstrap observation required');
  const active = AbortSignal.any([bound.deadline, ...(signal ? [signal] : [])]);
  active.throwIfAborted();
  const aborted = Promise.withResolvers<never>(),
    onAbort = () => aborted.reject(active.reason);
  active.addEventListener('abort', onAbort, { once: true });
  try {
    await Promise.race([bound.recheck(), aborted.promise]);
    active.throwIfAborted();
    require(canonicalSha256(observation) === bound.digest, 'completed bootstrap observation changed');
    return observation as BootstrapObservation;
  } finally {
    active.removeEventListener('abort', onAbort);
  }
}
/** Internal action under the owning lifecycle lock. Authenticate each invocation
 * from permanent native main/child services, never a serialized opaque witness.
 * Only frozen non-bootstrap delete decisions authorize unlink. Token retirement,
 * external absence, final parent retirement and public teardown remain separate.
 * Pending is persisted before unlink; a fresh invocation can authenticate a missing
 * pending item while every preserved/unattempted path must still be exact.
 */
export async function retireAzureTerraformNetworkSensitivePackets(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  const result = await retirePackets(request, store, context, 'non-bootstrap', undefined, signal);
  return { ...result, status: 'non-bootstrap-packets-retired' as const };
}

/** Retire only frozen CE token files after completed non-bootstrap custody and
 * current owning platform/cloud resource absence. The opaque absence witness is
 * rechecked before each exhaustive filesystem pass; its interface scope remains
 * explicitly unqualified. Opaque checkout references have their separate lifecycle.
 */
export async function retireAzureTerraformNetworkBootstrapPackets(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  absence: unknown,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const beforeSnapshot = (active: AbortSignal) =>
    recheckAzureTerraformNetworkFreshParentAbsence(absence, request, store, context, runtime, contract, api, active);
  await beforeSnapshot(active);
  const result = await retirePackets(request, store, context, 'bootstrap', beforeSnapshot, active);
  return {
    ...result,
    status: 'bootstrap-packets-retired' as const,
    interfaceAbsenceQualified: false as const,
    fullExternalCleanupQualified: false as const,
  };
}
/** Read-only completed parent file custody after both typed packet stages.
 * The same fresh opaque absence witness and exhaustive native filesystem checks
 * remain required. An incomplete marker rejects before any write or unlink.
 * Interface, checkout, final public lifecycle and live acceptance remain separate.
 */
export async function qualifyAzureTerraformNetworkRetiredBootstrapPackets(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  absence: unknown,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const fresh = (selected: AbortSignal) =>
    recheckAzureTerraformNetworkFreshParentAbsence(absence, request, store, context, runtime, contract, api, selected);
  await fresh(active);
  let recheck: (() => Promise<void>) | undefined;
  const result = await retirePackets(request, store, context, 'bootstrap', fresh, active, true, (callback) => {
    recheck = callback;
  });
  require(recheck, 'completed native snapshot recheck required');
  const observation = {
    ...result,
    status: 'retired-bootstrap-packets-observed' as const,
    completeParentFileCustodyQualified: true as const,
    bootstrapPacketRetirementQualified: true as const,
    interfaceAbsenceQualified: false as const,
    fullExternalCleanupQualified: false as const,
    opaqueCheckoutRetirementQualified: false as const,
  };
  bootstrapObservations.set(observation, {
    request,
    store,
    context,
    absence,
    runtime,
    contract,
    api,
    digest: canonicalSha256(observation),
    deadline: active,
    recheck,
  });
  return observation;
}
async function retirePackets(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  kind: 'non-bootstrap' | 'bootstrap',
  beforeSnapshot: ((signal: AbortSignal) => Promise<unknown>) | undefined,
  signal?: AbortSignal,
  readOnly = false,
  onCompletedReadOnlySnapshot?: (recheck: () => Promise<void>) => void,
) {
  const markerName = kind === 'bootstrap' ? bootstrapMarkerName : nonBootstrapMarkerName;
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const root = store.directory,
    owner = structuredClone(store.owner),
    original = structuredClone(request),
    terminal = structuredClone(context.terminalCleanup);
  const read = store.read,
    verify = store.verify,
    write = store.write;
  const originalSha256 = canonicalSha256({ value: original }),
    ownerSha256 = canonicalSha256({ value: owner }),
    terminalSha256 = canonicalSha256({ value: terminal });
  const guard = () => {
    active.throwIfAborted();
    require(store.directory === root &&
      canonicalSha256({ value: store.owner }) === ownerSha256 &&
      canonicalSha256({ value: request }) === originalSha256 &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, terminalSha256) &&
      store.read === read &&
      store.verify === verify &&
      store.write === write, 'owning context changed');
  };
  guard();
  const native = await qualifyAzureTerraformNetworkFreshRetiredServices(request, store, context, active);
  guard();
  require(terminal && typeof terminal === 'object' && !Array.isArray(terminal), 'complete terminal record required');
  const frozen = structuredClone(Reflect.get(terminal, 'retainedNetworkParentInventory')) as Inventory;
  require(frozen && canonicalSha256(frozen) === native.frozenParentInventorySha256, 'native frozen inventory differs');
  const actions = frozen.parentArtifactDecisions
    .filter(
      (row) =>
        row.action === 'delete' &&
        (kind === 'bootstrap' ? row.schema === 'ce-bootstrap-token-v1' : row.schema !== 'ce-bootstrap-token-v1'),
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  const deferredBootstrap = frozen.parentArtifactDecisions
    .filter((row) => kind === 'non-bootstrap' && row.action === 'delete' && row.schema === 'ce-bootstrap-token-v1')
    .sort((a, b) => a.path.localeCompare(b.path));
  const paths = actions.map((row) => row.path);
  require((kind === 'bootstrap' || paths.length > 0) &&
    new Set(paths).size === paths.length &&
    actions.every((row) => safe(row.path) && row.path !== markerName), 'complete typed packet actions required');
  const binding = {
    schemaVersion: 1 as const,
    scope:
      kind === 'bootstrap'
        ? ('fresh-native-bound-bootstrap-packet-retirement' as const)
        : ('native-bound-non-bootstrap-packet-retirement' as const),
    owner,
    originalPlanSha256: request.planSha256,
    teardownPlanSha256: context.destroyTeardown.planSha256,
    frozenInventorySha256: canonicalSha256(frozen),
    mainMarkerSha256: native.mainMarkerSha256,
    actions,
    deferredBootstrap,
  };
  const previouslyDeleted = new Set<string>();
  let priorMarker: { path: string; identity: string; sha256: string; packetSha256: string } | undefined;
  if (kind === 'bootstrap') {
    const priorActions = frozen.parentArtifactDecisions
      .filter((row) => row.action === 'delete' && row.schema !== 'ce-bootstrap-token-v1')
      .sort((a, b) => a.path.localeCompare(b.path));
    const priorDeferred = frozen.parentArtifactDecisions
      .filter((row) => row.action === 'delete' && row.schema === 'ce-bootstrap-token-v1')
      .sort((a, b) => a.path.localeCompare(b.path));
    const logical = await read.call(store, nonBootstrapMarkerName);
    guard();
    const file = await readAzureTerraformParentPrivateFile(join(root, nonBootstrapMarkerName), active);
    guard();
    const value = JSON.parse(file.bytes.toString());
    const priorBinding = {
      ...binding,
      scope: 'native-bound-non-bootstrap-packet-retirement',
      actions: priorActions,
      deferredBootstrap: priorDeferred,
      status: 'packets-retired',
      deleted: priorActions.map((row) => row.path),
      pending: null,
    };
    require(same(logical, value) && same(value, priorBinding), 'completed native non-bootstrap checkpoint required');
    priorMarker = {
      path: nonBootstrapMarkerName,
      identity: file.identity,
      sha256: hash(file.bytes),
      packetSha256: canonicalSha256(value),
    };
    for (const row of priorActions) previouslyDeleted.add(row.path);
  }
  let checkpoint: Checkpoint | undefined;
  const load = async () => {
    guard();
    const logical = await read.call(store, markerName);
    guard();
    const file = await readAzureTerraformParentPrivateFile(join(root, markerName), active);
    guard();
    const value = JSON.parse(file.bytes.toString()) as Checkpoint;
    require(same(logical, value), 'logical and native checkpoint differ');
    require(Array.isArray(value.deleted) &&
      value.deleted.every((path) => typeof path === 'string') &&
      value.deleted.length <= paths.length &&
      same(value.deleted, paths.slice(0, value.deleted.length)) &&
      (value.pending === null ||
        (typeof value.pending === 'string' &&
          value.deleted.length < paths.length &&
          value.pending === paths[value.deleted.length])) &&
      ['retiring', 'packets-retired'].includes(value.status) &&
      (value.status !== 'packets-retired' ||
        (value.pending === null && value.deleted.length === paths.length)), 'checkpoint progress differs');
    require(same(value, {
      ...binding,
      status: value.status,
      deleted: value.deleted,
      pending: value.pending,
    }), 'checkpoint native authority differs');
    return value;
  };
  try {
    checkpoint = await load();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (readOnly) require(checkpoint?.status === 'packets-retired', 'completed bootstrap packet retirement required');
  const main = new Map<string, { identity: string; sha256: string; packetSha256: string }>();
  for (const path of [`${frozen.mainDirectory}/artifact-retirement.json`, `${frozen.mainDirectory}/deployment.json`]) {
    const file = await readAzureTerraformParentPrivateFile(join(root, path), active);
    main.set(path, {
      identity: file.identity,
      sha256: hash(file.bytes),
      packetSha256: canonicalSha256(JSON.parse(file.bytes.toString())),
    });
  }
  const expected = new Map([...frozen.files, frozen.terminalFile].map((row) => [row.path, row]));
  require(!expected.has(markerName) &&
    expected.size === frozen.files.length + 1, 'frozen files duplicate or foreign checkpoint');
  for (const [path, row] of main) expected.set(path, { path, ...row });
  if (priorMarker) expected.set(priorMarker.path, priorMarker);
  const directories = new Map(frozen.directories.map((row) => [row.path, row]));
  require(directories.size === frozen.directories.length, 'duplicate frozen directories');
  const snapshot = async (progress?: Checkpoint) => {
    guard();
    await verify.call(store);
    guard();
    if (progress) require(same(await load(), progress), 'saved progress changed');
    if (beforeSnapshot) {
      await beforeSnapshot(active);
      guard();
    }
    await recheckAzureTerraformNetworkFrozenRetiredServices(native, request, store, context, active);
    guard();
    const absent = new Set([...previouslyDeleted, ...(progress?.deleted ?? [])]);
    if (progress?.pending) {
      try {
        await lstat(join(root, progress.pending));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        absent.add(progress.pending);
      }
    }
    const seen = new Set<string>(),
      seenDirs = new Set<string>();
    const walk = async (path: string) => {
      guard();
      const full = path ? join(root, path) : root,
        stat = await lstat(full),
        declared = directories.get(path);
      require(declared &&
        stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0 &&
        `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` === declared.identity &&
        (await realpath(full)) === full, 'native directory identity differs');
      const all = (await readdir(full)).sort();
      const names = all.filter((name) => path !== '' || name !== '.azure-terraform-lifecycle-lock');
      const expectedNames = (
        path === frozen.mainDirectory ? ['artifact-retirement.json', 'deployment.json'] : declared.names
      ).filter((name) => !absent.has(path ? `${path}/${name}` : name));
      if (path === '' && progress) expectedNames.push(markerName);
      if (path === '' && priorMarker) expectedNames.push(priorMarker.path);
      require(same(names, expectedNames.sort()), 'exhaustive directory namespace differs');
      seenDirs.add(path);
      for (const name of names) {
        const selected = path ? `${path}/${name}` : name;
        require(safe(selected), 'foreign native path');
        if (selected === markerName) {
          const file = await readAzureTerraformParentPrivateFile(join(root, selected), active);
          require(progress && same(JSON.parse(file.bytes.toString()), progress), 'native saved progress changed');
          continue;
        }
        const current = await lstat(join(root, selected));
        if (current.isDirectory() && !current.isSymbolicLink()) {
          await walk(selected);
          continue;
        }
        require(current.isFile() && !current.isSymbolicLink(), 'foreign native entry');
        const file = await readAzureTerraformParentPrivateFile(join(root, selected), active),
          prior = expected.get(selected);
        const fragment = selected.startsWith('terraform-original-deployment-publication-fragments/');
        const parsed = fragment ? undefined : JSON.parse(file.bytes.toString());
        if (selected === 'azure-terraform-terminal-cleanup.json')
          require(same(parsed, terminal), 'projected terminal differs');
        else
          require(prior &&
            prior.identity === file.identity &&
            prior.sha256 === hash(file.bytes) &&
            prior.packetSha256 ===
              (fragment ? hash(file.bytes) : canonicalSha256(parsed)), 'frozen file bytes or identity differ');
        seen.add(selected);
      }
      const after = await lstat(full);
      guard();
      require(after.isDirectory() &&
        !after.isSymbolicLink() &&
        after.dev === stat.dev &&
        after.ino === stat.ino &&
        after.birthtimeMs === stat.birthtimeMs &&
        after.uid === stat.uid &&
        (after.mode & 0o077) === 0 &&
        same(all, (await readdir(full)).sort()), 'native namespace changed during snapshot');
    };
    await walk('');
    require(same([...seen].sort(), [...expected.keys()].filter((path) => !absent.has(path)).sort()) &&
      same([...seenDirs].sort(), [...directories.keys()].sort()), 'partial native discovery');
    guard();
    guard();
  };
  const result = (value: Checkpoint) => ({
    owner,
    sourcePlanSha256: request.planSha256,
    teardownPlanSha256: context.destroyTeardown.planSha256,
    inventorySha256: binding.frozenInventorySha256,
    checkpointSha256: canonicalSha256(value),
    retiredPackets: paths.length,
    deferredBootstrapTokens: deferredBootstrap.length,
    parentRetirementQualified: false as const,
    liveQualified: false as const,
  });
  await snapshot(checkpoint);
  // An already-completed read-only replay has no intervening mutation.
  // One fresh native callback followed by exhaustive filesystem custody is sufficient.
  if (checkpoint?.status === 'packets-retired') {
    const completed = checkpoint;
    if (readOnly) onCompletedReadOnlySnapshot?.(() => snapshot(completed));
    return result(completed);
  }
  // Await writes/unlink to settlement even if cancellation occurs in their callback;
  // a pending native checkpoint survives loss of the caller's acknowledgement.
  const publish = async (value: Checkpoint) => {
    guard();
    await write.call(store, markerName, value, active);
    guard();
    const saved = await load();
    require(same(saved, value), 'published checkpoint differs');
    checkpoint = saved;
  };
  if (!checkpoint) {
    await publish({ ...binding, status: 'retiring', deleted: [], pending: null });
  }
  require(checkpoint, 'durable checkpoint required');
  while (checkpoint.deleted.length < paths.length) {
    const selected = paths[checkpoint.deleted.length];
    require(selected, 'selected typed action required');
    if (checkpoint.pending === null) await publish({ ...checkpoint, pending: selected });
    await snapshot(checkpoint);
    guard();
    let missing = false;
    try {
      await lstat(join(root, selected));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing = true;
    }
    if (!missing) {
      const file = await readAzureTerraformParentPrivateFile(join(root, selected), active),
        declared = expected.get(selected);
      require(declared &&
        file.identity === declared.identity &&
        hash(file.bytes) === declared.sha256, 'selected packet changed before deletion');
      guard();
      await unlink(join(root, selected));
      guard();
    }
    await snapshot(checkpoint);
    await publish({ ...checkpoint, deleted: [...checkpoint.deleted, selected], pending: null });
  }
  await snapshot(checkpoint);
  await publish({ ...checkpoint, status: 'packets-retired' });
  await snapshot(checkpoint);
  return result(checkpoint);
}

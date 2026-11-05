import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import { validateAzureNetworkUpdateInventory } from './network-update';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import { readAzureTerraformNetworkNicHistory } from './terraform-network-nic-history';
import { azureTerraformNetworkPowerDeployment } from './terraform-network-power';
import { readAzureTerraformNetworkPowerHistory } from './terraform-network-power-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkRetirementCheckpoint } from './terraform-network-retirement-checkpoint';
import { buildAzureTerraformNetworkRoutingStage } from './terraform-network-routing';
import { readAzureTerraformNetworkRoutingPrefixHistory } from './terraform-network-routing-prefix-history';
import { readAzureTerraformNetworkSourceHistory } from './terraform-network-source-history';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network retirement graph: ${message}`);
}
function keys(value: unknown, fields: string[]): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value as Record<string, unknown>;
  require(same(Object.keys(row).sort(), fields.toSorted()), 'saved graph schema differs');
  return row;
}
type AuthenticatedGraph = Awaited<ReturnType<typeof readAzureTerraformNetworkRetirementGraph>>;
const authenticatedGraphWitnesses = new WeakMap<
  object,
  {
    requestSha256: string;
    siteSha256: string;
    store: CeDeploymentStore;
    loaders: AzureTerraformNetworkHistoryLoaders;
    verifier: AzureTerraformNetworkAcceptanceVerifier;
    replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier;
    recheck(signal?: AbortSignal): Promise<AuthenticatedGraph>;
  }
>();

/** Recheck only a witness minted by full authentication in this module. Its original deadline,
 * packet/absence custody, loader and verifier results, and owning dependencies stay authoritative.
 * Serialized graphs and foreign contexts cannot create a witness.
 */
export async function recheckAzureTerraformNetworkRetirementGraph(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
): Promise<AuthenticatedGraph> {
  signal?.throwIfAborted();
  const qualified = witness && typeof witness === 'object' ? authenticatedGraphWitnesses.get(witness) : undefined;
  require(qualified, 'owning authenticated graph witness required');
  const context = () =>
    require(qualified.requestSha256 === canonicalSha256(request) &&
      qualified.siteSha256 === canonicalSha256(site) &&
      qualified.store === store &&
      qualified.loaders === loaders &&
      qualified.verifier === verifier &&
      qualified.replacementVerifier === replacementVerifier, 'owning authenticated graph witness required');
  context();
  const result = await qualified.recheck(signal);
  signal?.throwIfAborted();
  context();
  return result;
}

const phases = ['prepared', 'deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'];

// Only the qualified prefix reader below can register an inventory projection. The real current
// namespace is checked on every projected inventory read; ordinary callers always see all files.
const historicalInventories = new WeakMap<
  CeDeploymentStore,
  {
    planSha256: string;
    currentNames: string[];
    originalNames: string[];
  }
>();
export async function readAzureTerraformNetworkPacketNames(store: CeDeploymentStore, plan: AzureCePlan) {
  const names = (await readdir(store.directory))
    .filter((name) => name.startsWith(`${plan.planId}-terraform-network-`))
    .sort();
  const historical = historicalInventories.get(store);
  if (!historical) return names;
  require(historical.planSha256 === plan.planSha256 &&
    same(names, historical.currentNames), 'current network namespace changed during original prefix inspection');
  return [...historical.originalNames];
}

/** Private read-only packet graph authorization. Returned source/snapshots are enrollment material:
 * never expose them through a public tool. Durable outcomes remain separate from actual submitted
 * journals, independent current cleanup evidence, runner retirement and parent-deletion admission.
 */
/** A minted graph is a read-only JSON witness. Freeze every nested value before
 * exposing it, so callbacks cannot transiently alter the private proof between
 * native reads. Live source/outcome/packet/namespace checks are still rerun.
 */
function immutableGraph<T>(value: T): T {
  const snapshot = structuredClone(value);
  const freeze = (entry: unknown) => {
    if (entry === null || typeof entry !== 'object') return;
    const prototype = Object.getPrototypeOf(entry);
    require(Array.isArray(entry) ||
      prototype === Object.prototype ||
      prototype === null, 'immutable graph requires plain JSON values');
    for (const nested of Object.values(entry)) freeze(nested);
    Object.freeze(entry);
  };
  freeze(snapshot);
  return snapshot;
}

export async function readAzureTerraformNetworkRetirementGraph(
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
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  // Internal readers clone these request snapshots before invoking external dependencies.
  const requestMatches = canonicalSnapshot(plan),
    siteMatches = canonicalSnapshot(site);
  const seal = () => {
    deadline.throwIfAborted();
    require(requestMatches(request) &&
      siteMatches(siteRequest) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      store.read === read &&
      store.verify === verify &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome === loadOutcome, 'request or graph dependency changed');
  };
  const step = async <T>(action: () => Promise<T>): Promise<T> => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const packets: Record<string, string> = {},
    absent = new Set<string>(),
    packetSnapshots = new Map<string, unknown>();
  const trackedRead = async (name: string) => {
    seal();
    if (packetSnapshots.has(name)) return structuredClone(packetSnapshots.get(name));
    if (absent.has(name)) throw Object.assign(Error('Previously observed graph packet absence'), { code: 'ENOENT' });
    let value: unknown;
    try {
      value = await step(() => read.call(store, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        require(packets[name] === undefined, 'present graph packet disappeared');
        absent.add(name);
      }
      throw error;
    }
    const digest = canonicalSha256(value);
    require(!absent.has(name) &&
      (packets[name] === undefined || packets[name] === digest), 'graph packet appeared or changed');
    packets[name] = digest;
    packetSnapshots.set(name, structuredClone(value));
    return structuredClone(value);
  };
  const optional = async (name: string) => {
    try {
      return await trackedRead(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  // Cached packets belong only to this read-only mint. Authentication always reads native bytes.
  const optionalFresh = async (name: string) => {
    try {
      return await step(() => read.call(store, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  const trackedVerify = () => step(() => verify.call(store));
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return trackedRead;
      if (key === 'verify') return trackedVerify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Graph inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const historicalInventory = historicalInventories.get(store);
  if (historicalInventory) historicalInventories.set(readonlyStore, historicalInventory);
  const sources = new Map<string, string>(),
    outcomes = new Map<string, { plan: AzureCePlan; digest: string }>();
  const trackedLoaders: AzureTerraformNetworkHistoryLoaders = {
    async loadSource(digest) {
      const value = await step(() => loadSource.call(loaders, digest)),
        actual = canonicalSha256(value);
      require(!sources.has(digest) || sources.get(digest) === actual, 'original source changed across graph');
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(original) {
      const value = await step(() => loadOutcome.call(loaders, structuredClone(original))),
        digest = canonicalSha256(value);
      require(!outcomes.has(original.planSha256) ||
        outcomes.get(original.planSha256)?.digest === digest, 'original outcome changed across graph');
      outcomes.set(original.planSha256, { plan: structuredClone(original), digest });
      return structuredClone(value);
    },
  };
  const historicalChecks = new Map<string, { digest: string; replay(signal: AbortSignal): Promise<unknown> }>();
  const retainVerification = <T>(key: string, result: T, replay: (signal: AbortSignal) => Promise<unknown>) => {
    const digest = canonicalSha256(result);
    require(!historicalChecks.has(key) ||
      historicalChecks.get(key)?.digest === digest, 'historical verifier result changed across graph');
    historicalChecks.set(key, { digest, replay });
    return result;
  };
  const historical: AzureTerraformNetworkAcceptanceVerifier = async (receipt, identity, mode) => {
    require(mode === 'historical', 'graph cannot request current acceptance');
    const frozenReceipt = structuredClone(receipt),
      frozenIdentity = structuredClone(identity);
    const replay = (active: AbortSignal) =>
      verifier(structuredClone(frozenReceipt), structuredClone(frozenIdentity), 'historical', active);
    return retainVerification(
      `network:${canonicalSha256({ receipt, identity })}`,
      await step(() => replay(deadline)),
      replay,
    );
  };
  const historicalReplacement: AzureTerraformNetworkReplacementCompletedVerifier | undefined = replacementVerifier
    ? async (receipt, identity, mode) => {
        require(mode === 'historical', 'graph cannot request current replacement acceptance');
        const frozenReceipt = structuredClone(receipt),
          frozenIdentity = structuredClone(identity);
        const replay = (active: AbortSignal) =>
          replacementVerifier(structuredClone(frozenReceipt), structuredClone(frozenIdentity), 'historical', active);
        return retainVerification(
          `replacement:${canonicalSha256({ receipt, identity })}`,
          await step(() => replay(deadline)),
          replay,
        );
      }
    : undefined;
  const inventory = () => step(async () => readAzureTerraformNetworkPacketNames(store, plan));
  const names = await inventory();
  const original = await step(() =>
    readAzureTerraformNetworkSourceHistory(
      plan,
      readonlyStore,
      trackedLoaders,
      site,
      historical,
      deadline,
      historicalReplacement,
    ),
  );
  const checkpoint = await step(() =>
    readAzureTerraformNetworkRetirementCheckpoint(
      plan,
      readonlyStore,
      trackedLoaders,
      site,
      historical,
      deadline,
      historicalReplacement,
    ),
  );
  require(checkpoint.originalSourceBindingSha256 ===
    canonicalSha256(original.binding), 'original and serial source bindings differ');
  type Power = Awaited<ReturnType<typeof readAzureTerraformNetworkPowerHistory>>;
  type Nic = Awaited<ReturnType<typeof readAzureTerraformNetworkNicHistory>>;
  type Routing = Awaited<ReturnType<typeof readAzureTerraformNetworkRoutingPrefixHistory>>;
  const nodes: Array<{
    node: number;
    phase: string;
    preflightPresent: boolean;
    deallocate: Power;
    nic: Nic;
    start: Power;
    routing?: Routing;
  }> = [];
  const powerDeployments: Array<Awaited<ReturnType<typeof azureTerraformNetworkPowerDeployment>>> = [];
  let source = original.binding.source;
  for (const row of checkpoint.snapshot?.checkpoint.nodes ?? []) {
    const node = row.node,
      prefix = `${plan.planId}-terraform-network-node-${node}`,
      rank = phases.indexOf(row.phase),
      prior = Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat(),
      reached = [...prior, ...plan.nics.map((nic) => `${node}:${nic.index}`)];
    const preflight = await optional(`${prefix}-preflight.json`);
    if (preflight !== undefined) {
      const packet = keys(preflight, ['schemaVersion', 'sourceBindingSha256', 'identity', 'receipt', 'verification']);
      require(packet.schemaVersion === 1 &&
        packet.sourceBindingSha256 === canonicalSha256(original.binding), 'preflight original source differs');
      const identity = keys(packet.identity, [
        'owner',
        'planSha256',
        'node',
        'siteName',
        'siteUid',
        'siteConfigurationSha256',
        'configurationSha256',
        'inventory',
      ]);
      require(same(identity.owner, owner) &&
        identity.planSha256 === plan.planSha256 &&
        identity.node === node &&
        identity.siteName === plan.siteName &&
        identity.siteUid === site.siteUid &&
        identity.siteConfigurationSha256 === site.siteConfigurationSha256 &&
        identity.configurationSha256 === createHash('sha256').update(source).digest('hex') &&
        same(
          validateAzureNetworkUpdateInventory(plan, identity.inventory).nodes,
          row.before.nodes,
        ), 'preflight serial/node/site identity differs');
      const qualified = await historical(
        packet.receipt,
        packet.identity as Parameters<typeof historical>[1],
        'historical',
        deadline,
      );
      keys(qualified, ['status', 'scope', 'evidenceSha256']);
      require(qualified.status === 'verified' &&
        qualified.scope === 'node-interfaces-routing-traffic' &&
        /^[a-f0-9]{64}$/.test(qualified.evidenceSha256) &&
        same(qualified, packet.verification), 'preflight historical acceptance differs');
    }
    const deallocate = await step(() =>
      readAzureTerraformNetworkPowerHistory(plan, row.before, node, 'deallocate', prior, readonlyStore, deadline),
    );
    const nic = await step(() =>
      readAzureTerraformNetworkNicHistory(plan, source, row.before, node, readonlyStore, deadline),
    );
    const start = await step(() =>
      readAzureTerraformNetworkPowerHistory(plan, row.before, node, 'start', reached, readonlyStore, deadline),
    );
    require(preflight !== undefined ||
      (!deallocate.lastPacket &&
        !nic.lastPacket &&
        !start.lastPacket &&
        rank === 0), 'stage publication without original qualified preflight');
    require(!nic.lastPacket ||
      (rank >= 1 && deallocate.receipts.final), 'NIC prefix lacks published serial deallocate prerequisite');
    require(!start.lastPacket ||
      (rank >= 2 && nic.receipts.final), 'start prefix lacks published serial NIC prerequisite');
    require(rank < 1 || deallocate.receipts.final, 'checkpoint exceeds immutable deallocate completion');
    require(rank < 2 || nic.receipts.final, 'checkpoint exceeds immutable NIC completion');
    require(rank < 3 || start.receipts.final, 'checkpoint exceeds immutable start completion');
    let routing: Routing | undefined;
    if (start.receipts.final) {
      const released = keys(await trackedRead(`${prefix}-start-release-outcome.json`), ['cloud', 'state']);
      const cloud = released.cloud as { inventory: unknown };
      routing = await step(() =>
        readAzureTerraformNetworkRoutingPrefixHistory(
          plan,
          source,
          row.before,
          validateAzureNetworkUpdateInventory(plan, cloud.inventory),
          node,
          readonlyStore,
          deadline,
        ),
      );
      require(!routing.lastPacket || rank >= 3, 'routing prefix lacks published serial restart prerequisite');
    } else {
      for (const suffix of [
        'prepared',
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
        require((await optional(`${prefix}-routing-${suffix}.json`)) ===
          undefined, 'routing packets before immutable restart completion');
    }
    require(rank < 4 || routing?.receipts.final, 'checkpoint exceeds immutable routing completion');
    if (preflight !== undefined)
      powerDeployments.push(
        await step(() => azureTerraformNetworkPowerDeployment(plan, row.before, node, 'deallocate')),
      );
    if (rank >= 2)
      powerDeployments.push(await step(() => azureTerraformNetworkPowerDeployment(plan, row.before, node, 'start')));
    nodes.push({ node, phase: row.phase, preflightPresent: preflight !== undefined, deallocate, nic, start, routing });
    if (row.phase === 'accepted') {
      require(row.history?.phase === 'routing-complete', 'accepted predecessor lacks routing completion');
      source = buildAzureTerraformNetworkRoutingStage(
        plan,
        source,
        row.before,
        row.history.inventory,
        node,
      ).releasedConfiguration;
    }
  }
  require(names.every((name) => packets[name] !== undefined), 'unrecognized or future-node network packet');
  await step(() => verify.call(store));
  for (const [digest, expected] of sources)
    require(canonicalSha256(await step(() => loadSource.call(loaders, digest))) ===
      expected, 'original source changed before graph boundary');
  for (const { plan: input, digest } of outcomes.values())
    require(canonicalSha256(await step(() => loadOutcome.call(loaders, structuredClone(input)))) ===
      digest, 'original outcome changed before graph boundary');
  for (const [name, digest] of Object.entries(packets))
    require(canonicalSha256(await step(() => read.call(store, name))) ===
      digest, 'graph packet changed before final boundary');
  for (const name of absent) require((await optionalFresh(name)) === undefined, 'absent graph packet appeared');
  require(same(await inventory(), names), 'network directory changed across graph');
  seal();
  const result = immutableGraph({
    schemaVersion: 1 as const,
    scope: 'network-retirement-packet-graph' as const,
    original,
    checkpoint,
    nodes,
    powerDeployments,
    packetSha256ByName: packets,
    absentPackets: [...absent].sort(),
    submittedRunnerJournalsQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
    runnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    retirementQualified: false as const,
  });
  const resultSha256 = canonicalSha256(result);
  authenticatedGraphWitnesses.set(result, {
    requestSha256: canonicalSha256(plan),
    siteSha256: canonicalSha256(site),
    store,
    loaders,
    verifier,
    replacementVerifier,
    async recheck(parentSignal) {
      const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
      const boundary = () => {
        active.throwIfAborted();
        seal();
        require(Object.isFrozen(result), 'authenticated graph witness must remain immutable');
      };
      const bounded = async <T>(action: () => Promise<T>): Promise<T> => {
        boundary();
        const aborted = Promise.withResolvers<never>(),
          onAbort = () => aborted.reject(active.reason);
        active.addEventListener('abort', onAbort, { once: true });
        try {
          const value = await Promise.race([action(), aborted.promise]);
          boundary();
          return value;
        } finally {
          active.removeEventListener('abort', onAbort);
        }
      };
      await bounded(() => verify.call(store));
      require(same(await bounded(inventory), names), 'authenticated graph namespace changed');
      for (const [digest, expected] of sources)
        require(canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) ===
          expected, 'authenticated graph source loader changed');
      for (const { plan: original, digest } of outcomes.values())
        require(canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(original)))) ===
          digest, 'authenticated graph outcome loader changed');
      for (const { replay, digest } of historicalChecks.values())
        require(canonicalSha256(await bounded(() => replay(active))) ===
          digest, 'authenticated graph historical verifier changed');
      for (const [name, digest] of Object.entries(packets))
        require(canonicalSha256(await bounded(() => read.call(store, name))) ===
          digest, 'authenticated graph packet changed');
      for (const name of absent)
        require((await bounded(() => optionalFresh(name))) === undefined, 'authenticated graph absence changed');
      require(same(await bounded(inventory), names), 'authenticated graph namespace changed at final boundary');
      await bounded(() => verify.call(store));
      boundary();
      require(canonicalSha256(result) === resultSha256, 'immutable graph final digest differs');
      return structuredClone(result);
    },
  });
  return result;
}

/** Reconstruct an exact originally qualified graph from retained immutable bytes after genuine
 * serial advancement. Its moving pointer is bound to its original retained revision. Historical
 * absences are projected only after the complete current graph independently authenticates later
 * publications. This is private provenance, not current operational or parent acceptance.
 */
export async function readAzureTerraformNetworkRetirementGraphPrefix(
  originalRequest: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  currentWitness?: unknown,
) {
  require(originalRequest &&
    typeof originalRequest === 'object' &&
    !Array.isArray(originalRequest), 'original graph witness required');
  const original = structuredClone(originalRequest),
    originalSha256 = canonicalSha256(original),
    originalMatches = canonicalSnapshot(original),
    plan = structuredClone(request),
    ownedSite = structuredClone(site),
    owner = structuredClone(store.owner),
    directory = store.directory,
    read = store.read,
    verify = store.verify,
    loadSource = loaders.loadSource,
    loadOutcome = loaders.loadOutcome;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(originalMatches(originalRequest) &&
      same(request, plan) &&
      same(site, ownedSite) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      store.read === read &&
      store.verify === verify &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome === loadOutcome, 'original prefix request or dependency changed');
  };
  const step = async <T>(action: () => Promise<T>): Promise<T> => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const currentRead = () =>
    step(() =>
      currentWitness === undefined
        ? readAzureTerraformNetworkRetirementGraph(
            plan,
            store,
            loaders,
            ownedSite,
            verifier,
            deadline,
            replacementVerifier,
          )
        : recheckAzureTerraformNetworkRetirementGraph(
            currentWitness,
            plan,
            store,
            loaders,
            ownedSite,
            verifier,
            deadline,
            replacementVerifier,
          ),
    );
  const current = await currentRead(),
    currentSha256 = canonicalSha256(current);
  keys(original, Object.keys(current));
  if (originalSha256 === currentSha256) {
    seal();
    return structuredClone(current);
  }
  const frozen = original as typeof current,
    originalSnapshot = frozen.checkpoint?.snapshot,
    currentSnapshot = current.checkpoint.snapshot;
  require(originalSnapshot &&
    currentSnapshot &&
    Number.isSafeInteger(originalSnapshot.checkpoint.revision) &&
    originalSnapshot.checkpoint.revision >= 0 &&
    originalSnapshot.checkpoint.revision <= currentSnapshot.checkpoint.revision &&
    same(frozen.original, current.original), 'original source or checkpoint ancestry differs');
  require(frozen.packetSha256ByName &&
    typeof frozen.packetSha256ByName === 'object' &&
    !Array.isArray(frozen.packetSha256ByName) &&
    Array.isArray(frozen.absentPackets) &&
    frozen.absentPackets.every((name) => typeof name === 'string') &&
    new Set(frozen.absentPackets).size === frozen.absentPackets.length, 'original packet inventory schema differs');
  const pointer = `${plan.planId}-terraform-network-driver-checkpoint.json`,
    revisionPrefix = `${plan.planId}-terraform-network-driver-revision-`,
    originalRevision = `${revisionPrefix}${originalSnapshot.checkpoint.revision}.json`,
    originalPackets = frozen.packetSha256ByName,
    currentPackets = current.packetSha256ByName,
    originalAbsent = new Set(frozen.absentPackets),
    currentAbsent = new Set(current.absentPackets);
  const safeName = (name: string) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name);
  for (const [name, digest] of Object.entries(originalPackets)) {
    require(safeName(name) &&
      /^[a-f0-9]{64}$/.test(digest) &&
      !originalAbsent.has(name) &&
      (name === pointer || currentPackets[name] === digest), 'original immutable graph packet changed or disappeared');
  }
  require(originalPackets[originalRevision] === originalSnapshot.checkpointSha256 &&
    currentPackets[originalRevision] === originalSnapshot.checkpointSha256 &&
    originalPackets[originalRevision] ===
      canonicalSha256(
        originalSnapshot.checkpoint,
      ), 'original immutable checkpoint is not retained in current ancestry');
  for (const name of originalAbsent)
    require(safeName(name) &&
      (currentPackets[name] !== undefined ||
        currentAbsent.has(name)), 'original absence has no independently qualified current publication or absence');
  const pointerDigest = originalPackets[pointer],
    pointerRevisions = Object.keys(originalPackets).filter((name) => {
      if (!name.startsWith(revisionPrefix) || !name.endsWith('.json')) return false;
      const revision = Number(name.slice(revisionPrefix.length, -5));
      return (
        Number.isSafeInteger(revision) &&
        revision >= 0 &&
        name === `${revisionPrefix}${revision}.json` &&
        revision <= originalSnapshot.checkpoint.revision &&
        originalPackets[name] === pointerDigest
      );
    });
  require(pointerDigest &&
    pointerRevisions.length === 1, 'original moving pointer lacks its exact retained immutable revision');
  const observe = async (name: string): Promise<unknown | undefined> => {
    let value: unknown;
    try {
      value = await step(() => read.call(store, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      require(currentPackets[name] === undefined &&
        currentAbsent.has(name), 'current verified packet disappeared during prefix read');
      return undefined;
    }
    require(currentPackets[name] !== undefined &&
      canonicalSha256(value) === currentPackets[name], 'current publication changed during original prefix read');
    return structuredClone(value);
  };
  const projectedRead = async (name: string) => {
    require(originalPackets[name] !== undefined || originalAbsent.has(name), 'undeclared original prefix read');
    const observed = await observe(name);
    if (originalAbsent.has(name))
      throw Object.assign(Error('Absent in authenticated original graph prefix'), { code: 'ENOENT' });
    if (name === pointer) {
      const revision = await observe(pointerRevisions[0]);
      require(revision !== undefined &&
        canonicalSha256(revision) === pointerDigest, 'original retained pointer revision changed');
      return revision;
    }
    require(observed !== undefined &&
      canonicalSha256(observed) === originalPackets[name], 'original prefix packet changed');
    return observed;
  };
  const projectedVerify = () => step(() => verify.call(store));
  const projected = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return projectedRead;
      if (key === 'verify') return projectedVerify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Original graph prefix inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  historicalInventories.set(projected, {
    planSha256: plan.planSha256,
    currentNames: Object.keys(currentPackets)
      .filter((name) => name.startsWith(`${plan.planId}-terraform-network-`))
      .sort(),
    originalNames: Object.keys(originalPackets)
      .filter((name) => name.startsWith(`${plan.planId}-terraform-network-`))
      .sort(),
  });
  try {
    const reconstructed = await step(() =>
      readAzureTerraformNetworkRetirementGraph(
        plan,
        projected,
        loaders,
        ownedSite,
        verifier,
        deadline,
        replacementVerifier,
      ),
    );
    require(canonicalSha256(reconstructed) === originalSha256, 'reconstructed original graph witness differs');
    require(canonicalSha256(await currentRead()) ===
      currentSha256, 'current graph changed across original prefix inspection');
    seal();
    return reconstructed;
  } finally {
    historicalInventories.delete(projected);
  }
}

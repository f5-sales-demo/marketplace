import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import {
  type AzureTerraformNetworkAcceptanceVerifier,
  AzureTerraformNetworkCheckpoint,
} from './terraform-network-checkpoint';
import { readAzureTerraformNetworkCompletionHistory } from './terraform-network-completion-history';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkPacketNames } from './terraform-network-retirement-graph';
import { readAzureTerraformNetworkSourceHistory } from './terraform-network-source-history';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network retirement checkpoint: ${message}`);
}

/** Private read-only checkpoint authorization, including a durable next revision whose pointer
 * publication was lost. Uses actual stored revisions; never writes a pointer, runs a stage, or
 * treats checkpoint provenance as current CE health or permission for parent deletion.
 */
export async function readAzureTerraformNetworkRetirementCheckpoint(
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
  const requestMatches = canonicalSnapshot(plan),
    siteMatches = canonicalSnapshot(site),
    ownerMatches = canonicalSnapshot(owner);
  const unchanged = () =>
    require(requestMatches(request) &&
      siteMatches(siteRequest) &&
      ownerMatches(store.owner) &&
      store.directory === directory &&
      store.read === read &&
      store.verify === verify &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome === loadOutcome, 'request or dependency identity changed during inspection');
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
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
  const packetSha256ByName: Record<string, string> = {},
    absentPackets = new Set<string>();
  const trackedRead = async (name: string) => {
    let value: unknown;
    try {
      value = await bounded(() => read.call(store, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        require(packetSha256ByName[name] === undefined, 'present packet disappeared');
        absentPackets.add(name);
      }
      throw error;
    }
    require(!absentPackets.has(name), 'absent packet appeared');
    const digest = canonicalSha256(value);
    require(packetSha256ByName[name] === undefined ||
      packetSha256ByName[name] === digest, 'packet changed between checkpoint reads');
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
          throw Error('Checkpoint history inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const historical: AzureTerraformNetworkAcceptanceVerifier = (receipt, identity, mode) => {
    require(mode === 'historical', 'retirement checkpoint cannot request current acceptance');
    return bounded(() => verifier(structuredClone(receipt), structuredClone(identity), mode, deadline));
  };
  const sources = new Map<string, string>(),
    outcomes = new Map<string, { plan: AzureCePlan; digest: string }>();
  const trackedLoaders: AzureTerraformNetworkHistoryLoaders = {
    async loadSource(digest) {
      const value = await bounded(() => loadSource.call(loaders, digest)),
        actual = canonicalSha256(value);
      require(!sources.has(digest) || sources.get(digest) === actual, 'original source loader result changed');
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(input) {
      const value = await bounded(() => loadOutcome.call(loaders, structuredClone(input))),
        digest = canonicalSha256(value);
      require(!outcomes.has(input.planSha256) ||
        outcomes.get(input.planSha256)?.digest === digest, 'original outcome loader result changed');
      outcomes.set(input.planSha256, { plan: structuredClone(input), digest });
      return structuredClone(value);
    },
  };
  const source = await bounded(() =>
    readAzureTerraformNetworkSourceHistory(
      plan,
      readonlyStore,
      trackedLoaders,
      site,
      historical,
      deadline,
      replacementVerifier,
    ),
  );
  const prefix = `${plan.planId}-terraform-network-driver-`,
    pointer = `${prefix}checkpoint.json`;
  const inventory = () => bounded(async () => readAzureTerraformNetworkPacketNames(store, plan));
  const names = await inventory();
  const optional = async (name: string) => {
    try {
      return await trackedRead(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  const rootName = `${prefix}root.json`,
    completeName = `${prefix}complete.json`,
    currentFinalName = `${prefix}current-final.json`,
    root = await optional(rootName),
    originalPointer = await optional(pointer),
    complete = await optional(completeName),
    currentFinal = await optional(currentFinalName);
  const revisions = names.filter((name) => name.startsWith(`${prefix}revision-`));
  require(names
    .filter((name) => name.startsWith(prefix))
    .every(
      (name) =>
        name === pointer ||
        name === rootName ||
        name === completeName ||
        name === currentFinalName ||
        revisions.includes(name),
    ), 'unrecognized driver packet');
  const initial = {
    schemaVersion: 1,
    kind: 'azure-terraform-network-serial-checkpoint',
    engine: 'terraform',
    owner,
    planSha256: plan.planSha256,
    sourceBindingSha256: canonicalSha256(source.binding),
    nodes: [{ node: 1, before: source.binding.before, phase: 'prepared' }],
    revision: 0,
    previousCheckpointSha256: null,
    lastTransition: null,
  };
  if (root !== undefined)
    require(same(root, {
      schemaVersion: 1,
      initialCheckpointSha256: canonicalSha256(initial),
    }), 'original root marker differs');
  const inspect = (override?: unknown) => {
    const selectedStore =
      override === undefined
        ? readonlyStore
        : new Proxy(readonlyStore, {
            get(target, key) {
              if (key === 'read')
                return async (name: string) => {
                  const value = await optional(name);
                  return name === pointer ? structuredClone(override) : value;
                };
              return Reflect.get(target, key, target);
            },
          });
    return bounded(() =>
      AzureTerraformNetworkCheckpoint.inspect(plan, source.binding, selectedStore, historical, deadline),
    );
  };
  let snapshot: Awaited<ReturnType<typeof inspect>> | undefined;
  let pointerPublication: 'source-only' | 'root-only' | 'pending-initial' | 'current' | 'pending-revision';
  if (originalPointer === undefined) {
    require(complete === undefined &&
      currentFinal === undefined, 'terminal publication without original checkpoint pointer');
    require(!names.some((name) =>
      name.startsWith(`${plan.planId}-terraform-network-node-`),
    ), 'stage publication without original checkpoint pointer');
    require(revisions.length === 0 ||
      same(revisions, [`${prefix}revision-0.json`]), 'later or malformed revision without original checkpoint pointer');
    require(root !== undefined || names.every((name) => !name.startsWith(prefix)), 'driver packets without root');
    if (revisions.length) {
      snapshot = await inspect(await trackedRead(revisions[0]));
      pointerPublication = 'pending-initial';
    } else pointerPublication = root === undefined ? 'source-only' : 'root-only';
  } else {
    const current = await inspect();
    const nextName = `${prefix}revision-${current.checkpoint.revision + 1}.json`;
    require(revisions.every((name) => {
      const suffix = name.slice(`${prefix}revision-`.length),
        match = /^(0|[1-9][0-9]*)\.json$/.exec(suffix);
      return !!match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) <= current.checkpoint.revision + 1;
    }), 'unexplained later or malformed immutable revision');
    snapshot = current;
    pointerPublication = 'current';
    if (names.includes(nextName)) {
      const next = (await trackedRead(nextName)) as Record<string, unknown>;
      require(next &&
        next.revision === current.checkpoint.revision + 1 &&
        next.previousCheckpointSha256 ===
          current.checkpointSha256, 'pending revision does not follow original pointer');
      snapshot = await inspect(next);
      pointerPublication = 'pending-revision';
    }
  }
  const completionSha256ByName: Record<string, string> = {};
  require(complete !== undefined || currentFinal === undefined, 'current final without original completion');
  if (complete !== undefined) {
    require(pointerPublication === 'current' &&
      snapshot?.allNodesAccepted, 'terminal publication without complete published serial history');
    const history = await bounded(() =>
      readAzureTerraformNetworkCompletionHistory(
        plan,
        readonlyStore,
        trackedLoaders,
        historical,
        deadline,
        replacementVerifier,
      ),
    );
    require(history.checkpointSha256 === snapshot.checkpointSha256 &&
      history.sourceBindingSha256 ===
        canonicalSha256(source.binding), 'terminal history differs from original checkpoint');
    completionSha256ByName[completeName] = history.completionSha256;
    if (currentFinal !== undefined) {
      // Validate the actual retained current-final packet under the same complete schema and
      // historical joins. This establishes provenance only, never current health/freshness.
      const currentStore = new Proxy(readonlyStore, {
        get(target, key) {
          if (key === 'read') return (name: string) => trackedRead(name === completeName ? currentFinalName : name);
          return Reflect.get(target, key, target);
        },
      });
      const currentHistory = await bounded(() =>
        readAzureTerraformNetworkCompletionHistory(
          plan,
          currentStore,
          trackedLoaders,
          historical,
          deadline,
          replacementVerifier,
        ),
      );
      require(currentHistory.checkpointSha256 === snapshot.checkpointSha256 &&
        currentHistory.sourceBindingSha256 === canonicalSha256(source.binding), 'current-final provenance differs');
      completionSha256ByName[currentFinalName] = currentHistory.completionSha256;
    }
  }
  require(same(await inventory(), names), 'checkpoint directory changed during inspection');
  for (const [digest, expected] of sources)
    require(canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) ===
      expected, 'original source loader result changed before final boundary');
  for (const { plan: original, digest } of outcomes.values())
    require(canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(original)))) ===
      digest, 'original outcome loader result changed before final boundary');
  await trackedVerify();
  for (const [name, digest] of Object.entries(packetSha256ByName))
    require(canonicalSha256(await bounded(() => read.call(store, name))) ===
      digest, 'checkpoint or original source history changed before final boundary');
  for (const name of absentPackets) require((await optional(name)) === undefined, 'absent checkpoint packet appeared');
  require(same(await inventory(), names), 'checkpoint directory changed before final boundary');
  return {
    schemaVersion: 1 as const,
    scope: 'network-retirement-checkpoint-history' as const,
    snapshot,
    pointerPublication,
    originalSourceBindingSha256: canonicalSha256(source.binding),
    packetSha256ByName,
    completionSha256ByName,
    absentPackets: [...absentPackets].sort(),
    unverifiedNetworkPacketNames: names.filter((name) => packetSha256ByName[name] === undefined),
    currentOperationalAcceptanceQualified: false as const,
    retirementQualified: false as const,
  };
}

import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { readAzureCePlanInventory, type SessionManagerLike } from './artifacts';
import { canonicalSha256 } from './canonical';
import type {
  AzureNetworkParentPublicOutcomeRead,
  AzureNetworkParentPublicSourceRead,
} from './terraform-network-parent-public-bindings';
import { readAzureTerraformNetworkRetirementRequests } from './terraform-network-retirement-requests';
import { AzureTerraformOutcomeAbsent, loadAzureTerraformOutcome } from './terraform-outcome';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import type { AzureCePlan } from './types';

interface Binding {
  publicEvidenceSnapshotSha256?: string;
  publicPlanInventorySha256: unknown;
  requestInventorySha256: unknown;
  publicBindings: {
    sources: AzureNetworkParentPublicSourceRead[];
    outcomes: AzureNetworkParentPublicOutcomeRead[];
  };
}
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure network parent public custody: ${message}`);
}

/** Independently resolve the exact public source/outcome mapping without opening private
 * historical packets. The caller must authenticate this retained mapping through the
 * permanent native barrier before using it for parent resume. Matching public evidence
 * grants no deletion or native/operational acceptance. Global public inventory changes
 * remain changes; independent deployment fields are never silently discarded.
 */
export async function readAzureTerraformNetworkParentPublicCustody(
  request: AzureCePlan,
  session: SessionManagerLike,
  retained: Binding,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    binding = structuredClone(retained),
    directory = session.getArtifactsDir(),
    sessionId = session.getSessionId();
  const callbacks = ['getArtifactsDir', 'getSessionId', 'getArtifactPath', 'saveArtifact'].map((key) => ({
    key,
    value: Reflect.get(session, key),
  }));
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const nativeSeal = () => {
    deadline.throwIfAborted();
    require(same(request, original) &&
      same(retained, binding) &&
      callbacks.every(({ key, value }) => Reflect.get(session, key) === value), 'owning public context changed');
  };
  const seal = () => {
    nativeSeal();
    require(session.getArtifactsDir() === directory &&
      session.getSessionId() === sessionId, 'owning public context changed');
    nativeSeal();
  };
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const nativeStep = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    nativeSeal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      active.throwIfAborted();
      nativeSeal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  require(directory && isAbsolute(directory), 'durable public evidence directory required');
  require(sha(binding.publicPlanInventorySha256) &&
    sha(binding.requestInventorySha256) &&
    binding.publicBindings &&
    Array.isArray(binding.publicBindings.sources) &&
    Array.isArray(binding.publicBindings.outcomes), 'complete native-bound public mapping required');
  const sourceRows = binding.publicBindings.sources,
    outcomeRows = binding.publicBindings.outcomes;
  require(sourceRows.length > 0 &&
    sourceRows.every(
      (row) =>
        sha(row.planSha256) && sha(row.sourceSha256) && Object.keys(row).sort().join(',') === 'planSha256,sourceSha256',
    ) &&
    new Set(sourceRows.map((row) => row.planSha256)).size ===
      sourceRows.length, 'missing, malformed or duplicate public source mapping');
  require(outcomeRows.every(
    (row) =>
      sha(row.planSha256) &&
      sha(row.sourceSha256) &&
      Object.keys(row).sort().join(',') === 'outcomeSha256,planSha256,publication,sourceSha256' &&
      (row.publication === 'published'
        ? sha(row.outcomeSha256)
        : row.publication === 'absent' && row.outcomeSha256 === null) &&
      sourceRows.some((source) => source.planSha256 === row.planSha256 && source.sourceSha256 === row.sourceSha256),
  ) &&
    new Set(outcomeRows.map((row) => row.planSha256)).size ===
      outcomeRows.length, 'malformed, duplicate or foreign public outcome mapping');
  require(outcomeRows.some((row) => row.planSha256 === original.planSha256), 'original public outcome mapping missing');
  const snapshot = async (parent?: AbortSignal) => {
    seal();
    const root = await nativeStep(() => lstat(directory), parent);
    require(root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 0o077) === 0 &&
      (await nativeStep(() => realpath(directory), parent)) === directory, 'public directory ownership differs');
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    const names = (await nativeStep(() => readdir(directory), parent))
      .filter((name) => name.endsWith('.azure-ce-plan.log') || name.endsWith('.azure-ce-terraform-checkpoint.log'))
      .sort();
    const files = [];
    for (const name of names) {
      require(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name), 'foreign public evidence filename');
      const file = await nativeStep(() => readAzureTerraformParentPrivateFile(join(directory, name), deadline), parent);
      let value: unknown;
      try {
        value = JSON.parse(file.bytes.toString());
      } catch {
        throw Error('Azure network parent public custody: malformed public evidence');
      }
      require(value && typeof value === 'object' && !Array.isArray(value), 'malformed public evidence');
      files.push({ name, identity: file.identity, sha256: createHash('sha256').update(file.bytes).digest('hex') });
    }
    const after = await nativeStep(() => lstat(directory), parent);
    require(after.isDirectory() &&
      !after.isSymbolicLink() &&
      after.uid === root.uid &&
      (after.mode & 0o077) === 0 &&
      (await nativeStep(() => realpath(directory), parent)) === directory &&
      `${after.dev}:${after.ino}:${after.birthtimeMs}` === identity &&
      same(
        (await nativeStep(() => readdir(directory), parent))
          .filter((name) => name.endsWith('.azure-ce-plan.log') || name.endsWith('.azure-ce-terraform-checkpoint.log'))
          .sort(),
        names,
      ), 'public evidence namespace changed');
    nativeSeal();
    return { identity, files };
  };
  const first = await snapshot();
  require(!Object.hasOwn(binding, 'publicEvidenceSnapshotSha256') ||
    (sha(binding.publicEvidenceSnapshotSha256) &&
      canonicalSha256(first) === binding.publicEvidenceSnapshotSha256), 'native-bound public namespace changed');
  const inspect = async (parent?: AbortSignal) => {
    require(same(await snapshot(parent), first), 'public evidence bytes, inode or namespace changed');
    const requests = await step(() => readAzureTerraformNetworkRetirementRequests(original, session, deadline), parent);
    require(requests.publicPlanInventorySha256 === binding.publicPlanInventorySha256 &&
      requests.requestInventorySha256 === binding.requestInventorySha256, 'exact public request inventory changed');
    require([original.planSha256, ...requests.requests.map((row) => row.planSha256)].every((digest) =>
      sourceRows.some((row) => row.planSha256 === digest),
    ), 'public request missing from retained source mapping');
    require(requests.requests.every((row) =>
      outcomeRows.some((outcome) => outcome.planSha256 === row.planSha256),
    ), 'public request missing from retained outcome mapping');
    const inventory = await step(() => readAzureCePlanInventory(session, deadline), parent);
    require(inventory.sourceSha256 === binding.publicPlanInventorySha256, 'public source inventory changed');
    const plans = new Map(inventory.plans.map(({ plan }) => [plan.planSha256, plan]));
    for (const row of sourceRows)
      require(plans.has(row.planSha256) &&
        canonicalSha256(plans.get(row.planSha256)) === row.sourceSha256, 'public source missing or changed');
    for (const row of outcomeRows) {
      const source = plans.get(row.planSha256);
      require(source, 'public outcome source missing');
      let outcome: unknown,
        absent = false;
      try {
        outcome = await step(() => loadAzureTerraformOutcome(session, source), parent);
      } catch (error) {
        if (!(error instanceof AzureTerraformOutcomeAbsent)) throw error;
        absent = true;
      }
      require(row.publication === (absent ? 'absent' : 'published') &&
        (absent
          ? row.outcomeSha256 === null
          : row.outcomeSha256 === canonicalSha256({ value: outcome })), 'public outcome publication changed');
    }
    await step(() => requests.recheck(), parent);
    await step(() => inventory.recheck(), parent);
    require(same(await snapshot(parent), first), 'public evidence bytes, inode or namespace changed');
    // No external session callback follows the final exhaustive native snapshot.
    nativeSeal();
  };
  await inspect();
  return {
    schemaVersion: 1 as const,
    scope: 'post-parent-public-evidence-match-only' as const,
    originalPlanSha256: original.planSha256,
    publicBindingsSha256: canonicalSha256(binding),
    publicEvidenceSnapshotSha256: canonicalSha256(first),
    parentRetirementQualified: false as const,
    nativeBarrierReadQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
    recheck: inspect,
  };
}

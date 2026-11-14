import { canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureCePlan } from './types';

export interface AzureNetworkParentPublicSourceRead {
  planSha256: string;
  sourceSha256: string;
}
export interface AzureNetworkParentPublicOutcomeRead {
  planSha256: string;
  sourceSha256: string;
  publication: 'published' | 'absent';
  outcomeSha256: string | null;
}
const sha = (value: string) => /^[a-f0-9]{64}$/.test(value);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure network parent public bindings: ${message}`);
}

/** Observe exact callbacks consumed by owning semantic readers. These hashes grant no
 * execution, freshness, native-barrier, or deletion authority. The caller must authenticate
 * the reader results and freeze the complete mapping into permanent native evidence.
 * No raw source/outcome payload is returned in the retained mapping.
 */
export function captureAzureNetworkParentPublicBindings(
  owningLoaders: AzureTerraformNetworkHistoryLoaders,
  signal: AbortSignal,
  assertContext: () => void,
) {
  const loadSource = owningLoaders.loadSource,
    loadOutcome = owningLoaders.loadOutcome;
  const sources = new Map<string, AzureNetworkParentPublicSourceRead>();
  const outcomes = new Map<string, { input: AzureCePlan; record: AzureNetworkParentPublicOutcomeRead }>();
  const boundary = () => {
    signal.throwIfAborted();
    assertContext();
    require(owningLoaders.loadSource === loadSource &&
      owningLoaders.loadOutcome === loadOutcome, 'owning loader changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    boundary();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      boundary();
      return result;
    } catch (error) {
      boundary();
      throw error;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };
  const sourceRecord = (plan: AzureCePlan) => {
    require(sha(plan.planSha256), 'execution source identifier unresolved');
    const record = { planSha256: plan.planSha256, sourceSha256: canonicalSha256(plan) };
    const previous = sources.get(record.planSha256);
    require(!previous || previous.sourceSha256 === record.sourceSha256, 'repeated source changed');
    sources.set(record.planSha256, record);
    return record;
  };
  const loaders: AzureTerraformNetworkHistoryLoaders = {
    async loadSource(digest) {
      boundary();
      require(sha(digest), 'execution source identifier unresolved');
      const value = structuredClone(await step(() => loadSource.call(owningLoaders, digest)));
      require(value.planSha256 === digest, 'loaded source identity differs');
      sourceRecord(value);
      boundary();
      return value;
    },
    async loadOutcome(plan) {
      boundary();
      const input = structuredClone(plan),
        source = sourceRecord(input),
        callbackInput = structuredClone(input);
      const previous = outcomes.get(input.planSha256);
      let value: Record<string, unknown> | undefined, absence: unknown;
      try {
        value = structuredClone(await step(() => loadOutcome.call(owningLoaders, callbackInput)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        absence = error;
      }
      boundary();
      require(absence ||
        (value && typeof value === 'object' && !Array.isArray(value)), 'complete outcome or explicit absence required');
      require(canonicalSha256(callbackInput) === source.sourceSha256 &&
        canonicalSha256(plan) === source.sourceSha256, 'outcome source input changed');
      const record: AzureNetworkParentPublicOutcomeRead = {
        ...source,
        publication: absence ? 'absent' : 'published',
        outcomeSha256: absence ? null : canonicalSha256({ value }),
      };
      require(!previous || canonicalSha256(previous.record) === canonicalSha256(record), 'repeated outcome changed');
      outcomes.set(input.planSha256, { input, record });
      if (absence) throw absence;
      return value as Record<string, unknown>;
    },
  };
  const snapshot = () => {
    boundary();
    return {
      sources: [...sources.values()]
        .sort((a, b) => a.planSha256.localeCompare(b.planSha256))
        .map((row) => ({ ...row })),
      outcomes: [...outcomes.values()]
        .map(({ record }) => ({ ...record }))
        .sort((a, b) => a.planSha256.localeCompare(b.planSha256)),
    };
  };
  return {
    loaders,
    snapshot,
    async recheck() {
      const expected = canonicalSha256(snapshot());
      for (const digest of [...sources.keys()].sort()) await loaders.loadSource(digest);
      for (const { input, record } of [...outcomes.values()]) {
        try {
          await loaders.loadOutcome(structuredClone(input));
        } catch (error) {
          if (record.publication !== 'absent' || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      require(canonicalSha256(snapshot()) === expected, 'public mapping changed across recheck');
    },
  };
}

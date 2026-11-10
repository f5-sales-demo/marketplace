import { createHash } from 'node:crypto';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed historical evidence');
  return value as Record<string, unknown>;
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, ordered(item)]),
    );
  return value;
}
export const historicalEvidenceSha256 = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(ordered(value)))
    .digest('hex');

/** Additive history references preserve complete evidence; they never qualify current rows. */
export function resolveHistoricalEvidence(ledger: unknown, value: unknown): Record<string, unknown> {
  const entry = object(value);
  if (!Object.hasOwn(entry, 'evidenceStateSha256')) return structuredClone(entry);
  const digest = entry.evidenceStateSha256;
  if (Object.keys(entry).length !== 1 || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
    throw Error('Malformed historical evidence reference');
  const pool = object(object(ledger).historicalEvidenceStates);
  if (pool.schemaVersion !== 1) throw Error('Unsupported historical evidence pool');
  const state = object(object(pool.states)[digest]);
  if (Object.hasOwn(state, 'evidenceStateSha256') || historicalEvidenceSha256(state) !== digest)
    throw Error('Historical evidence state digest differs');
  return structuredClone(state);
}

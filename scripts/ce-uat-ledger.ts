import rawLedger from '../benchmarks/ce-uat-ledger.json';
import { historicalEvidenceSha256 } from './ce-uat-history';

type Evidence = { status: string; receipts: string[] };
type PublicInterface = {
  tool: string;
  source: string;
  parameters: Record<string, unknown>;
};
type AdditionalInterface = PublicInterface & {
  status: string;
  automated: { status: string; tests: string[] };
  installed: Evidence;
  live: Evidence;
};
type Row = {
  id: string;
  cloud: string;
  engine: string;
  profile: string;
  feature: string;
  status: string;
  publicInterface: PublicInterface;
  automated: { status: string; tests: string[] };
  installed: Evidence;
  live: Evidence;
  historicalEvidence: unknown[];
  historicalQualifications?: unknown[];
  additionalPublicInterfaces?: AdditionalInterface[];
};
type Ledger = Omit<typeof rawLedger, 'rows'> & { rows: Row[] };
const IDENTITY = ['id', 'cloud', 'engine', 'profile', 'feature'];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed CE UAT row evidence');
  return value as Record<string, unknown>;
}

/** Expand shared row evidence only after checking its immutable digest and identity boundary. */
export function expandCeUatLedger(value: unknown): Record<string, unknown> {
  const ledger = object(value);
  if (ledger.schemaVersion !== 2) throw Error('Unsupported CE UAT ledger version');
  const pool = object(ledger.rowEvidenceStates);
  if (pool.schemaVersion !== 1) throw Error('Unsupported CE UAT row evidence pool');
  const states = object(pool.states);
  if (!Array.isArray(ledger.rows)) throw Error('Missing CE UAT matrix');
  const rows = ledger.rows.map((raw) => {
    const row = object(raw);
    // Readiness also accepts its own already-expanded result; row identity remains authoritative.
    if (!Object.hasOwn(row, 'rowStateSha256')) return structuredClone(row);
    const digest = row.rowStateSha256;
    if (
      typeof digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      Object.keys(row).length !== IDENTITY.length + 1 ||
      IDENTITY.some((key) => typeof row[key] !== 'string')
    )
      throw Error('Malformed CE UAT row evidence reference');
    const state = object(states[digest]);
    if (
      IDENTITY.some((key) => Object.hasOwn(state, key)) ||
      Object.hasOwn(state, 'rowStateSha256') ||
      historicalEvidenceSha256(state) !== digest
    )
      throw Error('CE UAT row evidence digest or identity differs');
    const identity = Object.fromEntries(IDENTITY.map((key) => [key, row[key]]));
    return { ...identity, ...structuredClone(state) };
  });
  return { ...structuredClone(ledger), rows };
}

export const ceUatLedger = expandCeUatLedger(rawLedger) as Ledger;

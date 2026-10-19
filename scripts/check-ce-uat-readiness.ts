import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed CE UAT ledger');
  return value as Json;
};
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v))
    throw Error('Malformed CE UAT ledger collection');
  return value;
};
export const REQUIRED_FEATURES = [
  'discovery',
  'planning',
  'bootstrap',
  'registration',
  'site-create',
  'site-read',
  'site-update',
  'inventory',
  'status',
  'diagnosis',
  'interface-identity',
  'routing-bgp',
  'ingress-vip',
  'traffic-return-path',
  'software-upgrade',
  'os-upgrade',
  'failover',
  'replacement',
  'interruption-resume',
  'wrong-engine-rejection',
  'coordinated-teardown',
  'independent-absence',
  'empty-state',
  'final-no-change',
];
const REQUIRED_GATES = [
  '1930-sli-transition',
  '1930-freshness',
  '1930-permissions',
  'site-update-schema',
  'aws-terraform-recovery',
  'azure-route-server',
  'live-matrix',
  'producer-publication',
  'installed-cohort',
  'human-uat',
];
export function ceUatReadiness(value: unknown) {
  const ledger = object(value);
  if (ledger.schemaVersion !== 1) throw Error('Unsupported CE UAT ledger version');
  const features = strings(ledger.requiredFeatures);
  if (features.length !== REQUIRED_FEATURES.length || REQUIRED_FEATURES.some((f) => !features.includes(f)))
    throw Error('Required CE UAT feature scope changed');
  if (!Array.isArray(ledger.rows) || !Array.isArray(ledger.gates)) throw Error('Missing CE UAT matrix or gates');
  const expected = new Set(
    ['aws', 'azure'].flatMap((cloud) =>
      ['native', 'terraform'].flatMap((engine) =>
        ['single-site', 'independent-sites', 'three-node-ha'].flatMap((profile) =>
          REQUIRED_FEATURES.map((feature) => `${cloud}/${engine}/${profile}/${feature}`),
        ),
      ),
    ),
  );
  const blockers: string[] = [];
  for (const raw of ledger.rows) {
    const row = object(raw);
    if (typeof row.id !== 'string' || !expected.delete(row.id))
      throw Error('Duplicate or unexpected CE UAT feature row');
    const api = object(row.publicInterface);
    if (typeof api.tool !== 'string' || typeof api.source !== 'string')
      throw Error('Missing public CE interface mapping');
    const automated = object(row.automated);
    strings(automated.tests);
    const installed = object(row.installed),
      live = object(row.live);
    if (
      row.status !== 'verified' ||
      automated.status !== 'verified' ||
      installed.status !== 'verified' ||
      live.status !== 'verified' ||
      !strings(installed.receipts).length ||
      !strings(live.receipts).length
    )
      blockers.push(row.id);
  }
  if (expected.size) throw Error('Required CE UAT feature rows missing');
  const gates = new Set(REQUIRED_GATES);
  for (const raw of ledger.gates) {
    const gate = object(raw);
    if (typeof gate.id !== 'string' || !gates.delete(gate.id)) throw Error('Duplicate or unexpected CE UAT gate');
    if (gate.status !== 'verified' || !Array.isArray(gate.receipts) || !strings(gate.receipts).length)
      blockers.push(`gate:${gate.id}`);
  }
  if (gates.size) throw Error('Required CE UAT gates missing');
  const cohort = object(ledger.cohort);
  if (typeof cohort.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(cohort.sourceCommit))
    blockers.push('cohort:validated-source-commit');
  if (!Array.isArray(cohort.archives) || cohort.archives.length !== 4) blockers.push('cohort:four-immutable-archives');
  const ready = blockers.length === 0;
  if (ledger.releaseReady === true && !ready) throw Error('CE UAT readiness claim contradicts required evidence');
  return { releaseReady: ready, requiredRows: ledger.rows.length, blockers };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ledger = JSON.parse(await readFile(new URL('../benchmarks/ce-uat-ledger.json', import.meta.url), 'utf8'));
  const result = ceUatReadiness(ledger);
  console.log(
    JSON.stringify({
      releaseReady: result.releaseReady,
      requiredRows: result.requiredRows,
      blockingRowsAndGates: result.blockers.length,
    }),
  );
  if (!process.argv.includes('--audit') && !result.releaseReady) process.exitCode = 1;
}

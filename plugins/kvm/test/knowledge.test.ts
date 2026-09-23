import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const ledger = JSON.parse(readFileSync(join(root, 'knowledge', 'ledger.json'), 'utf8'));

test('knowledge ledger is canonical, complete, and references all source deliveries', () => {
  expect(ledger.schemaVersion).toBe('kvm-knowledge/v1');
  const required = [
    'id',
    'category',
    'hypothesis',
    'experiment',
    'evidence',
    'outcome',
    'rootCause',
    'rejectedApproaches',
    'correction',
    'pluginRequirement',
    'automatedTest',
    'liveAcceptance',
    'references',
  ];
  for (const entry of ledger.entries) for (const field of required) expect(entry[field]).toBeDefined();
  const refs = JSON.stringify(ledger.entries.flatMap((entry: { references: string[] }) => entry.references));
  for (const ref of [
    'marketplace#1330',
    'api-specs-enriched#1806',
    'terraform-provider-xcsh#2118',
    'terraform-provider-xcsh#2134',
    'multi-cloud-networking#1210',
    'multi-cloud-networking#1216',
    'multi-cloud-networking#1218',
    'multi-cloud-networking#1220',
    'multi-cloud-networking#1223',
    'multi-cloud-networking#1225',
  ]) {
    expect(refs).toContain(ref);
  }
});

test('README is generated from the ledger', () => {
  const generated = Bun.spawnSync(['python3', join(root, 'scripts', 'generate-knowledge-readme.py'), '--stdout']);
  expect(generated.exitCode).toBe(0);
  expect(new TextDecoder().decode(generated.stdout)).toBe(readFileSync(join(root, 'README.md'), 'utf8'));
});

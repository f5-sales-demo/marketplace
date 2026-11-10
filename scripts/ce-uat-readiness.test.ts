import { expect, test } from 'bun:test';
import ledger from '../benchmarks/ce-uat-ledger.json';
import { ceUatReadiness } from './check-ce-uat-readiness';

test('blocks delivery of the current incomplete 288-feature cohort', () => {
  const result = ceUatReadiness(ledger);
  expect(result.requiredRows).toBe(288);
  expect(result.releaseReady).toBe(false);
  expect(result.blockers).toContain('gate:1930-sli-transition');
  expect(result.blockers).toContain('gate:aws-terraform-recovery');
});
test('does not permit dropping a feature, profile, engine, or cloud row to make UAT pass', () => {
  for (const index of [0, 23, 71, 143, 215, 287]) {
    const candidate = structuredClone(ledger);
    candidate.rows.splice(index, 1);
    expect(() => ceUatReadiness(candidate)).toThrow(/missing/);
  }
});
test('rejects duplicate matrix entries and removal of explicit vendor or human acceptance gates', () => {
  const duplicate = structuredClone(ledger);
  duplicate.rows.push(duplicate.rows[0]);
  expect(() => ceUatReadiness(duplicate)).toThrow(/Duplicate/);
  for (const index of [0, 1, 2, 3, 9]) {
    const candidate = structuredClone(ledger);
    candidate.gates.splice(index, 1);
    expect(() => ceUatReadiness(candidate)).toThrow(/gates missing/);
  }
});
test('a claimed pass cannot override missing installed, live, immutable, or human receipts', () => {
  const candidate = structuredClone(ledger);
  candidate.releaseReady = true;
  expect(() => ceUatReadiness(candidate)).toThrow(/contradicts/);
});

test('installation resume cannot qualify an advertised whole-site power workflow', () => {
  const result = ceUatReadiness(ledger);
  expect(result.blockers).toContain('aws/native/single-site/interruption-resume:public:aws_ce_power');
  expect(result.blockers).toContain('aws/terraform/single-site/interruption-resume:public:aws_ce_power');
  const candidate = structuredClone(ledger);
  const row = candidate.rows.find((entry) => entry.id === 'aws/native/single-site/interruption-resume');
  if (!row?.additionalPublicInterfaces) throw Error('Power qualification mapping missing');
  const power = row.additionalPublicInterfaces[0];
  power.status = 'verified';
  expect(ceUatReadiness(candidate).blockers).toContain(
    'aws/native/single-site/interruption-resume:public:aws_ce_power',
  );
});

test('whole-site power coverage cannot be removed or duplicated to claim readiness', () => {
  for (const duplicate of [false, true]) {
    const candidate = structuredClone(ledger);
    const row = candidate.rows.find((entry) => entry.id === 'aws/native/single-site/interruption-resume');
    if (!row?.additionalPublicInterfaces) throw Error('Power qualification mapping missing');
    if (duplicate) row.additionalPublicInterfaces.push(row.additionalPublicInterfaces[0]);
    else delete row.additionalPublicInterfaces;
    expect(() => ceUatReadiness(candidate)).toThrow('power qualification mapping');
  }
});

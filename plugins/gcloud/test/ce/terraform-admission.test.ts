import { expect, it } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { admitGcpTerraformTransition, type GcpTerraformTransition } from '../../src/ce/terraform-admission';

function fixture() {
  const hash = 'a'.repeat(64),
    address = 'google_compute_instance.node';
  const intent: GcpTerraformTransition = {
    operation: 'resize',
    deploymentName: 'ce-test',
    addresses: [address],
    expectedActions: { [address]: ['update'] },
    savedPlanSha256: hash,
    configurationSha256: hash,
    providerLockSha256: hash,
    backendIdentity: 'local:ce-test',
  };
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: 'ce-test',
    engine: 'terraform',
    backendIdentity: 'local:ce-test',
    configurationSha256: hash,
    providerLockSha256: hash,
    planSha256: hash,
    noChanges: false,
    changes: [{ address, type: 'google_compute_instance', actions: ['update'] }],
  };
  return { intent, receipt };
}
it('admits exact owned resize without unrelated resource changes', () => {
  const f = fixture();
  expect(admitGcpTerraformTransition(f.intent, f.receipt).admitted).toBe(true);
  f.receipt.changes.push({
    address: 'google_compute_network.foreign',
    type: 'google_compute_network',
    actions: ['update'],
  });
  expect(() => admitGcpTerraformTransition(f.intent, f.receipt)).toThrow('unrelated');
});
it('rejects implicit replacement, provider actions and artifact/backend changes', () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.receipt.changes[0].actions = ['delete', 'create'];
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.planSha256 = 'b'.repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.backendIdentity = 'local:foreign';
    },
  ]) {
    const f = fixture();
    mutate(f);
    expect(() => admitGcpTerraformTransition(f.intent, f.receipt)).toThrow();
  }
});
it('teardown requires explicit destroy receipt and delete-only exact inventory', () => {
  const f = fixture();
  f.intent.operation = 'teardown';
  f.intent.expectedActions['google_compute_instance.node'] = ['delete'];
  f.receipt.changes[0].actions = ['delete'];
  expect(() => admitGcpTerraformTransition(f.intent, f.receipt)).toThrow('destroy');
  f.receipt.operation = 'destroy';
  expect(admitGcpTerraformTransition(f.intent, f.receipt).admitted).toBe(true);
});

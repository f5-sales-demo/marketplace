import { expect, test } from 'bun:test';
import type { AzureTerraformNetworkEmptyMainBindingContext } from '../../src/ce/terraform-network-empty-main-binding';
import { validateAzureTerraformParentTeardownReceipt } from '../../src/ce/terraform-parent-disposition';
import type { AzureCePlan } from '../../src/ce/types';

const base = { planSha256: 'a'.repeat(64) } as AzureCePlan;
const teardown = { planSha256: 'b'.repeat(64) } as AzureTerraformNetworkEmptyMainBindingContext['destroyTeardown'];
const final = { planSha256: 'c'.repeat(64), operation: 'destroy', noChanges: true, changes: [] };
const receipt = {
  status: 'retired',
  sourcePlanSha256: base.planSha256,
  teardownPlanSha256: teardown.planSha256,
  finalPlanSha256: final.planSha256,
  cloud: 'absent',
  sites: 'deleted',
  observedAt: '2026-10-27T00:00:00.000Z',
};
test('completed parent receipt requires exact native destroy identity and complete absence fields', () => {
  expect(validateAzureTerraformParentTeardownReceipt(receipt, base, teardown, final)).toEqual(receipt);
  for (const [key, value] of Object.entries({
    status: 'pending',
    sourcePlanSha256: 'd'.repeat(64),
    teardownPlanSha256: 'e'.repeat(64),
    finalPlanSha256: 'f'.repeat(64),
    cloud: 'owned',
    sites: 'pending',
    observedAt: 'bad',
    foreign: true,
  }))
    expect(() =>
      validateAzureTerraformParentTeardownReceipt({ ...receipt, [key]: value }, base, teardown, final),
    ).toThrow();
  for (const key of Object.keys(receipt)) {
    const partial = { ...receipt } as Record<string, unknown>;
    delete partial[key];
    expect(() => validateAzureTerraformParentTeardownReceipt(partial, base, teardown, final)).toThrow();
  }
  for (const mutation of [
    { operation: 'plan' },
    { noChanges: false },
    { changes: [{ actions: ['delete'] }] },
    { planSha256: 'f'.repeat(64) },
  ])
    expect(() =>
      validateAzureTerraformParentTeardownReceipt(receipt, base, teardown, { ...final, ...mutation }),
    ).toThrow();
});

import { expect, test } from 'bun:test';
import * as inserts from '../src/gcp-insert-evidence';
import { withInsertWitnesses } from './fixtures/original-insert-witness.fixture';

test('early numeric insertion identity must join the actual owning plan, scope and executor directory', async () => {
  expect(typeof inserts.collectOriginalEarlyGcpInsertIdentity).toBe('function');
  await withInsertWitnesses(async (input) => {
    const value = await inserts.collectOriginalEarlyGcpInsertIdentity({
      originalPlan: input.originalPlan,
      response: input.earlyResponse,
      binding: input.binding,
    });
    expect(value.targetId).toBe(input.insert.targetId);
    expect(value.nodeName).toBe(input.insert.nodeName);
    expect(value.operationId).toBe(input.insert.operationId);
    expect(value.address).toBe('google_compute_instance.node');
    expect(value.originalInsertQualified).toBe(false);
    expect(value.executionAuthorized).toBe(false);
    expect(await inserts.readOriginalEarlyGcpInsertIdentity(value)).toBe(value);
    await expect(inserts.readOriginalEarlyGcpInsertIdentity({ ...value })).rejects.toThrow('Original');
    expect(JSON.stringify(value)).not.toContain('example-private-bootstrap');
  });
});

test('copied early response or owning plan cannot supply original VM identity', async () => {
  expect(typeof inserts.collectOriginalEarlyGcpInsertIdentity).toBe('function');
  await withInsertWitnesses(async (input) => {
    for (const which of ['response', 'plan']) {
      await expect(
        inserts.collectOriginalEarlyGcpInsertIdentity({
          originalPlan: which === 'plan' ? { ...input.originalPlan } : input.originalPlan,
          response: which === 'response' ? { ...input.earlyResponse } : input.earlyResponse,
          binding: input.binding,
        }),
      ).rejects.toThrow('Original');
    }
  });
});

test('another actual plan with identical bytes cannot attest an early response from a different executor workspace', async () => {
  expect(typeof inserts.collectOriginalEarlyGcpInsertIdentity).toBe('function');
  await withInsertWitnesses(async (first) => {
    await withInsertWitnesses(async (second) => {
      expect(first.originalPlan.receipt.planSha256).toBe(second.originalPlan.receipt.planSha256);
      await expect(
        inserts.collectOriginalEarlyGcpInsertIdentity({
          originalPlan: second.originalPlan,
          response: first.earlyResponse,
          binding: first.binding,
        }),
      ).rejects.toThrow('directory');
    });
  });
});

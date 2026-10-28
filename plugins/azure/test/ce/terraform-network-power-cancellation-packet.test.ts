import { afterEach, expect, test } from 'bun:test';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { validateAzureTerraformPowerCancellationPacket } from '../../src/ce/terraform-network-power-cancellation-packet';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkPowerCancellationFixture } from './terraform-network-power-cancellation-fixture';

const address = 'azapi_resource_action.ce_network';
afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(operation: 'deallocate' | 'start', existing: boolean) {
  const f = await terraformNetworkPowerCancellationFixture(false, 1, operation, true, existing);
  await f.runCancellation();
  const name = await f.packetName();
  if (!name) throw Error('original cancellation packet missing');
  const packet = (await f.store.read(name)) as Record<string, unknown>;
  const bound = Object.fromEntries(
    Object.entries(packet).filter(
      ([key]) =>
        !['status', 'receipt', 'originalJournalSha256', 'prior', 'proposed', 'evidenceSha256', 'provenance'].includes(
          key,
        ),
    ),
  );
  const validate = (input: unknown, published = f.receipt) =>
    validateAzureTerraformPowerCancellationPacket(f.plan, f.before, 1, operation, bound, input, published);
  const rehash = (input: Record<string, unknown>) => {
    input.evidenceSha256 = canonicalSha256({
      ...bound,
      receipt: input.receipt,
      originalJournalSha256: input.originalJournalSha256,
      prior: input.prior,
      proposed: input.proposed,
    });
    return input;
  };
  return { ...f, packet, bound, name, validate, rehash };
}
for (const operation of ['deallocate', 'start'] as const)
  for (const existing of [false, true])
    test(`shared validator preserves actual ${operation} ${existing ? 'existing no-op' : 'unsubmitted create'} cancellation without runner mutation`, async () => {
      const f = await fixture(operation, existing),
        beforeCommands = [...f.commands],
        beforePacket = await readFile(join(f.store.directory, f.name)),
        beforeRunnerNames = (await readdir(f.directory)).sort();
      const original = structuredClone(f.packet);
      const { provenance: _provenance, ...preparing } = original;
      preparing.status = 'preparing';
      for (const packet of [preparing, original]) {
        const inputBefore = structuredClone(packet),
          result = await f.validate(packet);
        expect(result.receipt).toEqual(f.receipt);
        expect(packet.evidenceSha256).toBe(result.evidenceSha256);
        expect(result.packet).toEqual(inputBefore);
        expect(packet).toEqual(inputBefore);
        expect((result.packet.prior as Record<string, unknown>)[address]).toEqual(
          existing ? (result.packet.proposed as Record<string, unknown>)[address] : null,
        );
        expect(result.packet.applicationOutcomeQualified).toBeUndefined();
        expect(result.packet.runnerRetirementQualified).toBeUndefined();
      }
      expect(f.commands).toEqual(beforeCommands);
      expect(f.vmPowerActions).toEqual([]);
      expect(await readFile(join(f.store.directory, f.name))).toEqual(beforePacket);
      expect((await readdir(f.directory)).sort()).toEqual(beforeRunnerNames);
      expect(beforeRunnerNames).not.toContain('plan-receipt.json');
    }, 60000);

for (const status of ['preparing', 'cancelled'] as const)
  test(`shared ${status} packet rejects coerced status and altered original ownership/projection/evidence`, async () => {
    const f = await fixture('deallocate', false),
      base = structuredClone(f.packet);
    base.status = status;
    if (status === 'preparing') delete base.provenance;
    const invalid: unknown[] = [null, [], 'cancelled'];
    for (const value of [undefined, null, ['preparing'], ['cancelled'], {}, 1, true, 'released'])
      invalid.push({ ...base, status: value });
    for (const key of [
      ...Object.keys(f.bound),
      'receipt',
      'originalJournalSha256',
      'prior',
      'proposed',
      'evidenceSha256',
    ]) {
      const missing = structuredClone(base);
      delete missing[key];
      invalid.push(missing);
    }
    invalid.push({ ...base, unexpected: true });
    for (const key of Object.keys(f.bound)) invalid.push({ ...base, [key]: 'foreign' });
    invalid.push({ ...base, originalJournalSha256: 'not-a-digest' });
    invalid.push({ ...base, evidenceSha256: 'a'.repeat(64) });
    const retainedLaterControl = structuredClone(base);
    retainedLaterControl.prior = structuredClone(base.proposed);
    invalid.push(f.rehash(retainedLaterControl));
    const wrongDevice = structuredClone(base);
    (wrongDevice.proposed as Record<string, Record<string, unknown>>)[address].resource_id = '/synthetic/foreign-vm';
    invalid.push(f.rehash(wrongDevice));
    const missingState = structuredClone(base);
    missingState.prior = {};
    invalid.push(f.rehash(missingState));
    const foreignReceipt = structuredClone(base);
    (foreignReceipt.receipt as Record<string, unknown>).deploymentId = 'foreign';
    invalid.push(f.rehash(foreignReceipt));
    const commands = [...f.commands];
    for (const packet of invalid) await expect(f.validate(packet)).rejects.toThrow();
    await expect(f.validate(base, { ...f.receipt, planSha256: 'b'.repeat(64) })).rejects.toThrow(
      'published original receipt differs',
    );
    expect(f.commands).toEqual(commands);
    expect(f.vmPowerActions).toEqual([]);
    expect(await f.store.read(f.name)).toEqual(f.packet);
  }, 60000);

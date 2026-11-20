import { expect, test } from 'bun:test';
import * as evidence from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';

test('final VM and serial handoff retains one original incarnation through the actual final callback', async () => {
  let original: unknown;
  await withEarlyVmFixture(
    async (input) => {
      original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
      expect(original).not.toBeNull();
    },
    async (final) => {
      const packet = await evidence.handoffOriginalEarlyGcpVmEvidence(original, final);
      const view = await evidence.readOriginalFinalGcpVmEvidence(packet);
      expect(view.instanceId).toBe(final.identity.targetId as string);
      expect(view.kind).toBe('original-final-gcp-vm-cloud-candidate');
      expect(view.finalDeadlineMs - view.finalStartedMs).toBe(300000);
      expect(view.originalInsertQualified).toBe(false);
      const serial = await evidence.collectOriginalFinalGcpSerialEvidence(packet, '0');
      expect(serial.instanceId).toBe(view.instanceId);
      await expect(evidence.readOriginalEarlyGcpVmEvidence(original)).rejects.toThrow('retired');
      expect(await evidence.handoffOriginalEarlyGcpVmEvidence(original, final)).toBe(packet);
      await expect(evidence.readOriginalFinalGcpVmEvidence({ ...packet })).rejects.toThrow('Original');
    },
  );
}, 60000);

test('final handoff refuses copied original packets, callbacks and readers', async () => {
  let original: unknown;
  await withEarlyVmFixture(
    async (input) => {
      original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    },
    async (final) => {
      await expect(evidence.handoffOriginalEarlyGcpVmEvidence({ ...(original as object) }, final)).rejects.toThrow(
        'Original',
      );
      for (const key of ['callback', 'reader'] as const) {
        await expect(
          evidence.handoffOriginalEarlyGcpVmEvidence(original, { ...final, [key]: { ...final[key] } }),
        ).rejects.toThrow('Original');
      }
      const packet = await evidence.handoffOriginalEarlyGcpVmEvidence(original, final);
      expect((await evidence.readOriginalFinalGcpVmEvidence(packet)).instanceId).toBe(
        final.identity.targetId as string,
      );
    },
  );
}, 60000);

test('a live original-operation reader cannot stand in for the reader issued under the final reserve', async () => {
  let original: unknown;
  let beforeReader: import('./fixtures/early-gcp-vm.fixture').EarlyVmFixtureInput['reader'] | undefined;
  await withEarlyVmFixture(
    async (input) => {
      beforeReader = input.reader;
      original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    },
    async (final) => {
      await expect(
        evidence.handoffOriginalEarlyGcpVmEvidence(original, {
          ...final,
          reader: beforeReader as NonNullable<typeof beforeReader>,
        }),
      ).rejects.toThrow('final cloud reader');
      const packet = await evidence.handoffOriginalEarlyGcpVmEvidence(original, final);
      expect((await evidence.readOriginalFinalGcpVmEvidence(packet)).instanceId).toBe(
        final.identity.targetId as string,
      );
    },
  );
}, 60000);

for (const change of [
  { id: '18446744073709551612' },
  { canIpForward: false },
  { machineType: 'projects/example-project/zones/northamerica-northeast1-a/machineTypes/e2-standard-4' },
  { metadata: { items: [], fingerprint: 'foreign' } },
])
  test(`final handoff refuses a changed original VM and cannot be restored into a new attempt: ${Object.keys(change)[0]}`, async () => {
    let original: unknown;
    await withEarlyVmFixture(
      async (input) => {
        original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
      },
      async (final) => {
        const vm = final.state.vm;
        final.state.vm = { ...vm, ...change };
        await expect(evidence.handoffOriginalEarlyGcpVmEvidence(original, final)).rejects.toThrow();
        final.state.vm = vm;
        await expect(evidence.handoffOriginalEarlyGcpVmEvidence(original, final)).rejects.toThrow('retired');
      },
    );
  }, 60000);

test('failed original VM evidence stays refused despite later restoration and a new final reader', async () => {
  let original: unknown;
  await withEarlyVmFixture(
    async (input) => {
      original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
      const vm = input.state.vm;
      input.state.vm = { ...vm, labels: { 'xcsh-deployment': 'example-foreign' } };
      await expect(evidence.readOriginalEarlyGcpVmEvidence(original)).rejects.toThrow();
      input.state.vm = vm;
    },
    async (final) => {
      await expect(evidence.handoffOriginalEarlyGcpVmEvidence(original, final)).rejects.toThrow('retired');
    },
  );
}, 60000);

test('ownership change during final serial capture permanently refuses the transferred packet', async () => {
  let original: unknown;
  await withEarlyVmFixture(
    async (input) => {
      original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    },
    async (final) => {
      const packet = await evidence.handoffOriginalEarlyGcpVmEvidence(original, final);
      const vm = final.state.vm;
      final.state.mutateDuringSerial = () => {
        final.state.vm = { ...vm, labels: { 'xcsh-deployment': 'example-foreign' } };
      };
      await expect(evidence.collectOriginalFinalGcpSerialEvidence(packet, '0')).rejects.toThrow();
      final.state.vm = vm;
      final.state.mutateDuringSerial = undefined;
      await expect(evidence.readOriginalFinalGcpVmEvidence(packet)).rejects.toThrow('retired');
    },
  );
}, 60000);

import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('original final VM and serial handoff retains operation expiry and the fixed reserve', async () => {
  expect((await runIsolatedClockFixture('final-gcp-vm-clock.fixture.ts')).exitCode).toBe(0);
}, 180000);

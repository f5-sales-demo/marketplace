import { expect, test } from 'bun:test';
import * as evidence from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';

test('early source and sealed baseline bind exact original operation, VM and serial before RPC completion', async () => {
  expect(typeof evidence.collectOriginalEarlyGcpVmEvidence).toBe('function');
  await withEarlyVmFixture(async (input) => {
    const packet = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    const view = await evidence.readOriginalEarlyGcpVmEvidence(packet);
    expect(view.instanceId).toBe(String(input.state.operation.targetId));
    expect(view.interfaces).toHaveLength(2);
    expect(view.originalInsertQualified).toBe(false);
    expect(view.executionAuthorized).toBe(false);
    const serial = await evidence.collectOriginalEarlyGcpSerialEvidence(packet, '0');
    expect(serial.instanceId).toBe(view.instanceId);
    expect(input.state.serialReads).toBe(1);
    await expect(evidence.readOriginalEarlyGcpVmEvidence({ ...packet })).rejects.toThrow('Original');
  });
}, 60000);

test('copied source, baseline, callback or reader cannot bind original early VM evidence', async () => {
  await withEarlyVmFixture(async (input) => {
    for (const field of ['identity', 'baseline', 'callback', 'reader'] as const) {
      const changed = { ...input, [field]: { ...input[field] } };
      await expect(evidence.collectOriginalEarlyGcpVmEvidence(changed)).rejects.toThrow('Original');
    }
    expect(await evidence.collectOriginalEarlyGcpVmEvidence(input)).not.toBeNull();
  });
}, 60000);

test('a conflicting insert operation cannot be restored into the original reader', async () => {
  await withEarlyVmFixture(async (input) => {
    const id = input.state.operation.id;
    input.state.operation.id = '18446744073709551612';
    await expect(evidence.collectOriginalEarlyGcpVmEvidence(input)).rejects.toThrow('operation differs');
    input.state.operation.id = id;
    await expect(evidence.collectOriginalEarlyGcpVmEvidence(input)).rejects.toThrow('changed');
    expect(input.state.serialReads).toBe(0);
  });
}, 60000);

test('a named VM replacement retires the early binding despite identity restoration', async () => {
  await withEarlyVmFixture(async (input) => {
    const packet = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    if (!packet) throw new Error('Original VM fixture required');
    const id = input.state.vm.id;
    input.state.vm.id = '18446744073709551612';
    await expect(evidence.readOriginalEarlyGcpVmEvidence(packet)).rejects.toThrow('changed');
    input.state.vm.id = id;
    await expect(evidence.readOriginalEarlyGcpVmEvidence(packet)).rejects.toThrow('retired');
    expect(input.state.serialReads).toBe(0);
  });
}, 60000);

test('ownership changes during original serial capture are retained as failures', async () => {
  await withEarlyVmFixture(async (input) => {
    const packet = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    if (!packet) throw new Error('Original VM fixture required');
    const labels = input.state.vm.labels;
    input.state.mutateDuringSerial = () => {
      input.state.vm.labels = { ...(labels as object), 'xcsh-deployment': 'foreign' };
    };
    await expect(evidence.collectOriginalEarlyGcpSerialEvidence(packet, '0')).rejects.toThrow('changed');
    input.state.vm.labels = labels;
    input.state.mutateDuringSerial = undefined;
    await expect(evidence.readOriginalEarlyGcpVmEvidence(packet)).rejects.toThrow('retired');
    expect(input.state.serialReads).toBe(1);
  });
}, 60000);

test('an unavailable original VM remains pending without adopting another numeric identity', async () => {
  await withEarlyVmFixture(async (input) => {
    input.state.vmUnavailable = true;
    expect(await evidence.collectOriginalEarlyGcpVmEvidence(input)).toBeNull();
    expect(input.state.serialReads).toBe(0);
    input.state.vmUnavailable = false;
    const packet = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    if (!packet) throw new Error('Original VM fixture required');
    expect((await evidence.readOriginalEarlyGcpVmEvidence(packet)).instanceId).toBe(input.identity.targetId as string);
  });
}, 60000);

import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('initial baseline and current VM observations retain distinct freshness semantics', async () => {
  const result = await runIsolatedClockFixture('early-gcp-vm-clock.fixture.ts');
  expect(result.exitCode).toBe(0);
}, 180000);

import { expect, test } from 'bun:test';
import { joinOriginalGcpVmEvidence } from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { fullVmFixture } from './fixtures/sealed-full-vm.fixture';
import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('full VM correlation consumes the original sealed apply baseline without a raw absence shortcut', async () => {
  await withEarlyVmFixture(async (input) => {
    const joined = await joinOriginalGcpVmEvidence(await fullVmFixture(input));
    expect(joined.instanceId).toBe(input.identity.targetId as string);
    expect(joined.interfaces).toHaveLength(2);
    expect(joined.originalInsertQualified).toBe(false);
    expect(joined.applyRpcQualified).toBe(false);
  });
}, 60000);

test('full VM sealed inventory refuses copied baseline, callback, reader and source', async () => {
  await withEarlyVmFixture(async (input) => {
    const original = await fullVmFixture(input);
    for (const field of ['baseline', 'callback', 'reader', 'source'] as const) {
      await expect(joinOriginalGcpVmEvidence({ ...original, [field]: { ...original[field] } })).rejects.toThrow(
        /[Oo]riginal/,
      );
    }
    expect((await joinOriginalGcpVmEvidence(original)).cloudEvidenceCorroborated).toBe(true);
  });
}, 60000);

test('full VM sealed inventory and current observations retain different freshness requirements', async () => {
  expect((await runIsolatedClockFixture('sealed-full-vm-clock.fixture.ts')).exitCode).toBe(0);
}, 180000);

test('sealed full VM evidence requires its callback and rejects a simultaneous raw absence', async () => {
  await withEarlyVmFixture(async (input) => {
    const original = await fullVmFixture(input);
    await expect(joinOriginalGcpVmEvidence({ ...original, callback: undefined })).rejects.toThrow('callback');
    await expect(joinOriginalGcpVmEvidence({ ...original, absent: { present: false } as never })).rejects.toThrow(
      'shortcut',
    );
    expect((await joinOriginalGcpVmEvidence(original)).cloudEvidenceCorroborated).toBe(true);
  });
}, 60000);

test('a separate original apply callback cannot borrow a sealed full VM baseline', async () => {
  await withEarlyVmFixture(async (first) => {
    const original = await fullVmFixture(first);
    await withEarlyVmFixture(async (second) => {
      await expect(joinOriginalGcpVmEvidence({ ...original, callback: second.callback })).rejects.toThrow('differs');
      const foreign = await fullVmFixture(second);
      await expect(joinOriginalGcpVmEvidence({ ...original, source: foreign.source })).rejects.toThrow(
        'owning executor',
      );
    });
    expect((await joinOriginalGcpVmEvidence(original)).cloudEvidenceCorroborated).toBe(true);
  });
}, 60000);

test('installed full VM correlation cannot fall back to a raw absence when its baseline is omitted', async () => {
  await withEarlyVmFixture(async (input) => {
    const original = await fullVmFixture(input);
    await expect(
      joinOriginalGcpVmEvidence({
        ...original,
        baseline: undefined,
        callback: undefined,
        absent: { present: false } as never,
      }),
    ).rejects.toThrow('sealed apply baseline');
  });
}, 60000);

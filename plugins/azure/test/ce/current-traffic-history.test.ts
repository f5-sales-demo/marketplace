import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  isAzureIngressHistoricalArtifact,
  verifyAzureIngressHistoricalArtifacts,
} from '../../src/ce/ingress-artifact-provenance';
import { retireAzureTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { collectAzureCurrentTrafficProbe } from '../../src/ce/traffic-probe';
import { createIngressHistoryFixture } from './ingress-history-fixture';
import { nativeRetirementFixture } from './native-retirement-fixture';
import { prepareRelayParentRetirement } from './relay-parent-retirement-fixture';

type Json = Record<string, unknown>;
for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} current samples retain exact historical provenance and interrupted checkpoint history`, async () => {
    const f = await createIngressHistoryFixture(engine);
    try {
      const { records } = await f.run();
      const first = await collectAzureCurrentTrafficProbe(f.plan, f.store, f.api);
      const second = await collectAzureCurrentTrafficProbe(f.plan, f.store, f.api);
      for (const sample of [first, second]) {
        const file = `${sample.checkpointKey}.json`,
          receipt = `${sample.checkpointKey}-current-sample.json`;
        expect(isAzureIngressHistoricalArtifact(file)).toBe(true);
        expect(isAzureIngressHistoricalArtifact(receipt)).toBe(true);
        records.set(file, await f.store.read(file));
        records.set(receipt, await f.store.read(receipt));
      }
      expect(first.sampleId).not.toBe(second.sampleId);
      expect(() => verifyAzureIngressHistoricalArtifacts(f.plan, f.drain, f.contract, records)).not.toThrow();
      records.delete(`${second.checkpointKey}-current-sample.json`);
      expect(() => verifyAzureIngressHistoricalArtifacts(f.plan, f.drain, f.contract, records)).not.toThrow();
      const checkpoint = records.get(`${second.checkpointKey}.json`) as Json;
      delete checkpoint.evidence;
      checkpoint.phase = 'ready';
      expect(() => verifyAzureIngressHistoricalArtifacts(f.plan, f.drain, f.contract, records)).not.toThrow();
      expect(JSON.stringify([...records.values()])).not.toContain('never-retain');
    } finally {
      await f.cleanup();
    }
  });
  for (const mode of [
    'orphan-receipt',
    'foreign-owner',
    'wrong-plan',
    'wrong-key',
    'wrong-scope',
    'extra-field',
    'wrong-digest',
    'wrong-source',
    'wrong-evidence',
    'future-time',
    'reversed-time',
    'oversized-interval',
    'outside-interval',
    'ready-with-receipt',
    'missing-journal',
    'foreign-source',
    'foreign-filename',
  ] as const) {
    test(`${engine} current sample history rejects ${mode}`, async () => {
      const f = await createIngressHistoryFixture(engine);
      try {
        const { records } = await f.run();
        const sample = await collectAzureCurrentTrafficProbe(f.plan, f.store, f.api);
        const checkpoint = (await f.store.read(`${sample.checkpointKey}.json`)) as Json;
        const receipt = structuredClone(sample) as unknown as Json;
        const file = `${sample.checkpointKey}.json`,
          receiptFile = `${sample.checkpointKey}-current-sample.json`;
        records.set(file, checkpoint);
        records.set(receiptFile, receipt);
        if (mode === 'orphan-receipt') records.delete(file);
        if (mode === 'foreign-owner') receipt.owner = { ...sample.owner, account: 'example-foreign' };
        if (mode === 'wrong-plan') receipt.planSha256 = 'f'.repeat(64);
        if (mode === 'wrong-key') receipt.checkpointKey = 'traffic-foreign';
        if (mode === 'wrong-scope') receipt.scope = 'site-health';
        if (mode === 'extra-field') receipt.secret = 'unreviewed';
        if (mode === 'wrong-digest') receipt.checkpointSha256 = 'f'.repeat(64);
        if (mode === 'wrong-source') receipt.sourceIdentitySha256 = 'f'.repeat(64);
        if (mode === 'wrong-evidence') receipt.evidence = { ...sample.evidence, httpStatus: 201 };
        if (mode === 'future-time') receipt.completedAt = '2999-01-01T00:00:00.000Z';
        if (mode === 'reversed-time') receipt.completedAt = new Date(Date.parse(sample.startedAt) - 1).toISOString();
        if (mode === 'oversized-interval')
          receipt.startedAt = new Date(Date.parse(sample.completedAt) - 180001).toISOString();
        if (mode === 'outside-interval') {
          (checkpoint.evidence as Json).observedAt = new Date(Date.parse(sample.startedAt) - 1).toISOString();
          receipt.evidence = checkpoint.evidence;
          receipt.checkpointSha256 = canonicalSha256(checkpoint);
        }
        if (mode === 'ready-with-receipt') {
          delete checkpoint.evidence;
          checkpoint.phase = 'ready';
          receipt.checkpointSha256 = canonicalSha256(checkpoint);
        }
        if (mode === 'missing-journal') records.delete(`azure-ingress-source-${f.plan.planSha256}.json`);
        if (mode === 'foreign-source') {
          checkpoint.sourceNicResourceId = 'foreign';
          receipt.checkpointSha256 = canonicalSha256(checkpoint);
        }
        if (mode === 'foreign-filename') {
          records.delete(receiptFile);
          records.set('traffic-00000000-0000-4000-8000-000000000000-current-sample.json', receipt);
        }
        expect(() => verifyAzureIngressHistoricalArtifacts(f.plan, f.drain, f.contract, records)).toThrow();
      } finally {
        await f.cleanup();
      }
    });
  }
}
test('current sample names require an exact UUID v4 and reviewed suffix', () => {
  for (const name of [
    'traffic-foreign.json',
    'traffic-00000000-0000-1000-8000-000000000000.json',
    'traffic-00000000-0000-4000-8000-000000000000-extra.json',
  ])
    expect(isAzureIngressHistoricalArtifact(name)).toBe(false);
});

for (const mode of [
  'accepted',
  'interrupted',
  'ready-interrupted',
  'orphan',
  'tampered',
  'changed-after-inventory',
] as const)
  test(`Terraform owning parent retirement verifies current sample history before atomic deletion: ${mode}`, async () => {
    const f = await createIngressHistoryFixture('terraform');
    let parent: Awaited<ReturnType<typeof prepareRelayParentRetirement>> | undefined;
    try {
      const { records } = await f.run();
      const sample = await collectAzureCurrentTrafficProbe(f.plan, f.store, f.api);
      const file = `${sample.checkpointKey}.json`,
        receiptFile = `${sample.checkpointKey}-current-sample.json`;
      records.set(file, await f.store.read(file));
      if (mode === 'ready-interrupted') {
        const checkpoint = records.get(file) as Json;
        delete checkpoint.evidence;
        checkpoint.phase = 'ready';
      }
      if (mode !== 'interrupted' && mode !== 'ready-interrupted')
        records.set(receiptFile, await f.store.read(receiptFile));
      if (mode === 'orphan') records.delete(file);
      if (mode === 'tampered')
        (records.get(receiptFile) as Json).owner = { ...sample.owner, account: 'example-foreign' };
      parent = await prepareRelayParentRetirement(f.plan, 'site-uid', records);
      const teardown = { ...parent.teardown, drain: f.drain };
      await parent.store.write(`${teardown.planId}.json`, teardown);
      const owning = parent;
      const run = () =>
        retireAzureTerraformParentArtifacts(f.plan, teardown, owning.evidence, owning.store, undefined, f.contract);
      if (mode === 'changed-after-inventory') {
        const write = owning.store.write.bind(owning.store);
        owning.store.write = async (name, value) => {
          await write(name, value);
          if (name === 'azure-terraform-parent-artifact-retirement.json')
            await write(receiptFile, { ...sample, status: 'foreign' });
        };
      }
      if (mode === 'accepted' || mode === 'interrupted' || mode === 'ready-interrupted') {
        expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
        await expect(owning.store.read(file)).rejects.toThrow();
        await expect(owning.store.read(receiptFile)).rejects.toThrow();
        expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
      } else {
        await expect(run()).rejects.toThrow();
        expect(await owning.store.read('terraform-workflow.json')).toBeDefined();
        expect(await owning.store.read(receiptFile)).toBeDefined();
      }
    } finally {
      await parent?.cleanup();
      await f.cleanup();
    }
  });

for (const mode of [
  'accepted',
  'interrupted',
  'ready-interrupted',
  'orphan',
  'tampered',
  'changed-after-inventory',
] as const)
  test(`Native owning teardown verifies current sample history before atomic deletion: ${mode}`, async () => {
    const f = await createIngressHistoryFixture('native');
    let parent: Awaited<ReturnType<typeof nativeRetirementFixture>> | undefined;
    try {
      const { records } = await f.run();
      const sample = await collectAzureCurrentTrafficProbe(f.plan, f.store, f.api);
      const file = `${sample.checkpointKey}.json`,
        receiptFile = `${sample.checkpointKey}-current-sample.json`;
      records.set(file, await f.store.read(file));
      if (mode === 'ready-interrupted') {
        const checkpoint = records.get(file) as Json;
        delete checkpoint.evidence;
        checkpoint.phase = 'ready';
      }
      if (mode !== 'interrupted' && mode !== 'ready-interrupted')
        records.set(receiptFile, await f.store.read(receiptFile));
      if (mode === 'orphan') records.delete(file);
      if (mode === 'tampered')
        (records.get(receiptFile) as Json).owner = { ...sample.owner, account: 'example-foreign' };
      parent = await nativeRetirementFixture(false, { source: f.plan, contract: f.contract, drain: f.drain });
      for (const [name, value] of records) await parent.storage.write(name, value);
      const owning = parent;
      if (mode === 'changed-after-inventory') {
        const write = owning.storage.write.bind(owning.storage);
        owning.storage.write = async (name, value) => {
          await write(name, value);
          if (name === 'azure-native-parent-artifact-retirement.json')
            await write(receiptFile, { ...sample, status: 'foreign' });
        };
      }
      if (mode === 'accepted' || mode === 'interrupted' || mode === 'ready-interrupted') {
        expect(await owning.run()).toMatchObject({
          completeCleanup: true,
          parent: { status: 'native-deployment-artifacts-retired' },
        });
        await expect(owning.storage.read(file)).rejects.toThrow();
        await expect(owning.storage.read(receiptFile)).rejects.toThrow();
        expect(await owning.run()).toMatchObject({ completeCleanup: true });
      } else {
        await expect(owning.run()).rejects.toThrow();
        expect(await owning.storage.read(`native-source-${f.plan.planSha256}.json`)).toBeDefined();
        expect(await owning.storage.read(receiptFile)).toBeDefined();
      }
    } finally {
      if (parent) await rm(parent.root, { recursive: true, force: true });
      await f.cleanup();
    }
  });

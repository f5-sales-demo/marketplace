import { expect, test } from 'bun:test';
import { readAzureTerraformOriginalReceiptInventory } from '../../src/ce/terraform-original-receipt-inventory';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

test('three-node six-interface production original admission publishes every serial node receipt', async () => {
  const f = await originalNativeWorkflowFixture(true);
  try {
    const result = await f.run();
    expect(result.status).toBe('registered');
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as { bootstrapByNode: Record<string, string> },
      receipts = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage);
    expect(f.plan.topology.nodeCount).toBe(3);
    expect(f.plan.nics.map((nic) => nic.role)).toEqual(['slo', 'sli']);
    expect(receipts.records).toHaveLength(4);
    expect(f.counts().bootstrap).toBe(3);
    expect(f.counts().applies).toBe(4);
    for (const node of [1, 2, 3])
      expect(
        receipts.records.some((row) => row.record.stage.kind === 'node-admission' && row.record.stage.node === node),
      ).toBe(true);
  } finally {
    await f.close();
  }
});
test('interrupted three-node original admission resumes without proposing deletion of an earlier admitted node', async () => {
  const f = await originalNativeWorkflowFixture(true);
  try {
    const write = f.storage.write.bind(f.storage);
    let lose = true;
    f.storage.write = async (name, value) => {
      if (lose && name === 'terraform-admission-plan-node-2.json') {
        lose = false;
        throw Error('selected second-node publication loss');
      }
      await write(name, value);
    };
    await expect(f.run()).rejects.toThrow('second-node publication loss');
    f.storage.write = write;
    expect((await f.run()).status).toBe('registered');
    expect(f.counts().bootstrap).toBe(3);
    expect(f.deletionAttempts()).toBe(0);
  } finally {
    await f.close();
  }
});

for (const after of [false, true])
  test(`original admission recovers applied native receipt after lost node checkpoint ${after ? 'after' : 'before'} publication`, async () => {
    const f = await originalNativeWorkflowFixture(true);
    try {
      const write = f.storage.write.bind(f.storage);
      let lose = true;
      f.storage.write = async (name, value) => {
        if (
          lose &&
          name === 'terraform-workflow.json' &&
          (value as { launchedAtByNode?: Record<string, string> }).launchedAtByNode?.['2']
        ) {
          lose = false;
          if (after) await write(name, value);
          throw Error('selected applied checkpoint response lost');
        }
        await write(name, value);
      };
      await expect(f.run()).rejects.toThrow('applied checkpoint response lost');
      f.storage.write = write;
      const applies = f.counts().applies;
      expect(applies).toBe(3);
      expect((await f.run()).status).toBe('registered');
      expect(f.counts().applies).toBe(4);
      expect(f.deletionAttempts()).toBe(0);
      expect(f.counts().bootstrap).toBe(3);
    } finally {
      await f.close();
    }
  });
test('launch timestamp without an authenticated admission receipt binding cannot authorize original resume', async () => {
  const f = await originalNativeWorkflowFixture(true);
  try {
    const write = f.storage.write.bind(f.storage);
    let lose = true;
    f.storage.write = async (name, value) => {
      if (lose && name === 'terraform-admission-plan-node-2.json') {
        lose = false;
        throw Error('stop before node2 apply');
      }
      await write(name, value);
    };
    await expect(f.run()).rejects.toThrow('stop before node2');
    f.storage.write = write;
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
      admissionReceiptSha256ByNode: Record<string, string>;
    };
    delete checkpoint.admissionReceiptSha256ByNode['1'];
    await write('terraform-workflow.json', checkpoint);
    const prior = f.counts().applies;
    await expect(f.run()).rejects.toThrow('checkpoint differs');
    expect(f.counts().applies).toBe(prior);
  } finally {
    await f.close();
  }
});
test('foreign admission receipt binding cannot authorize original resume', async () => {
  const f = await originalNativeWorkflowFixture(true);
  try {
    const write = f.storage.write.bind(f.storage);
    let lose = true;
    f.storage.write = async (name, value) => {
      if (lose && name === 'terraform-admission-plan-node-2.json') {
        lose = false;
        throw Error('stop before node2 apply');
      }
      await write(name, value);
    };
    await expect(f.run()).rejects.toThrow('stop before node2');
    f.storage.write = write;
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
      admissionReceiptSha256ByNode: Record<string, string>;
    };
    checkpoint.admissionReceiptSha256ByNode['1'] = 'f'.repeat(64);
    await write('terraform-workflow.json', checkpoint);
    const prior = f.counts().applies;
    await expect(f.run()).rejects.toThrow('receipt binding');
    expect(f.counts().applies).toBe(prior);
  } finally {
    await f.close();
  }
});
test('native applying journal remains unresolved after real provider response loss and cannot authorize reapply', async () => {
  const f = await originalNativeWorkflowFixture(true);
  try {
    f.interruptNextApply();
    await expect(f.run()).rejects.toThrow('provider apply response lost');
    const prior = f.counts().applies;
    await expect(f.run()).rejects.toThrow('requires reconciliation');
    expect(f.counts().applies).toBe(prior);
  } finally {
    await f.close();
  }
});
test('missing native receipt reader prevents original resume before new planning or application', async () => {
  const f = await originalNativeWorkflowFixture(true);
  try {
    const write = f.storage.write.bind(f.storage);
    let lose = true;
    f.storage.write = async (name, value) => {
      if (lose && name === 'terraform-admission-plan-node-2.json') {
        lose = false;
        throw Error('stop before node2 apply');
      }
      await write(name, value);
    };
    await expect(f.run()).rejects.toThrow('stop before node2');
    f.storage.write = write;
    Object.defineProperty(f.runner, 'readPlanApplicationHistory', { value: undefined, configurable: true });
    const prior = f.commands.length;
    await expect(f.run()).rejects.toThrow('requires native receipt history');
    expect(f.commands.slice(prior).filter((command) => command === 'plan' || command === 'apply')).toEqual([]);
  } finally {
    await f.close();
  }
});

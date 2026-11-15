import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { fixture, roots } from './original-gcp-inventory-fixture';

for (const ha of [false, true])
  test(`original ${ha ? 'HA observer' : 'single-node'} inventory scope joins exact owning plan and intent`, async () => {
    const { prepareOriginalGcpInventoryScope, inspectOriginalGcpInventoryScope, assertOriginalGcpInventoryScope } =
      await import('../src/original-gcp-inventory-scope');
    let packet: unknown;
    await fixture(
      async (context, store) => {
        packet = await prepareOriginalGcpInventoryScope(context, store);
        const view = await inspectOriginalGcpInventoryScope(packet);
        expect(view.resources).toHaveLength(ha ? 21 : 8);
        expect(view.cloud).toHaveLength(ha ? 17 : 6);
        expect(view.platform).toHaveLength(ha ? 4 : 2);
        expect(view.executionAuthorized).toBe(false);
        expect(view.cloud.some((row) => row.role === 'observer')).toBe(ha);
        expect(new Set(view.resources.map((row) => row.address)).size).toBe(view.resources.length);
        await assertOriginalGcpInventoryScope(packet);
        await expect(inspectOriginalGcpInventoryScope({ ...(packet as object) })).rejects.toThrow('Original');
      },
      '',
      ha,
    );
    await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow();
  });

for (const mutation of ['extra', 'missing', 'project', 'unknown', 'replacement', 'namespace', 'platform-name'])
  test(`owning inventory refuses ${mutation} without producing execution authority`, async () => {
    const { prepareOriginalGcpInventoryScope } = await import('../src/original-gcp-inventory-scope');
    await fixture(async (context, store) => {
      await expect(prepareOriginalGcpInventoryScope(context, store)).rejects.toThrow();
    }, mutation);
  });

test('inventory intent file replacement remains refused after bytes are restored', async () => {
  const { prepareOriginalGcpInventoryScope, assertOriginalGcpInventoryScope } = await import(
    '../src/original-gcp-inventory-scope'
  );
  await fixture(async (context, store) => {
    const packet = await prepareOriginalGcpInventoryScope(context, store);
    const path = join(store.directory, 'gcp-terraform-input-identity.json');
    await rename(path, `${path}.original`);
    await writeFile(path, await readFile(`${path}.original`), { mode: 0o400 });
    await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow();
    await rm(path);
    await rename(`${path}.original`, path);
    await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow();
  });
});

test('expired operation preserves read-only original inventory inputs without renewing authority', async () => {
  const {
    prepareOriginalGcpInventoryScope,
    assertOriginalGcpInventoryScope,
    assertOriginalGcpInventoryInputs,
    inspectOriginalGcpInventoryScope,
  } = await import('../src/original-gcp-inventory-scope');
  let expired = false;
  await fixture(
    async (context, store) => {
      const packet = await prepareOriginalGcpInventoryScope(context, store);
      expired = true;
      await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow('expired');
      await assertOriginalGcpInventoryInputs(packet);
      expect((await inspectOriginalGcpInventoryScope(packet)).executionAuthorized).toBe(false);
      await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow('expired');
    },
    '',
    true,
    () => expired,
  );
});

test('cached inventory preparation cannot ignore a different storage owner', async () => {
  const { prepareOriginalGcpInventoryScope } = await import('../src/original-gcp-inventory-scope');
  await fixture(async (context, store) => {
    const original = await prepareOriginalGcpInventoryScope(context, store);
    expect(await prepareOriginalGcpInventoryScope(context, store)).toBe(original);
    const root = await mkdtemp(join(tmpdir(), 'foreign-inventory-store-'));
    roots.push(root);
    const foreign = await CeDeploymentStore.open(root, { ...context.owner, deploymentId: 'foreign' });
    await expect(prepareOriginalGcpInventoryScope(context, foreign)).rejects.toThrow('storage');
  });
});

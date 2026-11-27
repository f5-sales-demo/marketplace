/** Offline storage and closure proof only; installed and live acceptance remain separate. */
import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { createInstalledReaderInputRetention } from '../src/installed-reader-input-retention';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import type { OriginalInputBinding } from '../src/original-input-monitor';

for (const fault of [
  'none',
  'source-replaced',
  'retained-replaced',
  'changed-input',
  'foreign-owner',
  'ownership-during-write',
  'empty',
] as const)
  test(`installed reader handoff retains immutable source bindings: ${fault}`, async () => {
    const base = process.env.CE_TEST_CAPTURE_ARTIFACTS ?? tmpdir();
    await mkdir(base, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(base, 'installed-reader-retention-'));
    const owner = {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-west1',
      deploymentId: 'example-deployment',
    } as const;
    const store = await CeDeploymentStore.open(join(root, 'storage'), owner);
    const source = join(root, 'source.json');
    await writeFile(source, '{"offline":true}', { flag: 'wx', mode: 0o400 });
    let inputs: Readonly<Record<string, OriginalInputBinding>> = {
      source: (await readOwnedInstalledInput(source)).binding,
    };
    const retain = createInstalledReaderInputRetention({
      store,
      owner: fault === 'foreign-owner' ? { ...owner, account: 'example-secondary-project' } : owner,
      executionDirectory: root,
      readInputs: async () => inputs,
    });
    if (fault === 'empty') {
      inputs = {};
      await expect(retain()).rejects.toThrow();
      expect(
        (await readdir(store.directory)).filter((name) => name.startsWith('immutable-installed-reader-inputs-')),
      ).toHaveLength(0);
      return;
    }
    if (fault === 'source-replaced') {
      await rename(source, `${source}.original`);
      await writeFile(source, '{"offline":true}', { flag: 'wx', mode: 0o400 });
    }
    if (fault === 'source-replaced' || fault === 'foreign-owner') {
      await expect(retain()).rejects.toThrow();
      expect(
        (await readdir(store.directory)).filter((name) => name.startsWith('immutable-installed-reader-inputs-')),
      ).toHaveLength(0);
      return;
    }
    if (fault === 'ownership-during-write') {
      const write = store.writeImmutableBytes.bind(store);
      store.writeImmutableBytes = async (name, bytes) => {
        const saved = await write(name, bytes);
        store.owner.account = 'example-secondary-project';
        await writeFile(join(store.directory, 'owner.json'), JSON.stringify({ schemaVersion: 2, owner: store.owner }));
        return saved;
      };
      await expect(retain()).rejects.toThrow();
      return;
    }
    await Promise.all([retain(), retain()]);
    const names = (await readdir(store.directory)).filter((name) =>
      name.startsWith('immutable-installed-reader-inputs-'),
    );
    expect(names).toHaveLength(1);
    const path = join(store.directory, names[0]);
    const before = await readOwnedInstalledInput(path);
    const record = JSON.parse(before.bytes.toString());
    expect(record.kind).toBe('original-installed-reader-inputs');
    expect(record.owner).toEqual(owner);
    expect(record.executionDirectory).toBe(root);
    expect(record.readerInputs).toEqual(inputs);
    expect(record.executionAccepted).toBe(false);
    expect(record.guestAcceptanceComplete).toBe(false);
    expect(Number(before.binding.expectedIdentity?.mode) & 0o777).toBe(0o400);
    if (fault === 'retained-replaced') {
      await rename(path, `${path}.original`);
      await writeFile(path, before.bytes, { flag: 'wx', mode: 0o400 });
      await expect(retain()).rejects.toThrow();
    } else if (fault === 'changed-input') {
      const other = join(root, 'another-source.json');
      await writeFile(other, '{"offline":true}', { flag: 'wx', mode: 0o400 });
      inputs = { source: (await readOwnedInstalledInput(other)).binding };
      await expect(retain()).rejects.toThrow();
    } else {
      await retain();
      expect((await readOwnedInstalledInput(path)).binding).toEqual(before.binding);
      expect(await readFile(path)).toEqual(before.bytes);
    }
    expect(
      (await readdir(store.directory)).filter(
        (name) => name.startsWith('immutable-installed-reader-inputs-') && !name.endsWith('.original'),
      ),
    ).toHaveLength(1);
  });

test('a custom capture without a source accessor creates no fabricated reader handoff', async () => {
  let writes = 0;
  const retain = createInstalledReaderInputRetention({
    owner: {} as never,
    executionDirectory: '/example',
    store: {
      writeImmutableBytes: async () => {
        writes++;
      },
    } as never,
    readInputs: async () => undefined,
  });
  await retain();
  expect(writes).toBe(0);
});

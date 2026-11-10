import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'example-catalog-'));
  await mkdir(join(root, 'scripts'));
  await writeFile(
    join(root, 'scripts/generate-marketplace-catalog.mjs'),
    await readFile(join(import.meta.dir, '../scripts/generate-marketplace-catalog.mjs')),
  );
  await mkdir(join(root, '.xcsh-plugin'));
  await writeFile(
    join(root, '.xcsh-plugin/marketplace.json'),
    JSON.stringify({ name: 'example', plugins: [{ name: 'example', source: './plugins/example' }] }),
  );
  await mkdir(join(root, 'plugins/example/.xcsh-plugin'), { recursive: true });
  await writeFile(
    join(root, 'plugins/example/.xcsh-plugin/plugin.json'),
    JSON.stringify({
      name: 'example',
      version: '1.0.0',
      marketplace: { order: 1, catalog: { source: './plugins/example' } },
      lifecycle: {
        mode: 'content',
        integrations: [],
        requirements: [],
        collectedData: [],
        pluginDependencies: [],
        setupRequired: false,
      },
    }),
  );
  return root;
}
const generate = async (root: string) => {
  const child = Bun.spawn(['node', join(root, 'scripts/generate-marketplace-catalog.mjs')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).text(),
    stderr = new Response(child.stderr).text();
  return { code: await child.exited, stdout: await stdout, stderr: await stderr };
};

test('catalog discovery ignores unrelated generated directories while retaining the registered plugin', async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, 'plugins/__pycache__'));
    expect((await generate(root)).code).toBe(0);
    const catalog = JSON.parse(await readFile(join(root, '.xcsh-plugin/marketplace.json'), 'utf8'));
    expect(catalog.plugins.map((plugin: { name: string }) => plugin.name)).toEqual(['example']);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('a registered plugin with a missing manifest remains an error', async () => {
  const root = await fixture();
  try {
    await rm(join(root, 'plugins/example/.xcsh-plugin/plugin.json'));
    expect((await generate(root)).code).not.toBe(0);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('an incomplete plugin declaration cannot disappear as an unrelated directory', async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, 'plugins/example-extra/.xcsh-plugin'), { recursive: true });
    expect((await generate(root)).code).not.toBe(0);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('lifecycle contract validates catalog declarations without treating generated folders as plugins', async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, 'plugins/__pycache__'));
    await mkdir(join(root, 'tests'));
    await writeFile(
      join(root, 'tests/test-lifecycle-contract.sh'),
      await readFile(join(import.meta.dir, 'test-lifecycle-contract.sh')),
    );
    expect((await generate(root)).code).toBe(0);
    const child = Bun.spawn(['bash', join(root, 'tests/test-lifecycle-contract.sh')], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = new Response(child.stdout).text(),
      stderr = new Response(child.stderr).text();
    const code = await child.exited;
    await stdout;
    await stderr;
    expect(code).toBe(0);
  } finally {
    await rm(root, { recursive: true });
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { metadataPath } = require('../scripts/resolve-plugin-runtime-package.cjs');

test('resolves the SDK-owned dependency instead of a stale root package', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-resolution-'));
  try {
    const sdk = join(root, 'node_modules/sdk');
    const owned = join(sdk, 'node_modules/dependency');
    const stale = join(root, 'node_modules/dependency');
    for (const directory of [sdk, owned, stale]) mkdirSync(directory, { recursive: true });
    writeFileSync(join(sdk, 'package.json'), JSON.stringify({ name: 'sdk', version: '1.0.0' }));
    writeFileSync(
      join(owned, 'package.json'),
      JSON.stringify({ name: 'dependency', version: '2.0.0', exports: './index.js' }),
    );
    writeFileSync(join(owned, 'index.js'), 'module.exports = {};');
    writeFileSync(join(stale, 'package.json'), JSON.stringify({ name: 'dependency', version: '1.0.0' }));
    assert.equal(metadataPath(join(sdk, 'package.json'), 'dependency'), realpathSync(join(owned, 'package.json')));
    rmSync(owned, { recursive: true });
    assert.equal(metadataPath(join(sdk, 'package.json'), 'dependency'), realpathSync(join(stale, 'package.json')));
    rmSync(stale, { recursive: true });
    assert.throws(() => metadataPath(join(sdk, 'package.json'), 'dependency'));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('resolves import-only metadata and the transitive SDK provider owner', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-import-resolution-'));
  try {
    const sdk = join(root, 'node_modules/sdk');
    const provider = join(sdk, 'node_modules/provider');
    const dependency = join(provider, 'node_modules/dependency');
    for (const directory of [sdk, provider, dependency]) mkdirSync(directory, { recursive: true });
    for (const [directory, name] of [
      [sdk, 'sdk'],
      [provider, 'provider'],
      [dependency, 'dependency'],
    ]) {
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({ name, version: '2.0.0', exports: { '.': { import: './index.mjs' } } }),
      );
      writeFileSync(join(directory, 'index.mjs'), 'export {};');
    }
    const owner = metadataPath(join(sdk, 'package.json'), 'provider');
    assert.equal(metadataPath(owner, 'dependency'), realpathSync(join(dependency, 'package.json')));
    assert.throws(() => metadataPath(join(sdk, 'package.json'), 'dependency'));
    assert.throws(() => metadataPath(owner, '../dependency'));
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'foreign', version: '2.0.0' }));
    assert.throws(() => metadataPath(owner, 'dependency'), /differs/);
  } finally {
    rmSync(root, { recursive: true });
  }
});

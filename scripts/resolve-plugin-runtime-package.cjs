#!/usr/bin/env node
// Resolve metadata through the actual installed dependency graph, including isolated linkers.
const { createRequire } = require('node:module');
const { readFileSync, realpathSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

function metadataPath(anchor, name) {
  const source = realpathSync(anchor);
  const request = createRequire(source);
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || name === '.' || name === '..') {
    throw Error('Expected a package name, not a path');
  }
  // Metadata need not be exported, and import-only packages have no require entry.
  // Search the same node_modules roots as Node, anchored to the owner's real location.
  for (const directory of request.resolve.paths(name) || []) {
    const file = join(directory, name, 'package.json');
    if (existsSync(file)) {
      const metadata = JSON.parse(readFileSync(file, 'utf8'));
      if ((metadata.name === undefined || metadata.name === name) && typeof metadata.version === 'string') {
        return realpathSync(file);
      }
      throw Error(`Package metadata for ${name} differs from the resolved dependency`);
    }
  }
  throw Error(`Package metadata for ${name} is unavailable`);
}

module.exports = { metadataPath };
if (require.main === module) {
  try {
    if (process.argv.length < 4) throw Error('Expected anchor package and dependency path');
    const metadata = process.argv.slice(3).reduce(metadataPath, resolve(process.argv[2]));
    process.stdout.write(metadata + '\n');
  } catch (error) {
    process.stderr.write(String(error.message) + '\n');
    process.exitCode = 1;
  }
}

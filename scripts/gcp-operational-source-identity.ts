import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function gcpOperationalSourceIdentity(root: string) {
  const modules = [
    'gcp-operational-source',
    'gcp-operational-command',
    'gcp-runtime-diagnostics',
    'gcp-operational-diagnosis',
    'gcp-operational-site-status',
    'gcp-operational-observation',
    'gcp-operational-runtime',
    'gcp-operational-binding',
    'gcp-operational-placement',
  ];
  const sourceHashes: Record<string, string> = {};
  for (const name of [...modules, 'evaluator']) {
    const path =
      name === 'evaluator' ? 'plugins/gcloud/src/ce/operational-health.ts' : `plugins/platform/src/ce/${name}.ts`;
    sourceHashes[name] = `sha256:${createHash('sha256')
      .update(await readFile(join(root, path)))
      .digest('hex')}`;
  }
  return sourceHashes;
}

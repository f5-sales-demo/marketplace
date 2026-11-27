import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTasks, pluginSourceFingerprint } from './presentation-tracker.mjs';

export function presentationFingerprintErrors(root) {
  const catalog = JSON.parse(readFileSync(resolve(root, '.xcsh-plugin/marketplace.json'), 'utf8'));
  const runtime = JSON.parse(readFileSync(resolve(root, 'scripts/agent-validation-runtime/package.json'), 'utf8'))
    .dependencies['@f5-sales-demo/xcsh'];
  if (!/^\d+\.\d+\.\d+$/.test(runtime)) throw new Error('Tracker runtime must be exact');
  const text = readFileSync(resolve(root, 'docs/marketplace-presentation-todo.md'), 'utf8');
  const metadata = JSON.parse(text.match(/<!-- tracker-metadata\n([\s\S]+?)\n-->/)?.[1] ?? 'null');
  const errors = [];
  if (metadata?.runtime !== runtime) errors.push('Tracker runtime differs from the declared validation runtime');
  const tasks = parseTasks(text);
  for (const plugin of catalog.plugins) {
    const fingerprint = pluginSourceFingerprint(root, plugin.source, runtime);
    const rows = tasks.filter((task) => task.id.startsWith(`${plugin.name}.`));
    if (!rows.length || rows.some((task) => task.input !== fingerprint))
      errors.push(`Stale presentation fingerprint: ${plugin.name}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
  // A working-tree check cannot qualify a different set of staged bytes.
  const unstaged = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      '--',
      'plugins',
      'scripts/agent-validation-runtime/package.json',
      'docs/marketplace-presentation-todo.md',
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  const errors = presentationFingerprintErrors(root);
  if (unstaged) errors.push('Stage all tracker inputs and the regenerated tracker before committing');
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error('Format inputs, regenerate with TRACKER_ACTION=update, stage, and recheck.');
    process.exitCode = 1;
  } else console.log('Presentation fingerprints match final staged plugin bytes and declared runtime.');
}

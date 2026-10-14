import { resolve } from 'node:path';

// Strict synthetic acceptance: no guessed token/turn scores and no live credentials.
// Prompt-driven model outcomes are recorded separately using prompts.json and Herdr.
const root = resolve(import.meta.dir, '../../..');
for (const [cwd, files] of [
  [resolve(root, 'plugins/salesforce'), ['test']],
  [resolve(root, 'scripts/agent-validation-runtime'), ['salesforce-workflows.test.ts']],
] as const) {
  const child = Bun.spawn([process.execPath, 'test', ...files], { cwd, stdout: 'inherit', stderr: 'inherit' });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}
console.log(
  'Synthetic Salesforce tool and terminal acceptance passed. Model-driven prompt acceptance is a separate required gate.',
);

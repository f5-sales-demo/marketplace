import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run against a published runtime package and the exact installed marketplace cache.
// Auth and organization responses stay in memory; the receipt contains outcomes only.
const [runtimeRoot, pluginRoot, mode = 'review'] = process.argv.slice(2);
if (!runtimeRoot || !pluginRoot || !['review', 'acceptance'].includes(mode)) {
  throw new Error(
    'Usage: bun scripts/verify-installed-salesforce.ts <runtime-package-root> <installed-plugin-root> [review|acceptance]',
  );
}
const { host } = await import(pathToFileURL(resolve(runtimeRoot, 'src/host/host.ts')).href);
const { software } = await import(pathToFileURL(resolve(runtimeRoot, 'src/host/software.ts')).href);
const runtime = { host, software };
const factory = (await import(pathToFileURL(resolve(pluginRoot, 'src/index.ts')).href)).default;
const tools: Array<{
  name: string;
  execute: (...args: unknown[]) => Promise<{ isError?: boolean; details?: unknown }>;
}> = [];
let definition:
  | {
      prepareSetup: () => Promise<{ steps: Array<{ kind: string; argv: string[] }>; validate?: () => Promise<void> }>;
      probe: (signal?: AbortSignal) => Promise<{ state: string }>;
    }
  | undefined;
const requireRuntime = createRequire(resolve(runtimeRoot, 'package.json'));
const { Type } = requireRuntime('@sinclair/typebox');
const pi = {
  host: runtime.host,
  software: runtime.software,
  typebox: { Type },
  setLabel() {},
  logger: { debug() {} },
  personProfile: { get: async () => ({ facts: {} }) },
  on() {},
  registerTool: (tool: (typeof tools)[number]) => tools.push(tool),
  exec: async (command: string, args: string[], options?: { signal?: AbortSignal; timeout?: number }) => {
    const timeout = AbortSignal.timeout(options?.timeout ?? 30_000);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const child = Bun.spawn([command, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code, killed: child.killed };
  },
  integrations: {
    register: (value: typeof definition) => {
      definition = value;
      return { get: async () => ({ state: 'setup_required' }) };
    },
  },
};
await factory(pi);
if (!definition) throw new Error('Installed Salesforce did not register its integration');
const plan = await definition.prepareSetup();
await plan.validate?.();
const executable = runtime.host.findExecutable('sf');
const expectedTools = ['sf_query', 'sf_describe', 'sf_org_display', 'sf_pipeline_report', 'sf_help', 'sf_exec'];
if (expectedTools.some((name) => !tools.some((tool) => tool.name === name)))
  throw new Error('Installed Salesforce tools are incomplete');
if (process.platform === 'darwin') {
  if ((await realpath(executable)) !== (await realpath('/opt/homebrew/bin/sf')))
    throw new Error('Expected normal Homebrew Salesforce CLI');
  if (plan.steps.length !== 1 || plan.steps[0].kind !== 'login' || plan.steps[0].argv[0] !== executable)
    throw new Error('Mac setup must reuse sf and contain browser login only');
}
const receipt: Record<string, unknown> = {
  mode,
  reviewed: true,
  installSteps: plan.steps.filter((step) => step.kind !== 'login').length,
  loginCommandPreserved: plan.steps.some(
    (step) => step.argv.slice(1).join(' ') === 'org login web --set-default --alias SFDC',
  ),
  tools: tools.map((tool) => tool.name),
};
if (mode === 'acceptance') {
  const snapshot = await definition.probe(AbortSignal.timeout(120_000));
  if (snapshot.state !== 'ready') throw new Error(`Installed Salesforce readiness: ${snapshot.state}`);
  const tool = tools.find((entry) => entry.name === 'sf_org_display');
  if (!tool) throw new Error('Installed org-display tool is missing');
  const result = await tool.execute('salesforce-acceptance', {}, AbortSignal.timeout(30_000), undefined, {
    cwd: process.cwd(),
  });
  if (result.isError) throw new Error('Installed Salesforce read-only org-display tool failed');
  receipt.state = 'ready';
  receipt.readOnlyTool = 'sf_org_display';
  receipt.readOnlyToolPassed = true;
}
console.log(JSON.stringify(receipt));

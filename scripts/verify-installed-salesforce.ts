import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
const { presentation } = await import(pathToFileURL(resolve(runtimeRoot, 'src/extensibility/presentation.ts')).href);
const runtime = { host, software, presentation };
const runtimeManifest = JSON.parse(await readFile(resolve(runtimeRoot, 'package.json'), 'utf8'));
const pluginManifest = JSON.parse(await readFile(resolve(pluginRoot, '.xcsh-plugin/plugin.json'), 'utf8'));
const factory = (await import(pathToFileURL(resolve(pluginRoot, 'src/index.ts')).href)).default;
const tools: Array<{
  name: string;
  execute: (...args: unknown[]) => Promise<{ isError?: boolean; details?: unknown }>;
}> = [];
let definition:
  | {
      prepareSetup: () => Promise<{ steps: Array<{ kind: string; argv: string[] }>; validate?: () => Promise<void> }>;
      probe: (signal?: AbortSignal) => Promise<{ state: string; value?: { userId: string; orgId: string } }>;
    }
  | undefined;
const requireRuntime = createRequire(resolve(runtimeRoot, 'package.json'));
const { Type } = requireRuntime('@sinclair/typebox');
const pi = {
  host: runtime.host,
  presentation: runtime.presentation,
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
  evidenceTier: 'installed-plugin-module',
  runtimePackageVersion: runtimeManifest.version,
  installedPluginVersion: pluginManifest.version,
  host: process.platform,
  setupExecuted: false,
  reviewed: true,
  installSteps: plan.steps.filter((step) => step.kind !== 'login').length,
  loginCommandPreserved: plan.steps.some(
    (step) =>
      step.argv.slice(1, 5).join(' ') === 'org login web --set-default' &&
      step.argv[5] === '--instance-url' &&
      typeof step.argv[6] === 'string',
  ),
  tools: tools.map((tool) => tool.name),
};
if (mode === 'acceptance') {
  const { readConfiguration, configurationPath } = await import(
    pathToFileURL(resolve(pluginRoot, 'src/configuration.ts')).href
  );
  const { sanitize } = await import(pathToFileURL(resolve(pluginRoot, 'src/sf/sanitize.ts')).href);
  const snapshot = await definition.probe(AbortSignal.timeout(120_000));
  receipt.state = snapshot.state;
  if (snapshot.state !== 'ready' || !snapshot.value) {
    receipt.blocked = true;
    receipt.readOnlyToolAttempted = false;
    receipt.readOnlyToolsPassed = false;
    receipt.nextAction = 'Use a host authorized for the expected Salesforce org and complete reviewed plugin setup.';
    process.exitCode = 1;
  } else {
    const evidenceDirectory =
      process.env.SF_ACCEPTANCE_EVIDENCE ||
      join(homedir(), '.xcsh', 'private', 'salesforce', 'acceptance', String(Date.now()));
    await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
    const privatePath = configurationPath();
    const config = await readConfiguration(privatePath);
    receipt.configurationHydrated = Boolean(config.orgs[snapshot.value.orgId]);
    receipt.configurationPermissions = (await stat(privatePath)).mode & 0o777;
    receipt.directoryPermissions = (await stat(dirname(privatePath))).mode & 0o777;
    if (
      !receipt.configurationHydrated ||
      receipt.configurationPermissions !== 0o600 ||
      receipt.directoryPermissions !== 0o700
    )
      throw new Error('Private configuration hydration or permissions failed.');
    const checks = [
      [
        'sf_query',
        { query: `SELECT Id FROM User WHERE Id = '${snapshot.value.userId}' LIMIT 1`, description: 'Verified user' },
      ],
      ['sf_describe', { sobject: 'Opportunity', match: 'amount' }],
      ['sf_org_display', {}],
      ['sf_pipeline_report', {}],
      ['sf_help', { command_path: 'org display' }],
      ['sf_exec', { args: ['org', 'display', '--json'] }],
    ] as const;
    const outcomes: Array<{ tool: string; passed: boolean }> = [];
    for (const [name, args] of checks) {
      const tool = tools.find((entry) => entry.name === name);
      if (!tool) throw new Error(`Installed tool missing: ${name}`);
      const result = await tool.execute(
        'salesforce-acceptance',
        args,
        AbortSignal.timeout(name === 'sf_pipeline_report' ? 180_000 : 60_000),
        undefined,
        { cwd: process.cwd() },
      );
      const sanitized = sanitize(result);
      const credentialSafe = JSON.stringify(sanitized) === JSON.stringify(result);
      await writeFile(join(evidenceDirectory, `${name}.json`), JSON.stringify(sanitized, null, 2), { mode: 0o600 });
      outcomes.push({ tool: name, passed: !result.isError && credentialSafe });
    }
    receipt.readOnlyTools = outcomes;
    receipt.readOnlyToolsPassed = outcomes.every((result) => result.passed);
    receipt.privateEvidencePreserved = true;
    if (!receipt.readOnlyToolsPassed) {
      receipt.blocked = true;
      process.exitCode = 1;
    }
  }
}
console.log(JSON.stringify(receipt));

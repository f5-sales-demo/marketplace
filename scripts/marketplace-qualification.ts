import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export interface Scenario {
  id: string;
  calls: { tool: string; args: Record<string, unknown> }[];
  guidance: string[];
  commands?: { name: string; args: string }[];
}
export const pluginOrder = [
  'aws',
  'azure',
  'gcloud',
  'platform',
  'github',
  'gitlab',
  'cloudstatus',
  'firecrawl',
  'devcontainer',
  'asm-migration',
  'kvm',
  'terraform',
  'herdr',
  'xorg',
  'ghostty',
  'zoom',
  'docs-tools',
  'docs-pipeline',
  'brand',
  'sales-engineer',
  'meddpicc',
  'osint-framework',
  'salesforce',
];

/** Read current canonical surfaces. This adds no registration discovery or fingerprint policy. */
export function qualificationCatalog(root: string) {
  const catalog = JSON.parse(readFileSync(join(root, '.xcsh-plugin/marketplace.json'), 'utf8'));
  const tracker = readFileSync(join(root, 'docs/marketplace-presentation-todo.md'), 'utf8').split(
    '## Retired surfaces',
  )[0];
  return pluginOrder.map((name) => {
    const item = catalog.plugins.find((p: any) => p.name === name);
    if (!item) throw new Error(`Missing canonical plugin: ${name}`);
    const base = resolve(root, item.source);
    const manifest = JSON.parse(readFileSync(join(base, '.xcsh-plugin/plugin.json'), 'utf8'));
    const packagePath = join(base, 'package.json');
    const pkg = existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, 'utf8')) : {};
    const entrypoints: string[] = manifest.extensions ?? pkg.xcsh?.extensions ?? [];
    for (const path of entrypoints) resolveShippedPath(base, path);
    const surfaces = [...new Set([...tracker.matchAll(new RegExp('`(' + name + '\\.[^`]+)`', 'g'))].map((m) => m[1]))];
    return {
      name,
      source: item.source,
      version: manifest.version,
      entrypoints,
      surfaces,
      lifecycle: manifest.lifecycle,
      serviceHosts:
        name === 'salesforce' ? ['darwin'] : ['xorg', 'zoom', 'kvm'].includes(name) ? ['linux'] : ['darwin', 'linux'],
      requirements: manifest.lifecycle?.requirements ?? [],
    };
  });
}

export function selectInstalledPlugin(registry: any, name: string) {
  const rows = Object.entries(registry.plugins ?? {}).flatMap(([key, values]) =>
    key.split('@')[0] === name && Array.isArray(values) ? values.map((row) => ({ ...row, id: key })) : [],
  );
  if (rows.length !== 1) throw new Error(`Qualification requires exactly one installed ${name} target`);
  const row = rows[0];
  if (
    typeof row.version !== 'string' ||
    !row.version ||
    typeof row.installPath !== 'string' ||
    !isAbsolute(row.installPath)
  )
    throw new Error('Installed plugin path and version are required');
  return row;
}

export function resolveShippedPath(root: string, path: string) {
  const base = realpathSync(root);
  if (isAbsolute(path)) throw new Error('Shipped path is outside selected plugin');
  const candidate = resolve(base, path);
  const inside = (value: string) => {
    const rel = relative(base, value);
    return rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
  };
  if (!inside(candidate)) throw new Error('Shipped path is outside selected plugin');
  const actual = realpathSync(candidate);
  if (!inside(actual)) throw new Error('Shipped path is outside selected plugin');
  return actual;
}

export function validateScenario(value: any): Scenario {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !/^[\w.-]+$/.test(value.id) ||
    !Array.isArray(value.calls) ||
    !Array.isArray(value.guidance) ||
    (!value.calls.length && !value.guidance.length)
  )
    throw new Error('Scenario requires a safe ID and explicit calls or guidance');
  for (const call of value.calls) {
    if (
      !call ||
      typeof call.tool !== 'string' ||
      !/^[\w.-]+$/.test(call.tool) ||
      ['read', 'bash', 'write', 'edit', 'task', 'subagent'].includes(call.tool) ||
      !call.args ||
      typeof call.args !== 'object' ||
      Array.isArray(call.args)
    )
      throw new Error('Scenario requires typed tools and exact argument objects');
  }
  if (new Set(value.calls.map((call: any) => JSON.stringify(call))).size !== value.calls.length)
    throw new Error('Duplicate scenario call');
  if (new Set(value.guidance).size !== value.guidance.length) throw new Error('Duplicate scenario guidance');
  if (
    value.guidance.some(
      (path: any) => typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..'),
    )
  )
    throw new Error('Scenario guidance must be shipped relative paths');
  if (
    value.commands !== undefined &&
    (!Array.isArray(value.commands) ||
      value.commands.some(
        (command: any) =>
          !command ||
          typeof command.name !== 'string' ||
          !/^[\w.-]+$/.test(command.name) ||
          typeof command.args !== 'string',
      ))
  )
    throw new Error('Scenario commands require exact names and arguments');
  return value;
}

/** No semantic read-only guessing: only the independently reviewed exact scenario is admitted. */
export function guardScenarioTool(event: any, scenario: Scenario, plugin: string) {
  const input = event.input;
  const allowed =
    event.toolName === 'read'
      ? input &&
        Object.keys(input).length === 1 &&
        typeof input.path === 'string' &&
        scenario.guidance.some((path) => resolve(plugin, path) === resolve(input.path))
      : scenario.calls.some((call) => call.tool === event.toolName && isDeepStrictEqual(call.args, input));
  if (!allowed)
    return {
      block: true,
      reason: 'Acceptance permits only the selected scenario tools, exact arguments and shipped guidance paths.',
    };
}

export function matrixControls(caseId: string) {
  if (!/^[\w.-]+$/.test(caseId)) throw new Error('Invalid capture case ID');
  return ['unicode', 'ascii', 'nerd'].flatMap((preset) =>
    ['xcsh-dark', 'xcsh-light'].flatMap((theme) =>
      [false, true].flatMap((expanded) =>
        [40, 76, 120, 153].map((width) => ({
          id: `${caseId}-${theme}-${preset}-${width}-${expanded ? 'E' : 'C'}`,
          case: caseId,
          theme,
          preset,
          width,
          expanded,
        })),
      ),
    ),
  );
}

export function assertPrivateCaptureRoot(root: string) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink()) throw new Error('Capture root cannot be a symlink');
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())
    throw new Error('Capture root must be private and owned by the current user');
}

export function validateCaptureIdentity(frame: any, control: any, provenance: any) {
  for (const key of ['id', 'case', 'width', 'expanded', 'theme', 'preset'])
    if (frame[key] !== control[key]) throw new Error('Capture identity mismatch: ' + key);
  for (const key of [
    'binary',
    'runtimeVersion',
    'pluginVersion',
    'plugin',
    'scenario',
    'mode',
    'scenarioSha256',
    'evidenceTier',
  ])
    if (!provenance[key] || frame[key] !== provenance[key]) throw new Error('Capture identity mismatch: ' + key);
}

if (import.meta.main) console.log(JSON.stringify(qualificationCatalog(resolve(import.meta.dir, '..')), null, 2));

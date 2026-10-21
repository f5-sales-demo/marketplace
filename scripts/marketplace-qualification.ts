import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export interface Scenario {
  id: string;
  calls: { tool: string; args: Record<string, unknown> }[];
  guidance: string[];
  fixtureReads?: {
    root: string;
    path: string;
    sha256: string;
    args: { path: string; sel?: ''; timeout?: number };
  }[];
  guidanceOptions?: { sel?: ''; timeout?: number }[];
  commands?: { name: string; args: string }[];
  shellCalls?: {
    path: string;
    section: string;
    sha256: string;
    args: { command: string; env: Record<string, string>; timeout: number; description?: string; cwd?: string };
  }[];
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
    const surfaces = [...new Set([...tracker.matchAll(new RegExp(`\`(${name}\\.[^\`]+)\``, 'g'))].map((m) => m[1]))];
    return {
      name,
      source: item.source,
      version: manifest.version,
      entrypoints,
      surfaces,
      lifecycle: manifest.lifecycle,
      serviceHosts:
        name === 'salesforce'
          ? ['darwin']
          : ['xorg', 'zoom', 'kvm', 'ghostty'].includes(name)
            ? ['linux']
            : ['darwin', 'linux'],
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
    return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
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
    (!value.calls.length && !value.guidance.length && !value.shellCalls?.length && !value.fixtureReads?.length)
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
  if (value.fixtureReads !== undefined) {
    const rules = value.fixtureReads;
    if (
      !Array.isArray(rules) ||
      !rules.length ||
      rules.some((rule: any) => {
        if (
          !rule ||
          typeof rule !== 'object' ||
          Array.isArray(rule) ||
          Object.keys(rule).some((key) => !['root', 'path', 'sha256', 'args'].includes(key))
        )
          return true;
        for (const key of ['root', 'path']) {
          const path = rule[key];
          if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || path.includes('\x00'))
            return true;
        }
        const rel = relative(rule.root, rule.path);
        if (
          !rel ||
          rel === '..' ||
          rel.startsWith(`..${sep}`) ||
          isAbsolute(rel) ||
          !/^[a-f0-9]{64}$/.test(rule.sha256)
        )
          return true;
        const args = rule.args;
        return (
          !args ||
          typeof args !== 'object' ||
          Array.isArray(args) ||
          args.path !== rule.path ||
          Object.keys(args).some((key) => !['path', 'sel', 'timeout'].includes(key)) ||
          ('sel' in args && args.sel !== '') ||
          ('timeout' in args && (!Number.isFinite(args.timeout) || args.timeout <= 0 || args.timeout > 120))
        );
      }) ||
      rules.some((rule: any, index: number) => rules.slice(0, index).some((prior: any) => prior.path === rule.path))
    )
      throw new Error('Scenario fixture reads require distinct exact private paths, digests and full-file arguments');
  }
  if (value.guidanceOptions !== undefined) {
    const options = value.guidanceOptions;
    if (
      !Array.isArray(options) ||
      !options.length ||
      options.some(
        (option: any) =>
          !option ||
          typeof option !== 'object' ||
          Array.isArray(option) ||
          Object.keys(option).some((key) => !['sel', 'timeout'].includes(key)) ||
          ('sel' in option && option.sel !== '') ||
          ('timeout' in option && (!Number.isFinite(option.timeout) || option.timeout <= 0)),
      ) ||
      options.some((option: any, index: number) =>
        options.slice(0, index).some((previous: any) => isDeepStrictEqual(previous, option)),
      )
    )
      throw new Error('Scenario guidance options require distinct exact full-file selectors and positive timeouts');
  }
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
  if (value.shellCalls !== undefined) {
    const rules = value.shellCalls;
    const object = (item: any) => item && typeof item === 'object' && !Array.isArray(item);
    if (
      !Array.isArray(rules) ||
      !rules.length ||
      rules.some(
        (rule: any) =>
          !object(rule) ||
          Object.keys(rule).some((key) => !['path', 'section', 'sha256', 'args'].includes(key)) ||
          typeof rule.path !== 'string' ||
          !rule.path ||
          isAbsolute(rule.path) ||
          rule.path.includes('\\') ||
          rule.path.includes('\x00') ||
          rule.path.split('/').includes('..') ||
          typeof rule.section !== 'string' ||
          !rule.section.trim() ||
          ['\r', '\n', '\x00'].some((character) => rule.section.includes(character)) ||
          !/^[a-f0-9]{64}$/.test(rule.sha256) ||
          !object(rule.args) ||
          Object.keys(rule.args).some((key) => !['command', 'env', 'timeout', 'description', 'cwd'].includes(key)) ||
          ('cwd' in rule.args &&
            (typeof rule.args.cwd !== 'string' ||
              !isAbsolute(rule.args.cwd) ||
              resolve(rule.args.cwd) !== rule.args.cwd ||
              rule.args.cwd.includes('\x00'))) ||
          ('description' in rule.args &&
            (typeof rule.args.description !== 'string' ||
              !rule.args.description.trim() ||
              rule.args.description.length > 256 ||
              rule.args.description.includes('\x00'))) ||
          typeof rule.args.command !== 'string' ||
          !rule.args.command ||
          rule.args.command.includes('\x00') ||
          !object(rule.args.env) ||
          Object.entries(rule.args.env).some(
            ([name, value]) =>
              !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || typeof value !== 'string' || value.includes('\x00'),
          ) ||
          !Number.isFinite(rule.args.timeout) ||
          rule.args.timeout <= 0 ||
          rule.args.timeout > 120 ||
          createHash('sha256').update(rule.args.command).digest('hex') !== rule.sha256,
      ) ||
      rules.some((rule: any, index: number) =>
        rules
          .slice(0, index)
          .some(
            (previous: any) =>
              isDeepStrictEqual(previous.args, rule.args) ||
              (previous.path === rule.path && previous.section === rule.section),
          ),
      )
    )
      throw new Error(
        'Scenario shell calls require distinct exact shipped scripts, digests, environments and bounded timeouts',
      );
  }
  return value;
}

/** Recheck the reviewed synthetic file at admission; never follow indirect paths. */
export function validateFixtureRead(rule: NonNullable<Scenario['fixtureReads']>[number]) {
  try {
    assertPrivateCaptureRoot(rule.root);
    if (realpathSync(rule.root) !== rule.root) throw new Error('Indirect root');
    const rel = relative(rule.root, rule.path);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Outside root');
    const parts = rel.split(sep);
    for (let index = 1; index <= parts.length; index++) {
      const metadata = lstatSync(join(rule.root, ...parts.slice(0, index)));
      if (metadata.isSymbolicLink() || (index < parts.length ? !metadata.isDirectory() : !metadata.isFile()))
        throw new Error('Indirect or nonregular path');
    }
    if (
      realpathSync(rule.path) !== rule.path ||
      createHash('sha256').update(readFileSync(rule.path)).digest('hex') !== rule.sha256
    )
      throw new Error('Changed contents');
  } catch {
    throw new Error('Reviewed fixture path, privacy or contents changed');
  }
}

/** Strict Markdown subset: one named section containing exactly one Bash fence. */
export function validateScenarioSources(scenario: Scenario, plugin: string) {
  for (const rule of scenario.fixtureReads ?? []) validateFixtureRead(rule);
  for (const rule of scenario.shellCalls ?? []) {
    if (rule.args.cwd !== undefined) {
      const cwd = rule.args.cwd;
      // The reviewed working directory must still exist without symlink indirection.
      // Exact args remain bound at dispatch; no cwd normalization widens admission.
      if (!lstatSync(cwd).isDirectory() || realpathSync(cwd) !== cwd)
        throw new Error('Reviewed shell working directory is missing, changed or indirect');
    }
    const source = readFileSync(resolveShippedPath(plugin, rule.path), 'utf8');
    const lines = source.split('\n');
    const blocks: string[] = [];
    let fence: string | undefined;
    let selected = false;
    let level = 0;
    let matches = 0;
    let body: string[] | undefined;
    for (const line of lines) {
      const marker = /^(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
          if (body) blocks.push(`${body.join('\n')}\n`);
          body = undefined;
          fence = undefined;
        } else if (body) body.push(line);
        continue;
      }
      if (marker) {
        fence = marker[1];
        // A Bash-looking fence inside another fence is literal prose, never executable source.
        if (selected && line === '```bash') body = [];
        continue;
      }
      const heading = /^(#{1,6}) (.+)$/.exec(line);
      if (heading) {
        if (selected && heading[1].length <= level) selected = false;
        if (heading[2] === rule.section) {
          matches++;
          selected = true;
          level = heading[1].length;
        }
      }
    }
    if (
      fence ||
      matches !== 1 ||
      blocks.length !== 1 ||
      blocks[0] !== rule.args.command ||
      createHash('sha256').update(blocks[0]).digest('hex') !== rule.sha256
    )
      throw new Error('Shipped shell section is missing, ambiguous or changed');
  }
}

/** No semantic read-only guessing: only the independently reviewed exact scenario is admitted. */
export function guardScenarioTool(event: any, scenario: Scenario, plugin: string) {
  const input = event.input;
  if (event.toolName === 'bash') {
    try {
      validateScenario(scenario);
      validateScenarioSources(scenario, plugin);
      if (scenario.shellCalls?.some((rule) => isDeepStrictEqual(rule.args, input))) return;
    } catch {
      /* A changed or escaped source must fail closed at dispatch. */
    }
    return {
      block: true,
      reason: 'Acceptance permits only exact reviewed shipped shell scripts and arguments.',
    };
  }
  if (event.toolName === 'read') {
    const rule = scenario.fixtureReads?.find((rule) => isDeepStrictEqual(rule.args, input));
    if (rule) {
      try {
        validateFixtureRead(rule);
        return;
      } catch {
        return { block: true, reason: 'Reviewed fixture path, privacy or contents changed.' };
      }
    }
  }
  const allowed =
    event.toolName === 'read'
      ? input &&
        typeof input.path === 'string' &&
        (scenario.guidanceOptions ?? [{}]).some((options) =>
          isDeepStrictEqual(input, { path: input.path, ...options }),
        ) &&
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
    if (frame[key] !== control[key]) throw new Error(`Capture identity mismatch: ${key}`);
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
    if (!provenance[key] || frame[key] !== provenance[key]) throw new Error(`Capture identity mismatch: ${key}`);
}

if (import.meta.main) console.log(JSON.stringify(qualificationCatalog(resolve(import.meta.dir, '..')), null, 2));

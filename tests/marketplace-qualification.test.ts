import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPrivateCaptureRoot,
  guardScenarioTool,
  matrixControls,
  qualificationCatalog,
  resolveShippedPath,
  selectInstalledPlugin,
  validateCaptureIdentity,
  validateScenario,
  validateScenarioSources,
} from '../scripts/marketplace-qualification';

test('catalog includes all current surfaces and entrypoints without Salesforce retirement history', () => {
  const catalog = qualificationCatalog(join(import.meta.dir, '..'));
  expect(catalog).toHaveLength(22);
  expect(catalog.find((p) => p.name === 'aws')?.entrypoints).toEqual(['dist/runtime.js']);
  expect(catalog.find((p) => p.name === 'zoom')?.entrypoints).toEqual(['extensions/integration.ts']);
  expect(catalog.find((p) => p.name === 'brand')?.entrypoints).toEqual([]);
  expect(catalog.find((p) => p.name === 'salesforce')?.surfaces).not.toContain(
    'salesforce.lifecycle.event.tool_execution_end',
  );
  expect(catalog.find((p) => p.name === 'salesforce')?.serviceHosts).toEqual(['darwin']);
  expect(catalog.find((p) => p.name === 'ghostty')?.serviceHosts).toEqual(['linux']);
});

test('installed selection rejects ambiguity, missing version and mismatched identity', () => {
  const registry = {
    plugins: {
      'aws@catalog': [{ installPath: '/installed/aws', version: '2.3.0' }],
    },
  };
  expect(selectInstalledPlugin(registry, 'aws')).toMatchObject({
    installPath: '/installed/aws',
    version: '2.3.0',
  });
  expect(() => selectInstalledPlugin(registry, 'azure')).toThrow('exactly one');
  expect(() =>
    selectInstalledPlugin(
      {
        plugins: {
          'aws@a': registry.plugins['aws@catalog'],
          'aws@b': registry.plugins['aws@catalog'],
        },
      },
      'aws',
    ),
  ).toThrow('exactly one');
  expect(() => selectInstalledPlugin({ plugins: { 'aws@catalog': [{ installPath: '/a' }] } }, 'aws')).toThrow(
    'version',
  );
});

const scenario = {
  id: 'identity',
  calls: [
    {
      tool: 'aws_sts_whoami',
      args: { profile: 'example', region: 'ca-central-1' },
    },
  ],
  guidance: ['skills/aws-cli/SKILL.md'],
};
test('scenario admission binds tool, every argument and scope; denies unrestricted execution', () => {
  expect(
    guardScenarioTool(
      {
        toolName: 'aws_sts_whoami',
        input: { region: 'ca-central-1', profile: 'example' },
      },
      scenario,
      '/installed/aws',
    ),
  ).toBeUndefined();
  for (const input of [{}, { profile: 'other', region: 'ca-central-1' }, { ...scenario.calls[0].args, extra: true }])
    expect(guardScenarioTool({ toolName: 'aws_sts_whoami', input }, scenario, '/installed/aws')).toMatchObject({
      block: true,
    });
  for (const toolName of ['bash', 'write', 'task', 'subagent', 'aws_exec', 'aws_ce_apply'])
    expect(guardScenarioTool({ toolName, input: {} }, scenario, '/installed/aws')).toMatchObject({ block: true });
  expect(
    guardScenarioTool(
      {
        toolName: 'read',
        input: { path: '/installed/aws/skills/aws-cli/SKILL.md' },
      },
      scenario,
      '/installed/aws',
    ),
  ).toBeUndefined();
  expect(
    guardScenarioTool({ toolName: 'read', input: { path: '/installed/aws/credentials' } }, scenario, '/installed/aws'),
  ).toMatchObject({ block: true });
  expect(
    guardScenarioTool(
      {
        toolName: 'read',
        input: { path: '/installed/aws/skills/aws-cli/SKILL.md', offset: 20 },
      },
      scenario,
      '/installed/aws',
    ),
  ).toMatchObject({ block: true });
});

test('scenario rejects malformed, duplicate and incomplete rules rather than allowing a broad default', () => {
  for (const value of [
    null,
    {},
    { id: 'x', calls: [], guidance: [] },
    { ...scenario, calls: [{ tool: 'bash' }] },
    { ...scenario, calls: [{ tool: 'read', args: {} }] },
  ])
    expect(() => validateScenario(value)).toThrow();
  expect(validateScenario(scenario)).toEqual(scenario);
});

test('guidance binds explicitly reviewed full-file read options without widening path or argument access', () => {
  const reviewed = {
    ...scenario,
    guidanceOptions: [{}, { sel: '' as const, timeout: 20 }],
  };
  expect(validateScenario(reviewed)).toEqual(reviewed);
  const path = '/installed/aws/skills/aws-cli/SKILL.md';
  for (const options of reviewed.guidanceOptions)
    expect(
      guardScenarioTool({ toolName: 'read', input: { path, ...options } }, reviewed, '/installed/aws'),
    ).toBeUndefined();
  for (const input of [
    { path, sel: '' },
    { path, sel: '', timeout: 21 },
    { path, sel: '', timeout: 20, offset: 1 },
    { path: '/installed/aws/credentials', sel: '', timeout: 20 },
  ])
    expect(guardScenarioTool({ toolName: 'read', input }, reviewed, '/installed/aws')).toMatchObject({ block: true });
  // The original path-only policy remains exact when no options were reviewed.
  expect(
    guardScenarioTool({ toolName: 'read', input: { path, sel: '', timeout: 20 } }, scenario, '/installed/aws'),
  ).toMatchObject({ block: true });
});

test('guidance option declarations reject partial reads, arbitrary keys and invalid timeouts', () => {
  for (const guidanceOptions of [
    null,
    {},
    [],
    [null],
    [{ path: 'credentials' }],
    [{ sel: '1:5' }],
    [{ timeout: 0 }],
    [{ timeout: Infinity }],
    [{ timeout: '20' }],
    [{}, {}],
  ])
    expect(() => validateScenario({ ...scenario, guidanceOptions })).toThrow('guidance options');
});

test('shipped paths cannot escape through traversal or symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'qualification-path-'));
  try {
    mkdirSync(join(root, 'plugin'));
    writeFileSync(join(root, 'private'), 'synthetic');
    symlinkSync(join(root, 'private'), join(root, 'plugin', 'escape'));
    expect(() => resolveShippedPath(join(root, 'plugin'), '../private')).toThrow('outside');
    expect(() => resolveShippedPath(join(root, 'plugin'), 'escape')).toThrow('outside');
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('each case has the exact 48 appearance combinations with unique safe frame IDs', () => {
  const matrix = matrixControls('identity');
  expect(matrix).toHaveLength(48);
  expect(new Set(matrix.map((c) => c.id)).size).toBe(48);
  expect(new Set(matrix.map((c) => c.width))).toEqual(new Set([40, 76, 120, 153]));
  expect(() => matrixControls('../private')).toThrow('case ID');
});

test('capture identity binds every appearance control and installed provenance', () => {
  const control = matrixControls('identity')[0];
  const provenance = {
    binary: '/bin/xcsh',
    runtimeVersion: '23.9.3',
    pluginVersion: '2.3.0',
    plugin: 'aws',
    scenario: 'identity',
    mode: 'fixture',
    scenarioSha256: 'abc',
    evidenceTier: 'fixture',
  };
  const frame = { ...control, ...provenance };
  expect(() => validateCaptureIdentity(frame, control, provenance)).not.toThrow();
  for (const key of Object.keys(frame)) {
    expect(() => validateCaptureIdentity({ ...frame, [key]: 'changed' }, control, provenance)).toThrow('identity');
  }
});

test('capture roots reject public permissions and symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'qualification-root-'));
  try {
    mkdirSync(join(root, 'public'), { mode: 0o755 });
    mkdirSync(join(root, 'private'), { mode: 0o700 });
    symlinkSync(join(root, 'private'), join(root, 'link'));
    expect(() => assertPrivateCaptureRoot(join(root, 'private'))).not.toThrow();
    expect(() => assertPrivateCaptureRoot(join(root, 'public'))).toThrow('private');
    expect(() => assertPrivateCaptureRoot(join(root, 'link'))).toThrow('symlink');
  } finally {
    rmSync(root, { recursive: true });
  }
});

import { inspectCapture } from '../scripts/drive-marketplace-capture';

test('individual frame inspection reports failed, empty, overflow and lost literal evidence', () => {
  const frame = {
    id: 'zero',
    case: 'zero',
    width: 40,
    expanded: false,
    lines: ['0 false "" unknown'],
    resultIsError: false,
  };
  expect(inspectCapture(frame, { contains: ['0', 'false', '""', 'unknown'] }, (text) => text.length).passed).toBe(true);
  expect(inspectCapture({ ...frame, lines: [] }, { expectedError: true }, (text) => text.length).failures).toEqual([
    'empty-frame',
    'unexpected-outcome',
  ]);
  expect(
    inspectCapture({ ...frame, lines: ['x'.repeat(41)] }, { contains: ['0'] }, (text) => text.length).failures,
  ).toEqual(['overflow', 'missing-literal:0']);
});

test('inspection reconstructs wrapped fields and each table cell without joining unrelated values', () => {
  const frame = {
    id: 'wrapped',
    case: 'wrapped',
    width: 153,
    expanded: true,
    resultIsError: false,
  };
  const check = (lines: string[], literal: string) =>
    inspectCapture({ ...frame, lines }, { contains: [literal] }, (line) => Bun.stripANSI(line).length).passed;
  expect(check(['│ │ \x1b[1mid\x1b[22m: abc │', '│ │ def │'], 'abcdef')).toBe(true);
  for (const bar of ['│', '|']) {
    const lines = [`${bar} ${bar} first ${bar} Example ${bar} ${bar}`, `${bar} ${bar} cell ${bar} 11 ${bar} ${bar}`];
    expect(check(lines, 'Example 11')).toBe(true);
    expect(check(lines, 'firstcell')).toBe(true);
    expect(check(lines, 'firstExample')).toBe(false);
    expect(check([lines[0], `${bar} +---+---+ ${bar}`, lines[1]], 'Example 11')).toBe(false);
  }
  expect(check(['│ │ \x1b[1mone\x1b[22m: abc │', '│ │ \x1b[1mtwo\x1b[22m: def │'], 'abcdef')).toBe(false);
  expect(check(['abc', 'def'], 'abcdef')).toBe(false);
  expect(check(['│   "description": "All Systems │', '│ Operational", │'], 'All Systems Operational')).toBe(true);
  expect(check(['│   "one": "abc", │', '│   "two": "def" │'], 'abcdef')).toBe(false);
  expect(check(['│   "one": "abc", │', '│ def │'], 'abcdef')).toBe(false);
  expect(check(['│   "one": "abc │', '├── Output ──┤', '│ def" │'], 'abcdef')).toBe(false);
});

test('inspection rejects duplicated or missing evidence markers', () => {
  const frame = {
    id: 'once',
    case: 'once',
    width: 40,
    expanded: true,
    resultIsError: false,
  };
  for (const [lines, passed] of [
    [['ce-once'], true],
    [['ce-once ce-once'], false],
    [['other'], false],
  ] as const)
    expect(inspectCapture({ ...frame, lines }, { occurrences: { 'ce-once': 1 } }, (line) => line.length).passed).toBe(
      passed,
    );
});

test('wrapped forbidden values remain detectable and appearance-specific occurrence rules override defaults', () => {
  const frame = {
    id: 'wrapped-unsafe',
    case: 'unsafe',
    width: 76,
    expanded: true,
    resultIsError: false,
  };
  const lines = ['│ │ \x1b[1mvalue\x1b[22m: SYNTHETIC_SECRET_ │', '│ │ SENTINEL │'];
  const finding = inspectCapture(
    { ...frame, lines },
    { absent: ['SYNTHETIC_SECRET_SENTINEL'] },
    (line) => Bun.stripANSI(line).length,
  );
  expect(finding.failures).toContain('unexpected-literal:SYNTHETIC_SECRET_SENTINEL');
  expect(finding.failures).toContain('unsafe-evidence');
  expect(
    inspectCapture(
      { ...frame, lines: ['once'] },
      { occurrences: { once: 0 }, expandedOccurrences: { once: 1 } },
      (line) => line.length,
    ).passed,
  ).toBe(true);
  expect(
    inspectCapture(
      { ...frame, expanded: false, lines: ['once'] },
      { occurrences: { once: 0 }, collapsedOccurrences: { once: 1 } },
      (line) => line.length,
    ).passed,
  ).toBe(true);
});

test('reviewed shell lane binds exact shipped fence, digest, environment and arguments', () => {
  const root = mkdtempSync(join(tmpdir(), 'qualification-shell-'));
  const command = 'printf "%s\\n" "$QUERY"\n';
  try {
    writeFileSync(join(root, 'commands.md'), `## inspect\n\n\`\`\`bash\n${command}\`\`\`\n`);
    const reviewed = {
      id: 'inspect',
      calls: [],
      guidance: ['commands.md'],
      shellCalls: [
        {
          path: 'commands.md',
          section: 'inspect',
          sha256: createHash('sha256').update(command).digest('hex'),
          args: { command, env: { QUERY: 'synthetic; $(false)' }, timeout: 20 },
        },
      ],
    };
    expect(validateScenario(reviewed)).toEqual(reviewed);
    expect(guardScenarioTool({ toolName: 'bash', input: reviewed.shellCalls[0].args }, reviewed, root)).toBeUndefined();
    const described = {
      ...reviewed,
      shellCalls: [
        { ...reviewed.shellCalls[0], args: { ...reviewed.shellCalls[0].args, description: 'Inspect once' } },
      ],
    };
    expect(validateScenario(described)).toEqual(described);
    expect(
      guardScenarioTool({ toolName: 'bash', input: described.shellCalls[0].args }, described, root),
    ).toBeUndefined();
    for (const description of ['', '   ', 1, null, 'x\x00', 'x'.repeat(257)])
      expect(() =>
        validateScenario({
          ...described,
          shellCalls: [{ ...described.shellCalls[0], args: { ...described.shellCalls[0].args, description } }],
        }),
      ).toThrow();
    for (const input of [
      reviewed.shellCalls[0].args,
      { ...described.shellCalls[0].args, description: 'Other' },
      { ...described.shellCalls[0].args, extra: true },
    ])
      expect(guardScenarioTool({ toolName: 'bash', input }, described, root)).toMatchObject({ block: true });
    expect(guardScenarioTool({ toolName: 'bash', input: described.shellCalls[0].args }, reviewed, root)).toMatchObject({
      block: true,
    });
    for (const input of [
      { ...reviewed.shellCalls[0].args, command: `${command}false\n` },
      { ...reviewed.shellCalls[0].args, env: { QUERY: 'other' } },
      { ...reviewed.shellCalls[0].args, timeout: 21 },
      { ...reviewed.shellCalls[0].args, extra: true },
    ])
      expect(guardScenarioTool({ toolName: 'bash', input }, reviewed, root)).toMatchObject({ block: true });
    for (const shellCalls of [
      [],
      [null],
      [{ ...reviewed.shellCalls[0], sha256: 'wrong' }],
      [{ ...reviewed.shellCalls[0], path: '../private' }],
      [{ ...reviewed.shellCalls[0], args: { command } }],
      [
        {
          ...reviewed.shellCalls[0],
          args: { ...reviewed.shellCalls[0].args, timeout: 0 },
        },
      ],
      [reviewed.shellCalls[0], reviewed.shellCalls[0]],
    ])
      expect(() => validateScenario({ ...reviewed, shellCalls })).toThrow();
    writeFileSync(join(root, 'commands.md'), '## inspect\n\n```bash\nfalse\n```\n');
    expect(guardScenarioTool({ toolName: 'bash', input: reviewed.shellCalls[0].args }, reviewed, root)).toMatchObject({
      block: true,
    });
    expect(guardScenarioTool({ toolName: 'task', input: reviewed.shellCalls[0].args }, reviewed, root)).toMatchObject({
      block: true,
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('shell source admission rejects ambiguous sections, fences, missing files and symlink escapes', () => {
  const root = mkdtempSync(join(tmpdir(), 'qualification-shell-source-'));
  const command = 'printf "synthetic\\n"\n';
  const fence = `\`\`\`bash\n${command}\`\`\`\n`;
  const scenario = validateScenario({
    id: 'inspect',
    calls: [],
    guidance: [],
    shellCalls: [
      {
        path: 'commands.md',
        section: 'inspect',
        sha256: createHash('sha256').update(command).digest('hex'),
        args: { command, env: {}, timeout: 20 },
      },
    ],
  });
  const event = { toolName: 'bash', input: scenario.shellCalls?.[0].args };
  try {
    for (const source of [
      `## other\n${fence}`,
      `## inspect\n${fence}## inspect\n${fence}`,
      `## inspect\n${fence}### inspect\n${fence}`,
      `## inspect\n${fence}${fence}`,
      `\`\`\`text\n## inspect\n${fence}`,
      `## inspect\n\`\`\`bash\n${command}`,
      `## inspect\n~~~text\n${fence}~~~\n`,
      `## inspect\n\`\`\`\`text\n${fence}\`\`\`\`\n`,
    ]) {
      writeFileSync(join(root, 'commands.md'), source);
      expect(guardScenarioTool(event, scenario, root)).toMatchObject({ block: true });
    }
    rmSync(join(root, 'commands.md'));
    expect(guardScenarioTool(event, scenario, root)).toMatchObject({ block: true });
    symlinkSync('/etc/hosts', join(root, 'commands.md'));
    expect(guardScenarioTool(event, scenario, root)).toMatchObject({ block: true });
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('shell rules reject invalid environments, digests, timeouts, extra fields and duplicate execution', () => {
  const command = 'true\n';
  const rule = {
    path: 'commands.md',
    section: 'inspect',
    sha256: createHash('sha256').update(command).digest('hex'),
    args: { command, env: {}, timeout: 20 },
  };
  for (const candidate of [
    { ...rule, args: { ...rule.args, env: { 'BAD-NAME': 'x' } } },
    { ...rule, args: { ...rule.args, env: { QUERY: 0 } } },
    { ...rule, args: { ...rule.args, env: { QUERY: 'x\x00' } } },
    { ...rule, args: { ...rule.args, env: null } },
    { ...rule, args: { ...rule.args, timeout: 121 } },
    { ...rule, args: { ...rule.args, timeout: Infinity } },
    { ...rule, args: { ...rule.args, cwd: 'relative' } },
    { ...rule, sha256: '0'.repeat(64) },
    { ...rule, section: '' },
    { ...rule, path: '/etc/hosts' },
    { ...rule, extra: true },
  ])
    expect(() => validateScenario({ id: 'inspect', calls: [], guidance: [], shellCalls: [candidate] })).toThrow();
  expect(() =>
    validateScenario({ id: 'inspect', calls: [], guidance: [], shellCalls: [rule, { ...rule, section: 'other' }] }),
  ).toThrow();
});

test('private fixture reads bind physical paths, content digest and exact full-file arguments', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'private-fixture-')));
  const file = join(root, 'review.mdx');
  try {
    writeFileSync(file, 'synthetic review\n');
    const rule = {
      root,
      path: file,
      sha256: createHash('sha256').update('synthetic review\n').digest('hex'),
      args: { path: file, sel: '' as const, timeout: 120 },
    };
    const reviewed = { id: 'fixture-review', calls: [], guidance: [], fixtureReads: [rule] };
    expect(validateScenario(reviewed)).toEqual(reviewed);
    validateScenarioSources(reviewed, '/unused-installation');
    expect(guardScenarioTool({ toolName: 'read', input: rule.args }, reviewed, '/unused-installation')).toBeUndefined();
    for (const input of [
      { path: file },
      { ...rule.args, timeout: 20 },
      { ...rule.args, sel: '1:5' },
      { ...rule.args, extra: true },
      { ...rule.args, path: join(root, 'other.mdx') },
    ])
      expect(guardScenarioTool({ toolName: 'read', input }, reviewed, '/unused-installation')).toMatchObject({
        block: true,
      });
    writeFileSync(file, 'changed\n');
    expect(() => validateScenarioSources(reviewed, '/unused-installation')).toThrow('fixture');
    expect(guardScenarioTool({ toolName: 'read', input: rule.args }, reviewed, '/unused-installation')).toMatchObject({
      block: true,
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('private fixture admission rejects broad declarations, symlinks and nonprivate roots', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'private-fixture-')));
  const file = join(root, 'review.mdx');
  try {
    writeFileSync(file, 'synthetic');
    const rule = {
      root,
      path: file,
      sha256: createHash('sha256').update('synthetic').digest('hex'),
      args: { path: file, sel: '' as const, timeout: 120 },
    };
    const reviewed = { id: 'fixture-review', calls: [], guidance: [], fixtureReads: [rule] };
    for (const fixtureReads of [
      [],
      [rule, rule],
      [{ ...rule, root: 'relative' }],
      [{ ...rule, path: join(root, '..', 'outside') }],
      [{ ...rule, sha256: 'bad' }],
      [{ ...rule, args: { ...rule.args, sel: '1:5' } }],
      [{ ...rule, args: { ...rule.args, timeout: 121 } }],
      [{ ...rule, args: { ...rule.args, path: join(root, 'other') } }],
    ])
      expect(() => validateScenario({ ...reviewed, fixtureReads })).toThrow();
    symlinkSync(file, join(root, 'indirect'));
    const linked = { ...rule, path: join(root, 'indirect'), args: { ...rule.args, path: join(root, 'indirect') } };
    expect(() => validateScenarioSources({ ...reviewed, fixtureReads: [linked] }, '/unused')).toThrow('fixture');
    chmodSync(root, 0o755);
    expect(() => validateScenarioSources(reviewed, '/unused')).toThrow('fixture');
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('reviewed shell cwd admits only an exact existing directory and rejects changed or unsafe targets', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qualification-shell-cwd-')));
  const command = 'true\n';
  writeFileSync(join(root, 'commands.md'), `## inspect\n\n\`\`\`bash\n${command}\`\`\`\n`);
  const cwd = join(root, 'work');
  mkdirSync(cwd);
  symlinkSync(cwd, join(root, 'link'));
  const rule = {
    path: 'commands.md',
    section: 'inspect',
    sha256: createHash('sha256').update(command).digest('hex'),
    args: { command, env: {}, timeout: 20, description: 'Inspect once', cwd },
  };
  const reviewed = { id: 'inspect', calls: [], guidance: [], shellCalls: [rule] };
  try {
    expect(validateScenario(reviewed)).toEqual(reviewed);
    expect(guardScenarioTool({ toolName: 'bash', input: rule.args }, reviewed, root)).toBeUndefined();
    expect(guardScenarioTool({ toolName: 'bash', input: { ...rule.args, cwd: root } }, reviewed, root)).toMatchObject({
      block: true,
    });
    for (const target of [
      'work',
      '',
      '/tmp/../tmp',
      join(root, 'missing'),
      join(root, 'commands.md'),
      join(root, 'link'),
    ]) {
      const unsafe = { ...reviewed, shellCalls: [{ ...rule, args: { ...rule.args, cwd: target } }] };
      expect(guardScenarioTool({ toolName: 'bash', input: unsafe.shellCalls[0].args }, unsafe, root)).toMatchObject({
        block: true,
      });
    }
    // Filesystem replacement after review must fail closed at dispatch.
    rmSync(cwd, { recursive: true });
    symlinkSync(root, cwd);
    expect(guardScenarioTool({ toolName: 'bash', input: rule.args }, reviewed, root)).toMatchObject({ block: true });
  } finally {
    rmSync(root, { recursive: true });
  }
});

import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
} from '../scripts/marketplace-qualification';

test('catalog includes all current surfaces and entrypoints without Salesforce retirement history', () => {
  const catalog = qualificationCatalog(join(import.meta.dir, '..'));
  expect(catalog).toHaveLength(23);
  expect(catalog.find((p) => p.name === 'aws')?.entrypoints).toEqual(['src/index.ts']);
  expect(catalog.find((p) => p.name === 'zoom')?.entrypoints).toEqual(['extensions/integration.ts']);
  expect(catalog.find((p) => p.name === 'brand')?.entrypoints).toEqual([]);
  expect(catalog.find((p) => p.name === 'salesforce')?.surfaces).not.toContain(
    'salesforce.lifecycle.event.tool_execution_end',
  );
  expect(catalog.find((p) => p.name === 'salesforce')?.serviceHosts).toEqual(['darwin']);
});

test('installed selection rejects ambiguity, missing version and mismatched identity', () => {
  const registry = { plugins: { 'aws@catalog': [{ installPath: '/installed/aws', version: '2.3.0' }] } };
  expect(selectInstalledPlugin(registry, 'aws')).toMatchObject({ installPath: '/installed/aws', version: '2.3.0' });
  expect(() => selectInstalledPlugin(registry, 'azure')).toThrow('exactly one');
  expect(() =>
    selectInstalledPlugin(
      { plugins: { 'aws@a': registry.plugins['aws@catalog'], 'aws@b': registry.plugins['aws@catalog'] } },
      'aws',
    ),
  ).toThrow('exactly one');
  expect(() => selectInstalledPlugin({ plugins: { 'aws@catalog': [{ installPath: '/a' }] } }, 'aws')).toThrow(
    'version',
  );
});

const scenario = {
  id: 'identity',
  calls: [{ tool: 'aws_sts_whoami', args: { profile: 'example', region: 'ca-central-1' } }],
  guidance: ['skills/aws-cli/SKILL.md'],
};
test('scenario admission binds tool, every argument and scope; denies unrestricted execution', () => {
  expect(
    guardScenarioTool(
      { toolName: 'aws_sts_whoami', input: { region: 'ca-central-1', profile: 'example' } },
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
      { toolName: 'read', input: { path: '/installed/aws/skills/aws-cli/SKILL.md' } },
      scenario,
      '/installed/aws',
    ),
  ).toBeUndefined();
  expect(
    guardScenarioTool({ toolName: 'read', input: { path: '/installed/aws/credentials' } }, scenario, '/installed/aws'),
  ).toMatchObject({ block: true });
  expect(
    guardScenarioTool(
      { toolName: 'read', input: { path: '/installed/aws/skills/aws-cli/SKILL.md', offset: 20 } },
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

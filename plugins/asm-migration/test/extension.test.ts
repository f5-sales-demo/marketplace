import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Type } from '@sinclair/typebox';
import factory from '../src/index';

test('registers both native tools and returns structured results', async () => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  await factory({
    typebox: { Type },
    setLabel(label: string) {
      expect(label).toBe('ASM Migration');
    },
    registerTool(tool: unknown) {
      tools.push(tool as (typeof tools)[number]);
    },
  });
  expect(tools.map((tool) => tool.name)).toEqual(['asm_migration_validate', 'asm_migration_convert']);
  const cwd = resolve(import.meta.dir, '..');
  const validate = await tools[0]!.execute(
    'one',
    { inputPath: 'test/fixtures/minimal-policy.xml', inputType: 'asm-policy' },
    undefined,
    undefined,
    { cwd },
  );
  expect(validate.details.valid).toBe(true);
  const outputRoot = mkdtempSync(join(tmpdir(), 'asm-migration-extension-'));
  try {
    const converted = await tools[1]!.execute(
      'two',
      {
        policyPath: 'test/fixtures/minimal-policy.xml',
        signaturesPath: 'test/fixtures/signatures.json',
        namespace: 'example',
        outputDirectory: join(outputRoot, 'output'),
      },
      undefined,
      undefined,
      { cwd },
    );
    expect(converted.details.complete).toBe(true);
    expect(converted.details.outputFiles).toHaveLength(4);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('returns stable categories without stack traces or input contents', async () => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  await factory({
    typebox: { Type },
    setLabel() {},
    registerTool(tool: unknown) {
      tools.push(tool as (typeof tools)[number]);
    },
  });
  const result = await tools[0]!.execute(
    'one',
    { inputPath: 'missing-secret-value.xml', inputType: 'asm-policy' },
    undefined,
    undefined,
    { cwd: import.meta.dir },
  );
  expect(result.isError).toBe(true);
  expect(result.details.errorCategory).toBe('io');
  expect(result.content[0].text).not.toContain('missing-secret-value');
  expect(result.content[0].text).not.toContain('at ');
});

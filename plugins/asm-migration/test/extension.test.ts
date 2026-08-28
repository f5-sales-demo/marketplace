import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
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
  expect(validate.content[0].text).toContain('Enforcement mode: blocking');
  expect(validate.content[0].text).toContain('Unsupported enabled features: none');
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
    expect(converted.content[0].text).toContain('Conversion complete: true');
    expect(converted.content[0].text).toContain('app_firewall=1');
    expect(converted.content[0].text).toContain('f5-sales-demo/api-specs-enriched');
    for (const filename of ['config-pack.json', 'warnings.json', 'report.json', 'manifest.json'])
      expect(converted.content[0].text).toContain(filename);
    expect(converted.content[0].text).toContain('operator review before deployment');
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

test('reports every config-pack issue with contract paths', async () => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  await factory({
    typebox: { Type },
    setLabel() {},
    registerTool(tool: unknown) {
      tools.push(tool as (typeof tools)[number]);
    },
  });
  const root = mkdtempSync(join(tmpdir(), 'asm-migration-invalid-pack-'));
  try {
    const path = join(root, 'pack.json');
    await Bun.write(
      path,
      JSON.stringify({
        schema_version: 'wrong/v0',
        resources: [{ kind: 'unknown', metadata: { name: 'one', namespace: 'example' }, spec: {} }],
      }),
    );
    const result = await tools[0]!.execute(
      'three',
      { inputPath: path, inputType: 'config-pack' },
      undefined,
      undefined,
      { cwd: root },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('$.schema_version');
    expect(result.content[0].text).toContain('resource 0');
    expect(result.content[0].text).toContain('unsupported resource kind');
    expect(result.content[0].text).toContain('validated resource count');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('returns stable macOS guidance for symlinked output', async () => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  await factory({
    typebox: { Type },
    setLabel() {},
    registerTool(tool: unknown) {
      tools.push(tool as (typeof tools)[number]);
    },
  });
  const root = mkdtempSync(join(tmpdir(), 'asm-migration-symlink-'));
  const real = join(root, 'real');
  const link = join(root, 'link');
  mkdirSync(real);
  symlinkSync(real, link);
  try {
    const result = await tools[1]!.execute(
      'four',
      {
        policyPath: resolve(import.meta.dir, 'fixtures/minimal-policy.xml'),
        signaturesPath: resolve(import.meta.dir, 'fixtures/signatures.json'),
        namespace: 'example',
        outputDirectory: link,
      },
      undefined,
      undefined,
      { cwd: root },
    );
    expect(result.isError).toBe(true);
    expect(result.details.errorCategory).toBe('output');
    expect(result.content[0].text).toContain('/private/tmp');
    expect(result.content[0].text).toContain('/tmp');
    expect(result.content[0].text).not.toContain(' at ');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isolates ASM provider requests to native tools without session-global state', async () => {
  const handlers = new Map<string, (event: Record<string, unknown>) => unknown>();
  await factory({
    typebox: { Type },
    setLabel() {},
    registerTool() {},
    on(event, handler) {
      handlers.set(event, handler);
    },
  });
  const beforeAgentStart = handlers.get('before_agent_start');
  const agentEnd = handlers.get('agent_end');
  expect(beforeAgentStart).toBeDefined();
  expect(agentEnd).toBeDefined();
  const routed = (await beforeAgentStart!({
    prompt: 'Convert this ASM policy with asm-migration',
    systemPrompt: 'general assistant',
  })) as { systemPrompt?: string };
  expect(routed?.systemPrompt).toContain('dedicated ASM migration router');
  expect(routed?.systemPrompt).toContain('call no tool');
  expect(routed?.systemPrompt).toContain('Never call todo_write');
  const beforeProviderRequest = handlers.get('before_provider_request');
  expect(beforeProviderRequest).toBeDefined();
  expect(
    await beforeProviderRequest!({
      payload: {
        tools: [
          { type: 'function', function: { name: 'todo_write' } },
          { type: 'function', function: { name: 'read' } },
          { type: 'function', function: { name: 'asm_migration_validate' } },
          { type: 'function', function: { name: 'asm_migration_convert' } },
        ],
        tool_choice: { type: 'function', function: { name: 'read' } },
      },
    }),
  ).toEqual({
    tools: [
      { type: 'function', function: { name: 'asm_migration_validate' } },
      { type: 'function', function: { name: 'asm_migration_convert' } },
    ],
    tool_choice: 'auto',
  });
  await agentEnd!({});
  expect(
    await beforeProviderRequest!({
      payload: {
        messages: [{ role: 'developer', content: 'general assistant' }],
        tools: [{ type: 'function', function: { name: 'read' } }],
        tool_choice: { type: 'function', function: { name: 'read' } },
      },
    }),
  ).toBeUndefined();
  expect(
    await beforeAgentStart!({
      prompt: 'Explain a TypeScript type',
      systemPrompt: 'general assistant',
    }),
  ).toBeUndefined();
  expect(
    await beforeProviderRequest!({
      payload: {
        tools: [{ type: 'function', function: { name: 'read' } }],
        tool_choice: { type: 'function', function: { name: 'read' } },
      },
    }),
  ).toBeUndefined();
});

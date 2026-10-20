import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';

const options = { expanded: false, isPartial: false };
const view = (name: string, details: unknown, expanded = false, text = 'LITERAL_REVIEW_GUIDANCE', input = {}) =>
  presentTool({ name }, presentation).presentation.result(
    { details, content: [{ type: 'text', text }] },
    { ...options, expanded },
    input,
  );
const contract = {
  repository: 'synthetic/repo',
  commit: 'abc',
  source_spec_sha256: 'source',
  catalog_sha256: 'catalog',
  bundle_sha256: 'bundle',
};
const conversion = {
  complete: false,
  resourceCounts: { app_firewall: 0 },
  warnings: [{ code: 'PARTIAL', message: 'REMEDIATE', blocking: false, source_path: '' }],
  contract,
  outputFiles: ['config-pack.json'],
  outputDirectory: '',
};

test('native requests retain actual paths and effective flags without an invented CLI', () => {
  const input = {
    policyPath: 'policy.xml',
    signaturesPath: 'signatures.json',
    namespace: '',
    outputDirectory: 'out',
    allowPartial: false,
    overwrite: false,
  };
  const v = presentTool({ name: 'asm_migration_convert' }, presentation).presentation.call(input, options);
  expect(v.sections).toContainEqual(expect.objectContaining({ kind: 'fields', previewFields: 'all', values: input }));
  expect(v.sections.some((s) => s.kind === 'code')).toBe(false);
});
test('partial conversion shows completion, zero counts and literal review guidance by default', () => {
  const v = view('asm_migration_convert', conversion, false, 'PARTIAL REVIEW OUTPUT: remediate every warning.');
  expect(v.summary).toContain('Partial');
  expect(v.sections.find((s) => s.title === 'Conversion outcome')).toMatchObject({
    previewFields: 'all',
    values: { Complete: false, 'Output directory': '', 'Warning count': 1 },
  });
  expect(v.sections.find((s) => s.title === 'Resource counts')).toMatchObject({
    previewRows: 12,
    rows: [{ kind: 'app_firewall', count: 0 }],
  });
  expect(JSON.stringify(v)).toContain('PARTIAL REVIEW OUTPUT: remediate every warning.');
  expect(v.sections.find((s) => s.title === 'Warnings')).toMatchObject({ previewRows: 12 });
});
test('expanded safe evidence preserves complete data and guidance once', () => {
  const v = view('asm_migration_convert', conversion, true);
  expect(v.expandedEvidence).toBe('provided');
  expect(JSON.stringify(v).match(/LITERAL_REVIEW_GUIDANCE/g)).toHaveLength(1);
  expect(JSON.stringify(v).match(/REMEDIATE/g)).toHaveLength(1);
  expect(JSON.stringify(v).match(/config-pack.json/g)).toHaveLength(1);
});
test('validation summarizes policy identity and contract failures including issue index zero', () => {
  const p = view('asm_migration_validate', {
    valid: true,
    inputType: 'asm-policy',
    policy: { sourceName: '', enforcementMode: 'transparent', unsupportedEnabledFeatures: [] },
  });
  expect(p.sections.find((s) => s.title === 'Policy identity')).toMatchObject({
    previewFields: 'all',
    values: { Policy: '', 'Enforcement mode': 'transparent', 'Unsupported feature count': 0 },
  });
  const c = view('asm_migration_validate', {
    valid: false,
    inputType: 'config-pack',
    contract: {
      valid: false,
      contract,
      resource_count: 0,
      validated_resource_count: 0,
      issues: [{ resource_index: 0, path: '', message: 'FIX_CONTRACT' }],
    },
  });
  expect(c.summary).toContain('invalid');
  expect(c.sections.find((s) => s.title === 'Contract issues')).toMatchObject({
    previewRows: 12,
    rows: [{ resource_index: 0, path: '', message: 'FIX_CONTRACT' }],
  });
});
test('deployment shows actual action, outcome and rollback without losing empty guidance', () => {
  const d = {
    ok: true,
    action: 'verify',
    planDigest: '',
    outcomes: [{ kind: 'app_firewall', name: '', operation: 'noop', status: 'verified', guidance: '' }],
    rollback: { status: 'not_required', outcomes: [] },
  };
  const v = view('asm_migration_deploy', d);
  expect(v.sections.find((s) => s.title === 'Deployment outcome')).toMatchObject({
    previewFields: 'all',
    values: { Action: 'verify', 'Plan digest': '', 'Rollback status': 'not_required', 'Returned outcomes': 1 },
  });
  expect(v.sections.find((s) => s.title === 'Resource outcomes')).toMatchObject({ previewRows: 12, rows: d.outcomes });
});
test('empty, malformed and opaque results retain runtime fallback and full corrective text', () => {
  for (const d of [
    {},
    null,
    { ...conversion, warnings: [null] },
    { ...conversion, resourceCounts: { app_firewall: 'zero' } },
  ]) {
    const v = view('asm_migration_convert', d);
    expect(v.expandedEvidence).not.toBe('provided');
    expect(JSON.stringify(v)).toContain('LITERAL_REVIEW_GUIDANCE');
  }
  const t = presentTool({ name: 'asm_migration_validate' }, presentation);
  const v = t.presentation.result(
    { isError: true, content: [{ type: 'text', text: 'Use /private/tmp; symlink.' }], details: { ok: false } },
    options,
    {},
  );
  expect(JSON.stringify(v)).toContain('Use /private/tmp; symlink.');
  expect(v.expandedEvidence).not.toBe('provided');
  expect(
    t.presentation.result({ content: [{ type: 'image' }], details: conversion }, options, {}).expandedEvidence,
  ).not.toBe('provided');
});

test('known native failures provide complete corrective evidence once', () => {
  const t = presentTool({ name: 'asm_migration_convert' }, presentation);
  const result = {
    isError: true,
    content: [{ type: 'text', text: 'Use /private/tmp or another normal directory instead of /tmp.' }],
    details: { tool: 'asm_migration_convert', ok: false, errorCategory: 'output' },
  };
  for (const expanded of [false, true]) {
    const v = t.presentation.result(result, { ...options, expanded }, { outputDirectory: '/tmp' });
    expect(v.expandedEvidence).toBe('provided');
    expect(JSON.stringify(v).match(/Use \/private\/tmp/g)).toHaveLength(1);
    expect(JSON.stringify(v)).toContain('output');
  }
  for (const details of [
    { ...result.details, tool: 'another_tool' },
    { ...result.details, errorCategory: null },
    { ...result.details, errorCategory: 'unsupported-category' },
  ]) {
    expect(t.presentation.result({ ...result, details }, options, {}).expandedEvidence).not.toBe('provided');
  }
});

test('long lists retain all expanded evidence and only declare twelve-row previews', () => {
  const long = {
    ...conversion,
    warnings: Array.from({ length: 19 }, (_, i) => ({
      code: `WARNING_${i}`,
      message: `REMEDIATE_${i}`,
      blocking: false,
    })),
    outputFiles: Array.from({ length: 19 }, (_, i) => `review-file-${i}.json`),
  };
  const collapsed = view('asm_migration_convert', long);
  expect(collapsed.sections.find((s) => s.title === 'Warnings')).toMatchObject({
    previewRows: 12,
    rows: long.warnings,
  });
  const expanded = view('asm_migration_convert', long, true);
  expect(JSON.stringify(expanded).match(/REMEDIATE_18/g)).toHaveLength(1);
  expect(JSON.stringify(expanded).match(/review-file-18.json/g)).toHaveLength(1);
  const empty = view('asm_migration_convert', {
    ...conversion,
    complete: true,
    resourceCounts: {},
    warnings: [],
    outputFiles: [],
  });
  expect(empty.summary).toContain('complete');
  expect(empty.sections.find((s) => s.title === 'Conversion outcome')).toMatchObject({
    values: { 'Warning count': 0, 'Output file count': 0 },
  });
});

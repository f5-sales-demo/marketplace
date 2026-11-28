import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';

type TestView = ReturnType<ReturnType<typeof presentTool>['presentation']['result']>;
const sections = (view: TestView) => {
  if (!view.sections) throw new Error('Expected presentation sections');
  return view.sections;
};

const options = { expanded: false, isPartial: false };
const result = (details: unknown, text = 'SYNTHETIC_DUPLICATE') => ({ content: [{ type: 'text', text }], details });
const args = { action: 'read', namespace: 'example-namespace', siteName: 'synthetic-site' };
const config = {
  provider: 'aws',
  haMode: 'one-node',
  vrfs: Array.from({ length: 13 }, (_, index) => ({ index, name: `synthetic-vrf-${index}` })),
  interfaces: [{ index: 0, role: 'slo', vrf: 'default', addressing: { mode: 'dhcp', addresses: [] } }],
  bgpPeers: [],
  providerNetwork: { profile: 'direct-eni', metadata: { count: 0, enabled: false, empty: '' } },
};
test('site previews retain twelve VRFs, exact identity, network columns and one expanded evidence copy', () => {
  const tool = presentTool({ name: 'f5xc_ce_v2_site' }, presentation);
  const details = {
    site: { metadata: { name: 'synthetic-site', namespace: 'example-namespace' }, spec: config, etag: '0' },
  };
  const view = tool.presentation.result(result(details), options, args);
  expect(sections(view).find((s) => s.title === 'VRFs')).toMatchObject({ previewRows: 12, rows: config.vrfs });
  expect(sections(view).find((s) => s.title === 'Site identity')).toMatchObject({
    previewFields: 'all',
    values: {
      Site: 'synthetic-site',
      Namespace: 'example-namespace',
      ETag: '0',
      Provider: 'aws',
      'HA mode': 'one-node',
    },
  });
  const interfaces = sections(view).find((s) => s.title === 'Interfaces');
  if (interfaces?.kind !== 'table') throw new Error('Expected interface table');
  expect(interfaces.columns).toContainEqual({
    key: 'addressingMode',
    label: 'Addressing mode',
  });
  const expanded = tool.presentation.result(result(details), { ...options, expanded: true }, args);
  expect(expanded.expandedEvidence).toBe('provided');
  expect(JSON.stringify(expanded).match(/synthetic-vrf-12/g)).toHaveLength(1);
  expect(JSON.stringify(expanded)).not.toContain('SYNTHETIC_DUPLICATE');
});
test('plans show full hash, artifact and no mutation; bootstrap includes node and seconds without duplicates', () => {
  const plan = {
    schemaVersion: 2,
    action: 'create',
    namespace: 'example-namespace',
    siteName: 'synthetic-site',
    config,
    expectedEtag: null,
    planId: 'synthetic-plan',
    planSha256: 'a'.repeat(64),
  };
  const view = presentTool({ name: 'f5xc_ce_v2_site' }, presentation).presentation.result(
    result({ plan, artifactId: 'synthetic-artifact' }),
    options,
    { ...args, action: 'create' },
  );
  expect(sections(view).find((s) => s.title === 'Site plan')).toMatchObject({
    previewFields: 'all',
    values: {
      'Plan SHA-256': plan.planSha256,
      Artifact: 'artifact://synthetic-artifact',
      Mutation: 'not attempted',
      'Expected ETag': null,
    },
  });
  const bootArgs = {
    namespace: 'example-namespace',
    siteName: 'synthetic-site',
    nodeName: 'synthetic-node',
    expiresInSeconds: 60,
  };
  const reference = 'f5xc-ce://synthetic-session/opaque-reference';
  const bootstrap = presentTool({ name: 'f5xc_ce_v2_bootstrap' }, presentation).presentation.result(
    result({ reference, expiresAt: '2026-10-20T12:00:00.000Z' }),
    options,
    bootArgs,
  );
  expect(JSON.stringify(bootstrap).match(/opaque-reference/g)).toHaveLength(1);
  expect(sections(bootstrap).find((s) => s.title === 'Scope')).toMatchObject({
    values: { Node: 'synthetic-node', 'Requested lifetime (seconds)': 60 },
  });
});
test('unavailable telemetry and failures retain scope, categories and literal guidance without executable claims', () => {
  const tool = presentTool({ name: 'f5xc_ce_v2_status' }, presentation);
  const view = tool.presentation.result(
    result(
      { capability: 'unavailable', reason: 'runtime_status' },
      'Wait until the separate F5 telemetry contract is published. END_GUIDANCE',
    ),
    options,
    args,
  );
  expect(JSON.stringify(view)).toContain('END_GUIDANCE');
  expect(sections(view).find((s) => s.title === 'Telemetry availability')).toMatchObject({
    previewFields: 'all',
    values: { Availability: 'unavailable', Reason: 'runtime_status', Health: 'unknown' },
  });
  expect(sections(tool.presentation.call(args, options)).some((s) => s.kind === 'code' && 'argv' in s)).toBe(false);
  const failed = presentTool({ name: 'f5xc_ce_v2_capabilities' }, presentation).presentation.result(
    { ...result({ failure: { category: 'tenant_http' } }, 'Full corrective guidance END_ERROR'), isError: true },
    options,
    {},
  );
  expect(JSON.stringify(failed)).toContain('tenant_http');
  expect(JSON.stringify(failed)).toContain('END_ERROR');
});
test('malformed results keep fallback while safe evidence retains zero, false and empty strings', () => {
  const tool = presentTool({ name: 'f5xc_ce_v2_site' }, presentation);
  for (const site of [null, [], 'opaque', { spec: { vrfs: [null] } }]) {
    const view = tool.presentation.result(result({ site }, 'Literal opaque correction END_OPAQUE'), options, args);
    expect(view.expandedEvidence).not.toBe('provided');
    expect(JSON.stringify(view)).toContain('END_OPAQUE');
  }
  const view = tool.presentation.result(result({ site: { metadata: {}, spec: config } }), options, args);
  expect(sections(view).find((s) => s.title === 'Provider network metadata')).toMatchObject({
    values: { count: 0, enabled: false, empty: '' },
  });
});

test('capabilities have bounded summaries and retain complete publication and ownership evidence once', () => {
  const capabilities = {
    smsv2ContractVersion: 'v2',
    supportedProviders: ['aws', 'azure'],
    bootstrapDrivers: ['console'],
    providerNetworkingProfiles: { aws: ['direct-eni'], azure: ['direct-nic'] },
    awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
    kvmImageResolution: {
      id: 'synthetic-resolution',
      endpoint: '/api/synthetic',
      operation: 'GetImage',
      ownerJoin: { ownerKind: 'synthetic-owner' },
      validation: ['ownership_recheck'],
      publication: { sha256: 'synthetic-publication-digest' },
    },
  };
  const tool = presentTool({ name: 'f5xc_ce_v2_capabilities' }, presentation);
  const collapsed = tool.presentation.result(result({ capabilities }), options, {});
  expect(sections(collapsed).find((s) => s.title === 'Capability summary')).toMatchObject({
    previewFields: 'all',
    values: { 'AWS TGW Connect supported': false, 'AWS TGW Connect schema': null },
  });
  expect(sections(collapsed).find((s) => s.title === 'Networking profiles')).toMatchObject({ previewRows: 12 });
  const expanded = tool.presentation.result(result({ capabilities }), { ...options, expanded: true }, {});
  for (const literal of ['synthetic-publication-digest', 'synthetic-owner', 'ownership_recheck']) {
    expect(JSON.stringify(expanded).match(new RegExp(literal, 'g'))).toHaveLength(1);
  }
  expect(JSON.stringify(expanded)).not.toContain('SYNTHETIC_DUPLICATE');
  const partial = tool.presentation.result(result({ capabilities }), { ...options, isPartial: true }, {});
  expect((partial.warnings ?? []).some((warning) => /streaming|partial/i.test(warning))).toBe(true);
  const malformed = tool.presentation.result(
    result({ capabilities: { ...capabilities, supportedProviders: null } }, 'END_INVALID'),
    options,
    {},
  );
  expect(malformed.expandedEvidence).not.toBe('provided');
  expect(JSON.stringify(malformed)).toContain('END_INVALID');
});

test('delete plans without saved artifacts preserve null config and applied results identify their plan', () => {
  const tool = presentTool({ name: 'f5xc_ce_v2_site' }, presentation);
  const plan = {
    schemaVersion: 2,
    action: 'delete',
    namespace: 'example-namespace',
    siteName: 'synthetic-site',
    config: null,
    expectedEtag: '',
    planId: 'synthetic-delete',
    planSha256: 'b'.repeat(64),
  };
  const view = tool.presentation.result(result({ plan, artifactId: null }), options, { ...args, action: 'delete' });
  expect(sections(view).find((s) => s.title === 'Site plan')).toMatchObject({
    values: {
      Artifact: 'session memory only',
      Mutation: 'not attempted',
      'Expected ETag': '',
    },
  });
  const applied = tool.presentation.result(
    result({ planId: 'synthetic-applied', site: { metadata: {}, spec: config } }),
    options,
    args,
  );
  expect(sections(applied).find((s) => s.title === 'Site identity')).toMatchObject({
    values: {
      ETag: 'unknown',
      'Applied plan ID': 'synthetic-applied',
    },
  });
  expect(JSON.stringify(applied)).not.toContain('not attempted');
});

test('expanded plans retain executable artifact references once', () => {
  const plan = {
    schemaVersion: 2,
    action: 'delete',
    config: null,
    planId: 'synthetic-plan',
    planSha256: 'c'.repeat(64),
  };
  const view = presentTool({ name: 'f5xc_ce_v2_site' }, presentation).presentation.result(
    result({ plan, artifactId: 'synthetic-artifact' }),
    { ...options, expanded: true },
    args,
  );
  expect(JSON.stringify(view).match(/artifact:\/\/synthetic-artifact/g)).toHaveLength(1);
});

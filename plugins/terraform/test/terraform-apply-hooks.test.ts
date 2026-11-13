import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../src/runner';
import { TerraformApplyHookParser } from '../src/terraform-apply-hooks';

const plan: PlanReceipt = {
  schemaVersion: 1,
  deploymentId: 'example-site',
  engine: 'terraform',
  backendIdentity: 'local',
  configurationSha256: 'a'.repeat(64),
  providerLockSha256: 'b'.repeat(64),
  planSha256: 'c'.repeat(64),
  changes: [{ address: 'google_compute_instance.node', type: 'google_compute_instance', actions: ['create'] }],
  noChanges: false,
};
const resource = {
  addr: 'google_compute_instance.node',
  module: '',
  resource: 'google_compute_instance.node',
  implied_provider: 'google',
  resource_type: 'google_compute_instance',
  resource_name: 'node',
  resource_key: null,
};
const line = (type: string, fields = {}) =>
  `${JSON.stringify({
    '@level': 'info',
    '@message': 'synthetic fixture',
    '@module': 'terraform.ui',
    '@timestamp': '2026-11-09T00:00:00.000000Z',
    type,
    ...fields,
  })}\n`;
const version = line('version', { terraform: '1.16.6', ui: '1.3' });
const event = (type: string, hook = {}) => line(type, { hook: { resource, action: 'create', ...hook } });
const bytes = (s: string) => Buffer.from(s);
const start = event('apply_start');
const complete = event('apply_complete', { elapsed_seconds: 1, id_key: 'id', id_value: 'example-id' });

test('split UTF-8 and partial JSON hooks stay candidates, retain exact line hashes and finish once', () => {
  const parser = new TerraformApplyHookParser(plan);
  const raw = bytes(version + line('log', { '@message': 'node café' }) + start + complete);
  const candidates = [];
  for (const byte of raw) candidates.push(...parser.push(Uint8Array.of(byte)));
  expect(candidates).toHaveLength(2);
  expect(candidates[0].address).toBe(resource.addr);
  expect(candidates[1].idValue).toBe('example-id');
  expect(candidates[1].rawLineSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(candidates[1].rawLineSha256).toBe(createHash('sha256').update(complete).digest('hex'));
  expect(candidates.every((c) => c.applyRpcQualified === false && c.originalInsertQualified === false)).toBe(true);
  expect(parser.finish()).toEqual({
    streamComplete: true,
    applySuccessful: true,
    expectedActions: 1,
    completedActions: 1,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
  expect(() => parser.finish()).toThrow('closed');
  expect(() => parser.push(bytes(start))).toThrow('closed');
});

test('serialized original hooks refuse concurrent starts, replay and foreign resources permanently', () => {
  for (const invalid of [
    start,
    event('apply_start', { resource: { ...resource, addr: 'google_compute_instance.foreign' } }),
    event('apply_progress', { action: 'delete', elapsed_seconds: 1 }),
  ]) {
    const parser = new TerraformApplyHookParser(plan);
    parser.push(bytes(version + start));
    expect(() => parser.push(bytes(invalid))).toThrow();
    expect(() => parser.push(bytes(complete))).toThrow('failed');
  }
  const parser = new TerraformApplyHookParser(plan);
  parser.push(bytes(version + start + complete));
  expect(() => parser.push(bytes(start))).toThrow();
});

test('unsupported versions, non-UI producers, malformed JSON, invalid UTF-8 and oversized lines refuse', () => {
  for (const raw of [
    bytes(start),
    bytes(version.replace('1.16.6', '1.16.5')),
    bytes(version.replace('1.3', '1.2')),
    bytes(version.replace('terraform.ui', 'provider.google')),
    bytes('{bad}\n'),
    Uint8Array.of(0xff, 10),
    bytes('x'.repeat(1024 * 1024 + 1)),
  ]) {
    const parser = new TerraformApplyHookParser(plan);
    expect(() => parser.push(raw)).toThrow();
    expect(() => parser.finish()).toThrow('failed');
  }
});

test('truncated streams and unfinished or missing reviewed actions never become complete', () => {
  for (const raw of [version, version + start, version + start + complete.slice(0, -1)]) {
    const parser = new TerraformApplyHookParser(plan);
    parser.push(bytes(raw));
    expect(() => parser.finish()).toThrow();
    expect(() => parser.push(bytes(complete))).toThrow('failed');
  }
});

test('resource identity and elapsed time cannot change during an action', () => {
  for (const hook of [
    { resource: { ...resource, resource_name: 'other' }, elapsed_seconds: 2 },
    { resource: { ...resource, resource_key: 1 }, elapsed_seconds: 2 },
    { elapsed_seconds: -1 },
    { elapsed_seconds: '2' },
    { elapsed_seconds: 0.5 },
    { elapsed_seconds: null },
  ]) {
    const parser = new TerraformApplyHookParser(plan);
    parser.push(bytes(version + start + event('apply_progress', { elapsed_seconds: 1 })));
    expect(() => parser.push(bytes(event('apply_complete', hook)))).toThrow();
  }
  const parser = new TerraformApplyHookParser(plan);
  parser.push(bytes(version + start));
  expect(() =>
    parser.push(bytes(event('apply_complete', { elapsed_seconds: 1, id_key: 'id', id_value: 123 }))),
  ).toThrow();
});

test('replacement phases follow reviewed ordering and errored hooks retain failure', () => {
  const replacement = { ...plan, changes: [{ ...plan.changes[0], actions: ['delete', 'create'] }] };
  const parser = new TerraformApplyHookParser(replacement);
  parser.push(
    bytes(
      version +
        event('apply_start', { action: 'delete' }) +
        event('apply_complete', { action: 'delete', elapsed_seconds: 0 }) +
        start +
        event('apply_errored', { elapsed_seconds: 0 }),
    ),
  );
  expect(parser.finish().applySuccessful).toBe(false);
  const wrong = new TerraformApplyHookParser(replacement);
  expect(() => wrong.push(bytes(version + start))).toThrow();
});

test('no-change plans ignore refresh hooks but never admit an unreviewed apply action or second version', () => {
  const empty = { ...plan, changes: [], noChanges: true };
  const parser = new TerraformApplyHookParser(empty);
  parser.push(
    bytes(version + line('refresh_start', { hook: { resource } }) + line('refresh_complete', { hook: { resource } })),
  );
  expect(parser.finish().expectedActions).toBe(0);
  const unexpected = new TerraformApplyHookParser(empty);
  expect(() => unexpected.push(bytes(version + start))).toThrow();
  const replay = new TerraformApplyHookParser(empty);
  expect(() => replay.push(bytes(version + version))).toThrow();
});

test('review snapshots and emitted candidates cannot be rewritten by callers', () => {
  const changed = structuredClone(plan);
  const parser = new TerraformApplyHookParser(changed);
  changed.changes[0].actions[0] = 'delete';
  const [candidate] = parser.push(bytes(version + start));
  expect(Object.isFrozen(candidate)).toBe(true);
  parser.push(bytes(complete));
  expect(parser.finish().applySuccessful).toBe(true);
});

test('unsupported operation hooks and error diagnostics refuse success', () => {
  for (const type of ['action_start', 'provision_start', 'ephemeral_op_start', 'apply_future']) {
    const parser = new TerraformApplyHookParser(plan);
    expect(() => parser.push(bytes(version + line(type)))).toThrow();
  }
  const parser = new TerraformApplyHookParser(plan);
  parser.push(
    bytes(
      version +
        start +
        complete +
        line('diagnostic', { '@level': 'error', diagnostic: { severity: 'error', summary: 'synthetic error' } }),
    ),
  );
  expect(parser.finish().applySuccessful).toBe(false);
});

test('duplicate JSON identities and duplicate reviewed no-op addresses are ambiguous', () => {
  const parser = new TerraformApplyHookParser(plan);
  expect(() => parser.push(bytes(version.replace('"type":"version"', '"type":"foreign","type":"version"')))).toThrow();
  const duplicate = { ...plan, changes: [{ ...plan.changes[0], actions: ['no-op'] }, plan.changes[0]] };
  expect(() => new TerraformApplyHookParser(duplicate)).toThrow();
});

test('error-level log messages prevent success even without a diagnostic', () => {
  const parser = new TerraformApplyHookParser(plan);
  parser.push(bytes(version + start + complete + line('log', { '@level': 'error' })));
  expect(parser.finish().applySuccessful).toBe(false);
});

test('line and aggregate bounds accept the boundary and refuse excess without renewing the stream', () => {
  const empty = { ...plan, changes: [], noChanges: true };
  const overhead = bytes(line('log', { '@message': '' })).length - 1;
  const maximum = bytes(line('log', { '@message': 'x'.repeat(1024 * 1024 - overhead) }));
  const parser = new TerraformApplyHookParser(empty);
  parser.push(bytes(version));
  parser.push(maximum);
  expect(parser.finish().streamComplete).toBe(true);
  const aggregate = new TerraformApplyHookParser(empty);
  aggregate.push(bytes(version));
  for (let i = 0; i < 63; i++) aggregate.push(maximum);
  expect(() => aggregate.push(maximum)).toThrow('stream size');
  expect(() => aggregate.push(bytes(version))).toThrow('failed');
});

test('escaped nested duplicate keys refuse and reviewed keyed module resources retain exact identities', () => {
  const duplicate =
    version +
    start.replace(
      '"addr":"google_compute_instance.node"',
      '"a\\u0064dr":"foreign","addr":"google_compute_instance.node"',
    );
  expect(() => new TerraformApplyHookParser(plan).push(bytes(duplicate))).toThrow();
  const keyedResource = {
    ...resource,
    module: 'module.example[0]',
    resource_key: 'node-é',
    resource: 'google_compute_instance.node["node-é"]',
    addr: 'module.example[0].google_compute_instance.node["node-é"]',
  };
  const keyedPlan = { ...plan, changes: [{ ...plan.changes[0], address: keyedResource.addr }] };
  const parser = new TerraformApplyHookParser(keyedPlan);
  parser.push(
    bytes(
      version +
        event('apply_start', { resource: keyedResource }) +
        event('apply_complete', {
          resource: keyedResource,
          elapsed_seconds: 0,
          id_key: 'id',
          id_value: '18446744073709551614',
        }),
    ),
  );
  expect(parser.finish().applySuccessful).toBe(true);
  const deep = { ...plan, changes: [], noChanges: true };
  let nested: unknown = 'leaf';
  for (let i = 0; i < 65; i++) nested = [nested];
  expect(() => new TerraformApplyHookParser(deep).push(bytes(version + line('log', { state: nested })))).toThrow();
});

test('reviewed deferred data-source hooks preserve data mode and cannot impersonate a managed resource', () => {
  const dataResource = {
    ...resource,
    addr: 'data.google_compute_instance.node',
    resource: 'data.google_compute_instance.node',
  };
  const dataPlan = { ...plan, changes: [{ ...plan.changes[0], address: dataResource.addr, actions: ['read'] }] };
  const parser = new TerraformApplyHookParser(dataPlan);
  const candidates = parser.push(
    bytes(
      version +
        event('apply_start', { resource: dataResource, action: 'read' }) +
        event('apply_complete', { resource: dataResource, action: 'read', elapsed_seconds: 0 }),
    ),
  );
  expect(candidates.map((c) => c.address)).toEqual([dataResource.addr, dataResource.addr]);
  expect(parser.finish().applySuccessful).toBe(true);
  expect(candidates.every((c) => c.applyRpcQualified === false && c.originalInsertQualified === false)).toBe(true);
  const managed = new TerraformApplyHookParser(plan);
  expect(() => managed.push(bytes(version + event('apply_start', { resource: dataResource })))).toThrow();
});

test('latest Terraform UI profile binds the reviewed lock and rejects legacy or mixed version headers', () => {
  const binding = {
    terraformVersion: '1.17.1',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
  };
  const latestPlan = { ...plan, providerLockSha256: binding.providerLockSha256 };
  const parser = new TerraformApplyHookParser(latestPlan, binding);
  expect(parser.push(bytes(version.replace('1.16.6', '1.17.1') + start + complete))).toHaveLength(2);
  expect(parser.finish().applySuccessful).toBe(true);
  expect(() => new TerraformApplyHookParser(latestPlan, binding).push(bytes(version))).toThrow();
  expect(() => new TerraformApplyHookParser(plan, binding)).toThrow();
  expect(() => new TerraformApplyHookParser(latestPlan, { ...binding, terraformVersion: '1.18.0' })).toThrow();
});

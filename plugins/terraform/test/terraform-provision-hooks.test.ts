import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../src/runner';
import { TerraformApplyHookParser } from '../src/terraform-apply-hooks';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const configuration = JSON.stringify({
  resource: {
    terraform_data: {
      wait: {
        provisioner: [
          { 'local-exec': { command: 'example command' } },
          { 'remote-exec': { inline: ['example'], when: 'destroy' } },
        ],
      },
    },
  },
});
const plan: PlanReceipt = {
  schemaVersion: 1,
  deploymentId: 'example',
  engine: 'terraform',
  backendIdentity: 'local',
  configurationSha256: hash(configuration),
  providerLockSha256: 'b'.repeat(64),
  planSha256: 'c'.repeat(64),
  noChanges: false,
  changes: [{ address: 'terraform_data.wait', type: 'terraform_data', actions: ['create'] }],
};
const resource = {
  addr: 'terraform_data.wait',
  module: '',
  resource: 'terraform_data.wait',
  implied_provider: 'terraform',
  resource_type: 'terraform_data',
  resource_name: 'wait',
  resource_key: null,
};
const row = (type: string, fields = {}) =>
  `${JSON.stringify({ '@level': 'info', '@message': 'fixture', '@module': 'terraform.ui', '@timestamp': '2026-11-10T00:00:00Z', type, ...fields })}\n`;
const version = row('version', { terraform: '1.16.6', ui: '1.3' });
const apply = (type: string, action = 'create') =>
  row(type, { hook: { resource, action, ...(type === 'apply_start' ? {} : { elapsed_seconds: 55 }) } });
const provision = (type: string, extra = {}, name = 'local-exec') =>
  row(type, { hook: { resource, provisioner: name, ...extra } });
const begin = version + apply('apply_start');
const provisioned =
  provision('provision_start') +
  provision('provision_progress', { output: 'private output\n$(not executed)' }) +
  apply('apply_progress') +
  provision('provision_complete');
const parse = (raw: string, reviewed = plan, config = configuration) => {
  const parser = new TerraformApplyHookParser(reviewed, undefined, config);
  const candidates = parser.push(Buffer.from(raw));
  return { candidates, result: parser.finish() };
};

test('reviewed provisioner phases remain hash-only candidates inside the original action', () => {
  const { candidates, result } = parse(begin + provisioned + apply('apply_complete'));
  expect(result.applySuccessful).toBe(true);
  expect(candidates.map((c) => c.phase)).toEqual([
    'apply_start',
    'provision_start',
    'provision_progress',
    'apply_progress',
    'provision_complete',
    'apply_complete',
  ]);
  const output = candidates.find((c) => c.phase === 'provision_progress');
  expect(output?.outputSha256).toBe(hash('private output\n$(not executed)'));
  expect(output?.provisionerIndex).toBe(0);
  expect(output?.action).toBe('create');
  expect(output?.elapsedSeconds).toBeNull();
  expect(JSON.stringify(candidates)).not.toContain('private output');
  expect(candidates.every((c) => Object.isFrozen(c) && !c.applyRpcQualified && !c.originalInsertQualified)).toBe(true);
});

test('missing or altered original configuration never admits provisioner events', () => {
  expect(() => new TerraformApplyHookParser(plan).push(Buffer.from(begin + provisioned))).toThrow();
  expect(() => new TerraformApplyHookParser(plan, undefined, `${configuration} `)).toThrow();
  const wrong = JSON.stringify({ resource: { terraform_data: { other: {} } } });
  expect(() =>
    parse(begin + provisioned + apply('apply_complete'), { ...plan, configurationSha256: hash(wrong) }, wrong),
  ).toThrow();
});

test('foreign, overlapping, replayed and unpaired provisioner phases poison capture', () => {
  for (const invalid of [
    provision('provision_progress', { output: 'x' }),
    provision('provision_complete'),
    provision('provision_start', {}, 'remote-exec'),
    provision('provision_start') + provision('provision_start'),
    provisioned + provision('provision_start'),
    provision('provision_start') +
      provision('provision_progress', { resource: { ...resource, addr: 'terraform_data.other' }, output: 'x' }),
    provision('provision_start') + provision('provision_complete', {}, 'remote-exec'),
    provision('provision_start') + provision('provision_unknown'),
  ]) {
    const parser = new TerraformApplyHookParser(plan, undefined, configuration);
    expect(() => parser.push(Buffer.from(begin + invalid))).toThrow();
    expect(() => parser.finish()).toThrow('failed');
  }
});

test('truncated or missing declared provisioners cannot complete a successful action', () => {
  for (const raw of [
    begin + provision('provision_start'),
    begin + provision('provision_start') + apply('apply_complete'),
    begin + apply('apply_complete'),
  ])
    expect(() => parse(raw)).toThrow();
});

test('provisioner failures remain failures even when Terraform subsequently completes', () => {
  const raw = begin + provision('provision_start') + provision('provision_errored') + apply('apply_complete');
  expect(parse(raw).result.applySuccessful).toBe(false);
  expect(parse(begin + apply('apply_errored')).result.applySuccessful).toBe(false);
});

test('create and destroy provisioners follow independent reviewed replacement phases', () => {
  const replacement = { ...plan, changes: [{ ...plan.changes[0], actions: ['delete', 'create'] }] };
  const raw =
    version +
    apply('apply_start', 'delete') +
    provision('provision_start', {}, 'remote-exec') +
    provision('provision_complete', {}, 'remote-exec') +
    apply('apply_complete', 'delete') +
    apply('apply_start') +
    provisioned +
    apply('apply_complete');
  const { candidates, result } = parse(raw, replacement);
  expect(result.completedActions).toBe(2);
  expect(
    candidates.filter((c) => c.phase === 'provision_start').map((c) => [c.action, c.actionIndex, c.provisioner]),
  ).toEqual([
    ['delete', 0, 'remote-exec'],
    ['create', 1, 'local-exec'],
  ]);
});

test('provisioner output is opaque bounded text and cannot inject hook identity fields', () => {
  for (const extra of [
    { output: 1 },
    { output: 'x', action: 'delete' },
    { output: 'x', elapsed_seconds: 0 },
    { output: 'x', unknown: true },
  ])
    expect(() => parse(begin + provision('provision_start') + provision('provision_progress', extra))).toThrow();
  expect(() => parse(begin + provision('provision_start', { output: 'x' }))).toThrow();
});

test('configuration declaration order is enforced including multiple provisioners', () => {
  const config = JSON.stringify({
    resource: { terraform_data: { wait: { provisioner: [{ 'local-exec': {} }, { 'remote-exec': {} }] } } },
  });
  const reviewed = { ...plan, configurationSha256: hash(config) };
  expect(() => parse(begin + provisioned + apply('apply_complete'), reviewed, config)).toThrow();
  const raw =
    begin +
    provisioned +
    provision('provision_start', {}, 'remote-exec') +
    provision('provision_complete', {}, 'remote-exec') +
    apply('apply_complete');
  expect(parse(raw, reviewed, config).result.applySuccessful).toBe(true);
});

test('ambiguous, duplicate or unsupported configuration declarations refuse', () => {
  for (const config of [
    '{"resource":{"terraform_data":{"wait":{"provisioner":{"local-exec":{}}}}}}',
    '{"resource":{"terraform_data":{"wait":{"provisioner":[{"local-exec":{},"remote-exec":{}}]}}}}',
    configuration.replace('"when":"destroy"', '"when":"update"'),
    configuration.replace('"command":', '"command":"duplicate","command":'),
  ])
    expect(() =>
      parse(begin + provisioned + apply('apply_complete'), { ...plan, configurationSha256: hash(config) }, config),
    ).toThrow();
});

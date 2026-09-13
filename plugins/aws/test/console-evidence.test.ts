import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { AwsCeToolContext } from '../src/ce/artifacts';
import { summarizeAwsConsoleOutput } from '../src/ce/console-evidence';
import { createAwsCloudInitAnalyzeTool } from '../src/tools/aws-cloud-init-analyze';

const instanceId = 'i-0123456789abcdef0';
const observedAt = '2026-09-08T16:00:00Z';
const response = (Output: string) => ({
  exitCode: 0,
  stderr: '',
  stdout: JSON.stringify({ InstanceId: instanceId, Timestamp: '2026-09-08T15:59:00Z', Output }),
});
test('cloud-config schema warnings do not imply a failed bootstrap or final-stage completion', () => {
  const raw =
    "Cloud-init v. 24.4 running 'modules:config'\n2026-09-08 15:59:00 - schema.py[WARNING]: cloud-config failed schema validation!\nprivate-bootstrap-secret";
  const evidence = summarizeAwsConsoleOutput(response(raw), instanceId, observedAt);
  expect(evidence).toMatchObject({ ok: true, errorsDetected: false, warningsDetected: true, cloudInitFinished: false });
  expect(JSON.stringify(evidence)).not.toContain('private-bootstrap-secret');
});
test('recognizes actual module failures even when cloud-init reports them at warning severity', () => {
  for (const raw of [
    'cc_scripts_user.py[WARNING]: Failed to run module scripts-user (scripts in /var/lib/cloud/instance/scripts)',
    'util.py[ERROR]: cloud-init failed to run user script',
    'Failed to start cloud-init-local.service',
  ])
    expect(summarizeAwsConsoleOutput(response(raw), instanceId, observedAt).errorsDetected).toBe(true);
});
test('reads the CLI decoded Output and keeps final completion separate from detected errors', () => {
  expect(
    summarizeAwsConsoleOutput(
      response('Cloud-init v. 24.4 finished at Tue, 08 Sep 2026 15:59:00 +0000. Datasource DataSourceEc2.'),
      instanceId,
      observedAt,
    ),
  ).toMatchObject({ cloudInitFinished: true, errorsDetected: false, ageSeconds: 60 });
});
test('malformed, foreign and unavailable console observations remain unknown', () => {
  const valid = response('Cloud-init finished at yesterday');
  for (const result of [
    { ...valid, exitCode: 1 },
    { ...valid, stdout: 'not-json' },
    { ...valid, stdout: JSON.stringify({ InstanceId: 'i-foreign', Timestamp: observedAt, Output: 'error' }) },
    { ...valid, stdout: JSON.stringify({ InstanceId: instanceId, Timestamp: 'invalid', Output: 'error' }) },
    {
      ...valid,
      stdout: JSON.stringify({ InstanceId: instanceId, Timestamp: '2026-09-09T00:00:00Z', Output: 'error' }),
    },
    response(''),
  ])
    expect(summarizeAwsConsoleOutput(result, instanceId, observedAt)).toMatchObject({
      ok: false,
      errorsDetected: null,
      cloudInitFinished: null,
    });
});

test('the cloud-init tool reports redacted warning evidence from the parsed console payload', async () => {
  const raw = response(
    'Cloud-init running config\nschema.py[WARNING]: cloud-config failed schema validation!\nprivate-bootstrap-secret',
  );
  const tool = createAwsCloudInitAnalyzeTool({ typebox: { Type } }, () => ({ exec: async () => raw }));
  const result = await tool.execute('test', { instanceId, region: 'us-east-2' }, undefined, undefined, {
    cwd: '/tmp',
  } as AwsCeToolContext);
  expect(result.details).toMatchObject({
    bootEvidence: { ok: true, warningsDetected: true, errorsDetected: false, cloudInitFinished: false },
  });
  expect(JSON.stringify(result)).not.toContain('private-bootstrap-secret');
});

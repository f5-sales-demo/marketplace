import { expect, test } from 'bun:test';
import type { AwsExecApi } from '../../src/aws/exec';
import { collectAwsPassiveEvidence } from '../../src/ce/passive-evidence';

const scope = {
  accountId: '123456789012',
  awsProfile: 'lab',
  region: 'us-east-1',
  instanceIds: ['i-11111111'],
  interfaceIds: [],
  vpcIds: [],
};
test('partial or malformed observability is unknown and raw CloudTrail output is withheld', async () => {
  const api: AwsExecApi = {
    async exec(_cmd, args) {
      if (args[0] === 'sts') return { exitCode: 0, stderr: '', stdout: JSON.stringify({ Account: scope.accountId }) };
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          InstanceStatuses: [],
          Datapoints: [{ Timestamp: 'old', Maximum: 0 }],
          Events: [{ EventName: 'RunInstances', CloudTrailEvent: 'PRIVATE-RAW-TRACE' }],
          NextToken: 'more',
        }),
      };
    },
  };
  const result = await collectAwsPassiveEvidence(scope, api);
  expect(result.observations.every((row) => row.status === 'unknown')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('PRIVATE-RAW-TRACE');
  expect(result.observations.every((row) => row.canSatisfyTrafficGate === false)).toBe(true);
});
test('cross-account diagnostics stop before telemetry queries', async () => {
  let calls = 0;
  const api: AwsExecApi = {
    async exec() {
      calls++;
      return { exitCode: 0, stderr: '', stdout: JSON.stringify({ Account: String(Number(scope.accountId) + 1) }) };
    },
  };
  await expect(collectAwsPassiveEvidence(scope, api)).rejects.toThrow('account');
  expect(calls).toBe(1);
});

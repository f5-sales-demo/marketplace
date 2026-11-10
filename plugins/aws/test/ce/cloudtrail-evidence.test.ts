import { expect, test } from 'bun:test';
import type { AwsExecApi } from '../../src/aws/exec';
import { collectAwsPassiveEvidence } from '../../src/ce/passive-evidence';

test('CloudTrail samples use the service page limit and reject stale or unbound events', async () => {
  const scope = {
    accountId: '123456789012',
    awsProfile: 'lab',
    region: 'us-east-1',
    instanceIds: ['i-11111111'],
    interfaceIds: [],
    vpcIds: [],
  };
  for (const kind of ['valid', 'stale', 'wrong-resource']) {
    const api: AwsExecApi = {
      async exec(_command, args) {
        let body: Record<string, unknown> = {};
        if (args[0] === 'sts') body = { Account: scope.accountId };
        if (args[1] === 'lookup-events') {
          expect(args[args.indexOf('--max-results') + 1]).toBe('50');
          expect(args).toContain('--no-paginate');
          body = {
            Events: [
              {
                EventName: 'RunInstances',
                EventTime: kind === 'stale' ? '2000-01-01T00:00:00Z' : args[args.indexOf('--end-time') + 1],
                Resources: [{ ResourceName: kind === 'wrong-resource' ? 'i-22222222' : scope.instanceIds[0] }],
                CloudTrailEvent: 'PRIVATE-RAW-TRACE',
              },
            ],
          };
        }
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(body) };
      },
    };
    const result = await collectAwsPassiveEvidence(scope, api);
    const evidence = result.observations.find((row) => row.category === 'cloudtrail');
    expect(evidence?.status).toBe(kind === 'valid' ? 'observed-sample' : 'unknown');
    expect(JSON.stringify(result)).not.toContain('PRIVATE-RAW-TRACE');
  }
});

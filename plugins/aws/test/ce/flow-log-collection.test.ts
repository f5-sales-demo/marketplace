import { expect, test } from 'bun:test';
import type { AwsExecApi } from '../../src/aws/exec';
import { collectAwsPassiveEvidence } from '../../src/ce/passive-evidence';

const scope = {
  accountId: '123456789012',
  awsProfile: 'lab',
  region: 'us-east-1',
  instanceIds: [],
  interfaceIds: ['eni-11111111'],
  vpcIds: ['vpc-11111111'],
};

test('passive diagnostics read bounded existing Flow Logs using the frozen profile and interface scope', async () => {
  let queries = 0;
  const api: AwsExecApi = {
    async exec(_command, args) {
      expect(args.slice(-2)).toEqual(['--profile', 'lab']);
      const operation = args[1];
      let body: Record<string, unknown>;
      if (operation === 'get-caller-identity') body = { Account: scope.accountId };
      else if (operation === 'describe-flow-logs')
        body = {
          FlowLogs: [
            {
              ResourceId: scope.vpcIds[0],
              FlowLogStatus: 'ACTIVE',
              LogDestinationType: 'cloud-watch-logs',
              LogGroupName: '/lab/flow',
            },
          ],
        };
      else if (operation === 'filter-log-events') {
        queries++;
        expect(args).toContain('--no-paginate');
        expect(args[args.indexOf('--limit') + 1]).toBe('100');
        expect(args[args.indexOf('--filter-pattern') + 1]).toBe('?"eni-11111111"');
        const time = Math.ceil(Number(args[args.indexOf('--start-time') + 1]) / 1000) + 1;
        body = {
          events: [
            {
              timestamp: time * 1000,
              message: `2 ${scope.accountId} eni-11111111 10.0.0.1 10.0.0.2 80 443 6 1 64 ${time} ${time} REJECT OK`,
            },
          ],
        };
      } else body = { SecurityGroups: [], NetworkAcls: [], RouteTables: [] };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(body) };
    },
  };
  const result = await collectAwsPassiveEvidence(scope, api);
  expect(queries).toBe(1);
  expect(result.findings.some((row) => row.status === 'rejections-observed')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('10.0.0.1');
});

test('Flow Log destination discovery does not query partially validated configuration', async () => {
  let queries = 0;
  const api: AwsExecApi = {
    async exec(_command, args) {
      if (args[0] === 'logs') queries++;
      const body =
        args[0] === 'sts'
          ? { Account: scope.accountId }
          : args[1] === 'describe-flow-logs'
            ? {
                FlowLogs: [
                  {
                    ResourceId: scope.vpcIds[0],
                    FlowLogStatus: 'ACTIVE',
                    LogDestinationType: 'cloud-watch-logs',
                    LogGroupName: '/valid',
                  },
                  {
                    ResourceId: scope.vpcIds[0],
                    FlowLogStatus: 'ACTIVE',
                    LogDestinationType: 'cloud-watch-logs',
                    LogGroupName: 'invalid group',
                  },
                ],
              }
            : { SecurityGroups: [], NetworkAcls: [], RouteTables: [] };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(body) };
    },
  };
  const result = await collectAwsPassiveEvidence(scope, api);
  expect(queries).toBe(0);
  expect(result.observations.find((row) => row.category === 'flow-logs')?.status).toBe('unknown');
});

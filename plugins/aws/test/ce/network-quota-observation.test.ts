import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { discoverAwsCompute } from '../../src/ce/discovery';
import { observeAwsNetworkQuotas } from '../../src/ce/network-quota-observation';
import { createAwsComputeDiscoverTool } from '../../src/tools/aws-compute-discover';
import {
  discoveryFixtureCapabilities as capabilities,
  DiscoveryFixtureApi as FixtureApi,
  discoveryFixtureFetch as fetcher,
} from './discovery-fixture';

const quota = { QuotaCode: 'L-TEST', QuotaName: 'A network quota', Value: 5 };
const ok = { exitCode: 0, stderr: '', stdout: JSON.stringify({ Quotas: [quota] }) };
const bad = (stderr: string) => ({ exitCode: 255, stderr, stdout: '' });
function api(results: (typeof ok)[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    exec: async () => results[Math.min(calls++, results.length - 1)],
  };
}
const immediate = { pause: async () => {} };
test('transient quota throttling recovers from an actual later complete response', async () => {
  const runner = api([bad('ThrottlingException: Rate exceeded'), ok]);
  const result = await observeAwsNetworkQuotas(runner, 'ec2', 'us-east-2', immediate);
  expect(result.ok).toBe(true);
  expect(result.quotas).toEqual([quota]);
  expect(result.attempts).toBe(2);
  expect(runner.calls).toBe(2);
});
test('persistent transient failure remains unavailable after the bounded attempts', async () => {
  const runner = api([bad('RequestLimitExceeded')]);
  const result = await observeAwsNetworkQuotas(runner, 'vpc', 'us-east-2', immediate);
  expect(result.ok).toBe(false);
  expect(result.quotas).toEqual([]);
  expect(result.attempts).toBe(3);
  expect(result.failure?.detailSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(runner.calls).toBe(3);
});
test('authorization and session failures stop without retry or cached quota success', async () => {
  for (const text of [
    'AccessDeniedException',
    'ExpiredToken: token included in the request is expired',
    'Unable to locate credentials',
  ]) {
    const runner = api([bad(text), ok]);
    const result = await observeAwsNetworkQuotas(runner, 'ec2', 'us-east-2', immediate);
    expect(result.ok).toBe(false);
    expect(runner.calls).toBe(1);
    expect(result.failure?.retryable).toBe(false);
  }
});
test('missing malformed and partial quota evidence cannot become a successful empty observation', async () => {
  for (const value of [
    {},
    { Quotas: null },
    { Quotas: {} },
    { Quotas: [{}] },
    { Quotas: [{ ...quota, Value: '5' }] },
    { Quotas: [quota], NextToken: 'more' },
  ]) {
    const runner = api([{ ...ok, stdout: JSON.stringify(value) }, ok]);
    const result = await observeAwsNetworkQuotas(runner, 'vpc', 'us-east-2', immediate);
    expect(result.ok).toBe(false);
    expect(runner.calls).toBe(1);
    expect(result.quotas).toEqual([]);
  }
});
test('failure diagnostics retain a digest without exposing raw credentials or messages', async () => {
  const runner = api([bad('AccessDeniedException credential-material-not-for-output')]);
  const result = await observeAwsNetworkQuotas(runner, 'vpc', 'us-east-2', immediate);
  expect(JSON.stringify(result)).not.toContain('credential-material-not-for-output');
  expect(result.failure?.kind).toBe('command-failed');
});
test('caller cancellation propagates without retrying quota calls', async () => {
  let calls = 0;
  const abort = new DOMException('aborted', 'AbortError');
  const runner = {
    exec: async () => {
      calls++;
      throw abort;
    },
  };
  await expect(observeAwsNetworkQuotas(runner, 'ec2', 'us-east-2', immediate)).rejects.toThrow('aborted');
  expect(calls).toBe(1);
});
test('discovery retries a transient quota read and keeps the requested region eligible', async () => {
  const base = new FixtureApi();
  let quotaCalls = 0;
  const runner = {
    exec: async (command: string, args: string[]) => {
      if (
        args[0] === 'service-quotas' &&
        args[1] === 'list-service-quotas' &&
        args[args.indexOf('--service-code') + 1] === 'ec2' &&
        quotaCalls++ === 0
      )
        return bad('ThrottlingException: Rate exceeded');
      return base.exec(command, args);
    },
  };
  const observation = await discoverAwsCompute(
    {
      accountId: '123456789012',
      partition: 'aws',
      deploymentName: 'fixture',
      requiredEnis: 1,
      nodeCount: 1,
      instanceTypes: ['m6i.2xlarge'],
      brownfieldResourceIds: [],
      egressMode: 'elastic-ip',
      routingProfile: 'direct-eni',
      f5Capabilities: capabilities,
    },
    runner,
    fetcher as typeof fetch,
  );
  expect(observation.regions[0].eligible).toBe(true);
  expect(observation.regions[0].reasons).not.toContain('network-quota-observation-failed');
  expect(quotaCalls).toBe(2);
});

test('discovery retains unavailable quota diagnostics and denies eligibility after authorization failure', async () => {
  const base = new FixtureApi();
  let attempts = 0;
  const runner = {
    exec: async (command: string, args: string[]) => {
      if (
        args[0] === 'service-quotas' &&
        args[1] === 'list-service-quotas' &&
        args[args.indexOf('--service-code') + 1] === 'ec2'
      ) {
        attempts++;
        return bad('AccessDeniedException private-test-message');
      }
      return base.exec(command, args);
    },
  };
  const observation = await discoverAwsCompute(
    {
      accountId: '123456789012',
      partition: 'aws',
      deploymentName: 'fixture',
      requiredEnis: 1,
      nodeCount: 1,
      instanceTypes: ['m6i.2xlarge'],
      brownfieldResourceIds: [],
      egressMode: 'elastic-ip',
      routingProfile: 'direct-eni',
      f5Capabilities: capabilities,
    },
    runner,
    fetcher as typeof fetch,
  );
  const region = observation.regions[0];
  expect(region.eligible).toBe(false);
  expect(region.reasons).toContain('network-quota-observation-failed');
  expect(region.networkQuotaFailures?.[0]).toMatchObject({
    serviceCode: 'ec2',
    attempts: 1,
    kind: 'command-failed',
    retryable: false,
  });
  expect(JSON.stringify(region)).not.toContain('private-test-message');
  expect(attempts).toBe(1);
});
test('cancellation during retry delay issues no second command', async () => {
  const runner = api([bad('ThrottlingException'), ok]);
  await expect(
    observeAwsNetworkQuotas(runner, 'ec2', 'us-east-2', {
      pause: async () => {
        throw new DOMException('aborted', 'AbortError');
      },
    }),
  ).rejects.toThrow('aborted');
  expect(runner.calls).toBe(1);
});

test('documented AWS transport timeouts use the same bounded read recovery', async () => {
  for (const message of [
    'RequestTimeoutException',
    'Connect timeout on endpoint URL',
    'Read timeout on endpoint URL',
    'Connection was closed before we received a valid response',
  ]) {
    const runner = api([bad(message), ok]);
    const result = await observeAwsNetworkQuotas(runner, 'ec2', 'us-east-2', immediate);
    expect(result.ok).toBe(true);
    expect(runner.calls).toBe(2);
  }
});

const discoveryInput = {
  accountId: '123456789012',
  partition: 'aws' as const,
  deploymentName: 'fixture',
  requiredEnis: 1,
  nodeCount: 1 as const,
  instanceTypes: ['m6i.2xlarge'],
  brownfieldResourceIds: [],
  egressMode: 'elastic-ip' as const,
  routingProfile: 'direct-eni' as const,
  f5Capabilities: capabilities,
};
test('discovery cancellation before entry makes no official-source or cloud request', async () => {
  const controller = new AbortController();
  controller.abort(new DOMException('aborted', 'AbortError'));
  const runner = new FixtureApi();
  let fetchCalls = 0;
  const source = (async () => {
    fetchCalls++;
    return new Response('{}');
  }) as typeof fetch;
  await expect(discoverAwsCompute(discoveryInput, runner, source, controller.signal)).rejects.toThrow('aborted');
  expect(fetchCalls).toBe(0);
  expect(runner.calls.length).toBe(0);
});
test('discovery cancellation after identity prevents further cloud commands', async () => {
  const controller = new AbortController();
  const base = new FixtureApi();
  let seenSignal: AbortSignal | undefined;
  const runner = {
    exec: async (command: string, args: string[], options?: { signal?: AbortSignal }) => {
      seenSignal = options?.signal;
      const r = await base.exec(command, args);
      if (args[0] === 'sts') controller.abort(new DOMException('aborted', 'AbortError'));
      return r;
    },
  };
  await expect(discoverAwsCompute(discoveryInput, runner, fetcher as typeof fetch, controller.signal)).rejects.toThrow(
    'aborted',
  );
  expect(seenSignal).toBe(controller.signal);
  expect(base.calls.length).toBe(1);
});
test('public compute tool preserves caller cancellation through capability lookup', async () => {
  const controller = new AbortController();
  const runner = new FixtureApi();
  const original = globalThis.fetch;
  globalThis.fetch = fetcher as typeof fetch;
  try {
    const pi = {
      typebox: { Type },
      events: {
        emit: (_channel: string, request: { resolve: (value: unknown) => void }) => {
          request.resolve({
            capabilities: async () => {
              controller.abort(new DOMException('aborted', 'AbortError'));
              return capabilities;
            },
          });
        },
      },
    };
    const tool = createAwsComputeDiscoverTool(pi as never, () => runner);
    const { f5Capabilities: _ignored, ...input } = discoveryInput;
    const result = await tool.execute('cancel-test', input, controller.signal, undefined, {
      cwd: '.',
      sessionManager: {} as never,
    });
    expect(result.isError).toBe(true);
    expect(runner.calls.length).toBe(0);
  } finally {
    globalThis.fetch = original;
  }
});

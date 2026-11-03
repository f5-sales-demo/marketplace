import { expect } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { collectAzureReplacementOperationalReadings } from '../../src/ce/network-replacement-operational-readings';
import type { AzureCeIntent } from '../../src/ce/types';
import { subscriptionId } from './fixtures';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

const sourceVm =
  `/subscriptions/${subscriptionId}/resourceGroups/rg-probe/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
const sourceNic =
  `/subscriptions/${subscriptionId}/resourceGroups/rg-probe/providers/Microsoft.Network/networkInterfaces/probe-nic`.toLowerCase();
const ingress: AzureCeIntent['ingress'] = {
  mode: 'platform-http',
  port: 8080,
  listener: {
    name: 'ce-listener',
    namespace: 'system',
    domain: 'ce.example.invalid',
    privateAddress: '10.20.1.10',
    originPool: { name: 'ce-origin', namespace: 'system' },
  },
  probe: { sourceVmResourceId: sourceVm, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
};

async function fixture(ha = false, configured = true) {
  const f = await replacementOperationalIdentityFixture(ha, 'intact', configured ? ingress : undefined);
  const state = { fault: '', commands: 0, writes: 0, executed: false, links: 0 };
  const links = f.runtime.observeAzureInterfaces.bind(f.runtime);
  f.runtime.observeAzureInterfaces = async (...args) => {
    state.links++;
    const value = await links(...args);
    // A controlled trusted runtime model for source tests only; this is not vendor freshness evidence.
    if (!['stale', 'unqualified'].includes(state.fault)) value.freshness = 'verified';
    if (state.fault === 'gate') value.canSatisfyInterfaceMutationGate = false;
    if (state.fault === 'down' || (state.fault === 'late-down' && state.executed)) {
      value.status = 'down';
      value.interfaces[0].linkUp = false;
    }
    if (state.fault === 'partial') value.interfaces.pop();
    if (state.fault === 'foreign') value.interfaces[0].mac = '02:00:00:00:00:99';
    if (state.fault === 'late-device' && state.executed) value.interfaces[0].device = 'eth9';
    return value;
  };
  const write = f.store.write.bind(f.store);
  f.store.write = async (...args) => {
    state.writes++;
    return write(...args);
  };
  const cloud: AzExecApi = {
    async exec(bin, args, options) {
      if (args[0] === 'account')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: f.plan.subscription.id,
            tenantId: state.fault === 'tenant' ? '00000000-0000-4000-8000-000000000099' : f.plan.subscription.tenantId,
            environmentName: f.plan.subscription.cloud,
            state: 'Enabled',
          }),
        };
      if (args[0] === 'vm' && args[1] === 'show' && args.includes(sourceVm)) {
        const changed = state.fault === 'late-source' && state.executed;
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: sourceVm,
            vmId: changed ? '33333333-3333-4333-8333-333333333334' : '33333333-3333-4333-8333-333333333333',
            location: f.plan.region,
            provisioningState: 'Succeeded',
            powerState: 'VM running',
            customData: 'TRAFFIC_PRIVATE_SENTINEL',
            networkProfile: { networkInterfaces: [{ id: sourceNic, primary: true }] },
          }),
        };
      }
      if (args[0] === 'network' && args[1] === 'nic' && args.includes(sourceNic))
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: sourceNic,
            provisioningState: 'Succeeded',
            virtualMachine: { id: state.fault === 'source-backref' ? sourceVm + '-foreign' : sourceVm },
            ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.30.0.4' }],
          }),
        };
      if (args[0] === 'vm' && args[1] === 'run-command') {
        state.commands++;
        state.executed = true;
        if (state.fault === 'ignored-cancel') return new Promise(() => {});
        if (state.fault === 'authorization') return { exitCode: 1, stderr: 'TRAFFIC_PRIVATE_SENTINEL', stdout: '' };
        const script = args[args.indexOf('--scripts') + 1],
          marker = script.match(/xcsh-current-traffic:[a-f0-9-]+/)?.[0];
        if (!marker) throw Error('Current guest challenge missing');
        if (state.fault === 'configuration') f.state.configuration += '\n';
        if (state.fault === 'generation') f.state.phase = 'launched';
        if (state.fault === 'callback')
          cloud.exec = async () => {
            throw Error('Changed');
          };
        if (state.fault === 'request') f.plan.siteName += '-changed';
        const status = state.fault === 'http' ? 503 : 200,
          body = (state.fault === 'body' ? '5' : '4').repeat(64);
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            value: [
              {
                code: 'ComponentStatus/StdOut/succeeded',
                message: `${status} ${body}\n\n${state.fault === 'replay' ? 'xcsh-current-traffic:00000000-0000-4000-8000-000000000000' : marker}\n`,
              },
              {
                code: 'ComponentStatus/StdErr/succeeded',
                message: state.fault === 'stderr' ? 'TRAFFIC_PRIVATE_SENTINEL' : '',
              },
            ],
          }),
        };
      }
      return f.executionApi.exec(bin, args, options);
    },
  };
  const run = (collectTraffic = true, signal?: AbortSignal) =>
    collectAzureReplacementOperationalReadings(
      f.plan,
      f.identity,
      f.runtime,
      cloud,
      f.store,
      f.session,
      f.observationDependencies,
      'preflight',
      signal,
      collectTraffic,
    );
  return { ...f, state, cloud, run };
}

for (const ha of [false, true])
  test(`replacement ${ha ? 'six-interface HA' : 'single'} collects a fresh challenged traffic sample without full acceptance`, async () => {
    const f = await fixture(ha),
      first = await f.run(),
      second = await f.run();
    expect(first).toMatchObject({
      scope: 'current-replacement-operational-readings',
      status: 'observed',
      operationalAcceptance: 'unknown',
      traffic: { status: 'healthy', scope: 'reviewed-vm-http-content-probe' },
    });
    expect(first.traffic.sampleId).not.toBe(second.traffic.sampleId);
    expect(f.state.commands).toBe(2);
    expect(f.state.writes).toBe(6);
    expect(JSON.stringify(first)).not.toContain('TRAFFIC_PRIVATE_SENTINEL');
  }, 180000);

for (const fault of ['stale', 'unqualified', 'gate', 'down', 'partial', 'foreign'])
  test(`replacement ${fault} cannot admit a traffic probe or write`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    const result = await f.run();
    expect(result.traffic.status).toBe('unknown');
    expect(f.state.commands).toBe(0);
    expect(f.state.writes).toBe(0);
  }, 60000);

test('replacement read-only request and absent reviewed ingress perform zero traffic writes or commands', async () => {
  const configured = await fixture();
  expect((await configured.run(false)).traffic.status).toBe('unknown');
  expect(configured.state.commands).toBe(0);
  expect(configured.state.writes).toBe(0);
  const absent = await fixture(false, false);
  expect((await absent.run()).traffic.status).toBe('unknown');
  expect(absent.state.commands).toBe(0);
  expect(absent.state.writes).toBe(0);
}, 60000);

for (const fault of [
  'tenant',
  'source-backref',
  'late-source',
  'http',
  'body',
  'stderr',
  'replay',
  'authorization',
  'late-down',
  'generation',
])
  test(`replacement current traffic ${fault} remains unknown and never promotes acceptance`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    const result = await f.run();
    expect(result.traffic.status).toBe('unknown');
    expect(result.operationalAcceptance).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('TRAFFIC_PRIVATE_SENTINEL');
  }, 60000);

for (const fault of ['configuration', 'callback', 'request', 'late-device'])
  test(`replacement traffic rejects ${fault} drift`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    await expect(f.run()).rejects.toThrow();
  }, 60000);

test('replacement traffic aborts an ignored guest command and an already cancelled request without publishing completion', async () => {
  const f = await fixture();
  f.state.fault = 'ignored-cancel';
  const abort = new AbortController();
  const promise = f.run(true, abort.signal);
  const timer = setInterval(() => {
    if (f.state.commands) abort.abort(Error('cancelled'));
  }, 10);
  try {
    await expect(promise).rejects.toThrow('cancelled');
  } finally {
    clearInterval(timer);
  }
  expect(f.state.writes).toBe(1);
  const commands = f.state.commands;
  await expect(f.run(true, abort.signal)).rejects.toThrow('cancelled');
  expect(f.state.commands).toBe(commands);
}, 60000);

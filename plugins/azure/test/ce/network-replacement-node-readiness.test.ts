import { expect } from 'bun:test';
import { collectAzureReplacementOperationalIdentity } from '../../src/ce/network-replacement-operational-identity';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

async function fixture(ha = false, fault = '') {
  const f = await replacementOperationalIdentityFixture(ha),
    binding = azureUpgradeBinding(f.plan);
  const calls: string[] = [];
  Object.assign(f.runtime, {
    async observeNodeReadiness(
      _binding: unknown,
      expected: { node: string; siteUid: string; instances: Record<string, string> },
    ) {
      calls.push(expected.node);
      if (fault === 'cancel') return new Promise(() => {});
      if (fault === 'service') throw Error('PRIVATE_READINESS_SENTINEL');
      if (fault === 'request-mutation') expected.instances[expected.node] = '00000000-0000-4000-8000-000000000088';
      if (fault === 'config-race') f.state.configuration += '\n';
      const notReady = fault === 'not-ready' && expected.node === binding.nodes.at(-1);
      return {
        status: 'observed',
        readiness: notReady ? 'not-ready' : 'ready',
        state: notReady ? 'FAILED' : 'PROVISIONED',
        owner: fault === 'owner' ? { ...binding.owner, account: 'example-foreign' } : binding.owner,
        siteName: binding.siteName,
        siteUid: fault === 'uid' ? 'foreign' : expected.siteUid,
        node: fault === 'node' ? 'foreign' : expected.node,
        instanceId: fault === 'instance' ? 'foreign' : expected.instances[expected.node],
        registration: fault === 'registration' ? 'foreign' : 'registration-' + expected.node,
        scope: fault === 'scope' ? 'site-global-only' : 'selected-node-vpm-readiness',
        fqdn: expected.node + '.ce.example.test',
        roles: fault === 'roles' ? [] : ['k8s-master-primary'],
        softwareVersion: fault === 'version' ? '' : 'software-example',
        osVersion: 'os-example',
        vpmVersion: 'vpm-example',
        originalSampleFreshness: fault === 'freshness' ? 'verified' : 'unqualified',
        allNodeHealthQualified: false,
        routingTrafficQualified: false,
        canSatisfyInterfaceMutationGate: fault === 'gate',
        source:
          '/api/operate/namespaces/system/sites/' + binding.siteName + '/vpm/debug/' + expected.node + '/exec-user',
        outputSha256: 'c'.repeat(64),
        bindingOutputSha256: 'd'.repeat(64),
        privateRaw: 'PRIVATE_READINESS_SENTINEL',
      };
    },
  });
  const run = (signal?: AbortSignal) =>
    collectAzureReplacementOperationalIdentity(
      f.plan,
      f.identity,
      f.runtime,
      f.executionApi,
      f.store,
      f.session,
      f.observationDependencies,
      'preflight',
      signal,
    );
  return { ...f, binding, calls, run };
}

for (const ha of [false, true])
  test(`replacement ${ha ? 'HA' : 'single'} readiness queries every exact current node and preserves identity-only acceptance`, async () => {
    const f = await fixture(ha),
      result = await f.run();
    expect(f.calls).toEqual(f.binding.nodes);
    expect(result.nodeReadiness).toMatchObject({
      status: 'observed',
      readiness: 'ready',
      scope: 'all-replacement-node-vpm-readiness',
      nodeHealth: 'unknown',
      originalSampleFreshness: 'unqualified',
      routingTrafficQualified: false,
      canSatisfyInterfaceMutationGate: false,
    });
    expect(result.nodeReadiness.nodes).toHaveLength(ha ? 3 : 1);
    expect(result.interfaces).toHaveLength(ha ? 6 : 2);
    expect(result.operationalAcceptance).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_READINESS_SENTINEL');
    expect(f.state.applies).toBe(0);
    expect(f.state.bootstraps).toBe(0);
  }, 60000);

for (const fault of [
  'owner',
  'uid',
  'node',
  'instance',
  'registration',
  'scope',
  'roles',
  'version',
  'freshness',
  'gate',
  'service',
])
  test(`replacement readiness remains unknown for ${fault}`, async () => {
    const f = await fixture(false, fault),
      result = await f.run();
    expect(result.nodeReadiness.status).toBe('unknown');
    expect(result.nodeReadiness.readiness).toBe('unknown');
    expect(result.operationalAcceptance).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_READINESS_SENTINEL');
  }, 60000);

test('one not-ready replacement node cannot be hidden by other provisioned nodes', async () => {
  const f = await fixture(true, 'not-ready'),
    result = await f.run();
  expect(result.nodeReadiness).toMatchObject({ status: 'observed', readiness: 'not-ready' });
  expect(f.calls).toEqual(f.binding.nodes);
}, 60000);

test('incomplete registrations prevent replacement readiness queries', async () => {
  const f = await fixture();
  f.observationState.fault = 'registration-partial';
  const result = await f.run();
  expect(result.nodeReadiness.status).toBe('unknown');
  expect(f.calls).toEqual([]);
}, 60000);

test('replacement configuration changes across readiness reject rather than becoming unknown evidence', async () => {
  const f = await fixture(false, 'config-race');
  await expect(f.run()).rejects.toThrow();
}, 60000);

test('caller cancellation bounds an ignoring replacement readiness reader', async () => {
  const f = await fixture(false, 'cancel'),
    controller = new AbortController();
  const reader = f.runtime.observeNodeReadiness;
  if (typeof reader !== 'function') throw Error('Synthetic ignoring reader missing');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  f.runtime.observeNodeReadiness = (...args) => {
    timeout = setTimeout(() => controller.abort(Error('readiness-cancelled')), 20);
    return reader(...args);
  };
  try {
    await expect(f.run(controller.signal)).rejects.toThrow('readiness-cancelled');
    expect(f.calls).toHaveLength(1);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}, 60000);

test('replacement observer cannot rewrite the expected VM identity through its request', async () => {
  const f = await fixture(false, 'request-mutation'),
    result = await f.run();
  expect(result.nodeReadiness.status).toBe('unknown');
  expect(result.nodeReadiness.readiness).toBe('unknown');
}, 60000);

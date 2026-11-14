import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { CeInterfaceObservation, ExpectedCeInterface } from '../../src/ce/interface-evidence';
import type { CePlatformService } from '../../src/ce/service';
import { createF5xcCeV2StatusTool } from '../../src/tools/f5xc-ce-v2-status';
import type { PlatformToolApi } from '../../src/types';

const expected: Array<ExpectedCeInterface & { device: string }> = ['node-one', 'node-two', 'node-three'].flatMap(
  (node, n) =>
    (['slo', 'sli'] as const).map((role, index) => ({
      node,
      role,
      device: index === 0 ? 'ens5' : 'ens6',
      mac: `02:00:00:00:0${n + 1}:0${index + 1}`,
    })),
);
function observation(status: 'observed' | 'down' | 'unknown' = 'observed'): CeInterfaceObservation {
  return {
    status,
    observedAt: '2026-10-30T12:00:00.000Z',
    freshness: 'verified',
    canSatisfyInterfaceMutationGate: status === 'observed',
    interfaces:
      status === 'unknown'
        ? []
        : expected.map((iface, index) => ({
            ...iface,
            device: iface.device,
            interfaceName: `generated-${index}`,
            mtu: 1500,
            linkUp: status !== 'down' || index !== 3,
            ipv4: null,
          })),
  };
}
async function execute(evidence: CeInterfaceObservation) {
  const binding = {
    owner: { deploymentId: 'ce-status-test', engine: 'native', provider: 'aws', account: 'demo', region: 'us-east-1' },
    siteName: 'ce-status-test',
    nodes: ['node-one', 'node-two', 'node-three'],
  };
  const runtime = {
    contract: { fingerprint: 'fingerprint' },
    observeOwnedSite: async () => ({
      system_metadata: { uid: 'owned-site' },
      spec: {
        aws: { not_managed: { node_list: binding.nodes.map((hostname) => ({ hostname, interface_list: [{}, {}] })) } },
      },
    }),
    observeAwsInterfaces: async () => structuredClone(evidence),
  };
  const service = {
    siteBinding: async () => ({
      binding,
      expectedInterfaces: structuredClone(expected),
      siteUid: 'owned-site',
      contractFingerprint: 'fingerprint',
    }),
    runtime: async () => runtime,
  } as unknown as CePlatformService;
  return createF5xcCeV2StatusTool({ typebox: { Type } } as unknown as PlatformToolApi, () => service).execute(
    'id',
    { namespace: 'system', siteName: binding.siteName },
    undefined,
    undefined,
    { hasUI: false } as never,
  );
}

test('public status reports six verified interfaces up, explicit selected SLI down, and restored up with the same identities', async () => {
  const receipts = [];
  for (const state of ['observed', 'down', 'observed'] as const) {
    const result = await execute(observation(state));
    expect(result.details.status).toBe(state);
    expect(result.details.interfaces).toHaveLength(6);
    expect(result.details.freshnessQualification).toBe('verified');
    expect(result.details.canSatisfyMutationGate).toBe(state === 'observed');
    receipts.push(
      result.details.interfaces.map((row) => ({
        node: row.node,
        role: row.role,
        mac: row.mac,
        device: row.device,
        name: row.interfaceName,
      })),
    );
    expect(result.details.ceSampleAge).toBe('unknown'); // No original heartbeat timestamp is invented.
  }
  expect(receipts[0]).toEqual(receipts[1]);
  expect(receipts[1]).toEqual(receipts[2]);
});

test('public status keeps unqualified or absent freshness down unknown regardless of the admission flag', async () => {
  for (const freshness of ['unqualified', undefined] as const) {
    const evidence = observation('down');
    evidence.freshness = freshness;
    evidence.canSatisfyInterfaceMutationGate = true;
    const result = await execute(evidence);
    expect(result.details.status).toBe('unknown');
    expect(result.details.reportedLinkState).toBe('down');
    expect(result.details.canSatisfyMutationGate).toBe(false);
  }
});

test('public status rejects duplicate, partial, foreign, malformed and internally contradictory trusted observations', async () => {
  for (const fault of [
    'duplicate-object',
    'duplicate-row',
    'partial',
    'foreign-device',
    'foreign-mac',
    'malformed-link',
    'contradictory-state',
  ]) {
    const evidence = observation();
    if (fault === 'duplicate-object') evidence.interfaces[1].interfaceName = evidence.interfaces[0].interfaceName;
    if (fault === 'duplicate-row') evidence.interfaces[1] = structuredClone(evidence.interfaces[0]);
    if (fault === 'partial') evidence.interfaces.pop();
    if (fault === 'foreign-device') evidence.interfaces[1].device = 'ens99';
    if (fault === 'foreign-mac') evidence.interfaces[1].mac = '02:ff:00:00:00:01';
    if (fault === 'malformed-link') (evidence.interfaces[1] as unknown as Record<string, unknown>).linkUp = 'up';
    if (fault === 'contradictory-state') evidence.interfaces[1].linkUp = false;
    const result = await execute(evidence);
    expect(result.details.status).toBe('unknown');
    expect(result.details.interfaces).toEqual([]);
    expect(result.details.canSatisfyMutationGate).toBe(false);
  }
});

test('public status preserves healthy observed while requiring independent freshness and admission qualification', async () => {
  for (const fault of ['freshness', 'admission'] as const) {
    const evidence = observation();
    if (fault === 'freshness') evidence.freshness = 'unqualified';
    else evidence.canSatisfyInterfaceMutationGate = false;
    const result = await execute(evidence);
    expect(result.details.status).toBe('observed');
    expect(result.details.canSatisfyMutationGate).toBe(false);
  }
});

test('public status exposes explicit down from complete identity-verified current evidence without permitting mutation', async () => {
  const result = await execute(observation('down'));
  expect(result.details.status).toBe('down');
  expect(result.details.reportedLinkState).toBe('down');
  expect(result.details.interfaces[3].role).toBe('sli');
  expect(result.details.interfaces[3].linkUp).toBe(false);
  expect(result.details.canSatisfyMutationGate).toBe(false);
});

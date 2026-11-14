import { expect, test } from 'bun:test';
import { requireQualifiedUpInterfaceEvidence } from '../../src/ce/interface-admission';
import type { CeInterfaceObservation, ExpectedCeInterface } from '../../src/ce/interface-evidence';

function fixture() {
  const expected: ExpectedCeInterface[] = Array.from({ length: 3 }, (_, node) =>
    ['slo', 'sli'].map((role, index) => ({
      node: `owned-${node + 1}`,
      role: role as 'slo' | 'sli',
      mac: `02:00:00:00:0${node + 1}:0${index + 1}`,
      device: `eth${index}`,
    })),
  ).flat();
  const observed: CeInterfaceObservation = {
    status: 'observed',
    freshness: 'verified',
    canSatisfyInterfaceMutationGate: true,
    observedAt: '2026-10-29T00:00:00Z',
    interfaces: expected.map((v, index) => ({
      ...v,
      device: v.device as string,
      interfaceName: `owned-interface-${index}`,
      mtu: 1500,
      linkUp: true,
      ipv4: null,
    })),
  };
  return { expected, observed };
}
test('qualified six-interface joins preserve every supplied identity and explicit up value', () => {
  const f = fixture(),
    before = JSON.stringify(f);
  requireQualifiedUpInterfaceEvidence(f.observed, f.expected);
  expect(JSON.stringify(f)).toBe(before);
});
for (const kind of ['duplicate-physical-MAC', 'zero-MAC', 'multicast-MAC'] as const)
  test('qualification flags cannot override ' + kind, () => {
    const f = fixture(),
      value =
        kind === 'duplicate-physical-MAC'
          ? f.expected[1].mac
          : kind === 'zero-MAC'
            ? '00:00:00:00:00:00'
            : '01:00:00:00:00:01';
    f.expected[0].mac = value;
    f.observed.interfaces[0].mac = value;
    expect(() => requireQualifiedUpInterfaceEvidence(f.observed, f.expected)).toThrow();
  });
for (const kind of [
  'duplicated-object',
  'duplicated-device',
  'wrong-device',
  'partial',
  'extra',
  'down',
  'unknown',
  'unqualified',
  'missing-qualification',
] as const)
  test('six-interface gate rejects ' + kind, () => {
    const f = fixture();
    if (kind === 'duplicated-object') f.observed.interfaces[0].interfaceName = f.observed.interfaces[1].interfaceName;
    if (kind === 'duplicated-device') f.observed.interfaces[0].device = f.observed.interfaces[1].device;
    if (kind === 'wrong-device') f.observed.interfaces[0].device = 'foreign';
    if (kind === 'partial') f.observed.interfaces.pop();
    if (kind === 'extra') f.observed.interfaces.push({ ...f.observed.interfaces[0] });
    if (kind === 'down') {
      f.observed.interfaces[0].linkUp = false;
      f.observed.status = 'down';
    }
    if (kind === 'unknown') f.observed.status = 'unknown';
    if (kind === 'unqualified') f.observed.freshness = 'unqualified';
    if (kind === 'missing-qualification') delete f.observed.canSatisfyInterfaceMutationGate;
    expect(() => requireQualifiedUpInterfaceEvidence(f.observed, f.expected)).toThrow();
  });

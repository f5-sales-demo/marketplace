import type { CeInterfaceObservation, ExpectedCeInterface } from './interface-evidence';

const name = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
const mac = (v: unknown): string | undefined =>
  typeof v === 'string' &&
  /^(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$/.test(v) &&
  v !== '00:00:00:00:00:00' &&
  (Number.parseInt(v.slice(0, 2), 16) & 1) === 0
    ? v.toLowerCase()
    : undefined;

/** Accept only a trusted observer's qualified, complete up evidence. The caller acquires the
 * observer from the owned runtime; qualification is not accepted from public tool arguments.
 * Neither an up status nor fetch time establishes original sample freshness.
 */
export function requireQualifiedUpInterfaceEvidence(
  observation: CeInterfaceObservation,
  expected: ExpectedCeInterface[],
): void {
  const fail = () => {
    throw Error('Qualified current up interface evidence is required before routing mutation');
  };
  if (
    observation?.status !== 'observed' ||
    observation.freshness !== 'verified' ||
    observation.canSatisfyInterfaceMutationGate !== true ||
    !Array.isArray(observation.interfaces) ||
    !Array.isArray(expected) ||
    expected.length === 0 ||
    observation.interfaces.length !== expected.length
  )
    fail();
  const expectedIds = new Set<string>(),
    physicalMacs = new Set<string>(),
    devices = new Set<string>(),
    objects = new Set<string>();
  for (const wanted of expected) {
    const address = mac(wanted.mac),
      key = `${wanted.node}/${wanted.role}`;
    if (
      !name(wanted.node) ||
      !['slo', 'data', 'sli'].includes(wanted.role) ||
      !address ||
      physicalMacs.has(address) ||
      expectedIds.has(key)
    )
      fail();
    expectedIds.add(key);
    physicalMacs.add(address as string);
    const matches = observation.interfaces.filter(
      (row) => row && row.node === wanted.node && row.role === wanted.role && mac(row.mac) === address,
    );
    if (matches.length !== 1) fail();
    const row = matches[0],
      deviceKey = `${row.node}/${row.device}`;
    if (
      row.linkUp !== true ||
      !name(row.device) ||
      !name(row.interfaceName) ||
      (wanted.device !== undefined && row.device !== wanted.device) ||
      !Number.isInteger(row.mtu) ||
      (row.mtu !== 0 && (row.mtu < 576 || row.mtu > 8000)) ||
      devices.has(deviceKey) ||
      objects.has(row.interfaceName)
    )
      fail();
    devices.add(deviceKey);
    objects.add(row.interfaceName);
  }
}

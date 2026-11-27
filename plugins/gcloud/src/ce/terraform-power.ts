import { fingerprint } from './discovery';

/** Revise only explicitly named VM fields in the shared runner's current private configuration. */
export function reviseGcpTerraformPower(
  configuration: string,
  project: string,
  operation: 'start' | 'stop' | 'resize',
  nodes: Array<{ address: string; name: string; zone: string }>,
  target?: { machineType: string; guestCpus: number; memoryMiB: number; maxNics: number },
) {
  if (!['start', 'stop', 'resize'].includes(operation) || nodes.length !== 1)
    throw new Error('Qualified single-node power configuration required');
  const before = JSON.parse(configuration);
  const after = structuredClone(before);
  const node = nodes[0];
  if (!/^google_compute_instance\.[a-z][a-z0-9_]*$/.test(node.address)) throw new Error('Exact VM address required');
  const key = node.address.split('.')[1];
  const vm = after.resource?.google_compute_instance?.[key];
  if (!vm || vm.project !== project || vm.name !== node.name || vm.zone !== node.zone)
    throw new Error('Current Terraform VM scope differs');
  if (operation === 'resize') {
    if (
      !target ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(target.machineType) ||
      !Number.isInteger(target.guestCpus) ||
      target.guestCpus < 8 ||
      !Number.isInteger(target.memoryMiB) ||
      target.memoryMiB < 32768 ||
      !Array.isArray(vm.network_interface) ||
      !Number.isInteger(target.maxNics) ||
      target.maxNics < vm.network_interface.length
    )
      throw new Error('Observed resize sizing/NIC limits required');
    if (vm.desired_status !== 'TERMINATED') throw new Error('Resize requires a separately applied stopped-state plan');
    vm.machine_type = target.machineType;
  } else vm.desired_status = operation === 'start' ? 'RUNNING' : 'TERMINATED';
  return {
    configuration: JSON.stringify(after),
    beforeFingerprint: fingerprint(before),
    afterFingerprint: fingerprint(after),
    operation,
    addresses: [node.address],
    requires: [
      'fresh exact saved plan',
      'live ledger VM identity',
      'owning engine approval',
      'registration and traffic recovery',
    ],
  };
}

import { fingerprint } from './discovery';
import { type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';

export interface GcpPowerObservation {
  id: string;
  selfLink: string;
  status: 'RUNNING' | 'TERMINATED';
  machineType: string;
  observedAt: string;
}
/** Whole-site power planning requires the exact complete node inventory; serial HA safety is a separate gate. */
export function planGcpNativePower(
  operation: 'start' | 'stop' | 'resize',
  nodes: GcpResourceIdentity[],
  observed: GcpPowerObservation[],
  target?: { machineType: string; guestCpus: number; memoryMiB: number; maxNics: number; currentNicCount: number },
  now = Date.now(),
) {
  if (
    !['start', 'stop', 'resize'].includes(operation) ||
    ![1, 3].includes(nodes.length) ||
    observed.length !== nodes.length
  )
    throw new Error('Complete one-node or HA power inventory required');
  if (operation === 'resize' && nodes.length !== 1)
    throw new Error('HA resize requires independently qualified serial admission');
  const ids = new Set<string>();
  const owner = nodes[0];
  const actions: Array<{ id: string; argv: string[]; dependencies: string[] }> = [];
  for (const node of nodes) {
    validateGcpResourceIdentity(node);
    if (
      node.kind !== 'instance' ||
      node.engine !== 'native' ||
      !node.nodeName ||
      node.project !== owner.project ||
      node.deploymentName !== owner.deploymentName ||
      node.siteName !== owner.siteName ||
      ids.has(node.id)
    )
      throw new Error('Exact native site ownership required for power operations');
    ids.add(node.id);
    const rows = observed.filter((row) => row.id === node.id && row.selfLink === node.selfLink);
    if (rows.length !== 1) throw new Error('Power observation identity is missing or ambiguous');
    const vm = rows[0],
      timestamp = Date.parse(vm.observedAt);
    if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > 60_000)
      throw new Error('Power observation is stale');
    if (!['RUNNING', 'TERMINATED'].includes(vm.status)) throw new Error('VM power operation is still converging');
    const segments = node.selfLink.split('/'),
      zone = segments[8],
      name = segments[10];
    const scope = [`--project=${node.project}`, `--zone=${zone}`];
    if (operation === 'start' && vm.status === 'TERMINATED')
      actions.push({
        id: `start-${name}`,
        argv: ['compute', 'instances', 'start', name, ...scope, '--async', '--quiet', '--format=json'],
        dependencies: [],
      });
    if (operation === 'stop' && vm.status === 'RUNNING')
      actions.push({
        id: `stop-${name}`,
        argv: ['compute', 'instances', 'stop', name, ...scope, '--async', '--quiet', '--format=json'],
        dependencies: [],
      });
    if (operation === 'resize') {
      if (
        !target ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(target.machineType) ||
        !Number.isInteger(target.guestCpus) ||
        target.guestCpus < 8 ||
        !Number.isInteger(target.memoryMiB) ||
        target.memoryMiB < 32768 ||
        !Number.isInteger(target.maxNics) ||
        target.maxNics < target.currentNicCount ||
        target.currentNicCount < 1
      )
        throw new Error('Resize target lacks verified CE sizing/NIC limits');
      if (vm.machineType.split('/').at(-1) === target.machineType) continue;
      if (vm.status === 'RUNNING')
        actions.push({
          id: `stop-${name}`,
          argv: ['compute', 'instances', 'stop', name, ...scope, '--async', '--quiet', '--format=json'],
          dependencies: [],
        });
      actions.push({
        id: `resize-${name}`,
        argv: [
          'compute',
          'instances',
          'set-machine-type',
          name,
          ...scope,
          `--machine-type=${target.machineType}`,
          '--quiet',
          '--format=json',
        ],
        dependencies: vm.status === 'RUNNING' ? [`stop-${name}`] : [],
      });
      if (vm.status === 'RUNNING')
        actions.push({
          id: `start-${name}`,
          argv: ['compute', 'instances', 'start', name, ...scope, '--async', '--quiet', '--format=json'],
          dependencies: [`resize-${name}`],
        });
    }
  }
  return {
    schemaVersion: 1,
    engine: 'native',
    operation,
    executable: false,
    actions,
    restoration: observed.map((row) => ({
      id: row.id,
      selfLink: row.selfLink,
      power: row.status,
      machineType: row.machineType,
    })),
    required: [
      'reviewed plan authorization',
      'ledger/live identity recheck',
      'platform drain before outage',
      'async completion before dependent actions',
      'registration and traffic recovery',
    ],
    sha256: fingerprint({ operation, nodes, observed, target }),
  };
}

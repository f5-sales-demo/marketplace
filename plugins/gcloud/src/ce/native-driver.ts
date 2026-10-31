import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpBootstrapStore } from './bootstrap-checkout';
import type { GcpLifecycleAction, GcpNativeDriver } from './native-apply';
import { type GcpOperationBinding, reconcileGcpOperation, recordGcpOperation } from './native-operation';
import { type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';

function vmIdentity(resource: GcpResourceIdentity) {
  validateGcpResourceIdentity(resource);
  if (resource.kind !== 'instance' || resource.engine !== 'native')
    throw new Error('Native VM driver requires exact instance ownership');
  const parts = resource.selfLink.split('/');
  return { name: parts[10], zone: parts[8], project: resource.project };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed scoped GCP response');
  return value as Record<string, unknown>;
}
/** Internal driver only; the plan executor admits reviewed arguments and owns authorization. */
export function createGcpNativeVmDriver(api: GcloudExecApi, store: GcpBootstrapStore): GcpNativeDriver {
  const query = async (args: string[], signal?: AbortSignal) => {
    const result = await api.exec('gcloud', args, { signal });
    if (result.exitCode !== 0) throw new Error('Scoped GCP VM request failed');
    try {
      return object(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed scoped GCP VM response');
    }
  };
  const observe = async (resource: GcpResourceIdentity, signal?: AbortSignal) => {
    const scope = vmIdentity(resource);
    return query(
      [
        'compute',
        'instances',
        'describe',
        scope.name,
        `--project=${scope.project}`,
        `--zone=${scope.zone}`,
        '--format=json(id,selfLink,status,machineType,networkInterfaces.name)',
      ],
      signal,
    );
  };
  const operationBinding = (action: GcpLifecycleAction): GcpOperationBinding => {
    const resource = action.resources[0],
      scope = vmIdentity(resource);
    return {
      project: scope.project,
      zone: scope.zone,
      deploymentName: resource.deploymentName,
      engine: 'native',
      actionId: action.executionId ?? action.id,
    };
  };
  return {
    async observe(resource, signal) {
      const result = await observe(resource, signal);
      if (String(result.id) !== resource.id || result.selfLink !== resource.selfLink)
        throw new Error('Observed VM was replaced');
      return { id: String(result.id), selfLink: String(result.selfLink) };
    },
    async assertPreconditions(action, signal) {
      const resource = action.resources[0],
        result = await observe(resource, signal);
      if (String(result.id) !== resource.id || result.selfLink !== resource.selfLink)
        throw new Error('VM identity changed before mutation');
      const operation = action.argv[2];
      if (operation === 'set-machine-type') {
        if (result.status !== 'TERMINATED') throw new Error('Machine type can change only on the observed stopped VM');
        const type = action.argv.find((arg) => arg.startsWith('--machine-type='))?.split('=')[1];
        if (!type) throw new Error('Resize target missing');
        const scope = vmIdentity(resource);
        const machine = await query(
          [
            'compute',
            'machine-types',
            'describe',
            type,
            `--project=${scope.project}`,
            `--zone=${scope.zone}`,
            '--format=json(name,guestCpus,memoryMb)',
          ],
          signal,
        );
        const count = Array.isArray(result.networkInterfaces) ? result.networkInterfaces.length : 0;
        if (
          machine.name !== type ||
          typeof machine.guestCpus !== 'number' ||
          machine.guestCpus < 8 ||
          typeof machine.memoryMb !== 'number' ||
          machine.memoryMb < 32768 ||
          count < 1
        )
          throw new Error('Resize target lacks verified minimum sizing');
        // Per-family NIC limit and quotas are plan-time gates; this observation
        // rechecks machine dimensions and stopped state immediately before apply.
      } else if (operation === 'start' && result.status !== 'TERMINATED')
        throw new Error('Start requires a stopped VM');
      else if (operation === 'stop' && result.status !== 'RUNNING') throw new Error('Stop requires a running VM');
    },
    async submit(action, signal) {
      if (action.resources.length !== 1) throw new Error('Exact single VM mutation required');
      const scope = vmIdentity(action.resources[0]);
      if (
        action.argv[0] !== 'compute' ||
        action.argv[1] !== 'instances' ||
        !['start', 'stop', 'set-machine-type'].includes(action.argv[2]) ||
        action.argv[3] !== scope.name
      )
        throw new Error('Unsupported native VM mutation');
      if (!action.argv.includes(`--project=${scope.project}`) || !action.argv.includes(`--zone=${scope.zone}`))
        throw new Error('Native VM mutation scope differs');
      const allowed = new Set([
        `--project=${scope.project}`,
        `--zone=${scope.zone}`,
        '--quiet',
        '--format=json',
        '--async',
      ]);
      if (
        action.argv
          .slice(4)
          .some(
            (arg) =>
              !allowed.has(arg) &&
              !(action.argv[2] === 'set-machine-type' && /^--machine-type=[a-z][a-z0-9-]{0,62}$/.test(arg)),
          )
      )
        throw new Error('Unsupported native VM mutation argument');
      const result = await api.exec('gcloud', action.argv, { signal });
      if (result.exitCode !== 0) throw new Error('VM mutation outcome requires reconciliation');
      let value: unknown;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        throw new Error('VM mutation returned no verifiable operation');
      }
      if (Array.isArray(value) && value.length !== 1) throw new Error('VM mutation returned an ambiguous result count');
      const row = object(Array.isArray(value) ? value[0] : value);
      if (row.kind === 'compute#operation' || (typeof row.name === 'string' && row.name.startsWith('operation-'))) {
        await recordGcpOperation(store, operationBinding(action), row, {
          id: action.resources[0].id,
          selfLink: action.resources[0].selfLink,
        });
        return { kind: 'operation', name: row.name };
      }
      if (action.argv.includes('--async')) throw new Error('Asynchronous VM result lacks a verifiable operation');
      // set-machine-type waits synchronously and can return an empty document;
      // establish success only by a subsequent exact VM observation.
      return { kind: 'completed-command' };
    },
    async reconcile(action, receipt, signal) {
      const operationReceipt =
        receipt && typeof receipt === 'object' ? (receipt as Record<string, unknown>) : undefined;
      if (!operationReceipt) {
        let saved: unknown;
        try {
          saved = await store.read(`gcp-operation-${action.executionId ?? action.id}.json`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (saved) {
          const outcome = await reconcileGcpOperation(store, api, operationBinding(action), signal);
          if (outcome.state === 'pending' || outcome.state === 'failed') return outcome.state;
        }
      }
      if (operationReceipt?.kind === 'operation') {
        const op = await reconcileGcpOperation(store, api, operationBinding(action), signal);
        if (op.state === 'pending' || op.state === 'failed') return op.state;
      }
      const resource = action.resources[0],
        row = await observe(resource, signal);
      if (String(row.id) !== resource.id || row.selfLink !== resource.selfLink)
        throw new Error('VM identity changed during operation reconciliation');
      const operation = action.argv[2];
      if (operation === 'stop') return row.status === 'TERMINATED' ? 'done' : 'pending';
      if (operation === 'start') return row.status === 'RUNNING' ? 'done' : 'pending';
      const target = action.argv.find((arg) => arg.startsWith('--machine-type='))?.split('=')[1];
      return row.status === 'TERMINATED' &&
        typeof row.machineType === 'string' &&
        row.machineType.split('/').at(-1) === target
        ? 'done'
        : 'pending';
    },
  };
}

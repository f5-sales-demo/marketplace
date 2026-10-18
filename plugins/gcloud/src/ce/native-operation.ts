import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpCeEngine } from './types';

export interface GcpOperationStore {
  read(name: string): Promise<unknown>;
  write(name: string, value: unknown): Promise<void>;
}
export interface GcpOperationBinding {
  project: string;
  zone: string;
  deploymentName: string;
  engine: GcpCeEngine;
  actionId: string;
}
interface Checkpoint {
  schemaVersion: 1;
  binding: GcpOperationBinding;
  operationName: string;
  state: 'pending' | 'done' | 'failed';
  errorCodes: string[];
}
function valid(binding: GcpOperationBinding) {
  if (binding.engine !== 'native') throw new Error('GCP native reconciliation requires owning engine native');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(binding.project) || !/^[a-z]+(?:-[a-z]+)+\d-[a-z]$/.test(binding.zone))
    throw new Error('Explicit GCP operation scope required');
  for (const name of [binding.deploymentName, binding.actionId])
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid GCP operation binding');
}
function parseOperation(
  value: unknown,
  binding: GcpOperationBinding,
): { name: string; status: string; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed GCP operation');
  const row = value as Record<string, unknown>;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${binding.project}/zones/${binding.zone}/operations/`;
  if (typeof row.name !== 'string' || !/^operation-[a-z0-9-]+$/.test(row.name) || row.selfLink !== prefix + row.name)
    throw new Error('GCP operation identity mismatch');
  if (!['PENDING', 'RUNNING', 'DONE'].includes(String(row.status))) throw new Error('Unknown GCP operation state');
  const error = row.error as { errors?: Array<{ code?: unknown }> } | undefined;
  if (error && (!Array.isArray(error.errors) || error.errors.length === 0))
    throw new Error('Malformed GCP operation failure');
  const errors = (error?.errors ?? []).map((item) =>
    typeof item.code === 'string' && /^[A-Z0-9_]+$/.test(item.code) ? item.code : 'UNKNOWN_OPERATION_ERROR',
  );
  return { name: row.name, status: String(row.status), errors };
}
function filename(binding: GcpOperationBinding) {
  return `gcp-operation-${binding.actionId}.json`;
}

/** Persist exact operation identity immediately after an accepted asynchronous submission. */
export async function recordGcpOperation(
  store: GcpOperationStore,
  binding: GcpOperationBinding,
  response: unknown,
): Promise<Checkpoint> {
  valid(binding);
  const operation = parseOperation(response, binding);
  const checkpoint: Checkpoint = {
    schemaVersion: 1,
    binding: structuredClone(binding),
    operationName: operation.name,
    state: operation.status === 'DONE' ? (operation.errors.length ? 'failed' : 'done') : 'pending',
    errorCodes: operation.errors,
  };
  await store.write(filename(binding), checkpoint);
  return checkpoint;
}

/** Reconcile once per invocation; caller retains authorization across interruptions. */
export async function reconcileGcpOperation(
  store: GcpOperationStore,
  api: GcloudExecApi,
  binding: GcpOperationBinding,
  signal?: AbortSignal,
): Promise<Checkpoint> {
  valid(binding);
  const checkpoint = (await store.read(filename(binding))) as Checkpoint;
  if (
    checkpoint?.schemaVersion !== 1 ||
    JSON.stringify(checkpoint.binding) !== JSON.stringify(binding) ||
    !/^operation-[a-z0-9-]+$/.test(checkpoint.operationName)
  )
    throw new Error('Operation checkpoint ownership differs');
  if (checkpoint.state === 'done' || checkpoint.state === 'failed') return checkpoint;
  if (checkpoint.state !== 'pending') throw new Error('Malformed operation checkpoint state');
  if (signal?.aborted) throw new Error('GCP operation observation cancelled');
  const args = [
    'compute',
    'operations',
    'describe',
    checkpoint.operationName,
    `--project=${binding.project}`,
    `--zone=${binding.zone}`,
    '--format=json(name,selfLink,status,error.errors.code)',
  ];
  const output = await api.exec('gcloud', args, { signal });
  if (output.exitCode !== 0) throw new Error('GCP operation observation failed');
  let value: unknown;
  try {
    value = JSON.parse(output.stdout);
  } catch {
    throw new Error('Malformed GCP operation response');
  }
  const operation = parseOperation(value, binding);
  if (operation.name !== checkpoint.operationName) throw new Error('GCP operation identity changed');
  return recordGcpOperation(store, binding, value);
}

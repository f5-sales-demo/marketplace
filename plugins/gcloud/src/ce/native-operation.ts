import type { GcloudExecApi } from '../gcloud/exec';
import { fingerprint } from './discovery';
import type { GcpCeEngine } from './types';

export interface GcpOperationStore {
  read(name: string): Promise<unknown>;
  write(name: string, value: unknown): Promise<void>;
}
export interface GcpOperationBinding {
  project: string;
  zone?: string;
  region?: string;
  global?: true;
  deploymentName: string;
  engine: GcpCeEngine;
  actionId: string;
}
interface Checkpoint {
  schemaVersion: 1 | 2;
  binding: GcpOperationBinding;
  operationName: string;
  state: 'pending' | 'done' | 'failed';
  errorCodes: string[];
  target?: GcpOperationTarget;
}
export interface GcpOperationTarget {
  selfLink: string;
  id: string;
}
function targetIdentity(value: unknown, binding: GcpOperationBinding): GcpOperationTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed operation target identity');
  const target = value as GcpOperationTarget;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${binding.project}/${scopePath(binding)}/instances/`;
  if (
    !binding.zone ||
    typeof target.id !== 'string' ||
    !/^\d+$/.test(target.id) ||
    typeof target.selfLink !== 'string' ||
    !target.selfLink.startsWith(prefix) ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(target.selfLink.slice(prefix.length)) ||
    Object.keys(target).some((key) => !['selfLink', 'id'].includes(key))
  )
    throw new Error('Invalid operation target identity');
  return { selfLink: target.selfLink, id: target.id };
}
function valid(binding: GcpOperationBinding) {
  if (binding.engine !== 'native') throw new Error('GCP native reconciliation requires owning engine native');
  if (
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(binding.project) ||
    [binding.zone !== undefined, binding.region !== undefined, binding.global === true].filter(Boolean).length !== 1 ||
    (binding.zone !== undefined && !/^[a-z]+(?:-[a-z]+)+\d-[a-z]$/.test(binding.zone)) ||
    (binding.region !== undefined && !/^[a-z]+(?:-[a-z]+)+\d$/.test(binding.region))
  )
    throw new Error('Explicit GCP operation scope required');
  for (const name of [binding.deploymentName, binding.actionId])
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid GCP operation binding');
}
function scopePath(binding: GcpOperationBinding): string {
  return binding.zone ? `zones/${binding.zone}` : binding.region ? `regions/${binding.region}` : 'global';
}
function parseOperation(
  value: unknown,
  binding: GcpOperationBinding,
): { name: string; status: string; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed GCP operation');
  const row = value as Record<string, unknown>;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${binding.project}/${scopePath(binding)}/operations/`;
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

/** Legacy checkpoints have no original target claim and are never upgraded on read. */
export async function readGcpOperationTarget(store: GcpOperationStore, binding: GcpOperationBinding) {
  valid(binding);
  const checkpoint = (await store.read(filename(binding))) as Checkpoint;
  if (
    !checkpoint ||
    ![1, 2].includes(checkpoint.schemaVersion) ||
    fingerprint(checkpoint.binding) !== fingerprint(binding) ||
    !/^operation-[a-z0-9-]+$/.test(checkpoint.operationName) ||
    !['pending', 'done', 'failed'].includes(checkpoint.state)
  )
    throw new Error('Operation checkpoint ownership differs');
  return checkpoint.schemaVersion === 2 ? targetIdentity(checkpoint.target, binding) : undefined;
}

/** Persist exact operation identity immediately after an accepted asynchronous submission. */
export async function recordGcpOperation(
  store: GcpOperationStore,
  binding: GcpOperationBinding,
  response: unknown,
  expectedTarget?: GcpOperationTarget,
): Promise<Checkpoint> {
  valid(binding);
  const operation = parseOperation(response, binding);
  let previous: Checkpoint | undefined;
  try {
    previous = (await store.read(filename(binding))) as Checkpoint | undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const expected =
    expectedTarget ?? (previous?.schemaVersion === 2 ? targetIdentity(previous.target, binding) : undefined);
  let target: GcpOperationTarget | undefined;
  if (expected) {
    const original = targetIdentity(expected, binding);
    const row = response as Record<string, unknown>;
    target = targetIdentity({ id: row.targetId, selfLink: row.targetLink }, binding);
    if (target.id !== original.id || target.selfLink !== original.selfLink)
      throw new Error('Operation target identity differs');
  }
  const checkpoint: Checkpoint = {
    schemaVersion: target ? 2 : 1,
    binding: structuredClone(binding),
    operationName: operation.name,
    state: operation.status === 'DONE' ? (operation.errors.length ? 'failed' : 'done') : 'pending',
    errorCodes: operation.errors,
    ...(target ? { target } : {}),
  };
  if (previous) {
    if (
      ![1, 2].includes(previous.schemaVersion) ||
      fingerprint(previous.binding) !== fingerprint(binding) ||
      previous.operationName !== checkpoint.operationName
    )
      throw new Error('Operation checkpoint identity cannot be overwritten');
    if (previous.schemaVersion !== checkpoint.schemaVersion)
      throw new Error('Legacy operation checkpoint cannot acquire new target evidence');
    if (previous.schemaVersion === 2 && fingerprint(targetIdentity(previous.target, binding)) !== fingerprint(target))
      throw new Error('Operation target identity changed');
    if (!['pending', 'done', 'failed'].includes(previous.state))
      throw new Error('Malformed operation checkpoint state');
    if (previous.state !== 'pending' && fingerprint(previous) !== fingerprint(checkpoint))
      throw new Error('Terminal operation evidence cannot change');
  }
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
    ![1, 2].includes(checkpoint?.schemaVersion) ||
    fingerprint(checkpoint.binding) !== fingerprint(binding) ||
    !/^operation-[a-z0-9-]+$/.test(checkpoint.operationName)
  )
    throw new Error('Operation checkpoint ownership differs');
  if (checkpoint.schemaVersion === 2) targetIdentity(checkpoint.target, binding);
  if (checkpoint.state === 'done' || checkpoint.state === 'failed') return checkpoint;
  if (checkpoint.state !== 'pending') throw new Error('Malformed operation checkpoint state');
  if (signal?.aborted) throw new Error('GCP operation observation cancelled');
  const args = [
    'compute',
    'operations',
    'describe',
    checkpoint.operationName,
    `--project=${binding.project}`,
    ...(binding.zone ? [`--zone=${binding.zone}`] : binding.region ? [`--region=${binding.region}`] : ['--global']),
    '--format=json(name,selfLink,status,error.errors.code,targetId,targetLink)',
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

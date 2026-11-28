import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from './discovery';
import { publicTerraformAddresses } from './terraform-public-ownership';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

const fail = () => new Error('Original declared GCP capture cleanup state required');
const plainString = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2048 &&
  value.trim() === value &&
  !/[\0\r\n]/.test(value);

/** Read-only candidate for the independently reviewed recovery adapter.
 * State names and IDs alone cannot prove live ownership, reader closure or
 * authorize destruction. Sensitive resource attributes never leave this view. */
export function readGcpCaptureCleanupStateCandidate(input: {
  intent: GcpCeIntent;
  createReceipt: PlanReceipt;
  bytes: Uint8Array;
  expectedStateSha256: string;
}) {
  const intent = structuredClone(input.intent);
  validateIntent(intent);
  const receipt = structuredClone(input.createReceipt);
  const expected = publicTerraformAddresses(intent);
  if (
    intent.engine !== 'terraform' ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== intent.deploymentName ||
    receipt.backendIdentity !== `local:${intent.deploymentName}` ||
    receipt.operation !== undefined ||
    receipt.noChanges !== false ||
    (receipt.actionInvocations !== undefined &&
      (!Array.isArray(receipt.actionInvocations) || receipt.actionInvocations.length !== 0)) ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    !/^[a-f0-9]{64}$/.test(receipt.configurationSha256) ||
    !/^[a-f0-9]{64}$/.test(receipt.providerLockSha256) ||
    !Array.isArray(receipt.changes) ||
    receipt.changes.length !== expected.length ||
    receipt.changes.some(
      (row) =>
        !row ||
        !expected.includes(row.address) ||
        row.type !== row.address.split('.')[0] ||
        !Array.isArray(row.actions) ||
        row.actions.length !== 1 ||
        row.actions[0] !== 'create',
    ) ||
    new Set(receipt.changes.map((row) => row.address)).size !== expected.length ||
    input.bytes.byteLength > 16 * 1024 * 1024
  )
    throw fail();
  const bytes = Buffer.from(input.bytes);
  const stateSha256 = createHash('sha256').update(bytes).digest('hex');
  if (stateSha256 !== input.expectedStateSha256 || !/^[a-f0-9]{64}$/.test(input.expectedStateSha256)) throw fail();
  const state = decodeEvidenceObject(bytes);
  if (
    state.version !== 4 ||
    !plainString(state.lineage) ||
    !Number.isSafeInteger(state.serial) ||
    (state.serial as number) < 0 ||
    !Array.isArray(state.resources)
  )
    throw fail();
  const resources: Readonly<{ address: string; id: string }>[] = [];
  const seen = new Set<string>();
  const identities = new Set<string>();
  for (const value of state.resources) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail();
    const row = value as Record<string, unknown>;
    if (row.mode === 'data') continue;
    if (
      row.mode !== 'managed' ||
      row.module !== undefined ||
      !plainString(row.type) ||
      !plainString(row.name) ||
      !Array.isArray(row.instances) ||
      row.instances.length !== 1
    )
      throw fail();
    const address = `${row.type}.${row.name}`;
    if (!expected.includes(address) || seen.has(address)) throw fail();
    const instance = row.instances[0];
    if (!instance || typeof instance !== 'object' || Array.isArray(instance)) throw fail();
    const item = instance as Record<string, unknown>;
    if (
      item.deposed !== undefined ||
      item.index_key !== undefined ||
      !item.attributes ||
      typeof item.attributes !== 'object' ||
      Array.isArray(item.attributes)
    )
      throw fail();
    const id = (item.attributes as Record<string, unknown>).id;
    if (!plainString(id) || identities.has(`${row.type}:${id}`)) throw fail();
    seen.add(address);
    identities.add(`${row.type}:${id}`);
    resources.push(Object.freeze({ address, id }));
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'gcp-capture-cleanup-state-candidate' as const,
    intentFingerprint: fingerprint(intent),
    createPlanSha256: receipt.planSha256,
    state: Object.freeze({ sha256: stateSha256, lineage: state.lineage, serial: state.serial as number }),
    resources: Object.freeze(resources.sort((a, b) => a.address.localeCompare(b.address))),
    liveOwnershipVerified: false as const,
    readerClosureVerified: false as const,
    executionAuthorized: false as const,
  });
}

import { fingerprint } from '../../../gcloud/src/ce/discovery';

export const GCP_RUNTIME_PARSER_VERSION = 'crictl-table-and-inspect/v1';
export interface GcpRuntimeContainer {
  id: string;
  name: string;
  pod: string;
  podId: string;
  attempt: number;
  state: 'Running' | 'Exited' | 'Created' | 'Unknown';
}
const ID = /^[a-f0-9]{12,64}$/;
const NAME = /^[a-z0-9][a-z0-9_.-]{0,252}$/;
const HEADER = /^CONTAINER\s+IMAGE\s+CREATED\s+STATE\s+NAME\s+ATTEMPT\s+POD ID\s+POD$/;
/** Parse the documented table strictly. Wrapped, truncated or ambiguous output requires requalification. */
export function parseGcpRuntimeListing(value: unknown): GcpRuntimeContainer[] {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) > 4 * 1024 * 1024 ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    throw new Error('Malformed runtime listing');
  const lines = value.trim().split(/\r?\n/);
  if (!HEADER.test(lines.shift() ?? '') || !lines.length || lines.length > 4096)
    throw new Error('Malformed runtime listing');
  const rows = lines.map((line): GcpRuntimeContainer => {
    const match = line
      .trim()
      .match(/^(\S+)\s+(\S+)\s+(.+?)\s+(Running|Exited|Created|Unknown)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)$/);
    if (
      !match ||
      !ID.test(match[1]) ||
      !ID.test(match[7]) ||
      !NAME.test(match[5]) ||
      !NAME.test(match[8]) ||
      !Number.isSafeInteger(Number(match[6]))
    )
      throw new Error('Malformed runtime row');
    return {
      id: match[1],
      name: match[5],
      pod: match[8],
      podId: match[7],
      attempt: Number(match[6]),
      state: match[4] as GcpRuntimeContainer['state'],
    };
  });
  if (
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.some((row, i) =>
      rows.some((other, j) => i !== j && (other.id.startsWith(row.id) || row.id.startsWith(other.id))),
    )
  )
    throw new Error('Ambiguous runtime identity');
  return rows;
}
/** Return only identity and liveness; inspection environment, arguments, mounts and annotations remain private. */
export function projectGcpRuntimeInspection(value: unknown, listed: GcpRuntimeContainer) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed runtime inspection');
  const status = (value as { status?: unknown }).status;
  if (!status || typeof status !== 'object' || Array.isArray(status)) throw new Error('Malformed runtime inspection');
  const row = status as Record<string, unknown>;
  const metadata = row.metadata as { name?: unknown; attempt?: unknown } | undefined;
  const labels = row.labels as Record<string, unknown> | undefined;
  if (
    typeof row.id !== 'string' ||
    !ID.test(row.id) ||
    !row.id.startsWith(listed.id) ||
    metadata?.name !== listed.name ||
    metadata.attempt !== listed.attempt ||
    labels?.['io.kubernetes.pod.name'] !== listed.pod ||
    !['CONTAINER_RUNNING', 'CONTAINER_EXITED', 'CONTAINER_CREATED', 'CONTAINER_UNKNOWN'].includes(String(row.state))
  )
    throw new Error('Runtime inspection identity differs');
  const state = String(row.state).replace('CONTAINER_', '').toLowerCase();
  if (state !== listed.state.toLowerCase()) throw new Error('Runtime changed during inspection');
  return {
    containerIdentitySha256: fingerprint({ id: row.id }),
    name: listed.name,
    pod: listed.pod,
    attempt: listed.attempt,
    liveness: state === 'running' ? ('running' as const) : ('not-running' as const),
  };
}
export interface GcpRuntimeListing {
  nodeName: string;
  instanceId: string;
  ownershipFingerprint: string;
  observedAt: string;
  containers: GcpRuntimeContainer[];
}
/** Fixed lower-privilege command templates. Caller-supplied command strings or extra options are impossible. */
export function gcpRuntimeCommand(
  node: { nodeName: string; instanceId: string },
  ownershipFingerprint: string,
  selection: { kind: 'list' } | { kind: 'inspect'; containerId: string; listing: GcpRuntimeListing },
  now = Date.now(),
): string[] {
  if (
    !/^[a-z][a-z0-9-]{0,62}$/.test(node.nodeName) ||
    !/^\d+$/.test(node.instanceId) ||
    !/^sha256:[a-f0-9]{64}$/.test(ownershipFingerprint)
  )
    throw new Error('Invalid original runtime node');
  if (selection.kind === 'list' && Object.keys(selection).length === 1) return ['crictl-ps-a'];
  if (selection.kind !== 'inspect' || Object.keys(selection).sort().join(',') !== 'containerId,kind,listing')
    throw new Error('Invalid runtime command selection');
  const { listing, containerId } = selection;
  const at = Date.parse(listing.observedAt);
  if (
    !ID.test(containerId) ||
    listing.nodeName !== node.nodeName ||
    listing.instanceId !== node.instanceId ||
    listing.ownershipFingerprint !== ownershipFingerprint ||
    !Number.isFinite(now) ||
    !Number.isFinite(at) ||
    at > now ||
    now - at > 300_000 ||
    !Array.isArray(listing.containers) ||
    listing.containers.filter((row) => row.id === containerId).length !== 1 ||
    listing.containers.some(
      (row) => row.id !== containerId && (row.id.startsWith(containerId) || containerId.startsWith(row.id)),
    )
  )
    throw new Error('Inspection requires this original node current runtime listing');
  return ['crictl-inspect', containerId];
}

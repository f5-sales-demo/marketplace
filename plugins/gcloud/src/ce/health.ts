import { fingerprint } from './discovery';
export interface GcpHealthObservation {
  status: 'healthy' | 'degraded' | 'unknown';
  nodeName: string;
  state?: string;
  reason?: string;
  source: 'f5xc-global-health';
  scope: 'site-global-only';
}
/** A reachable endpoint and a registered node do not establish health. */
export function parseGcpGlobalHealth(value: unknown, nodeName: string): GcpHealthObservation {
  const base = { nodeName, source: 'f5xc-global-health' as const, scope: 'site-global-only' as const };
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(nodeName)) throw new Error('Invalid expected GCP node');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ...base, status: 'unknown', reason: 'malformed-health' };
  const row = value as Record<string, unknown>;
  if (typeof row.hostname !== 'string' || (row.hostname !== nodeName && !row.hostname.startsWith(`${nodeName}.`)))
    return { ...base, status: 'unknown', reason: 'node-identity-mismatch' };
  if (
    typeof row.state !== 'string' ||
    !['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
      row.state,
    )
  )
    return { ...base, status: 'unknown', reason: 'unknown-health-state' };
  return { ...base, state: row.state, status: row.state === 'PROVISIONED' ? 'healthy' : 'degraded' };
}

/** Proposed semantics only. The pinned owning contract must declare them before healthy is possible. */
export const GCP_HA_HEALTH_SEMANTICS = {
  schemaVersion: 1,
  completeInventory: true,
  requiredServices: 'all-inventoried',
  inventoryIdentity: 'service[].(node,value)',
  componentIdentity: 'status[].(node,name)',
  healthyState: 'Ready',
  duplicateIdentity: 'reject',
  globalScope: 'exact-hostname-only',
  maximumAgeMs: 300_000,
} as const;
export interface GcpHaNodeIdentity {
  nodeName: string;
  instanceId: string;
}
export type GcpHaRead = {
  observedAt: string;
  available: boolean;
  receiptHash?: string;
  value?: unknown;
  errorClass?: 'http' | 'timeout' | 'aborted' | 'transport' | 'malformed';
  httpStatus?: number;
  durationMs?: number;
};
export interface GcpHaCollection {
  schemaVersion: 1;
  siteName: string;
  siteIdentitySha256: string;
  ownedNodes: GcpHaNodeIdentity[];
  ownershipFingerprint: string;
  contractFingerprint: string;
  startedAt: string;
  finishedAt: string;
  componentStatus: GcpHaRead;
  serviceInventory: GcpHaRead;
  globalHealth: GcpHaRead;
}

const HASH = /^sha256:[a-f0-9]{64}$/;
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
function evidenceFingerprint(value: unknown): string | undefined {
  try {
    return fingerprint(value);
  } catch {
    return undefined;
  }
}
export function qualifiedGcpHaHealthContract(value: unknown): boolean {
  const row = record(value);
  if (!row) return false;
  const { evidenceSha256, ...semantics } = row;
  return (
    typeof evidenceSha256 === 'string' &&
    HASH.test(evidenceSha256) &&
    evidenceFingerprint(semantics) === fingerprint(GCP_HA_HEALTH_SEMANTICS)
  );
}
/** Project counts and fixed reasons only; source bodies stay in the private collection channel. */
export function evaluateGcpHaHealth(
  value: unknown,
  expected: GcpHaNodeIdentity[],
  contractFingerprint: string,
  healthContract: unknown,
  now = Date.now(),
) {
  const reasons = new Set<string>();
  const collection = record(value);
  if (!qualifiedGcpHaHealthContract(healthContract)) reasons.add('health-contract-unqualified');
  if (
    expected.length !== 3 ||
    new Set(expected.map((n) => n.nodeName)).size !== 3 ||
    new Set(expected.map((n) => n.instanceId)).size !== 3 ||
    expected.some((n) => !/^[a-z][a-z0-9-]{0,62}$/.test(n.nodeName) || !/^\d+$/.test(n.instanceId))
  )
    reasons.add('invalid-original-node-set');
  if (
    collection?.schemaVersion !== 1 ||
    collection.contractFingerprint !== contractFingerprint ||
    collection.ownershipFingerprint !== fingerprint(expected) ||
    evidenceFingerprint(collection?.ownedNodes) !== fingerprint(expected) ||
    typeof collection.siteIdentitySha256 !== 'string' ||
    !HASH.test(collection.siteIdentitySha256)
  )
    reasons.add('collection-binding-mismatch');
  const start = typeof collection?.startedAt === 'string' ? Date.parse(collection.startedAt) : NaN;
  const finish = typeof collection?.finishedAt === 'string' ? Date.parse(collection.finishedAt) : NaN;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(finish) ||
    !Number.isFinite(now) ||
    start > finish ||
    finish > now ||
    now - start > 300_000
  )
    reasons.add('stale-or-malformed-observation');
  const receipts: Array<{ source: string; sha256: string; observedAt: string }> = [];
  const reads = (key: string) => {
    const read = record(collection?.[key]);
    const at = typeof read?.observedAt === 'string' ? Date.parse(read.observedAt) : NaN;
    if (!Number.isFinite(at) || at < start || at > finish) reasons.add(`${key}-observation-time-invalid`);
    if (read?.available !== true || typeof read.receiptHash !== 'string' || !HASH.test(read.receiptHash)) {
      reasons.add(`${key}-unavailable`);
      return undefined;
    }
    if (evidenceFingerprint(read.value) !== read.receiptHash) {
      reasons.add(`${key}-receipt-mismatch`);
      return undefined;
    }
    if (Number.isFinite(at) && at >= start && at <= finish)
      receipts.push({ source: key, sha256: read.receiptHash, observedAt: new Date(at).toISOString() });
    const body = record(read.value);
    if (
      !body ||
      body.next_page_token ||
      body.continue ||
      (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length))
    ) {
      reasons.add(`${key}-malformed-or-partial`);
      return undefined;
    }
    return body;
  };
  const component = reads('componentStatus'),
    inventory = reads('serviceInventory'),
    global = reads('globalHealth');
  const parseRows = (body: Record<string, unknown> | undefined, field: string, identity: string, source: string) => {
    const map = new Map<string, Map<string, Record<string, unknown>>>();
    const rows = body?.[field];
    if (!Array.isArray(rows) || !rows.length) reasons.add(`${source}-missing-rows`);
    for (const raw of Array.isArray(rows) ? rows : []) {
      const row = record(raw);
      if (!row || typeof row.node !== 'string' || !row.node || typeof row[identity] !== 'string' || !row[identity]) {
        reasons.add(`${source}-malformed-row`);
        continue;
      }
      if (!expected.some((n) => n.nodeName === row.node)) {
        reasons.add(`${source}-foreign-node`);
        continue;
      }
      const nodeRows = map.get(row.node) ?? new Map<string, Record<string, unknown>>();
      const name = row[identity] as string;
      if (nodeRows.has(name)) reasons.add(`${source}-duplicate-identity`);
      nodeRows.set(name, row);
      map.set(row.node, nodeRows);
    }
    return map;
  };
  const components = parseRows(component, 'status', 'name', 'component-status');
  const services = parseRows(inventory, 'service', 'value', 'service-inventory');
  if (global && (typeof global.hostname !== 'string' || !expected.some((n) => n.nodeName === global.hostname)))
    reasons.add('global-health-foreign-hostname');
  const nodes = expected.map((node) => {
    const nodeReasons = new Set<string>();
    const required = services.get(node.nodeName) ?? new Map();
    const statuses = components.get(node.nodeName) ?? new Map();
    if (!required.size) nodeReasons.add('missing-service-inventory');
    let covered = 0,
      unhealthy = 0;
    for (const name of required.keys()) {
      const row = statuses.get(name);
      if (!row) {
        nodeReasons.add('missing-component-coverage');
        continue;
      }
      covered++;
      if (typeof row.status !== 'string' || !row.status || typeof row.message !== 'string')
        nodeReasons.add('malformed-component-state');
      else if (row.status !== 'Ready') unhealthy++;
    }
    if ([...statuses.keys()].some((name) => !required.has(name))) nodeReasons.add('unmapped-component');
    let globalStatus: 'healthy' | 'degraded' | 'unknown' = 'unknown';
    if (global?.hostname === node.nodeName) {
      globalStatus = parseGcpGlobalHealth(global, node.nodeName).status;
      if (globalStatus === 'unknown') nodeReasons.add('malformed-global-health');
    }
    return {
      nodeName: node.nodeName,
      status: (nodeReasons.size ? 'unknown' : unhealthy || globalStatus === 'degraded' ? 'degraded' : 'healthy') as
        | 'healthy'
        | 'degraded'
        | 'unknown',
      requiredServices: required.size,
      coveredServices: covered,
      unhealthyServices: unhealthy,
      globalHealth: globalStatus,
      reasonCodes: [...nodeReasons],
    };
  });
  if (reasons.size)
    for (const node of nodes) {
      node.status = 'unknown';
      node.reasonCodes.push(...reasons);
    }
  const status: 'healthy' | 'degraded' | 'unknown' =
    nodes.some((n) => n.status === 'unknown') || reasons.size
      ? 'unknown'
      : nodes.some((n) => n.status === 'degraded')
        ? 'degraded'
        : 'healthy';
  return {
    schemaVersion: 1,
    status,
    nodes,
    reasonCodes: [...new Set([...reasons, ...nodes.flatMap((n) => n.reasonCodes)])],
    startedAt: Number.isFinite(start) ? new Date(start).toISOString() : undefined,
    finishedAt: Number.isFinite(finish) ? new Date(finish).toISOString() : undefined,
    sourceReceipts: receipts,
  };
}

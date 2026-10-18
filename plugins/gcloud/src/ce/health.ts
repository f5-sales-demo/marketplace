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

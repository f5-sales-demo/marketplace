import { fingerprint } from './discovery';
export interface GcpRestorationItem {
  selfLink: string;
  id: string;
  original: Record<string, unknown>;
  planned: Record<string, unknown>;
  originalSha256: string;
  plannedSha256: string;
}
export function captureGcpRestoration(
  selfLink: string,
  id: string,
  original: Record<string, unknown>,
  planned: Record<string, unknown>,
): GcpRestorationItem {
  if (!/^\d+$/.test(id) || !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/[a-z][a-z0-9-]+\//.test(selfLink))
    throw new Error('Exact restoration identity required');
  for (const value of [original, planned]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Restoration snapshot malformed');
    // Restrict to named brownfield networking fields; exclude metadata/bootstrap.
    if (
      Object.keys(value).some(
        (key) => !['routes', 'firewallRules', 'networkTags', 'forwardingRules', 'routerPeers'].includes(key),
      )
    )
      throw new Error('Unsupported restoration field');
  }
  return {
    selfLink,
    id,
    original: structuredClone(original),
    planned: structuredClone(planned),
    originalSha256: fingerprint(original),
    plannedSha256: fingerprint(planned),
  };
}
export function assertGcpRestorationSafe(
  item: GcpRestorationItem,
  observed: { selfLink: string; id: string; fields: Record<string, unknown> },
): void {
  if (
    item.selfLink !== observed.selfLink ||
    item.id !== observed.id ||
    fingerprint(item.original) !== item.originalSha256 ||
    fingerprint(item.planned) !== item.plannedSha256
  )
    throw new Error('Restoration identity or snapshot integrity differs');
  if (fingerprint(observed.fields) !== item.plannedSha256 && fingerprint(observed.fields) !== item.originalSha256)
    throw new Error('Brownfield state changed outside deployment; restoration requires replan');
}
export function assertGcpRestored(item: GcpRestorationItem, observed: Record<string, unknown>): void {
  if (fingerprint(item.original) !== item.originalSha256 || fingerprint(observed) !== item.originalSha256)
    throw new Error('Brownfield restoration mismatch');
}

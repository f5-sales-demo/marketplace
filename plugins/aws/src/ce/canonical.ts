import { createHash, timingSafeEqual } from 'node:crypto';
import type { AwsCeObservation, AwsCeResourceObservation } from './types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalStringify(value));
}

export function safeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

/** AWS runtime transitions are health evidence; they do not change ownership or desired configuration. */
export function resourceConfiguration(resources: AwsCeResourceObservation[]): unknown[] {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value))
      return value.map(normalize).sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b)));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !['State', 'Status', 'StateTransitionReason', 'TargetHealth'].includes(key))
          .map(([key, item]) => [key, normalize(item)]),
      );
    return value;
  };
  return resources
    .map((resource) => ({ ...resource, state: normalize(resource.state) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function fingerprintOwnedResources(resources: AwsCeResourceObservation[]): string {
  return canonicalSha256(resourceConfiguration(resources));
}

function matchesBgpRuntimeVariants<T>(expected: string, value: T, fingerprint: (candidate: T) => string): boolean {
  if (safeHexEqual(expected, fingerprint(value))) return true;
  const candidate = structuredClone(value);
  const statuses: Array<{ object: Record<string, unknown>; key: string }> = [];
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current)) {
      if (key === 'BgpStatus') {
        if (!['up', 'down'].includes(String(item))) return;
        statuses.push({ object: current as Record<string, unknown>, key });
      } else visit(item);
    }
  };
  visit(candidate);
  if (!statuses.length || statuses.length > 16) return false;
  for (let mask = 0; mask < 2 ** statuses.length; mask++) {
    statuses.forEach((status, index) => {
      status.object[status.key] = mask & (2 ** index) ? 'up' : 'down';
    });
    if (safeHexEqual(expected, fingerprint(candidate))) return true;
  }
  return false;
}

export function matchesOwnedResourceFingerprint(expected: string, resources: AwsCeResourceObservation[]): boolean {
  return matchesBgpRuntimeVariants(expected, resources, fingerprintOwnedResources);
}

export function fingerprintObservation(observation: AwsCeObservation, brownfieldIds: string[]): string {
  const allowlist = new Set(brownfieldIds);
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    identity: observation.identity,
    agreement: observation.agreement,
    // Allocation counts change during this plan. Discovery still recalculates eligibility
    // from remaining capacity and exact owned EIPs; quota limits remain immutable inputs.
    regions: observation.regions.map(({ elasticIpCapacity, ...region }) => ({
      ...region,
      ...(elasticIpCapacity ? { elasticIpCapacity: { limit: elasticIpCapacity.limit } } : {}),
    })),
    resources: resourceConfiguration(observation.resources.filter((resource) => allowlist.has(resource.id))),
    // The current plan is added to this authorization allowlist at apply time.
    // Actual resource ownership remains covered by the selected resource snapshots.
    research: observation.research,
    f5Capabilities: observation.f5Capabilities,
    f5CapabilitiesSha256: observation.f5CapabilitiesSha256,
  });
}

export function matchesObservationFingerprint(
  expected: string,
  observation: AwsCeObservation,
  resourceIds: string[],
): boolean {
  const allowlist = new Set(resourceIds);
  const scoped = {
    ...observation,
    resources: observation.resources.filter((resource) => allowlist.has(resource.id)),
  };
  return matchesBgpRuntimeVariants(expected, scoped, (candidate) => fingerprintObservation(candidate, resourceIds));
}

export function normalizeResearchDocument(body: string): string {
  return `${body
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .trimEnd()}\n`;
}

import { createHash, timingSafeEqual } from 'node:crypto';
import type { AzureCeObservation } from './types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) sorted[key] = canonicalize(entry);
    }
    return sorted;
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

export function fingerprintObservation(observation: AzureCeObservation, brownfieldResourceIds: string[]): string {
  const allowlist = new Set(brownfieldResourceIds.map((id) => id.toLowerCase()));
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    subscription: observation.subscription,
    image: observation.image,
    research: observation.research,
    regions: observation.regions,
    resources: observation.resources.filter((resource) => allowlist.has(resource.id.toLowerCase())),
  });
}

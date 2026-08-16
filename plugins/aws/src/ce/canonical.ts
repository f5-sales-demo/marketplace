import { createHash, timingSafeEqual } from 'node:crypto';
import type { AwsCeObservation } from './types';

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

export function fingerprintObservation(observation: AwsCeObservation, brownfieldIds: string[]): string {
  const allowlist = new Set(brownfieldIds);
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    identity: observation.identity,
    agreement: observation.agreement,
    regions: observation.regions,
    resources: observation.resources.filter((resource) => allowlist.has(resource.id)),
    ownershipPlanSha256s: observation.ownershipPlanSha256s,
    research: observation.research,
    f5Capabilities: observation.f5Capabilities,
    f5CapabilitiesSha256: observation.f5CapabilitiesSha256,
  });
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

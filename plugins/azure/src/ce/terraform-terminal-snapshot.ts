import { types as utilTypes } from 'node:util';
import { canonicalSha256, canonicalStringify } from './canonical';

const snapshots = new WeakMap<object, { wrapped: string; raw: string }>();
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure terminal snapshot: ${message}`);
}

/** Seal an owning lifecycle's independent JSON copy. This is immutable value
 * equality only; it supplies no native retirement or external absence authority.
 * Ordinary mutable callers retain the original full cryptographic comparison.
 */
export function sealAzureTerraformTerminalSnapshot(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'terminal object required');
  const inspect = (entry: unknown, ancestry: Set<object>): void => {
    if (entry === undefined || entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
    if (typeof entry === 'number') {
      require(Number.isFinite(entry), 'finite JSON number required');
      return;
    }
    require(typeof entry === 'object' && !utilTypes.isProxy(entry), 'ordinary JSON data required');
    require(!ancestry.has(entry), 'cyclic terminal value');
    const prototype = Object.getPrototypeOf(entry);
    require(Array.isArray(entry)
      ? prototype === Array.prototype
      : prototype === Object.prototype || prototype === null, 'ordinary JSON prototype required');
    require(Object.getOwnPropertySymbols(entry).length === 0 && !('toJSON' in entry), 'custom JSON behavior forbidden');
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    require(!Object.hasOwn(descriptors, '__proto__'), 'prototype field forbidden');
    ancestry.add(entry);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      require(Object.hasOwn(descriptor, 'value'), 'accessor terminal field forbidden');
      if (Array.isArray(entry))
        require(key === 'length' || /^(0|[1-9][0-9]*)$/.test(key), 'custom array field forbidden');
      if (descriptor.enumerable) inspect(descriptor.value, ancestry);
    }
    ancestry.delete(entry);
  };
  inspect(value, new Set());
  const digest = canonicalSha256({ value });
  const rawDigest = canonicalSha256(value);
  const snapshot = JSON.parse(canonicalStringify(value)) as Record<string, unknown>;
  const freeze = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object') return;
    for (const child of Object.values(entry)) freeze(child);
    Object.freeze(entry);
  };
  freeze(snapshot);
  require(canonicalSha256({ value: snapshot }) === digest &&
    canonicalSha256(snapshot) === rawDigest, 'sealed digest differs');
  snapshots.set(snapshot, { wrapped: digest, raw: rawDigest });
  return snapshot;
}

export function matchesAzureTerraformTerminalSnapshot(
  value: unknown,
  expectedSha256: string,
  mode: 'wrapped' | 'raw' = 'wrapped',
): boolean {
  const sealed = value && typeof value === 'object' ? snapshots.get(value) : undefined;
  return sealed === undefined
    ? canonicalSha256(mode === 'raw' ? value : { value }) === expectedSha256
    : sealed[mode] === expectedSha256;
}

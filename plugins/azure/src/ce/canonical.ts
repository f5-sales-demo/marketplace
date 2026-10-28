import { createHash, timingSafeEqual } from 'node:crypto';
import { types as utilTypes } from 'node:util';
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

/**
 * Project discovery onto only the immutable deployment choice and its safety evidence.
 * Discovery may narrow the region and VM catalogs during apply, but it must not narrow
 * or change any fact that authorized the selected region, size, image, or brownfield use.
 */
export function fingerprintDeploymentObservation(
  observation: AzureCeObservation,
  brownfieldResourceIds: string[],
  selectedRegion: string,
  selectedVmSize: string,
): string {
  const region = observation.regions.find((candidate) => candidate.name.toLowerCase() === selectedRegion.toLowerCase());
  if (!region) throw new Error(`Selected Azure CE deployment region was not observed: ${selectedRegion}`);
  const vm = region.vmSizes.find((candidate) => candidate.name.toLowerCase() === selectedVmSize.toLowerCase());
  if (!vm) throw new Error(`Selected Azure CE deployment VM size was not observed: ${selectedVmSize}`);

  const allowlist = new Set(brownfieldResourceIds.map((id) => id.toLowerCase()));
  const resources = observation.resources
    .filter((resource) => allowlist.has(resource.id.toLowerCase()))
    .sort(
      (left, right) =>
        left.id.toLowerCase().localeCompare(right.id.toLowerCase()) ||
        canonicalStringify(left).localeCompare(canonicalStringify(right)),
    );
  const research = {
    ...observation.research,
    commands: [...observation.research.commands].sort(),
    officialSources: [...observation.research.officialSources].sort(),
    sourceReceipts: [...observation.research.sourceReceipts].sort(
      (left, right) => left.url.localeCompare(right.url) || left.normalizedSha256.localeCompare(right.normalizedSha256),
    ),
  };

  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    subscription: observation.subscription,
    image: observation.image,
    research,
    resources,
    region: {
      name: region.name,
      eligible: region.eligible,
      reasons: [...region.reasons].sort(),
      zones: [...region.zones].sort(),
      routeServerSupported: region.routeServerSupported,
      quotaAvailable: region.quotaAvailable,
      policyAllowed: region.policyAllowed,
      vm: {
        name: vm.name,
        maxNics: vm.maxNics,
        vCpus: vm.vCpus,
        memoryGb: vm.memoryGb,
        restricted: vm.restricted,
        zones: [...vm.zones].sort(),
      },
    },
  });
}

/** Compare fresh ordinary JSON values without allocating canonical strings.
 * Exotic values retain canonicalSha256 semantics, including its errors.
 * This is equality only; cryptographic receipt and witness hashes are unchanged.
 */
export function canonicalEqual(left: unknown, right: unknown): boolean {
  const ordinary = (value: unknown, ancestry: Set<object>): boolean => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object' || utilTypes.isProxy(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      return false;
    if (ancestry.has(value) || 'toJSON' in value || Object.getOwnPropertySymbols(value).length) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.hasOwn(descriptors, '__proto__')) return false;
    for (const descriptor of Object.values(descriptors)) {
      if (!Object.hasOwn(descriptor, 'value')) return false;
    }
    ancestry.add(value);
    let valid = true;
    if (Array.isArray(value)) {
      // map overrides and inherited array entries change the legacy serializer.
      for (const key of Object.keys(descriptors)) {
        if (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)) valid = false;
      }
      for (let index = 0; index < value.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor && index in value) valid = false;
        if (descriptor?.value !== undefined && !ordinary(descriptor.value, ancestry)) valid = false;
      }
    } else {
      for (const descriptor of Object.values(descriptors)) {
        if (descriptor.enumerable && descriptor.value !== undefined && !ordinary(descriptor.value, ancestry))
          valid = false;
      }
    }
    ancestry.delete(value);
    return valid;
  };
  // Inspect both complete operands before any mismatch can select the fast path.
  const leftOrdinary = ordinary(left, new Set());
  const rightOrdinary = ordinary(right, new Set());
  if (!leftOrdinary || !rightOrdinary) return canonicalSha256(left) === canonicalSha256(right);
  const equal = (a: unknown, b: unknown): boolean => {
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let index = 0; index < a.length; index++) {
        if (!equal(a[index] === undefined ? null : a[index], b[index] === undefined ? null : b[index])) return false;
      }
      return true;
    }
    if (Array.isArray(b)) return false;
    const aObject = a as Record<string, unknown>;
    const bObject = b as Record<string, unknown>;
    let aCount = 0;
    for (const key of Object.keys(aObject)) {
      if (aObject[key] === undefined) continue;
      aCount++;
      if (!Object.hasOwn(bObject, key) || bObject[key] === undefined || !equal(aObject[key], bObject[key]))
        return false;
    }
    let bCount = 0;
    for (const key of Object.keys(bObject)) if (bObject[key] !== undefined) bCount++;
    return aCount === bCount;
  };
  return equal(left, right);
}

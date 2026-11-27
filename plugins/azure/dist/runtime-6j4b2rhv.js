// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/azure/src/ce/canonical.ts
import { createHash, timingSafeEqual } from 'node:crypto';
import { types as utilTypes } from 'node:util';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry !== undefined) sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}
function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}
function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function canonicalSha256(value) {
  return sha256Hex(canonicalStringify(value));
}
function canonicalSnapshot(value) {
  const serialized = (input) => {
    const text = canonicalStringify(input);
    if (typeof text !== 'string') throw new TypeError('Canonical value is not serializable');
    return text;
  };
  const expected = serialized(value);
  return (current) => serialized(current) === expected;
}
function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function fingerprintObservation(observation, brownfieldResourceIds) {
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
function fingerprintDeploymentObservation(observation, brownfieldResourceIds, selectedRegion, selectedVmSize) {
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
function canonicalEqual(left, right) {
  const ordinary = (value, ancestry) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object' || utilTypes.isProxy(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      return false;
    if (ancestry.has(value) || 'toJSON' in value) return false;
    const array = Array.isArray(value);
    const descriptors = [];
    let arrayDescriptors;
    if (array) {
      if (Object.getOwnPropertySymbols(value).length) return false;
      arrayDescriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.hasOwn(arrayDescriptors, '__proto__')) return false;
      for (const descriptor of Object.values(arrayDescriptors)) {
        if (!Object.hasOwn(descriptor, 'value')) return false;
      }
    } else {
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol' || key === '__proto__') return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
        descriptors.push(descriptor);
      }
    }
    ancestry.add(value);
    let valid = true;
    if (array) {
      for (const key of Object.keys(arrayDescriptors)) {
        if (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)) valid = false;
      }
      for (let index = 0; index < value.length; index++) {
        const descriptor = arrayDescriptors[String(index)];
        if (!descriptor && index in value) valid = false;
        if (descriptor?.value !== undefined && !ordinary(descriptor.value, ancestry)) valid = false;
      }
    } else {
      for (const descriptor of descriptors) {
        if (descriptor.enumerable && descriptor.value !== undefined && !ordinary(descriptor.value, ancestry))
          valid = false;
      }
    }
    ancestry.delete(value);
    return valid;
  };
  const leftOrdinary = ordinary(left, new Set());
  const rightOrdinary = ordinary(right, new Set());
  if (!leftOrdinary || !rightOrdinary) return canonicalSha256(left) === canonicalSha256(right);
  const equal = (a, b) => {
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let index = 0; index < a.length; index++) {
        if (!equal(a[index] === undefined ? null : a[index], b[index] === undefined ? null : b[index])) return false;
      }
      return true;
    }
    if (Array.isArray(b)) return false;
    const aObject = a;
    const bObject = b;
    let leftPropertyCount = 0;
    for (const key of Object.keys(aObject)) {
      if (aObject[key] === undefined) continue;
      leftPropertyCount++;
      if (!Object.hasOwn(bObject, key) || bObject[key] === undefined || !equal(aObject[key], bObject[key]))
        return false;
    }
    let rightPropertyCount = 0;
    for (const key of Object.keys(bObject)) if (bObject[key] !== undefined) rightPropertyCount++;
    return leftPropertyCount === rightPropertyCount;
  };
  return equal(left, right);
}

export {
  canonicalEqual,
  canonicalSha256,
  canonicalSnapshot,
  canonicalStringify,
  fingerprintDeploymentObservation,
  fingerprintObservation,
  safeHexEqual,
  sha256Hex,
};

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

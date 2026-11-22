// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/aws/src/ce/canonical.ts
import { createHash, timingSafeEqual } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalize(value[key])]),
    );
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
function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function resourceConfiguration(resources) {
  const normalize = (value) => {
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
function fingerprintOwnedResources(resources) {
  return canonicalSha256(resourceConfiguration(resources));
}
function matchesBgpRuntimeVariants(expected, value, fingerprint) {
  if (safeHexEqual(expected, fingerprint(value))) return true;
  const candidate = structuredClone(value);
  const statuses = [];
  const visit = (current) => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current)) {
      if (key === 'BgpStatus') {
        if (!['up', 'down'].includes(String(item))) return;
        statuses.push({ object: current, key });
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
function matchesOwnedResourceFingerprint(expected, resources) {
  return matchesBgpRuntimeVariants(expected, resources, fingerprintOwnedResources);
}
function awsCeObservationRegion(plan) {
  if (
    plan.observationScope?.kind !== 'execution-region-v1' ||
    !plan.observationScope.region ||
    plan.observationScope.region !== plan.region ||
    plan.region !== plan.intent.region
  )
    throw new Error('AWS CE observation execution-region scope is invalid');
  return plan.observationScope.region;
}
function fingerprintObservation(observation, brownfieldIds, executionRegion) {
  const allowlist = new Set(brownfieldIds);
  const regions =
    executionRegion === undefined
      ? observation.regions
      : observation.regions
          .filter((region) => region.name === executionRegion)
          .map(({ rank: _rank, ...region }) => region);
  if (executionRegion !== undefined && regions.length !== 1)
    throw new Error('AWS CE observation execution region is missing or ambiguous');
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    identity: { ...observation.identity, awsProfile: observation.identity.awsProfile ?? 'default' },
    agreement: observation.agreement,
    regions: regions.map(({ elasticIpCapacity, vcpuCapacity, vpcCapacity, internetGatewayCapacity, ...region }) => ({
      ...region,
      ...(elasticIpCapacity
        ? {
            elasticIpCapacity: {
              limit: elasticIpCapacity.limit,
              foreignAllocated: elasticIpCapacity.allocated - elasticIpCapacity.reusableOwned,
            },
          }
        : {}),
      ...Object.fromEntries(
        Object.entries({ vcpuCapacity, vpcCapacity, internetGatewayCapacity }).flatMap(([key, value]) =>
          value === undefined ? [] : [[key, { limit: value.limit, foreignUsed: value.used - value.reusableOwned }]],
        ),
      ),
    })),
    resources: resourceConfiguration(observation.resources.filter((resource) => allowlist.has(resource.id))),
    ...(observation.bootstrapKeyPairs === undefined ? {} : { bootstrapKeyPairs: observation.bootstrapKeyPairs }),
    research: observation.research,
    f5Capabilities: observation.f5Capabilities,
    f5CapabilitiesSha256: observation.f5CapabilitiesSha256,
  });
}
function matchesObservationFingerprint(expected, observation, resourceIds, executionRegion) {
  const allowlist = new Set(resourceIds);
  const scoped = {
    ...observation,
    resources: observation.resources.filter((resource) => allowlist.has(resource.id)),
  };
  return matchesBgpRuntimeVariants(expected, scoped, (candidate) =>
    fingerprintObservation(candidate, resourceIds, executionRegion),
  );
}
function normalizeResearchDocument(body) {
  return `${body
    .replace(/^\uFEFF/, '')
    .replace(
      /\r\n?/g,
      `
`,
    )
    .normalize('NFC')
    .split(`
`)
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join(`
`)
    .trimEnd()}
`;
}

export {
  awsCeObservationRegion,
  canonicalSha256,
  fingerprintObservation,
  fingerprintOwnedResources,
  matchesObservationFingerprint,
  matchesOwnedResourceFingerprint,
  normalizeResearchDocument,
  resourceConfiguration,
  safeHexEqual,
  sha256Hex,
};

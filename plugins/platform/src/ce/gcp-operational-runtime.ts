import {
  matchesGcpOperationalPod,
  type OperationalBinding,
  type OperationalProfile,
  qualifiedOperationalProfile,
} from '../../../gcloud/src/ce/operational-health';
import type { createGcpOperationalCommandPort } from './gcp-operational-command';
import { type GcpRuntimeListing, parseGcpRuntimeListing, projectGcpRuntimeInspection } from './gcp-runtime-diagnostics';

/** Resolve omitted namespaces only from fixed inspections of this original node's fresh listing. */
export async function collectGcpOperationalRuntimeListing(
  commands: ReturnType<typeof createGcpOperationalCommandPort>,
  node: OperationalBinding['nodes'][number],
  ownershipFingerprint: string,
  signal?: AbortSignal,
): Promise<GcpRuntimeListing> {
  signal?.throwIfAborted();
  node = structuredClone(node);
  const observedAt = new Date().toISOString();
  const containers = parseGcpRuntimeListing(await commands.execute(node, { kind: 'list' }, signal));
  const listing: GcpRuntimeListing = {
    nodeName: node.nodeName,
    instanceId: node.instanceId,
    ownershipFingerprint,
    observedAt,
    containers,
  };
  const resolved = [];
  for (const container of containers) {
    signal?.throwIfAborted();
    if (container.namespace !== undefined) {
      resolved.push(container);
      continue;
    }
    const output = await commands.execute(node, { kind: 'inspect', containerId: container.id, listing }, signal);
    signal?.throwIfAborted();
    const projection = projectGcpRuntimeInspection(JSON.parse(output), container);
    if (projection.namespace === undefined) throw new Error('gcp_runtime_listing_namespace_mapping_unavailable');
    resolved.push({ ...container, namespace: projection.namespace });
  }
  signal?.throwIfAborted();
  return { ...listing, containers: resolved };
}

/** Collect only frozen mappings from this original node's current listing. Ambiguous joins cannot be inspected. */
async function collectRuntimeEvidence(
  commands: ReturnType<typeof createGcpOperationalCommandPort>,
  node: OperationalBinding['nodes'][number],
  ownershipFingerprint: string,
  profile: OperationalProfile,
  pinnedFingerprint: string,
  signal?: AbortSignal,
) {
  profile = structuredClone(profile);
  node = structuredClone(node);
  if (!qualifiedOperationalProfile(profile, pinnedFingerprint) || !profile.roles[node.role])
    throw new Error('Frozen runtime placement required');
  const listing = await collectGcpOperationalRuntimeListing(commands, node, ownershipFingerprint, signal);
  const { containers } = listing;
  const mappings = profile.roles[node.role].containers;
  const selected = mappings
    .map((mapping) => {
      const matching = containers.filter(
        (container) =>
          container.namespace === mapping.namespace &&
          container.name === mapping.name &&
          matchesGcpOperationalPod(container.pod, mapping),
      );
      const running = matching.filter((container) => container.state === 'Running');
      const matches = running.length ? running : matching;
      return matches.length === 1 ? matches[0] : undefined;
    })
    .filter((container): container is NonNullable<typeof container> => !!container);
  if (new Set(selected.map((container) => container.id)).size !== selected.length)
    throw new Error('Required runtime mappings overlap');
  const projections: ReturnType<typeof projectGcpRuntimeInspection>[] = [];
  for (const container of selected) {
    signal?.throwIfAborted();
    try {
      const output = await commands.execute(node, { kind: 'inspect', containerId: container.id, listing }, signal);
      projections.push(projectGcpRuntimeInspection(JSON.parse(output), container));
    } catch {
      // The transport already retained the failed read privately. A missing projection remains unknown
      // while independently verified failures from other mappings survive.
      signal?.throwIfAborted();
    }
  }
  const placementDrift = Object.values(profile.roles)
    .flatMap((role) => role.containers)
    .some(
      (mapping) =>
        containers.some(
          (container) =>
            container.state === 'Running' &&
            container.name === mapping.name &&
            container.namespace === mapping.namespace &&
            matchesGcpOperationalPod(container.pod, mapping),
        ) &&
        !mappings.some(
          (declared) =>
            declared.service === mapping.service &&
            declared.name === mapping.name &&
            declared.namespace === mapping.namespace &&
            declared.podPrefix === mapping.podPrefix &&
            declared.podShape === mapping.podShape,
        ),
    );
  return {
    schemaVersion: 2,
    containers: projections,
    placementState: placementDrift ? ('drift' as const) : ('unchanged' as const),
  };
}

export async function collectGcpOperationalRuntime(...args: Parameters<typeof collectRuntimeEvidence>) {
  return (await collectRuntimeEvidence(...args)).containers;
}
export const collectGcpOperationalRuntimeEvidence = collectRuntimeEvidence;

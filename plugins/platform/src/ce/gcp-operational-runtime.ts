import {
  matchesGcpOperationalPod,
  type OperationalBinding,
  type OperationalProfile,
  qualifiedOperationalProfile,
} from '../../../gcloud/src/ce/operational-health';
import type { createGcpOperationalCommandPort } from './gcp-operational-command';
import { parseGcpRuntimeListing, projectGcpRuntimeInspection } from './gcp-runtime-diagnostics';

/** Collect only frozen mappings from this original node's current listing. Ambiguous joins cannot be inspected. */
export async function collectGcpOperationalRuntime(
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
  const containers = parseGcpRuntimeListing(await commands.execute(node, { kind: 'list' }, signal));
  const listing = {
    nodeName: node.nodeName,
    instanceId: node.instanceId,
    ownershipFingerprint,
    observedAt: new Date().toISOString(),
    containers,
  };
  const mappings = profile.roles[node.role].containers;
  const selected = mappings.map((mapping) => {
    const matching = containers.filter(
      (container) =>
        container.namespace === mapping.namespace &&
        container.name === mapping.name &&
        matchesGcpOperationalPod(container.pod, mapping),
    );
    const running = matching.filter((container) => container.state === 'Running');
    const matches = running.length ? running : matching;
    if (matches.length !== 1) throw new Error('Required runtime coverage missing or ambiguous');
    return matches[0];
  });
  if (new Set(selected.map((container) => container.id)).size !== selected.length)
    throw new Error('Required runtime mappings overlap');
  const projections: ReturnType<typeof projectGcpRuntimeInspection>[] = [];
  for (const container of selected) {
    signal?.throwIfAborted();
    const output = await commands.execute(node, { kind: 'inspect', containerId: container.id, listing }, signal);
    let value: unknown;
    try {
      value = JSON.parse(output);
    } catch {
      throw new Error('Required runtime inspection malformed');
    }
    projections.push(projectGcpRuntimeInspection(value, container));
  }
  return projections;
}

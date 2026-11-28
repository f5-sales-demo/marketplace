import {
  hasGcpOperationalPlacementCoverage,
  matchesGcpOperationalPod,
  type OperationalProfile,
  qualifiedOperationalProfile,
} from '../../../gcloud/src/ce/operational-health';
import type { GcpRuntimeContainer } from './gcp-runtime-diagnostics';

export const GCP_OPERATIONAL_PLACEMENT_PARSER_VERSION = 'frozen-workload-placement/v1';
export interface GcpOperationalPlacementObservation {
  nodeName: string;
  runtimeRole: string;
  components: Array<{ name: string; state: string }>;
  containers: Array<Pick<GcpRuntimeContainer, 'id' | 'name' | 'namespace' | 'pod' | 'state'>>;
}
/** Establish once from complete evidence; persist the result with original ownership before collecting health. */
export function resolveGcpOperationalPlacement(
  profile: OperationalProfile,
  pinnedFingerprint: string,
  originals: string[],
  observations: GcpOperationalPlacementObservation[],
): Record<string, string> {
  if (!qualifiedOperationalProfile(profile, pinnedFingerprint) || !profile.placementCounts)
    throw new Error('Frozen placement contract required');
  if (
    originals.length !== 3 ||
    new Set(originals).size !== 3 ||
    observations.length !== 3 ||
    new Set(observations.map((node) => node.nodeName)).size !== 3 ||
    observations.some((node) => !originals.includes(node.nodeName))
  )
    throw new Error('Exact original placement nodes required');
  const selected: Record<string, string> = {};
  for (const node of observations) {
    if (
      !Array.isArray(node.components) ||
      !Array.isArray(node.containers) ||
      node.components.some((row) => !row || typeof row.name !== 'string' || typeof row.state !== 'string') ||
      new Set(node.components.map((row) => row.name)).size !== node.components.length ||
      node.containers.some(
        (row) =>
          !row ||
          !/^[a-f0-9]{12,64}$/.test(row.id) ||
          typeof row.pod !== 'string' ||
          typeof row.name !== 'string' ||
          typeof row.namespace !== 'string' ||
          !['Running', 'Exited', 'Created', 'Unknown'].includes(row.state),
      ) ||
      new Set(node.containers.map((row) => row.id)).size !== node.containers.length
    )
      throw new Error('Malformed placement evidence');
    const matches = Object.entries(profile.roles).filter(([, role]) => {
      if (
        role.runtimeRole !== node.runtimeRole ||
        role.components.length !== node.components.length ||
        !role.components.every((name) => node.components.some((row) => row.name === name))
      )
        return false;
      const selectedIds: string[] = [];
      for (const mapping of role.containers) {
        const candidates = node.containers.filter(
          (row) =>
            row.name === mapping.name &&
            row.namespace === mapping.namespace &&
            matchesGcpOperationalPod(row.pod, mapping),
        );
        const running = candidates.filter((row) => row.state === 'Running');
        const selected = running.length ? running : candidates;
        if (selected.length !== 1) return false;
        selectedIds.push(selected[0].id);
      }
      return new Set(selectedIds).size === selectedIds.length;
    });
    // Superset roles (for example metrics placement) must also reject unassigned qualified containers.
    const exact = matches.filter(([, role]) =>
      Object.values(profile.roles)
        .flatMap((r) => r.containers)
        .every(
          (mapping) =>
            !node.containers.some(
              (row) =>
                row.name === mapping.name &&
                row.namespace === mapping.namespace &&
                row.state === 'Running' &&
                matchesGcpOperationalPod(row.pod, mapping),
            ) ||
            role.containers.some(
              (c) =>
                c.service === mapping.service &&
                c.name === mapping.name &&
                c.namespace === mapping.namespace &&
                c.podPrefix === mapping.podPrefix &&
                c.podShape === mapping.podShape,
            ),
        ),
    );
    if (exact.length !== 1) throw new Error('Placement missing, changed or ambiguous; requalification required');
    selected[node.nodeName] = exact[0][0];
  }
  if (
    !hasGcpOperationalPlacementCoverage(
      profile,
      originals.map((node) => selected[node]),
    )
  )
    throw new Error('Required cluster placement counts differ');
  return selected;
}

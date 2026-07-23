import type { GcloudBucket, GcloudConfig, GcloudInstance, GcloudProject } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the last `/`-separated segment of a value. gcloud reports resources
 * such as zones and machine types as fully-qualified selfLink URLs
 * (e.g. `.../zones/us-central1-a`); this reduces them to their short name.
 * Returns the input unchanged when it contains no `/`.
 */
export function basename(url: string): string {
  const idx = url.lastIndexOf('/');
  return idx === -1 ? url : url.slice(idx + 1);
}

// ---------------------------------------------------------------------------
// Normalizers (raw gcloud JSON -> typed structs)
// ---------------------------------------------------------------------------

export function normalizeConfig(raw: Record<string, unknown>): GcloudConfig {
  const core = (raw.core as Record<string, unknown>) ?? {};
  const compute = (raw.compute as Record<string, unknown>) ?? {};
  return {
    project: String(core.project ?? ''),
    account: String(core.account ?? ''),
    region: String(compute.region ?? ''),
    zone: String(compute.zone ?? ''),
  };
}

export function normalizeProject(raw: Record<string, unknown>): GcloudProject {
  return {
    projectId: String(raw.projectId ?? ''),
    name: String(raw.name ?? ''),
    projectNumber: String(raw.projectNumber ?? ''),
    lifecycleState: String(raw.lifecycleState ?? ''),
  };
}

export function normalizeInstance(raw: Record<string, unknown>): GcloudInstance {
  const interfaces = (raw.networkInterfaces as Array<Record<string, unknown>>) ?? [];
  const primary = interfaces[0] ?? {};
  const accessConfigs = (primary.accessConfigs as Array<Record<string, unknown>>) ?? [];
  const primaryAccess = accessConfigs[0] ?? {};
  return {
    name: String(raw.name ?? ''),
    zone: basename(String(raw.zone ?? '')),
    machineType: basename(String(raw.machineType ?? '')),
    status: String(raw.status ?? ''),
    internalIp: String(primary.networkIP ?? ''),
    externalIp: String(primaryAccess.natIP ?? ''),
  };
}

export function normalizeBucket(raw: Record<string, unknown>): GcloudBucket {
  return {
    name: String(raw.name ?? ''),
    location: String(raw.location ?? ''),
    storageClass: String(raw.storageClass ?? raw.storage_class ?? ''),
    created: String(raw.timeCreated ?? raw.creation_time ?? ''),
  };
}

// ---------------------------------------------------------------------------
// List normalizers (CLI wraps items in a JSON array)
// ---------------------------------------------------------------------------

export function normalizeProjects(raw: unknown[]): GcloudProject[] {
  return raw.map((item) => normalizeProject(item as Record<string, unknown>));
}

export function normalizeInstances(raw: unknown[]): GcloudInstance[] {
  return raw.map((item) => normalizeInstance(item as Record<string, unknown>));
}

export function normalizeBuckets(raw: unknown[]): GcloudBucket[] {
  return raw.map((item) => normalizeBucket(item as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Formatters (typed structs -> markdown)
// ---------------------------------------------------------------------------

export function formatConfigDetail(config: GcloudConfig): string {
  return [
    `**Project:** ${config.project || '-'}`,
    `**Account:** ${config.account || '-'}`,
    `**Region:** ${config.region || '-'}`,
    `**Zone:** ${config.zone || '-'}`,
  ].join('\n');
}

export function formatProjectTable(projects: GcloudProject[]): string {
  if (projects.length === 0) return 'No projects found.';
  const header = '| Project ID | Name | Number | State |';
  const sep = '|------------|------|--------|-------|';
  const rows = projects.map(
    (p) => `| ${p.projectId} | ${p.name || '-'} | ${p.projectNumber || '-'} | ${p.lifecycleState || '-'} |`,
  );
  return [header, sep, ...rows].join('\n');
}

export function formatInstanceTable(instances: GcloudInstance[]): string {
  if (instances.length === 0) return 'No instances found.';
  const header = '| Name | Zone | Machine Type | Status | Internal IP | External IP |';
  const sep = '|------|------|--------------|--------|-------------|-------------|';
  const rows = instances.map(
    (i) =>
      `| ${i.name} | ${i.zone} | ${i.machineType} | ${i.status} | ${i.internalIp || '-'} | ${i.externalIp || '-'} |`,
  );
  return [header, sep, ...rows].join('\n');
}

export function formatBucketTable(buckets: GcloudBucket[]): string {
  if (buckets.length === 0) return 'No buckets found.';
  const header = '| Name | Location | Storage Class | Created |';
  const sep = '|------|----------|---------------|---------|';
  const rows = buckets.map(
    (b) => `| ${b.name} | ${b.location || '-'} | ${b.storageClass || '-'} | ${b.created || '-'} |`,
  );
  return [header, sep, ...rows].join('\n');
}

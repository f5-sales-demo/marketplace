import { initialSoftwareSettings } from './initial-versions';
import type { SiteBinding } from './runtime';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade evidence');
  return value as Json;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing upgrade evidence');
  return value;
}
/** Select the authoritative publisher, excluding explicitly stale observations. */
function version(
  rows: unknown[],
  key: string,
  statusId: string,
  installed: string[],
  completedDeploymentFallback = false,
) {
  const observations = [];
  const seen = new Set<string>();
  for (const value of rows) {
    const row = object(value);
    if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) continue;
    const metadata = row.metadata as Json;
    // Physical-site status rows share one generated schema and can therefore
    // contain empty/default version blocks even when another publisher owns
    // the row. Select the authoritative publisher identity before inspecting
    // its version block.
    if (metadata.status_id !== statusId) continue;
    if (metadata.creator_class !== 'maurice' || metadata.publish !== 'STATUS_PUBLISH')
      throw new Error('Upgrade status publisher differs');
    if (metadata.vtrp_stale === true) continue;
    if (metadata.vtrp_stale !== false) throw new Error('Upgrade publisher freshness is unknown');
    const uid = text(metadata.uid);
    if (seen.has(uid)) throw new Error('Duplicate upgrade publisher');
    seen.add(uid);
    const block = object(row[key]);
    const deployment = object(block.deployment_state);
    let current: unknown = block;
    for (const part of installed) current = object(current)[part];
    const phase = text(deployment.phase);
    const result = text(deployment.result);
    if (
      completedDeploymentFallback &&
      (typeof current !== 'string' || !current.trim()) &&
      phase === 'UPGRADE_COMPLETED' &&
      ['Completed', 'success'].includes(result)
    )
      current = deployment.version;
    observations.push({
      installed: text(current),
      available: text(block.available_version),
      phase,
      result,
    });
  }
  if (!observations.length || new Set(observations.map((value) => JSON.stringify(value))).size !== 1)
    throw new Error('Missing or conflicting upgrade version observations');
  return observations[0];
}
export function parseSiteUpgradeState(raw: unknown, binding: SiteBinding) {
  const site = object(raw);
  const metadata = object(site.metadata);
  const spec = object(site.spec);
  const nodes = spec.main_nodes;
  if (
    metadata.name !== binding.siteName ||
    metadata.namespace !== 'system' ||
    !Array.isArray(nodes) ||
    nodes.length !== binding.nodes.length ||
    new Set(nodes.map((node) => object(node).name)).size !== nodes.length ||
    nodes.some(
      (node) => typeof object(node).name !== 'string' || !binding.nodes.includes(object(node).name as string),
    ) ||
    !Array.isArray(site.status)
  )
    throw new Error('Upgrade physical site or node membership differs');
  const state = text(spec.site_state);
  const software = version(
    site.status,
    'volterra_software_status',
    'software-version',
    ['last_installed_version'],
    true,
  );
  const os = version(site.status, 'operating_system_status', 'operating-system-version', [
    'deployment_state',
    'version',
  ]);
  initialSoftwareSettings({ software: software.installed, os: os.installed });
  return {
    physicalSiteUid: text(object(site.system_metadata).uid),
    siteState: state,
    online: state === 'ONLINE',
    software,
    os,
  };
}
export function parseUpgradePrechecks(raw: unknown) {
  const list = object(raw).checklist;
  if (!Array.isArray(list) || !list.length) throw new Error('Missing upgrade prechecks');
  const seen = new Set<string>();
  const checks = list.map((value) => {
    const row = object(value),
      name = text(row.item),
      status = text(row.status);
    if (
      seen.has(name) ||
      !['CHECKLIST_UNKNOWN', 'CHECKLIST_PASSED', 'CHECKLIST_WARNING', 'CHECKLIST_FAILED'].includes(status)
    )
      throw new Error('Duplicate or unknown upgrade precheck');
    seen.add(name);
    return { name, status };
  });
  return { checks, passing: checks.every((check) => ['CHECKLIST_PASSED', 'CHECKLIST_WARNING'].includes(check.status)) };
}
export function parseSoftwareTargets(raw: unknown): string[] {
  const values = object(raw).sw_versions;
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !/^crt-\d{8}-\d{4}$/.test(value)) ||
    new Set(values).size !== values.length
  )
    throw new Error('Missing or malformed software upgrade targets');
  return values;
}
export function parseUpgradeProgress(raw: unknown, siteName: string) {
  const value = object(object(object(raw).upgrade_status).sw_upgrade_progress);
  if (value.site !== siteName) throw new Error('Upgrade progress site differs');
  if (!['UNKNOWN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED'].includes(text(value.status)))
    throw new Error('Unknown upgrade progress status');
  return { status: text(value.status), version: text(value.version) };
}

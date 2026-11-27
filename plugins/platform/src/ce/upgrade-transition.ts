import { type InitialSiteVersions, initialSoftwareSettings } from './initial-versions';
import type { CeRuntime, SiteBinding } from './runtime';
import { parseSoftwareTargets, parseUpgradePrechecks } from './upgrade-evidence';
import { buildSiteUpgradeRequest, type SiteUpgradeIntent } from './wire-upgrade';

export interface CeUpgradeExpectation {
  binding: SiteBinding;
  siteUid: string;
  physicalSiteUid: string;
  contractFingerprint: string;
  siteContractFingerprint: string;
  /** Effective versions frozen in the upgrade plan, independent of create-time initialVersions. */
  before: InitialSiteVersions;
  target: Pick<SiteUpgradeIntent, 'kind' | 'version'>;
}
type Observation = Awaited<ReturnType<CeRuntime['observeUpgrade']>>;
export type CeUpgradeTransition = 'ready' | 'converging' | 'versions-complete' | 'failed' | 'unknown';
const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export type CeVersionIdentity = Pick<
  CeUpgradeExpectation,
  'binding' | 'siteUid' | 'physicalSiteUid' | 'contractFingerprint' | 'siteContractFingerprint'
>;

function matchesVersionIdentity(
  expected: CeVersionIdentity,
  observation: Observation,
): observation is Extract<Observation, { status: 'observed' }> {
  if (observation.status !== 'observed') return false;
  const { binding } = expected;
  if (
    typeof expected.siteUid !== 'string' ||
    !expected.siteUid.trim() ||
    typeof expected.physicalSiteUid !== 'string' ||
    !expected.physicalSiteUid.trim() ||
    observation.siteUid !== expected.siteUid ||
    observation.physicalSiteUid !== expected.physicalSiteUid ||
    observation.siteName !== binding.siteName ||
    observation.source !== `/api/config/namespaces/system/sites/${binding.siteName}` ||
    !Array.isArray(binding.nodes) ||
    !binding.nodes.length ||
    binding.nodes.some((node) => typeof node !== 'string' || !node.trim()) ||
    !['native', 'terraform'].includes(binding.owner.engine) ||
    !['aws', 'azure'].includes(binding.owner.provider) ||
    new Set(binding.nodes).size !== binding.nodes.length ||
    !same(observation.nodes, binding.nodes) ||
    (['deploymentId', 'engine', 'provider', 'account', 'region'] as const).some(
      (key) =>
        typeof binding.owner[key] !== 'string' ||
        !binding.owner[key].trim() ||
        observation.owner[key] !== binding.owner[key],
    ) ||
    !(['contractFingerprint', 'siteContractFingerprint'] as const).every(
      (key) => /^sha256:[a-f0-9]{64}$/.test(expected[key]) && observation[key] === expected[key],
    )
  )
    return false;
  const start = Date.parse(observation.startedAt),
    end = Date.parse(observation.observedAt),
    now = Date.now();
  if (![start, end].every(Number.isFinite) || start > end || end > now || now - start > 60_000) return false;
  if (new Date(start).toISOString() !== observation.startedAt || new Date(end).toISOString() !== observation.observedAt)
    return false;
  if (observation.online !== (observation.siteState === 'ONLINE')) return false;
  initialSoftwareSettings({ software: observation.software.installed, os: observation.os.installed });
  return true;
}

/** Stable version evidence only; registration, node health, routing and traffic remain separate gates. */
export function stableCeSiteVersions(
  expected: CeVersionIdentity,
  observation: Observation,
): InitialSiteVersions | undefined {
  try {
    if (
      !matchesVersionIdentity(expected, observation) ||
      !observation.online ||
      observation.software.phase !== 'UPGRADE_COMPLETED' ||
      observation.os.phase !== 'UPGRADE_COMPLETED' ||
      observation.progress.status !== 'COMPLETED' ||
      observation.progress.version !== observation.software.installed ||
      observation.targetSoftware !== observation.software.installed
    )
      return undefined;
    return { software: observation.software.installed, os: observation.os.installed };
  } catch {
    return undefined;
  }
}

/** Internal gate for fresh runtime observations. Never authorizes mutation or establishes traffic/node health. */
export function assessCeUpgradeTransition(
  expected: CeUpgradeExpectation,
  observation: Observation,
): CeUpgradeTransition {
  try {
    initialSoftwareSettings(expected.before);
    if (Object.keys(expected.target).sort().join(',') !== 'kind,version') return 'unknown';
    buildSiteUpgradeRequest({ siteName: expected.binding.siteName, ...expected.target }, () => {});
    const kind = expected.target.kind,
      other = kind === 'software' ? 'os' : 'software';
    if (expected.target.version === expected.before[kind]) return 'unknown';
    if (!matchesVersionIdentity(expected, observation)) return 'unknown';
    const targetSoftware = kind === 'software' ? expected.target.version : expected.before.software;
    if (observation.targetSoftware !== targetSoftware) return 'unknown';
    const selected = observation[kind],
      unchanged = observation[other];
    if (unchanged.installed !== expected.before[other] || unchanged.phase !== 'UPGRADE_COMPLETED') return 'unknown';
    if (![expected.before[kind], expected.target.version].includes(selected.installed)) return 'unknown';
    if (observation.siteState === 'FAILED' || selected.phase === 'UPGRADE_FAILED') return 'failed';
    if (
      kind === 'software' &&
      observation.progress.version === expected.target.version &&
      observation.progress.status === 'FAILED'
    )
      return 'failed';
    if (
      selected.installed === expected.target.version &&
      selected.phase === 'UPGRADE_COMPLETED' &&
      observation.online
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version || observation.progress.status !== 'COMPLETED')
      )
        return 'unknown';
      return 'versions-complete';
    }
    if (
      ['UPGRADE_TRIGGERED', 'UPGRADE_IN_PROGRESS'].includes(selected.phase) &&
      ['ONLINE', 'UPGRADING'].includes(observation.siteState)
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version ||
          !['SCHEDULED', 'IN_PROGRESS'].includes(observation.progress.status))
      )
        return 'unknown';
      return 'converging';
    }
    if (selected.installed !== expected.before[kind] || selected.phase !== 'UPGRADE_COMPLETED' || !observation.online)
      return 'unknown';
    if (observation.progress.version !== expected.before.software || observation.progress.status !== 'COMPLETED')
      return 'unknown';
    const prechecks = parseUpgradePrechecks({
      checklist: observation.prechecks.checks.map((check) => ({ item: check.name, status: check.status })),
    });
    if (!prechecks.passing) return 'unknown';
    const targets = parseSoftwareTargets({ sw_versions: observation.targets });
    if (
      kind === 'software' ? !targets.includes(expected.target.version) : selected.available !== expected.target.version
    )
      return 'unknown';
    return 'ready';
  } catch {
    return 'unknown';
  }
}

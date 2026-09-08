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
    if (observation.status !== 'observed') return 'unknown';
    const { binding } = expected;
    if (
      !expected.siteUid ||
      !expected.physicalSiteUid ||
      observation.siteUid !== expected.siteUid ||
      observation.physicalSiteUid !== expected.physicalSiteUid ||
      observation.siteName !== binding.siteName ||
      observation.source !== `/api/config/namespaces/system/sites/${binding.siteName}` ||
      !binding.nodes.length ||
      new Set(binding.nodes).size !== binding.nodes.length ||
      !same(observation.nodes, binding.nodes) ||
      (['deploymentId', 'engine', 'provider', 'account', 'region'] as const).some(
        (key) => observation.owner[key] !== binding.owner[key],
      ) ||
      !(['contractFingerprint', 'siteContractFingerprint'] as const).every(
        (key) => /^sha256:[a-f0-9]{64}$/.test(expected[key]) && observation[key] === expected[key],
      )
    )
      return 'unknown';
    const start = Date.parse(observation.startedAt),
      end = Date.parse(observation.observedAt),
      now = Date.now();
    if (![start, end].every(Number.isFinite) || start > end || end > now || now - start > 60_000) return 'unknown';
    if (
      new Date(start).toISOString() !== observation.startedAt ||
      new Date(end).toISOString() !== observation.observedAt
    )
      return 'unknown';
    if (observation.online !== (observation.siteState === 'ONLINE')) return 'unknown';
    initialSoftwareSettings({ software: observation.software.installed, os: observation.os.installed });
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

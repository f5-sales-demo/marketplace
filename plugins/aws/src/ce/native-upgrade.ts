import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { initialSoftwareSettings } from '../../../platform/src/ce/initial-versions';
import { type NativeCeUpgradePlan, runNativeCeUpgrade } from '../../../platform/src/ce/native-upgrade';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from '../../../platform/src/ce/upgrade-transition';
import type { SiteUpgradeIntent } from '../../../platform/src/ce/wire-upgrade';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

export interface AwsNativeUpgrade extends NativeCeUpgradePlan {
  schemaVersion: 1;
  engine: 'native';
  kind: 'aws-ce-native-upgrade';
  expectation: CeUpgradeExpectation;
}

function build(
  base: AwsCePlan,
  expectation: CeUpgradeExpectation,
  contract: VerifiedUpgradeContract,
): AwsNativeUpgrade {
  verifyAwsCePlan(base);
  initialSoftwareSettings(expectation.before);
  const selected = siteBindings(base).find(({ site }) => site.name === expectation.binding.siteName);
  if (
    base.engine !== 'native' ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(expectation.binding) ||
    expectation.contractFingerprint !== contract.fingerprint ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version
  )
    throw new Error('Native upgrade identities, scope or effective versions are incomplete');
  contract.build({ siteName: selected.site.name, ...expectation.target });
  const draft = {
    schemaVersion: 1 as const,
    engine: 'native' as const,
    kind: 'aws-ce-native-upgrade' as const,
    sourcePlanSha256: base.planSha256,
    expectation,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}

export async function prepareAwsNativeUpgrade(
  base: AwsCePlan,
  siteName: string,
  target: Pick<SiteUpgradeIntent, 'kind' | 'version'>,
  runtime: Pick<CeRuntime, 'observeUpgrade'>,
  contract: VerifiedUpgradeContract,
  signal?: AbortSignal,
): Promise<AwsNativeUpgrade> {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (base.engine !== 'native' || !selected) throw new Error('Select a site owned by this native deployment');
  contract.build({ siteName, ...target });
  const observation = await runtime.observeUpgrade(
    selected.binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh native upgrade version evidence is unavailable');
  const expectation: CeUpgradeExpectation = {
    binding: selected.binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Native site version readiness has not converged');
  return build(base, expectation, contract);
}

export function verifyAwsNativeUpgrade(
  base: AwsCePlan,
  upgrade: AwsNativeUpgrade,
  contract: VerifiedUpgradeContract,
): void {
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('AWS native upgrade schema is obsolete; prepare a new v1 plan');
  const expected = build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected)) throw new Error('Saved native upgrade plan changed');
}

export function runAwsNativeUpgrade(
  base: AwsCePlan,
  upgrade: AwsNativeUpgrade,
  authorizedPlanSha256: string,
  runtime: Pick<CeRuntime, 'engine' | 'observeUpgrade' | 'submitUpgrade'>,
  contract: VerifiedUpgradeContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  return runNativeCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    async (candidate) => verifyAwsNativeUpgrade(base, candidate as AwsNativeUpgrade, contract),
    runtime,
    contract,
    storage,
    signal,
  );
}

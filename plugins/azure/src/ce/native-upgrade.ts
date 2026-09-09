import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { initialSoftwareSettings } from '../../../platform/src/ce/initial-versions';
import { type NativeCeUpgradePlan, runNativeCeUpgrade } from '../../../platform/src/ce/native-upgrade';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { assessCeUpgradeTransition, type CeUpgradeExpectation } from '../../../platform/src/ce/upgrade-transition';
import type { SiteUpgradeIntent } from '../../../platform/src/ce/wire-upgrade';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export interface AzureNativeUpgrade extends NativeCeUpgradePlan {
  schemaVersion: 1;
  engine: 'native';
  kind: 'azure-ce-native-upgrade';
  expectation: CeUpgradeExpectation;
}

function build(
  base: AzureCePlan,
  expectation: CeUpgradeExpectation,
  contract: VerifiedUpgradeContract,
): AzureNativeUpgrade {
  verifyAzureCePlan(base);
  initialSoftwareSettings(expectation.before);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'native' ||
    canonicalSha256(binding) !== canonicalSha256(expectation.binding) ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version ||
    expectation.contractFingerprint !== contract.fingerprint
  )
    throw new Error('Azure native upgrade identities, scope or effective versions are incomplete');
  contract.build({ siteName: base.siteName, ...expectation.target });
  const draft = {
    schemaVersion: 1 as const,
    engine: 'native' as const,
    kind: 'azure-ce-native-upgrade' as const,
    sourcePlanSha256: base.planSha256,
    expectation,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-native-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}

export async function prepareAzureNativeUpgrade(
  base: AzureCePlan,
  target: Pick<SiteUpgradeIntent, 'kind' | 'version'>,
  runtime: Pick<CeRuntime, 'observeUpgrade'>,
  contract: VerifiedUpgradeContract,
  signal?: AbortSignal,
): Promise<AzureNativeUpgrade> {
  verifyAzureCePlan(base);
  if (base.engine !== 'native') throw new Error('Azure native upgrade requires a native-owned plan');
  contract.build({ siteName: base.siteName, ...target });
  const binding = azureUpgradeBinding(base);
  const observation = await runtime.observeUpgrade(
    binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh Azure native upgrade version evidence is unavailable');
  const expectation: CeUpgradeExpectation = {
    binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Azure native site version readiness has not converged');
  return build(base, expectation, contract);
}

export function verifyAzureNativeUpgrade(
  base: AzureCePlan,
  upgrade: AzureNativeUpgrade,
  contract: VerifiedUpgradeContract,
): void {
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Azure native upgrade schema is obsolete; prepare a new v1 plan');
  const expected = build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected))
    throw new Error('Saved Azure native upgrade plan changed');
}

export function runAzureNativeUpgrade(
  base: AzureCePlan,
  upgrade: AzureNativeUpgrade,
  authorizedPlanSha256: string,
  runtime: Pick<CeRuntime, 'engine' | 'observeUpgrade' | 'submitUpgrade'>,
  contract: VerifiedUpgradeContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  return runNativeCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    async (candidate) => verifyAzureNativeUpgrade(base, candidate as AzureNativeUpgrade, contract),
    runtime,
    contract,
    storage,
    signal,
  );
}

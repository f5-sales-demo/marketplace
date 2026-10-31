import {
  validateNativeUpgradeCheckpoint,
  validateNativeUpgradeReceipt,
  validateNativeUpgradeSerial,
} from '../../../platform/src/ce/native-upgrade';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { canonicalSha256 } from './canonical';
import type { AzureNativeTeardownPlan } from './native-teardown';
import { type AzureNativeUpgrade, verifyAzureNativeUpgrade } from './native-upgrade';
import type { AzureCePlan } from './types';

const sourcePattern = /^azure-ce-native-upgrade-[a-f0-9]{24}\.json$/;
const artifactPattern = /^azure-ce-native-upgrade-[a-f0-9]{24}(?:-(?:authorization|checkpoint|receipt))?\.json$/;
export const isAzureNativeUpgradeHistoricalArtifact = (name: string) =>
  name === 'native-ce-upgrade-serial.json' || artifactPattern.test(name);
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const require = (condition: unknown, message: string) => {
  if (!condition) throw Error(`Native upgrade history: ${message}`);
};
const keys = (value: unknown, names: string[]) => {
  require(value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === names.toSorted().join(','), 'record fields differ');
};

/** Provenance only. Fresh independent cloud/platform absence remains the caller's retirement gate. */
export function verifyAzureNativeUpgradeHistoricalArtifacts(
  base: AzureCePlan,
  teardown: AzureNativeTeardownPlan,
  contract: VerifiedUpgradeContract | undefined,
  records: ReadonlyMap<string, unknown>,
) {
  const names = [...records.keys()].filter(isAzureNativeUpgradeHistoricalArtifact);
  if (!names.length) return;
  require(contract, 'verified upgrade contract missing');
  const sources = new Map<string, AzureNativeUpgrade>();
  for (const name of names.filter((name) => sourcePattern.test(name))) {
    const upgrade = records.get(name) as AzureNativeUpgrade;
    keys(upgrade?.expectation, [
      'binding',
      'siteUid',
      'physicalSiteUid',
      'contractFingerprint',
      'siteContractFingerprint',
      'before',
      'target',
    ]);
    keys(upgrade.expectation.before, ['software', 'os']);
    verifyAzureNativeUpgrade(base, upgrade, contract as VerifiedUpgradeContract);
    require(name === `${upgrade.planId}.json` &&
      upgrade.expectation.siteUid === teardown.retirement[0].siteUid &&
      upgrade.expectation.physicalSiteUid === teardown.retirement[0].physicalSiteUid &&
      upgrade.expectation.siteContractFingerprint ===
        teardown.drain.siteContractFingerprint, 'source site identity differs');
    sources.set(upgrade.planId, upgrade);
  }
  require(sources.size > 0, 'source missing');
  let serial: ReturnType<typeof validateNativeUpgradeSerial> | undefined;
  if (records.has('native-ce-upgrade-serial.json')) {
    serial = validateNativeUpgradeSerial(records.get('native-ce-upgrade-serial.json'));
    for (const [id, digest] of [
      [serial.activePlanId, serial.activePlanSha256],
      [serial.lastPlanId, serial.lastPlanSha256],
    ]) {
      if (id !== undefined) require(sources.get(id)?.planSha256 === digest, 'serial source differs');
    }
    if (serial.lastPlanId) require(records.has(`${serial.lastPlanId}-checkpoint.json`), 'last checkpoint missing');
    if (serial.activePlanId)
      require(records.has(`${serial.activePlanId}-checkpoint.json`), 'active checkpoint missing');
  }
  for (const name of names) {
    if (name === 'native-ce-upgrade-serial.json' || sourcePattern.test(name)) continue;
    const id = name.replace(/-(authorization|checkpoint|receipt)\.json$/, '');
    const source = sources.get(id);
    require(source, 'artifact source missing');
  }
  for (const upgrade of sources.values()) {
    const auth = records.get(`${upgrade.planId}-authorization.json`);
    const checkpoint = records.get(`${upgrade.planId}-checkpoint.json`);
    const receipt = records.get(`${upgrade.planId}-receipt.json`);
    if (auth !== undefined)
      require(same(auth, {
        schemaVersion: 2,
        engine: 'native',
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        mutations: true,
      }), 'authorization differs');
    if (checkpoint !== undefined) {
      require(auth, 'checkpoint authorization missing');
      const checked = validateNativeUpgradeCheckpoint(upgrade, checkpoint);
      // Source and ready checkpoint can be saved before the serial ledger's first durable write.
      if (checked.phase !== 'ready') require(serial, 'submitted serial ledger missing');
      if (checked.phase === 'submitted')
        require(serial?.activePlanId === upgrade.planId, 'submitted serial source differs');
      if (checked.phase === 'complete')
        require(serial?.activePlanId || serial?.lastPlanId, 'completed serial source missing');
      if (serial?.lastPlanId === upgrade.planId)
        require(checked.phase !== 'submitted', 'last upgrade is still submitted');
      if (checked.phase === 'complete') require(receipt, 'completed receipt missing');
      if (receipt !== undefined) {
        require(checked.phase !== 'ready', 'receipt predates submission');
        validateNativeUpgradeReceipt(upgrade, receipt);
      }
    } else require(receipt === undefined, 'receipt checkpoint missing');
  }
}

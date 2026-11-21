import { createHash } from 'node:crypto';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { type AzureTerraformUpgrade, verifyAzureTerraformUpgrade } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const sourcePattern = /^azure-ce-upgrade-[a-f0-9]{24}\.json$/;
const artifactPattern =
  /^azure-ce-upgrade-[a-f0-9]{24}(?:-(?:authorization|checkpoint|action-plan|receipt|stage-retirement))?\.json$/;
const serialName = 'terraform-ce-upgrade-serial.json';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (left: unknown, right: unknown) => canonicalEqual({ value: left }, { value: right });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Terraform upgrade history: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'record object required');
  return value as Record<string, unknown>;
}
function keys(value: unknown, fields: string[]) {
  const names = Object.entries(object(value))
    .filter(([, item]) => item !== undefined)
    .map(([name]) => name)
    .sort();
  require(same(names, fields.toSorted()), 'record fields differ');
}
export const isAzureTerraformUpgradeHistoricalArtifact = (name: string) =>
  name === serialName || artifactPattern.test(name);
export interface AzureTerraformUpgradeHistorySite {
  siteUid: string;
  physicalSiteUid: string;
  siteContractFingerprint: string;
}
/** Read-only root schema provenance. Stage journals and native runner retirement remain
 * separate owning gates. Neither a completion receipt nor this result proves current
 * operational health, external absence, application or artifact retirement.
 */
export async function verifyAzureTerraformUpgradeHistoricalArtifacts(
  request: AzureCePlan,
  currentSite: AzureTerraformUpgradeHistorySite,
  contract: VerifiedUpgradeContract | undefined,
  currentRecords: ReadonlyMap<string, unknown>,
  signal?: AbortSignal,
) {
  const base = structuredClone(request),
    site = structuredClone(currentSite);
  const records = new Map([...currentRecords].map(([name, value]) => [name, structuredClone(value)]));
  const inventory = (rows: ReadonlyMap<string, unknown>) =>
    [...rows].sort(([left], [right]) => left.localeCompare(right));
  const requestSha256 = canonicalSha256(base),
    siteSha256 = canonicalSha256(site),
    recordsSha256 = canonicalSha256(inventory(records));
  const build = contract?.build,
    fingerprint = contract?.fingerprint;
  const seal = () => {
    signal?.throwIfAborted();
    require(canonicalSha256(request) === requestSha256 &&
      canonicalSha256(currentSite) === siteSha256 &&
      canonicalSha256(inventory(currentRecords)) === recordsSha256 &&
      contract?.build === build &&
      contract?.fingerprint === fingerprint, 'owning source, site, records or contract changed');
  };
  seal();
  for (const name of records.keys())
    if (name.startsWith('azure-ce-upgrade-') && name.endsWith('.json'))
      require(artifactPattern.test(name), 'unclassified upgrade root record');
  const names = [...records.keys()].filter(isAzureTerraformUpgradeHistoricalArtifact).sort();
  const sources = new Map<string, AzureTerraformUpgrade>();
  if (names.length)
    require(contract &&
      base.engine === 'terraform' &&
      typeof site.siteUid === 'string' &&
      site.siteUid.length > 0 &&
      typeof site.physicalSiteUid === 'string' &&
      site.physicalSiteUid.length > 0 &&
      /^sha256:[a-f0-9]{64}$/.test(site.siteContractFingerprint), 'verified contract and exact site identity required');
  for (const name of names.filter((name) => sourcePattern.test(name))) {
    const upgrade = records.get(name) as AzureTerraformUpgrade;
    seal();
    await verifyAzureTerraformUpgrade(base, upgrade, contract as VerifiedUpgradeContract);
    seal();
    require(name === `${upgrade.planId}.json` &&
      !sources.has(upgrade.planId) &&
      upgrade.expectation.siteUid === site.siteUid &&
      upgrade.expectation.physicalSiteUid === site.physicalSiteUid &&
      upgrade.expectation.siteContractFingerprint ===
        site.siteContractFingerprint, 'source filename, duplicate or site identity differs');
    sources.set(upgrade.planId, structuredClone(upgrade));
  }
  if (names.length) require(sources.size > 0, 'upgrade source missing');
  const checkpoints = new Map<string, Record<string, unknown>>();
  const actions = new Map<string, Record<string, unknown>>();
  const stageRetirementPaths: string[] = [];
  for (const name of names) {
    if (name === serialName || sourcePattern.test(name)) continue;
    const id = name.replace(/-(authorization|checkpoint|action-plan|receipt|stage-retirement)\.json$/, '');
    require(sources.has(id), 'root artifact source missing');
    if (name.endsWith('-stage-retirement.json')) stageRetirementPaths.push(name);
  }
  for (const upgrade of sources.values()) {
    const id = upgrade.planId,
      auth = records.get(`${id}-authorization.json`),
      rawCheckpoint = records.get(`${id}-checkpoint.json`),
      rawAction = records.get(`${id}-action-plan.json`),
      rawReceipt = records.get(`${id}-receipt.json`);
    if (auth !== undefined)
      require(same(auth, {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        mutations: true,
      }), 'authorization differs');
    if (rawCheckpoint === undefined) {
      require(rawAction === undefined && rawReceipt === undefined, 'action or completion checkpoint missing');
      continue;
    }
    require(auth !== undefined, 'checkpoint authorization missing');
    const checkpoint = object(rawCheckpoint);
    keys(checkpoint, [
      'schemaVersion',
      'engine',
      'sourcePlanSha256',
      'upgradePlanSha256',
      'phase',
      ...(checkpoint.actionPlanSha256 === undefined ? [] : ['actionPlanSha256']),
    ]);
    require(checkpoint.schemaVersion === 2 &&
      checkpoint.engine === 'terraform' &&
      checkpoint.sourcePlanSha256 === base.planSha256 &&
      checkpoint.upgradePlanSha256 === upgrade.planSha256 &&
      ['ready', 'submitted', 'complete'].includes(String(checkpoint.phase)) &&
      (checkpoint.phase === 'ready'
        ? checkpoint.actionPlanSha256 === undefined
        : sha(checkpoint.actionPlanSha256)), 'checkpoint state or source differs');
    checkpoints.set(id, checkpoint);
    if (rawAction !== undefined) {
      const action = object(rawAction);
      keys(action, [
        'schemaVersion',
        'engine',
        'deploymentId',
        'backendIdentity',
        'configurationSha256',
        'providerLockSha256',
        'planSha256',
        'changes',
        'noChanges',
        'actionInvocations',
      ]);
      require(action.schemaVersion === 1 &&
        action.engine === 'terraform' &&
        action.deploymentId === upgrade.deployment.deploymentId &&
        action.backendIdentity === upgrade.deployment.backendIdentity &&
        action.configurationSha256 === hash(upgrade.deployment.configuration) &&
        action.providerLockSha256 === hash(upgrade.deployment.providerLock) &&
        sha(action.planSha256) &&
        action.noChanges === false &&
        same(action.changes, []) &&
        same(action.actionInvocations, [upgrade.action]) &&
        (checkpoint.phase === 'ready' ||
          action.planSha256 === checkpoint.actionPlanSha256), 'saved action identity or intent differs');
      actions.set(id, action);
    }
    if (checkpoint.phase !== 'ready') require(rawAction !== undefined, 'submitted action missing');
    if (checkpoint.phase === 'complete') require(rawReceipt !== undefined, 'completed receipt missing');
    if (rawReceipt !== undefined) {
      require(checkpoint.phase !== 'ready' && rawAction !== undefined, 'receipt predates submission');
      const receipt = object(rawReceipt),
        action = actions.get(id);
      keys(receipt, [
        'status',
        'engine',
        'planId',
        'planSha256',
        'siteName',
        'target',
        'actionPlanSha256',
        'observedAt',
        'nodeHealth',
        'routing',
        'traffic',
      ]);
      require(receipt.status === 'upgrade-complete' &&
        receipt.engine === 'terraform' &&
        receipt.planId === id &&
        receipt.planSha256 === upgrade.planSha256 &&
        receipt.siteName === upgrade.expectation.binding.siteName &&
        same(receipt.target, upgrade.expectation.target) &&
        receipt.actionPlanSha256 === action?.planSha256 &&
        typeof receipt.observedAt === 'string' &&
        Number.isFinite(Date.parse(receipt.observedAt)) &&
        Date.parse(receipt.observedAt) <= Date.now() &&
        receipt.nodeHealth === 'unknown' &&
        receipt.routing === 'unknown' &&
        receipt.traffic === 'unknown', 'completion receipt identity or historical state differs');
    }
  }
  const rawSerial = records.get(serialName);
  let serial: Record<string, unknown> | undefined;
  if (rawSerial !== undefined) {
    serial = object(rawSerial);
    keys(serial, [
      'schemaVersion',
      'engine',
      'status',
      ...['activePlanId', 'activePlanSha256', 'lastPlanId', 'lastPlanSha256'].filter(
        (key) => serial?.[key] !== undefined,
      ),
    ]);
    require(serial.schemaVersion === 2 &&
      serial.engine === 'terraform' &&
      ['active', 'idle'].includes(String(serial.status)) &&
      (serial.activePlanId === undefined) === (serial.activePlanSha256 === undefined) &&
      (serial.lastPlanId === undefined) === (serial.lastPlanSha256 === undefined) &&
      (serial.status === 'active'
        ? typeof serial.activePlanId === 'string' && sha(serial.activePlanSha256)
        : serial.activePlanId === undefined), 'serial lifecycle state differs');
    for (const [id, digest] of [
      [serial.activePlanId, serial.activePlanSha256],
      [serial.lastPlanId, serial.lastPlanSha256],
    ])
      if (id !== undefined)
        require(typeof id === 'string' &&
          sha(digest) &&
          sources.get(id)?.planSha256 === digest &&
          checkpoints.has(id), 'serial source or checkpoint differs');
    if (serial.lastPlanId !== undefined)
      require(checkpoints.get(String(serial.lastPlanId))?.phase !== 'submitted', 'last upgrade is still submitted');
  }
  for (const [id, checkpoint] of checkpoints) {
    if (checkpoint.phase === 'submitted')
      require(serial?.status === 'active' && serial.activePlanId === id, 'submitted serial owner differs');
    if (checkpoint.phase === 'complete')
      require(serial &&
        (serial.activePlanId !== undefined || serial.lastPlanId !== undefined), 'completed serial ledger missing');
    if (checkpoint.phase === 'ready' && actions.has(id))
      require(serial?.status === 'active' && serial.activePlanId === id, 'prepared action serial owner differs');
  }
  seal();
  return {
    scope: 'read-only-terraform-upgrade-root-provenance' as const,
    sources,
    rootArtifacts: names
      .filter((name) => !stageRetirementPaths.includes(name))
      .map((path) => ({ path, packetSha256: canonicalSha256(records.get(path)) })),
    stageRetirementPaths,
    nativeStageRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
}

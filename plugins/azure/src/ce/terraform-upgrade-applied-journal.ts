import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { type AzureTerraformUpgrade, azureUpgradeBinding } from './terraform-upgrade';
import {
  type AzureTerraformUpgradeHistorySite,
  verifyAzureTerraformUpgradeHistoricalArtifacts,
} from './terraform-upgrade-artifact-provenance';
import type { AzureCePlan } from './types';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure upgrade applied journal: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v as Record<string, unknown>;
}
function keys(v: unknown, names: string[]) {
  require(same(Object.keys(object(v)).sort(), names.toSorted()), 'journal fields differ');
}
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    input: AzureTerraformUpgrade;
    site: AzureTerraformUpgradeHistorySite;
    contract: VerifiedUpgradeContract;
    store: CeDeploymentStore;
    session: TerraformSession;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();

/** Retain hash-only native applied-journal custody before any stage artifact deletion.
 * Applied journal state is local submission evidence. This does not prove API upgrade
 * completion, current health, independent absence or stage retirement. The owning stage
 * executor must bind this exact snapshot into its original retirement evidence.
 */
export async function qualifyAzureTerraformUpgradeAppliedJournal(
  request: AzureCePlan,
  input: AzureTerraformUpgrade,
  currentSite: AzureTerraformUpgradeHistorySite,
  contract: VerifiedUpgradeContract,
  store: CeDeploymentStore,
  session: TerraformSession,
  signal?: AbortSignal,
) {
  const base = structuredClone(request),
    upgrade = structuredClone(input),
    site = structuredClone(currentSite),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: session, key: 'readPlanApplicationHistory', value: session.readPlanApplicationHistory },
    ...['identity', 'publication', 'releaseTag', 'commit', 'fingerprint', 'build', 'observationPaths'].map((key) => ({
      target: contract,
      key,
      value: Reflect.get(contract, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = (active: AbortSignal) => {
    active.throwIfAborted();
    require(same(request, base) &&
      same(input, upgrade) &&
      same(currentSite, site) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning input or dependency changed');
  };
  const step = async <T>(action: () => Promise<T>, active: AbortSignal) => {
    seal(active);
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal(active);
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal(deadline);
  require(base.engine === 'terraform' &&
    same(owner, azureUpgradeBinding(base).owner) &&
    typeof session.readPlanApplicationHistory === 'function', 'owning journal observer required');
  const readHistory = session.readPlanApplicationHistory.bind(session);
  const snapshot = async (active: AbortSignal) => {
    await step(() => store.verify(), active);
    const root = await step(() => lstat(directory), active);
    require(root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 0o077) === 0 &&
      (await step(() => realpath(directory), active)) === directory, 'private owning directory differs');
    const names = (await step(() => readdir(directory), active))
      .filter(
        (name) =>
          (name.startsWith('azure-ce-upgrade-') || name === 'terraform-ce-upgrade-serial.json') &&
          !name.endsWith('-stage-retirement.json'),
      )
      .sort();
    const records = new Map<string, unknown>();
    const files: Array<{ path: string; identity: string; bytesSha256: string; packetSha256: string }> = [];
    for (const name of names) {
      const native = await step(() => readAzureTerraformParentPrivateFile(join(directory, name), active), active);
      let parsed: unknown;
      try {
        parsed = JSON.parse(native.bytes.toString());
      } catch {
        throw Error('Azure upgrade applied journal: malformed root record');
      }
      const logical = await step(() => store.read(name), active);
      require(same(parsed, logical), 'root logical and native bytes differ');
      records.set(name, structuredClone(logical));
      files.push({
        path: name,
        identity: native.identity,
        bytesSha256: hash(native.bytes),
        packetSha256: canonicalSha256(logical),
      });
    }
    return { records, files, rootIdentity: `${root.dev}:${root.ino}:${root.birthtimeMs}`, names };
  };
  const first = await snapshot(deadline);
  const rootHistory = await step(
    () => verifyAzureTerraformUpgradeHistoricalArtifacts(base, site, contract, first.records, deadline),
    deadline,
  );
  require(same(rootHistory.sources.get(upgrade.planId), upgrade), 'exact saved upgrade source required');
  const checkpoint = object(first.records.get(`${upgrade.planId}-checkpoint.json`)),
    serial = object(first.records.get('terraform-ce-upgrade-serial.json'));
  require(checkpoint.phase === 'complete' &&
    serial.status === 'idle' &&
    serial.activePlanId === undefined, 'complete inactive upgrade required');
  const action = object(first.records.get(`${upgrade.planId}-action-plan.json`)) as unknown as PlanReceipt;
  const { configuration, providerLock, ...identity } = upgrade.deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: hash(configuration),
    providerLockSha256: hash(providerLock),
  });
  const validateHistory = (raw: unknown) =>
    verifyAzureTerraformUpgradeAppliedJournalHistory(raw, action, manifestSha256);
  const history = validateHistory(await step(() => readHistory(action, deadline), deadline));
  require(same(await snapshot(deadline), first), 'root bytes or namespace changed during observation');
  const body = {
    schemaVersion: 1 as const,
    scope: 'azure-terraform-upgrade-applied-journal-custody' as const,
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    site,
    contractFingerprint: contract.fingerprint,
    actionReceiptSha256: canonicalSha256(action),
    manifestSha256,
    files: first.files,
    rootIdentity: first.rootIdentity,
    history,
    historySha256: canonicalSha256(history),
    journalCustodyQualified: true as const,
    applicationOutcomeQualified: false as const,
    retirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
  const digest = canonicalSha256(body);
  witnesses.set(body, {
    request,
    input,
    site: currentSite,
    contract,
    store,
    session,
    digest,
    async recheck(parent) {
      const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
      seal(active);
      require(canonicalSha256(body) === digest &&
        same(await snapshot(active), first), 'owning witness or root custody changed');
      require(same(
        validateHistory(await step(() => readHistory(action, active), active)),
        history,
      ), 'native journal history changed');
      require(same(await snapshot(active), first), 'root bytes or namespace changed during recheck');
      seal(active);
    },
  });
  return body;
}

export async function recheckAzureTerraformUpgradeAppliedJournal(
  witness: unknown,
  request: AzureCePlan,
  input: AzureTerraformUpgrade,
  site: AzureTerraformUpgradeHistorySite,
  contract: VerifiedUpgradeContract,
  store: CeDeploymentStore,
  session: TerraformSession,
  signal?: AbortSignal,
) {
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.input === input &&
    bound.site === site &&
    bound.contract === contract &&
    bound.store === store &&
    bound.session === session &&
    bound.digest === canonicalSha256(witness), 'owning applied journal witness required');
  await bound.recheck(signal);
}

export function verifyAzureTerraformUpgradeAppliedJournalHistory(
  raw: unknown,
  action: PlanReceipt,
  manifestSha256: string,
) {
  const history = object(raw);
  keys(history, [
    'schemaVersion',
    'scope',
    'receiptSha256',
    'manifestSha256',
    'matches',
    'incompleteArchives',
    'applicationOutcomeQualified',
    'retirementQualified',
  ]);
  require(history.schemaVersion === 1 &&
    history.scope === 'exact-saved-plan-journal-history' &&
    history.receiptSha256 === canonicalSha256(action) &&
    history.manifestSha256 === manifestSha256 &&
    history.incompleteArchives === 0 &&
    history.applicationOutcomeQualified === false &&
    history.retirementQualified === false &&
    Array.isArray(history.matches) &&
    history.matches.length > 0, 'exact complete native journal history required');
  const seen = new Set<string>();
  let applied = false;
  for (const rawMatch of history.matches) {
    const match = object(rawMatch);
    keys(match, [
      'location',
      'archiveSha256',
      'state',
      'journalSha256',
      'savedPlanSha256',
      'configurationSha256',
      'manifestSha256',
    ]);
    const key = `${match.location}/${match.archiveSha256}`;
    require(['current', 'revision', 'plan-history'].includes(String(match.location)) &&
      !seen.has(key) &&
      ['planned', 'applied'].includes(String(match.state)) &&
      sha(match.archiveSha256) &&
      sha(match.journalSha256) &&
      match.savedPlanSha256 === action.planSha256 &&
      match.configurationSha256 === action.configurationSha256 &&
      match.manifestSha256 === manifestSha256, 'ambiguous or foreign journal occurrence');
    seen.add(key);
    applied ||= match.state === 'applied';
  }
  require(applied, 'native applied journal occurrence required');
  return structuredClone(history);
}

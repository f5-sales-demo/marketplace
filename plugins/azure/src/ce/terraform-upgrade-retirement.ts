import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { ArtifactRetirementReceipt } from '../../../terraform/src/artifact-retirement';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { type AzureTerraformUpgrade, azureUpgradeBinding, verifyAzureTerraformUpgrade } from './terraform-upgrade';
import {
  qualifyAzureTerraformUpgradeAppliedJournal,
  recheckAzureTerraformUpgradeAppliedJournal,
  verifyAzureTerraformUpgradeAppliedJournalHistory,
} from './terraform-upgrade-applied-journal';
import { verifyAzureTerraformUpgradeHistoricalArtifacts } from './terraform-upgrade-artifact-provenance';
import type { AzureCePlan } from './types';

const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure upgrade stage retirement: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'complete checkpoint required');
  return v as Record<string, unknown>;
}
function keys(v: unknown, names: string[]) {
  require(same(
    Object.entries(object(v))
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
      .sort(),
    names.toSorted(),
  ), 'checkpoint fields differ');
}
async function optional(store: CeDeploymentStore, name: string) {
  try {
    return await store.read(name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

/** Independently qualified external absence remains required. Before native deletion,
 * bind the original applied journal and exact ordinary final receipt into a durable
 * stage-specific evidence envelope. Replay authenticates its permanent native barrier.
 */
async function accessAzureTerraformUpgradeStage(
  request: AzureCePlan,
  input: AzureTerraformUpgrade,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  externalEvidenceSha256: string,
  environment: Record<string, string | undefined>,
  signal: AbortSignal | undefined,
  observationOnly?: unknown,
) {
  const base = structuredClone(request),
    upgrade = structuredClone(input),
    env = { ...environment },
    owner = structuredClone(store.owner),
    directory = store.directory;
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const dependencies: Array<{ target: object; key: string; value: unknown }> = [
    { target: terraform, key: 'open', value: terraform.open },
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    ...['identity', 'publication', 'releaseTag', 'commit', 'fingerprint', 'build', 'observationPaths'].map((key) => ({
      target: contract,
      key,
      value: Reflect.get(contract, key),
    })),
  ];
  const seal = () => {
    active.throwIfAborted();
    require(same(request, base) &&
      same(input, upgrade) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning input or method changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await step(() => verifyAzureTerraformUpgrade(base, upgrade, contract));
  require(sha(externalEvidenceSha256) &&
    same(owner, azureUpgradeBinding(base).owner), 'owning external absence digest required');
  const site = {
    siteUid: upgrade.expectation.siteUid,
    physicalSiteUid: upgrade.expectation.physicalSiteUid,
    siteContractFingerprint: upgrade.expectation.siteContractFingerprint,
  };
  const { configuration, providerLock, ...identity } = upgrade.deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: hash(configuration),
    providerLockSha256: hash(providerLock),
  });
  const deploymentSha256 = canonicalSha256(upgrade.deployment),
    name = `${upgrade.planId}-stage-retirement.json`;
  const release = await acquireProcessLock(join(directory, '.upgrade-lock'));
  try {
    const roots = async () => {
      await step(() => store.verify());
      const names = (await step(() => readdir(directory)))
        .filter(
          (path) =>
            (path.startsWith('azure-ce-upgrade-') || path === 'terraform-ce-upgrade-serial.json') &&
            !path.endsWith('-stage-retirement.json'),
        )
        .sort();
      const records = new Map<string, unknown>();
      for (const path of names) records.set(path, await step(() => store.read(path)));
      const history = await step(() =>
        verifyAzureTerraformUpgradeHistoricalArtifacts(base, site, contract, records, active),
      );
      require(same(history.sources.get(upgrade.planId), upgrade) &&
        object(records.get(`${upgrade.planId}-checkpoint.json`)).phase === 'complete' &&
        object(records.get('terraform-ce-upgrade-serial.json')).status ===
          'idle', 'complete inactive owning roots required');
      return {
        names,
        records,
        action: object(records.get(`${upgrade.planId}-action-plan.json`)) as unknown as PlanReceipt,
      };
    };
    const source = await roots(),
      action = source.action;
    const finalReceipt = (raw: unknown) => {
      const receipt = object(raw);
      keys(receipt, [
        'schemaVersion',
        'engine',
        'deploymentId',
        'backendIdentity',
        'configurationSha256',
        'providerLockSha256',
        'planSha256',
        'changes',
        'noChanges',
      ]);
      require(receipt.schemaVersion === 1 &&
        receipt.engine === 'terraform' &&
        receipt.deploymentId === upgrade.deployment.deploymentId &&
        receipt.backendIdentity === upgrade.deployment.backendIdentity &&
        receipt.configurationSha256 === hash(configuration) &&
        receipt.providerLockSha256 === hash(providerLock) &&
        sha(receipt.planSha256) &&
        receipt.noChanges === true &&
        Array.isArray(receipt.changes) &&
        receipt.changes.length === 0, 'exact ordinary final no-change receipt required');
      return receipt as unknown as PlanReceipt;
    };
    const envelope = (appliedJournalSha256: string, receiptSha256: string) => ({
      schemaVersion: 2,
      kind: 'azure-terraform-upgrade-stage-retirement',
      externalEvidenceSha256,
      sourcePlanSha256: base.planSha256,
      upgradePlanSha256: upgrade.planSha256,
      deploymentSha256,
      appliedJournalSha256,
      receiptSha256,
    });
    const validate = (raw: unknown) => {
      const c = object(raw),
        bound = [
          'schemaVersion',
          'status',
          'owner',
          'sourcePlanSha256',
          'upgradePlanSha256',
          'deploymentSha256',
          'externalEvidenceSha256',
        ];
      require(c.schemaVersion === 2 &&
        ['preparing', 'capturing', 'retiring', 'retired'].includes(String(c.status)) &&
        same(c.owner, owner) &&
        c.sourcePlanSha256 === base.planSha256 &&
        c.upgradePlanSha256 === upgrade.planSha256 &&
        c.deploymentSha256 === deploymentSha256 &&
        c.externalEvidenceSha256 === externalEvidenceSha256, 'original stage checkpoint identity differs');
      if (c.status !== 'preparing') {
        bound.push('receipt', 'receiptSha256');
        finalReceipt(c.receipt);
        require(c.receiptSha256 === canonicalSha256(c.receipt), 'final receipt digest differs');
      }
      if (c.status === 'retiring' || c.status === 'retired') {
        bound.push('appliedJournal', 'appliedJournalSha256', 'retirementEvidence', 'evidenceSha256');
        require(sha(c.appliedJournalSha256) &&
          c.appliedJournalSha256 === canonicalSha256(c.appliedJournal) &&
          same(c.retirementEvidence, envelope(c.appliedJournalSha256, String(c.receiptSha256))) &&
          c.evidenceSha256 === canonicalSha256(c.retirementEvidence), 'original stage evidence envelope differs');
      }
      if (c.status === 'retired') bound.push('result');
      keys(c, bound);
      return c;
    };
    let checkpoint = await optional(store, name);
    if (checkpoint !== undefined) validate(checkpoint);
    if (observationOnly !== undefined)
      require(checkpoint !== undefined &&
        object(checkpoint).status === 'retired' &&
        same(checkpoint, observationOnly), 'read-only completed stage checkpoint required');
    const session = await step(() => terraform.open(owner, upgrade.deployment, 'current'));
    require(session.retireArtifacts &&
      session.readArtifactRetirement &&
      session.readPlanApplicationHistory &&
      session.readConfigurationSha256, 'owning native retirement and journal observers required');
    const readConfiguration = session.readConfigurationSha256.bind(session),
      observeRetirement = session.readArtifactRetirement.bind(session),
      retire = session.retireArtifacts.bind(session);
    for (const key of [
      'retireArtifacts',
      'readArtifactRetirement',
      'readPlanApplicationHistory',
      'readConfigurationSha256',
      'readPlanApplicationState',
      'plan',
    ])
      dependencies.push({ target: session, key, value: Reflect.get(session, key) });
    if (checkpoint === undefined) {
      require((await step(() => readConfiguration())) === hash(configuration) &&
        (await step(() => session.readPlanApplicationState(action))) === 'applied', 'owning applied action required');
      checkpoint = {
        schemaVersion: 2,
        status: 'preparing',
        owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256,
        externalEvidenceSha256,
      };
      await step(() => store.write(name, checkpoint));
    }
    const unchanged = async () => {
      require(same(await step(() => store.read(name)), checkpoint), 'stage checkpoint changed across boundary');
      await roots();
    };
    if (object(checkpoint).status === 'preparing') {
      const before = await step(() =>
        qualifyAzureTerraformUpgradeAppliedJournal(base, upgrade, site, contract, store, session, active),
      );
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(before, base, upgrade, site, contract, store, session, active),
      );
      const receipt = finalReceipt(await step(() => session.plan(env, active)));
      await unchanged();
      checkpoint = { ...object(checkpoint), status: 'capturing', receipt, receiptSha256: canonicalSha256(receipt) };
      await step(() => store.write(name, checkpoint));
    }
    if (object(checkpoint).status === 'capturing') {
      const proof = await step(() =>
        qualifyAzureTerraformUpgradeAppliedJournal(base, upgrade, site, contract, store, session, active),
      );
      await unchanged();
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(proof, base, upgrade, site, contract, store, session, active),
      );
      const appliedJournalSha256 = canonicalSha256(proof),
        retirementEvidence = envelope(appliedJournalSha256, String(object(checkpoint).receiptSha256));
      checkpoint = {
        ...object(checkpoint),
        status: 'retiring',
        appliedJournal: structuredClone(proof),
        appliedJournalSha256,
        retirementEvidence,
        evidenceSha256: canonicalSha256(retirementEvidence),
      };
      await step(() => store.write(name, checkpoint));
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(proof, base, upgrade, site, contract, store, session, active),
      );
    }
    const c = validate(checkpoint),
      receipt = finalReceipt(c.receipt),
      evidenceSha256 = String(c.evidenceSha256);
    const retained = async () => {
      const proof = object(c.appliedJournal);
      keys(proof, [
        'schemaVersion',
        'scope',
        'sourcePlanSha256',
        'upgradePlanSha256',
        'site',
        'contractFingerprint',
        'actionReceiptSha256',
        'manifestSha256',
        'files',
        'rootIdentity',
        'history',
        'historySha256',
        'journalCustodyQualified',
        'applicationOutcomeQualified',
        'retirementQualified',
        'currentOperationalAcceptanceQualified',
      ]);
      require(proof.schemaVersion === 1 &&
        proof.scope === 'azure-terraform-upgrade-applied-journal-custody' &&
        proof.sourcePlanSha256 === base.planSha256 &&
        proof.upgradePlanSha256 === upgrade.planSha256 &&
        same(proof.site, site) &&
        proof.contractFingerprint === contract.fingerprint &&
        proof.actionReceiptSha256 === canonicalSha256(action) &&
        proof.manifestSha256 === manifestSha256 &&
        proof.historySha256 === canonicalSha256(proof.history) &&
        proof.journalCustodyQualified === true &&
        proof.applicationOutcomeQualified === false &&
        proof.retirementQualified === false &&
        proof.currentOperationalAcceptanceQualified === false &&
        Array.isArray(proof.files), 'retained applied custody differs');
      verifyAzureTerraformUpgradeAppliedJournalHistory(proof.history, action, manifestSha256);
      const current = await roots(),
        files = proof.files.map(object);
      require(same(files.map((file) => file.path).sort(), current.names), 'retained root namespace differs');
      const root = await step(() => lstat(directory));
      require(proof.rootIdentity === `${root.dev}:${root.ino}:${root.birthtimeMs}`, 'retained root identity differs');
      for (const file of files) {
        keys(file, ['path', 'identity', 'bytesSha256', 'packetSha256']);
        require(typeof file.path === 'string' && current.names.includes(file.path), 'retained root path differs');
        const native = await step(() =>
          readAzureTerraformParentPrivateFile(join(directory, file.path as string), active),
        );
        require(native.identity === file.identity &&
          hash(native.bytes) === file.bytesSha256 &&
          file.packetSha256 === canonicalSha256(current.records.get(file.path)), 'retained root bytes or inode differ');
      }
      await unchanged();
    };
    const result = (raw: unknown): ArtifactRetirementReceipt => {
      const value = object(raw);
      keys(value, [
        'status',
        'manifestSha256',
        'evidenceSha256',
        'finalPlanSha256',
        'inventorySha256',
        'retiredArtifacts',
        'independentCleanupSha256',
      ]);
      require(value.status === 'runner-artifacts-retired' &&
        value.manifestSha256 === manifestSha256 &&
        value.evidenceSha256 === evidenceSha256 &&
        value.finalPlanSha256 === receipt.planSha256 &&
        sha(value.inventorySha256) &&
        sha(value.independentCleanupSha256) &&
        Number.isSafeInteger(value.retiredArtifacts) &&
        Number(value.retiredArtifacts) >= 0, 'native retirement result differs');
      return value as unknown as ArtifactRetirementReceipt;
    };
    await retained();
    const observed = await step(() => observeRetirement(receipt, evidenceSha256, active));
    await retained();
    if (observed.status === 'runner-artifacts-retired') {
      const native = result(observed.receipt);
      require(sha(observed.markerSha256), 'permanent native marker identity required');
      if (c.status === 'retired') require(same(c.result, native), 'completed root result differs from native barrier');
      else {
        checkpoint = { ...c, status: 'retired', result: native };
        await step(() => store.write(name, checkpoint));
      }
      return native;
    }
    require(c.status === 'retiring', 'completed stage lost its permanent native barrier');
    if (observed.status === 'absent') {
      const fresh = await step(() =>
        qualifyAzureTerraformUpgradeAppliedJournal(base, upgrade, site, contract, store, session, active),
      );
      require(same(fresh, c.appliedJournal), 'pre-deletion applied custody changed');
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(fresh, base, upgrade, site, contract, store, session, active),
      );
    } else
      require(sha(observed.markerSha256) &&
        sha(observed.independentCleanupSha256) &&
        Number.isSafeInteger(observed.remainingArtifacts) &&
        observed.remainingArtifacts >= 0, 'partial native marker identity required');
    await retained();
    const retired = result(await step(() => retire(receipt, evidenceSha256, env, active)));
    await retained();
    const permanent = await step(() => observeRetirement(receipt, evidenceSha256, active));
    require(permanent.status === 'runner-artifacts-retired' &&
      sha(permanent.markerSha256) &&
      same(result(permanent.receipt), retired), 'owning permanent native barrier required after cleanup');
    await retained();
    checkpoint = { ...c, status: 'retired', result: retired };
    await step(() => store.write(name, checkpoint));
    return retired;
  } finally {
    await release();
  }
}

export async function retireAzureTerraformUpgradeStage(
  request: AzureCePlan,
  input: AzureTerraformUpgrade,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  externalEvidenceSha256: string,
  environment: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  return accessAzureTerraformUpgradeStage(
    request,
    input,
    contract,
    terraform,
    store,
    externalEvidenceSha256,
    environment,
    signal,
  );
}

/** Authenticate completed stage custody using its original evidence and native barrier.
 * Missing, interrupted or changed checkpoints reject. This never plans, repairs or
 * re-retires a stage and does not establish current cloud absence or health.
 */
export async function readAzureTerraformUpgradeStageRetirement(
  request: AzureCePlan,
  input: AzureTerraformUpgrade,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  require(/^azure-ce-upgrade-[a-f0-9]{24}$/.test(input.planId), 'read-only stage source identifier required');
  const name = `${input.planId}-stage-retirement.json`,
    path = join(store.directory, name),
    before = await readAzureTerraformParentPrivateFile(path, signal),
    checkpoint = object(JSON.parse(before.bytes.toString()));
  require(checkpoint.schemaVersion === 2 &&
    checkpoint.status === 'retired' &&
    sha(checkpoint.externalEvidenceSha256), 'read-only completed stage checkpoint required');
  const result = await accessAzureTerraformUpgradeStage(
    request,
    input,
    contract,
    terraform,
    store,
    checkpoint.externalEvidenceSha256,
    {},
    signal,
    checkpoint,
  );
  const after = await readAzureTerraformParentPrivateFile(path, signal);
  require(after.identity === before.identity &&
    after.bytes.equals(before.bytes), 'read-only stage checkpoint descriptor changed');
  return result;
}

/** Terminal callers keep a prior stage's external evidence and permanent barrier.
 * Fresh parent absence is used only for first retirement, never to rewrite stage history.
 */
export async function finalizeAzureTerraformUpgradeStageRetirement(
  request: AzureCePlan,
  input: AzureTerraformUpgrade,
  contract: VerifiedUpgradeContract,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  newStageExternalEvidenceSha256: string,
  environment: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  require(sha(newStageExternalEvidenceSha256), 'resolved external absence digest required');
  await verifyAzureTerraformUpgrade(request, input, contract);
  const saved = await optional(store, `${input.planId}-stage-retirement.json`);
  if (saved === undefined)
    return retireAzureTerraformUpgradeStage(
      request,
      input,
      contract,
      terraform,
      store,
      newStageExternalEvidenceSha256,
      environment,
      signal,
    );
  const checkpoint = object(saved);
  require(checkpoint.schemaVersion === 2 &&
    sha(checkpoint.externalEvidenceSha256), 'original stage external evidence required');
  if (checkpoint.status === 'retired')
    return readAzureTerraformUpgradeStageRetirement(request, input, contract, terraform, store, signal);
  return retireAzureTerraformUpgradeStage(
    request,
    input,
    contract,
    terraform,
    store,
    checkpoint.externalEvidenceSha256,
    environment,
    signal,
  );
}

/** Map discovered stage names only through exact immutable upgrade sources. */
export async function qualifiedAzureTerraformUpgradeStages(
  base: AzureCePlan,
  store: CeDeploymentStore,
  stages: string[],
  contract: VerifiedUpgradeContract,
) {
  const { readdir } = await import('node:fs/promises');
  const sources = (await readdir(store.directory)).filter((name) => /^azure-ce-upgrade-[a-f0-9]{24}\.json$/.test(name));
  const upgrades: AzureTerraformUpgrade[] = [];
  for (const name of sources) {
    const upgrade = (await store.read(name)) as AzureTerraformUpgrade;
    await verifyAzureTerraformUpgrade(base, upgrade, contract);
    if (name !== `${upgrade.planId}.json`) throw Error('Upgrade source file identity differs');
    if (stages.includes(String(upgrade.deployment.stage))) upgrades.push(upgrade);
  }
  if (
    new Set(upgrades.map((u) => u.deployment.stage)).size !== upgrades.length ||
    stages.some((stage) => !upgrades.some((u) => u.deployment.stage === stage))
  )
    throw Error('Unqualified Terraform stage blocks terminal cleanup');
  return upgrades.sort((a, b) => String(a.deployment.stage).localeCompare(String(b.deployment.stage)));
}

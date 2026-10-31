import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import {
  azureTerraformNetworkPowerDeployment,
  azureTerraformNetworkPowerSelections,
  validateAzureTerraformNetworkPowerPlan,
} from './terraform-network-power';
import { validateAzureTerraformPowerCancellationPacket } from './terraform-network-power-cancellation-packet';
import { withAzureTerraformPowerLifecycle } from './terraform-network-power-lifecycle';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkRetirementGraph } from './terraform-network-retirement-graph';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network power cancellation: ${message}`);
}
/** An aborted mutation may still settle. Retain both lifecycle locks until it does; callers
 * can await completion before retrying. No late result can publish cancellation success.
 */
export class AzureTerraformPowerCancellationInterrupted extends Error {
  constructor(
    readonly completion: Promise<{
      mutationSettlements: Array<'fulfilled' | 'rejected'>;
      locksReleased: boolean;
      failures: string[];
    }>,
  ) {
    super('Azure Terraform network power cancellation: interrupted mutation retains owning locks until settlement');
  }
}

/** Exact selected runner cancellation only. No VM action, plan creation, release apply,
 * operational acceptance, artifact retirement or parent deletion is admitted here.
 */
export async function cancelAzureTerraformNetworkPowerStage(
  request: AzureCePlan,
  selectedNode: number,
  selectedOperation: 'deallocate' | 'start',
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  environment: Record<string, string | undefined>,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory,
    env = { ...environment },
    open = terraform.open,
    read = store.read,
    write = store.write,
    verify = store.verify,
    loadSource = loaders.loadSource,
    loadOutcome = loaders.loadOutcome;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, plan) &&
      same(siteRequest, site) &&
      same(store.owner, owner) &&
      same(environment, env) &&
      store.directory === directory &&
      terraform.open === open &&
      store.read === read &&
      store.write === write &&
      store.verify === verify &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome === loadOutcome, 'request or owning dependency changed');
  };
  seal();
  require(Number.isInteger(selectedNode) &&
    selectedNode >= 1 &&
    selectedNode <= plan.topology.nodeCount &&
    ['deallocate', 'start'].includes(selectedOperation), 'selected node or operation differs');
  return withAzureTerraformPowerLifecycle(
    directory,
    deadline,
    seal,
    async (step) => {
      const graphRead = () =>
        step(() =>
          readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier),
        );
      const graph = await graphRead(),
        graphSha256 = canonicalSha256(graph),
        row = graph.checkpoint.snapshot?.checkpoint.nodes.find((node) => node.node === selectedNode),
        historyNode = graph.nodes.find((node) => node.node === selectedNode);
      require(row && historyNode?.preflightPresent, 'selected stage lacks original serial preflight');
      const history = selectedOperation === 'deallocate' ? historyNode.deallocate : historyNode.start;
      require(!history.receipts.release &&
        !history.receipts.current &&
        !history.packetSha256ByName[
          `${plan.planId}-terraform-network-node-${selectedNode}-${selectedOperation}-mutation-complete.json`
        ], 'submitted completion requires separately qualified state release');
      const mutation = await step(() =>
          azureTerraformNetworkPowerDeployment(plan, row.before, selectedNode, selectedOperation),
        ),
        release = await step(() =>
          azureTerraformNetworkPowerDeployment(plan, row.before, selectedNode, selectedOperation, true),
        );
      require(mutation.stage &&
        graph.powerDeployments.some((deployment) =>
          same(deployment, mutation),
        ), 'selected runner lacks exact original graph identity');
      const root = join(directory, 'terraform-stages'),
        stageDirectory = join(root, mutation.stage),
        runnerDirectory = join(stageDirectory, mutation.deploymentId);
      const inventory = async (path: string) =>
        step(async () => {
          const stat = await lstat(path);
          require(stat.isDirectory() &&
            !stat.isSymbolicLink() &&
            stat.uid === process.getuid?.() &&
            (stat.mode & 0o077) === 0 &&
            (await realpath(path)) === path, 'stage directory ownership differs');
          return (await readdir(path)).sort();
        });
      const names = await inventory(root),
        stageNames = await inventory(stageDirectory);
      const selected = names.filter((name) => name.startsWith(`network-${plan.planSha256.slice(0, 24)}-`));
      require(selected.every((stage) => graph.powerDeployments.some((deployment) => deployment.stage === stage)) &&
        same(stageNames, [mutation.deploymentId]), 'foreign or orphan selected runner');
      const runnerNames = await inventory(runnerDirectory);
      require(!runnerNames.includes('configuration-transition.json') &&
        !runnerNames.includes(
          'artifact-retirement.json',
        ), 'pending revision or retired runner requires owner recovery');
      const name = `azure-power-cancel-${canonicalSha256({ planSha256: plan.planSha256, selectedNode, selectedOperation }).slice(0, 24)}.json`;
      const optional = async () => {
        try {
          return await step(() => read.call(store, name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      };
      let saved = await optional();
      const session = await step(() => open.call(terraform, owner, mutation, 'current')),
        configuration = session.readConfigurationSha256,
        currentJournal = session.readCurrentPlanJournal,
        provenance = session.readUnsubmittedPlanCancellation,
        cancel = session.cancelUnsubmittedPlan,
        applicationHistory = session.readPlanApplicationHistory,
        priorFields = session.readPlannedResourceFields,
        proposedFields = session.readProposedResourceFields;
      require(configuration &&
        currentJournal &&
        provenance &&
        cancel &&
        applicationHistory, 'owning cancellation contract unavailable');
      const methods = () =>
        require(session.readConfigurationSha256 === configuration &&
          session.readCurrentPlanJournal === currentJournal &&
          session.readUnsubmittedPlanCancellation === provenance &&
          session.cancelUnsubmittedPlan === cancel &&
          session.readPlanApplicationHistory === applicationHistory &&
          session.readPlannedResourceFields === priorFields &&
          session.readProposedResourceFields === proposedFields, 'owning runner method changed');
      const bound = {
        schemaVersion: 1,
        owner,
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node: selectedNode,
        operation: selectedOperation,
        stage: mutation.stage,
        mutationDeploymentSha256: canonicalSha256(mutation),
        releaseDeploymentSha256: canonicalSha256(release),
      };
      const manifestOf = (deployment: typeof mutation) => {
        const { configuration: source, providerLock, ...identity } = deployment;
        return { ...identity, configurationSha256: hash(source), providerLockSha256: hash(providerLock) };
      };
      const validatePacket = (input: unknown) =>
        step(() =>
          validateAzureTerraformPowerCancellationPacket(
            plan,
            row.before,
            selectedNode,
            selectedOperation,
            bound,
            input,
            history.receipts.mutation,
          ),
        );
      if (saved === undefined) {
        methods();
        const sha256 = await step(() => configuration.call(session));
        require(sha256 ===
          hash(mutation.configuration), 'unpublished cancellation requires original mutation configuration');
        const journal = await step(() => currentJournal.call(session, sha256, deadline));
        require(journal.schemaVersion === 1 &&
          journal.scope === 'current-saved-plan-byte-and-journal-binding' &&
          journal.planSemanticsQualified === false &&
          journal.manifestSha256 === canonicalSha256(manifestOf(mutation)) &&
          journal.state === 'planned' &&
          journal.receipt &&
          journal.journalSha256 &&
          /^[a-f0-9]{64}$/.test(journal.journalSha256) &&
          journal.savedPlanSha256 === journal.receipt.planSha256, 'exact unsubmitted saved mutation receipt required');
        const receipt = await step(() =>
          validateAzureTerraformNetworkPowerPlan(
            plan,
            row.before,
            selectedNode,
            selectedOperation,
            journal.receipt,
            'mutation',
          ),
        );
        const prior = await step(() =>
            priorFields.call(session, receipt, azureTerraformNetworkPowerSelections, env, deadline),
          ),
          proposed = await step(() =>
            proposedFields.call(session, receipt, azureTerraformNetworkPowerSelections, env, deadline),
          );
        methods();
        require(same(
          await step(() => currentJournal.call(session, sha256, deadline)),
          journal,
        ), 'original journal changed before cancellation');
        const payload = { ...bound, receipt, originalJournalSha256: journal.journalSha256, prior, proposed };
        saved = { ...payload, status: 'preparing', evidenceSha256: canonicalSha256(payload) };
        await validatePacket(saved);
        require(canonicalSha256(await graphRead()) === graphSha256 &&
          same(await inventory(root), names) &&
          same(await inventory(stageDirectory), stageNames), 'original graph or stage changed before preparing');
        await step(() => write.call(store, name, saved), true);
      }
      const original = await validatePacket(saved);
      methods();
      const observe = async () => {
        methods();
        const observed = await step(() =>
          provenance.call(
            session,
            original.receipt,
            hash(mutation.configuration),
            hash(release.configuration),
            original.evidenceSha256,
            deadline,
          ),
        );
        methods();
        require(['absent', 'pending', 'cancelled'].includes(observed.status) &&
          observed.schemaVersion === 1 &&
          observed.scope === 'exact-unsubmitted-plan-cancellation-provenance' &&
          observed.runnerRetirementQualified === false &&
          observed.retirementQualified === false &&
          observed.applicationOutcomeQualified === false &&
          observed.originalReceiptSha256 === canonicalSha256(original.receipt) &&
          [hash(mutation.configuration), hash(release.configuration)].includes(observed.currentConfigurationSha256) &&
          observed.manifestSha256 ===
            canonicalSha256(
              manifestOf(observed.currentConfigurationSha256 === hash(mutation.configuration) ? mutation : release),
            ) &&
          Array.isArray(observed.originalArchiveSha256s) &&
          observed.originalArchiveSha256s.every((digest) => /^[a-f0-9]{64}$/.test(digest)) &&
          observed.cancellationQualified === (observed.status === 'cancelled') &&
          (observed.status === 'absent'
            ? observed.cancellationRecordSha256 === null && observed.originalArchiveSha256s.length === 0
            : typeof observed.cancellationRecordSha256 === 'string' &&
              /^[a-f0-9]{64}$/.test(observed.cancellationRecordSha256)) &&
          (observed.status !== 'cancelled' ||
            (observed.currentConfigurationSha256 === hash(release.configuration) &&
              observed.originalArchiveSha256s.length > 0)), 'owning cancellation provenance differs');
        return observed;
      };
      const validateOriginalArchive = async (observed: Awaited<ReturnType<typeof observe>>) => {
        const originalHistory = await step(() => applicationHistory.call(session, original.receipt, deadline));
        methods();
        require(originalHistory.schemaVersion === 1 &&
          originalHistory.scope === 'exact-saved-plan-journal-history' &&
          originalHistory.receiptSha256 === canonicalSha256(original.receipt) &&
          originalHistory.incompleteArchives === 0 &&
          originalHistory.applicationOutcomeQualified === false &&
          originalHistory.retirementQualified === false &&
          originalHistory.matches.every((entry) => entry.state === 'planned') &&
          originalHistory.matches.some(
            (entry) =>
              entry.location !== 'current' &&
              entry.journalSha256 === original.packet.originalJournalSha256 &&
              entry.savedPlanSha256 === original.receipt.planSha256 &&
              entry.manifestSha256 === canonicalSha256(manifestOf(mutation)),
          ), 'cancelled receipt lacks exact original archived journal provenance');

        require(same(
          originalHistory.matches.map((entry) => entry.archiveSha256).toSorted(),
          observed.originalArchiveSha256s,
        ), 'owning cancellation archive inventory differs');
        return originalHistory;
      };
      let observed = await observe();
      let originalHistory: Awaited<ReturnType<typeof validateOriginalArchive>>;
      require(canonicalSha256(await graphRead()) === graphSha256 &&
        same(await optional(), saved), 'original graph or cancellation packet changed');
      methods();
      if (original.packet.status === 'cancelled') {
        originalHistory = await validateOriginalArchive(observed);
        require(observed.status === 'cancelled' &&
          observed.cancellationQualified &&
          same(original.packet.provenance, observed), 'published cancellation lacks exact current original provenance');
      } else {
        if (observed.status === 'absent') {
          const actual = await step(() => currentJournal.call(session, hash(mutation.configuration), deadline));
          require(actual.schemaVersion === 1 &&
            actual.scope === 'current-saved-plan-byte-and-journal-binding' &&
            actual.planSemanticsQualified === false &&
            actual.manifestSha256 === canonicalSha256(manifestOf(mutation)) &&
            actual.state === 'planned' &&
            same(actual.receipt, original.receipt) &&
            actual.journalSha256 === original.packet.originalJournalSha256 &&
            actual.savedPlanSha256 ===
              original.receipt.planSha256, 'preparing receipt lacks exact original current journal');
          const prior = await step(() =>
              priorFields.call(session, original.receipt, azureTerraformNetworkPowerSelections, env, deadline),
            ),
            proposed = await step(() =>
              proposedFields.call(session, original.receipt, azureTerraformNetworkPowerSelections, env, deadline),
            );
          methods();
          require(same(prior, original.packet.prior) &&
            same(proposed, original.packet.proposed) &&
            same(
              await step(() => currentJournal.call(session, hash(mutation.configuration), deadline)),
              actual,
            ), 'preparing packet differs from original current provider projection');
        }
        if (observed.status !== 'cancelled') {
          methods();
          const result = await step(
            () =>
              cancel.call(
                session,
                original.receipt,
                hash(mutation.configuration),
                release.configuration,
                original.evidenceSha256,
              ),
            true,
          );
          require(result === hash(release.configuration), 'owning cancellation returned another configuration');
          observed = await observe();
        }
        require(observed.status === 'cancelled' &&
          observed.cancellationQualified &&
          observed.currentConfigurationSha256 === hash(release.configuration) &&
          observed.originalReceiptSha256 === canonicalSha256(original.receipt) &&
          observed.originalArchiveSha256s.length > 0, 'exact original cancellation remains pending');
        methods();
        require(canonicalSha256(await graphRead()) === graphSha256 &&
          same(await optional(), saved), 'original graph or preparing packet changed after cancellation');
        originalHistory = await validateOriginalArchive(observed);
        saved = { ...original.packet, status: 'cancelled', provenance: observed };
        await validatePacket(saved);
        await step(() => write.call(store, name, saved), true);
      }
      methods();
      const finalOriginalHistory = await validateOriginalArchive(observed);
      require(same(finalOriginalHistory, originalHistory), 'original cancellation archive changed across publication');
      require(same(await optional(), saved) &&
        same(await observe(), observed) &&
        canonicalSha256(await graphRead()) === graphSha256 &&
        same(await inventory(root), names) &&
        same(await inventory(stageDirectory), stageNames), 'cancellation publication or original identity changed');
      seal();
      return {
        schemaVersion: 1 as const,
        scope: 'selected-network-power-unsubmitted-cancellation' as const,
        planSha256: plan.planSha256,
        stage: mutation.stage,
        node: selectedNode,
        operation: selectedOperation,
        cancellationPacketSha256: canonicalSha256(saved),
        localCancellationQualified: true as const,
        applicationOutcomeQualified: false as const,
        runnerRetirementQualified: false as const,
        parentRetirementQualified: false as const,
        retirementQualified: false as const,
      };
    },
    {
      beforeLock: (step) => step(() => verify.call(store)),
      interrupted: (completion) => new AzureTerraformPowerCancellationInterrupted(completion),
      releaseFailure: () => {
        throw Error('Azure Terraform network power cancellation: owning cancellation locks could not be released');
      },
    },
  );
}

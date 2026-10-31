import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import { qualifyAzureTerraformNetworkTerminalJournalCustody } from './terraform-network-destroy-journal-custody';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import {
  qualifyAzureTerraformNetworkParentPublishedEnvelope,
  readAzureTerraformNetworkParentInventory,
  recheckAzureTerraformNetworkParentInventory,
} from './terraform-network-parent-inventory';
import { qualifyAzureTerraformNetworkRetiredMainCustody } from './terraform-network-retired-main-custody';
import { compileAzureTerraformTeardown } from './terraform-teardown';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const name = 'azure-terraform-terminal-cleanup.json';
const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure network terminal main retirement: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v as Record<string, unknown>;
}
/** Owning lifecycle-lock operation after the ordinary empty final plan. Freeze qualified
 * network custody before native main retirement. Resume from the permanent native barrier
 * without asking for deleted main archives. Cloud/platform absence belongs to the caller's
 * fresh owning verifier; this helper admits no parent, outer-root or public cleanup claim.
 */
export async function retireAzureTerraformNetworkTerminalMain(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  beforeRetirement: (signal: AbortSignal) => Promise<void>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    originalContext = structuredClone(context.terminalCleanup),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    environment = { ...env },
    terraform = context.terraform,
    site = structuredClone(context.site),
    { publicSession, loaders, verifier, replacementVerifier } = context;
  const dependencies: Array<{ target: object; key: string; value: unknown }> = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  // These owning snapshots stay private and unchanged for the operation. Hash the expected
  // side once; every external boundary still freshly hashes its current owning inputs.
  const originalSha256 = canonicalSha256({ value: original }),
    originalContextSha256 = canonicalSha256({ value: originalContext }),
    teardownSha256 = canonicalSha256({ value: teardown }),
    ownerSha256 = canonicalSha256({ value: owner }),
    siteSha256 = canonicalSha256({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    require(canonicalSha256({ value: request }) === originalSha256 &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, originalContextSha256) &&
      canonicalSha256({ value: context.destroyTeardown }) === teardownSha256 &&
      canonicalSha256({ value: store.owner }) === ownerSha256 &&
      store.directory === directory &&
      context.terraform === terraform &&
      canonicalSha256({ value: context.site }) === siteSha256 &&
      context.publicSession === publicSession &&
      context.loaders === loaders &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning request or dependency changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await step(() => store.verify());
  require(same(azureUpgradeBinding(original).owner, owner) &&
    same(
      compileAzureTerraformTeardown(
        original,
        teardown.drain,
        teardown.retirement,
        teardown.pendingAdmissionJournalSha256,
      ),
      teardown,
    ), 'compiled teardown differs');
  require(same(await step(() => store.read(`${teardown.planId}.json`)), teardown) &&
    same(await step(() => store.read(`${teardown.planId}-authorization.json`)), {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    }), 'saved authorization differs');
  let checkpoint = object(await step(() => store.read(name)));
  require(same(checkpoint, originalContext) &&
    ['retiring', 'retired'].includes(String(checkpoint.phase)), 'owning final checkpoint required');
  const final = object(checkpoint.final) as unknown as PlanReceipt;
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  require(final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.deploymentId === deployment.deploymentId &&
    final.backendIdentity === deployment.backendIdentity &&
    final.configurationSha256 === hash(deployment.configuration) &&
    final.providerLockSha256 === hash(deployment.providerLock) &&
    final.noChanges &&
    sha(final.planSha256) &&
    Array.isArray(final.changes) &&
    final.changes.length === 0 &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments, 'ordinary empty final receipt differs');
  if (checkpoint.phase === 'retired') {
    const frozen = object(checkpoint.retainedNetworkParentInventory),
      nativeEvidence = object(checkpoint.retirementEvidence);
    require(same(nativeEvidence.networkParentInventory, frozen) &&
      frozen.schemaVersion === 1 &&
      frozen.scope === 'native-bound-network-parent-inventory' &&
      same(frozen.owner, owner) &&
      frozen.originalPlanSha256 === original.planSha256 &&
      frozen.teardownPlanSha256 === teardown.planSha256 &&
      frozen.parentRetirementQualified === false, 'retired parent inventory binding differs');
    const custody = await step(() => qualifyAzureTerraformNetworkRetiredMainCustody(request, store, context, deadline));
    return {
      checkpoint: structuredClone(checkpoint),
      custody,
      resumed: true as const,
      parentRetirementQualified: false as const,
    };
  }
  let sameCallParentInventory: Awaited<ReturnType<typeof readAzureTerraformNetworkParentInventory>> | undefined;
  if (!checkpoint.retainedTerminalNetworkCustody) {
    const terminal = await step(() =>
      qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, context, deadline),
    );
    require(terminal.mainRunnerRetirementQualified === false, 'pre-retirement terminal custody required');
    // The owning absence callback precedes enrollment. Enrollment completes its full
    // terminal freshness recheck and exhaustive snapshot before this internal publication.
    await step(() => beforeRetirement(deadline));
    const parentInventory = await step(() =>
      readAzureTerraformNetworkParentInventory(request, store, context, terminal, deadline),
    );
    const evidence = {
      ...object(checkpoint.retirementEvidence),
      terminalNetwork: structuredClone(terminal),
      networkParentInventory: structuredClone(parentInventory),
    };
    checkpoint = {
      ...checkpoint,
      retainedTerminalNetworkCustody: structuredClone(terminal),
      retainedNetworkParentInventory: structuredClone(parentInventory),
      retirementEvidence: evidence,
      retirementEvidenceSha256: canonicalSha256(evidence),
    };
    await step(() => store.write(name, checkpoint));
    sameCallParentInventory = parentInventory;
  }
  const evidence = object(checkpoint.retirementEvidence),
    retained = object(checkpoint.retainedTerminalNetworkCustody),
    frozenInventory = object(checkpoint.retainedNetworkParentInventory);
  require(same(evidence.networkParentInventory, frozenInventory) &&
    frozenInventory.schemaVersion === 1 &&
    frozenInventory.scope === 'native-bound-network-parent-inventory' &&
    same(frozenInventory.owner, owner) &&
    frozenInventory.originalPlanSha256 === original.planSha256 &&
    frozenInventory.teardownPlanSha256 === teardown.planSha256 &&
    frozenInventory.parentRetirementQualified === false, 'frozen parent inventory differs');
  require(sha(checkpoint.retirementEvidenceSha256) &&
    checkpoint.retirementEvidenceSha256 === canonicalSha256(evidence) &&
    same(evidence.terminalNetwork, retained) &&
    retained.currentEmptyMainJournalCustodyQualified === true &&
    retained.mainRunnerRetirementQualified === false &&
    retained.originalPlanSha256 === original.planSha256 &&
    retained.teardownPlanSha256 === teardown.planSha256 &&
    same(retained.owner, owner), 'frozen terminal custody differs');
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const readRetirement = session.readArtifactRetirement,
    retire = session.retireArtifacts;
  require(readRetirement && retire, 'native retirement and permanent barrier interfaces required');
  dependencies.push(
    { target: session, key: 'readArtifactRetirement', value: readRetirement },
    { target: session, key: 'retireArtifacts', value: retire },
  );
  const evidenceSha256 = checkpoint.retirementEvidenceSha256;
  let observed = await step(() => readRetirement.call(session, final, evidenceSha256, deadline));
  const resumedFromBarrier = observed.status === 'runner-artifacts-retired';
  if (observed.status !== 'runner-artifacts-retired') {
    // An absent marker still has main archives: authenticate the frozen snapshot against them.
    // A partial native marker already binds that exact snapshot and independent cleanup digest.
    if (observed.status === 'absent') {
      const frozenContext = { ...context, terminalCleanup: checkpoint };
      if (sameCallParentInventory) {
        await step(() => beforeRetirement(deadline));
        await step(() =>
          qualifyAzureTerraformNetworkParentPublishedEnvelope(
            sameCallParentInventory,
            request,
            store,
            context,
            frozenContext,
            deadline,
          ),
        );
      } else {
        const terminal = await step(() =>
          qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, frozenContext, deadline),
        );
        const { recordSha256: currentRecordSha256, ...currentProof } = object(terminal);
        const { recordSha256: frozenRecordSha256, ...frozenProof } = retained;
        // Writing the frozen envelope changes its own parent record digest. Every native,
        // public, lineage, child and receipt binding must remain exactly equal.
        require(sha(currentRecordSha256) &&
          sha(frozenRecordSha256) &&
          same(currentProof, frozenProof), 'frozen terminal custody changed before retirement');
        const currentInventory = await step(() =>
          readAzureTerraformNetworkParentInventory(request, store, frozenContext, terminal, deadline),
        );
        const { terminalFile: currentTerminalFile, ...currentParentInventory } = currentInventory;
        const { terminalFile: frozenTerminalFile, ...retainedParentInventory } = frozenInventory;
        // The owning envelope publication atomically replaces only this checkpoint.
        // Every other parent byte, inode, directory, source, child and decision remains exact.
        require(sha(object(currentTerminalFile).sha256) &&
          sha(object(frozenTerminalFile).sha256) &&
          same(currentParentInventory, retainedParentInventory), 'frozen parent inventory changed before retirement');
        await step(() => beforeRetirement(deadline));
        await step(() =>
          recheckAzureTerraformNetworkParentInventory(currentInventory, request, store, frozenContext, deadline),
        );
      }
    } else {
      require(observed.status === 'retiring' &&
        sha(observed.independentCleanupSha256), 'native partial barrier differs');
      await step(() => beforeRetirement(deadline));
    }
    require(same(await step(() => store.read(name)), checkpoint), 'saved frozen checkpoint changed');
    const receipt = await step(() => retire.call(session, final, evidenceSha256, environment, deadline));
    observed = await step(() => readRetirement.call(session, final, evidenceSha256, deadline));
    require(observed.status === 'runner-artifacts-retired' &&
      same(observed.receipt, receipt), 'native retirement acknowledgement lacks permanent proof');
  }
  require(observed.status === 'runner-artifacts-retired', 'native permanent main barrier required');
  checkpoint = { ...checkpoint, phase: 'retired', artifacts: structuredClone(observed.receipt) };
  await step(() => store.write(name, checkpoint));
  const retiredContext = { ...context, terminalCleanup: checkpoint };
  const custody = await step(() =>
    qualifyAzureTerraformNetworkRetiredMainCustody(request, store, retiredContext, deadline),
  );
  return {
    checkpoint: structuredClone(checkpoint),
    custody,
    resumed: resumedFromBarrier,
    parentRetirementQualified: false as const,
  };
}

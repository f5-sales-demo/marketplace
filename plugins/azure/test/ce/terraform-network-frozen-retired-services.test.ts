import { expect, test } from 'bun:test';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import { CeApiError } from '../../../platform/src/ce/runtime';
import { collectCeUnregisteredAbsence } from '../../../platform/src/ce/teardown-inventory';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import {
  qualifyAzureTerraformNetworkFreshParentAbsence,
  recheckAzureTerraformNetworkFreshParentAbsence,
} from '../../src/ce/terraform-network-fresh-parent-absence';
import {
  qualifyAzureTerraformNetworkFrozenRetiredServices,
  recheckAzureTerraformNetworkFrozenRetiredServices,
} from '../../src/ce/terraform-network-frozen-retired-services';
import type { readAzureTerraformNetworkParentInventory } from '../../src/ce/terraform-network-parent-inventory';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { qualifyAzureTerraformNetworkPostPlaintextParentCustody } from '../../src/ce/terraform-network-post-plaintext-parent-custody';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import {
  qualifyAzureTerraformNetworkPostPlaintextMainCustody,
  qualifyAzureTerraformNetworkRetiredMainCustody,
  recheckAzureTerraformNetworkRetiredMainNativeCustody,
} from '../../src/ce/terraform-network-retired-main-custody';
import {
  qualifyAzureTerraformNetworkRetiredBootstrapPackets,
  retireAzureTerraformNetworkBootstrapPackets,
  retireAzureTerraformNetworkSensitivePackets,
} from '../../src/ce/terraform-network-sensitive-packet-retirement';
import { retireAzureTerraformNetworkTerminalMain } from '../../src/ce/terraform-network-terminal-main-retirement';
import { retireAzureTerraformNetworkTerminalPlaintext } from '../../src/ce/terraform-network-terminal-plaintext-retirement';
import { prepareAzureTerraformNetworkTerminalPlanning } from '../../src/ce/terraform-network-terminal-planning';
import { qualifyAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-update-source';
import { loadAzureTerraformOutcome, saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import {
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementSource,
} from '../../src/ce/terraform-replacement';
import { beginAzureTerraformRetirement } from '../../src/ce/terraform-retirement';
import { compileAzureTerraformTeardown } from '../../src/ce/terraform-teardown';
import { qualifyAzureTerraformTeardownStageHistory } from '../../src/ce/terraform-teardown-stage-history';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { lineageCleanupEvidence } from './terraform-network-lineage-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { completedReplacement } from './terraform-network-mixed-generation-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { networkReplacementExecutorFixture } from './terraform-network-replacement-executor-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

test('native packet and bootstrap retirement preserve custody across fresh absence, interruption and read-only process replay', async () => {
  const before = new Set(nicExecutionRoots);
  const birth = await terraformNetworkSourceFixture(true);
  const original = await originalNativeWorkflowFixture(
    true,
    false,
    birth.original.intent.nics,
    birth.original.computeCapacity.quotaAvailable,
    true,
  );
  const publicDirectory = await mkdtemp(join(tmpdir(), 'original-network-native-seed-'));
  let next = 0;
  const paths = new Map<string, string>();
  const session: SessionManagerLike = {
    getSessionId: () => 'original-network-native-seed',
    getArtifactsDir: () => publicDirectory,
    async getArtifactPath(id) {
      return paths.get(id) ?? null;
    },
    async saveArtifact(content, tool) {
      const id = String(++next),
        path = join(publicDirectory, `${id}.${tool}.log`);
      await writeFile(path, content, { mode: 0o600 });
      paths.set(id, path);
      return id;
    },
  };
  process.stdout.write(
    `${JSON.stringify({ phase: 'exact-owned-source-fixture-identities', root: original.storage.directory.slice(0, original.storage.directory.lastIndexOf('/')), publicDirectory, rootIdentity: await lstat(original.storage.directory.slice(0, original.storage.directory.lastIndexOf('/'))).then((stat) => ({ dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, uid: stat.uid })), publicIdentity: await lstat(publicDirectory).then((stat) => ({ dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, uid: stat.uid })) })}\n`,
  );
  let nativeStarted: number | undefined;
  try {
    expect(original.plan).toEqual(birth.original);
    const originalOutcome = birth.outcomes.get(original.plan.planSha256);
    if (!originalOutcome) throw Error('Original outcome required');
    const registrations = structuredClone(originalOutcome.registrations);
    original.runtime.reserveSite = async (binding, publish) => {
      expect(binding.owner).toEqual(original.storage.owner);
      await publish(structuredClone(birth.records.get('terraform-site.json')) as Parameters<typeof publish>[0]);
    };
    original.runtime.approveRegistrations = async () =>
      structuredClone(registrations) as Awaited<ReturnType<typeof original.runtime.approveRegistrations>>;
    original.runtime.observeRegistrations = async () =>
      structuredClone(registrations) as Awaited<ReturnType<typeof original.runtime.observeRegistrations>>;
    original.runtime.observeRegisteredConfiguration = async (_binding, _instances, interfaces) =>
      ({
        owner: original.storage.owner,
        siteName: original.plan.siteName,
        evidenceKind: 'registration-hardware-inventory',
        source: `/api/register/namespaces/system/registrations_by_site/${original.plan.siteName}`,
        interfaces: interfaces.map((row) => ({
          ...row,
          device: `eth${original.plan.nics.find((nic) => nic.role === row.role)?.index}`,
        })),
        status: 'configured',
        siteUid: birth.site.siteUid,
      }) as Awaited<ReturnType<typeof original.runtime.observeRegisteredConfiguration>>;
    await savePlanArtifact(session, original.plan, birth.current);
    process.stdout.write(`${JSON.stringify({ phase: 'original-apply-begin', monotonicMs: performance.now() })}\n`);
    const outcome = await original.run();
    expect(outcome.status).toBe('registered');
    await saveAzureTerraformOutcome(session, outcome);
    const sources = new Map([[original.plan.planSha256, original.plan]]);
    const loaders = {
      async loadSource(digest: string) {
        const plan = sources.get(digest);
        if (!plan) throw Error('unresolved native original source');
        return structuredClone(plan);
      },
      loadOutcome: (plan: typeof original.plan) => loadAzureTerraformOutcome(session, plan),
    };
    const network = compileAzureTerraformNetworkUpdatePlan(birth.plan, original.plan);
    const api: typeof original.api = {
      exec: (command, args, options) =>
        args[0] === 'network' && args[1] === 'vnet'
          ? birth.api.exec(command, args, options)
          : original.api.exec(command, args, options),
    };
    const inventory = await captureAzureNetworkUpdateInventory(network, api);
    expect(Object.values(inventory.nodes).flatMap((vm) => Object.values(vm.nics))).toHaveLength(6);
    const source = await original.runner.readConfiguration(await original.runner.readConfigurationSha256());
    const binding = await qualifyAzureTerraformNetworkUpdateSource(
      network,
      source,
      inventory,
      original.storage,
      loaders.loadSource,
      loaders.loadOutcome,
      birth.lock,
      birth.site,
    );
    expect(binding.originalPlanSha256).toBe(original.plan.planSha256);
    expect(binding.sourceConfigurationSha256).toBe(birth.hash(source));
    expect(binding.siteUid).toBe(birth.site.siteUid);
    sources.set(network.planSha256, network);
    const originalRecords = new Map<string, unknown>();
    for (const name of ['terraform-workflow.json', 'terraform-site.json'])
      originalRecords.set(name, await original.storage.read(name));
    const driver = await terraformNetworkSerialPowerFixture(
      true,
      async (request) => lineageCleanupEvidence(request, '1.16.5'),
      {
        plan: network,
        inventory,
        source,
        store: original.storage,
        sources,
        outcomes: new Map([[original.plan.planSha256, outcome as unknown as Record<string, unknown>]]),
        originalRecords,
      },
    );
    await savePlanArtifact(session, network, birth.current);
    process.stdout.write(`${JSON.stringify({ phase: 'network-driver-begin', monotonicMs: performance.now() })}\n`);
    const networkOutcome = await driver.run();
    expect(networkOutcome.status).toBe('complete');
    await saveAzureTerraformOutcome(session, networkOutcome);
    expect(driver.vmPowerActions).toEqual(['deallocate', 'start', 'deallocate', 'start', 'deallocate', 'start']);
    expect(await original.storage.read('terraform-workflow.json')).toEqual(
      originalRecords.get('terraform-workflow.json'),
    );
    expect(await original.storage.read('terraform-site.json')).toEqual(originalRecords.get('terraform-site.json'));
    const main = await terraformNetworkMainRunnerFixture(true, undefined, driver, false, {
      runner: original.runner,
      commands: original.commands,
      archiveReceipt: original.archiveReceipt,
      appendPlan: async (receipt) => {
        await original.archiveReceipt(receipt, await original.runner.readConfiguration(receipt.configurationSha256));
        return receipt;
      },
    });
    const history = await main.runHistory();
    expect(history.originalPublishedJournalsQualified).toBe(true);
    expect(history.terminalPublishedJournalsQualified).toBe(true);
    const bound = await terraformNetworkBoundReplacementFixture(true, false, true, { birth, network, driver });
    const replacement = await networkReplacementExecutorFixture(
      true,
      false,
      {
        fixture: bound,
        newVmId: '00000000-0000-4000-8000-000000000099',
        replacementVerifier: async () => {
          throw Error('No prior replacement exists in original-to-network seed');
        },
      },
      true,
    );
    sources.set(replacement.input.plan.planSha256, replacement.input.plan);
    await savePlanArtifact(session, replacement.input.plan, birth.current);
    process.stdout.write(`${JSON.stringify({ phase: 'replacement-begin', monotonicMs: performance.now() })}\n`);
    const replacementOutcome = await replacement.run();
    expect(replacementOutcome.status).toBe('complete');
    await saveAzureTerraformOutcome(session, replacementOutcome);
    expect(await original.storage.read('terraform-workflow.json')).toEqual(
      originalRecords.get('terraform-workflow.json'),
    );
    const proof = await readAzureTerraformNetworkReplacementReceiptProvenance(
      replacement.input.plan,
      original.storage,
      loaders,
      birth.site,
      replacement.dependencies.qualifyHistorical,
      replacement.dependencies.qualifyCompletedOperational,
    );
    const checkpoint = validateAzureTerraformReplacementCheckpoint(
      replacement.input.plan,
      await original.storage.read(`${replacement.input.plan.planId}-terraform-replacement.json`),
    );
    const material = validateAzureTerraformReplacementSource(
      replacement.input.plan,
      checkpoint,
      await original.storage.read(`${replacement.input.plan.planId}-terraform-replacement-source.json`),
    );
    const configurations = new Map([
      [birth.hash(replacement.binding.source), replacement.binding.source],
      [material.stages.quiesce.configurationSha256, material.stages.quiesce.configuration],
      [material.stages.launch.configurationSha256, material.stages.launch.configuration],
    ]);
    for (const row of proof.receipts) {
      const configuration = configurations.get(row.receipt.configurationSha256);
      if (!configuration) throw Error('Unresolved exact replacement source');
      await original.archiveReceipt(row.receipt, configuration);
    }
    const completed = await completedReplacement(true, true, { fixture: replacement, result: replacementOutcome });
    sources.set(completed.next.planSha256, completed.next);
    await savePlanArtifact(session, completed.next, birth.current);
    const teardownBinding = azureUpgradeBinding(original.plan);
    const originalReservation = (await original.storage.read('terraform-site.json')) as {
      contractFingerprint?: string;
    };
    if (typeof originalReservation.contractFingerprint !== 'string')
      throw Error('Owning original site contract required');
    const drain: Parameters<typeof compileAzureTerraformTeardown>[1] = {
      schemaVersion: 1,
      owner: teardownBinding.owner,
      sourcePlanSha256: original.plan.planSha256,
      siteContractFingerprint: originalReservation.contractFingerprint,
      ingressContractFingerprint: `sha256:${'c'.repeat(64)}`,
      sites: [{ binding: teardownBinding, routing: [], siteUid: birth.site.siteUid }],
      listeners: [],
      origins: [],
    };
    const teardown = compileAzureTerraformTeardown(original.plan, drain, [
      {
        siteName: original.plan.siteName,
        siteUid: birth.site.siteUid,
        physicalSiteUid: 'fixture-physical-site-uid',
        tokens: [
          ...teardownBinding.nodes.map((node, index) => ({
            node,
            name: `${original.plan.deploymentName.slice(0, 40)}-${index + 1}-${original.plan.planSha256.slice(0, 12)}`,
          })),
          {
            node: `${replacement.input.plan.deploymentName}-${checkpoint.node}`,
            name: `${replacement.input.plan.deploymentName.slice(0, 40)}-${checkpoint.node}-${replacement.input.plan.planSha256.slice(0, 12)}`,
          },
        ],
      },
    ]);
    await original.storage.write(`${teardown.planId}.json`, teardown);
    await original.storage.write(`${teardown.planId}-authorization.json`, {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: original.plan.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    });
    await beginAzureTerraformRetirement(original.plan, teardown, original.storage);
    const destroy = await original.runner.planDestroy({});
    expect(destroy.operation).toBe('destroy');
    expect(destroy.noChanges).toBe(false);
    expect(destroy.changes.every((change) => change.actions.join(',') === 'delete')).toBe(true);
    await original.storage.write('azure-terraform-cloud-destroy-plan.json', destroy);
    await original.runner.apply(destroy, {});
    const emptyDestroy = await original.runner.planDestroy({});
    expect(emptyDestroy.operation).toBe('destroy');
    expect(emptyDestroy.noChanges).toBe(true);
    expect(emptyDestroy.changes).toHaveLength(0);
    await original.storage.write('azure-terraform-cloud-destroy-final.json', emptyDestroy);
    const readOnlyService = main.service;
    const owningService: typeof main.service = {
      ...readOnlyService,
      async open(owner, deployment, resume) {
        if (deployment.stage === undefined && deployment.deploymentId === original.plan.deploymentName)
          return original.terraform.open(owner, deployment, resume);
        return readOnlyService.open(owner, deployment, resume);
      },
    };
    const networkContext = {
      publicSession: session,
      terraform: owningService,
      loaders,
      site: birth.site,
      verifier: replacement.dependencies.qualifyHistorical,
      replacementVerifier: replacement.dependencies.qualifyCompletedOperational,
      destroyTeardown: teardown,
    };
    const terminalStages = await qualifyAzureTerraformTeardownStageHistory(
      original.plan,
      original.storage,
      undefined,
      networkContext,
    );
    expect(terminalStages.stages).toEqual([...driver.stages.keys()].sort());
    expect(terminalStages.network?.publicJournalCustodyQualified).toBe(true);
    expect(terminalStages.network?.powerRunnerRetirementQualified).toBe(true);
    expect(terminalStages.network?.mainRunnerRetirementQualified).toBe(false);
    expect(terminalStages.network?.parentRetirementQualified).toBe(false);
    expect(terminalStages.network?.currentOperationalAcceptanceQualified).toBe(false);
    // Terminal cleanup needs separately retained, exact child identities and marker
    // custody before main journal retirement. A stage-name list cannot supply these bindings.
    if (!terminalStages.network) throw Error('Qualified terminal network required');
    const children = Reflect.get(terminalStages.network, 'retainedPowerChildren') as Array<{
      networkPlanSha256: string;
      node: number;
      operation: string;
      stage: string;
      retirementSha256: string;
      proof: unknown;
    }>;
    expect(children).toHaveLength(6);
    expect(new Set(children.map((child) => `${child.networkPlanSha256}:${child.node}:${child.operation}`)).size).toBe(
      6,
    );
    expect(Reflect.get(terminalStages.network, 'retainedPowerChildren')).toEqual(children);
    const beforePlanning = original.commands.length;
    process.stdout.write(`${JSON.stringify({ phase: 'terminal-planning-begin', monotonicMs: performance.now() })}\n`);
    const prepared = await prepareAzureTerraformNetworkTerminalPlanning(
      original.plan,
      original.storage,
      networkContext,
      async () => ({ fixture: 'synthetic-platform-and-cloud-absence', owner: original.storage.owner }),
      {},
    );
    expect(prepared.recoveredExistingPlan).toBe(false);
    expect(prepared.checkpoint.phase).toBe('retiring');
    const preparedFinal = prepared.checkpoint.final as import('../../../terraform/src/runner').PlanReceipt;
    expect(preparedFinal.noChanges).toBe(true);
    expect(preparedFinal.changes).toHaveLength(0);
    expect(preparedFinal.operation).toBe(undefined);
    expect(prepared.mainRunnerRetirementQualified).toBe(false);
    expect(prepared.parentRetirementQualified).toBe(false);
    expect(prepared.independentCloudCleanupQualified).toBe(false);
    // Exactly one native ordinary plan invocation, without apply, follows cancellation.
    const planningCommands = original.commands.slice(beforePlanning);
    expect(planningCommands.filter((command) => command === 'plan')).toHaveLength(1);
    expect(planningCommands.some((command) => command === 'apply')).toBe(false);
    process.stdout.write(`${JSON.stringify({ phase: 'native-main-begin', monotonicMs: performance.now() })}\n`);
    nativeStarted = performance.now();
    const retired = await retireAzureTerraformNetworkTerminalMain(
      original.plan,
      original.storage,
      { ...networkContext, terminalCleanup: prepared.checkpoint },
      async () => {},
      {},
    );
    process.stdout.write(
      `${JSON.stringify({ phase: 'native-main-operation-completed', durationMs: performance.now() - nativeStarted, budgetMs: 180000 })}\n`,
    );
    expect(retired.custody.mainRunnerRetirementQualified).toBe(true);
    expect(retired.parentRetirementQualified).toBe(false);
    const frozen = retired.checkpoint.retainedNetworkParentInventory as Awaited<
      ReturnType<typeof readAzureTerraformNetworkParentInventory>
    >;
    expect(frozen.children).toHaveLength(6);
    expect(frozen.sensitiveStagingDecisions).toHaveLength(9);
    expect(frozen.completeParentDispositionQualified).toBe(true);
    const expectedParentFiles = [
      ...frozen.files.filter((file) => !file.path.startsWith(`${frozen.mainDirectory}/`)),
      frozen.terminalFile,
    ];
    expect(frozen.parentArtifactDecisions).toHaveLength(expectedParentFiles.length);
    expect(new Set(frozen.parentArtifactDecisions.map((row) => row.path)).size).toBe(expectedParentFiles.length);
    for (const file of expectedParentFiles) {
      const decision = frozen.parentArtifactDecisions.find((row) => row.path === file.path);
      if (!decision) throw Error('Native frozen parent decision missing');
      expect(decision.identity).toBe(file.identity);
      expect(decision.sha256).toBe(file.sha256);
      expect(decision.packetSha256).toBe(file.packetSha256);
    }
    expect(frozen.parentDirectoryDecisions).toHaveLength(frozen.directories.length);
    expect(frozen.originalDirectories.originalReceiptMetadataQualified).toBe(true);
    expect(frozen.parentRetirementQualified).toBe(false);
    expect(frozen.networkPacketNames.length).toBeGreaterThan(0);
    expect(Reflect.get(retired.checkpoint.retirementEvidence as object, 'networkParentInventory')).toEqual(frozen);
    const ordinary = retired.checkpoint.final as import('../../../terraform/src/runner').PlanReceipt;
    const nativeSession = await owningService.open(
      original.storage.owner,
      await azureTerraformCurrentDeployment(original.plan),
      'current',
    );
    if (!nativeSession.readArtifactRetirement) throw Error('Permanent barrier required');
    const native = await nativeSession.readArtifactRetirement(
      ordinary,
      retired.checkpoint.retirementEvidenceSha256 as string,
    );
    expect(native.status).toBe('runner-artifacts-retired');
    if (native.status !== 'runner-artifacts-retired') throw Error('Completed native barrier required');
    expect(native.receipt.evidenceSha256).toBe(canonicalSha256(retired.checkpoint.retirementEvidence));
    const commands = [...original.commands];
    // The new post-plaintext acceptance follows native retirement. Its own original
    // 180000ms deadline and this fixture's existing 600000ms cap remain unchanged.
    const plaintextContext = { ...networkContext, terminalCleanup: retired.checkpoint };
    const preabort = new AbortController();
    preabort.abort(Error('plaintext preabort'));
    await expect(
      retireAzureTerraformNetworkTerminalPlaintext(
        original.plan,
        original.storage,
        plaintextContext,
        async () => {},
        preabort.signal,
      ),
    ).rejects.toThrow('plaintext preabort');
    const transformationStarted = performance.now();
    const transformed = await retireAzureTerraformNetworkTerminalPlaintext(
      original.plan,
      original.storage,
      plaintextContext,
      async () => {},
    );
    process.stdout.write(
      `${JSON.stringify({
        phase: 'terminal-plaintext-transformation-completed',
        durationMs: performance.now() - transformationStarted,
        budgetMs: 180000,
      })}\n`,
    );
    expect(Object.hasOwn(transformed.checkpoint, 'retainedDestroyConfiguration')).toBe(false);
    expect(transformed.retainedDestroyConfigurationSha256).toBe(frozen.retainedDestroyConfigurationSha256);
    expect(transformed.checkpoint.retainedNetworkParentInventory).toEqual(frozen);
    expect(transformed.checkpoint.retirementEvidence).toEqual(retired.checkpoint.retirementEvidence);
    expect(transformed.mainMarkerSha256).toBe(retired.custody.mainMarkerSha256);
    expect(transformed.parentRetirementQualified).toBe(false);
    expect(await original.storage.read('azure-terraform-terminal-cleanup.json')).toEqual(transformed.checkpoint);
    expect(original.commands).toEqual(commands);
    const postContext = { ...networkContext, terminalCleanup: transformed.checkpoint };
    process.stdout.write(
      `${JSON.stringify({ phase: 'post-plaintext-native-custody-begin', monotonicMs: performance.now() })}\n`,
    );
    const post = await qualifyAzureTerraformNetworkPostPlaintextMainCustody(
      original.plan,
      original.storage,
      postContext,
    );
    expect(post.mainRunnerRetirementQualified).toBe(true);
    expect(post.parentRetirementQualified).toBe(false);
    expect(post.scope).toBe('post-plaintext-retired-main-authenticated-network-stage-custody');
    expect(post.retainedPowerChildren).toEqual(retired.custody.retainedPowerChildren);
    expect(post.mainMarkerSha256).toBe(retired.custody.mainMarkerSha256);
    expect(post.independentCloudCleanupQualified).toBe(false);
    await expect(
      qualifyAzureTerraformNetworkRetiredMainCustody(original.plan, original.storage, postContext),
    ).rejects.toThrow('retained destroy source differs');
    await expect(
      recheckAzureTerraformNetworkRetiredMainNativeCustody(
        structuredClone(post),
        original.plan,
        original.storage,
        postContext,
        false,
      ),
    ).rejects.toThrow('owning retired-main witness required');
    await expect(
      recheckAzureTerraformNetworkRetiredMainNativeCustody(
        post,
        original.plan,
        original.storage,
        { ...postContext },
        false,
      ),
    ).rejects.toThrow('owning retired-main witness required');
    await recheckAzureTerraformNetworkRetiredMainNativeCustody(
      post,
      original.plan,
      original.storage,
      postContext,
      false,
    );
    expect(original.commands).toEqual(commands);
    process.stdout.write(
      `${JSON.stringify({ phase: 'frozen-retired-services-parent-begin', monotonicMs: performance.now() })}\n`,
    );
    const parent = await qualifyAzureTerraformNetworkPostPlaintextParentCustody(
      original.plan,
      original.storage,
      postContext,
      post,
    );
    expect(parent.completeParentDispositionQualified).toBe(true);
    process.stdout.write(
      `${JSON.stringify({ phase: 'frozen-retired-services-begin', monotonicMs: performance.now() })}\n`,
    );
    const services = await qualifyAzureTerraformNetworkFrozenRetiredServices(
      original.plan,
      original.storage,
      postContext,
      parent,
    );
    expect(services.nativeServicesQualified).toBe(true);
    expect(services.children).toHaveLength(6);
    expect(new Set(services.children.map((row) => row.stage)).size).toBe(6);
    expect(services.mainMarkerSha256).toBe(retired.custody.mainMarkerSha256);
    expect(services.freshPostDeletionRecoveryQualified).toBe(false);
    expect(services.sensitiveDeletionExecutionQualified).toBe(false);
    expect(services.parentRetirementQualified).toBe(false);
    await expect(
      recheckAzureTerraformNetworkFrozenRetiredServices(
        structuredClone(services),
        original.plan,
        original.storage,
        postContext,
      ),
    ).rejects.toThrow('owning frozen retired services witness required');
    await expect(
      recheckAzureTerraformNetworkFrozenRetiredServices(services, original.plan, original.storage, { ...postContext }),
    ).rejects.toThrow('owning frozen retired services witness required');
    await recheckAzureTerraformNetworkFrozenRetiredServices(services, original.plan, original.storage, postContext);

    // Actual owning collectors execute against synthetic provider responses; this
    // source fixture does not establish installed/live or interface absence.
    const absenceContract = { fingerprint: teardown.drain.ingressContractFingerprint } as VerifiedIngressContract;
    let platformMode = 'absent',
      cloudMode = 'absent';
    const platformReads: string[] = [],
      cloudReads: string[][] = [];
    const absenceRuntime = {
      engine: 'terraform',
      contract: { fingerprint: teardown.drain.siteContractFingerprint },
      unregisteredAbsence(
        bindings: SiteBinding[],
        namespaces: string[],
        contract: VerifiedIngressContract,
        signal?: AbortSignal,
      ) {
        return collectCeUnregisteredAbsence(
          {
            async request(path: string) {
              platformReads.push(path);
              if (platformMode === 'authorization') throw new CeApiError('authorization', 403);
              if (path.includes('/registrations_by_site/') || path.includes('?')) {
                if (platformMode === 'partial') return { items: [], nextToken: 'more' };
                return { items: [], errors: [] };
              }
              throw new CeApiError('not-found', 404);
            },
          },
          bindings,
          namespaces,
          { site: teardown.drain.siteContractFingerprint, ingress: contract.fingerprint },
          signal,
        );
      },
    } as unknown as CeRuntime;
    const residualId = original.plan.ownershipInventory.find((row) => row.action === 'create')?.resourceId;
    if (!residualId) throw Error('exact residual fixture identity required');
    const absenceApi: AzExecApi = {
      async exec(command, args) {
        expect(command).toBe('az');
        cloudReads.push([...args]);
        if (cloudMode === 'service') return { exitCode: 1, stdout: '', stderr: 'synthetic service unavailable' };
        const value =
          args[0] === 'account'
            ? {
                id: cloudMode === 'foreign' ? '00000000-0000-4000-8000-000000000999' : original.plan.subscription.id,
                tenantId: original.plan.subscription.tenantId,
                environmentName: original.plan.subscription.cloud,
                state: 'Enabled',
              }
            : args[0] === 'group'
              ? false
              : cloudMode === 'residual'
                ? [{ id: residualId }]
                : [];
        return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
      },
    };
    process.stdout.write(
      `${JSON.stringify({ phase: 'fresh-external-absence-begin', monotonicMs: performance.now() })}\n`,
    );
    const absence = await qualifyAzureTerraformNetworkFreshParentAbsence(
      original.plan,
      original.storage,
      postContext,
      absenceRuntime,
      absenceContract,
      absenceApi,
    );
    expect(absence.interfaceAbsenceQualified).toBe(false);
    expect(absence.fullExternalCleanupQualified).toBe(false);
    expect(absence.bootstrapRetirementQualified).toBe(false);
    expect(absence.parentRetirementQualified).toBe(false);
    expect(absence.liveQualified).toBe(false);
    expect(absence.evidence.platform.status).toBe('absent');
    expect(absence.evidence.cloud.reads).toHaveLength(3);
    expect(platformReads.filter((path) => path.includes('/registrations_by_site/'))).toHaveLength(2);
    expect(cloudReads.map((args) => args.slice(0, 2))).toEqual([
      ['account', 'show'],
      ['group', 'exists'],
      ['resource', 'list'],
    ]);
    const beforeRecheck = platformReads.length;
    const freshAgain = await recheckAzureTerraformNetworkFreshParentAbsence(
      absence,
      original.plan,
      original.storage,
      postContext,
      absenceRuntime,
      absenceContract,
      absenceApi,
    );
    expect(platformReads.length).toBeGreaterThan(beforeRecheck);
    expect(freshAgain).toMatchObject({ platform: { status: 'absent' } });
    const beforeForeign = platformReads.length;
    await expect(
      recheckAzureTerraformNetworkFreshParentAbsence(
        structuredClone(absence),
        original.plan,
        original.storage,
        postContext,
        absenceRuntime,
        absenceContract,
        absenceApi,
      ),
    ).rejects.toThrow('owning fresh absence witness required');
    await expect(
      recheckAzureTerraformNetworkFreshParentAbsence(
        absence,
        original.plan,
        original.storage,
        { ...postContext },
        absenceRuntime,
        absenceContract,
        absenceApi,
      ),
    ).rejects.toThrow('owning fresh absence witness required');
    expect(platformReads.length).toBe(beforeForeign);
    for (const mode of ['partial', 'authorization']) {
      platformMode = mode;
      await expect(
        qualifyAzureTerraformNetworkFreshParentAbsence(
          original.plan,
          original.storage,
          postContext,
          absenceRuntime,
          absenceContract,
          absenceApi,
        ),
      ).rejects.toThrow('current complete platform absence required');
    }
    platformMode = 'absent';
    for (const mode of ['foreign', 'residual', 'service']) {
      cloudMode = mode;
      await expect(
        qualifyAzureTerraformNetworkFreshParentAbsence(
          original.plan,
          original.storage,
          postContext,
          absenceRuntime,
          absenceContract,
          absenceApi,
        ),
      ).rejects.toThrow('Azure CE retirement');
    }
    cloudMode = 'absent';
    const authenticAbsence = absenceRuntime.unregisteredAbsence;
    absenceRuntime.unregisteredAbsence = async (...args) => {
      const value = await authenticAbsence.apply(absenceRuntime, args);
      return {
        ...value,
        startedAt: new Date(Date.now() - 120000).toISOString(),
        observedAt: new Date(Date.now() - 120000).toISOString(),
      };
    };
    try {
      await expect(
        qualifyAzureTerraformNetworkFreshParentAbsence(
          original.plan,
          original.storage,
          postContext,
          absenceRuntime,
          absenceContract,
          absenceApi,
        ),
      ).rejects.toThrow('current complete platform absence required');
    } finally {
      absenceRuntime.unregisteredAbsence = authenticAbsence;
    }
    const freshAbort = AbortSignal.abort(Error('fresh-absence-preabort'));
    await expect(
      qualifyAzureTerraformNetworkFreshParentAbsence(
        original.plan,
        original.storage,
        postContext,
        absenceRuntime,
        absenceContract,
        absenceApi,
        freshAbort,
      ),
    ).rejects.toThrow('fresh-absence-preabort');
    expect(original.commands).toEqual(commands);
    process.stdout.write(
      `${JSON.stringify({ phase: 'fresh-external-absence-complete', monotonicMs: performance.now() })}\n`,
    );
    const boundaryFile = join(original.storage.directory, 'terraform-registration-observation.json');
    const boundaryBytes = await readFile(boundaryFile, 'utf8');
    const boundaryRead = original.storage.read;
    const boundaryOpen = postContext.terraform.open;
    const boundaryReaders = new Map<TerraformSession, NonNullable<TerraformSession['readArtifactRetirement']>>();
    let boundaryReads = 0,
      boundaryReached = false;
    original.storage.read = async (name) => {
      if (name === 'azure-terraform-network-packet-retirement.json') boundaryReads++;
      return boundaryRead.call(original.storage, name);
    };
    postContext.terraform.open = async (...args) => {
      const session = await boundaryOpen.call(postContext.terraform, ...args);
      if (!boundaryReaders.has(session)) {
        const reader = session.readArtifactRetirement;
        if (!reader) throw Error('actual native reader required');
        boundaryReaders.set(session, reader);
        session.readArtifactRetirement = async (...selected) => {
          const value = await reader.call(session, ...selected);
          if (boundaryReads >= 4 && !boundaryReached) {
            boundaryReached = true;
            await writeFile(boundaryFile, `${boundaryBytes} `, { mode: 0o600 });
          }
          return value;
        };
      }
      return session;
    };
    process.stdout.write(
      `${JSON.stringify({ phase: 'packet-final-callback-adversary-begin', monotonicMs: performance.now() })}\n`,
    );
    try {
      await expect(
        retireAzureTerraformNetworkSensitivePackets(original.plan, original.storage, postContext),
      ).rejects.toThrow('frozen file bytes or identity differ');
      expect(boundaryReached).toBe(true);
      const saved = (await original.storage.read('azure-terraform-network-packet-retirement.json')) as {
        deleted: string[];
        pending: string;
      };
      expect(saved.deleted).toEqual([]);
      expect(typeof saved.pending).toBe('string');
      expect((await lstat(join(original.storage.directory, saved.pending))).isFile()).toBe(true);
    } finally {
      original.storage.read = boundaryRead;
      postContext.terraform.open = boundaryOpen;
      for (const [session, reader] of boundaryReaders) session.readArtifactRetirement = reader;
      await writeFile(boundaryFile, boundaryBytes, { mode: 0o600 });
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'packet-final-callback-adversary-complete', monotonicMs: performance.now() })}\n`,
    );
    const publicPlans = await Promise.all(
      [...new Set(services.children.map((row) => row.networkPlanSha256))].map((digest) =>
        postContext.loaders.loadSource(digest),
      ),
    );
    const write = original.storage.write;
    let interrupted = false;
    original.storage.write = async (name, value, signal) => {
      const record = value as { deleted?: string[] };
      if (name === 'azure-terraform-network-packet-retirement.json' && record.deleted?.length === 1 && !interrupted) {
        interrupted = true;
        throw Error('task-owned-packet-post-unlink-interruption');
      }
      await write.call(original.storage, name, value, signal);
    };
    try {
      await expect(
        retireAzureTerraformNetworkSensitivePackets(original.plan, original.storage, postContext),
      ).rejects.toThrow('task-owned-packet-post-unlink-interruption');
    } finally {
      original.storage.write = write;
    }
    expect(interrupted).toBe(true);
    process.stdout.write(
      `${JSON.stringify({ phase: 'packet-post-unlink-interruption-reached', monotonicMs: performance.now() })}\n`,
    );
    const markerName = 'azure-terraform-network-packet-retirement.json';
    const pending = (await original.storage.read(markerName)) as { status: string; deleted: string[]; pending: string };
    expect(pending.status).toBe('retiring');
    expect(pending.deleted).toEqual([]);
    expect(typeof pending.pending).toBe('string');
    await expect(lstat(join(original.storage.directory, pending.pending))).rejects.toMatchObject({ code: 'ENOENT' });
    const worker = `
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { createCeTerraformService } from '../../../terraform/src/service';
import { CeApiError } from '../../../platform/src/ce/runtime';
import { collectCeUnregisteredAbsence } from '../../../platform/src/ce/teardown-inventory';
import { qualifyAzureTerraformNetworkFreshParentAbsence } from '../../src/ce/terraform-network-fresh-parent-absence';
import { retireAzureTerraformNetworkBootstrapPackets, retireAzureTerraformNetworkSensitivePackets } from '../../src/ce/terraform-network-sensitive-packet-retirement';
const input=JSON.parse(await Bun.stdin.text());
try {
 const store=await CeDeploymentStore.open(input.root,input.owner);
 const terraform=createCeTerraformService(async()=>({storage:async()=>{await store.verify();return store;}}));
 const sources=new Map(input.sources.map(plan=>[plan.planSha256,plan]));
 const context={terminalCleanup:input.terminal,destroyTeardown:input.teardown,site:input.site,terraform,loaders:{loadSource:async digest=>{const source=sources.get(digest);if(!source)throw Error('public source absent');return structuredClone(source);}}};
 let result;
 if(input.bootstrap){
  const contract={fingerprint:input.teardown.drain.ingressContractFingerprint};
  const runtime={engine:'terraform',contract:{fingerprint:input.teardown.drain.siteContractFingerprint},unregisteredAbsence(bindings,namespaces,ingress,signal){return collectCeUnregisteredAbsence({async request(path){if(path.includes('/registrations_by_site/') || path.includes('?'))return {items:[],errors:[]};throw new CeApiError('not-found',404);}},bindings,namespaces,{site:input.teardown.drain.siteContractFingerprint,ingress:ingress.fingerprint},signal);}};
  const api={async exec(command,args){const value=args[0]==='account'?{id:input.request.subscription.id,tenantId:input.request.subscription.tenantId,environmentName:input.request.subscription.cloud,state:'Enabled'}:args[0]==='group'?false:[];return {exitCode:0,stdout:JSON.stringify(value),stderr:''};}};
  const absence=await qualifyAzureTerraformNetworkFreshParentAbsence(input.request,store,context,runtime,contract,api);
  result=await retireAzureTerraformNetworkBootstrapPackets(input.request,store,context,absence,runtime,contract,api);
 }else result=await retireAzureTerraformNetworkSensitivePackets(input.request,store,context);

 console.log(JSON.stringify({ok:true,pid:process.pid,result}));
} catch(error) {console.log(JSON.stringify({ok:false,pid:process.pid,error:String(error.message)}));process.exitCode=1;}
`;
    const invoke = async (bootstrap = false) => {
      const root = original.storage.directory.slice(0, original.storage.directory.lastIndexOf('/'));
      const child = Bun.spawn([process.execPath, '--eval', worker], {
        stdin: new Blob([
          JSON.stringify({
            root,
            bootstrap,
            owner: original.storage.owner,
            request: original.plan,
            terminal: postContext.terminalCleanup,
            teardown: postContext.destroyTeardown,
            site: postContext.site,
            sources: publicPlans,
          }),
        ]),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { PATH: '/usr/bin:/bin' },
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(stderr).toBe('');
      const output = JSON.parse(stdout) as {
        ok: boolean;
        pid: number;
        result?: Awaited<ReturnType<typeof retireAzureTerraformNetworkSensitivePackets>>;
        error?: string;
      };
      expect(output.pid).not.toBe(process.pid);
      return { exitCode, ...output };
    };
    const packetCompleted = await invoke();
    process.stdout.write(
      `${JSON.stringify({ phase: 'packet-fresh-process-resume-complete', monotonicMs: performance.now() })}\n`,
    );
    expect(packetCompleted.exitCode).toBe(0);
    expect(packetCompleted.ok).toBe(true);
    const packetInventory = postContext.terminalCleanup as {
      retainedNetworkParentInventory: Awaited<ReturnType<typeof readAzureTerraformNetworkParentInventory>>;
    };
    const actions = packetInventory.retainedNetworkParentInventory.parentArtifactDecisions;
    const selected = actions.filter((row) => row.action === 'delete' && row.schema !== 'ce-bootstrap-token-v1');
    const deferred = actions.filter((row) => row.action === 'delete' && row.schema === 'ce-bootstrap-token-v1');
    expect(packetCompleted.result?.retiredPackets).toBe(selected.length);
    expect(packetCompleted.result?.deferredBootstrapTokens).toBe(deferred.length);
    expect(packetCompleted.result?.parentRetirementQualified).toBe(false);
    for (const row of selected)
      await expect(lstat(join(original.storage.directory, row.path))).rejects.toMatchObject({ code: 'ENOENT' });
    for (const row of deferred) expect((await lstat(join(original.storage.directory, row.path))).isFile()).toBe(true);
    expect((await invoke()).result).toEqual(packetCompleted.result);
    const markerPath = join(original.storage.directory, markerName),
      bytes = await readFile(markerPath, 'utf8');
    const forged = JSON.parse(bytes);
    forged.actions[0].sha256 = 'a'.repeat(64);
    await writeFile(markerPath, JSON.stringify(forged), { mode: 0o600 });
    try {
      const rejected = await invoke();
      expect(rejected.exitCode).toBe(1);
      expect(rejected.error).toContain('checkpoint native authority differs');
    } finally {
      await writeFile(markerPath, bytes, { mode: 0o600 });
    }
    const foreign = join(original.storage.directory, original.plan.deploymentName, 'foreign.json');
    await writeFile(foreign, '{}', { mode: 0o600 });
    try {
      const rejected = await invoke();
      expect(rejected.exitCode).toBe(1);
      expect(rejected.ok).toBe(false);
    } finally {
      await rm(foreign);
    }
    expect((await invoke()).result).toEqual(packetCompleted.result);
    const bootstrapMarker = 'azure-terraform-network-bootstrap-packet-retirement.json';
    const beforeBootstrapMarker = await readFile(markerPath, 'utf8');
    await expect(
      retireAzureTerraformNetworkBootstrapPackets(
        original.plan,
        original.storage,
        postContext,
        structuredClone(absence),
        absenceRuntime,
        absenceContract,
        absenceApi,
      ),
    ).rejects.toThrow('owning fresh absence witness required');
    await expect(lstat(join(original.storage.directory, bootstrapMarker))).rejects.toMatchObject({ code: 'ENOENT' });
    platformMode = 'partial';
    try {
      await expect(
        retireAzureTerraformNetworkBootstrapPackets(
          original.plan,
          original.storage,
          postContext,
          absence,
          absenceRuntime,
          absenceContract,
          absenceApi,
        ),
      ).rejects.toThrow('current complete platform absence required');
    } finally {
      platformMode = 'absent';
    }
    await expect(lstat(join(original.storage.directory, bootstrapMarker))).rejects.toMatchObject({ code: 'ENOENT' });
    const bootstrapWrite = original.storage.write;
    let bootstrapInterrupted = false;
    original.storage.write = async (name, value, signal) => {
      const progress = value as { deleted?: string[] };
      if (name === bootstrapMarker && progress.deleted?.length === 1 && !bootstrapInterrupted) {
        bootstrapInterrupted = true;
        throw Error('bootstrap-post-unlink-response-loss');
      }
      return bootstrapWrite.call(original.storage, name, value, signal);
    };
    process.stdout.write(
      `${JSON.stringify({ phase: 'bootstrap-packet-retirement-begin', monotonicMs: performance.now() })}\n`,
    );
    try {
      await expect(
        retireAzureTerraformNetworkBootstrapPackets(
          original.plan,
          original.storage,
          postContext,
          absence,
          absenceRuntime,
          absenceContract,
          absenceApi,
        ),
      ).rejects.toThrow('bootstrap-post-unlink-response-loss');
    } finally {
      original.storage.write = bootstrapWrite;
    }
    expect(bootstrapInterrupted).toBe(true);
    const bootstrapPending = (await original.storage.read(bootstrapMarker)) as { pending: string; deleted: string[] };
    expect(bootstrapPending.deleted).toEqual([]);
    await expect(lstat(join(original.storage.directory, bootstrapPending.pending))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const bootstrapComplete = await invoke(true);
    expect(bootstrapComplete.exitCode).toBe(0);
    expect(bootstrapComplete.ok).toBe(true);
    expect(bootstrapComplete.result).toMatchObject({
      status: 'bootstrap-packets-retired',
      retiredPackets: deferred.length,
      deferredBootstrapTokens: 0,
      interfaceAbsenceQualified: false,
      fullExternalCleanupQualified: false,
      parentRetirementQualified: false,
      liveQualified: false,
    });
    for (const row of deferred)
      await expect(lstat(join(original.storage.directory, row.path))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(markerPath, 'utf8')).toBe(beforeBootstrapMarker);
    expect((await invoke(true)).result).toEqual(bootstrapComplete.result);
    const bootstrapPath = join(original.storage.directory, bootstrapMarker),
      bootstrapBytes = await readFile(bootstrapPath, 'utf8');
    const forgedBootstrap = JSON.parse(bootstrapBytes);
    forgedBootstrap.actions[0].sha256 = 'b'.repeat(64);
    await writeFile(bootstrapPath, JSON.stringify(forgedBootstrap), { mode: 0o600 });
    try {
      const rejected = await invoke(true);
      expect(rejected.exitCode).toBe(1);
      expect(rejected.error).toContain('checkpoint native authority differs');
    } finally {
      await writeFile(bootstrapPath, bootstrapBytes, { mode: 0o600 });
    }
    const readOnlyWrite = original.storage.write;
    let readOnlyWrites = 0;
    original.storage.write = async () => {
      readOnlyWrites++;
      throw Error('read-only retirement must not write');
    };
    try {
      const readOnlyCompleted = await qualifyAzureTerraformNetworkRetiredBootstrapPackets(
        original.plan,
        original.storage,
        postContext,
        absence,
        absenceRuntime,
        absenceContract,
        absenceApi,
      );
      expect(readOnlyCompleted).toMatchObject({
        status: 'retired-bootstrap-packets-observed',
        completeParentFileCustodyQualified: true,
        bootstrapPacketRetirementQualified: true,
        interfaceAbsenceQualified: false,
        opaqueCheckoutRetirementQualified: false,
        fullExternalCleanupQualified: false,
        parentRetirementQualified: false,
        liveQualified: false,
      });
      expect(await readFile(bootstrapPath, 'utf8')).toBe(bootstrapBytes);
      const incompleteBootstrap = JSON.parse(bootstrapBytes);
      incompleteBootstrap.status = 'retiring';
      const incompleteBytes = JSON.stringify(incompleteBootstrap);
      await writeFile(bootstrapPath, incompleteBytes, { mode: 0o600 });
      try {
        await expect(
          qualifyAzureTerraformNetworkRetiredBootstrapPackets(
            original.plan,
            original.storage,
            postContext,
            absence,
            absenceRuntime,
            absenceContract,
            absenceApi,
          ),
        ).rejects.toThrow('completed bootstrap packet retirement required');
        expect(await readFile(bootstrapPath, 'utf8')).toBe(incompleteBytes);
      } finally {
        await writeFile(bootstrapPath, bootstrapBytes, { mode: 0o600 });
      }
    } finally {
      original.storage.write = readOnlyWrite;
    }
    expect(readOnlyWrites).toBe(0);
    process.stdout.write(
      `${JSON.stringify({ phase: 'bootstrap-packet-retirement-complete', monotonicMs: performance.now() })}\n`,
    );
    expect(original.commands).toEqual(commands);
  } finally {
    if (nativeStarted !== undefined)
      process.stdout.write(
        `${JSON.stringify({ phase: 'native-main-test-finally', durationMs: performance.now() - nativeStarted, budgetMs: 180000 })}\n`,
      );
    await original.close();
    await rm(publicDirectory, { recursive: true });
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 600000);

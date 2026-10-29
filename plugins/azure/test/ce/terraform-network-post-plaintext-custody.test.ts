import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import type { readAzureTerraformNetworkParentInventory } from '../../src/ce/terraform-network-parent-inventory';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import {
  qualifyAzureTerraformNetworkPostPlaintextParentCustody,
  recheckAzureTerraformNetworkPostPlaintextParentCustody,
} from '../../src/ce/terraform-network-post-plaintext-parent-custody';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import {
  qualifyAzureTerraformNetworkPostPlaintextMainCustody,
  qualifyAzureTerraformNetworkRetiredMainCustody,
  recheckAzureTerraformNetworkRetiredMainNativeCustody,
} from '../../src/ce/terraform-network-retired-main-custody';
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

test('native main freezes exact parent inventory before retirement and rejects self-rehashed replacement', async () => {
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
      `${JSON.stringify({ phase: 'post-plaintext-parent-custody-begin', monotonicMs: performance.now() })}\n`,
    );
    await expect(
      qualifyAzureTerraformNetworkPostPlaintextParentCustody(
        original.plan,
        original.storage,
        postContext,
        structuredClone(post),
      ),
    ).rejects.toThrow('owning retired-main witness required');
    const parent = await qualifyAzureTerraformNetworkPostPlaintextParentCustody(
      original.plan,
      original.storage,
      postContext,
      post,
    );
    expect(parent.completeParentDispositionQualified).toBe(true);
    expect(parent.parentArtifactDecisions).toEqual(frozen.parentArtifactDecisions);
    expect(parent.parentDirectoryDecisions).toEqual(frozen.parentDirectoryDecisions);
    expect(parent.sensitiveDeletionExecutionQualified).toBe(false);
    expect(parent.parentRetirementQualified).toBe(false);
    expect(parent.files).toHaveLength(frozen.files.length + 3);
    await expect(
      recheckAzureTerraformNetworkPostPlaintextParentCustody(
        structuredClone(parent),
        original.plan,
        original.storage,
        postContext,
      ),
    ).rejects.toThrow('owning post-plaintext parent witness required');
    await expect(
      recheckAzureTerraformNetworkPostPlaintextParentCustody(parent, original.plan, original.storage, {
        ...postContext,
      }),
    ).rejects.toThrow('owning post-plaintext parent witness required');
    await recheckAzureTerraformNetworkPostPlaintextParentCustody(parent, original.plan, original.storage, postContext);
    const foreign = join(
      original.storage.directory,
      'terraform-original-deployment-receipts',
      'foreign-post-main.json',
    );
    await writeFile(foreign, JSON.stringify({ foreign: true }), { mode: 0o600 });
    try {
      await expect(
        recheckAzureTerraformNetworkPostPlaintextParentCustody(parent, original.plan, original.storage, postContext),
      ).rejects.toThrow('parent directory namespace differs');
    } finally {
      await rm(foreign);
    }
    await recheckAzureTerraformNetworkPostPlaintextParentCustody(parent, original.plan, original.storage, postContext);
    expect(original.commands).toEqual(commands);

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

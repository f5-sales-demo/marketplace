import { expect } from 'bun:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { createAzureOperationalRetirementSession } from '../../src/ce/network-operational-retirement-session';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { collectAzureHistoricalEnrollmentTokens } from '../../src/ce/terraform-enrollment-history';
import {
  authenticateAzureTerraformNetworkDestroyJournalCustody,
  qualifyAzureTerraformNetworkTerminalJournalCustody,
} from '../../src/ce/terraform-network-destroy-journal-custody';
import {
  azureNetworkParentTerminalProjection,
  qualifyAzureTerraformNetworkParentPublishedEnvelope,
  readAzureTerraformNetworkParentInventory,
  recheckAzureTerraformNetworkParentInventory,
} from '../../src/ce/terraform-network-parent-inventory';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
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
import { test } from './owned-fixture-test';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { lineageCleanupEvidence } from './terraform-network-lineage-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { completedReplacement } from './terraform-network-mixed-generation-fixture';

import { networkReplacementExecutorFixture } from './terraform-network-replacement-executor-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

test('parent publication authenticates original metadata, six children, exact envelope and fresh source custody', async () => {
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
    const outcome = await original.run();
    expect(outcome.status).toBe('registered');
    await saveAzureTerraformOutcome(session, outcome);
    const sources = new Map([[original.plan.planSha256, original.plan]]);
    let publicationFault: 'foreign-source' | 'ignored-source' | 'late-packet-inode' | undefined;
    let publicationAbort: AbortController | undefined;
    let publicationPacketPath: string | undefined;
    let publicationBackupPath: string | undefined;
    let publicationSourceReads = 0;
    let publicationFaultCalls = 0;
    const loaders = {
      async loadSource(digest: string) {
        publicationSourceReads++;
        const plan = sources.get(digest);
        if (!plan) throw Error('unresolved native original source');
        const fault = publicationFault;
        publicationFault = undefined;
        if (fault) publicationFaultCalls++;
        if (fault === 'foreign-source') return { ...structuredClone(plan), siteName: 'foreign-site' };
        if (fault === 'ignored-source') {
          if (!publicationAbort) throw Error('Owning publication abort controller required');
          publicationAbort.abort(Error('ignored source callback abort'));
          return new Promise<typeof plan>(() => {});
        }
        if (fault === 'late-packet-inode') {
          if (!publicationPacketPath || !publicationBackupPath) throw Error('Exact publication packet paths required');
          const bytes = await readFile(publicationPacketPath);
          await rename(publicationPacketPath, publicationBackupPath);
          await writeFile(publicationPacketPath, bytes, { mode: 0o600 });
        }
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
    const drain: Parameters<typeof compileAzureTerraformTeardown>[1] = {
      schemaVersion: 1,
      owner: teardownBinding.owner,
      sourcePlanSha256: original.plan.planSha256,
      siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
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
          ...teardownBinding.nodes.map((node) => ({ node, name: `fixture-token-${node}` })),
          ...(await collectAzureHistoricalEnrollmentTokens(original.plan, original.storage)),
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
    const observer = await createAzureOperationalRetirementSession(
      original.plan,
      {
        ...original.runtime,
        async observeForwardingRoutes() {
          throw Error('Retirement must not observe forwarding routes');
        },
        async observeHealth() {
          throw Error('Retirement must not observe health');
        },
        async observeNodeReadiness() {
          throw Error('Retirement must not observe readiness');
        },
        ownedSiteConfiguration(_binding, value) {
          return { metadata: value.metadata, spec: value.spec };
        },
      },
      api,
      original.storage,
      session,
    );
    expect(await observer.retireSigningMaterial()).toMatchObject({
      status: 'absent',
      artifactInventory: { observerState: 'absent', operationalAcceptance: 'unknown' },
    });
    const context = { ...networkContext, terminalCleanup: prepared.checkpoint, parentContracts: { observer } };
    const terminal = await qualifyAzureTerraformNetworkTerminalJournalCustody(original.plan, original.storage, context);
    const authenticate = (witness: unknown = terminal, originalContext = context, signal?: AbortSignal) =>
      authenticateAzureTerraformNetworkDestroyJournalCustody(
        witness,
        original.plan,
        original.storage,
        originalContext,
        signal,
      );
    expect(() => authenticate()).not.toThrow();
    expect(() => authenticate(structuredClone(terminal))).toThrow(
      'owning authenticated destroy custody witness required',
    );
    expect(() => authenticate(terminal, { ...context })).toThrow(
      'owning authenticated destroy custody witness required',
    );
    const authAbort = new AbortController();
    authAbort.abort(Error('pre-aborted terminal authentication'));
    expect(() => authenticate(terminal, context, authAbort.signal)).toThrow('pre-aborted terminal authentication');
    const authRecordDigest = Reflect.get(terminal, 'recordSha256');
    Reflect.set(terminal, 'recordSha256', '0'.repeat(64));
    expect(() => authenticate()).toThrow('owning authenticated destroy custody witness required');
    Reflect.set(terminal, 'recordSha256', authRecordDigest);
    const authReader = original.storage.read;
    original.storage.read = async () => {
      throw Error('changed terminal authentication reader');
    };
    expect(() => authenticate()).toThrow('owning request or dependency changed');
    original.storage.read = authReader;
    expect(() => authenticate()).not.toThrow();
    const commands = [...original.commands];
    const parentInventory = await readAzureTerraformNetworkParentInventory(
      original.plan,
      original.storage,
      context,
      terminal,
    );
    expect(parentInventory.children).toHaveLength(6);
    const originalObserver = context.parentContracts.observer;
    context.parentContracts.observer = { ...originalObserver };
    await expect(
      recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context),
    ).rejects.toThrow('owning parent contract changed');
    context.parentContracts.observer = originalObserver;
    await recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context);
    expect(parentInventory.parentRetirementQualified).toBe(false);
    expect(parentInventory.networkPacketNames.length).toBeGreaterThan(0);
    expect(new Set(parentInventory.files.map((row) => row.path)).size).toBe(parentInventory.files.length);
    expect(parentInventory.files.every((row) => row.identity && /^[a-f0-9]{64}$/.test(row.sha256))).toBe(true);
    expect(parentInventory.originalDirectories.originalReceiptMetadataQualified).toBe(true);
    expect(parentInventory.terminalProjectionSha256).toBe(azureNetworkParentTerminalProjection(prepared.checkpoint));
    expect(original.commands).toEqual(commands);
    await expect(
      recheckAzureTerraformNetworkParentInventory(
        structuredClone(parentInventory),
        original.plan,
        original.storage,
        context,
      ),
    ).rejects.toThrow('owning parent inventory witness required');
    const aborted = new AbortController();
    aborted.abort(Error('explicit enrollment abort'));
    await expect(
      recheckAzureTerraformNetworkParentInventory(
        parentInventory,
        original.plan,
        original.storage,
        context,
        aborted.signal,
      ),
    ).rejects.toThrow('explicit enrollment abort');
    const digest = parentInventory.terminalProjectionSha256;
    parentInventory.terminalProjectionSha256 = '0'.repeat(64);
    await expect(
      recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context),
    ).rejects.toThrow('owning parent inventory witness required');
    parentInventory.terminalProjectionSha256 = digest;
    await expect(
      readAzureTerraformNetworkParentInventory(original.plan, original.storage, context, structuredClone(terminal)),
    ).rejects.toThrow();
    const selected = parentInventory.files.find((row) => parentInventory.networkPacketNames.includes(row.path));
    if (!selected) throw Error('Authenticated packet required');
    const selectedPath = join(original.storage.directory, selected.path);
    const packetBytes = await readFile(selectedPath);
    await writeFile(selectedPath, '{}', { mode: 0o600 });
    await expect(
      recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context),
    ).rejects.toThrow('parent bytes, inode or namespace changed');
    await writeFile(selectedPath, packetBytes, { mode: 0o600 });
    const backup = join(publicDirectory, 'preserved-native-packet.json');
    await rename(selectedPath, backup);
    await writeFile(selectedPath, packetBytes, { mode: 0o600 });
    await expect(
      recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context),
    ).rejects.toThrow('parent bytes, inode or namespace changed');
    await rm(selectedPath);
    await rename(backup, selectedPath);
    const foreignPath = join(original.storage.directory, 'foreign-parent-packet.json');
    await writeFile(foreignPath, '{}', { mode: 0o600 });
    await expect(
      recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context),
    ).rejects.toThrow('parent bytes, inode or namespace changed');
    await rm(foreignPath);
    const reader = original.storage.read;
    original.storage.read = async () => {
      throw Error('Foreign storage reader');
    };
    await expect(
      recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context),
    ).rejects.toThrow('owning context changed');
    original.storage.read = reader;
    await recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context);
    expect(original.commands).toEqual(commands);
    // Derive the exact owning envelope for this genuine mint. Presence, a copied body,
    // or caller-supplied changed checkpoint fields cannot supply publication authority.
    const publicationEvidence = {
      ...(prepared.checkpoint.retirementEvidence as Record<string, unknown>),
      terminalNetwork: structuredClone(terminal),
      networkParentInventory: structuredClone(parentInventory),
    };
    const publishedCheckpoint = {
      ...prepared.checkpoint,
      retainedTerminalNetworkCustody: structuredClone(terminal),
      retainedNetworkParentInventory: structuredClone(parentInventory),
      retirementEvidence: publicationEvidence,
      retirementEvidenceSha256: canonicalSha256(publicationEvidence),
    };
    const currentContext = { ...context, terminalCleanup: publishedCheckpoint };
    const publication = (
      witness: unknown = parentInventory,
      originalContext = context,
      nextContext = currentContext,
      signal?: AbortSignal,
    ) =>
      qualifyAzureTerraformNetworkParentPublishedEnvelope(
        witness,
        original.plan,
        original.storage,
        originalContext,
        nextContext,
        signal,
      );
    await expect(publication(structuredClone(parentInventory))).rejects.toThrow(
      'owning parent inventory witness required',
    );
    await expect(publication(parentInventory, { ...context })).rejects.toThrow(
      'owning parent inventory witness required',
    );
    const abortedPublication = new AbortController();
    abortedPublication.abort(Error('pre-aborted publication'));
    await expect(publication(parentInventory, context, currentContext, abortedPublication.signal)).rejects.toThrow(
      'pre-aborted publication',
    );
    for (const field of [
      'phase',
      'emptyConfiguration',
      'retainedTerminalNetworkCustody',
      'retainedNetworkParentInventory',
      'retirementEvidence',
      'retirementEvidenceSha256',
    ]) {
      const altered = structuredClone(publishedCheckpoint);
      Reflect.set(altered, field, 'unauthorized-change');
      await expect(
        publication(parentInventory, context, { ...currentContext, terminalCleanup: altered }),
      ).rejects.toThrow('exact owning frozen-envelope publication context required');
    }
    await expect(
      publication(parentInventory, context, {
        ...currentContext,
        site: { ...currentContext.site, siteUid: 'foreign-site' },
      }),
    ).rejects.toThrow('exact owning frozen-envelope publication context required');
    await expect(
      publication(parentInventory, context, {
        ...currentContext,
        loaders: { ...currentContext.loaders },
      }),
    ).rejects.toThrow('exact owning frozen-envelope publication context required');
    expect(parentInventory.publicPlanInventorySha256).toBe(
      (terminal as Extract<typeof terminal, { mainRunnerRetirementQualified: false }>).retainedLineage
        .publicPlanInventorySha256,
    );
    expect(parentInventory.requestInventorySha256).toBe(
      (terminal as Extract<typeof terminal, { mainRunnerRetirementQualified: false }>).retainedLineage
        .requestInventorySha256,
    );
    expect(parentInventory.publicLineageSha256).toBe(
      canonicalSha256((terminal as Extract<typeof terminal, { mainRunnerRetirementQualified: false }>).retainedLineage),
    );
    expect(
      parentInventory.publicBindings.sources.some(
        (row) => row.planSha256 === original.plan.planSha256 && row.sourceSha256 === canonicalSha256(original.plan),
      ),
    ).toBe(true);
    for (const row of (terminal as Extract<typeof terminal, { mainRunnerRetirementQualified: false }>).retainedLineage
      .rows) {
      expect(parentInventory.publicBindings.sources.some((source) => source.planSha256 === row.planSha256)).toBe(true);
    }
    expect(parentInventory.publicBindings.outcomes.length).toBeGreaterThan(0);
    expect(parentInventory.absentNetworkPacketNames.every((name) => !parentInventory.rootNames.includes(name))).toBe(
      true,
    );
    const retainedSourceMapping = parentInventory.publicBindings.sources[0];
    if (!retainedSourceMapping) throw Error('Native-bound public source mapping required');
    const retainedSourceDigest = retainedSourceMapping.sourceSha256;
    retainedSourceMapping.sourceSha256 = '0'.repeat(64);
    await expect(publication()).rejects.toThrow('owning parent inventory witness required');
    retainedSourceMapping.sourceSha256 = retainedSourceDigest;
    const retainedProjection = parentInventory.terminalProjectionSha256;
    parentInventory.terminalProjectionSha256 = '0'.repeat(64);
    await expect(publication()).rejects.toThrow('owning parent inventory witness required');
    parentInventory.terminalProjectionSha256 = retainedProjection;
    const retainedRecordDigest = Reflect.get(terminal, 'recordSha256');
    Reflect.set(terminal, 'recordSha256', '0'.repeat(64));
    await expect(publication()).rejects.toThrow('owning parent enrollment or terminal witness changed');
    Reflect.set(terminal, 'recordSha256', retainedRecordDigest);
    await expect(publication()).rejects.toThrow('saved terminal checkpoint differs');
    await original.storage.write('azure-terraform-terminal-cleanup.json', publishedCheckpoint);
    // The original strict witness is not broadened to accept its own changed checkpoint.
    await expect(
      recheckAzureTerraformNetworkParentInventory(parentInventory, original.plan, original.storage, context),
    ).rejects.toThrow('saved terminal checkpoint differs');
    const preservedPath = join(original.storage.directory, selected.path);
    const preservedBytes = await readFile(preservedPath);
    const preservedBackup = join(publicDirectory, 'publication-original-packet.json');
    await rename(preservedPath, preservedBackup);
    await writeFile(preservedPath, preservedBytes, { mode: 0o600 });
    await expect(publication()).rejects.toThrow('parent bytes, inode or namespace changed across owning publication');
    await rm(preservedPath);
    await rename(preservedBackup, preservedPath);
    const extra = join(original.storage.directory, 'unexpected-publication.json');
    await writeFile(extra, '{}', { mode: 0o600 });
    await expect(publication()).rejects.toThrow('parent bytes, inode or namespace changed across owning publication');
    await rm(extra);
    publicationFault = 'foreign-source';
    const foreignSourceCalls = publicationFaultCalls;
    await expect(publication()).rejects.toThrow();
    expect(publicationFaultCalls).toBe(foreignSourceCalls + 1);
    publicationAbort = new AbortController();
    publicationFault = 'ignored-source';
    const ignoredSourceCalls = publicationFaultCalls;
    await expect(publication(parentInventory, context, currentContext, publicationAbort.signal)).rejects.toThrow(
      'ignored source callback abort',
    );
    expect(publicationFaultCalls).toBe(ignoredSourceCalls + 1);
    publicationFault = 'late-packet-inode';
    publicationPacketPath = preservedPath;
    publicationBackupPath = preservedBackup;
    const lateInodeCalls = publicationFaultCalls;
    try {
      await expect(publication()).rejects.toThrow();
      expect(publicationFaultCalls).toBe(lateInodeCalls + 1);
    } finally {
      await rm(preservedPath);
      await rename(preservedBackup, preservedPath);
    }
    const freshReads = publicationSourceReads;
    await publication();
    expect(publicationSourceReads).toBeGreaterThan(freshReads);
    expect(await original.storage.read('azure-terraform-terminal-cleanup.json')).toEqual(publishedCheckpoint);
    expect(original.commands).toEqual(commands);
  } finally {
    await original.close();
    await rm(publicDirectory, { recursive: true });
  }
}, 600000);

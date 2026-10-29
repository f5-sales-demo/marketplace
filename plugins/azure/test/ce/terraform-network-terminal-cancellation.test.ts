import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { collectAzureHistoricalEnrollmentTokens } from '../../src/ce/terraform-enrollment-history';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { qualifyAzureTerraformNetworkCancelledMainBinding } from '../../src/ce/terraform-network-cancelled-main-binding';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
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

test('owning terminal planning recovers exact preexisting native ordinary plan without replanning', async () => {
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
  try {
    expect(original.plan).toEqual(birth.original);
    const registrations = structuredClone(requirePresent(birth.outcomes.get(original.plan.planSha256)).registrations);
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
          device: `eth${requirePresent(original.plan.nics.find((nic) => nic.role === row.role)).index}`,
        })),
        status: 'configured',
        siteUid: birth.site.siteUid,
      }) as Awaited<ReturnType<typeof original.runtime.observeRegisteredConfiguration>>;
    await savePlanArtifact(session, original.plan, birth.current);
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
    const custody = await readAzureTerraformNetworkAllOriginalCustody(
      original.plan,
      session,
      original.storage,
      original.terraform as Parameters<typeof readAzureTerraformNetworkAllOriginalCustody>[3],
      loaders,
      birth.site,
      async () => {
        throw Error('network has not executed');
      },
    );
    expect(custody.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(custody.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(custody.sharedMain.originalRows).toHaveLength(4);
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
    const commands = [...original.commands];
    const foreignInventory = structuredClone(inventory);
    foreignInventory.nodes['1'].nics['1'].mac = '02:ff:00:00:00:01';
    await expect(
      qualifyAzureTerraformNetworkUpdateSource(
        network,
        source,
        foreignInventory,
        original.storage,
        loaders.loadSource,
        loaders.loadOutcome,
        birth.lock,
        birth.site,
      ),
    ).rejects.toThrow('registered MAC');
    const foreignOutcome = structuredClone(outcome) as unknown as Record<string, unknown>;
    const configuration = foreignOutcome.configuration as { interfaces: Array<{ device: string }> };
    configuration.interfaces[1].device = configuration.interfaces[0].device;
    await expect(
      qualifyAzureTerraformNetworkUpdateSource(
        network,
        source,
        inventory,
        original.storage,
        loaders.loadSource,
        async () => foreignOutcome,
        birth.lock,
        birth.site,
      ),
    ).rejects.toThrow('duplicate registered device');
    const foreignSource = JSON.parse(source);
    foreignSource.resource.azurerm_linux_virtual_machine.node_1.custom_data = Buffer.from(
      Buffer.from(foreignSource.resource.azurerm_linux_virtual_machine.node_1.custom_data, 'base64')
        .toString('utf8')
        .replace('fixture-material-', 'foreign-material-'),
    ).toString('base64');
    await expect(
      qualifyAzureTerraformNetworkUpdateSource(
        network,
        JSON.stringify(foreignSource),
        inventory,
        original.storage,
        loaders.loadSource,
        loaders.loadOutcome,
        birth.lock,
        birth.site,
      ),
    ).rejects.toThrow('bootstrap');
    expect(original.commands).toEqual(commands);
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
    const combined = await readAzureTerraformNetworkAllOriginalCustody(
      original.plan,
      session,
      original.storage,
      main.service,
      loaders,
      birth.site,
      replacement.dependencies.qualifyHistorical,
      undefined,
      replacement.dependencies.qualifyCompletedOperational,
    );
    expect(combined.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(combined.sharedMain.replacementJournalsQualified).toBe(true);
    expect(combined.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(combined.rows).toHaveLength(1);
    expect(combined.sharedMain.replacementRows).toHaveLength(1);
    expect(combined.lineage.rows).toHaveLength(2);
    expect(combined.allPublicRequestCustodyQualified).toBe(true);
    expect(combined.parentRetirementQualified).toBe(false);
    expect(combined.currentOperationalAcceptanceQualified).toBe(false);
    const completed = await completedReplacement(true, true, { fixture: replacement, result: replacementOutcome });
    sources.set(completed.next.planSha256, completed.next);
    await savePlanArtifact(session, completed.next, birth.current);
    const planned = await readAzureTerraformNetworkAllOriginalCustody(
      original.plan,
      session,
      original.storage,
      main.service,
      loaders,
      birth.site,
      replacement.dependencies.qualifyHistorical,
      undefined,
      replacement.dependencies.qualifyCompletedOperational,
    );
    expect(planned.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(planned.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(planned.lineage.rows.find((row) => row.planSha256 === completed.next.planSha256)?.execution).toBe(
      'unstaged-no-outcome',
    );
    expect(planned.sharedMain.replacementJournalsQualified).toBe(true);
    expect(planned.sharedMain.unrecognizedRootEntrySha256s).toHaveLength(0);
    for (const row of planned.rows) {
      expect(row.main.originalPublishedJournalsQualified).toBe(true);
      expect(row.main.terminalPublishedJournalsQualified).toBe(true);
      expect(row.power.rows).toHaveLength(6);
      for (const power of row.power.rows) {
        expect(power.status).toBe('retired');
        expect(power.retirement?.runnerRetirementQualified).toBe(true);
      }
    }
    expect(planned.allPublicRequestCustodyQualified).toBe(true);
    const collect = () =>
      readAzureTerraformNetworkAllOriginalCustody(
        original.plan,
        session,
        original.storage,
        main.service,
        loaders,
        birth.site,
        replacement.dependencies.qualifyHistorical,
        undefined,
        replacement.dependencies.qualifyCompletedOperational,
      );
    // The cloud/provider and platform inputs remain synthetic. Real native runner journals
    // authenticate this source-only transition; no cloud absence or parent cleanup is claimed.
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
    const postDestroy = await collect();
    expect(postDestroy.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(postDestroy.sharedMain.replacementJournalsQualified).toBe(true);
    for (const row of postDestroy.rows) {
      expect(row.main.originalPublishedJournalsQualified).toBe(true);
      expect(row.main.terminalPublishedJournalsQualified).toBe(true);
      expect(row.power.rows.every((power) => power.retirement?.runnerRetirementQualified)).toBe(true);
    }
    expect(postDestroy.allPublicRequestCustodyQualified).toBe(false);
    // The ordinary pre-destroy collector must retain its unknown result. The additional
    // explicit teardown context needs a separately authenticated destroy-journal contract.
    // The primary native fixture owns the verified synthetic executor metadata and
    // provider state. Read-only child sessions still use their actual native readers.
    // Do not route a mutating main operation through a different/default executor.
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
    const children = postDestroy.rows
      .flatMap((row) =>
        row.power.rows.map((power) => ({
          networkPlanSha256: row.planSha256,
          node: requirePresent(power.retirement).node,
          operation: requirePresent(power.retirement).operation,
          stage: power.stage,
          retirementSha256: canonicalSha256(power.retirement),
          proof: requirePresent(power.retirement).proof,
        })),
      )
      .sort((a, b) => a.stage.localeCompare(b.stage));
    expect(children).toHaveLength(6);
    expect(new Set(children.map((child) => `${child.networkPlanSha256}:${child.node}:${child.operation}`)).size).toBe(
      6,
    );
    expect(Reflect.get(requirePresent(terminalStages.network), 'retainedPowerChildren')).toEqual(children);
    // Move the real native owner through its recoverable unsubmitted destroy cancellation
    // and ordinary empty no-change plan. This source fixture supplies no real cloud absence.
    const emptyDeployment = await azureTerraformCurrentDeployment(original.plan);
    const retainedDestroyConfiguration = await original.runner.readConfiguration(emptyDestroy.configurationSha256);
    const evidence = {
      fixture: 'synthetic-platform-and-cloud-absence',
      owner: original.storage.owner,
      network: terminalStages.network,
    };
    const evidenceSha256 = canonicalSha256(evidence),
      emptySha256 = createHash('sha256').update(emptyDeployment.configuration).digest('hex');
    const cancellationCheckpoint = {
      schemaVersion: 1,
      sourcePlanSha256: original.plan.planSha256,
      teardownPlanSha256: teardown.planSha256,
      configurationSha256: emptyDestroy.configurationSha256,
      emptyConfiguration: emptyDeployment.configuration,
      emptyConfigurationSha256: emptySha256,
      destroy: emptyDestroy,
      evidence,
      evidenceSha256,
      checkpointSha256: canonicalSha256({
        configurationSha256: emptyDestroy.configurationSha256,
        emptyConfiguration: emptyDeployment.configuration,
        destroy: emptyDestroy,
        evidence,
      }),
      retainedDestroyConfiguration,
      retainedNetworkCustody: terminalStages.network,
      phase: 'planning',
    };
    await original.runner.cancelUnsubmittedPlan(
      emptyDestroy,
      emptyDestroy.configurationSha256,
      emptyDeployment.configuration,
      evidenceSha256,
    );
    await original.storage.write('azure-terraform-terminal-cleanup.json', cancellationCheckpoint);
    const cancellationContext = { ...networkContext, terminalCleanup: cancellationCheckpoint };
    const count = original.commands.length;
    const observed = await qualifyAzureTerraformNetworkCancelledMainBinding(
      original.plan,
      original.storage,
      cancellationContext,
    );
    expect(Reflect.get(observed, 'cancellationQualified')).toBe(true);
    expect(Reflect.get(observed, 'currentPlanReceipt')).toBe(null);
    expect(Reflect.get(observed, 'ordinaryCurrentJournalQualified') as unknown).toBe(false);
    expect(observed.ordinaryPlanReady).toBe(true);
    expect(observed.children).toHaveLength(6);
    expect(observed.mainRunnerRetirementQualified).toBe(false);
    expect(observed.parentRetirementQualified).toBe(false);
    expect(observed.emptyStateQualified).toBe(false);
    expect(observed.independentCloudCleanupQualified).toBe(false);
    expect(original.commands).toHaveLength(count);
    const ordinary = await original.runner.plan({});
    const ordinaryCount = original.commands.length;
    const result = await prepareAzureTerraformNetworkTerminalPlanning(
      original.plan,
      original.storage,
      networkContext,
      async () => ({ fixture: 'synthetic-platform-and-cloud-absence', owner: original.storage.owner }),
      {},
    );
    expect(result.recoveredExistingPlan).toBe(true);
    expect(result.checkpoint.phase).toBe('retiring');
    expect(result.checkpoint.final).toEqual(ordinary);
    expect(result.mainRunnerRetirementQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(result.independentCloudCleanupQualified).toBe(false);
    expect(original.commands).toHaveLength(ordinaryCount);
  } finally {
    await original.close();
    await rm(publicDirectory, { recursive: true });
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 600000);

function requirePresent<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw Error('Required qualified evidence is missing');
  return value;
}

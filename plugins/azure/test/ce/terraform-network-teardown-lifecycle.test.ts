import { expect } from 'bun:test';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import { CeApiError } from '../../../platform/src/ce/runtime';
import { collectCeUnregisteredAbsence } from '../../../platform/src/ce/teardown-inventory';
import { type BootstrapCheckoutBinding, storeBootstrapToken } from '../../../platform/src/ce/token-store';
import type { AzExecApi } from '../../src/az/exec';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import { qualifyAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-update-source';
import { loadAzureTerraformOutcome, saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import {
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementSource,
} from '../../src/ce/terraform-replacement';
import { beginAzureTerraformRetirement } from '../../src/ce/terraform-retirement';
import { compileAzureTerraformTeardown, runAzureTerraformTeardown } from '../../src/ce/terraform-teardown';
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

test('owning network teardown lifecycle retires native main, plaintext and packets and resumes without Terraform replay', async () => {
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
    const originalBootstrap = original.runtime.bootstrap;
    original.runtime.bootstrap = async (binding, node, tokenName, persistIssuedToken, signal) => {
      const material = await originalBootstrap.call(
        original.runtime,
        binding,
        node,
        tokenName,
        persistIssuedToken,
        signal,
      );
      // Match the production runtime's issuance checkpoint callback in this source fixture.
      // This is synthetic source evidence, never a vendor or live token receipt.
      const jwt = `fixture.${Buffer.from(node).toString('base64url')}.signature`;
      await persistIssuedToken({ tokenName, siteName: binding.siteName, node, jwt });
      return material;
    };
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
      async (request) => lineageCleanupEvidence(request, '1.17.1'),
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
    const issuedToken = teardown.retirement[0]?.tokens[0];
    if (!issuedToken) throw Error('Owning original issued token required');
    const issuedPacket = (await original.storage.read(`${issuedToken.name}.json`)) as { jwt: string };
    let opaqueCheckout: BootstrapCheckoutBinding | undefined;
    await storeBootstrapToken({
      sessionId: session.getSessionId(),
      token: issuedPacket.jwt,
      expiresInSeconds: 900,
      root: join(
        original.storage.directory.slice(0, original.storage.directory.lastIndexOf('/')),
        'opaque-checkout-store',
      ),
      onPrepared: async (checkout) => {
        opaqueCheckout = checkout;
      },
    });
    if (!opaqueCheckout) throw Error('Actual opaque checkout issuance required');
    await original.storage.write(`bootstrap-checkout-${opaqueCheckout.reference.split('/').at(-1)}.json`, {
      schemaVersion: 1,
      owner: original.storage.owner,
      binding: teardownBinding,
      siteUid: birth.site.siteUid,
      contractFingerprint: teardown.drain.siteContractFingerprint,
      node: issuedToken.node,
      tokenName: issuedToken.name,
      checkout: opaqueCheckout,
    });
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

    const lifecycleContract = { fingerprint: teardown.drain.ingressContractFingerprint } as VerifiedIngressContract;
    let platformReads = 0,
      cloudReads = 0;
    const lifecycleRuntime = {
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
              platformReads++;
              if (path.includes('/registrations_by_site/') || path.includes('?')) return { items: [], errors: [] };
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
    const lifecycleApi: AzExecApi = {
      async exec(command, args) {
        cloudReads++;
        expect(command).toBe('az');
        const value =
          args[0] === 'account'
            ? {
                id: original.plan.subscription.id,
                tenantId: original.plan.subscription.tenantId,
                environmentName: original.plan.subscription.cloud,
                state: 'Enabled',
              }
            : args[0] === 'group'
              ? false
              : [];
        return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
      },
    };
    await original.storage.write('azure-terraform-teardown-receipt.json', {
      status: 'retired',
      sourcePlanSha256: original.plan.planSha256,
      teardownPlanSha256: teardown.planSha256,
      finalPlanSha256: emptyDestroy.planSha256,
      cloud: 'absent',
      sites: 'deleted',
      observedAt: new Date().toISOString(),
    });
    const nativeSession = await owningService.open(
      original.storage.owner,
      await azureTerraformCurrentDeployment(original.plan),
      'current',
    );
    const run = () =>
      runAzureTerraformTeardown(
        original.plan,
        teardown,
        teardown.planSha256,
        lifecycleRuntime,
        lifecycleContract,
        nativeSession,
        original.storage,
        lifecycleApi,
        {},
        undefined,
        owningService,
        networkContext,
      );
    process.stdout.write(
      `${JSON.stringify({ phase: 'network-teardown-lifecycle-begin', monotonicMs: performance.now() })}\n`,
    );
    const result = await run();
    expect(result).toMatchObject({
      status: 'network-parent-packets-retired',
      completeCleanup: false,
      interfaceAbsenceQualified: false,
      opaqueCheckoutRetirementQualified: true,
      fullExternalCleanupQualified: false,
      parentRetirementQualified: false,
    });
    expect(result).toMatchObject({ checkoutRetirement: { status: 'network-opaque-checkouts-retired' } });
    const opaqueDirectory = join(
      opaqueCheckout.root,
      ...opaqueCheckout.reference.slice('f5xc-ce://'.length).split('/'),
    );
    await expect(lstat(join(opaqueDirectory, 'token'))).rejects.toMatchObject({ code: 'ENOENT' });
    const opaqueMetadataBytes = await readFile(join(opaqueDirectory, 'metadata.json'), 'utf8');
    expect(JSON.parse(opaqueMetadataBytes)).toMatchObject({
      consumed: true,
      retirement: { status: 'bootstrap-secret-retired' },
    });
    expect(platformReads).toBeGreaterThan(0);
    expect(cloudReads).toBeGreaterThan(0);
    const terminal = await original.storage.read('azure-terraform-terminal-cleanup.json');
    expect(Object.hasOwn(terminal as object, 'retainedDestroyConfiguration')).toBe(false);
    const packetNames = [
      'azure-terraform-network-packet-retirement.json',
      'azure-terraform-network-bootstrap-packet-retirement.json',
    ];
    for (const name of packetNames)
      expect(await original.storage.read(name)).toMatchObject({ status: 'packets-retired', pending: null });
    const commands = [...original.commands],
      terminalBytes = await readFile(join(original.storage.directory, 'azure-terraform-terminal-cleanup.json'), 'utf8');
    const replay = await run();
    expect(replay).toEqual(result);
    expect(await readFile(join(opaqueDirectory, 'metadata.json'), 'utf8')).toBe(opaqueMetadataBytes);
    expect(original.commands).toEqual(commands);
    expect(await readFile(join(original.storage.directory, 'azure-terraform-terminal-cleanup.json'), 'utf8')).toBe(
      terminalBytes,
    );
    process.stdout.write(
      `${JSON.stringify({ phase: 'network-teardown-lifecycle-complete', monotonicMs: performance.now() })}\n`,
    );
  } finally {
    if (nativeStarted !== undefined)
      process.stdout.write(
        `${JSON.stringify({ phase: 'native-main-test-finally', durationMs: performance.now() - nativeStarted, budgetMs: 180000 })}\n`,
      );
    await original.close();
    await rm(publicDirectory, { recursive: true });
  }
}, 600000);

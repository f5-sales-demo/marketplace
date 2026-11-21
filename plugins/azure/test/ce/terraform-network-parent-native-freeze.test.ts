import { expect } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import { createCeTerraformService } from '../../../terraform/src/service';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { qualifyAzureTerraformNetworkTerminalJournalCustody } from '../../src/ce/terraform-network-destroy-journal-custody';
import { readAzureTerraformNetworkParentInventory } from '../../src/ce/terraform-network-parent-inventory';
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
import { azureUpgradeBinding, prepareAzureTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import { retireAzureTerraformUpgradeStage } from '../../src/ce/terraform-upgrade-retirement';
import { test } from './owned-fixture-test';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { lineageCleanupEvidence } from './terraform-network-lineage-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { completedReplacement } from './terraform-network-mixed-generation-fixture';

import { networkReplacementExecutorFixture } from './terraform-network-replacement-executor-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';
import { executeOwningPendingImport } from './terraform-pending-import-parent-fixture';

test('parent enrollment freezes exhaustive schema file and directory dispositions before main', async () => {
  const birth = await terraformNetworkSourceFixture(true);
  const original = await originalNativeWorkflowFixture(
    true,
    false,
    birth.original.intent.nics,
    birth.original.computeCapacity.quotaAvailable,
    true,
  );
  const publicDirectory = await mkdtemp(join(tmpdir(), 'original-network-native-seed-'));
  const upgradeCliRoot = await mkdtemp(join(tmpdir(), 'parent-upgrade-native-cli-'));
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
    process.stdout.write(`${JSON.stringify({ phase: 'original-apply-begin', monotonicMs: performance.now() })}\n`);
    const outcome = await original.run();
    expect(outcome.status).toBe('registered');
    const pendingProof = await executeOwningPendingImport(original);
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
    const bin = join(upgradeCliRoot, 'bin');
    await mkdir(bin, { mode: 0o700 });
    await writeFile(
      join(bin, 'terraform'),
      "#!/usr/bin/python3\n# Task-owned CLI fixture: synthetic Terraform/provider/cloud replies; real argv/process/files.\nimport json,os,sys\nfrom pathlib import Path\nroot=Path(ROOT)\na=sys.argv[1:]\nwith (root/'calls.jsonl').open('a') as f: f.write(json.dumps({'pid':os.getpid(),'ppid':os.getppid(),'args':a})+'\\n')\nc=json.loads(Path('main.tf.json').read_text())\nv=c['terraform']['required_version'].split('=')[-1].strip()\nempty={'format_version':'1.2','terraform_version':v,'errored':False,'complete':True,'applyable':False,'resource_changes':[],'output_changes':{},'planned_values':{'root_module':{}}}\nif a[0]=='version': print(json.dumps({'terraform_version':v}))\nelif a[0] in ['init','validate']: print('{}')\nelif a[0]=='plan':\n plan=dict(empty)\n invoke=next((x.split('=',1)[1] for x in a if x.startswith('-invoke=')),None)\n if invoke:\n  _,t,n=invoke.split('.')\n  plan.update({'applyable':True,'action_invocations':[{'address':invoke,'type':t,'name':n,'config_values':c['action'][t][n]['config'],'config_sensitive':{},'config_unknown':{},'provider_name':'registry.terraform.io/f5-sales-demo/xcsh','invoke_action_trigger':{}}]})\n target=next(x.split('=',1)[1] for x in a if x.startswith('-out='))\n if target.startswith('independent-cleanup-') and (root/'worker-dirty').exists():\n  plan['resource_changes']=[{'address':'fixture.remaining','type':'fixture','change':{'actions':['create']}}]\n Path(target).write_text(json.dumps(plan,sort_keys=True));os.chmod(target,0o600);print('{}')\nelif a[0]=='show':\n if len(a)==2: print(json.dumps({'format_version':'1.0','terraform_version':v,'values':{'root_module':{'resources':[]}}}))\n else: print(Path(a[-1]).read_text())\nelif a[0]=='apply':\n Path('terraform.tfstate').write_text(json.dumps({'version':4,'terraform_version':v,'serial':1,'lineage':'fixture','outputs':{},'resources':[]}));os.chmod('terraform.tfstate',0o600);print('{}')\nelse: sys.exit(64)\n".replace(
        'ROOT',
        JSON.stringify(upgradeCliRoot),
      ),
      { mode: 0o700 },
    );
    const nativeEnv = { PATH: `${bin}:/usr/bin:/bin` };
    const nativePlatform = {
      storage: async () => {
        await original.storage.verify();
        return original.storage;
      },
    } as unknown as CePlatformService;
    const nativeTerraform = createCeTerraformService(async () => nativePlatform);
    const readOnlyService = main.service;
    const owningService: typeof main.service = {
      ...readOnlyService,
      async open(owner, deployment, resume) {
        if (deployment.stage?.startsWith('upgrade-')) return nativeTerraform.open(owner, deployment, resume);
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
    const prepared = await prepareAzureTerraformNetworkTerminalPlanning(
      original.plan,
      original.storage,
      networkContext,
      async () => ({ fixture: 'synthetic-platform-and-cloud-absence', owner: original.storage.owner }),
      {},
    );
    const owningSiteContractFingerprint = originalReservation.contractFingerprint;
    const upgradeContract = {
      fingerprint: `sha256:${'a'.repeat(64)}`,
      build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
    } as unknown as VerifiedUpgradeContract;
    const upgrade = await prepareAzureTerraformUpgrade(
      original.plan,
      { kind: 'software', version: 'crt-20260201-0179' },
      {
        observeUpgrade: async () => ({
          owner: teardownBinding.owner,
          nodes: teardownBinding.nodes,
          siteName: teardownBinding.siteName,
          source: `/api/config/namespaces/system/sites/${teardownBinding.siteName}`,
          siteUid: birth.site.siteUid,
          physicalSiteUid: 'fixture-physical-site-uid',
          contractFingerprint: upgradeContract.fingerprint,
          siteContractFingerprint: owningSiteContractFingerprint,
          status: 'observed' as const,
          startedAt: new Date().toISOString(),
          observedAt: new Date().toISOString(),
          targetSoftware: 'crt-20260201-0179',
          online: true,
          siteState: 'ONLINE',
          software: {
            installed: 'crt-20260201-0178',
            available: 'crt-20260201-0179',
            phase: 'UPGRADE_COMPLETED',
            result: 'Completed',
          },
          os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
          targets: ['crt-20260201-0179'],
          targetSoftwareListed: true,
          prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
          progress: { status: 'COMPLETED', version: 'crt-20260201-0178' },
          sources: { site: '', targets: '', precheck: '', progress: '' },
          nodeHealth: 'unknown' as const,
          routing: 'unknown' as const,
          traffic: 'unknown' as const,
        }),
      },
      upgradeContract,
    );
    const nativeUpgradeSession = await nativeTerraform.open(teardownBinding.owner, upgrade.deployment, false);
    const action = await nativeUpgradeSession.planAction(upgrade.action, nativeEnv);
    await nativeUpgradeSession.apply(action, nativeEnv);
    await original.storage.write(`${upgrade.planId}.json`, upgrade);
    await original.storage.write(`${upgrade.planId}-authorization.json`, {
      schemaVersion: 2,
      engine: 'terraform',
      sourcePlanSha256: original.plan.planSha256,
      upgradePlanSha256: upgrade.planSha256,
      mutations: true,
    });
    await original.storage.write(`${upgrade.planId}-checkpoint.json`, {
      schemaVersion: 2,
      engine: 'terraform',
      sourcePlanSha256: original.plan.planSha256,
      upgradePlanSha256: upgrade.planSha256,
      phase: 'complete',
      actionPlanSha256: action.planSha256,
    });
    await original.storage.write(`${upgrade.planId}-action-plan.json`, action);
    await original.storage.write(`${upgrade.planId}-receipt.json`, {
      status: 'upgrade-complete',
      engine: 'terraform',
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: original.plan.siteName,
      target: upgrade.expectation.target,
      actionPlanSha256: action.planSha256,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown',
      routing: 'unknown',
      traffic: 'unknown',
    });
    await original.storage.write('terraform-ce-upgrade-serial.json', {
      schemaVersion: 2,
      engine: 'terraform',
      status: 'idle',
      lastPlanId: upgrade.planId,
      lastPlanSha256: upgrade.planSha256,
    });
    const stageResult = await retireAzureTerraformUpgradeStage(
      original.plan,
      upgrade,
      upgradeContract,
      nativeTerraform,
      original.storage,
      'b'.repeat(64),
      nativeEnv,
    );
    expect(stageResult.status).toBe('runner-artifacts-retired');
    const stageBefore = await readFile(join(original.storage.directory, `${upgrade.planId}-stage-retirement.json`));
    const nativeCallsBefore = await readFile(join(upgradeCliRoot, 'calls.jsonl'));

    const context = {
      ...networkContext,
      terminalCleanup: prepared.checkpoint,
      parentContracts: { upgrade: upgradeContract },
    };

    const terminal = await qualifyAzureTerraformNetworkTerminalJournalCustody(original.plan, original.storage, context);
    const commands = [...original.commands];
    const parent = await readAzureTerraformNetworkParentInventory(original.plan, original.storage, context, terminal);
    const files = [
      ...parent.files.filter((file) => !file.path.startsWith(`${parent.mainDirectory}/`)),
      parent.terminalFile,
    ];
    process.stdout.write(
      `${JSON.stringify({
        phase: 'full-parent-disposition-namespace',
        files: files.map((file) => ({
          path: file.path,
          identity: file.identity,
          sha256: file.sha256,
          packetSha256: file.packetSha256,
        })),
        directories: parent.directories.map((directory) => ({
          path: directory.path,
          identity: directory.identity,
          names: directory.names,
        })),
        authenticatedPacketNames: parent.networkPacketNames,
        absentPacketNames: parent.absentNetworkPacketNames,
        sensitiveStagingDecisions: Reflect.get(parent, 'sensitiveStagingDecisions'),
        nativeMainTransitionExcluded: parent.mainDirectory,
      })}\n`,
    );
    const raw = Reflect.get(parent, 'parentArtifactDecisions');
    process.stdout.write(
      `${JSON.stringify({ phase: 'full-parent-dispositions-observed', decisionsPresent: Array.isArray(raw) })}\n`,
    );
    expect(Array.isArray(raw)).toBe(true);
    if (!Array.isArray(raw)) throw Error('Complete before-main schema dispositions required');
    const decisions = raw as Array<{
      path: string;
      action: string;
      identity: string;
      sha256: string;
      packetSha256: string;
      schema: string;
    }>;
    const pendingDecisions = decisions.filter((row) => row.path === 'azure-terraform-pending-vm-import.json');
    expect(pendingDecisions).toHaveLength(1);
    expect(pendingDecisions[0].action).toBe('delete');
    expect(pendingDecisions[0].schema).toBe('azure-terraform-pending-import-v2');
    expect(Reflect.get(pendingDecisions[0], 'payloadSha256ByField')).toEqual(pendingProof.payloadSha256ByField);
    expect(pendingDecisions[0].identity).toBe(pendingProof.identity);
    expect(pendingDecisions[0].sha256).toBe(pendingProof.bytesSha256);
    expect(pendingDecisions[0].packetSha256).toBe(pendingProof.packetSha256);
    expect(decisions).toHaveLength(files.length);
    expect(new Set(decisions.map((row) => row.path)).size).toBe(files.length);
    for (const file of files) {
      const decision = decisions.find((row) => row.path === file.path);
      if (!decision) throw Error(`Unaccounted parent file: ${file.path}`);
      expect(decision.identity).toBe(file.identity);
      expect(decision.sha256).toBe(file.sha256);
      expect(decision.packetSha256).toBe(file.packetSha256);
      expect(['preserve', 'delete', 'owning-transition'].includes(decision.action)).toBe(true);
      expect(typeof decision.schema === 'string' && decision.schema.length > 0).toBe(true);
      if (file.path === parent.terminalFile.path) expect(decision.action).toBe('owning-transition');
      if (file.path.startsWith('terraform-stages/')) expect(decision.action).toBe('preserve');
    }
    const sensitive = Reflect.get(parent, 'sensitiveStagingDecisions') as Array<{ path: string }>;
    expect(sensitive).toHaveLength(9);
    for (const file of sensitive) {
      const decision = decisions.find((row) => row.path === file.path);
      if (!decision) throw Error('Sensitive packet has no complete parent decision');
      expect(decision.action).toBe('delete');
    }
    const directories = Reflect.get(parent, 'parentDirectoryDecisions');
    expect(Array.isArray(directories)).toBe(true);
    if (!Array.isArray(directories)) throw Error('Complete parent directory decisions required');
    expect(directories).toHaveLength(parent.directories.length);
    expect(new Set(directories.map((row) => Reflect.get(row, 'path'))).size).toBe(parent.directories.length);
    for (const directory of parent.directories) {
      const decision = directories.find((row) => Reflect.get(row, 'path') === directory.path);
      if (!decision) throw Error('Unaccounted parent directory');
      expect(Reflect.get(decision, 'identity')).toBe(directory.identity);
      expect(['preserve', 'delete', 'owning-transition'].includes(Reflect.get(decision, 'action'))).toBe(true);
    }
    expect(Reflect.get(parent, 'completeParentDispositionQualified') as unknown).toBe(true);
    const upgradeDecision = decisions.find((row) => row.path === `${upgrade.planId}.json`);
    expect(upgradeDecision?.action).toBe('preserve');
    expect(upgradeDecision?.schema).toBe('azure-terraform-upgrade-root-history-v2');
    const retirementDecision = decisions.find((row) => row.path === `${upgrade.planId}-stage-retirement.json`);
    expect(retirementDecision?.schema).toBe('azure-terraform-upgrade-native-retirement-v2');
    expect(retirementDecision?.action).toBe('preserve');
    expect(await readFile(join(original.storage.directory, `${upgrade.planId}-stage-retirement.json`))).toEqual(
      stageBefore,
    );
    expect(await readFile(join(upgradeCliRoot, 'calls.jsonl'))).toEqual(nativeCallsBefore);
    expect(parent.parentRetirementQualified).toBe(false);
    expect(original.commands).toEqual(commands);
  } finally {
    await original.close();
    await rm(publicDirectory, { recursive: true });
    await rm(upgradeCliRoot, { recursive: true });
  }
}, 600000);

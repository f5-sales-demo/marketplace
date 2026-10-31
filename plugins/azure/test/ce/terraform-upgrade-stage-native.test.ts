import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import { createCeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { qualifyAzureTerraformUpgradeAppliedJournal } from '../../src/ce/terraform-upgrade-applied-journal';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding, prepareAzureTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import {
  finalizeAzureTerraformUpgradeStageRetirement,
  readAzureTerraformUpgradeStageRetirement,
  retireAzureTerraformUpgradeStage,
} from '../../src/ce/terraform-upgrade-retirement';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const p of roots.splice(0)) {
    const diagnosticRoot = process.env.CE_TEST_DIAGNOSTICS_ROOT ?? join(tmpdir(), 'ce-native-worker-diagnostics');
    const retain = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await retain(path);
        else if (entry.isFile() && /^cleanup-verifier-failure-[a-f0-9-]+\.json$/.test(entry.name)) {
          const bytes = await readFile(path);
          await mkdir(diagnosticRoot, { recursive: true, mode: 0o700 });
          const digest = sha256Hex(bytes.toString());
          await writeFile(join(diagnosticRoot, `${digest}.json`), bytes, { mode: 0o600 });
          const packet = JSON.parse(bytes.toString()) as { exitCode: number | null; stderr: string };
          console.log(
            JSON.stringify({
              phase: 'retained-native-worker-failure',
              bytesSha256: digest,
              bytes: bytes.length,
              exitCode: packet.exitCode,
              stderrSha256: sha256Hex(packet.stderr),
            }),
          );
        }
      }
    };
    await retain(p);
    await rm(p, { recursive: true, force: true });
  }
});
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;
async function fixture(apply = true) {
  const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(base);
  const upgrade = await prepareAzureTerraformUpgrade(
    base,
    { kind: 'software', version: 'crt-20260201-0179' },
    {
      observeUpgrade: async () => ({
        owner: binding.owner,
        nodes: binding.nodes,
        siteName: binding.siteName,
        source: `/api/config/namespaces/system/sites/${binding.siteName}`,
        siteUid: 'logical-one',
        physicalSiteUid: 'physical-one',
        contractFingerprint: contract.fingerprint,
        siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
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
    contract,
  );
  const root = await mkdtemp(join(tmpdir(), 'upgrade-native-stage-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  const bin = join(root, 'bin');
  await mkdir(bin, { mode: 0o700 });
  await writeFile(
    join(bin, 'terraform'),
    "#!/usr/bin/python3\n# Task-owned CLI fixture: synthetic Terraform/provider/cloud replies; real argv/process/files.\nimport json,os,sys\nfrom pathlib import Path\nroot=Path(ROOT)\na=sys.argv[1:]\nwith (root/'calls.jsonl').open('a') as f: f.write(json.dumps({'pid':os.getpid(),'ppid':os.getppid(),'args':a})+'\\n')\nc=json.loads(Path('main.tf.json').read_text())\nv=c['terraform']['required_version'].split('=')[-1].strip()\nempty={'format_version':'1.2','terraform_version':v,'errored':False,'complete':True,'applyable':False,'resource_changes':[],'output_changes':{},'planned_values':{'root_module':{}}}\nif a[0]=='version': print(json.dumps({'terraform_version':v}))\nelif a[0] in ['init','validate']: print('{}')\nelif a[0]=='plan':\n plan=dict(empty)\n invoke=next((x.split('=',1)[1] for x in a if x.startswith('-invoke=')),None)\n if invoke:\n  _,t,n=invoke.split('.')\n  plan.update({'applyable':True,'action_invocations':[{'address':invoke,'type':t,'name':n,'config_values':c['action'][t][n]['config'],'config_sensitive':{},'config_unknown':{},'provider_name':'registry.terraform.io/f5-sales-demo/xcsh','invoke_action_trigger':{}}]})\n target=next(x.split('=',1)[1] for x in a if x.startswith('-out='))\n if target.startswith('independent-cleanup-') and (root/'worker-dirty').exists():\n  plan['resource_changes']=[{'address':'fixture.remaining','type':'fixture','change':{'actions':['create']}}]\n Path(target).write_text(json.dumps(plan,sort_keys=True));os.chmod(target,0o600);print('{}')\nelif a[0]=='show':\n if len(a)==2: print(json.dumps({'format_version':'1.0','terraform_version':v,'values':{'root_module':{'resources':[]}}}))\n else: print(Path(a[-1]).read_text())\nelif a[0]=='apply':\n Path('terraform.tfstate').write_text(json.dumps({'version':4,'terraform_version':v,'serial':1,'lineage':'fixture','outputs':{},'resources':[]}));os.chmod('terraform.tfstate',0o600);print('{}')\nelse: sys.exit(64)\n".replace(
      'ROOT',
      JSON.stringify(root),
    ),
    { mode: 0o700 },
  );
  const env = { PATH: `${bin}:/usr/bin:/bin` };
  const platform = {
    storage: async () => {
      await store.verify();
      return store;
    },
  } as unknown as CePlatformService;
  const terraform = createCeTerraformService(async () => platform);
  const session = await terraform.open(binding.owner, upgrade.deployment, false);
  const action = await session.planAction(upgrade.action, env);
  if (apply) await session.apply(action, env);
  await store.write(`${upgrade.planId}.json`, upgrade);
  await store.write(`${upgrade.planId}-authorization.json`, {
    schemaVersion: 2,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    mutations: true,
  });
  await store.write(`${upgrade.planId}-checkpoint.json`, {
    schemaVersion: 2,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    phase: 'complete',
    actionPlanSha256: action.planSha256,
  });
  await store.write(`${upgrade.planId}-action-plan.json`, action);
  await store.write(`${upgrade.planId}-receipt.json`, {
    status: 'upgrade-complete',
    engine: 'terraform',
    planId: upgrade.planId,
    planSha256: upgrade.planSha256,
    siteName: binding.siteName,
    target: upgrade.expectation.target,
    actionPlanSha256: action.planSha256,
    observedAt: new Date().toISOString(),
    nodeHealth: 'unknown',
    routing: 'unknown',
    traffic: 'unknown',
  });
  await store.write('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'idle',
    lastPlanId: upgrade.planId,
    lastPlanSha256: upgrade.planSha256,
  });
  const stageRoot = join(
    store.directory,
    'terraform-stages',
    String(upgrade.deployment.stage),
    upgrade.deployment.deploymentId,
  );
  const calls = async () =>
    (await readFile(join(root, 'calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { pid: number; ppid: number; args: string[] });
  const run = (digest = 'b'.repeat(64)) =>
    retireAzureTerraformUpgradeStage(base, upgrade, contract, terraform, store, digest, env);
  return { base, binding, upgrade, store, terraform, session, action, root, stageRoot, calls, run };
}

// Native runner/archive/service/worker acceptance only. The executable's provider/cloud replies,
// trusted contract, completion root packets and external absence digest are synthetic.
test('actual service archives applied action and retires through a distinct native cleanup worker; replay executes nothing', async () => {
  const f = await fixture();
  const proof = await qualifyAzureTerraformUpgradeAppliedJournal(
    f.base,
    f.upgrade,
    {
      siteUid: f.upgrade.expectation.siteUid,
      physicalSiteUid: f.upgrade.expectation.physicalSiteUid,
      siteContractFingerprint: f.upgrade.expectation.siteContractFingerprint,
    },
    contract,
    f.store,
    f.session,
  );
  expect(proof.journalCustodyQualified).toBe(true);
  expect(proof.applicationOutcomeQualified).toBe(false);
  expect(proof.currentOperationalAcceptanceQualified).toBe(false);
  expect(
    (proof.history.matches as Array<{ location: string; state: string }>).some(
      (row) => row.location === 'current' && row.state === 'applied',
    ),
  ).toBe(true);
  const result = await f.run();
  const checkpoint = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as Record<string, unknown>;
  expect(checkpoint.schemaVersion).toBe(2);
  expect(checkpoint.status).toBe('retired');
  expect(checkpoint.externalEvidenceSha256).toBe('b'.repeat(64));
  expect(checkpoint.evidenceSha256).toBe(canonicalSha256(checkpoint.retirementEvidence));
  const retained = checkpoint.appliedJournal as typeof proof;
  expect(
    (retained.history.matches as Array<{ location: string; state: string }>).some(
      (row) => row.location === 'plan-history' && row.state === 'applied',
    ),
  ).toBe(true);
  expect(retained.history.receiptSha256).toBe(canonicalSha256(f.action));
  const marker = JSON.parse(await readFile(join(f.stageRoot, 'artifact-retirement.json'), 'utf8'));
  expect(marker.independentCleanup.executorPid).not.toBe(process.pid);
  expect(marker.independentCleanup.parentPid).toBe(process.pid);
  expect(marker.independentCleanup.terraformExecutableSha256).toBe(
    sha256Hex(await readFile(join(f.root, 'bin', 'terraform'), 'utf8')),
  );
  expect(result.independentCleanupSha256).toBe(canonicalSha256(marker.independentCleanup));
  const calls = await f.calls();
  const refresh = calls.filter(
    (row) => row.args[0] === 'plan' && row.args.some((arg) => arg.startsWith('-out=independent-cleanup-')),
  );
  expect(refresh).toHaveLength(1);
  expect(refresh[0].ppid).toBe(marker.independentCleanup.executorPid);
  expect(refresh[0].args).toContain('-refresh=true');
  expect(calls.filter((row) => row.args[0] === 'apply')).toHaveLength(1);
  process.stdout.write(
    `${JSON.stringify({
      phase: 'native-upgrade-stage-worker-custody',
      scope: 'private-source-fixture',
      providerAndCloudResponses: 'synthetic',
      marker,
      result,
      evidenceEnvelope: checkpoint.retirementEvidence,
      nativeWorkerRefresh: refresh[0],
      stageCheckpointSha256: sha256Hex(JSON.stringify(checkpoint)),
      applicationOutcomeQualified: false,
      installedQualified: false,
      liveQualified: false,
    })}\n`,
  );
  expect((await readdir(f.stageRoot)).toSorted()).toEqual(['artifact-retirement.json', 'deployment.json']);
  expect(await f.run()).toEqual(result);
  expect(await f.calls()).toEqual(calls);
  await expect(f.run('c'.repeat(64))).rejects.toThrow('original stage checkpoint identity differs');
  expect(await f.calls()).toEqual(calls);
});

test('actual planned journal never qualifies the synthetic completed upgrade root', async () => {
  const f = await fixture(false);
  await expect(f.run()).rejects.toThrow('owning applied action required');
  expect(await readdir(f.stageRoot)).toContain('saved.tfplan');
  expect((await f.calls()).filter((row) => row.args[0] === 'apply')).toHaveLength(0);
  expect(
    (await f.calls()).filter((row) => row.args.some((arg) => arg.startsWith('-out=independent-cleanup-'))),
  ).toHaveLength(0);
});

test('actual independent worker rejects nonempty refresh before artifact deletion', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'worker-dirty'), 'fixture', { mode: 0o600 });
  await expect(f.run()).rejects.toThrow('Independent original Terraform cleanup verification failed');
  const checkpoint = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as Record<string, unknown>;
  expect(checkpoint.status).toBe('retiring');
  const files = await readdir(f.stageRoot);
  expect(files).toContain('saved.tfplan');
  expect(files).toContain('plan-history');
  expect(files).not.toContain('artifact-retirement.json');
  expect(files.some((name) => name.startsWith('cleanup-verifier-failure-'))).toBe(true);
  const calls = await f.calls();
  expect(calls.filter((row) => row.args.some((arg) => arg.startsWith('-out=independent-cleanup-')))).toHaveLength(1);
  expect(calls.filter((row) => row.args[0] === 'apply')).toHaveLength(1);
});

test('read-only stage reader uses the original permanent barrier and leaves all roots and execution unchanged', async () => {
  const f = await fixture();
  const retired = await f.run();
  const checkpointPath = join(f.store.directory, `${f.upgrade.planId}-stage-retirement.json`);
  const before = await readFile(checkpointPath);
  const calls = await f.calls();
  const read = () => readAzureTerraformUpgradeStageRetirement(f.base, f.upgrade, contract, f.terraform, f.store);
  expect(await read()).toEqual(retired);
  expect(await readFile(checkpointPath)).toEqual(before);
  expect(await f.calls()).toEqual(calls);
  const markerPath = join(f.stageRoot, 'artifact-retirement.json');
  const marker = await readFile(markerPath);
  await rm(markerPath);
  await expect(read()).rejects.toThrow(`lstat '${f.stageRoot}/main.tf.json'`);
  expect(await f.calls()).toEqual(calls);
  expect(await readFile(checkpointPath)).toEqual(before);
  await writeFile(markerPath, marker, { mode: 0o600 });
  expect(await read()).toEqual(retired);
});

test('read-only stage reader rejects an absent or interrupted checkpoint without execution or repair', async () => {
  const f = await fixture();
  const calls = await f.calls();
  const read = () => readAzureTerraformUpgradeStageRetirement(f.base, f.upgrade, contract, f.terraform, f.store);
  await expect(read()).rejects.toThrow('ENOENT');
  await writeFile(join(f.root, 'worker-dirty'), 'fixture', { mode: 0o600 });
  await expect(f.run()).rejects.toThrow('Independent original Terraform cleanup verification failed');
  const after = await f.calls();
  const checkpoint = await readFile(join(f.store.directory, `${f.upgrade.planId}-stage-retirement.json`));
  await expect(read()).rejects.toThrow('read-only completed stage checkpoint required');
  expect(await f.calls()).toEqual(after);
  expect(await readFile(join(f.store.directory, `${f.upgrade.planId}-stage-retirement.json`))).toEqual(checkpoint);
  expect(after.length).toBeGreaterThan(calls.length);
});

test('terminal stage finalizer preserves completed original evidence when the parent digest changes', async () => {
  const f = await fixture();
  const result = await f.run();
  const calls = await f.calls();
  const before = await readFile(join(f.store.directory, `${f.upgrade.planId}-stage-retirement.json`));
  const continued = await finalizeAzureTerraformUpgradeStageRetirement(
    f.base,
    f.upgrade,
    contract,
    f.terraform,
    f.store,
    'c'.repeat(64),
    {},
  );
  expect(continued).toEqual(result);
  expect(await f.calls()).toEqual(calls);
  expect(await readFile(join(f.store.directory, `${f.upgrade.planId}-stage-retirement.json`))).toEqual(before);
  await expect(f.run('c'.repeat(64))).rejects.toThrow('original stage checkpoint identity differs');
});

test('terminal stage finalizer uses new absence only for a new stage then replays with its original digest', async () => {
  const f = await fixture();
  const env = { PATH: `${join(f.root, 'bin')}:/usr/bin:/bin` };
  const result = await finalizeAzureTerraformUpgradeStageRetirement(
    f.base,
    f.upgrade,
    contract,
    f.terraform,
    f.store,
    'd'.repeat(64),
    env,
  );
  const checkpoint = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as Record<string, unknown>;
  expect(checkpoint.externalEvidenceSha256).toBe('d'.repeat(64));
  const calls = await f.calls();
  expect(
    await finalizeAzureTerraformUpgradeStageRetirement(
      f.base,
      f.upgrade,
      contract,
      f.terraform,
      f.store,
      'e'.repeat(64),
      {},
    ),
  ).toEqual(result);
  expect(await f.calls()).toEqual(calls);
});

test('terminal stage finalizer rejects an unresolved absence digest before retirement execution', async () => {
  const f = await fixture();
  const calls = await f.calls();
  await expect(
    finalizeAzureTerraformUpgradeStageRetirement(f.base, f.upgrade, contract, f.terraform, f.store, 'TBD', {}),
  ).rejects.toThrow('resolved external absence digest required');
  expect(await f.calls()).toEqual(calls);
  await expect(f.store.read(`${f.upgrade.planId}-stage-retirement.json`)).rejects.toThrow('ENOENT');
});

test('terminal finalizer resumes failed native worker verification with original stage evidence and no replanning', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'worker-dirty'), 'fixture', { mode: 0o600 });
  await expect(f.run()).rejects.toThrow('Independent original Terraform cleanup verification failed');
  const before = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as Record<string, unknown>;
  expect(before.status).toBe('retiring');
  await rm(join(f.root, 'worker-dirty'));
  const env = { PATH: `${join(f.root, 'bin')}:/usr/bin:/bin` };
  const result = await finalizeAzureTerraformUpgradeStageRetirement(
    f.base,
    f.upgrade,
    contract,
    f.terraform,
    f.store,
    'c'.repeat(64),
    env,
  );
  const after = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as Record<string, unknown>;
  expect(after.status).toBe('retired');
  expect(after.externalEvidenceSha256).toBe('b'.repeat(64));
  expect(after.evidenceSha256).toBe(before.evidenceSha256);
  expect(result.evidenceSha256).toBe(String(before.evidenceSha256));
  const calls = await f.calls();
  expect(calls.filter((row) => row.args[0] === 'apply')).toHaveLength(1);
  expect(calls.filter((row) => row.args[0] === 'plan' && row.args.includes('-out=saved.tfplan'))).toHaveLength(2);
  expect(
    calls.filter(
      (row) => row.args[0] === 'plan' && row.args.some((arg) => arg.startsWith('-out=independent-cleanup-')),
    ),
  ).toHaveLength(2);
});

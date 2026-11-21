import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { createCeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding, prepareAzureTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import { retireAzureTerraformUpgradeStage } from '../../src/ce/terraform-upgrade-retirement';
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

// Real service/runner/cleanup-worker custody. Terraform/provider/cloud replies and
// completion/absence fixtures are synthetic; this does not qualify CE or live cleanup.
test('retired current service reads exact native marker without configuration plaintext or Terraform execution', async () => {
  const f = await fixture();
  await f.run();
  const checkpoint = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as {
    receipt: PlanReceipt;
    evidenceSha256: string;
    retirementEvidence: unknown;
  };
  const calls = await f.calls();
  const markerPath = join(f.stageRoot, 'artifact-retirement.json');
  const markerBytes = await readFile(markerPath, 'utf8');
  const persisted = JSON.parse(await readFile(join(f.stageRoot, 'deployment.json'), 'utf8'));
  const knownCurrent = await azureTerraformCurrentDeployment(f.base);
  const expected = { ...f.upgrade.deployment, configuration: knownCurrent.configuration };
  expect(sha256Hex(expected.configuration)).not.toBe(persisted.configurationSha256);
  expect((await readdir(f.stageRoot)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
  const resumed = await f.terraform.open(f.binding.owner, expected, 'current');
  if (!resumed.readArtifactRetirement) throw Error('Owning retirement reader required');
  const observed = await resumed.readArtifactRetirement(checkpoint.receipt, checkpoint.evidenceSha256);
  expect(observed.status).toBe('runner-artifacts-retired');
  if (observed.status !== 'runner-artifacts-retired') throw Error('Complete retirement required');
  expect(observed.markerSha256).toBe(sha256Hex(markerBytes));
  expect(observed.receipt.manifestSha256).toBe(canonicalSha256(persisted));
  expect(observed.receipt.evidenceSha256).toBe(canonicalSha256(checkpoint.retirementEvidence));
  expect(observed.receipt.finalPlanSha256).toBe(checkpoint.receipt.planSha256);
  await expect(f.terraform.open(f.binding.owner, expected, true)).rejects.toThrow('identity differs');
  await expect(f.terraform.open({ ...f.binding.owner, engine: 'native' }, expected, 'current')).rejects.toThrow(
    'ownership differ',
  );
  await expect(
    f.terraform.open({ ...f.binding.owner, account: 'example-foreign' }, expected, 'current'),
  ).rejects.toThrow('ownership differ');
  for (const override of [
    { providerLock: '# foreign provider lock' },
    { backendIdentity: 'local:foreign' },
    { terraformVersion: '0.0.0' },
  ])
    await expect(f.terraform.open(f.binding.owner, { ...expected, ...override }, 'current')).rejects.toThrow(
      'identity differs',
    );
  await expect(f.terraform.open(f.binding.owner, { ...expected, stage: 'foreign-stage' }, 'current')).rejects.toThrow();
  await expect(resumed.readArtifactRetirement(checkpoint.receipt, 'c'.repeat(64))).rejects.toThrow();
  await expect(
    resumed.readArtifactRetirement({ ...checkpoint.receipt, planSha256: 'd'.repeat(64) }, checkpoint.evidenceSha256),
  ).rejects.toThrow();
  const abort = new AbortController();
  abort.abort(Error('retired-read-preabort'));
  await expect(
    resumed.readArtifactRetirement(checkpoint.receipt, checkpoint.evidenceSha256, abort.signal),
  ).rejects.toThrow('retired-read-preabort');
  const foreign = join(f.stageRoot, 'foreign.json');
  await writeFile(foreign, '{}', { mode: 0o600 });
  try {
    await expect(resumed.readArtifactRetirement(checkpoint.receipt, checkpoint.evidenceSha256)).rejects.toThrow(
      'inventory changed',
    );
  } finally {
    await rm(foreign);
  }
  expect(await resumed.readArtifactRetirement(checkpoint.receipt, checkpoint.evidenceSha256)).toEqual(observed);
  const changed = { ...JSON.parse(markerBytes), evidenceSha256: 'e'.repeat(64) };
  await writeFile(markerPath, JSON.stringify(changed), { mode: 0o600 });
  try {
    await expect(resumed.readArtifactRetirement(checkpoint.receipt, checkpoint.evidenceSha256)).rejects.toThrow();
  } finally {
    await writeFile(markerPath, markerBytes, { mode: 0o600 });
  }
  expect(await resumed.readArtifactRetirement(checkpoint.receipt, checkpoint.evidenceSha256)).toEqual(observed);
  await expect(resumed.plan({})).rejects.toThrow('retired');
  await expect(resumed.readConfiguration(persisted.configurationSha256)).rejects.toThrow('retired');
  expect(await f.calls()).toEqual(calls);
  expect(await readFile(markerPath, 'utf8')).toBe(markerBytes);
});

// Separate-process prerequisite. Manual task-owned source loss does not establish
// typed sensitive deletion or fresh recovery of the complete frozen parent graph.
test('a distinct process authenticates retired stage custody after original upgrade source loss', async () => {
  const f = await fixture();
  await f.run();
  const checkpoint = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as {
    receipt: PlanReceipt;
    evidenceSha256: string;
  };
  const markerBytes = await readFile(join(f.stageRoot, 'artifact-retirement.json'), 'utf8');
  const calls = await f.calls();
  const current = await azureTerraformCurrentDeployment(f.base);
  const expected = { ...f.upgrade.deployment, configuration: current.configuration };
  await rm(join(f.store.directory, `${f.upgrade.planId}.json`));
  const worker = `
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { createCeTerraformService } from '../../../terraform/src/service';
const input=JSON.parse(await Bun.stdin.text());
try {
 const store=await CeDeploymentStore.open(input.root,input.owner);
 const service=createCeTerraformService(async()=>({storage:async()=>{await store.verify();return store;}}));
 const session=await service.open(input.owner,input.expected,'current');
 if(!session.readArtifactRetirement) throw Error('native reader absent');
 const observed=await session.readArtifactRetirement(input.receipt,input.evidenceSha256);
 if(observed.status!=='runner-artifacts-retired') throw Error('native retirement incomplete');
 console.log(JSON.stringify({ok:true,pid:process.pid,observed}));
} catch(error) {
 console.log(JSON.stringify({ok:false,pid:process.pid,error:String(error.message)}));
 process.exitCode=1;
}
`;
  const invoke = async (overrides: Record<string, unknown> = {}) => {
    const child = Bun.spawn([process.execPath, '--eval', worker], {
      cwd: import.meta.dir,
      stdin: new Blob([
        JSON.stringify({
          root: f.root,
          owner: f.binding.owner,
          expected,
          receipt: checkpoint.receipt,
          evidenceSha256: checkpoint.evidenceSha256,
          ...overrides,
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
    const result = JSON.parse(stdout) as { ok: boolean; pid: number; observed?: unknown; error?: string };
    expect(result.pid).not.toBe(process.pid);
    return { exitCode, ...result };
  };
  const observed = await invoke();
  expect(observed.exitCode).toBe(0);
  expect(observed.ok).toBe(true);
  const native = observed.observed as {
    markerSha256: string;
    receipt: { evidenceSha256: string; finalPlanSha256: string };
  };
  expect(native.markerSha256).toBe(sha256Hex(markerBytes));
  expect(native.receipt.evidenceSha256).toBe(checkpoint.evidenceSha256);
  expect(native.receipt.finalPlanSha256).toBe(checkpoint.receipt.planSha256);
  for (const overrides of [
    { owner: { ...f.binding.owner, account: 'example-foreign' } },
    { owner: { ...f.binding.owner, engine: 'native' } },
    { expected: { ...expected, backendIdentity: 'local:foreign' } },
    { expected: { ...expected, providerLock: '# foreign' } },
    { expected: { ...expected, terraformVersion: '0.0.0' } },
    { expected: { ...expected, stage: 'foreign-stage' } },
    { evidenceSha256: 'c'.repeat(64) },
    { receipt: { ...checkpoint.receipt, planSha256: 'd'.repeat(64) } },
  ]) {
    const rejected = await invoke(overrides);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.ok).toBe(false);
    expect(typeof rejected.error).toBe('string');
  }
  const foreign = join(f.stageRoot, 'foreign.json');
  await writeFile(foreign, '{}', { mode: 0o600 });
  try {
    const rejected = await invoke();
    expect(rejected.exitCode).toBe(1);
    expect(rejected.ok).toBe(false);
  } finally {
    await rm(foreign);
  }
  expect((await invoke()).observed).toEqual(observed.observed);
  await writeFile(
    join(f.stageRoot, 'artifact-retirement.json'),
    JSON.stringify({ ...JSON.parse(markerBytes), evidenceSha256: 'e'.repeat(64) }),
    { mode: 0o600 },
  );
  try {
    const rejected = await invoke();
    expect(rejected.exitCode).toBe(1);
    expect(rejected.ok).toBe(false);
  } finally {
    await writeFile(join(f.stageRoot, 'artifact-retirement.json'), markerBytes, { mode: 0o600 });
  }
  expect((await invoke()).observed).toEqual(observed.observed);
  expect(await f.calls()).toEqual(calls);
  expect(await readFile(join(f.stageRoot, 'artifact-retirement.json'), 'utf8')).toBe(markerBytes);
  expect((await readdir(f.stageRoot)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
});

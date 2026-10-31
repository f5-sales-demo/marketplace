import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { reconcileAzurePendingVm } from '../../src/ce/terraform-pending-import';
import { intent, observation } from './fixtures';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const id = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
  const address = 'azurerm_linux_virtual_machine.node_1';
  const originalConfiguration = JSON.stringify({
    resource: { azurerm_linux_virtual_machine: { node_1: { name: 'node' } } },
  });
  const importedConfiguration = JSON.stringify({ import: [{ to: address, id }] });
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: base.deploymentName,
    backendIdentity: `local:${base.deploymentName}`,
    configurationSha256: hash(importedConfiguration),
    providerLockSha256: 'a'.repeat(64),
    planSha256: 'b'.repeat(64),
    changes: [{ address, type: 'azurerm_linux_virtual_machine', actions: ['no-op'] }],
    noChanges: false,
    imports: [
      {
        address,
        type: 'azurerm_linux_virtual_machine',
        providerName: 'registry.terraform.io/hashicorp/azurerm',
        idSha256: hash(id),
      },
    ],
  };
  const saved = {
    schemaVersion: 2,
    sourcePlanSha256: base.planSha256,
    vmId: 'owned-fixture-vm',
    id,
    address,
    originalConfiguration,
    configurationSha256: hash(originalConfiguration),
    importedConfiguration,
    importedConfigurationSha256: hash(importedConfiguration),
    receipt: receipt as PlanReceipt | undefined,
    status: undefined as 'imported' | undefined,
  };
  const vm = {
    id,
    name: `${base.deploymentName}-1`,
    vmId: saved.vmId,
    location: base.region,
    provisioningState: 'Failed',
    hardwareProfile: { vmSize: base.vm.size },
    tags: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-plan-sha256': base.planSha256,
      'xcsh-node-index': '1',
      'ves-io-site-name': base.siteName,
    },
    networkProfile: {
      networkInterfaces: base.nics.map((n) => ({
        id: `${id.split('/providers/')[0]}/providers/Microsoft.Network/networkInterfaces/${base.deploymentName}-1-nic${n.index}`,
      })),
    },
  };
  const history = {
    schemaVersion: 1 as const,
    scope: 'exact-saved-plan-journal-history' as const,
    receiptSha256: canonicalSha256(receipt),
    manifestSha256: 'c'.repeat(64),
    matches: [
      {
        location: 'revision' as const,
        archiveSha256: 'd'.repeat(64),
        state: 'applied' as 'applied' | 'planned' | 'applying',
        journalSha256: 'e'.repeat(64),
        savedPlanSha256: receipt.planSha256,
        configurationSha256: receipt.configurationSha256,
        manifestSha256: 'f'.repeat(64),
      },
    ],
    incompleteArchives: 0,
    applicationOutcomeQualified: false as const,
    retirementQualified: false as const,
  };
  let writes = 0,
    revisions = 0,
    applies = 0,
    histories = 0;
  const rows = [{ address, type: 'azurerm_linux_virtual_machine', id }];
  const session = {
    readResourceIdentities: async () => rows,
    readConfigurationSha256: async () => saved.configurationSha256,
    planImports: async () => {
      throw Error('unexpected planning');
    },
    readPlanApplicationHistory: async () => {
      histories++;
      return history;
    },
    reviseConfiguration: async () => {
      revisions++;
      throw Error('unexpected revision');
    },
    apply: async () => {
      applies++;
      throw Error('unexpected apply');
    },
  } as unknown as TerraformSession;
  const storage = {
    read: async () => structuredClone(saved),
    write: async (_: string, value: typeof saved) => {
      writes++;
      saved.status = value.status;
    },
  } as unknown as CeDeploymentStore;
  const api = {
    exec: async (_: string, args: string[]) => {
      let result: unknown;
      if (args[0] === 'account')
        result = { ...base.subscription, environmentName: base.subscription.cloud, state: 'Enabled' };
      else if (args[0] === 'group' && args[1] === 'exists') result = true;
      else if (args[0] === 'group') result = { id: id.split('/providers/')[0], location: base.region, tags: vm.tags };
      else if (args[0] === 'vm') result = vm;
      else throw Error('unexpected cloud command');
      return { exitCode: 0, stdout: JSON.stringify(result), stderr: '' };
    },
  } as unknown as AzExecApi;
  const run = () => reconcileAzurePendingVm(base, session, storage, api, {});
  return { saved, history, rows, receipt, session, run, counts: () => ({ writes, revisions, applies, histories }) };
}

test('existing exact VM state without saved receipt rejects before completion or executor mutation', async () => {
  const f = await fixture();
  f.saved.receipt = undefined;
  await expect(f.run()).rejects.toThrow('lacks saved import receipt');
  expect(f.counts()).toEqual({ writes: 0, revisions: 0, applies: 0, histories: 0 });
});
test('restored original configuration accepts independently applied archived import receipt', async () => {
  const f = await fixture();
  expect(await f.run()).toBe(true);
  expect(f.saved.status).toBe('imported');
  expect(f.counts()).toEqual({ writes: 1, revisions: 0, applies: 0, histories: 2 });
});
for (const [name, mutate, error] of [
  [
    'unapplied archive',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.history.matches[0].state = 'planned';
    },
    'applied history unavailable',
  ],
  [
    'incomplete archive',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.history.incompleteArchives = 1;
    },
    'exact journal history unavailable',
  ],
  [
    'foreign saved binary',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.history.matches[0].savedPlanSha256 = '0'.repeat(64);
    },
    'archived journal differs',
  ],
  [
    'wrong archived configuration',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.history.matches[0].configurationSha256 = '0'.repeat(64);
    },
    'archived journal differs',
  ],
  [
    'duplicated archive',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.history.matches.push(f.history.matches[0]);
    },
    'archived journal differs',
  ],
  [
    'mutating receipt',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      if (!f.saved.receipt) throw Error('fixture receipt missing');
      f.saved.receipt.changes[0].actions = ['update'];
    },
    'mutating or foreign',
  ],
  [
    'foreign state type',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.rows[0].type = 'other';
    },
    'state identity differs',
  ],
  [
    'duplicate state address',
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.rows.push({ ...f.rows[0], id: 'foreign' });
    },
    'state identity differs',
  ],
] as const)
  test(`${name} blocks import completion`, async () => {
    const f = await fixture();
    mutate(f);
    await expect(f.run()).rejects.toThrow(error);
    expect(f.counts().writes).toBe(0);
    expect(f.counts().revisions).toBe(0);
    expect(f.counts().applies).toBe(0);
  });

// Actual service/runner/archive custody; task-owned Terraform and Azure replies are synthetic.
import { afterEach } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore as NativeStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { createCeTerraformService } from '../../../terraform/src/service';
import { azureTerraformFoundationDeployment } from '../../src/ce/terraform-foundation';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';

const nativeRoots: string[] = [];
afterEach(async () => {
  for (const root of nativeRoots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function nativeFixture(prepared = true) {
  const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const owner = azureUpgradeBinding(base).owner;
  const root = await mkdtemp(join(tmpdir(), 'pending-import-native-'));
  nativeRoots.push(root);
  const store = await NativeStore.open(root, owner);
  const bin = join(root, 'bin');
  await mkdir(bin, { mode: 0o700 });
  const id = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
  const address = 'azurerm_linux_virtual_machine.node_1';
  const cli = `#!/usr/bin/python3
import json,os,sys
from pathlib import Path
root=Path(ROOT)
a=sys.argv[1:]
with (root/'calls.jsonl').open('a') as f:f.write(json.dumps({'pid':os.getpid(),'ppid':os.getppid(),'args':a})+'\\n')
c=json.loads(Path('main.tf.json').read_text());v=c['terraform']['required_version'].split('=')[-1].strip()
if a[0]=='version':print(json.dumps({'terraform_version':v}))
elif a[0] in ['init','validate']:print('{}')
elif a[0]=='plan':
 i=c['import'][0];t,n=i['to'].split('.')
 plan={'format_version':'1.2','terraform_version':v,'errored':False,'complete':True,'applyable':True,'resource_changes':[{'address':i['to'],'mode':'managed','type':t,'name':n,'provider_name':'registry.terraform.io/hashicorp/azurerm','change':{'actions':['no-op'],'importing':{'id':i['id']}}}],'output_changes':{},'planned_values':{'root_module':{}}}
 target=next(x.split('=',1)[1] for x in a if x.startswith('-out='));Path(target).write_text(json.dumps(plan,sort_keys=True));os.chmod(target,0o600);print('{}')
elif a[0]=='show':
 if len(a)>2:print(Path(a[-1]).read_text())
 else:
  resources=[{'address':ADDRESS,'type':'azurerm_linux_virtual_machine','mode':'managed','values':{'id':ID}}] if Path('terraform.tfstate').exists() else []
  print(json.dumps({'format_version':'1.0','terraform_version':v,'values':{'root_module':{'resources':resources}}}))
elif a[0]=='apply':Path('terraform.tfstate').write_text(json.dumps({'version':4,'terraform_version':v,'serial':1,'lineage':'fixture','outputs':{},'resources':[]}));os.chmod('terraform.tfstate',0o600);print('{}')
else:sys.exit(64)
`
    .replace('ROOT', JSON.stringify(root))
    .replace('ADDRESS', JSON.stringify(address))
    .replace('ID', JSON.stringify(id));
  await writeFile(join(bin, 'terraform'), cli, { mode: 0o700 });
  const env = { PATH: `${bin}:/usr/bin:/bin` };
  const deployment = await azureTerraformFoundationDeployment(base, {
    '1': '#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: synthetic-owned-fixture\n',
  });
  const desired = JSON.parse(deployment.configuration);
  delete desired.output;
  deployment.configuration = JSON.stringify(desired);
  const originalConfiguration = deployment.configuration;
  const config = JSON.parse(originalConfiguration);
  config.import = [{ to: address, id }];
  config.resource.azurerm_linux_virtual_machine.node_1.lifecycle = { ignore_changes: 'all' };
  const importedConfiguration = JSON.stringify(config);
  const platform = {
    storage: async () => {
      await store.verify();
      return store;
    },
  } as unknown as CePlatformService;
  const terraform = createCeTerraformService(async () => platform);
  const session = await terraform.open(owner, deployment, false);
  if (!session.planImports) throw Error('native import service missing');
  let receipt: PlanReceipt;
  if (prepared) {
    await session.reviseConfiguration(hash(originalConfiguration), importedConfiguration);
    receipt = await session.planImports(
      [
        {
          address,
          type: 'azurerm_linux_virtual_machine',
          providerName: 'registry.terraform.io/hashicorp/azurerm',
          idSha256: hash(id),
        },
      ],
      env,
    );
    await session.apply(receipt, env);
    await session.reviseConfiguration(hash(importedConfiguration), originalConfiguration);
  } else {
    // Fresh path constructs, archives and authenticates its own actual saved receipt.
    receipt = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: base.deploymentName,
      backendIdentity: deployment.backendIdentity,
      configurationSha256: hash(importedConfiguration),
      providerLockSha256: hash(deployment.providerLock),
      planSha256: '0'.repeat(64),
      changes: [],
      noChanges: false,
    };
  }
  const saved = {
    schemaVersion: 2,
    sourcePlanSha256: base.planSha256,
    vmId: 'owned-fixture-vm',
    id,
    address,
    originalConfiguration,
    configurationSha256: hash(originalConfiguration),
    importedConfiguration,
    importedConfigurationSha256: hash(importedConfiguration),
    receipt,
  };
  if (prepared) await store.write('azure-terraform-pending-vm-import.json', saved);
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-plan-sha256': base.planSha256,
    'xcsh-node-index': '1',
    'ves-io-site-name': base.siteName,
  };
  const vm = {
    id,
    name: `${base.deploymentName}-1`,
    vmId: saved.vmId,
    location: base.region,
    provisioningState: 'Failed',
    hardwareProfile: { vmSize: base.vm.size },
    tags,
    osProfile: {
      adminUsername: 'fixture',
      linuxConfiguration: { ssh: { publicKeys: [{ keyData: 'ssh-rsa synthetic-public-fixture' }] } },
    },
    networkProfile: {
      networkInterfaces: base.nics.map((n) => ({
        id: `${id.split('/providers/')[0]}/providers/Microsoft.Network/networkInterfaces/${base.deploymentName}-1-nic${n.index}`,
      })),
    },
  };
  const api = {
    exec: async (_: string, args: string[]) => {
      const value =
        args[0] === 'account'
          ? { ...base.subscription, environmentName: base.subscription.cloud, state: 'Enabled' }
          : args[0] === 'group' && args[1] === 'exists'
            ? true
            : args[0] === 'group'
              ? { id: id.split('/providers/')[0], location: base.region, tags }
              : vm;
      return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
    },
  } as unknown as AzExecApi;
  const workspace = join(store.directory, base.deploymentName);
  const calls = async () =>
    (await readFile(join(root, 'calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { args: string[] });
  const run = () => reconcileAzurePendingVm(base, session, store, api, env);
  return { base, store, saved, receipt, session, workspace, run, calls, env };
}
test('actual runner authenticates restored original config and applied archived import on reconciliation and replay', async () => {
  const f = await nativeFixture();
  if (!f.session.readPlanApplicationHistory) throw Error('native history reader missing');
  const history = await f.session.readPlanApplicationHistory(f.receipt);
  expect(history.matches.some((m) => m.location === 'revision' && m.state === 'applied')).toBe(true);
  expect(history.applicationOutcomeQualified).toBe(false);
  const before = await f.calls();
  expect(await f.run()).toBe(true);
  expect(await f.run()).toBe(true);
  expect(((await f.store.read('azure-terraform-pending-vm-import.json')) as { status: string }).status).toBe(
    'imported',
  );
  const calls = await f.calls();
  expect(calls.filter((c) => c.args[0] === 'apply')).toHaveLength(1);
  expect(calls.filter((c) => c.args[0] === 'plan')).toHaveLength(1);
  expect(calls.slice(before.length).every((c) => ['show', 'version'].includes(c.args[0]))).toBe(true);
  console.log(
    JSON.stringify({
      phase: 'pending-import-native-archive-custody',
      history,
      applies: 1,
      plans: 1,
      cloudResponses: 'synthetic',
      liveQualified: false,
    }),
  );
});
test('actual archived configuration corruption blocks pending import completion', async () => {
  const f = await nativeFixture();
  const revisions = join(f.workspace, 'revisions');
  let corrupted = false;
  for (const name of await readdir(revisions)) {
    const file = join(revisions, name, 'main.tf.json');
    const bytes = await readFile(file, 'utf8');
    if (hash(bytes) === f.saved.importedConfigurationSha256) {
      await writeFile(file, `${bytes} `, { mode: 0o600 });
      corrupted = true;
      break;
    }
  }
  expect(corrupted).toBe(true);
  await expect(f.run()).rejects.toThrow('manifest ownership differs');
  expect(
    ((await f.store.read('azure-terraform-pending-vm-import.json')) as { status?: string }).status,
  ).toBeUndefined();
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
});
test('actual existing state with missing root receipt rejects without extra apply or status write', async () => {
  const f = await nativeFixture();
  const { receipt: _receipt, ...missing } = f.saved;
  await f.store.write('azure-terraform-pending-vm-import.json', missing);
  await expect(f.run()).rejects.toThrow('lacks saved import receipt');
  expect(
    ((await f.store.read('azure-terraform-pending-vm-import.json')) as { status?: string }).status,
  ).toBeUndefined();
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
});

test('fresh owning executor plans and applies exact import, restores original and authenticates real archived receipt', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const saved = (await f.store.read('azure-terraform-pending-vm-import.json')) as {
    status: string;
    receipt: PlanReceipt;
    configurationSha256: string;
  };
  expect(saved.status).toBe('imported');
  expect(saved.receipt.imports).toHaveLength(1);
  expect(await f.session.readConfigurationSha256?.()).toBe(saved.configurationSha256);
  const history = await f.session.readPlanApplicationHistory?.(saved.receipt);
  expect(history?.matches.some((m) => m.location === 'revision' && m.state === 'applied')).toBe(true);
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
  expect((await f.calls()).filter((c) => c.args[0] === 'plan')).toHaveLength(1);
});
test('fresh import interrupted after apply resumes restoration without extra plan or apply', async () => {
  const f = await nativeFixture(false);
  const revise = f.session.reviseConfiguration.bind(f.session);
  let failed = false;
  f.session.reviseConfiguration = async (digest, config) => {
    if (!failed && hash(config) === f.saved.configurationSha256) {
      failed = true;
      throw Error('owned fixture restoration interruption');
    }
    return revise(digest, config);
  };
  await expect(f.run()).rejects.toThrow('restoration interruption');
  expect(
    ((await f.store.read('azure-terraform-pending-vm-import.json')) as { status?: string }).status,
  ).toBeUndefined();
  expect(await f.run()).toBe(true);
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
  expect((await f.calls()).filter((c) => c.args[0] === 'plan')).toHaveLength(1);
  expect(await f.session.readConfigurationSha256?.()).toBe(f.saved.configurationSha256);
});

test('state replacement during native history observation blocks imported completion', async () => {
  const f = await fixture();
  const read = f.session.readPlanApplicationHistory;
  if (!read) throw Error('fixture history service missing');
  f.session.readPlanApplicationHistory = async (receipt, signal) => {
    const history = await read.call(f.session, receipt, signal);
    f.rows[0].id = 'foreign-replacement';
    return history;
  };
  await expect(f.run()).rejects.toThrow('state identity differs');
  expect(f.counts().writes).toBe(0);
});
test('configuration revision during native history observation blocks imported completion', async () => {
  const f = await fixture();
  let changed = false;
  const read = f.session.readPlanApplicationHistory;
  if (!read) throw Error('fixture history service missing');
  f.session.readPlanApplicationHistory = async (receipt, signal) => {
    const history = await read.call(f.session, receipt, signal);
    changed = true;
    return history;
  };
  f.session.readConfigurationSha256 = async () => (changed ? '0'.repeat(64) : f.saved.configurationSha256);
  await expect(f.run()).rejects.toThrow('configuration changed');
  expect(f.counts().writes).toBe(0);
});

test('fresh actual import retains restricted state identity and hash-bound archived provenance', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const saved = (await f.store.read('azure-terraform-pending-vm-import.json')) as {
    schemaVersion: number;
    application: {
      evidenceSha256: string;
      receiptSha256: string;
      historySha256: string;
      history: unknown;
      stateIdentity: { address: string; type: string; id: string };
    };
    receipt: PlanReceipt;
  };
  expect(saved.schemaVersion).toBe(2);
  const { evidenceSha256, ...body } = saved.application;
  expect(evidenceSha256).toBe(canonicalSha256(body));
  expect(saved.application.receiptSha256).toBe(canonicalSha256(saved.receipt));
  expect(saved.application.historySha256).toBe(canonicalSha256(saved.application.history));
  expect(saved.application.stateIdentity).toEqual({
    address: f.saved.address,
    type: 'azurerm_linux_virtual_machine',
    id: f.saved.id,
  });
  expect(JSON.stringify(saved.application)).not.toContain('cloud-config');
});
test('forged retained state provenance rejects actual replay without another apply', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const saved = (await f.store.read('azure-terraform-pending-vm-import.json')) as {
    application: { stateIdentity: { id: string } };
  };
  saved.application.stateIdentity.id = 'foreign-state';
  await f.store.write('azure-terraform-pending-vm-import.json', saved);
  await expect(f.run()).rejects.toThrow('state provenance differs');
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
});

test('completed actual import replay preserves original checkpoint bytes without rewrite', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const path = join(f.store.directory, 'azure-terraform-pending-vm-import.json');
  const before = await readFile(path);
  let writes = 0;
  const write = f.store.write.bind(f.store);
  f.store.write = async (...args: Parameters<typeof f.store.write>) => {
    writes++;
    return write(...args);
  };
  expect(await f.run()).toBe(true);
  expect((await readFile(path)).equals(before)).toBe(true);
  expect(writes).toBe(0);
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
});

import { readAzureTerraformPendingImportProvenance } from '../../src/ce/terraform-pending-import-provenance';

test('read-only native pending provenance joins original/import archives and state receipt without writes or execution', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const beforeCalls = await f.calls(),
    before = await readFile(join(f.store.directory, 'azure-terraform-pending-vm-import.json'));
  const proof = await readAzureTerraformPendingImportProvenance(f.base, f.store, f.session);
  expect(proof.nativeImportJournalCustodyQualified).toBe(true);
  expect(proof.historicalStateReceiptCustodyQualified).toBe(true);
  expect(proof.retirementQualified).toBe(false);
  expect(proof.currentOperationalAcceptanceQualified).toBe(false);
  expect((await readFile(join(f.store.directory, 'azure-terraform-pending-vm-import.json'))).equals(before)).toBe(true);
  expect(await f.calls()).toEqual(beforeCalls);
  expect(Object.keys(proof.payloadSha256ByField).sort()).toEqual(['importedConfiguration', 'originalConfiguration']);
  expect(JSON.stringify(proof)).not.toContain('cloud-config');
});
test('read-only provenance rejects a recomputed foreign state receipt against exact owned identity', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const saved = (await f.store.read('azure-terraform-pending-vm-import.json')) as {
    application: { stateIdentity: { id: string }; evidenceSha256: string };
  };
  saved.application.stateIdentity.id = 'foreign-state';
  const { evidenceSha256: _digest, ...body } = saved.application;
  saved.application.evidenceSha256 = canonicalSha256(body);
  await f.store.write('azure-terraform-pending-vm-import.json', saved);
  await expect(readAzureTerraformPendingImportProvenance(f.base, f.store, f.session)).rejects.toThrow(
    'restricted state receipt differs',
  );
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
});
test('read-only provenance rejects native archive corruption after state evidence retention', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const saved = (await f.store.read('azure-terraform-pending-vm-import.json')) as {
    importedConfigurationSha256: string;
  };
  let corrupted = false;
  for (const name of await readdir(join(f.workspace, 'revisions'))) {
    const file = join(f.workspace, 'revisions', name, 'main.tf.json');
    const bytes = await readFile(file, 'utf8');
    if (hash(bytes) === saved.importedConfigurationSha256) {
      await writeFile(file, `${bytes} `, { mode: 0o600 });
      corrupted = true;
      break;
    }
  }
  expect(corrupted).toBe(true);
  await expect(readAzureTerraformPendingImportProvenance(f.base, f.store, f.session)).rejects.toThrow(
    'manifest ownership differs',
  );
});

test('recomputed foreign archived publisher manifest cannot qualify a retained state receipt', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  if (!f.session.readPlanApplicationHistory) throw Error('native history service missing');
  const saved = (await f.store.read('azure-terraform-pending-vm-import.json')) as {
    receipt: PlanReceipt;
    application: {
      history: Awaited<ReturnType<NonNullable<typeof f.session.readPlanApplicationHistory>>>;
      historySha256: string;
      evidenceSha256: string;
    };
  };
  const foreign = structuredClone(saved.application.history);
  foreign.matches[0].manifestSha256 = '0'.repeat(64);
  saved.application.history = foreign;
  saved.application.historySha256 = canonicalSha256(foreign);
  const { evidenceSha256: _digest, ...body } = saved.application;
  saved.application.evidenceSha256 = canonicalSha256(body);
  await f.store.write('azure-terraform-pending-vm-import.json', saved);
  f.session.readPlanApplicationHistory = async () => foreign;
  await expect(readAzureTerraformPendingImportProvenance(f.base, f.store, f.session)).rejects.toThrow(
    'applied native archives required',
  );
  expect((await f.calls()).filter((c) => c.args[0] === 'apply')).toHaveLength(1);
});

test('read-only pending provenance rejects an unaccounted main root without commands or checkpoint mutation', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const checkpoint = await readFile(join(f.store.directory, 'azure-terraform-pending-vm-import.json'));
  const calls = await f.calls();
  await writeFile(join(f.workspace, 'unaccounted-fixture.json'), '{}', { mode: 0o600 });
  await expect(readAzureTerraformPendingImportProvenance(f.base, f.store, f.session)).rejects.toThrow(
    '"inventoryStatus":"partial"',
  );
  expect(await f.calls()).toEqual(calls);
  expect(await readFile(join(f.store.directory, 'azure-terraform-pending-vm-import.json'))).toEqual(checkpoint);
});

test('serialized cancellation witness cannot authorize pending provenance despite a matching extra-root name', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const checkpoint = await readFile(join(f.store.directory, 'azure-terraform-pending-vm-import.json'));
  const calls = await f.calls();
  const name = 'configuration-cancellation-forged.json';
  await writeFile(join(f.workspace, name), '{}', { mode: 0o600 });
  const admission = { witness: { cancellationRecordNameSha256: hash(name) }, context: {} } as unknown as NonNullable<
    Parameters<typeof readAzureTerraformPendingImportProvenance>[4]
  >;
  await expect(
    readAzureTerraformPendingImportProvenance(f.base, f.store, f.session, undefined, admission),
  ).rejects.toThrow('owning native empty-main witness required');
  expect(await f.calls()).toEqual(calls);
  expect(await readFile(join(f.store.directory, 'azure-terraform-pending-vm-import.json'))).toEqual(checkpoint);
});

test('last logical pending read cannot hide mutation after its native snapshot', async () => {
  const f = await nativeFixture(false);
  expect(await f.run()).toBe(true);
  const logical = f.store.read.bind(f.store);
  let pendingReads = 0;
  f.store.read = async (name) => {
    const value = await logical(name);
    if (name === 'azure-terraform-pending-vm-import.json' && ++pendingReads === 3) {
      await writeFile(
        join(f.store.directory, name),
        JSON.stringify({ ...(value as Record<string, unknown>), vmId: 'changed-after-last-logical-read' }),
        { mode: 0o600 },
      );
    }
    return value;
  };
  await expect(readAzureTerraformPendingImportProvenance(f.base, f.store, f.session)).rejects.toThrow('native');
});

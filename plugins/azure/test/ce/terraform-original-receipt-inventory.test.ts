import { expect, test } from 'bun:test';
import { link, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { TerraformRunner } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformFoundationDeployment, renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import {
  buildAzureTerraformOriginalReceiptRecord,
  publishAzureTerraformOriginalReceipt,
  readAzureTerraformOriginalReceiptInventory,
} from '../../src/ce/terraform-original-receipt-inventory';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

async function fixture() {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation),
    directory = await mkdtemp(join(tmpdir(), 'original-tf-receipt-')),
    store = await CeDeploymentStore.open(directory, azureUpgradeBinding(plan).owner),
    deployment = await azureTerraformFoundationDeployment(plan),
    commands: string[] = [];
  let counter = 0,
    noChanges = false;
  const runner = new TerraformRunner(store.directory, async (request) => {
    commands.push(request.args[0]);
    let stdout = '{}';
    if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: deployment.terraformVersion });
    if (request.args[0] === 'plan')
      await writeFile(join(request.cwd, 'saved.tfplan'), String(++counter), { mode: 0o600 });
    if (request.args[0] === 'show')
      stdout = JSON.stringify({
        format_version: '1.2',
        terraform_version: deployment.terraformVersion,
        errored: false,
        complete: true,
        applyable: !noChanges,
        output_changes: {},
        resource_changes: noChanges
          ? []
          : [
              {
                address: 'azurerm_resource_group.ce',
                type: 'azurerm_resource_group',
                mode: 'managed',
                provider_name: 'registry.terraform.io/hashicorp/azurerm',
                change: { actions: ['create'], before: null, after: {} },
              },
            ],
      });
    return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
  });
  await runner.prepare(deployment);
  return {
    plan,
    directory,
    store,
    runner,
    commands,
    setNoChanges: () => {
      noChanges = true;
    },
    close: () => rm(directory, { recursive: true }),
  };
}

test('actual native original receipt publications retain distinct retries and metadata without executing the reader', async () => {
  const f = await fixture();
  try {
    const first = await f.runner.plan({}),
      input = { plan: f.plan, bootstrapByNode: {}, stage: { kind: 'foundation' as const }, receipt: first };
    const publication = await publishAzureTerraformOriginalReceipt(input, f.store),
      path = join(f.store.directory, 'terraform-original-deployment-receipts', publication.name),
      firstBytes = await readFile(path);
    expect(await publishAzureTerraformOriginalReceipt(input, f.store)).toEqual(publication);
    await f.runner.apply(first, {});
    f.setNoChanges();
    const next = await f.runner.plan({});
    expect(next.planSha256).not.toBe(first.planSha256);
    await publishAzureTerraformOriginalReceipt({ ...input, receipt: next }, f.store);
    const commands = [...f.commands],
      result = await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.store);
    expect(result.status).toBe('complete');
    expect(result.records).toHaveLength(2);
    expect(result.records.map((row) => row.record.receipt.planSha256).sort()).toEqual(
      [first.planSha256, next.planSha256].sort(),
    );
    expect(result.nativeJournalsQualified).toBe(false);
    expect(result.originalDeploymentQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    expect(await readFile(path)).toEqual(firstBytes);
  } finally {
    await f.close();
  }
});

test('admission source joins require exact bootstrap prefix and reject foreign receipt state', async () => {
  const f = await fixture();
  try {
    const bootstrapByNode = {
      '1': '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: private-enrollment-marker\n',
    };
    await f.runner.reviseConfiguration(
      await f.runner.readConfigurationSha256(),
      renderAzureTerraformFoundation(f.plan, bootstrapByNode),
    );
    const receipt = await f.runner.plan({}),
      input = { plan: f.plan, bootstrapByNode, stage: { kind: 'node-admission' as const, node: 1 }, receipt };
    const record = await buildAzureTerraformOriginalReceiptRecord(input);
    expect(JSON.stringify(record)).not.toContain('private-enrollment-marker');
    await publishAzureTerraformOriginalReceipt(input, f.store);
    expect((await readAzureTerraformOriginalReceiptInventory(f.plan, bootstrapByNode, f.store)).records).toHaveLength(
      1,
    );
    for (const changed of [
      { ...receipt, planSha256: 'bad' },
      { ...receipt, configurationSha256: 'a'.repeat(64) },
      { ...receipt, providerLockSha256: 'b'.repeat(64) },
      { ...receipt, noChanges: true },
      {
        ...receipt,
        changes: [{ address: 'azurerm_resource_group.ce', type: 'azurerm_resource_group', actions: ['delete'] }],
      },
    ])
      await expect(buildAzureTerraformOriginalReceiptRecord({ ...input, receipt: changed })).rejects.toThrow();
    await expect(buildAzureTerraformOriginalReceiptRecord({ ...input, bootstrapByNode: {} })).rejects.toThrow();
    await expect(
      buildAzureTerraformOriginalReceiptRecord({ ...input, stage: { kind: 'ingress-final' } }),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test('foreign immutable publication is preserved and partial inventory cannot mint original custody', async () => {
  const f = await fixture();
  try {
    const receipt = await f.runner.plan({}),
      input = { plan: f.plan, bootstrapByNode: {}, stage: { kind: 'foundation' as const }, receipt };
    const p = await publishAzureTerraformOriginalReceipt(input, f.store),
      directory = join(f.store.directory, 'terraform-original-deployment-receipts');
    await writeFile(join(directory, 'retained-unfinished.pending'), 'private failure record', { mode: 0o600 });
    const partial = await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.store);
    expect(partial.status).toBe('partial');
    expect(partial.incompleteEntrySha256s).toHaveLength(1);
    expect(partial.originalDeploymentQualified).toBe(false);
    expect(JSON.stringify(partial)).not.toContain('private failure record');
    const file = join(directory, p.name);
    await writeFile(file, '{}', { mode: 0o600 });
    await expect(publishAzureTerraformOriginalReceipt(input, f.store)).rejects.toThrow('foreign immutable');
    expect(await readFile(file, 'utf8')).toBe('{}');
    await expect(readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.store)).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test('stalled ownership verification cancellation publishes no late original receipt', async () => {
  const f = await fixture();
  try {
    const receipt = await f.runner.plan({}),
      abort = new AbortController();
    let release = () => {};
    const store = {
      directory: f.store.directory,
      owner: f.store.owner,
      verify: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    };
    const pending = publishAzureTerraformOriginalReceipt(
      { plan: f.plan, bootstrapByNode: {}, stage: { kind: 'foundation' }, receipt },
      store,
      abort.signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    abort.abort(Error('test canceled'));
    await expect(pending).rejects.toThrow('test canceled');
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.store)).status).toBe('absent');
  } finally {
    await f.close();
  }
});

test('interrupted complete pending publications resume before and after linking without replacement', async () => {
  const f = await fixture();
  try {
    const receipt = await f.runner.plan({}),
      input = { plan: f.plan, bootstrapByNode: {}, stage: { kind: 'foundation' as const }, receipt };
    const publication = await publishAzureTerraformOriginalReceipt(input, f.store),
      directory = join(f.store.directory, 'terraform-original-deployment-receipts'),
      path = join(directory, publication.name),
      pending = join(directory, publication.name.replace('.json', '-00000000-0000-4000-8000-000000000099.pending'));
    const original = await readFile(path);
    await rename(path, pending);
    expect(await publishAzureTerraformOriginalReceipt(input, f.store)).toEqual(publication);
    expect(await readFile(path)).toEqual(original);
    await link(path, pending);
    expect(await publishAzureTerraformOriginalReceipt(input, f.store)).toEqual(publication);
    expect(await readFile(path)).toEqual(original);
    expect((await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.store)).status).toBe('complete');
    await rename(path, pending);
    await writeFile(pending, '{', { mode: 0o600 });
    await expect(publishAzureTerraformOriginalReceipt(input, f.store)).rejects.toThrow('pending receipt retained');
    expect(await readFile(pending, 'utf8')).toBe('{');
    expect((await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.store)).status).toBe('partial');
  } finally {
    await f.close();
  }
});

test('native owner bytes and verifier replacement cannot hide behind successful ownership callbacks', async () => {
  const f = await fixture();
  try {
    const receipt = await f.runner.plan({}),
      input = { plan: f.plan, bootstrapByNode: {}, stage: { kind: 'foundation' as const }, receipt },
      ownerPath = join(f.store.directory, 'owner.json'),
      ownerBytes = await readFile(ownerPath);
    const facade = {
      directory: f.store.directory,
      owner: f.store.owner,
      verify: async () => {
        await f.store.verify();
        await writeFile(ownerPath, Buffer.concat([Buffer.from(' '), ownerBytes]), { mode: 0o600 });
      },
    };
    await expect(publishAzureTerraformOriginalReceipt(input, facade)).rejects.toThrow('native owner manifest changed');
    await writeFile(ownerPath, ownerBytes, { mode: 0o600 });
    facade.verify = async () => {
      await f.store.verify();
      facade.verify = async () => {};
    };
    await expect(publishAzureTerraformOriginalReceipt(input, facade)).rejects.toThrow('storage verifier changed');
    expect((await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.store)).status).toBe('absent');
  } finally {
    await f.close();
  }
});

test('late foreign collisions remain intact and final valid ownership callbacks cannot hide earlier descriptor changes', async () => {
  const f = await fixture();
  try {
    const receipt = await f.runner.plan({}),
      input = { plan: f.plan, bootstrapByNode: {}, stage: { kind: 'foundation' as const }, receipt },
      record = await buildAzureTerraformOriginalReceiptRecord(input),
      directory = join(f.store.directory, 'terraform-original-deployment-receipts'),
      path = join(directory, `${canonicalSha256(record)}.json`);
    let calls = 0;
    const collisionStore = {
      directory: f.store.directory,
      owner: f.store.owner,
      verify: async () => {
        await f.store.verify();
        if (++calls === 2) await writeFile(path, '{}', { mode: 0o600, flag: 'wx' });
      },
    };
    await expect(publishAzureTerraformOriginalReceipt(input, collisionStore)).rejects.toThrow('foreign immutable');
    expect(await readFile(path, 'utf8')).toBe('{}');
    await rm(directory, { recursive: true });
    const publication = await publishAzureTerraformOriginalReceipt(input, f.store),
      original = await readFile(join(directory, publication.name));
    calls = 0;
    const readStore = {
      directory: f.store.directory,
      owner: f.store.owner,
      verify: async () => {
        await f.store.verify();
        if (++calls === 2)
          await writeFile(join(directory, publication.name), Buffer.concat([Buffer.from(' '), original]), {
            mode: 0o600,
          });
      },
    };
    await expect(readAzureTerraformOriginalReceiptInventory(f.plan, {}, readStore)).rejects.toThrow(
      'inventory changed',
    );
  } finally {
    await f.close();
  }
});

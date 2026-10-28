import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import { type Invocation, TerraformRunner } from '../src/runner';
import { createCeTerraformService } from '../src/service';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const configuration = '{"terraform":{"required_version":"= 1.14.0"}}';
async function fixture(
  planned = true,
  execution = false,
  loseApplyResponse = false,
  journalDrift?: 'show' | 'apply',
  noChanges = true,
) {
  const root = await mkdtemp(join(tmpdir(), 'ce-journal-read-'));
  roots.push(root);
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(root, async (request) => {
    calls.push(request);
    if (journalDrift === request.args[0]) {
      const path = join(request.cwd, 'plan-receipt.json');
      try {
        const journal = JSON.parse(await readFile(path, 'utf8'));
        journal.foreign = 'synthetic concurrent journal change';
        await writeFile(path, JSON.stringify(journal), { mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (request.args[0] === 'apply' && loseApplyResponse) throw Error('synthetic apply response loss');
    if (request.args[0] === 'plan')
      await writeFile(join(request.cwd, 'saved.tfplan'), 'binary-owned-plan', { mode: 0o600 });
    return {
      code: 0,
      ...(execution ? { executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } } : {}),
      stdout:
        request.args[0] === 'version'
          ? JSON.stringify({ terraform_version: '1.14.0' })
          : request.args[0] === 'show'
            ? JSON.stringify({
                format_version: '1.2',
                terraform_version: '1.14.0',
                errored: false,
                complete: true,
                applyable: true,
                resource_changes: [
                  {
                    address: 'terraform_data.ce',
                    type: 'terraform_data',
                    mode: 'managed',
                    change: {
                      actions: [noChanges ? 'no-op' : 'create'],
                      after: { input: 'PRIVATE_ENROLLMENT_FIXTURE' },
                    },
                  },
                ],
                output_changes: {},
              })
            : '',
    };
  });
  await runner.prepare({
    schemaVersion: 1,
    deploymentId: 'journal-fixture',
    engine: 'terraform',
    scope: { cloud: 'azure', account: 'example-subscription', region: 'example-region' },
    terraformVersion: '1.14.0',
    configuration,
    providerLock: '# fixture lock',
    backendIdentity: 'local:journal-fixture',
  });
  const receipt = planned ? await runner.plan({}, undefined, hash('owning replacement final refresh')) : undefined;
  const directory = join(root, 'journal-fixture'),
    journalPath = join(directory, 'plan-receipt.json'),
    planPath = join(directory, 'saved.tfplan');
  return {
    root,
    directory,
    runner,
    calls,
    receipt,
    journalPath,
    planPath,
    run: (signal?: AbortSignal) => runner.readCurrentPlanJournal(hash(configuration), signal),
  };
}

test('native final-refresh intent survives reply loss, archival and lifecycle transition with exact saved bytes', async () => {
  const f = await fixture(false, true);
  const origin = hash('owning replacement final refresh');
  let receipt: Awaited<ReturnType<TerraformRunner['plan']>> | undefined;
  const loseReply = async () => {
    receipt = await f.runner.plan({}, undefined, origin);
    throw Error('lost reply after native publication');
  };
  await expect(loseReply()).rejects.toThrow('lost reply');
  const calls = [...f.calls];
  const current = await f.run();
  expect(current.receipt).toEqual(receipt);
  expect(current.receipt?.refreshOriginSha256).toBe(origin);
  expect(current.ordinaryRefreshEnabled).toBe(true);
  expect(current.executionSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(f.calls).toEqual(calls);
  if (!receipt) throw Error('native receipt required');
  await f.runner.apply(receipt, {});
  expect((await f.run()).receipt?.refreshOriginSha256).toBe(origin);
  await f.runner.plan({});
  const history = await f.runner.readPlanApplicationHistory(receipt);
  expect(history.matches.length).toBeGreaterThan(0);
  expect(history.matches.every((match) => match.state === 'applied')).toBe(true);
  expect((await f.run()).receipt?.refreshOriginSha256).toBeUndefined();
});

test('malformed origin fails before executing Terraform and a changing final plan cannot claim refresh intent', async () => {
  const f = await fixture(false, true, false, undefined, false);
  await expect(f.runner.plan({}, undefined, 'unresolved')).rejects.toThrow('digest required');
  expect(f.calls).toHaveLength(0);
  await expect(f.runner.plan({}, undefined, hash('owning replacement final refresh'))).rejects.toThrow(
    'contains changes',
  );
  await expect(f.run()).rejects.toThrow('incomplete');
});

for (const part of ['origin', 'noChanges', 'changes', 'action', 'saved-bytes'] as const)
  test(`native refresh journal rejects altered ${part}`, async () => {
    const f = await fixture(true, true),
      journal = JSON.parse(await readFile(f.journalPath, 'utf8'));
    if (part === 'origin') journal.receipt.refreshOriginSha256 = 'not-a-digest';
    if (part === 'noChanges') journal.receipt.noChanges = false;
    if (part === 'changes') journal.receipt.changes[0].actions = ['create'];
    if (part === 'action') journal.receipt.operation = 'destroy';
    if (part === 'saved-bytes') await writeFile(f.planPath, 'foreign-plan');
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });

test('public Terraform service preserves native refresh origin and forwards invalid-intent rejection through owner checks', async () => {
  const owner: CeOwner = {
    deploymentId: 'journal-fixture',
    engine: 'terraform',
    provider: 'azure',
    account: 'example-subscription',
    region: 'example-region',
  };
  const f = await fixture(true, true),
    store = await CeDeploymentStore.open(f.root, owner);
  await rename(f.directory, join(store.directory, owner.deploymentId));
  const deployment = {
    schemaVersion: 1 as const,
    deploymentId: owner.deploymentId,
    engine: 'terraform' as const,
    scope: { cloud: 'azure' as const, account: owner.account, region: owner.region },
    terraformVersion: '1.14.0',
    configuration,
    providerLock: '# fixture lock',
    backendIdentity: 'local:journal-fixture',
  };
  let checks = 0;
  const service = createCeTerraformService(
    async () =>
      ({
        storage: async (requested: CeOwner) => {
          checks++;
          expect(requested).toEqual(owner);
          await store.verify();
          return store;
        },
      }) as unknown as CePlatformService,
  );
  const session = await service.open(owner, deployment, 'current');
  const current = await session.readCurrentPlanJournal?.(hash(configuration));
  expect(current?.receipt?.refreshOriginSha256).toBe(hash('owning replacement final refresh'));
  // Invalid intent reaches native validation without running a new executable.
  await expect(session.plan({}, undefined, 'unresolved')).rejects.toThrow('digest required');
  expect(checks).toBeGreaterThan(2);
});

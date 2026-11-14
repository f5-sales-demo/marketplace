import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { chmod, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
async function fixture(planned = true, execution = false, loseApplyResponse = false, journalDrift?: 'show' | 'apply') {
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
                applyable: true, // codespell:ignore applyable (exact Terraform JSON field)
                resource_changes: [
                  {
                    address: 'terraform_data.ce',
                    type: 'terraform_data',
                    mode: 'managed',
                    change: { actions: ['create'], after: { input: 'PRIVATE_ENROLLMENT_FIXTURE' } },
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
  const receipt = planned ? await runner.plan({}) : undefined;
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
for (const state of ['planned', 'applying', 'applied'] as const)
  test(`reads actual ${state} saved-plan byte/journal identity without running Terraform or granting semantics`, async () => {
    const f = await fixture();
    await writeFile(f.journalPath, JSON.stringify({ state, receipt: f.receipt }), { mode: 0o600 });
    const calls = [...f.calls],
      bytes = await readFile(f.journalPath);
    const row = await f.run();
    expect(row.state).toBe(state);
    expect(row.receipt).toEqual(f.receipt);
    expect(row.savedPlanSha256).toBe(hash('binary-owned-plan'));
    expect(row.journalSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(row.planSemanticsQualified).toBe(false);
    expect(f.calls).toEqual(calls);
    expect(await readFile(f.journalPath)).toEqual(bytes);
    expect(JSON.stringify(row)).not.toContain('PRIVATE_ENROLLMENT_FIXTURE');
  });
test('absent plan is a local absence observation with no Terraform or cloud state claim', async () => {
  const f = await fixture(false),
    row = await f.run();
  expect(row.state).toBe('absent');
  expect(row.receipt).toBeUndefined();
  expect(row.savedPlanSha256).toBe(null);
  expect(row.journalSha256).toBe(null);
  expect(row.planSemanticsQualified).toBe(false);
  expect(f.calls).toHaveLength(0);
});
for (const missing of ['journal', 'plan'])
  test(`orphan ${missing} rejects instead of inventing absent state`, async () => {
    const f = await fixture();
    await rm(missing === 'journal' ? f.journalPath : f.planPath);
    await expect(f.run()).rejects.toThrow('incomplete');
  });
for (const part of [
  'state',
  'schema',
  'receipt-schema',
  'engine',
  'deployment',
  'backend',
  'configuration',
  'provider',
  'plan-sha',
  'saved-bytes',
  'changes',
  'change-type',
  'actions',
  'noChanges',
  'operation',
  'reconciliation',
])
  test(`journal inspection rejects changed ${part}`, async () => {
    const f = await fixture();
    const journal = JSON.parse((await readFile(f.journalPath)).toString()) as {
      state: string;
      receipt: Record<string, unknown>;
      [key: string]: unknown;
    };
    if (part === 'state') journal.state = 'unknown';
    if (part === 'schema') journal.foreign = true;
    if (part === 'receipt-schema') journal.receipt.extra = true;
    if (part === 'engine') journal.receipt.engine = 'native';
    if (part === 'deployment') journal.receipt.deploymentId = 'foreign';
    if (part === 'backend') journal.receipt.backendIdentity = 'local:foreign';
    if (part === 'configuration') journal.receipt.configurationSha256 = 'a'.repeat(64);
    if (part === 'provider') journal.receipt.providerLockSha256 = 'a'.repeat(64);
    if (part === 'plan-sha') journal.receipt.planSha256 = 'a'.repeat(64);
    if (part === 'saved-bytes') await writeFile(f.planPath, 'foreign-bytes', { mode: 0o600 });
    if (part === 'changes') journal.receipt.changes = {};
    if (part === 'change-type')
      journal.receipt.changes = [{ address: 'terraform_data.ce', type: '../foreign', actions: ['create'] }];
    if (part === 'actions')
      journal.receipt.changes = [{ address: 'terraform_data.ce', type: 'terraform_data', actions: ['fake-success'] }];
    if (part === 'noChanges') journal.receipt.noChanges = 'yes';
    if (part === 'operation') journal.receipt.operation = 'apply';
    if (part === 'reconciliation') journal.reconciledEvidenceSha256 = 'a'.repeat(64);
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    await expect(f.run()).rejects.toThrow();
  });
test('applied reconciled receipt retains exact journal provenance without changing state', async () => {
  const f = await fixture();
  await writeFile(f.journalPath, JSON.stringify({ state: 'applying', receipt: f.receipt }), { mode: 0o600 });
  if (!f.receipt) throw Error('fixture receipt missing');
  await f.runner.reconcileApplyFromEvidence(f.receipt, 'a'.repeat(64));
  const bytes = await readFile(f.journalPath),
    row = await f.run();
  expect(row.state).toBe('applied');
  expect(await readFile(f.journalPath)).toEqual(bytes);
});
for (const artifact of ['journal', 'plan'])
  test(`journal inspector rejects unsafe ${artifact} permissions`, async () => {
    const f = await fixture();
    await chmod(artifact === 'journal' ? f.journalPath : f.planPath, 0o644);
    await expect(f.run()).rejects.toThrow();
  });
test('journal inspector rejects a symlinked saved plan', async () => {
  const f = await fixture(),
    target = join(f.root, 'foreign-plan');
  await writeFile(target, 'binary-owned-plan', { mode: 0o600 });
  await rm(f.planPath);
  await symlink(target, f.planPath);
  await expect(f.run()).rejects.toThrow();
});
test('journal inspector refuses stale expected configuration before snapshot', async () => {
  const f = await fixture();
  await expect(f.runner.readCurrentPlanJournal('a'.repeat(64))).rejects.toThrow('stale');
  await expect(f.runner.readCurrentPlanJournal('__RUNTIME_SHA__')).rejects.toThrow('digest');
});
test('pre-cancelled journal observation makes no Terraform calls', async () => {
  const f = await fixture(),
    abort = new AbortController(),
    calls = [...f.calls];
  abort.abort(Error('synthetic journal cancellation'));
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic journal cancellation');
  expect(f.calls).toEqual(calls);
});
async function serviceFixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-journal-service-'));
  roots.push(root);
  const owner: CeOwner = {
    deploymentId: 'journal-service',
    engine: 'terraform',
    provider: 'azure',
    account: 'example-subscription',
    region: 'example-region',
  };
  const platform = { storage: (identity: CeOwner) => CeDeploymentStore.open(root, identity) } as CePlatformService;
  const service = createCeTerraformService(async () => platform);
  const session = await service.open(
    owner,
    {
      schemaVersion: 1,
      deploymentId: owner.deploymentId,
      engine: 'terraform',
      scope: { cloud: 'azure', account: owner.account, region: owner.region },
      terraformVersion: '1.14.0',
      configuration,
      providerLock: '# fixture lock',
      backendIdentity: `local:${owner.deploymentId}`,
    },
    false,
  );
  return { root, owner, platform, session };
}
test('actual Terraform service exposes current journal inspection without CLI execution', async () => {
  const f = await serviceFixture();
  if (!f.session.readCurrentPlanJournal) throw Error('current journal service missing');
  const row = await f.session.readCurrentPlanJournal(hash(configuration));
  expect(row.state).toBe('absent');
  expect(row.scope).toBe('current-saved-plan-byte-and-journal-binding');
  expect(row.planSemanticsQualified).toBe(false);
});
test('actual journal service rechecks durable engine ownership', async () => {
  const f = await serviceFixture();
  if (!f.session.readCurrentPlanJournal) throw Error('current journal service missing');
  const store = await f.platform.storage(f.owner);
  await writeFile(
    join(store.directory, 'owner.json'),
    JSON.stringify({ schemaVersion: 2, owner: { ...f.owner, engine: 'native' } }),
    { mode: 0o600 },
  );
  await expect(f.session.readCurrentPlanJournal(hash(configuration))).rejects.toThrow();
});
test('recovered exact unsubmitted receipt can cancel without apply; applied receipt cannot', async () => {
  const f = await fixture(),
    row = await f.run(),
    calls = [...f.calls];
  if (!row.receipt) throw Error('saved journal receipt missing');
  await f.runner.cancelUnsubmittedPlan(row.receipt, hash(configuration), configuration, 'a'.repeat(64));
  expect((await f.run()).state).toBe('absent');
  expect(f.calls).toEqual(calls);
  const applied = await fixture();
  await writeFile(applied.journalPath, JSON.stringify({ state: 'applied', receipt: applied.receipt }), { mode: 0o600 });
  const observed = await applied.run();
  if (!observed.receipt) throw Error('applied journal missing');
  await expect(
    applied.runner.cancelUnsubmittedPlan(observed.receipt, hash(configuration), configuration, 'a'.repeat(64)),
  ).rejects.toThrow('applying or applied');
});

for (const permitted of [true, false])
  test(`state-only forget journal requires explicit relinquishment intent: ${permitted}`, async () => {
    const f = await fixture();
    const journal = JSON.parse((await readFile(f.journalPath)).toString());
    journal.receipt.changes = [{ address: 'terraform_data.ce', type: 'terraform_data', actions: ['forget'] }];
    if (permitted)
      journal.receipt.relinquishments = [
        {
          address: 'terraform_data.ce',
          type: 'terraform_data',
          providerName: 'registry.terraform.io/example/provider',
          idSha256: 'a'.repeat(64),
        },
      ];
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    if (permitted) {
      const calls = [...f.calls],
        row = await f.run();
      expect(row.receipt).toEqual(journal.receipt);
      expect(row.planSemanticsQualified).toBe(false);
      expect(f.calls).toEqual(calls);
    } else await expect(f.run()).rejects.toThrow();
  });
for (const duplicate of ['changes', 'actionInvocations'])
  test(`duplicate ${duplicate} identity rejects`, async () => {
    const f = await fixture();
    const journal = JSON.parse((await readFile(f.journalPath)).toString());
    if (duplicate === 'changes') journal.receipt.changes.push(journal.receipt.changes[0]);
    else {
      const intent = {
        address: 'action.example_action.ce',
        type: 'example_action',
        providerName: 'registry.terraform.io/example/provider',
        configValuesSha256: 'a'.repeat(64),
      };
      journal.receipt.actionInvocations = [intent, intent];
    }
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    await expect(f.run()).rejects.toThrow('duplicate');
  });

test('reads actual production-written journal with executor and refresh command provenance', async () => {
  const f = await fixture(true, true),
    calls = [...f.calls];
  const bytes = await readFile(f.journalPath);
  expect(JSON.parse(bytes.toString()).execution.planArgs).toContain('-refresh=true');
  const row = await f.run();
  expect(row.receipt).toEqual(f.receipt);
  expect(row.journalSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(row.planSemanticsQualified).toBe(false);
  expect(f.calls).toEqual(calls);
});
for (const mode of ['extra', 'relative-path', 'bad-digest', 'no-refresh', 'extra-argument', 'missing-args'])
  test(`execution provenance rejects ${mode}`, async () => {
    const f = await fixture(true, true);
    const journal = JSON.parse((await readFile(f.journalPath)).toString());
    if (mode === 'extra') journal.execution.foreign = true;
    if (mode === 'relative-path') journal.execution.terraform.path = 'terraform';
    if (mode === 'bad-digest') journal.execution.terraform.sha256 = '__RUNTIME__';
    if (mode === 'no-refresh')
      journal.execution.planArgs = journal.execution.planArgs.filter((arg: string) => arg !== '-refresh=true');
    if (mode === 'extra-argument') journal.execution.planArgs.push('-target=foreign');
    if (mode === 'missing-args') delete journal.execution.planArgs;
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    await expect(f.run()).rejects.toThrow('execution provenance');
  });

for (const state of ['planned', 'applied'] as const)
  test(`completed production revision archives ${state} journal and clears active saved files`, async () => {
    const f = await fixture();
    await writeFile(f.journalPath, JSON.stringify({ state, receipt: f.receipt }), { mode: 0o600 });
    const journal = await readFile(f.journalPath),
      plan = await readFile(f.planPath),
      calls = [...f.calls];
    const next = JSON.stringify({
      terraform: { required_version: '= 1.14.0' },
      resource: { terraform_data: { next: { input: 'synthetic' } } },
    });
    const currentSha256 = await f.runner.reviseConfiguration(hash(configuration), next);
    const row = await f.runner.readCurrentPlanJournal(currentSha256);
    expect(row.state).toBe('absent');
    expect(f.calls).toEqual(calls);
    await expect(readFile(f.journalPath)).rejects.toThrow();
    await expect(readFile(f.planPath)).rejects.toThrow();
    const archives = await readdir(join(f.directory, 'revisions'));
    expect(archives).toHaveLength(1);
    const archive = join(f.directory, 'revisions', archives[0]);
    expect(await readFile(join(archive, 'plan-receipt.json'))).toEqual(journal);
    expect(await readFile(join(archive, 'saved.tfplan'))).toEqual(plan);
  });

for (const boundary of ['before-removals', 'between-removals', 'after-removals'])
  test(`production revision resumes ${boundary} with exact archived receipt and no Terraform calls`, async () => {
    const f = await fixture();
    const journal = await readFile(f.journalPath),
      plan = await readFile(f.planPath);
    const next = JSON.stringify({
      terraform: { required_version: '= 1.14.0' },
      resource: { terraform_data: { next: { input: 'synthetic' } } },
    });
    const currentSha256 = await f.runner.reviseConfiguration(hash(configuration), next);
    const ids = await readdir(join(f.directory, 'revisions')),
      archive = join(f.directory, 'revisions', ids[0]);
    const previous = JSON.parse((await readFile(join(archive, 'deployment.json'))).toString());
    const current = JSON.parse((await readFile(join(f.directory, 'deployment.json'))).toString());
    await writeFile(
      join(f.directory, 'configuration-transition.json'),
      JSON.stringify({ previous, next: current, configuration: next, archiveId: ids[0] }),
      { mode: 0o600 },
    );
    if (boundary === 'before-removals') await writeFile(f.planPath, plan, { mode: 0o600 });
    if (boundary !== 'after-removals') await writeFile(f.journalPath, journal, { mode: 0o600 });
    const calls = [...f.calls];
    await f.runner.resume(
      'journal-fixture',
      {
        schemaVersion: 1,
        deploymentId: 'journal-fixture',
        engine: 'terraform',
        scope: { cloud: 'azure', account: 'example-subscription', region: 'example-region' },
        terraformVersion: '1.14.0',
        configuration,
        providerLock: '# fixture lock',
        backendIdentity: 'local:journal-fixture',
      },
      'current',
    );
    expect((await f.runner.readCurrentPlanJournal(currentSha256)).state).toBe('absent');
    expect(await readFile(join(archive, 'plan-receipt.json'))).toEqual(journal);
    expect(await readFile(join(archive, 'saved.tfplan'))).toEqual(plan);
    expect(f.calls).toEqual(calls);
    await expect(readFile(join(f.directory, 'configuration-transition.json'))).rejects.toThrow();
  });

for (const state of ['planned', 'applying', 'applied'] as const)
  test(`production history binds exact current ${state} journal without qualifying cloud outcome`, async () => {
    const f = await fixture();
    if (!f.receipt) throw Error('exact fixture receipt missing');
    await writeFile(f.journalPath, JSON.stringify({ state, receipt: f.receipt }), { mode: 0o600 });
    const calls = [...f.calls],
      row = await f.runner.readPlanApplicationHistory(f.receipt);
    expect(row.matches).toHaveLength(1);
    expect(row.matches[0].location).toBe('current');
    expect(row.matches[0].state).toBe(state);
    expect(row.matches[0].savedPlanSha256).toBe(f.receipt.planSha256);
    expect(row.applicationOutcomeQualified).toBe(false);
    expect(row.retirementQualified).toBe(false);
    expect(f.calls).toEqual(calls);
    expect(JSON.stringify(row)).not.toContain('PRIVATE_ENROLLMENT_FIXTURE');
  });
async function archivedFixture(kind: 'revision' | 'plan-history') {
  const f = await fixture();
  if (!f.receipt) throw Error('exact fixture receipt missing');
  await writeFile(f.journalPath, JSON.stringify({ state: 'applied', receipt: f.receipt }), { mode: 0o600 });
  const journal = await readFile(f.journalPath),
    plan = await readFile(f.planPath);
  if (kind === 'revision') {
    await f.runner.reviseConfiguration(
      hash(configuration),
      JSON.stringify({
        terraform: { required_version: '= 1.14.0' },
        resource: { terraform_data: { next: { input: 'synthetic' } } },
      }),
    );
  } else await f.runner.plan({});
  const root = join(f.directory, kind === 'revision' ? 'revisions' : 'plan-history');
  const refs = await readdir(root),
    archive = join(root, refs[0]);
  return {
    ...f,
    receipt: f.receipt,
    root,
    archive,
    journal,
    plan,
    runHistory: (signal?: AbortSignal) =>
      f.runner.readPlanApplicationHistory(f.receipt as NonNullable<typeof f.receipt>, signal),
  };
}
for (const kind of ['revision', 'plan-history'] as const)
  test(`exact production ${kind} history preserves submitted receipt after active bytes are replaced`, async () => {
    const f = await archivedFixture(kind),
      calls = [...f.calls];
    const row = await f.runHistory();
    expect(row.matches.some((match) => match.location === kind && match.state === 'applied')).toBe(true);
    expect(await readFile(join(f.archive, 'plan-receipt.json'))).toEqual(f.journal);
    expect(await readFile(join(f.archive, 'saved.tfplan'))).toEqual(f.plan);
    expect(f.calls).toEqual(calls);
    expect(row.applicationOutcomeQualified).toBe(false);
  });
for (const mode of [
  'manifest',
  'source',
  'plan-bytes',
  'journal',
  'permissions',
  'symlink',
  'unknown-file',
  'missing-source',
])
  test(`original revision ${mode} corruption cannot establish application history`, async () => {
    const f = await archivedFixture('revision'),
      calls = [...f.calls];
    if (mode === 'manifest') {
      const path = join(f.archive, 'deployment.json'),
        manifest = JSON.parse((await readFile(path)).toString());
      manifest.backendIdentity = 'local:foreign';
      await writeFile(path, JSON.stringify(manifest), { mode: 0o600 });
    }
    if (mode === 'source') await writeFile(join(f.archive, 'main.tf.json'), '{}', { mode: 0o600 });
    if (mode === 'plan-bytes') await writeFile(join(f.archive, 'saved.tfplan'), 'foreign-plan', { mode: 0o600 });
    if (mode === 'journal') await writeFile(join(f.archive, 'plan-receipt.json'), '{}', { mode: 0o600 });
    if (mode === 'permissions') await chmod(f.archive, 0o755);
    if (mode === 'symlink') {
      await rm(join(f.archive, 'saved.tfplan'));
      await symlink(f.planPath, join(f.archive, 'saved.tfplan'));
    }
    if (mode === 'unknown-file') await writeFile(join(f.archive, 'unqualified.json'), '{}', { mode: 0o600 });
    if (mode === 'missing-source') await rm(join(f.archive, 'main.tf.json'));
    await expect(f.runHistory()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
for (const mode of ['inventory', 'provider', 'cli', 'foreign-ref'])
  test(`plan archive ${mode} corruption rejects exact receipt history`, async () => {
    const f = await archivedFixture('plan-history'),
      calls = [...f.calls];
    if (mode === 'inventory') await writeFile(join(f.archive, 'inventory.json'), '{}', { mode: 0o600 });
    if (mode === 'provider') await writeFile(join(f.archive, '.terraform.lock.hcl'), 'foreign', { mode: 0o600 });
    if (mode === 'cli') await writeFile(join(f.archive, 'deployment.tfrc'), 'foreign', { mode: 0o600 });
    if (mode === 'foreign-ref') {
      await rm(f.archive, { recursive: true });
      await writeFile(join(f.root, 'foreign'), '{}', { mode: 0o600 });
    }
    await expect(f.runHistory()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
test('partial original plan attempt remains incomplete evidence and grants no outcome', async () => {
  const f = await archivedFixture('revision');
  await rm(join(f.archive, 'plan-receipt.json'));
  const row = await f.runHistory();
  expect(row.matches).toHaveLength(0);
  expect(row.incompleteArchives).toBe(1);
  expect(row.applicationOutcomeQualified).toBe(false);
  expect(row.retirementQualified).toBe(false);
});
test('foreign expected receipt and pre-cancellation reject before execution', async () => {
  const f = await archivedFixture('revision'),
    calls = [...f.calls];
  await expect(f.runner.readPlanApplicationHistory({ ...f.receipt, backendIdentity: 'local:foreign' })).rejects.toThrow(
    'ownership',
  );
  await expect(f.runHistory(AbortSignal.abort(Error('synthetic history cancellation')))).rejects.toThrow(
    'history cancellation',
  );
  expect(f.calls).toEqual(calls);
});

for (const foreign of [false, true])
  test(`actual journal history service revalidates durable owner: ${foreign}`, async () => {
    const f = await serviceFixture();
    if (!f.session.readPlanApplicationHistory) throw Error('history service method missing');
    const receipt = {
      schemaVersion: 1 as const,
      deploymentId: f.owner.deploymentId,
      engine: 'terraform' as const,
      backendIdentity: `local:${f.owner.deploymentId}`,
      configurationSha256: hash(configuration),
      providerLockSha256: hash('# fixture lock'),
      planSha256: 'a'.repeat(64),
      changes: [],
      noChanges: true,
    };
    if (foreign) {
      const store = await f.platform.storage(f.owner);
      await writeFile(
        join(store.directory, 'owner.json'),
        JSON.stringify({ schemaVersion: 2, owner: { ...f.owner, engine: 'native' } }),
        { mode: 0o600 },
      );
      await expect(f.session.readPlanApplicationHistory(receipt)).rejects.toThrow();
    } else {
      const row = await f.session.readPlanApplicationHistory(receipt);
      expect(row.matches).toHaveLength(0);
      expect(row.applicationOutcomeQualified).toBe(false);
      expect(row.retirementQualified).toBe(false);
    }
  });

const cancellationNext = JSON.stringify({
  terraform: { required_version: '= 1.14.0' },
  resource: { terraform_data: { next: { input: 'synthetic-retirement' } } },
});
for (const next of [configuration, cancellationNext]) {
  const label = next === configuration ? 'unchanged' : 'revised';
  test(`exact ${label} cancellation retries lost response without Terraform or replacing provenance`, async () => {
    const f = await fixture();
    if (!f.receipt) throw Error('original saved receipt required');
    const calls = [...f.calls];
    await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), next, 'a'.repeat(64));
    const files = (await readdir(f.directory)).filter((n) => n.startsWith('configuration-cancellation-'));
    expect(files).toHaveLength(1);
    const provenance = await readFile(join(f.directory, files[0]));
    expect(await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), next, 'a'.repeat(64))).toBe(hash(next));
    expect((await f.runner.readCurrentPlanJournal(hash(next))).state).toBe('absent');
    expect(await readFile(join(f.directory, files[0]))).toEqual(provenance);
    expect(f.calls).toEqual(calls);
    const original = await f.runner.readPlanApplicationHistory(f.receipt);
    expect(original.matches.some((row) => row.location !== 'current' && row.state === 'planned')).toBe(true);
  });
  for (const boundary of ['both', 'journal-only', 'plan-only'])
    test(`exact ${label} cancellation recovers ${boundary} original remnants after lost response`, async () => {
      const f = await fixture();
      if (!f.receipt) throw Error('original saved receipt required');
      const plan = await readFile(f.planPath),
        journal = await readFile(f.journalPath),
        calls = [...f.calls];
      await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), next, 'a'.repeat(64));
      if (boundary !== 'journal-only') await writeFile(f.planPath, plan, { mode: 0o600 });
      if (boundary !== 'plan-only') await writeFile(f.journalPath, journal, { mode: 0o600 });
      expect(await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), next, 'a'.repeat(64))).toBe(
        hash(next),
      );
      expect((await f.runner.readCurrentPlanJournal(hash(next))).state).toBe('absent');
      expect(f.calls).toEqual(calls);
    });
  for (const defect of ['missing-archives', 'archive-bytes', 'submitted-remnant', 'evidence-changed'])
    test(`exact ${label} cancellation rejects ${defect} without claiming recovery`, async () => {
      const f = await fixture();
      if (!f.receipt) throw Error('original saved receipt required');
      const calls = [...f.calls];
      await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), next, 'a'.repeat(64));
      if (defect === 'missing-archives') {
        await rm(join(f.directory, 'plan-history'), { recursive: true });
        await rm(join(f.directory, 'revisions'), { recursive: true, force: true });
      }
      if (defect === 'archive-bytes') {
        const ids = await readdir(join(f.directory, 'plan-history'));
        await writeFile(join(f.directory, 'plan-history', ids[0], 'saved.tfplan'), 'foreign-plan', { mode: 0o600 });
      }
      if (defect === 'submitted-remnant') {
        await writeFile(f.planPath, 'binary-owned-plan', { mode: 0o600 });
        await writeFile(f.journalPath, JSON.stringify({ state: 'applying', receipt: f.receipt }), { mode: 0o600 });
      }
      await expect(
        f.runner.cancelUnsubmittedPlan(
          f.receipt,
          hash(configuration),
          next,
          (defect === 'evidence-changed' ? 'b' : 'a').repeat(64),
        ),
      ).rejects.toThrow();
      expect(f.calls).toEqual(calls);
    });
}
test('same-configuration cancellation resumes durable provenance written before original archival', async () => {
  const f = await fixture();
  if (!f.receipt) throw Error('original saved receipt required');
  const journal = await readFile(f.journalPath),
    plan = await readFile(f.planPath),
    calls = [...f.calls];
  await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), configuration, 'a'.repeat(64));
  await rm(join(f.directory, 'plan-history'), { recursive: true });
  await writeFile(f.journalPath, journal, { mode: 0o600 });
  await writeFile(f.planPath, plan, { mode: 0o600 });
  await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), configuration, 'a'.repeat(64));
  const history = await f.runner.readPlanApplicationHistory(f.receipt);
  expect(history.matches.some((row) => row.location === 'plan-history' && row.state === 'planned')).toBe(true);
  expect((await f.run()).state).toBe('absent');
  expect(f.calls).toEqual(calls);
});

for (const next of [configuration, cancellationNext]) {
  const label = next === configuration ? 'unchanged' : 'revised';
  test(`read-only ${label} cancellation authenticates original provenance and archives without Terraform`, async () => {
    const f = await fixture();
    if (!f.receipt) throw Error('original receipt required');
    const calls = [...f.calls];
    const absent = await f.runner.readUnsubmittedPlanCancellation(
      f.receipt,
      hash(configuration),
      hash(next),
      'a'.repeat(64),
    );
    expect(absent.status).toBe('absent');
    expect(absent.cancellationQualified).toBe(false);
    await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), next, 'a'.repeat(64));
    const observed = await f.runner.readUnsubmittedPlanCancellation(
      f.receipt,
      hash(configuration),
      hash(next),
      'a'.repeat(64),
    );
    expect(observed.status).toBe('cancelled');
    expect(observed.cancellationQualified).toBe(true);
    expect(observed.originalReceiptSha256).toBeTruthy();
    expect(observed.originalArchiveSha256s.length).toBeGreaterThan(0);
    expect(observed.runnerRetirementQualified).toBe(false);
    expect(observed.applicationOutcomeQualified).toBe(false);
    expect(f.calls).toEqual(calls);
    expect(JSON.stringify(observed)).not.toContain('PRIVATE_ENROLLMENT_FIXTURE');
  });
  for (const defect of [
    'record-foreign',
    'record-permissions',
    'archive-missing',
    'archive-bytes',
    'foreign-plan',
    'submitted-remnant',
    'evidence-changed',
  ])
    test(`read-only ${label} cancellation rejects ${defect}`, async () => {
      const f = await fixture();
      if (!f.receipt) throw Error('original receipt required');
      const calls = [...f.calls];
      await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), next, 'a'.repeat(64));
      const records = (await readdir(f.directory)).filter((n) => n.startsWith('configuration-cancellation-'));
      const path = join(f.directory, records[0]);
      if (defect === 'record-foreign') {
        const record = JSON.parse((await readFile(path)).toString());
        record.foreign = true;
        await writeFile(path, JSON.stringify(record), { mode: 0o600 });
      }
      if (defect === 'record-permissions') await chmod(path, 0o644);
      if (defect === 'archive-missing') {
        await rm(join(f.directory, 'plan-history'), { recursive: true });
        await rm(join(f.directory, 'revisions'), { recursive: true, force: true });
      }
      if (defect === 'archive-bytes') {
        const refs = await readdir(join(f.directory, 'plan-history'));
        await writeFile(join(f.directory, 'plan-history', refs[0], 'saved.tfplan'), 'foreign', { mode: 0o600 });
      }
      if (defect === 'foreign-plan') await writeFile(f.planPath, 'foreign', { mode: 0o600 });
      if (defect === 'submitted-remnant') {
        await writeFile(f.planPath, 'binary-owned-plan', { mode: 0o600 });
        await writeFile(f.journalPath, JSON.stringify({ state: 'applying', receipt: f.receipt }), { mode: 0o600 });
      }
      await expect(
        f.runner.readUnsubmittedPlanCancellation(
          f.receipt,
          hash(configuration),
          hash(next),
          (defect === 'evidence-changed' ? 'b' : 'a').repeat(64),
        ),
      ).rejects.toThrow();
      expect(f.calls).toEqual(calls);
    });
}
for (const boundary of ['before-archive', 'journal-only', 'plan-only', 'both'])
  test(`read-only cancellation preserves ${boundary} as pending instead of deleting or claiming completion`, async () => {
    const f = await fixture();
    if (!f.receipt) throw Error('original receipt required');
    const journal = await readFile(f.journalPath),
      plan = await readFile(f.planPath),
      calls = [...f.calls];
    await f.runner.cancelUnsubmittedPlan(f.receipt, hash(configuration), configuration, 'a'.repeat(64));
    if (boundary === 'before-archive') await rm(join(f.directory, 'plan-history'), { recursive: true });
    if (boundary !== 'journal-only') await writeFile(f.planPath, plan, { mode: 0o600 });
    if (boundary !== 'plan-only') await writeFile(f.journalPath, journal, { mode: 0o600 });
    const observed = await f.runner.readUnsubmittedPlanCancellation(
      f.receipt,
      hash(configuration),
      hash(configuration),
      'a'.repeat(64),
    );
    expect(observed.status).toBe('pending');
    expect(observed.cancellationQualified).toBe(false);
    expect(f.calls).toEqual(calls);
    if (boundary !== 'journal-only') expect(await readFile(f.planPath)).toEqual(plan);
    if (boundary !== 'plan-only') expect(await readFile(f.journalPath)).toEqual(journal);
  });
test('actual cancellation provenance service binds owner and permits absent observation without CLI', async () => {
  const f = await serviceFixture();
  if (!f.session.readUnsubmittedPlanCancellation) throw Error('cancellation provenance service missing');
  const observed = await f.session.readUnsubmittedPlanCancellation(
    undefined,
    hash(configuration),
    hash(configuration),
    'a'.repeat(64),
  );
  expect(observed.status).toBe('absent');
  expect(observed.cancellationQualified).toBe(false);
  const store = await f.platform.storage(f.owner);
  await writeFile(
    join(store.directory, 'owner.json'),
    JSON.stringify({ schemaVersion: 2, owner: { ...f.owner, engine: 'native' } }),
    { mode: 0o600 },
  );
  await expect(
    f.session.readUnsubmittedPlanCancellation(undefined, hash(configuration), hash(configuration), 'a'.repeat(64)),
  ).rejects.toThrow();
});
test('pre-aborted cancellation provenance inspection rejects without CLI', async () => {
  const f = await fixture();
  await expect(
    f.runner.readUnsubmittedPlanCancellation(
      f.receipt,
      hash(configuration),
      hash(configuration),
      'a'.repeat(64),
      AbortSignal.abort(Error('synthetic provenance abort')),
    ),
  ).rejects.toThrow('provenance abort');
});

for (const state of ['planned', 'applying', 'applied'] as const)
  test(`actual ${state} current journal exposes exact validated refresh/executor hash without source or path`, async () => {
    const f = await fixture(true, true);
    const journal = JSON.parse((await readFile(f.journalPath)).toString());
    journal.state = state;
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    const calls = [...f.calls],
      row = await f.run();
    expect(row.ordinaryRefreshEnabled).toBe(true);
    expect(row.executionSha256).toBe(
      createHash('sha256')
        .update(
          JSON.stringify({
            planArgs: journal.execution.planArgs,
            terraform: { path: journal.execution.terraform.path, sha256: journal.execution.terraform.sha256 },
          }),
        )
        .digest('hex'),
    );
    expect(JSON.stringify(row)).not.toContain('/synthetic/terraform');
    expect(JSON.stringify(row)).not.toContain('PRIVATE_ENROLLMENT_FIXTURE');
    expect(f.calls).toEqual(calls);
  });
test('missing saved execution provenance never claims an ordinary refresh-enabled plan', async () => {
  const f = await fixture(),
    row = await f.run();
  expect(row.ordinaryRefreshEnabled).toBeUndefined();
  expect(row.executionSha256).toBeUndefined();
});

for (const mode of ['destroy', 'action', 'imports', 'relinquishments'] as const)
  test(`validated ${mode} execution is hashed but never classified as an ordinary refresh plan`, async () => {
    const f = await fixture(true, true);
    const journal = JSON.parse((await readFile(f.journalPath)).toString());
    if (mode === 'destroy') {
      journal.receipt.operation = 'destroy';
      journal.execution.planArgs.push('-destroy');
    } else if (mode === 'action') {
      const intent = {
        address: 'action.example_action.ce',
        type: 'example_action',
        providerName: 'registry.terraform.io/example/provider',
        configValuesSha256: 'a'.repeat(64),
      };
      journal.receipt.actionInvocations = [intent];
      journal.execution.planArgs.push(`-invoke=${intent.address}`);
    } else {
      journal.receipt[mode] = [
        {
          address: 'terraform_data.ce',
          type: 'terraform_data',
          providerName: 'registry.terraform.io/example/provider',
          idSha256: 'a'.repeat(64),
        },
      ];
    }
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    const calls = [...f.calls],
      row = await f.run();
    expect(row.ordinaryRefreshEnabled).toBe(false);
    expect(row.executionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(row.planSemanticsQualified).toBe(false);
    expect(f.calls).toEqual(calls);
  });

for (const state of ['applied', 'applying', 'reconciled'] as const)
  test(`actual ${state} lifecycle preserves the original ordinary-refresh execution journal instead of fabricating new provenance`, async () => {
    const f = await fixture(true, true, state !== 'applied');
    if (!f.receipt) throw Error('original receipt missing');
    const original = JSON.parse(await readFile(f.journalPath, 'utf8')),
      before = await f.run();
    if (state === 'applied') await f.runner.apply(f.receipt, {});
    else await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('response loss');
    if (state === 'reconciled') {
      const calls = [...f.calls];
      await f.runner.reconcileApplyFromEvidence(f.receipt, 'e'.repeat(64));
      expect(f.calls).toEqual(calls);
    }
    const after = await f.run(),
      journal = JSON.parse(await readFile(f.journalPath, 'utf8'));
    expect(after.state).toBe(state === 'applying' ? 'applying' : 'applied');
    expect(after.ordinaryRefreshEnabled).toBe(true);
    expect(after.executionSha256).toBe(before.executionSha256);
    expect(journal.execution).toEqual(original.execution);
    expect(journal.receipt).toEqual(original.receipt);
    if (state === 'reconciled') expect(journal.reconciledEvidenceSha256).toBe('e'.repeat(64));
    else expect(journal.reconciledEvidenceSha256).toBeUndefined();
  });

test('apply without original executor metadata preserves absence and grants no refreshed execution claim', async () => {
  const f = await fixture();
  if (!f.receipt) throw Error('original receipt missing');
  await f.runner.apply(f.receipt, {});
  const after = await f.run();
  expect(after.state).toBe('applied');
  expect(after.executionSha256).toBeUndefined();
  expect(after.ordinaryRefreshEnabled).toBeUndefined();
  expect(JSON.parse(await readFile(f.journalPath, 'utf8')).execution).toBeUndefined();
});

for (const defect of ['execution', 'journal-extra'])
  test(`malformed original ${defect} cannot be erased by apply before CLI execution`, async () => {
    const f = await fixture(true, true);
    if (!f.receipt) throw Error('original receipt missing');
    const journal = JSON.parse(await readFile(f.journalPath, 'utf8'));
    if (defect === 'execution') journal.execution.planArgs.push('-target=terraform_data.foreign');
    else journal.foreign = true;
    await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
    const calls = [...f.calls],
      bytes = await readFile(f.journalPath);
    await expect(f.runner.apply(f.receipt, {})).rejects.toThrow();
    expect(f.calls).toEqual(calls);
    expect(await readFile(f.journalPath)).toEqual(bytes);
  });

for (const boundary of ['show', 'apply'] as const)
  test(`actual ${boundary} journal drift rejects lifecycle publication and preserves conflicting evidence`, async () => {
    const f = await fixture(true, true, false, boundary);
    if (!f.receipt) throw Error('original receipt missing');
    await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('changed before lifecycle publication');
    const journal = JSON.parse(await readFile(f.journalPath, 'utf8'));
    expect(journal.state).toBe(boundary === 'show' ? 'planned' : 'applying');
    expect(journal.foreign).toBe('synthetic concurrent journal change');
    expect(f.calls.filter((request) => request.args[0] === 'apply')).toHaveLength(boundary === 'show' ? 0 : 1);
  });

for (const state of ['planned', 'applying', 'applied'] as const)
  test(`exhaustive inventory captures exact current ${state} without a Terraform command`, async () => {
    const f = await fixture();
    const journal = JSON.parse(await readFile(f.journalPath, 'utf8'));
    await writeFile(f.journalPath, JSON.stringify({ ...journal, state }), { mode: 0o600 });
    const calls = [...f.calls];
    const row = await f.runner.readPlanJournalInventory();
    expect(row.status).toBe('complete');
    expect(row.entries).toHaveLength(1);
    expect(row.entries[0].state).toBe(state);
    expect(row.entries[0].receiptSha256).toBe(hash(canonicalReceipt(f.receipt)));
    expect(row.entries[0].savedPlanSha256).toBe(f.receipt?.planSha256 ?? null);
    expect(row.applicationOutcomeQualified).toBe(false);
    expect(row.retirementQualified).toBe(false);
    expect(JSON.stringify(row)).not.toContain('PRIVATE_ENROLLMENT_FIXTURE');
    expect(f.calls).toEqual(calls);
  });
test('exhaustive inventory explicitly records absent current journals', async () => {
  const f = await fixture(false),
    calls = [...f.calls];
  const row = await f.runner.readPlanJournalInventory();
  expect(row.status).toBe('complete');
  expect(row.entries[0].state).toBe('absent');
  expect(row.entries[0].receiptSha256).toBeNull();
  expect(f.calls).toEqual(calls);
});
for (const kind of ['revision', 'plan-history'] as const)
  test(`exhaustive inventory authenticates every actual ${kind} archive`, async () => {
    const f = await archivedFixture(kind),
      calls = [...f.calls];
    const row = await f.runner.readPlanJournalInventory();
    expect(row.status).toBe('complete');
    expect(row.entries.some((entry) => entry.location === kind && entry.state === 'applied')).toBe(true);
    expect(row.entries.some((entry) => entry.location === 'current')).toBe(true);
    expect(f.calls).toEqual(calls);
  });
test('valid owned but unaccounted receipts cannot disappear behind a requested-receipt filter', async () => {
  const f = await archivedFixture('plan-history');
  const journal = JSON.parse(await readFile(f.journalPath, 'utf8'));
  journal.receipt.changes[0].address = 'terraform_data.unaccounted';
  await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
  const calls = [...f.calls],
    row = await f.runner.readPlanJournalInventory();
  expect(row.status).toBe('complete');
  expect(new Set(row.entries.filter((entry) => entry.receiptSha256).map((entry) => entry.receiptSha256)).size).toBe(2);
  expect((await f.runHistory()).matches.every((entry) => entry.location !== 'current')).toBe(true);
  expect(row.retirementQualified).toBe(false);
  expect(f.calls).toEqual(calls);
});
test('unknown native root artifacts remain explicit partial inventory', async () => {
  const f = await fixture();
  await writeFile(join(f.directory, 'unaccounted-request.json'), '{}', { mode: 0o600 });
  const row = await f.runner.readPlanJournalInventory();
  expect(row.status).toBe('partial');
  expect(row.unrecognizedRootEntrySha256s).toEqual([hash('unaccounted-request.json')]);
});
test('incomplete archived journals remain unknown, with present bytes retained', async () => {
  const f = await archivedFixture('revision');
  await rm(join(f.archive, 'plan-receipt.json'));
  const row = await f.runner.readPlanJournalInventory();
  expect(row.status).toBe('partial');
  expect(row.incompleteArchives).toBe(1);
  const archive = row.entries.find((entry) => entry.location === 'revision');
  if (!archive) throw Error('actual revision inventory entry missing');
  expect(archive.state).toBe('unknown');
  expect(archive.journalSha256).toBeNull();
  expect(archive.savedPlanSha256).toBe(f.receipt?.planSha256 ?? null);
});
test('malformed unrelated native journal blocks inventory instead of being filtered out', async () => {
  const f = await archivedFixture('revision');
  await writeFile(join(f.archive, 'plan-receipt.json'), '{}', { mode: 0o600 });
  await expect(f.runner.readPlanJournalInventory()).rejects.toThrow();
});
test('exhaustive inventory refuses a pre-aborted observation without executing Terraform', async () => {
  const f = await fixture(),
    calls = [...f.calls],
    controller = new AbortController();
  controller.abort(Error('owned inventory cancelled'));
  await expect(f.runner.readPlanJournalInventory(controller.signal)).rejects.toThrow('owned inventory cancelled');
  expect(f.calls).toEqual(calls);
});
for (const mode of [
  'manifest',
  'source',
  'plan-bytes',
  'journal',
  'permissions',
  'symlink',
  'unknown-file',
  'missing-source',
])
  test(`inventory revision ${mode} corruption cannot establish application history`, async () => {
    const f = await archivedFixture('revision'),
      calls = [...f.calls];
    if (mode === 'manifest') {
      const path = join(f.archive, 'deployment.json'),
        manifest = JSON.parse((await readFile(path)).toString());
      manifest.backendIdentity = 'local:foreign';
      await writeFile(path, JSON.stringify(manifest), { mode: 0o600 });
    }
    if (mode === 'source') await writeFile(join(f.archive, 'main.tf.json'), '{}', { mode: 0o600 });
    if (mode === 'plan-bytes') await writeFile(join(f.archive, 'saved.tfplan'), 'foreign-plan', { mode: 0o600 });
    if (mode === 'journal') await writeFile(join(f.archive, 'plan-receipt.json'), '{}', { mode: 0o600 });
    if (mode === 'permissions') await chmod(f.archive, 0o755);
    if (mode === 'symlink') {
      await rm(join(f.archive, 'saved.tfplan'));
      await symlink(f.planPath, join(f.archive, 'saved.tfplan'));
    }
    if (mode === 'unknown-file') await writeFile(join(f.archive, 'unqualified.json'), '{}', { mode: 0o600 });
    if (mode === 'missing-source') await rm(join(f.archive, 'main.tf.json'));
    await expect(f.runner.readPlanJournalInventory()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
for (const mode of ['inventory', 'provider', 'cli', 'foreign-ref'])
  test(`inventory plan archive ${mode} corruption rejects exact receipt history`, async () => {
    const f = await archivedFixture('plan-history'),
      calls = [...f.calls];
    if (mode === 'inventory') await writeFile(join(f.archive, 'inventory.json'), '{}', { mode: 0o600 });
    if (mode === 'provider') await writeFile(join(f.archive, '.terraform.lock.hcl'), 'foreign', { mode: 0o600 });
    if (mode === 'cli') await writeFile(join(f.archive, 'deployment.tfrc'), 'foreign', { mode: 0o600 });
    if (mode === 'foreign-ref') {
      await rm(f.archive, { recursive: true });
      await writeFile(join(f.root, 'foreign'), '{}', { mode: 0o600 });
    }
    await expect(f.runner.readPlanJournalInventory()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
test('partial original plan attempt remains incomplete evidence and grants no outcome', async () => {
  const f = await archivedFixture('revision');
  await rm(join(f.archive, 'plan-receipt.json'));
  const row = await f.runner.readPlanJournalInventory();
  expect(row.status).toBe('partial');
  expect(row.entries.filter((entry) => entry.receiptSha256 !== null)).toHaveLength(0);
  expect(row.incompleteArchives).toBe(1);
  expect(row.applicationOutcomeQualified).toBe(false);
  expect(row.retirementQualified).toBe(false);
});

for (const foreign of [false, true])
  test(`actual inventory service revalidates durable owner: ${foreign}`, async () => {
    const f = await serviceFixture();
    if (!f.session.readPlanJournalInventory) throw Error('inventory service method missing');
    if (foreign) {
      const store = await f.platform.storage(f.owner);
      await writeFile(
        join(store.directory, 'owner.json'),
        JSON.stringify({ schemaVersion: 2, owner: { ...f.owner, engine: 'native' } }),
        { mode: 0o600 },
      );
      await expect(f.session.readPlanJournalInventory()).rejects.toThrow();
    } else {
      const row = await f.session.readPlanJournalInventory();
      expect(row.status).toBe('complete');
      expect(row.entries[0].state).toBe('absent');
      expect(row.applicationOutcomeQualified).toBe(false);
      expect(row.retirementQualified).toBe(false);
    }
  });
test('exhaustive inventory preserves validated execution hashes without private paths', async () => {
  const f = await fixture(true, true),
    calls = [...f.calls];
  const row = await f.runner.readPlanJournalInventory();
  expect(row.entries[0].executionSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(row.entries[0].ordinaryRefreshEnabled).toBe(true);
  expect(JSON.stringify(row)).not.toContain('/synthetic/terraform');
  expect(JSON.stringify(row)).not.toContain('PRIVATE_ENROLLMENT_FIXTURE');
  expect(f.calls).toEqual(calls);
});
test('final exhaustive namespace seal rejects an archive entry introduced during recollection', async () => {
  const f = await archivedFixture('plan-history'),
    calls = [...f.calls],
    controller = new AbortController();
  const original = controller.signal.throwIfAborted.bind(controller.signal);
  let checks = 0;
  Object.defineProperty(controller.signal, 'throwIfAborted', {
    value() {
      checks++;
      if (checks === 20) writeFileSync(join(f.archive, 'late-unaccounted.json'), '{}', { mode: 0o600 });
      original();
    },
  });
  await expect(f.runner.readPlanJournalInventory(controller.signal)).rejects.toThrow('directory changed');
  expect(checks).toBeGreaterThanOrEqual(20);
  expect(f.calls).toEqual(calls);
});

function canonicalReceipt(value: unknown): string {
  const sort = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sort);
    if (entry && typeof entry === 'object')
      return Object.fromEntries(
        Object.entries(entry)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, sort(nested)]),
      );
    return entry;
  };
  return JSON.stringify(sort(value));
}

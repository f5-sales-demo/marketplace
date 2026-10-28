import { afterEach, expect, test } from 'bun:test';
import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { TerraformRunner } from '../../../terraform/src/runner';
import { createCeTerraformService } from '../../../terraform/src/service';
import { azureTerraformNetworkPowerDeployment } from '../../src/ce/terraform-network-power';
import { readAzureTerraformNetworkPowerRunnerHistory } from '../../src/ce/terraform-network-power-runner-history';
import { readAzureTerraformNetworkRetirementGraph } from '../../src/ce/terraform-network-retirement-graph';
import { bindAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-source-binding';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
const address = 'azapi_resource_action.ce_network';
async function fixture(ha = false) {
  const f = await terraformNetworkDriverFixture(ha);
  await f.run();
  const graph = await readAzureTerraformNetworkRetirementGraph(
    f.plan,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  const commands: string[] = [],
    runners: Array<{ runner: TerraformRunner; directory: string }> = [];
  for (const deployment of graph.powerDeployments) {
    const operation = deployment.stage?.endsWith('-start') ? 'start' : 'deallocate';
    const node = Number(deployment.stage?.match(/-node-(\d+)-/)?.[1]);
    const before = graph.checkpoint.snapshot?.checkpoint.nodes.find((row) => row.node === node)?.before;
    if (!before || !deployment.stage) throw Error('derived fixture stage missing');
    let control: Record<string, unknown> | null = null,
      raw: Record<string, unknown> = {},
      count = 0;
    const runner = new TerraformRunner(
      join(f.store.directory, 'terraform-stages', deployment.stage),
      async (request) => {
        commands.push(request.args[0]);
        let stdout = '{}';
        if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: deployment.terraformVersion });
        if (request.args[0] === 'plan') {
          const desired =
            JSON.parse((await readFile(join(request.cwd, 'main.tf.json'))).toString()).resource?.azapi_resource_action
              ?.ce_network ?? null;
          const effect = desired ? (control ? 'no-op' : 'create') : control ? 'delete' : undefined;
          raw = {
            format_version: '1.2',
            terraform_version: deployment.terraformVersion,
            errored: false,
            complete: true,
            applyable: true,
            resource_changes: effect
              ? [
                  {
                    address,
                    type: 'azapi_resource_action',
                    mode: 'managed',
                    provider_name: 'registry.terraform.io/azure/azapi',
                    change: {
                      actions: [effect],
                      before: control,
                      after: desired,
                      before_sensitive: false,
                      after_sensitive: false,
                      after_unknown: false,
                    },
                  },
                ]
              : [],
            output_changes: {},
          };
          await writeFile(join(request.cwd, 'saved.tfplan'), `${operation}:${++count}`, { mode: 0o600 });
        }
        if (request.args[0] === 'show') stdout = JSON.stringify(raw);
        if (request.args[0] === 'apply')
          control =
            JSON.parse((await readFile(join(request.cwd, 'main.tf.json'))).toString()).resource?.azapi_resource_action
              ?.ce_network ?? null;
        return { code: 0, stdout };
      },
    );
    await runner.prepare(deployment);
    const historyNode = graph.nodes.find((row) => row.node === node);
    if (!historyNode) throw Error('original history node missing');
    const original = operation === 'start' ? historyNode.start : historyNode.deallocate;
    if (!original.receipts.mutation || !original.receipts.release || !original.receipts.current)
      throw Error('original completed power receipts missing');
    const mutation = await runner.plan({});
    expect(mutation).toEqual(original.receipts.mutation);
    await runner.apply(mutation, {});
    const release = await azureTerraformNetworkPowerDeployment(f.plan, before, node, operation, true);
    await runner.reviseConfiguration(f.hash(deployment.configuration), release.configuration);
    const released = await runner.plan({});
    expect(released).toEqual(original.receipts.release);
    await runner.apply(released, {});
    const final = await runner.plan({});
    expect(final).toEqual(original.receipts.current);
    runners.push({
      runner,
      directory: join(f.store.directory, 'terraform-stages', deployment.stage, deployment.deploymentId),
    });
  }
  const platform = {
    storage: async (owner: typeof f.store.owner) => {
      expect(owner).toEqual(f.store.owner);
      await f.store.verify();
      return f.store;
    },
  } as unknown as CePlatformService;
  const terraform = createCeTerraformService(async () => platform);
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkPowerRunnerHistory(
      f.plan,
      f.store,
      terraform,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, graph, runners, commands, runHistory: run, stageTerraform: terraform };
}
for (const ha of [false, true])
  test(`actual ${ha ? 'six-interface HA' : 'single'} runner journals join exact original serial graph without commands or retirement`, async () => {
    const f = await fixture(ha),
      commands = [...f.commands],
      calls = [...f.calls];
    const row = await f.runHistory();
    expect(row.rows).toHaveLength(ha ? 6 : 2);
    for (const stage of row.rows) {
      expect(stage.status).toBe('inspected');
      expect(stage.configurationPhase).toBe('release');
      expect(stage.current?.state).toBe('planned');
      expect(stage.phases?.mutation?.submission).toBe('applied');
      expect(stage.phases?.release?.submission).toBe('applied');
    }
    expect(row.applicationOutcomeQualified).toBe(false);
    expect(row.runnerRetirementQualified).toBe(false);
    expect(row.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    expect(f.calls).toEqual(calls);
    expect(JSON.stringify(row)).not.toContain(f.graph.original.binding.source);
  }, 120000);
for (const mode of [
  'orphan-stage',
  'foreign-runner',
  'unsafe-stage',
  'missing-stage',
  'pending-revision',
  'foreign-configuration',
  'foreign-history-bytes',
])
  test(`actual runner ${mode} rejects instead of admitting cleanup`, async () => {
    const f = await fixture(),
      commands = [...f.commands],
      stage = f.runners[0].directory;
    if (mode === 'orphan-stage')
      await mkdir(
        join(f.store.directory, 'terraform-stages', `network-${f.plan.planSha256.slice(0, 24)}-node-4-start`),
        { mode: 0o700 },
      );
    if (mode === 'foreign-runner') await mkdir(join(stage, '..', 'foreign'), { mode: 0o700 });
    if (mode === 'unsafe-stage') await chmod(join(stage, '..'), 0o755);
    if (mode === 'missing-stage') await rm(join(stage, '..'), { recursive: true });
    if (mode === 'pending-revision')
      await writeFile(join(stage, 'configuration-transition.json'), '{}', { mode: 0o600 });
    if (mode === 'foreign-configuration') await writeFile(join(stage, 'main.tf.json'), '{}', { mode: 0o600 });
    if (mode === 'foreign-history-bytes') {
      const { readdir } = await import('node:fs/promises');
      const refs = await readdir(join(stage, 'revisions'));
      await writeFile(join(stage, 'revisions', refs[0], 'saved.tfplan'), 'foreign-bytes', { mode: 0o600 });
    }
    await expect(f.runHistory()).rejects.toThrow();
    expect(f.commands).toEqual(commands);
  }, 60000);
test('retired runner marker remains awaiting exact durable retirement receipt, never absent-file success', async () => {
  const f = await fixture();
  await writeFile(join(f.runners[0].directory, 'artifact-retirement.json'), '{}', { mode: 0o600 });
  const row = await f.runHistory();
  expect(row.rows[0].status).toBe('retired-awaiting-receipt');
  expect(row.retirementQualified).toBe(false);
}, 60000);
for (const kind of ['open', 'readCurrentPlanJournal', 'readPlanApplicationHistory'] as const)
  test(`ignored owning ${kind} remains cancellation bounded`, async () => {
    const f = await fixture(),
      abort = new AbortController();
    let reached = false,
      at = 0;
    const stall = () => {
      reached = true;
      at = Date.now();
      setTimeout(() => abort.abort(Error('synthetic ignored dependency cancellation')), 25);
      return new Promise<never>(() => {});
    };
    if (kind === 'open') f.stageTerraform.open = stall;
    else {
      const open = f.stageTerraform.open.bind(f.stageTerraform);
      f.stageTerraform.open = async (...args) => {
        const session = await open(...args);
        session[kind] = stall;
        return session;
      };
    }
    await expect(f.runHistory(abort.signal)).rejects.toThrow('ignored dependency cancellation');
    expect(reached).toBe(true);
    expect(Date.now() - at).toBeLessThan(1000);
  }, 60000);

for (const state of ['planned', 'applying', 'missing'])
  test(`original ${state} mutation archive stays unqualified despite complete packets`, async () => {
    const f = await fixture(),
      directory = join(f.runners[0].directory, 'revisions');
    const refs = await readdir(directory),
      archive = join(directory, refs[0]);
    if (state === 'missing') await rm(archive, { recursive: true });
    else {
      const path = join(archive, 'plan-receipt.json'),
        journal = JSON.parse((await readFile(path)).toString());
      journal.state = state;
      await writeFile(path, JSON.stringify(journal), { mode: 0o600 });
    }
    const row = await f.runHistory();
    expect(row.rows[0].phases?.mutation?.submission).toBe(
      state === 'planned' ? 'unsubmitted' : state === 'applying' ? 'unresolved' : 'missing',
    );
    expect(row.applicationOutcomeQualified).toBe(false);
    expect(row.retirementQualified).toBe(false);
  }, 60000);
for (const preflight of [false, true])
  test(`source ${preflight ? 'with qualified preflight' : 'only'} and no runner remains local absence`, async () => {
    const f = await terraformNetworkDriverFixture();
    await bindAzureTerraformNetworkUpdateSource(
      f.plan,
      f.terraform,
      f.store,
      f.api,
      {},
      f.loaders,
      f.site,
      undefined,
      f.dependencies.qualifyAcceptance,
    );
    if (preflight) {
      f.dependencies.runPower = async () => {
        throw Error('synthetic before runner creation');
      };
      await expect(f.run()).rejects.toThrow('before runner creation');
    }
    let opens = 0;
    const terraform = {
      open: async () => {
        opens++;
        throw Error('must not open absent stage');
      },
    };
    const row = await readAzureTerraformNetworkPowerRunnerHistory(
      f.plan,
      f.store,
      terraform,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    );
    expect(row.rows).toHaveLength(preflight ? 1 : 0);
    if (preflight) expect(row.rows[0].status).toBe('missing');
    expect(row.retirementQualified).toBe(false);
    expect(opens).toBe(0);
  }, 60000);

for (const mode of ['request', 'site', 'open', 'storage', 'method', 'current-identity', 'history-identity'])
  test(`owning inspection rejects cross-read ${mode} changes`, async () => {
    const f = await fixture(),
      open = f.stageTerraform.open.bind(f.stageTerraform);
    let fired = false;
    f.stageTerraform.open = async (...args) => {
      const session = await open(...args),
        current = session.readCurrentPlanJournal,
        history = session.readPlanApplicationHistory;
      if (!current || !history) throw Error('production journal methods missing');
      session.readCurrentPlanJournal = async (...params) => {
        const row = await current(...params);
        if (!fired && mode !== 'history-identity') {
          fired = true;
          if (mode === 'request') f.plan.warnings.push('synthetic concurrent change');
          if (mode === 'site') f.site.siteUid += '-foreign';
          if (mode === 'open') f.stageTerraform.open = open;
          if (mode === 'storage') f.store.read = f.store.read.bind(f.store);
          if (mode === 'method') session.readCurrentPlanJournal = current;
          if (mode === 'current-identity') return { ...row, manifestSha256: 'a'.repeat(64) };
        }
        return row;
      };
      session.readPlanApplicationHistory = async (...params) => {
        const row = await history(...params);
        if (!fired && mode === 'history-identity') {
          fired = true;
          return { ...row, matches: row.matches.map((entry) => ({ ...entry, savedPlanSha256: 'a'.repeat(64) })) };
        }
        return row;
      };
      return session;
    };
    await expect(f.runHistory()).rejects.toThrow();
    expect(fired).toBe(true);
  }, 60000);

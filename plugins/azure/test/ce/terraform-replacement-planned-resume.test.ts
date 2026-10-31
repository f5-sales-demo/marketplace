import { expect } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type PlanReceipt, TerraformRunner } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { test } from './owned-fixture-test';
import { withOwnedFixtureRootScope as owned } from './root-scope';
import { networkReplacementExecutorFixture } from './terraform-network-replacement-executor-fixture';

/** Real saved-plan files/journals; cloud and Terraform executable responses stay synthetic. */
async function nativeFixture() {
  const f = await networkReplacementExecutorFixture();
  const deployment = await azureTerraformCurrentDeployment(f.input.plan);
  let selected: PlanReceipt | undefined;
  const commands: string[] = [];
  const runner = new TerraformRunner(f.store.directory, async (request) => {
    commands.push(request.args[0]);
    let stdout = '{}';
    if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: deployment.terraformVersion });
    if (request.args[0] === 'plan') {
      if (!selected) throw Error('owning selected receipt unavailable');
      expect(f.hash(await readFile(join(request.cwd, 'main.tf.json'), 'utf8'))).toBe(selected.configurationSha256);
      await writeFile(join(request.cwd, 'saved.tfplan'), String(f.state.counter), { mode: 0o600 });
    }
    if (request.args[0] === 'show') {
      if (!selected) throw Error('owning selected receipt unavailable');
      stdout = JSON.stringify({
        format_version: '1.2',
        terraform_version: deployment.terraformVersion,
        errored: false,
        complete: true,
        applyable: true, // codespell:ignore applyable (exact Terraform JSON field)
        output_changes: {},
        resource_changes: selected.changes.map((change) => ({
          ...change,
          mode: 'managed',
          provider_name: 'registry.terraform.io/hashicorp/azurerm',
          change: {
            actions: change.actions,
            before:
              change.actions[0] === 'delete' ? { id: f.binding.before.nodes[String(f.selected)].resourceId } : null,
            after: null,
            after_unknown: {},
          },
        })),
      });
    }
    return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
  });
  await runner.prepare({ ...deployment, configuration: f.binding.source });
  const mockPlan = f.session.plan.bind(f.session),
    mockRevise = f.session.reviseConfiguration.bind(f.session),
    mockApply = f.session.apply.bind(f.session);
  f.session.plan = async (env, signal, refreshOriginSha256) => {
    selected = await mockPlan(env, signal, refreshOriginSha256);
    const receipt = await runner.plan(env, signal, refreshOriginSha256);
    expect(receipt).toEqual(selected);
    return receipt;
  };
  f.session.reviseConfiguration = async (expected, next) => {
    await mockRevise(expected, next);
    return runner.reviseConfiguration(expected, next);
  };
  f.session.readConfiguration = (expected) => runner.readConfiguration(expected);
  f.session.readConfigurationSha256 = () => runner.readConfigurationSha256();
  f.session.readCurrentPlanJournal = (expected, signal) => runner.readCurrentPlanJournal(expected, signal);
  f.session.readPlanApplicationState = (receipt) => runner.readPlanApplicationState(receipt);
  f.session.readPlanApplicationHistory = (receipt, signal) => runner.readPlanApplicationHistory(receipt, signal);
  f.session.readPlannedResourceIds = (receipt, addresses, env, signal) =>
    runner.readPlannedResourceIds(receipt, addresses, env, signal);
  f.session.apply = async (receipt, env, signal) => {
    await runner.apply(receipt, env, signal);
    await mockApply(receipt, env, signal);
  };
  return { ...f, runner, commands };
}

for (const native of [false, true])
  for (const phase of ['quiesce', 'launch'] as const) {
    test(
      `resume preserves exact unsubmitted ${phase} plan after acceptance interruption with ${native ? 'real native' : 'synthetic'} journals`,
      () =>
        owned(async () => {
          const f = native ? await nativeFixture() : await networkReplacementExecutorFixture();
          if (phase === 'quiesce') f.state.unknownAfterRevision = true;
          else f.state.tokenMode = 'unavailable-on-launch';
          expect((await f.run()).status).toBe(
            phase === 'quiesce' ? 'operational-acceptance-pending' : 'enrollment-pending',
          );
          const name = `${f.input.plan.planId}-terraform-${phase}-plan.json`;
          const saved = (await f.store.read(name)) as { receipt: PlanReceipt };
          const digest = canonicalSha256(saved),
            counter = f.state.counter,
            applies = f.state.applies;
          expect(await f.session.readPlanApplicationState(saved.receipt)).toBe('planned');
          f.state.unknownAfterRevision = false;
          f.state.tokenMode = '';
          expect((await f.run()).status).toBe('complete');
          expect(canonicalSha256(await f.store.read(name))).toBe(digest);
          if ('runner' in f && f.runner instanceof TerraformRunner) {
            const history = await f.runner.readPlanApplicationHistory(saved.receipt);
            expect(history.matches.length).toBeGreaterThan(0);
            expect(history.matches.every((match) => match.state === 'applied')).toBe(true);
          } else expect(await f.session.readPlanApplicationState(saved.receipt)).toBe('applied');
          expect(f.state.counter - counter).toBe(phase === 'quiesce' ? 2 : 1);
          expect(f.state.applies - applies).toBe(phase === 'quiesce' ? 2 : 1);
        }),
      300000,
    );
  }

test(
  'foreign saved target identities cannot be overwritten to authorize resumed application',
  () =>
    owned(async () => {
      const f = await networkReplacementExecutorFixture();
      f.state.unknownAfterRevision = true;
      expect((await f.run()).status).toBe('operational-acceptance-pending');
      const name = `${f.input.plan.planId}-terraform-quiesce-plan.json`;
      const saved = (await f.store.read(name)) as { receipt: PlanReceipt; identities: Record<string, unknown> };
      const foreign = {
        ...saved,
        identities: Object.fromEntries(Object.keys(saved.identities).map((key) => [key, '/foreign/vm'])),
      };
      await f.store.write(name, foreign);
      const counter = f.state.counter,
        applies = f.state.applies;
      f.state.unknownAfterRevision = false;
      await expect(f.run()).rejects.toThrow();
      expect(canonicalSha256(await f.store.read(name))).toBe(canonicalSha256(foreign));
      expect(f.state.counter).toBe(counter);
      expect(f.state.applies).toBe(applies);
    }),
  300000,
);

test(
  'unavailable native saved application state cannot authorize resumed planning or application',
  () =>
    owned(async () => {
      const f = await networkReplacementExecutorFixture();
      f.state.unknownAfterRevision = true;
      expect((await f.run()).status).toBe('operational-acceptance-pending');
      const counter = f.state.counter,
        applies = f.state.applies;
      f.state.unknownAfterRevision = false;
      f.state.wrongState = true;
      await expect(f.run()).rejects.toThrow();
      expect(f.state.counter).toBe(counter);
      expect(f.state.applies).toBe(applies);
    }),
  300000,
);

test(
  'last native identity callback cannot replace the retained unsubmitted receipt publication',
  () =>
    owned(async () => {
      const f = await networkReplacementExecutorFixture();
      f.state.unknownAfterRevision = true;
      expect((await f.run()).status).toBe('operational-acceptance-pending');
      const name = `${f.input.plan.planId}-terraform-quiesce-plan.json`;
      const saved = (await f.store.read(name)) as { receipt: PlanReceipt };
      const foreign = { ...saved, receipt: { ...saved.receipt, planSha256: 'a'.repeat(64) } };
      const read = f.session.readPlannedResourceIds.bind(f.session),
        counter = f.state.counter,
        applies = f.state.applies;
      f.session.readPlannedResourceIds = async (...request) => {
        const result = await read(...request);
        await f.store.write(name, foreign);
        return result;
      };
      f.state.unknownAfterRevision = false;
      await expect(f.run()).rejects.toThrow();
      expect(canonicalSha256(await f.store.read(name))).toBe(canonicalSha256(foreign));
      expect(f.state.counter).toBe(counter);
      expect(f.state.applies).toBe(applies);
    }),
  300000,
);

test(
  'completion rejects missing, partial, foreign, duplicate and changing historical journals',
  () =>
    owned(async () => {
      const f = await nativeFixture();
      expect((await f.run()).status).toBe('complete');
      const read = f.session.readPlanApplicationHistory;
      if (!read) throw Error('real native historical reader required');
      const completionName = `${f.input.plan.planId}-terraform-network-replacement-complete.json`;
      const completion = canonicalSha256(await f.store.read(completionName));
      for (const mode of [
        'absent',
        'partial',
        'foreign-manifest',
        'foreign-receipt',
        'duplicate',
        'applying',
        'changed',
        'substitution',
        'receipt-mutation',
      ] as const) {
        let calls = 0;
        f.session.readPlanApplicationHistory = async (...request) => {
          const result = structuredClone(await read.apply(f.session, request));
          calls++;
          if (mode === 'absent') result.matches = [];
          if (mode === 'partial') result.incompleteArchives = 1;
          if (mode === 'foreign-manifest') result.matches[0].manifestSha256 = 'a'.repeat(64);
          if (mode === 'foreign-receipt') result.receiptSha256 = 'a'.repeat(64);
          if (mode === 'duplicate') result.matches.push(structuredClone(result.matches[0]));
          if (mode === 'applying') result.matches[0].state = 'applying';
          if (mode === 'changed' && calls > 2) result.matches[0].archiveSha256 = 'a'.repeat(64);
          if (mode === 'substitution') f.session.readPlanApplicationHistory = read;
          if (mode === 'receipt-mutation') request[0].planSha256 = 'a'.repeat(64);
          return result;
        };
        await expect(f.run()).rejects.toThrow();
        expect(f.state.applies).toBe(2);
        expect(canonicalSha256(await f.store.read(completionName))).toBe(completion);
        f.session.readPlanApplicationHistory = read;
      }
      f.session.readPlanApplicationHistory = undefined;
      await expect(f.run()).rejects.toThrow('native current and historical receipt readers required');
      expect(f.state.applies).toBe(2);
      f.session.readPlanApplicationHistory = read;
    }),
  300000,
);

test(
  'initial owning final-refresh reply loss before any final publication reuses the exact native receipt on resume',
  () =>
    owned(async () => {
      const f = await nativeFixture(),
        plan = f.session.plan;
      let lost: PlanReceipt | undefined;
      f.session.plan = async (...args) => {
        const receipt = await plan.apply(f.session, args);
        if (receipt.noChanges && receipt.refreshOriginSha256) {
          lost = structuredClone(receipt);
          throw Error('initial final-refresh reply lost after native journal publication');
        }
        return receipt;
      };
      await expect(f.run()).rejects.toThrow('initial final-refresh reply lost');
      f.session.plan = plan;
      if (!lost) throw Error('actual owning initial native final receipt required');
      const finalName = `${f.input.plan.planId}-terraform-replacement-final-plan.json`,
        completionName = `${f.input.plan.planId}-terraform-network-replacement-complete.json`;
      await expect(f.store.read(finalName)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(f.store.read(completionName)).rejects.toMatchObject({ code: 'ENOENT' });
      const applies = f.state.applies,
        counter = f.state.counter,
        nativePlans = f.commands.filter((command) => command === 'plan').length;
      expect((await f.runner.readCurrentPlanJournal(lost.configurationSha256)).receipt).toEqual(lost);
      expect((await f.run()).status).toBe('complete');
      expect(await f.store.read(finalName)).toEqual(lost);
      expect(f.state.applies).toBe(applies);
      expect(f.state.counter).toBe(counter);
      expect(f.commands.filter((command) => command === 'plan')).toHaveLength(nativePlans);
      expect((await f.runner.readPlanApplicationHistory(lost)).matches.length).toBeGreaterThan(0);
      expect((await f.store.read(completionName)) as unknown).toBeDefined();
    }),
  300000,
);

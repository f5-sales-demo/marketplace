import { afterEach, expect, test } from 'bun:test';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { releaseAzureTerraformNetworkCancelledPowerStage } from '../../src/ce/terraform-network-power-cancelled-release';
import { AzureTerraformPowerLifecycleInterrupted } from '../../src/ce/terraform-network-power-lifecycle';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkPowerCancellationFixture } from './terraform-network-power-cancellation-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(operation: 'deallocate' | 'start' = 'deallocate', existing = true, ha = false, node = 1) {
  const f = await terraformNetworkPowerCancellationFixture(ha, node, operation, true, existing);
  await f.runCancellation();
  const state = {
    planCount: 0,
    losePlanResponseAt: 0,
    loseWrite: '',
    beforeWrite: false,
    planReplies: [] as string[],
    planGate: undefined as Promise<void> | undefined,
    planStarted: undefined as (() => void) | undefined,
    ignorePlanSignal: false,
  };
  const open = f.cancellationTerraform.open;
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args),
      runner = await f.resumeSelectedRunner();
    session.plan = async (...args) => {
      await f.store.verify();
      state.planStarted?.();
      if (state.planGate) await state.planGate;
      const receipt = await runner.plan(args[0], state.ignorePlanSignal ? undefined : args[1]);
      state.planReplies.push(receipt.planSha256);
      if (++state.planCount === state.losePlanResponseAt) throw Error('synthetic actual saved plan response lost');
      return receipt;
    };
    session.apply = async (...args) => {
      await f.store.verify();
      return runner.apply(...args);
    };
    session.readAppliedResourceFields = async (...args) => {
      await f.store.verify();
      return runner.readAppliedResourceFields(...args);
    };
    session.reconcileApplyFromEvidence = async (...args) => {
      await f.store.verify();
      return runner.reconcileApplyFromEvidence(...args);
    };
    return session;
  };
  const write = f.store.write;
  f.store.write = async (...args) => {
    const lose =
      args[0].startsWith('azure-power-state-release-') && args[0].endsWith(state.loseWrite) && state.loseWrite !== '';
    if (lose && state.beforeWrite) {
      state.loseWrite = '';
      throw Error('synthetic release packet response lost');
    }
    await write.call(f.store, ...args);
    if (lose) {
      state.loseWrite = '';
      throw Error('synthetic release packet response lost');
    }
  };
  const environment: Record<string, string | undefined> = {};
  const run = (signal?: AbortSignal) =>
    releaseAzureTerraformNetworkCancelledPowerStage(
      f.plan,
      node,
      operation,
      f.cancellationTerraform,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      f.api,
      environment,
      signal,
    );
  const packetName = async (suffix: string) => {
    const name = (await readdir(f.store.directory)).find(
      (name) => name.startsWith('azure-power-state-release-') && name.endsWith(suffix),
    );
    if (!name) throw Error(`selected release ${suffix} packet missing`);
    return name;
  };
  return { ...f, driverState: f.state, state, environment, runRelease: run, releasePacketName: packetName };
}
for (const operation of ['deallocate', 'start'] as const)
  for (const existing of [false, true])
    test(`actual cancelled ${operation} ${existing ? 'existing selected no-op' : 'create'} uses state-only release, ordinary final and stable VM identity`, async () => {
      const f = await fixture(operation, existing),
        baseline = await f.api.exec('az', ['vm', 'show', '--ids', f.before.nodes['1'].resourceId]);
      const result = await f.runRelease();
      expect(result.scope).toBe('selected-cancelled-network-power-state-release');
      expect(result.selectedReleaseOutcomeQualified).toBe(true);
      expect(result.finalOrdinarySelectedAbsenceQualified).toBe(true);
      expect(result.wholeAppliedStateEmptyQualified).toBe(false);
      expect(result.independentCleanupQualified).toBe(false);
      expect(result.runnerRetirementQualified).toBe(false);
      expect(result.parentRetirementQualified).toBe(false);
      expect(f.state.planCount).toBe(existing ? 2 : 1);
      expect(f.commands.filter((value) => value === 'apply')).toHaveLength(existing ? 1 : 0);
      expect(f.vmPowerActions).toEqual([]);
      expect(f.appliedState.control).toBeNull();
      expect(await f.api.exec('az', ['vm', 'show', '--ids', f.before.nodes['1'].resourceId])).toEqual(baseline);
      const commands = [...f.commands],
        count = f.state.planCount;
      expect(await f.runRelease()).toEqual(result);
      expect(f.commands.filter((value) => value === 'apply')).toEqual(commands.filter((value) => value === 'apply'));
      expect(f.state.planCount).toBe(count);
      expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
    }, 60000);

test('original create prior null rejects a later matching selected control before apply', async () => {
  const f = await fixture('deallocate', false);
  f.appliedState.control = JSON.parse(f.selectedDeployment.configuration).resource.azapi_resource_action.ce_network;
  await expect(f.runRelease()).rejects.toThrow('release prior differs from original cancelled prior');
  expect(f.commands).not.toContain('apply');
  expect(f.vmPowerActions).toEqual([]);
}, 60000);

for (const phase of ['release', 'final'] as const)
  test(`lost actual ${phase} saved-plan response recovers exact bytes without another plan or VM action`, async () => {
    const f = await fixture();
    f.state.losePlanResponseAt = phase === 'release' ? 1 : 2;
    await expect(f.runRelease()).rejects.toThrow('saved plan response lost');
    const saved = JSON.parse(await readFile(join(f.directory, 'plan-receipt.json'), 'utf8'));
    expect(saved.state).toBe('planned');
    await f.runRelease();
    const packet = (await f.store.read(
      await f.releasePacketName(phase === 'release' ? '-plan.json' : '-final.json'),
    )) as { receipt: { planSha256: string } };
    expect(packet.receipt.planSha256).toBe(saved.receipt.planSha256);
    expect(f.state.planCount).toBe(2);
    expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
    expect(f.vmPowerActions).toEqual([]);
  }, 60000);

for (const suffix of [
  '-authorization.json',
  '-plan.json',
  '-submission.json',
  '-outcome.json',
  '-complete.json',
  '-finalizing.json',
  '-final.json',
])
  for (const beforeWrite of [false, true])
    test(`${beforeWrite ? 'before' : 'after'} ${suffix} publication loss resumes exact authorized release without replay`, async () => {
      const f = await fixture();
      f.state.loseWrite = suffix;
      f.state.beforeWrite = beforeWrite;
      await expect(f.runRelease()).rejects.toThrow('release packet response lost');
      const result = await f.runRelease();
      expect(result.selectedReleaseOutcomeQualified).toBe(true);
      expect(f.state.planCount).toBe(2);
      expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
      expect(f.vmPowerActions).toEqual([]);
    }, 60000);

test('actual apply response loss after effect authenticates selected outcome and reconciles without reapply', async () => {
  const f = await fixture();
  f.appliedState.loseApplyResponse = true;
  await expect(f.runRelease()).rejects.toThrow('response lost after effect');
  expect(JSON.parse(await readFile(join(f.directory, 'plan-receipt.json'), 'utf8')).state).toBe('applying');
  expect(f.appliedState.control).toBeNull();
  const result = await f.runRelease();
  expect(result.selectedReleaseOutcomeQualified).toBe(true);
  expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
  expect(f.vmPowerActions).toEqual([]);
}, 60000);

test('actual apply loss before effect stays unresolved while selected control remains and never reapplies', async () => {
  const f = await fixture();
  f.appliedState.loseApplyBeforeEffect = true;
  await expect(f.runRelease()).rejects.toThrow('response lost before effect');
  expect(JSON.parse(await readFile(join(f.directory, 'plan-receipt.json'), 'utf8')).state).toBe('applying');
  f.appliedState.loseApplyBeforeEffect = false;
  await expect(f.runRelease()).rejects.toThrow('selected release outcome unavailable');
  expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
  expect(f.appliedState.control).not.toBeNull();
  expect(f.vmPowerActions).toEqual([]);
}, 60000);

for (const suffix of [
  '-authorization.json',
  '-plan.json',
  '-submission.json',
  '-outcome.json',
  '-complete.json',
  '-finalizing.json',
  '-final.json',
])
  test(`foreign ${suffix} schema cannot grant state release or retirement on retry`, async () => {
    const f = await fixture();
    await f.runRelease();
    const name = await f.releasePacketName(suffix),
      packet = (await f.store.read(name)) as Record<string, unknown>;
    await f.store.write(name, { ...packet, foreign: true });
    await expect(f.runRelease()).rejects.toThrow();
    expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
    expect(f.state.planCount).toBe(2);
    expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
  }, 60000);

for (const ignoreSignal of [false, true])
  test(`aborted actual saved release plan ${ignoreSignal ? 'fulfillment' : 'rejection'} retains both owning locks until settlement`, async () => {
    const f = await fixture(),
      controller = new AbortController(),
      started = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>();
    f.state.planGate = gate.promise;
    f.state.planStarted = () => started.resolve();
    f.state.ignorePlanSignal = ignoreSignal;
    const attempt = f.runRelease(controller.signal).catch((error: unknown) => error);
    await started.promise;
    controller.abort(Error('synthetic owned release interruption'));
    const caught = await attempt;
    expect(caught).toBeInstanceOf(AzureTerraformPowerLifecycleInterrupted);
    if (!(caught instanceof AzureTerraformPowerLifecycleInterrupted))
      throw Error('owning interruption contract missing');
    expect(await readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).toBeDefined();
    expect(await readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).toBeDefined();
    await expect(f.runRelease()).rejects.toThrow();
    gate.resolve();
    const settled = await caught.completion;
    expect(settled.locksReleased).toBe(true);
    expect(settled.mutationSettlements).toEqual([ignoreSignal ? 'fulfilled' : 'rejected']);
    expect(
      (await readdir(f.store.directory)).filter(
        (name) => name.startsWith('azure-power-state-release-') && name.endsWith('-plan.json'),
      ),
    ).toEqual([]);
    f.state.planGate = undefined;
    f.state.planStarted = undefined;
    f.state.ignorePlanSignal = false;
    const result = await f.runRelease();
    expect(result.selectedReleaseOutcomeQualified).toBe(true);
    expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
    expect(f.vmPowerActions).toEqual([]);
  }, 60000);

test('actual saved release receipt without its original authorization cannot initiate release or replan', async () => {
  const f = await fixture();
  f.state.losePlanResponseAt = 1;
  await expect(f.runRelease()).rejects.toThrow('saved plan response lost');
  await rm(join(f.store.directory, await f.releasePacketName('-authorization.json')));
  const commands = [...f.commands];
  await expect(f.runRelease()).rejects.toThrow();
  expect(f.commands.filter((value) => value === 'plan')).toEqual(commands.filter((value) => value === 'plan'));
  expect(f.commands).not.toContain('apply');
}, 60000);

test('cloud service loss after submitted response loss never reconciles selected release from generic absence', async () => {
  const f = await fixture();
  f.appliedState.loseApplyResponse = true;
  await expect(f.runRelease()).rejects.toThrow('response lost after effect');
  f.driverState.cloudUnavailable = true;
  await expect(f.runRelease()).rejects.toThrow();
  expect(JSON.parse(await readFile(join(f.directory, 'plan-receipt.json'), 'utf8')).state).toBe('applying');
  expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
}, 60000);

for (const operation of ['deallocate', 'start'] as const)
  test(`actual three-node HA selected third-node ${operation} cancellation release preserves independent VM and NIC identities`, async () => {
    const f = await fixture(operation, true, true, 3);
    const result = await f.runRelease();
    expect(result.node).toBe(3);
    expect(result.operation).toBe(operation);
    expect(result.selectedReleaseOutcomeQualified).toBe(true);
    expect(result.wholeAppliedStateEmptyQualified).toBe(false);
    expect(result.runnerRetirementQualified).toBe(false);
    expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
    expect(f.vmPowerActions).toEqual([]);
  }, 60000);

for (const target of ['request', 'site', 'owner', 'environment'])
  test(`cross-read ${target} changes reject release before planning or apply`, async () => {
    const f = await fixture(),
      read = f.store.read;
    let changed = false;
    f.store.read = async (...args) => {
      const result = await read.call(f.store, ...args);
      if (!changed && args[0].startsWith('azure-power-cancel-')) {
        changed = true;
        if (target === 'request') f.plan.planId = 'foreign';
        else if (target === 'site') f.site.siteUid = 'foreign';
        else if (target === 'owner') f.store.owner.account = 'example-foreign';
        else f.environment.FOREIGN = 'synthetic';
      }
      return result;
    };
    await expect(f.runRelease()).rejects.toThrow();
    expect(changed).toBe(true);
    expect(f.state.planCount).toBe(0);
    expect(f.commands).not.toContain('apply');
  }, 60000);

for (const defect of ['original-scope', 'original-status', 'current-scope', 'packet-provenance-schema'])
  test(`malformed owning ${defect} cannot authorize selected release`, async () => {
    const f = await fixture();
    if (defect === 'packet-provenance-schema') {
      const name = await f.packetName();
      if (!name) throw Error('original cancellation packet missing');
      const packet = (await f.store.read(name)) as Record<string, unknown>;
      packet.provenance = { ...(packet.provenance as Record<string, unknown>), foreign: true };
      await f.store.write(name, packet);
    } else {
      const open = f.cancellationTerraform.open;
      f.cancellationTerraform.open = async (...args) => {
        const session = await open(...args);
        if (defect === 'current-scope') {
          const read = session.readCancelledPlanContinuation;
          if (!read) throw Error('current continuation unavailable');
          session.readCancelledPlanContinuation = async (...args) => {
            const value = await read.call(session, ...args);
            return { ...value, scope: 'foreign' } as unknown as typeof value;
          };
        } else {
          const read = session.readUnsubmittedPlanCancellation;
          if (!read) throw Error('original cancellation unavailable');
          session.readUnsubmittedPlanCancellation = async (...args) => {
            const value = await read.call(session, ...args);
            return {
              ...value,
              ...(defect === 'original-scope' ? { scope: 'foreign' } : { status: 'pending' }),
            } as unknown as typeof value;
          };
        }
        return session;
      };
    }
    await expect(f.runRelease()).rejects.toThrow();
    expect(f.commands).not.toContain('apply');
    expect(f.vmPowerActions).toEqual([]);
  }, 60000);

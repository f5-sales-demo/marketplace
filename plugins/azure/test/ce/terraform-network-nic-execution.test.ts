import { expect } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { test } from './owned-fixture-test';
import { nicExecutionFixture as executionFixture } from './terraform-network-nic-execution-fixture';

for (const [node, move, ha] of [
  [1, true, false],
  [1, true, true],
  [2, true, true],
  [3, true, true],
  [1, false, true],
] as const)
  test(`owning NIC executor handles selected node ${node}, move ${move}, HA ${ha} with exact final refresh plans`, async () => {
    const f = await executionFixture(node, move, ha);
    const result = await f.run();
    expect(result.status).toBe('nic-stage-complete');
    expect(result.vmId).toBe(f.before.nodes[String(node)].vmId);
    expect(f.calls.filter((call) => call === 'apply').length).toBe(move ? 1 : 0);
    await f.run();
    expect(f.calls.filter((call) => call === 'apply').length).toBe(move ? 1 : 0);
    expect(f.mutations()).toBe(0);
  });

for (const loss of ['apply-before', 'apply-after'] as const)
  test(`owning NIC executor ${loss} never replays a submitted mutation`, async () => {
    const f = await executionFixture();
    f.state.loss = loss;
    if (loss === 'apply-before') {
      await expect(f.run()).rejects.toThrow();
      await expect(f.run()).rejects.toThrow();
    } else {
      await f.run();
      expect(f.calls).toContain('reconcile');
    }
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
  });

for (const mode of [
  'wrong-projection',
  'foreign-uuid',
  'changed-after-plan',
  'running-power',
  'unavailable-cloud',
  'wrong-configuration',
  'foreign-store',
  'wrong-prefix',
  'pre-aborted',
] as const)
  test(`owning NIC executor rejects ${mode} before application`, async () => {
    const f = await executionFixture();
    if (mode === 'wrong-projection') f.state.wrongProjection = true;
    if (mode === 'foreign-uuid') f.state.foreignUuid = true;
    if (mode === 'changed-after-plan') f.state.changedAfterPlan = true;
    if (mode === 'running-power') f.state.power = 'VM running';
    if (mode === 'unavailable-cloud') f.state.cloudUnavailable = true;
    if (mode === 'wrong-configuration') f.state.configuration = '{}';
    if (mode === 'foreign-store') f.store.owner.account = 'example-foreign';
    if (mode === 'wrong-prefix') f.appliedNics.push('1:1');
    await expect(f.run(mode === 'pre-aborted' ? AbortSignal.abort() : undefined)).rejects.toThrow();
    expect(f.calls).not.toContain('apply');
  });

test('owning NIC executor rejects apply acknowledgement without observed subnet convergence', async () => {
  const f = await executionFixture();
  f.state.noEffect = true;
  await expect(f.run()).rejects.toThrow();
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

for (const boundary of [
  'prepared',
  'mutation-plan',
  'nic-binding',
  'mutation-outcome',
  'mutation-complete',
  'final-plan',
  'current-no-change-plan',
] as const)
  test(`owning NIC executor recovers lost ${boundary} publication without duplicate mutation`, async () => {
    const f = await executionFixture(),
      write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (loss && name.endsWith(`-${boundary}.json`)) {
        loss = false;
        throw Error('synthetic checkpoint loss');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow();
    await f.run();
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
  });

test('owning NIC executor recovers a completed revision whose response was lost', async () => {
  const f = await executionFixture();
  f.state.loss = 'revision-after';
  await expect(f.run()).rejects.toThrow();
  await f.run();
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

for (const mode of ['missing-binding', 'foreign-completion', 'foreign-final', 'foreign-prepared'] as const)
  test(`owning NIC executor rejects ${mode} durable history after completion`, async () => {
    const f = await executionFixture();
    await f.run();
    const read = f.store.read.bind(f.store);
    f.store.read = async (name) => {
      if (mode === 'missing-binding' && name.endsWith('-nic-binding.json'))
        throw Object.assign(Error('missing'), { code: 'ENOENT' });
      const value = (await read(name)) as Record<string, unknown>;
      if (mode === 'foreign-completion' && name.endsWith('-mutation-complete.json'))
        (value.outcome as Record<string, unknown>).vmId = 'foreign';
      if (mode === 'foreign-final' && name.endsWith('-final-plan.json'))
        (value.receipt as PlanReceipt).providerLockSha256 = 'f'.repeat(64);
      if (mode === 'foreign-prepared' && name.endsWith('-prepared.json')) value.inventorySha256 = 'f'.repeat(64);
      return value;
    };
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
  });

test('owning NIC executor bounds ignored cloud cancellation without application', async () => {
  const f = await executionFixture();
  f.api.exec = async () => new Promise<never>(() => {});
  await expect(f.run(AbortSignal.timeout(20))).rejects.toThrow();
  expect(f.calls).not.toContain('apply');
});

test('two-NIC interrupted apply permits only selected before/target boundaries and reconciles full convergence without replay', async () => {
  const f = await executionFixture(1, true, true, true);
  f.state.loss = 'apply-partial';
  await expect(f.run()).rejects.toThrow();
  expect((f.config(f.firstNic).subnet as Record<string, unknown>).id).toBe(
    f.before.nodes['1'].nics['0'].targetSubnetId,
  );
  expect((f.config(f.sliNic).subnet as Record<string, unknown>).id).toBe(f.before.nodes['1'].nics['1'].subnetId);
  await expect(f.run()).rejects.toThrow();
  f.config(f.sliNic).subnet = { id: f.before.nodes['1'].nics['1'].targetSubnetId };
  f.config(f.sliNic).privateIPAddress = '10.20.2.5';
  await f.run();
  expect(f.calls).toContain('reconcile');
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

test('partial selected update rejects an unrelated node subnet change while preserving submitted history', async () => {
  const f = await executionFixture(1, true, true, true);
  f.state.loss = 'apply-partial';
  await expect(f.run()).rejects.toThrow();
  const foreign = [...f.nics.values()].find((row) => String(row.id).endsWith('-2-nic1'));
  if (!foreign) throw Error('missing fixture foreign NIC');
  f.config(foreign).subnet = { id: f.target };
  f.config(foreign).privateIPAddress = '10.20.2.6';
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

test('original final plan remains immutable while repeated execution retains a distinct current refresh plan', async () => {
  const f = await executionFixture();
  await f.run();
  const prefix = `${f.plan.planId}-terraform-network-node-1`;
  const original = await f.store.read(`${prefix}-final-plan.json`);
  await f.run();
  expect(await f.store.read(`${prefix}-final-plan.json`)).toEqual(original);
  const current = (await f.store.read(`${prefix}-current-no-change-plan.json`)) as Record<string, unknown>;
  expect((current.receipt as PlanReceipt).planSha256).not.toBe(
    ((original as Record<string, unknown>).receipt as PlanReceipt).planSha256,
  );
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

test('target subnet evidence cannot replace authoritative submitted runner state', async () => {
  const f = await executionFixture(),
    read = f.session.readPlanApplicationState.bind(f.session);
  f.session.readPlanApplicationState = async (receipt) => {
    const state = await read(receipt);
    return state === 'applied' ? 'planned' : state;
  };
  await expect(f.run()).rejects.toThrow();
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

test('cancellation after apply preserves outcome and resumes without a second submission', async () => {
  const f = await executionFixture(),
    apply = f.session.apply.bind(f.session),
    controller = new AbortController();
  f.session.apply = async (...args) => {
    await apply(...args);
    controller.abort();
  };
  await expect(f.run(controller.signal)).rejects.toThrow();
  await f.run();
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

for (const mode of ['foreign-mac', 'foreign-owner', 'unknown-power', 'stopped-power', 'changed-attachment'] as const)
  test(`owning NIC executor rejects ${mode} current identity/power before apply`, async () => {
    const f = await executionFixture();
    if (mode === 'foreign-mac') f.sliNic.macAddress = '02:00:00:00:ff:ff';
    if (mode === 'foreign-owner') (f.sliNic.tags as Record<string, unknown>)['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'unknown-power') f.state.power = 'Succeeded';
    if (mode === 'stopped-power') f.state.power = 'VM stopped';
    if (mode === 'changed-attachment') f.vms[0].networkProfile.networkInterfaces.pop();
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).not.toContain('apply');
  });

test('missing prepared no-op history after completion must not be reconstructed from current configuration', async () => {
  const f = await executionFixture(1, false, true, false, true);
  await f.run();
  await f.store.remove(`${f.plan.planId}-terraform-network-node-1-prepared.json`);
  await expect(f.run()).rejects.toThrow();
  expect(f.calls).not.toContain('apply');
});

test('final refresh changes remain a failed criterion and cannot cause a second NIC apply', async () => {
  const f = await executionFixture(),
    plan = f.session.plan.bind(f.session);
  let counter = 0;
  f.session.plan = async (...args) => {
    const receipt = await plan(...args);
    if (++counter > 1) {
      receipt.noChanges = false;
      receipt.changes[1].actions = ['update'];
    }
    return receipt;
  };
  await expect(f.run()).rejects.toThrow();
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
});

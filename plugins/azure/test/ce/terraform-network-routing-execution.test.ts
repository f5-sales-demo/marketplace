import { afterEach, expect, test } from 'bun:test';
import { rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { routingExecutionFixture, routingExecutionRoots } from './terraform-network-routing-execution-fixture';

afterEach(async () => {
  for (const root of routingExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
for (const mode of ['udr', 'route-server'] as const)
  for (const node of [1, 2, 3])
    for (const changed of [false, true])
      test(`${mode} node ${node} changed ${changed} executes only dependent routing and restores references`, async () => {
        const f = await routingExecutionFixture(mode, node, changed),
          result = await f.run();
        expect(result.status).toBe('routing-stage-complete');
        expect(f.state.configuration).toBe(f.stage.releasedConfiguration);
        expect(result.configurationSha256).toBe(f.stage.releasedConfigurationSha256);
        expect(f.calls.filter((call) => call === 'apply')).toHaveLength(
          changed && (mode === 'route-server' || node === 1) ? 1 : 0,
        );
        expect(f.mutations()).toBe(0);
        expect(result.forwarding).toBe('unknown');
        expect(result.freshness).toBe('unqualified');
        const terminal = (await f.store.read(`${f.prefix}-final-plan.json`)) as { receipt: { noChanges: boolean } };
        expect(terminal.receipt.noChanges).toBe(true);
        const applied = f.calls.filter((call) => call === 'apply').length;
        const saved = canonicalSha256(terminal),
          second = await f.run();
        expect(second.status).toBe('routing-stage-complete');
        expect(f.calls.filter((call) => call === 'apply')).toHaveLength(applied);
        expect(canonicalSha256(await f.store.read(`${f.prefix}-final-plan.json`))).toBe(saved);
      });
for (const mode of ['udr', 'route-server'] as const)
  for (const loss of [
    'revision-after',
    'plan-after',
    'submission-before',
    'apply-after',
    'write-prepared.json',
    'write-mutation-plan.json',
    'write-mutation-binding.json',
    'write-mutation-outcome.json',
    'write-mutation-complete.json',
    'write-release-plan.json',
    'write-release-binding.json',
    'write-release-complete.json',
    'write-final-plan.json',
    'write-current-no-change-plan.json',
  ])
    test(`${mode} resumes exact ${loss} durable boundary`, async () => {
      const f = await routingExecutionFixture(mode);
      f.state.loss = loss;
      try {
        await f.run();
      } catch {}
      const result = await f.run();
      expect(result.status).toBe('routing-stage-complete');
      expect(f.state.configuration).toBe(f.stage.releasedConfiguration);
      expect(f.calls.filter((call) => call === 'apply')).toHaveLength(loss === 'submission-before' ? 2 : 1);
      expect(f.state.loss).toBe('');
      expect(f.mutations()).toBe(0);
    });
for (const mode of ['udr', 'route-server'] as const)
  test(`${mode} submitted acknowledgement without effect stays incomplete and resumes without resubmission`, async () => {
    const f = await routingExecutionFixture(mode);
    f.state.loss = 'apply-before';
    await expect(f.run()).rejects.toThrow('not converged');
    await expect(f.store.read(`${f.prefix}-mutation-complete.json`)).rejects.toThrow();
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
    f.completeEffect();
    expect((await f.run()).status).toBe('routing-stage-complete');
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
    expect(f.calls.filter((call) => call === 'reconcile')).toHaveLength(1);
  });
test('mixed partial UDR effect requires complete current outcome before reconciliation', async () => {
  const f = await routingExecutionFixture();
  f.state.loss = 'apply-partial';
  await expect(f.run()).rejects.toThrow('not converged');
  expect(f.calls.filter((call) => call === 'reconcile')).toHaveLength(0);
  f.completeEffect();
  expect((await f.run()).status).toBe('routing-stage-complete');
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
  expect(f.calls.filter((call) => call === 'reconcile')).toHaveLength(1);
});
for (const label of [
  'wrongProjection',
  'extraMutation',
  'wrongLock',
  'foreignOwnerAfterPlan',
  'privateReadFailed',
  'unknownApplication',
] as const)
  test(`routing execution rejects ${label} before apply`, async () => {
    const f = await routingExecutionFixture();
    f.state[label] = true;
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(0);
  });
for (const label of ['foreignParent', 'unavailable', 'stoppedNode', 'wrongNic', 'wrongPrivateRevision'])
  test(`routing execution rejects ${label} current baseline`, async () => {
    const f = await routingExecutionFixture();
    if (label === 'foreignParent')
      for (const parent of f.parents.values())
        (parent.tags as Record<string, unknown>)['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (label === 'unavailable') f.state.unavailable = true;
    if (label === 'stoppedNode') f.state.power = 'VM deallocated';
    if (label === 'wrongNic') f.config(f.sliNic).privateIPAddress = '10.20.2.88';
    if (label === 'wrongPrivateRevision') f.state.configuration = '{}';
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(0);
  });

test('reconciliation acknowledgement must advance the owning journal to applied before completion', async () => {
  const f = await routingExecutionFixture();
  f.state.loss = 'apply-after';
  f.session.reconcileApplyFromEvidence = async () => {};
  await expect(f.run()).rejects.toThrow('reconciliation did not establish applied state');
  await expect(f.store.read(`${f.prefix}-mutation-complete.json`)).rejects.toThrow();
});
test('final no-change plan cannot be submitted during its private projection', async () => {
  const f = await routingExecutionFixture(),
    original = f.session.readProposedResourcePaths;
  if (!original) throw Error('missing synthetic private reader');
  f.session.readProposedResourcePaths = async (receipt, selections, env, signal) => {
    const result = await original(receipt, selections, env, signal);
    if (f.calls.filter((call) => call === 'plan').length === 3) {
      const journal = f.journals.get(receipt.planSha256);
      if (!journal) throw Error('missing synthetic journal');
      journal.state = 'applying';
    }
    return result;
  };
  await expect(f.run()).rejects.toThrow('final no-change plan is no longer unsubmitted');
  await expect(f.store.read(`${f.prefix}-final-plan.json`)).rejects.toThrow();
});

for (const mode of ['udr', 'route-server'] as const)
  test(`${mode} lost outcome response preserves original immutable observation on resume`, async () => {
    const f = await routingExecutionFixture(mode);
    f.state.loss = 'write-mutation-outcome.json';
    await expect(f.run()).rejects.toThrow('durable write response lost');
    const original = await f.store.read(`${f.prefix}-mutation-outcome.json`),
      digest = canonicalSha256(original);
    expect((await f.run()).status).toBe('routing-stage-complete');
    expect(canonicalSha256(await f.store.read(`${f.prefix}-mutation-outcome.json`))).toBe(digest);
    const completion = (await f.store.read(`${f.prefix}-mutation-complete.json`)) as { outcome: unknown };
    expect(canonicalSha256(completion.outcome)).toBe(digest);
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
  });
for (const suffix of [
  'prepared',
  'mutation-plan',
  'mutation-binding',
  'mutation-outcome',
  'mutation-complete',
  'release-plan',
  'release-binding',
  'release-outcome',
  'release-complete',
  'final-plan',
])
  test(`later publication cannot reconstruct deleted ${suffix} prerequisite`, async () => {
    const f = await routingExecutionFixture();
    await f.run();
    await unlink(join(f.store.directory, `${f.prefix}-${suffix}.json`));
    const applies = f.calls.filter((call) => call === 'apply').length;
    await expect(f.run()).rejects.toThrow('history missing');
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(applies);
  });
function mutatePath(value: unknown, path: string[], next: unknown) {
  let row = value as Record<string, unknown>;
  for (const key of path.slice(0, -1)) row = row[key] as Record<string, unknown>;
  row[path.at(-1) as string] = next;
}
for (const [suffix, path, value] of [
  ['mutation-outcome', ['schemaVersion'], 2],
  ['mutation-complete', ['receiptSha256'], 'f'.repeat(64)],
  ['mutation-complete', ['outcome', 'routing', 'collectedAt'], '2000-01-01T00:00:00Z'],
  ['final-plan', ['schemaVersion'], 2],
  ['final-plan', ['cloud', 'routing', 'node'], 3],
  ['final-plan', ['cloud', 'routing', 'rows', '0', 'parentId'], 'foreign'],
  ['final-plan', ['cloud', 'routing', 'rows', '0', 'installedIp'], '10.20.2.88'],
  ['final-plan', ['cloud', 'routing', 'freshness'], 'verified'],
  ['final-plan', ['cloud', 'power', 'vmId'], 'foreign'],
  ['final-plan', ['receipt', 'providerLockSha256'], 'f'.repeat(64)],
] as const)
  test(`rejects tampered ${suffix} ${path.join('.')} history`, async () => {
    const f = await routingExecutionFixture();
    await f.run();
    const packet = await f.store.read(`${f.prefix}-${suffix}.json`);
    mutatePath(packet, [...path], value);
    await f.store.write(`${f.prefix}-${suffix}.json`, packet);
    const applies = f.calls.filter((call) => call === 'apply').length;
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(applies);
  });
for (const changed of ['power', 'nic', 'owner'] as const)
  test(`cached completion still requires current ${changed} identity`, async () => {
    const f = await routingExecutionFixture();
    await f.run();
    if (changed === 'power') f.state.power = 'VM deallocated';
    if (changed === 'nic') f.config(f.sliNic).privateIPAddress = '10.20.2.88';
    if (changed === 'owner')
      for (const parent of f.parents.values())
        (parent.tags as Record<string, unknown>)['xcsh-plan-sha256'] = 'f'.repeat(64);
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((call) => call === 'apply')).toHaveLength(1);
  });
test('owning callback replacement during planning is rejected before replacement invocation', async () => {
  const f = await routingExecutionFixture(),
    original = f.session.plan;
  let invoked = 0;
  f.session.plan = async (...args) => {
    const receipt = await original(...args);
    f.session.apply = async () => {
      invoked++;
    };
    return receipt;
  };
  await expect(f.run()).rejects.toThrow('collaborator changed');
  expect(invoked).toBe(0);
});
test('exposed receipt mutation is rejected before submission', async () => {
  const f = await routingExecutionFixture(),
    original = f.session.readPlanApplicationState;
  f.session.readPlanApplicationState = async (receipt) => {
    const state = await original(receipt);
    receipt.deploymentId = 'foreign';
    return state;
  };
  await expect(f.run()).rejects.toThrow('input, storage or owning runner changed during binding');
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(0);
});
test('input mutation during an owning await is rejected before submission', async () => {
  const f = await routingExecutionFixture(),
    original = f.session.plan;
  f.session.plan = async (...args) => {
    const receipt = await original(...args);
    f.plan.region = 'foreign';
    return receipt;
  };
  await expect(f.run()).rejects.toThrow('collaborator changed');
  expect(f.calls.filter((call) => call === 'apply')).toHaveLength(0);
});
test('ignored-signal cloud cancellation releases execution lock and resumes', async () => {
  const f = await routingExecutionFixture(),
    original = f.api.exec;
  const entered = Promise.withResolvers<void>(),
    controller = new AbortController();
  f.api.exec = async () => {
    entered.resolve();
    return await new Promise(() => {});
  };
  const run = f.run(controller.signal);
  await entered.promise;
  controller.abort(Error('synthetic cancellation'));
  await expect(run).rejects.toThrow('synthetic cancellation');
  f.api.exec = original;
  expect((await f.run()).status).toBe('routing-stage-complete');
});

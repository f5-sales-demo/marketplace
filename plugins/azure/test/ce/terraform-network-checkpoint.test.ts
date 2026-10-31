import { afterEach, expect, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  type AzureTerraformNetworkAcceptanceIdentity,
  type AzureTerraformNetworkAcceptanceVerification,
  AzureTerraformNetworkCheckpoint,
} from '../../src/ce/terraform-network-checkpoint';
import { bindAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-source-binding';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';
import { networkStageHistoryFixture } from './terraform-network-stage-history-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = true, move = true) {
  const f = await networkStageHistoryFixture(1, move, ha, false);
  const original = await terraformNetworkSourceFixture(ha);
  // Retain the real original enrollment/site provenance; use the actual owning-stage source/cloud.
  for (const [name, value] of original.records) await f.store.write(name, value);
  const session = { ...f.session, readOutputs: async () => original.outputs };
  const bound = await bindAzureTerraformNetworkUpdateSource(
    f.plan,
    { open: async () => session },
    f.store,
    f.api,
    {},
    {
      loadSource: async (digest) => {
        const plan = original.sources.get(digest);
        if (!plan) throw Error('missing original plan');
        return plan;
      },
      loadOutcome: async (plan) => {
        const outcome = original.outcomes.get(plan.planSha256);
        if (!outcome) throw Error('missing original outcome');
        return outcome;
      },
    },
    original.site,
  );
  Object.assign(f.before, structuredClone(bound.binding.before));
  const checks: Array<{ identity: AzureTerraformNetworkAcceptanceIdentity; mode: string }> = [];
  const state = {
    scope: 'node-interfaces-routing-traffic',
    status: 'verified',
    rejectHistory: false,
    rejectCurrent: false,
    onCheck: undefined as undefined | ((mode: string) => Promise<void>),
  };
  const verifier = async (
    receipt: unknown,
    identity: AzureTerraformNetworkAcceptanceIdentity,
    mode: 'current' | 'historical',
  ) => {
    checks.push({ identity: structuredClone(identity), mode });
    await state.onCheck?.(mode);
    if (state.rejectCurrent && mode === 'current') throw Error('current publisher unavailable');
    if (state.rejectHistory && mode === 'historical') throw Error('historical publisher unavailable');
    expect(receipt).toEqual({ node: identity.node, evidence: 'synthetic-operational-receipt' });
    expect(identity.owner).toEqual(f.store.owner);
    expect(identity.siteUid).toBe(original.site.siteUid);
    return {
      status: state.status,
      scope: state.scope,
      evidenceSha256: canonicalSha256({ receipt, identity }),
    } as AzureTerraformNetworkAcceptanceVerification;
  };
  const open = (signal?: AbortSignal) =>
    AzureTerraformNetworkCheckpoint.open(f.plan, bound.binding, f.store, verifier, signal);
  const receipt = (node: number) => ({ node, evidence: 'synthetic-operational-receipt' });
  const name = `${f.plan.planId}-terraform-network-driver-checkpoint.json`;
  const advance = async (checkpoint: AzureTerraformNetworkCheckpoint, selected = f) => {
    let s = await checkpoint.read();
    await selected.power('deallocate');
    await copyPackets(selected);
    s = await checkpoint.recordStage(s.checkpointSha256, selected.node, 'deallocated');
    await selected.runNic();
    await copyPackets(selected);
    s = await checkpoint.recordStage(s.checkpointSha256, selected.node, 'nic-complete');
    await selected.power('start');
    await copyPackets(selected);
    s = await checkpoint.recordStage(s.checkpointSha256, selected.node, 'restarted');
    await selected.runRouting();
    await copyPackets(selected);
    return checkpoint.recordStage(s.checkpointSha256, selected.node, 'routing-complete');
  };
  const copyPackets = async (selected: typeof f) => {
    if (selected.store === f.store) return;
    expect(selected.plan.planSha256).toBe(f.plan.planSha256);
    for (const n of await readdir(selected.store.directory))
      if (n.startsWith(`${f.plan.planId}-terraform-network-node-${selected.node}-`))
        await f.store.write(n, await selected.store.read(n));
  };
  return { ...f, binding: bound.binding, open, receipt, checks, acceptanceState: state, name, advance, copyPackets };
}
for (const ha of [false, true])
  test(`checkpoint binds original ${ha ? 'HA' : 'single'} source, advances and reopens routing-complete history without replay`, async () => {
    const f = await fixture(ha);
    const cp = await f.open();
    const initial = await cp.read();
    expect(initial.phase).toBe('prepared');
    expect(initial.nodeSource).toBe(f.source);
    expect(initial.checkpoint.sourceBindingSha256).toBe(canonicalSha256(f.binding));
    const restarted = await f.advance(cp);
    expect(restarted.phase).toBe('routing-complete');
    const calls = [...f.calls],
      power = [...f.powerCalls];
    const accepted = await cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1));
    expect(accepted.phase).toBe('accepted');
    expect(accepted.allNodesAccepted).toBe(!ha);
    const replay = await (await f.open()).read();
    expect(replay).toEqual(accepted);
    expect(f.calls).toEqual(calls);
    expect(f.powerCalls).toEqual(power);
    expect(f.checks.some((c) => c.mode === 'current')).toBe(true);
    expect(f.mutations()).toBe(0);
  });
test('three nodes retain sequential private source and actual complete history with six identity-bound NICs', async () => {
  const f = await fixture();
  const cp = await f.open();
  let selected = f;
  for (let node = 1; node <= 3; node++) {
    const restarted = await f.advance(cp, selected);
    const accepted = await cp.acceptNode(restarted.checkpointSha256, node, f.receipt(node));
    expect(accepted.allNodesAccepted).toBe(node === 3);
    if (node < 3) {
      const nextSource = JSON.stringify(JSON.parse(selected.state.configuration));
      const next = await networkStageHistoryFixture(node + 1, true, true, false, nextSource);
      const completedHistory = restarted.checkpoint.nodes.at(-1)?.history;
      if (!completedHistory) throw Error('missing complete routing history');
      expect(next.before.nodes).toEqual(completedHistory.inventory.nodes);
      const prepared = await cp.prepareNextNode(accepted.checkpointSha256, next.before);
      expect(prepared.nodeSource).toBe(next.source);
      expect(prepared.currentNode).toBe(node + 1);
      const retry = await cp.prepareNextNode(accepted.checkpointSha256, next.before);
      expect(retry).toEqual(prepared);
      selected = { ...f, ...next };
    }
  }
  const final = await (await f.open()).read();
  expect(final.checkpoint.nodes.map((n) => n.phase)).toEqual(['accepted', 'accepted', 'accepted']);
  expect(final.checkpoint.revision).toBe(17);
}, 60000);
for (const mode of ['skip-stage', 'wrong-node', 'accept-before-restart', 'prepare-before-accept', 'unresolved-digest'])
  test(`serial checkpoint rejects ${mode}`, async () => {
    const f = await fixture(),
      cp = await f.open(),
      s = await cp.read();
    if (mode === 'skip-stage') await expect(cp.recordStage(s.checkpointSha256, 1, 'restarted')).rejects.toThrow();
    if (mode === 'wrong-node') await expect(cp.recordStage(s.checkpointSha256, 2, 'deallocated')).rejects.toThrow();
    if (mode === 'accept-before-restart')
      await expect(cp.acceptNode(s.checkpointSha256, 1, f.receipt(1))).rejects.toThrow();
    if (mode === 'prepare-before-accept')
      await expect(cp.prepareNextNode(s.checkpointSha256, f.before)).rejects.toThrow();
    if (mode === 'unresolved-digest')
      await expect(cp.recordStage('__CHECKPOINT__', 1, 'deallocated')).rejects.toThrow();
    expect(await cp.read()).toEqual(s);
  });
for (const mode of ['global-scope', 'unknown', 'degraded', 'historical-loss'])
  test(`operational ${mode} cannot qualify serial node advancement`, async () => {
    const f = await fixture(),
      cp = await f.open(),
      s = await f.advance(cp);
    if (mode === 'global-scope') f.acceptanceState.scope = 'site-global-and-registration-only';
    if (mode === 'unknown') f.acceptanceState.status = 'unknown';
    if (mode === 'degraded') f.acceptanceState.status = 'degraded';
    if (mode === 'historical-loss') f.acceptanceState.rejectHistory = true;
    await expect(cp.acceptNode(s.checkpointSha256, 1, f.receipt(1))).rejects.toThrow();
    expect((await cp.read()).phase).toBe('routing-complete');
  });
for (const afterWrite of [false, true])
  test(`lost stage checkpoint response ${afterWrite ? 'after' : 'before'} durable write resumes without replay`, async () => {
    const f = await fixture(),
      cp = await f.open(),
      s = await cp.read();
    await f.power('deallocate');
    const write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (name === f.name && loss) {
        loss = false;
        if (afterWrite) await write(name, value);
        throw Error('synthetic lost checkpoint response');
      }
      return write(name, value);
    };
    await expect(cp.recordStage(s.checkpointSha256, 1, 'deallocated')).rejects.toThrow();
    const power = [...f.powerCalls];
    const resumed = await cp.recordStage(s.checkpointSha256, 1, 'deallocated');
    expect(resumed.phase).toBe('deallocated');
    expect(await cp.recordStage(s.checkpointSha256, 1, 'deallocated')).toEqual(resumed);
    await expect(cp.recordStage(s.checkpointSha256, 1, 'nic-complete')).rejects.toThrow('stale');
    expect(f.powerCalls).toEqual(power);
  });
for (const item of ['root', 'checkpoint'])
  test(`lost initial ${item} publication response resumes before any cloud stage`, async () => {
    const f = await fixture();
    const write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      await write(name, value);
      if (loss && name.endsWith(`driver-${item}.json`)) {
        loss = false;
        throw Error('synthetic initial response loss');
      }
    };
    await expect(f.open()).rejects.toThrow('synthetic initial response loss');
    expect((await (await f.open()).read()).phase).toBe('prepared');
    expect(f.calls).toEqual([]);
  });
for (const mode of ['owner', 'engine', 'source', 'order', 'revision', 'history', 'transition', 'previous', 'extra'])
  test(`tampered checkpoint ${mode} rejects`, async () => {
    const f = await fixture(),
      cp = await f.open();
    await f.advance(cp);
    const row = (await cp.read()).checkpoint;
    if (mode === 'owner') row.owner.account = 'example-foreign';
    if (mode === 'engine') (row as unknown as { engine: string }).engine = 'native';
    if (mode === 'source') row.sourceBindingSha256 = 'b'.repeat(64);
    if (mode === 'order') row.nodes[0].node = 2;
    if (mode === 'revision') row.revision++;
    if (mode === 'history' && row.nodes[0].history) row.nodes[0].history.packetSha256ByName.foreign = 'b'.repeat(64);
    if (mode === 'transition' && row.lastTransition) row.lastTransition.payloadSha256 = 'b'.repeat(64);
    if (mode === 'previous') row.previousCheckpointSha256 = 'a'.repeat(64);
    if (mode === 'extra') (row as unknown as Record<string, unknown>).unverified = true;
    await f.store.write(f.name, row);
    await expect(cp.read()).rejects.toThrow();
  });
for (const item of ['root', 'checkpoint', 'source'])
  test(`missing ${item} cannot be recreated after stage publication`, async () => {
    const f = await fixture(),
      cp = await f.open();
    await f.advance(cp);
    const name =
      item === 'checkpoint'
        ? f.name
        : `${f.plan.planId}-terraform-network-${item === 'source' ? 'source' : 'driver-root'}.json`;
    await f.store.remove(name);
    await expect(f.open()).rejects.toThrow();
  });
test('changed original source and historical stage packet revoke checkpoint resume', async () => {
  const f = await fixture(),
    cp = await f.open();
  await f.advance(cp);
  const name = `${f.plan.planId}-terraform-network-node-1-start-final-plan.json`;
  const packet = await f.store.read(name);
  await f.store.write(name, {});
  await expect(cp.read()).rejects.toThrow();
  await f.store.write(name, packet);
  await f.store.write(`${f.plan.planId}-terraform-network-source.json`, { ...f.binding, source: '{}' });
  await expect(cp.read()).rejects.toThrow('binding differs');
});
test('cancellation before stage checkpoint reads cannot publish progress', async () => {
  const f = await fixture(),
    cp = await f.open(),
    s = await cp.read();
  const abort = new AbortController();
  abort.abort(Error('synthetic cancelled'));
  await expect(cp.recordStage(s.checkpointSha256, 1, 'deallocated', abort.signal)).rejects.toThrow(
    'synthetic cancelled',
  );
  expect(await cp.read()).toEqual(s);
});
test('cancelled operational qualification does not publish acceptance', async () => {
  const f = await fixture(),
    cp = await f.open(),
    restarted = await f.advance(cp);
  const abort = new AbortController();
  f.acceptanceState.onCheck = async (mode) => {
    if (mode === 'current') abort.abort(Error('synthetic acceptance cancellation'));
  };
  await expect(cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1), abort.signal)).rejects.toThrow(
    'synthetic acceptance cancellation',
  );
  expect((await cp.read()).phase).toBe('routing-complete');
});
for (const afterWrite of [false, true])
  test(`lost acceptance checkpoint response ${afterWrite ? 'after' : 'before'} pointer write reuses original current decision`, async () => {
    const f = await fixture(),
      cp = await f.open(),
      restarted = await f.advance(cp);
    const write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (loss && name === f.name) {
        loss = false;
        if (afterWrite) await write(name, value);
        throw Error('synthetic acceptance pointer loss');
      }
      return write(name, value);
    };
    await expect(cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1))).rejects.toThrow();
    const currentChecks = f.checks.filter((c) => c.mode === 'current').length;
    f.acceptanceState.rejectCurrent = true;
    const resumed = await cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1));
    expect(resumed.phase).toBe('accepted');
    expect(f.checks.filter((c) => c.mode === 'current')).toHaveLength(currentChecks);
    await expect(cp.acceptNode(restarted.checkpointSha256, 2, f.receipt(2))).rejects.toThrow('stale');
  });
for (const mode of ['missing', 'tampered', 'read-race'])
  test(`immutable revision ${mode} rejects without replay`, async () => {
    const f = await fixture(),
      cp = await f.open();
    await f.advance(cp);
    const name = `${f.plan.planId}-terraform-network-driver-revision-1.json`;
    if (mode === 'missing') await f.store.remove(name);
    if (mode === 'tampered') {
      const row = (await f.store.read(name)) as Record<string, unknown>;
      row.previousCheckpointSha256 = 'a'.repeat(64);
      await f.store.write(name, row);
    }
    if (mode === 'read-race') {
      const read = f.store.read.bind(f.store);
      let reads = 0;
      f.store.read = async (n) => {
        const value = await read(n);
        if (n === name && ++reads === 2) return { ...(value as object), unverified: true };
        return value;
      };
    }
    const calls = [...f.calls],
      power = [...f.powerCalls];
    await expect(cp.read()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
    expect(f.powerCalls).toEqual(power);
  });
test('concurrent checkpoint writers retain the live-process exclusion', async () => {
  const f = await fixture(),
    cp = await f.open(),
    initial = await cp.read();
  await f.power('deallocate');
  const read = f.store.read.bind(f.store);
  let entered!: () => void,
    resume!: () => void,
    held = false;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const resumedPromise = new Promise<void>((resolve) => {
    resume = resolve;
  });
  f.store.read = async (name) => {
    if (!held && name === f.name) {
      held = true;
      entered();
      await resumedPromise;
    }
    return read(name);
  };
  const first = cp.recordStage(initial.checkpointSha256, 1, 'deallocated');
  await enteredPromise;
  try {
    await expect(cp.recordStage(initial.checkpointSha256, 1, 'deallocated')).rejects.toThrow(
      'Operation lock is held by a live process',
    );
  } finally {
    resume();
  }
  expect((await first).phase).toBe('deallocated');
});
test('checkpoint change during qualification rejects publication', async () => {
  const f = await fixture(),
    cp = await f.open(),
    restarted = await f.advance(cp);
  f.acceptanceState.onCheck = async (mode) => {
    if (mode === 'current') await f.store.write(f.name, { ...restarted.checkpoint, unverified: true });
  };
  await expect(cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1))).rejects.toThrow(
    'changed before publication',
  );
});
test('single node completed acceptance cannot prepare an extra node', async () => {
  const f = await fixture(false),
    cp = await f.open(),
    restarted = await f.advance(cp);
  const accepted = await cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1));
  await expect(cp.prepareNextNode(accepted.checkpointSha256, f.before)).rejects.toThrow('next node');
});
test('changed completed-node dynamic IP is allowed while unsubmitted nodes stay exact', async () => {
  const f = await fixture(),
    cp = await f.open(),
    restarted = await f.advance(cp);
  const accepted = await cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1));
  const next = await networkStageHistoryFixture(2, true, true, false, f.state.configuration);
  next.before.nodes['1'].nics['1'].privateIp = '10.20.2.99';
  const prepared = await cp.prepareNextNode(accepted.checkpointSha256, next.before);
  expect(prepared.currentNode).toBe(2);
});
test('unapplied node address or retained MAC changes cannot prepare next node', async () => {
  const f = await fixture(),
    cp = await f.open(),
    s = await f.advance(cp);
  const accepted = await cp.acceptNode(s.checkpointSha256, 1, f.receipt(1));
  const next = await networkStageHistoryFixture(
    2,
    true,
    true,
    false,
    JSON.stringify(JSON.parse(f.state.configuration)),
  );
  for (const field of ['privateIp', 'mac'] as const) {
    const before = structuredClone(next.before);
    before.nodes['2'].nics['1'][field] = field === 'privateIp' ? '10.20.1.99' : '02:00:00:00:00:99';
    await expect(cp.prepareNextNode(accepted.checkpointSha256, before)).rejects.toThrow();
  }
});

test('single node no-op network stage still requires owning restart and full operational acceptance', async () => {
  const f = await fixture(false, false),
    cp = await f.open(),
    restarted = await f.advance(cp);
  const accepted = await cp.acceptNode(restarted.checkpointSha256, 1, f.receipt(1));
  expect(accepted.allNodesAccepted).toBe(true);
  expect(f.calls).not.toContain('apply');
  expect(f.powerCalls).toEqual(['deallocate:apply', 'deallocate:apply', 'start:apply', 'start:apply']);
});

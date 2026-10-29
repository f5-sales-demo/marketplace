import { afterEach, expect, test } from 'bun:test';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AzureTerraformNetworkAcceptanceIdentity } from '../../src/ce/terraform-network-checkpoint';
import {
  AzureTerraformPowerLifecycleInterrupted,
  type AzureTerraformPowerSettlement,
} from '../../src/ce/terraform-network-power-lifecycle';
import { terraformNetworkDriverFixture as fixture } from './terraform-network-driver-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});

for (const [ha, move] of [
  [false, true],
  [false, false],
  [true, true],
] as const)
  test(
    `serial owning driver completes ${ha ? 'three-node HA' : 'single'} move ${move} through actual executor histories and current final refresh`,
    async () => {
      const f = await fixture(ha, move),
        result = await f.run();
      expect(result.status).toBe('complete');
      expect(f.calls).toEqual(
        Array.from({ length: ha ? 3 : 1 }, (_, i) => [
          `${i + 1}:deallocate`,
          `${i + 1}:nic`,
          `${i + 1}:start`,
          `${i + 1}:routing`,
        ]).flat(),
      );
      for (let node = 1; node <= (ha ? 3 : 1); node++) {
        expect(f.observations).toContain(`${node}:preflight`);
        expect(f.observations).toContain(`${node}:restored`);
        expect(f.observations).toContain(`${node}:final`);
      }
      const final = (await f.store.read(`${f.plan.planId}-terraform-network-driver-current-final.json`)) as Record<
        string,
        unknown
      >;
      expect((final.receipt as { noChanges: boolean }).noChanges).toBe(true);
      const calls = [...f.calls];
      expect((await f.run()).status).toBe('complete');
      expect(f.calls).toEqual(calls);
      expect(f.mutations()).toBe(0);
    },
    ha ? 60000 : 5000,
  );
for (const purpose of ['preflight', 'restored', 'final'])
  test(`unavailable ${purpose} evidence remains pending and resumes without replay`, async () => {
    const f = await fixture();
    f.state.rejectPurpose = purpose;
    const pending = await f.run();
    expect(pending.status).toBe('operational-acceptance-pending');
    if (purpose === 'preflight') expect(f.calls).toEqual([]);
    else {
      expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
      expect(f.fixtures.get(1)?.state.power).toBe('VM running');
    }
    f.state.rejectPurpose = '';
    expect((await f.run()).status).toBe('complete');
    expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
  });
for (const setting of ['unknown', 'wrongScope'] as const)
  test(`${setting} cannot authorize first interruption`, async () => {
    const f = await fixture();
    f.state[setting] = true;
    expect((await f.run()).status).toBe('operational-acceptance-pending');
    expect(f.calls).toEqual([]);
  });
for (const stage of ['deallocate', 'nic', 'start', 'routing'])
  test(`lost completed ${stage} response validates history and current power without stage replay`, async () => {
    const f = await fixture();
    f.state.lostStage = stage;
    await expect(f.run()).rejects.toThrow('lost completed stage response');
    expect((await f.run()).status).toBe('complete');
    expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
  });
test('partial cloud/service failure cannot complete or continue mutations', async () => {
  const f = await fixture();
  f.state.rejectPurpose = 'restored';
  await f.run();
  const calls = [...f.calls];
  f.state.cloudUnavailable = true;
  await expect(f.run()).rejects.toThrow();
  expect(f.calls).toEqual(calls);
});
for (const setting of ['wrongConfig', 'wrongOutput'] as const)
  test(`changed ${setting} rejects before further serial execution`, async () => {
    const f = await fixture();
    f.state.rejectPurpose = 'restored';
    await f.run();
    f.state[setting] = true;
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
test('cancelled serial driver makes no mutation or operational request', async () => {
  const f = await fixture(),
    abort = new AbortController();
  abort.abort(Error('synthetic cancelled'));
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic cancelled');
  expect(f.calls).toEqual([]);
  expect(f.observations).toEqual([]);
});
test('missing preflight after interruption cannot be reconstructed from post-interruption observations', async () => {
  const f = await fixture();
  f.state.lostStage = 'deallocate';
  await expect(f.run()).rejects.toThrow();
  await f.store.remove(`${f.plan.planId}-terraform-network-node-1-preflight.json`);
  await expect(f.run()).rejects.toThrow('preflight missing');
  expect(f.calls).toEqual(['1:deallocate']);
});
test('HA restored acceptance failure prevents the next node interruption', async () => {
  const f = await fixture(true);
  f.state.rejectPurpose = 'restored';
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
  expect(f.fixtures.has(2)).toBe(false);
});
for (const afterWrite of [false, true])
  test(`lost operational preflight response ${afterWrite ? 'after' : 'before'} durable write never interrupts a node prematurely`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (loss && name.endsWith('-preflight.json')) {
        loss = false;
        if (afterWrite) await write(name, value);
        throw Error('synthetic preflight write loss');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow('preflight write loss');
    expect(f.calls).toEqual([]);
    expect((await f.run()).status).toBe('complete');
    expect(f.observations.filter((o) => o === '1:preflight')).toHaveLength(afterWrite ? 1 : 2);
  });
test('durable acceptance pointer recovery does not recollect the completed restored decision', async () => {
  const f = await fixture(),
    write = f.store.write.bind(f.store);
  let loss = true;
  f.store.write = async (name, value) => {
    if (
      loss &&
      name.endsWith('-driver-checkpoint.json') &&
      (value as { nodes?: { phase: string }[] }).nodes?.at(-1)?.phase === 'accepted'
    ) {
      loss = false;
      throw Error('synthetic acceptance pointer loss');
    }
    return write(name, value);
  };
  await expect(f.run()).rejects.toThrow('acceptance pointer loss');
  f.state.rejectPurpose = 'restored';
  expect((await f.run()).status).toBe('complete');
  expect(f.observations.filter((o) => o === '1:restored')).toHaveLength(1);
  expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
});
for (const stage of ['deallocate', 'nic', 'start', 'routing'])
  test(`cancellation after complete ${stage} stage resumes from exact history without replay`, async () => {
    const f = await fixture(),
      abort = new AbortController();
    f.state.afterStage = (selected) => {
      if (selected === stage) abort.abort(Error('synthetic stage cancellation'));
    };
    await expect(f.run(abort.signal)).rejects.toThrow('synthetic stage cancellation');
    f.state.afterStage = undefined;
    expect((await f.run()).status).toBe('complete');
    expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
  });
for (const mode of ['source', 'owner', 'node', 'mac', 'verification'])
  test(`tampered saved preflight ${mode} cannot authorize interrupted continuation`, async () => {
    const f = await fixture();
    f.state.lostStage = 'deallocate';
    await expect(f.run()).rejects.toThrow();
    const name = `${f.plan.planId}-terraform-network-node-1-preflight.json`,
      row = (await f.store.read(name)) as Record<string, unknown>;
    if (mode === 'source') row.sourceBindingSha256 = 'a'.repeat(64);
    const identity = row.identity as AzureTerraformNetworkAcceptanceIdentity;
    if (mode === 'owner') identity.owner.account = 'example-foreign';
    if (mode === 'node') identity.node = 2;
    if (mode === 'mac') identity.inventory.nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
    if (mode === 'verification') (row.verification as { evidenceSha256: string }).evidenceSha256 = 'a'.repeat(64);
    await f.store.write(name, row);
    if (mode === 'verification') expect((await f.run()).status).toBe('operational-acceptance-pending');
    else await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(['1:deallocate']);
  });
test('acknowledgement-only power callback cannot advance a node checkpoint', async () => {
  const f = await fixture();
  f.dependencies.runPower = async () =>
    ({ status: 'power-stage-complete' }) as Awaited<ReturnType<typeof f.dependencies.runPower>>;
  await expect(f.run()).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
test('acknowledgement-only NIC callback cannot advance a node checkpoint', async () => {
  const f = await fixture();
  f.dependencies.runNic = async () =>
    ({ status: 'nic-stage-complete' }) as Awaited<ReturnType<typeof f.dependencies.runNic>>;
  await expect(f.run()).rejects.toThrow();
  expect(f.calls).toEqual(['1:deallocate']);
});
test('configuration changes during output collection reject current boundary before further mutation', async () => {
  const f = await fixture();
  f.state.rejectPurpose = 'restored';
  await f.run();
  f.state.onOutputs = () => {
    f.state.wrongConfig = true;
  };
  const calls = [...f.calls];
  await expect(f.run()).rejects.toThrow('boundary changed');
  expect(f.calls).toEqual(calls);
});
test('all previously accepted HA nodes need fresh final evidence before complete', async () => {
  const f = await fixture(true);
  f.state.rejectPurpose = 'final:2';
  const pending = await f.run();
  expect(pending.status).toBe('operational-acceptance-pending');
  expect('purpose' in pending && pending.purpose).toBe('final-node-2');
  const calls = [...f.calls];
  f.state.rejectPurpose = '';
  expect((await f.run()).status).toBe('complete');
  expect(f.calls).toEqual(calls);
}, 60000);
test('immutable original completion survives refreshed final receipts without stage replay', async () => {
  const f = await fixture(),
    first = await f.run();
  const name = `${f.plan.planId}-terraform-network-driver-complete.json`,
    original = await f.store.read(name);
  const second = await f.run();
  expect('completionSha256' in second && second.completionSha256).toBe(
    'completionSha256' in first && first.completionSha256,
  );
  expect(await f.store.read(name)).toEqual(original);
  expect('finalPlanSha256' in second && second.finalPlanSha256).not.toBe(
    'finalPlanSha256' in first && first.finalPlanSha256,
  );
  expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
});
for (const afterWrite of [false, true])
  test(`lost immutable completion response ${afterWrite ? 'after' : 'before'} publication resumes without stage replay`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (loss && name.endsWith('-driver-complete.json')) {
        loss = false;
        if (afterWrite) await write(name, value);
        throw Error('synthetic completion write loss');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow('completion write loss');
    expect((await f.run()).status).toBe('complete');
    expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
  });
for (const mode of ['missing', 'owner', 'plan', 'inventory', 'outputs', 'receipt', 'evidence', 'extra'])
  test(`immutable completion ${mode} cannot be replaced by fresh current success`, async () => {
    const f = await fixture();
    await f.run();
    const name = `${f.plan.planId}-terraform-network-driver-complete.json`,
      packet = (await f.store.read(name)) as Record<string, unknown>;
    if (mode === 'missing') await f.store.remove(name);
    else {
      if (mode === 'owner') packet.sourceBindingSha256 = 'a'.repeat(64);
      if (mode === 'plan') packet.planSha256 = 'a'.repeat(64);
      if (mode === 'inventory')
        (packet.inventory as AzureTerraformNetworkAcceptanceIdentity['inventory']).nodes['1'].vmId =
          '00000000-0000-4000-8000-000000000099';
      if (mode === 'outputs')
        (packet.outputs as { ce_instances: { '1': { vm_id: string } } }).ce_instances['1'].vm_id =
          '00000000-0000-4000-8000-000000000099';
      if (mode === 'receipt') (packet.receipt as { noChanges: boolean }).noChanges = false;
      if (mode === 'evidence') packet.evidenceByNode = {};
      if (mode === 'extra') packet.unverified = true;
      await f.store.write(name, packet);
    }
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });

for (const settlement of ['fulfilled', 'rejected'] as const)
  test(`serial driver retains its owning lock until interrupted power ${settlement} settlement`, async () => {
    const f = await fixture(),
      late = Promise.withResolvers<AzureTerraformPowerSettlement>();
    f.dependencies.runPower = async () => {
      throw new AzureTerraformPowerLifecycleInterrupted(late.promise);
    };
    let caught: unknown;
    try {
      await f.run();
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof AzureTerraformPowerLifecycleInterrupted)) throw Error('owning interruption missing');
    const lock = join(f.store.directory, '.terraform-network-driver-lock');
    expect(await readFile(join(lock, 'claim.json'))).toBeTruthy();
    await expect(f.run()).rejects.toThrow();
    late.resolve({ mutationSettlements: [settlement], locksReleased: true, failures: [] });
    const completed = await caught.completion;
    expect(completed.mutationSettlements).toEqual([settlement]);
    expect(completed.locksReleased).toBe(true);
    await expect(readFile(join(lock, 'claim.json'))).rejects.toThrow();
  }, 60000);

for (const failure of ['rejected-completion', 'failed-power-lock-release'] as const)
  test(`serial driver preserves ${failure} and reports incomplete lock settlement`, async () => {
    const f = await fixture(),
      late = Promise.withResolvers<AzureTerraformPowerSettlement>();
    f.dependencies.runPower = async () => {
      throw new AzureTerraformPowerLifecycleInterrupted(late.promise);
    };
    let caught: unknown;
    try {
      await f.run();
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof AzureTerraformPowerLifecycleInterrupted)) throw Error('owning interruption missing');
    expect(await readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).toBeTruthy();
    if (failure === 'rejected-completion') late.reject(Error('synthetic settlement unavailable'));
    else
      late.resolve({
        mutationSettlements: ['fulfilled'],
        locksReleased: false,
        failures: ['power-lock-release-failed'],
      });
    const completed = await caught.completion;
    expect(completed.locksReleased).toBe(false);
    expect(completed.failures).toContain(
      failure === 'rejected-completion' ? 'power-settlement-unavailable' : 'power-lock-release-failed',
    );
    await expect(readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).rejects.toThrow();
  }, 60000);

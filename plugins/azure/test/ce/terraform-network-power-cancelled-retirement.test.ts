import { afterEach, expect, test } from 'bun:test';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CleanupRequest,
  encode,
  hash,
  type IndependentCleanupEvidence,
} from '../../../terraform/src/cleanup-verifier-worker';
import {
  readAzureTerraformNetworkCancelledPowerRetirement,
  retireAzureTerraformNetworkCancelledPowerStage,
} from '../../src/ce/terraform-network-power-cancelled-release';
import { AzureTerraformPowerLifecycleInterrupted } from '../../src/ce/terraform-network-power-lifecycle';
import { readAzureTerraformNetworkPowerRunnerHistory } from '../../src/ce/terraform-network-power-runner-history';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkPowerCancellationFixture } from './terraform-network-power-cancellation-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
// Structured synthetic independent evidence qualifies adapter source tests only. Actual independent
// Terraform process regressions are separately required; no cloud/live qualification is claimed here.
function evidence(request: CleanupRequest, version: string): IndependentCleanupEvidence {
  return {
    schemaVersion: 1,
    status: 'independently-verified',
    nonce: request.nonce,
    requestSha256: hash(encode(request)),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    executorPid: process.pid + 1,
    parentPid: process.pid,
    manifestSha256: request.manifestSha256,
    evidenceSha256: request.evidenceSha256,
    finalPlanSha256: request.finalPlanSha256,
    planReceiptSha256: request.planReceiptSha256,
    inputInventorySha256: hash(encode(request.inputs)),
    terraformExecutableSha256: request.terraform.sha256,
    terraformExecutablePathSha256: hash(request.terraform.path),
    interpreterSha256: request.interpreter.sha256,
    workerSha256: request.workerSha256,
    terraformVersion: version,
    stateJsonSha256: 'a'.repeat(64),
    originalPlanJsonSha256: 'b'.repeat(64),
    refreshedPlanSha256: 'c'.repeat(64),
    refreshedPlanJsonSha256: 'd'.repeat(64),
    commands: [
      ['version', '-json'],
      ['show', '-json', 'saved.tfplan'],
      ['show', '-json'],
      [
        'plan',
        '-input=false',
        '-lock=true',
        '-lock-timeout=60s',
        '-refresh=true',
        `-out=independent-cleanup-${request.nonce}.tfplan`,
      ],
      ['show', '-json', `independent-cleanup-${request.nonce}.tfplan`],
    ],
  };
}
async function fixture(operation: 'start' | 'deallocate' = 'deallocate', existing = true, ha = false, node = 1) {
  const state = {
    verifications: 0,
    failVerifier: false,
    retireCalls: 0,
    loseRetireBefore: false,
    loseRetireAfter: false,
    loseWrite: '',
    beforeWrite: false,
    retireGate: undefined as Promise<void> | undefined,
    retireStarted: undefined as (() => void) | undefined,
    ignoreRetireSignal: false,
  };
  const f = await terraformNetworkPowerCancellationFixture(ha, node, operation, true, existing, async (request) => {
    state.verifications++;
    if (state.failVerifier) throw Error('synthetic independent verifier unavailable');
    return evidence(request, f.selectedDeployment.terraformVersion);
  });
  await f.runCancellation();
  const open = f.cancellationTerraform.open;
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args),
      runner = await f.resumeSelectedRunner();
    session.plan = runner.plan.bind(runner);
    session.apply = runner.apply.bind(runner);
    session.readAppliedResourceFields = runner.readAppliedResourceFields.bind(runner);
    session.reconcileApplyFromEvidence = runner.reconcileApplyFromEvidence.bind(runner);
    session.retireArtifacts = async (...args) => {
      state.retireCalls++;
      if (state.loseRetireBefore) {
        state.loseRetireBefore = false;
        throw Error('synthetic retirement response lost before effect');
      }
      state.retireStarted?.();
      if (state.retireGate) await state.retireGate;
      const result = await runner.retireArtifacts(
        args[0],
        args[1],
        args[2],
        state.ignoreRetireSignal ? undefined : args[3],
      );
      if (state.loseRetireAfter) {
        state.loseRetireAfter = false;
        throw Error('synthetic retirement response lost after effect');
      }
      return result;
    };
    return session;
  };
  const write = f.store.write;
  f.store.write = async (...args) => {
    const lose =
      args[0].startsWith('azure-power-runner-retirement-') && state.loseWrite && args[0].endsWith(state.loseWrite);
    if (lose && state.beforeWrite) {
      state.loseWrite = '';
      throw Error('synthetic retirement publication lost');
    }
    await write.call(f.store, ...args);
    if (lose) {
      state.loseWrite = '';
      throw Error('synthetic retirement publication lost');
    }
  };
  const run = (signal?: AbortSignal) =>
    retireAzureTerraformNetworkCancelledPowerStage(
      f.plan,
      node,
      operation,
      f.cancellationTerraform,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      f.api,
      {},
      signal,
    );
  const packetName = async (suffix: string) => {
    const name = (await readdir(f.store.directory)).find(
      (name) => name.startsWith('azure-power-runner-retirement-') && name.endsWith(suffix),
    );
    if (!name) throw Error('retirement packet missing');
    return name;
  };
  return { ...f, state, runRetirement: run, retirementPacketName: packetName };
}
for (const operation of ['start', 'deallocate'] as const)
  for (const existing of [false, true])
    test(`cancelled ${operation} ${existing ? 'existing' : 'create'} retires the exact local runner and preserves parent`, async () => {
      const f = await fixture(operation, existing),
        result = await f.runRetirement();
      expect(result.scope).toBe('selected-cancelled-network-power-runner-retirement');
      expect(result.wholeAppliedStateEmptyQualified).toBe(true);
      expect(result.independentCleanupQualified).toBe(true);
      expect(result.runnerRetirementQualified).toBe(true);
      expect(result.parentRetirementQualified).toBe(false);
      expect(result.retirementQualified).toBe(false);
      expect(f.vmPowerActions).toEqual([]);
      expect((await readdir(f.directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
      const count = f.commands.length;
      expect(await f.runRetirement()).toEqual(result);
      expect(f.commands).toHaveLength(count);
      expect(f.state.verifications).toBe(1);
      expect(f.state.retireCalls).toBe(1);
      await expect((await f.resumeSelectedRunner()).plan({})).rejects.toThrow('retired');
    }, 60000);
for (const suffix of ['-preparing.json', '-retiring.json', '-retired.json'])
  for (const beforeWrite of [false, true])
    test(`${beforeWrite ? 'before' : 'after'} ${suffix} lost publication recovers original retirement without replay`, async () => {
      const f = await fixture();
      f.state.loseWrite = suffix;
      f.state.beforeWrite = beforeWrite;
      await expect(f.runRetirement()).rejects.toThrow('publication lost');
      const result = await f.runRetirement();
      expect(result.runnerRetirementQualified).toBe(true);
      expect(f.state.verifications).toBe(1);
      expect(f.state.retireCalls).toBe(1);
      expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
      expect(f.vmPowerActions).toEqual([]);
    }, 60000);
for (const afterEffect of [false, true])
  test(`retirement response loss ${afterEffect ? 'after' : 'before'} effect recovers bound evidence`, async () => {
    const f = await fixture();
    f.state.loseRetireAfter = afterEffect;
    f.state.loseRetireBefore = !afterEffect;
    await expect(f.runRetirement()).rejects.toThrow('response lost');
    const result = await f.runRetirement();
    expect(result.runnerRetirementQualified).toBe(true);
    expect(f.state.verifications).toBe(1);
    expect(f.state.retireCalls).toBe(afterEffect ? 1 : 2);
    expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
  }, 60000);
test('independent cleanup failure preserves original final inputs and permits exact retry', async () => {
  const f = await fixture();
  f.state.failVerifier = true;
  await expect(f.runRetirement()).rejects.toThrow('verifier unavailable');
  expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
  expect(await readFile(join(f.directory, 'saved.tfplan'), 'utf8')).toContain('synthetic-selected-power-plan');
  f.state.failVerifier = false;
  expect((await f.runRetirement()).runnerRetirementQualified).toBe(true);
}, 60000);
for (const suffix of ['-preparing.json', '-retiring.json', '-retired.json'])
  test(`foreign ${suffix} cannot replace exact retained retirement proof`, async () => {
    const f = await fixture();
    await f.runRetirement();
    const name = await f.retirementPacketName(suffix),
      packet = (await f.store.read(name)) as Record<string, unknown>;
    await f.store.write(name, { ...packet, foreign: true });
    const count = f.commands.length;
    await expect(f.runRetirement()).rejects.toThrow();
    expect(f.commands).toHaveLength(count);
    expect(f.state.retireCalls).toBe(1);
  }, 60000);
test('pre-aborted retirement never creates authorization or runs cleanup', async () => {
  const f = await fixture(),
    controller = new AbortController();
  controller.abort();
  await expect(f.runRetirement(controller.signal)).rejects.toThrow();
  expect(f.state.retireCalls).toBe(0);
}, 60000);

for (const residual of ['resource', 'output'])
  test(`selected control absence cannot authorize retirement with residual whole-state ${residual}`, async () => {
    const f = await fixture();
    if (residual === 'resource')
      f.appliedState.extraResources.push({
        address: 'terraform_data.foreign',
        type: 'terraform_data',
        values: { id: 'synthetic-retained' },
      });
    else f.appliedState.extraOutputs.retained = { value: 'synthetic-retained' };
    await expect(f.runRetirement()).rejects.toThrow();
    expect(f.appliedState.control).toBeNull();
    expect(f.state.verifications).toBe(0);
    expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
  }, 60000);
for (const operation of ['deallocate', 'start'] as const)
  test(`true three-node HA retires only selected third-node ${operation} stage`, async () => {
    const f = await fixture(operation, true, true, 3),
      result = await f.runRetirement();
    expect(result.node).toBe(3);
    expect(result.runnerRetirementQualified).toBe(true);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.vmPowerActions).toEqual([]);
    expect(f.state.verifications).toBe(1);
  }, 60000);
test('partial recorded removal resumes from retained proof without original input re-execution', async () => {
  const f = await fixture();
  await writeFile(join(f.directory, 'private-fixture.txt'), 'SYNTHETIC_PRIVATE_FIXTURE', { mode: 0o600 });
  await f.runRetirement();
  const path = join(f.directory, 'artifact-retirement.json'),
    marker = JSON.parse(await readFile(path, 'utf8'));
  marker.status = 'retiring';
  await writeFile(path, JSON.stringify(marker), { mode: 0o600 });
  await writeFile(join(f.directory, 'private-fixture.txt'), 'SYNTHETIC_PRIVATE_FIXTURE', { mode: 0o600 });
  await rm(join(f.store.directory, await f.retirementPacketName('-retired.json')));
  const count = f.commands.length,
    result = await f.runRetirement();
  expect(result.runnerRetirementQualified).toBe(true);
  expect(f.commands).toHaveLength(count);
  expect(f.state.verifications).toBe(1);
  expect(f.state.retireCalls).toBe(2);
  expect((await readdir(f.directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
}, 60000);
for (const suffix of ['-preparing.json', '-retiring.json'])
  test(`missing original ${suffix} cannot be reconstructed from a retired marker`, async () => {
    const f = await fixture();
    await f.runRetirement();
    await rm(join(f.store.directory, await f.retirementPacketName(suffix)));
    const count = f.commands.length;
    await expect(f.runRetirement()).rejects.toThrow();
    expect(f.commands).toHaveLength(count);
    expect(f.state.retireCalls).toBe(1);
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
  test(`retired recovery authenticates original release ${suffix} bytes`, async () => {
    const f = await fixture();
    await f.runRetirement();
    const name = (await readdir(f.store.directory)).find(
      (n) => n.startsWith('azure-power-state-release-') && n.endsWith(suffix),
    );
    if (!name) throw Error('release packet missing');
    const packet = (await f.store.read(name)) as Record<string, unknown>;
    await f.store.write(name, { ...packet, foreign: true });
    const count = f.commands.length;
    await expect(f.runRetirement()).rejects.toThrow();
    expect(f.commands).toHaveLength(count);
  }, 60000);
for (const ignoreSignal of [false, true])
  test(`ignored retirement ${ignoreSignal ? 'fulfillment' : 'rejection'} retains both locks and cannot publish late success`, async () => {
    const f = await fixture(),
      controller = new AbortController(),
      started = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>();
    f.state.retireStarted = () => started.resolve();
    f.state.retireGate = gate.promise;
    f.state.ignoreRetireSignal = ignoreSignal;
    const attempt = f.runRetirement(controller.signal).catch((error: unknown) => error);
    await started.promise;
    controller.abort(Error('synthetic retirement interruption'));
    const caught = await attempt;
    expect(caught).toBeInstanceOf(AzureTerraformPowerLifecycleInterrupted);
    if (!(caught instanceof AzureTerraformPowerLifecycleInterrupted)) throw Error('owned interruption missing');
    expect(await readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).toBeDefined();
    expect(await readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).toBeDefined();
    await expect(f.runRetirement()).rejects.toThrow();
    gate.resolve();
    const settled = await caught.completion;
    expect(settled.locksReleased).toBe(true);
    expect(settled.mutationSettlements).toEqual([ignoreSignal ? 'fulfilled' : 'rejected']);
    expect(
      (await readdir(f.store.directory)).filter(
        (n) => n.startsWith('azure-power-runner-retirement-') && n.endsWith('-retired.json'),
      ),
    ).toEqual([]);
    f.state.retireStarted = undefined;
    f.state.retireGate = undefined;
    f.state.ignoreRetireSignal = false;
    expect((await f.runRetirement()).runnerRetirementQualified).toBe(true);
    expect(f.vmPowerActions).toEqual([]);
  }, 60000);

test('retired recovery cannot publish from unavailable selected cloud evidence', async () => {
  const f = await fixture();
  await f.runRetirement();
  await rm(join(f.store.directory, await f.retirementPacketName('-retired.json')));
  f.api.exec = async () => {
    throw Error('synthetic cloud observation unavailable');
  };
  const count = f.commands.length;
  await expect(f.runRetirement()).rejects.toThrow('observation unavailable');
  expect(f.commands).toHaveLength(count);
  expect(
    (await readdir(f.store.directory)).filter(
      (n) => n.startsWith('azure-power-runner-retirement-') && n.endsWith('-retired.json'),
    ),
  ).toEqual([]);
}, 60000);
test('missing owning retirement reader cannot substitute marker existence or a dummy receipt', async () => {
  const f = await fixture(),
    open = f.cancellationTerraform.open;
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args);
    session.readArtifactRetirement = undefined;
    return session;
  };
  await expect(f.runRetirement()).rejects.toThrow('retirement contract unavailable');
  expect(f.state.retireCalls).toBe(0);
  expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
}, 60000);

test('dummy retirement acknowledgement cannot substitute authenticated removal and retained proof', async () => {
  const f = await fixture(),
    open = f.cancellationTerraform.open;
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args);
    session.retireArtifacts = async (receipt, evidenceSha256) => ({
      status: 'runner-artifacts-retired',
      manifestSha256: 'a'.repeat(64),
      evidenceSha256,
      finalPlanSha256: receipt.planSha256,
      inventorySha256: 'b'.repeat(64),
      retiredArtifacts: 0,
      independentCleanupSha256: 'c'.repeat(64),
    });
    return session;
  };
  await expect(f.runRetirement()).rejects.toThrow('retirement remains incomplete');
  expect(f.state.retireCalls).toBe(0);
  expect(f.state.verifications).toBe(0);
  expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
  expect(await readFile(join(f.directory, 'saved.tfplan'), 'utf8')).toContain('synthetic-selected-power-plan');
}, 60000);

async function inspectRetirement(f: Awaited<ReturnType<typeof fixture>>, signal?: AbortSignal) {
  const match = f.selectedDeployment.stage?.match(/-node-(\d+)-(start|deallocate)$/);
  if (!match) throw Error('selected fixture stage missing');
  return readAzureTerraformNetworkCancelledPowerRetirement(
    f.plan,
    Number(match[1]),
    match[2] as 'start' | 'deallocate',
    f.cancellationTerraform,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
    signal,
  );
}
async function retainedInventory(directory: string): Promise<Record<string, string>> {
  const { lstat } = await import('node:fs/promises');
  const result: Record<string, string> = {};
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name),
      stat = await lstat(path);
    if (stat.isDirectory()) {
      for (const [key, value] of Object.entries(await retainedInventory(path))) result[`${name}/${key}`] = value;
    } else result[name] = hash(await readFile(path));
  }
  return result;
}
for (const operation of ['start', 'deallocate'] as const)
  for (const ha of [false, true])
    test(`read-only ${operation} ${ha ? 'third-node HA' : 'single'} retirement preserves historical custody with cloud unavailable`, async () => {
      const f = await fixture(operation, true, ha, ha ? 3 : 1);
      await f.runRetirement();
      const inventory = await retainedInventory(f.store.directory),
        commands = [...f.commands],
        count = f.state.retireCalls,
        verifications = f.state.verifications;
      f.api.exec = async () => {
        throw Error('synthetic selected VM already torn down');
      };
      const result = await inspectRetirement(f);
      expect(result.status).toBe('retired');
      expect(result.runnerRetirementQualified).toBe(true);
      expect(result.currentOperationalAcceptanceQualified).toBe(false);
      expect(result.parentRetirementQualified).toBe(false);
      expect(result.retirementQualified).toBe(false);
      expect(await inspectRetirement(f)).toEqual(result);
      expect(f.commands).toEqual(commands);
      expect(f.state.retireCalls).toBe(count);
      expect(f.state.verifications).toBe(verifications);
      expect(await retainedInventory(f.store.directory)).toEqual(inventory);
    }, 60000);
test('read-only missing preparation remains absent and does not publish or acquire lifecycle locks', async () => {
  const f = await fixture(),
    inventory = await retainedInventory(f.store.directory),
    commands = [...f.commands];
  expect((await inspectRetirement(f)).status).toBe('absent');
  expect((await inspectRetirement(f)).runnerRetirementQualified).toBe(false);
  expect(await retainedInventory(f.store.directory)).toEqual(inventory);
  expect(f.commands).toEqual(commands);
  expect(f.state.retireCalls).toBe(0);
}, 60000);
for (const afterEffect of [false, true])
  test(`read-only ${afterEffect ? 'unpublished completed' : 'authorized unstarted'} retirement remains unqualified without replay`, async () => {
    const f = await fixture();
    f.state.loseRetireAfter = afterEffect;
    f.state.loseRetireBefore = !afterEffect;
    await expect(f.runRetirement()).rejects.toThrow('response lost');
    const inventory = await retainedInventory(f.store.directory),
      commands = [...f.commands],
      count = f.state.retireCalls;
    const result = await inspectRetirement(f);
    expect(result.status).toBe(afterEffect ? 'retired-unpublished' : 'preparing');
    expect(result.runnerRetirementQualified).toBe(false);
    expect(await retainedInventory(f.store.directory)).toEqual(inventory);
    expect(f.commands).toEqual(commands);
    expect(f.state.retireCalls).toBe(count);
  }, 60000);
test('read-only partial retained marker remains retiring without removing remaining inventory', async () => {
  const f = await fixture();
  await writeFile(join(f.directory, 'private-fixture.txt'), 'SYNTHETIC_PRIVATE_FIXTURE', { mode: 0o600 });
  await f.runRetirement();
  const path = join(f.directory, 'artifact-retirement.json'),
    marker = JSON.parse(await readFile(path, 'utf8'));
  marker.status = 'retiring';
  await writeFile(path, JSON.stringify(marker), { mode: 0o600 });
  await writeFile(join(f.directory, 'private-fixture.txt'), 'SYNTHETIC_PRIVATE_FIXTURE', { mode: 0o600 });
  await rm(join(f.store.directory, await f.retirementPacketName('-retired.json')));
  const inventory = await retainedInventory(f.store.directory),
    commands = [...f.commands];
  const result = await inspectRetirement(f);
  expect(result.status).toBe('retiring');
  expect(result.runnerRetirementQualified).toBe(false);
  expect(await retainedInventory(f.store.directory)).toEqual(inventory);
  expect(f.commands).toEqual(commands);
  expect(f.state.retireCalls).toBe(1);
}, 60000);
for (const suffix of ['-preparing.json', '-retiring.json', '-retired.json'])
  for (const missing of [false, true])
    test(`read-only ${missing ? 'missing' : 'foreign'} ${suffix} cannot qualify marker existence`, async () => {
      const f = await fixture();
      await f.runRetirement();
      const name = await f.retirementPacketName(suffix);
      if (missing) await rm(join(f.store.directory, name));
      else await f.store.write(name, { ...((await f.store.read(name)) as object), foreign: true });
      const inventory = await retainedInventory(f.store.directory),
        commands = [...f.commands];
      if (missing && suffix === '-retired.json') {
        const result = await inspectRetirement(f);
        expect(result.status).toBe('retired-unpublished');
        expect(result.runnerRetirementQualified).toBe(false);
      } else await expect(inspectRetirement(f)).rejects.toThrow();
      expect(await retainedInventory(f.store.directory)).toEqual(inventory);
      expect(f.commands).toEqual(commands);
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
  test(`read-only retirement rejects changed retained release ${suffix}`, async () => {
    const f = await fixture();
    await f.runRetirement();
    const name = (await readdir(f.store.directory)).find(
      (n) => n.startsWith('azure-power-state-release-') && n.endsWith(suffix),
    );
    if (!name) throw Error('retained release packet missing');
    await f.store.write(name, { ...((await f.store.read(name)) as object), foreign: true });
    const inventory = await retainedInventory(f.store.directory),
      commands = [...f.commands];
    await expect(inspectRetirement(f)).rejects.toThrow();
    expect(await retainedInventory(f.store.directory)).toEqual(inventory);
    expect(f.commands).toEqual(commands);
  }, 60000);
test('read-only unavailable authenticated retirement reader cannot qualify or repair retained evidence', async () => {
  const f = await fixture();
  await f.runRetirement();
  const open = f.cancellationTerraform.open;
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args);
    session.readArtifactRetirement = undefined;
    return session;
  };
  const inventory = await retainedInventory(f.store.directory),
    commands = [...f.commands];
  await expect(inspectRetirement(f)).rejects.toThrow('retirement contract unavailable');
  expect(await retainedInventory(f.store.directory)).toEqual(inventory);
  expect(f.commands).toEqual(commands);
}, 60000);
test('read-only pre-aborted inspection preserves every retained byte', async () => {
  const f = await fixture();
  await f.runRetirement();
  const controller = new AbortController();
  controller.abort();
  const inventory = await retainedInventory(f.store.directory),
    commands = [...f.commands];
  await expect(inspectRetirement(f, controller.signal)).rejects.toThrow();
  expect(await retainedInventory(f.store.directory)).toEqual(inventory);
  expect(f.commands).toEqual(commands);
}, 60000);
for (const published of [false, true])
  test(`runner history joins ${published ? 'published retired' : 'unpublished retired'} cancelled-stage receipt without commands`, async () => {
    const f = await fixture();
    await f.runRetirement();
    if (!published) await rm(join(f.store.directory, await f.retirementPacketName('-retired.json')));
    const inventory = await retainedInventory(f.store.directory),
      commands = [...f.commands];
    const result = await readAzureTerraformNetworkPowerRunnerHistory(
      f.plan,
      f.store,
      f.cancellationTerraform,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    );
    const row = result.rows.find((row) => row.stage === f.selectedDeployment.stage);
    expect(row?.status).toBe(published ? 'retired' : 'retired-awaiting-receipt');
    expect(row?.retirement?.status).toBe(published ? 'retired' : 'retired-unpublished');
    expect(row?.retirement?.runnerRetirementQualified).toBe(published);
    expect(result.runnerRetirementQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(await retainedInventory(f.store.directory)).toEqual(inventory);
    expect(f.commands).toEqual(commands);
  }, 60000);

test('read-only retired custody does not require publication or retirement mutation methods', async () => {
  const f = await fixture();
  await f.runRetirement();
  const open = f.cancellationTerraform.open;
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args);
    session.retireArtifacts = undefined;
    session.plan = async () => {
      throw Error('inspection attempted plan mutation');
    };
    session.apply = async () => {
      throw Error('inspection attempted apply mutation');
    };
    return session;
  };
  f.store.write = async () => {
    throw Error('inspection attempted publication');
  };
  const inventory = await retainedInventory(f.store.directory),
    commands = [...f.commands];
  expect((await inspectRetirement(f)).status).toBe('retired');
  expect(await retainedInventory(f.store.directory)).toEqual(inventory);
  expect(f.commands).toEqual(commands);
}, 60000);
test('read-only cross-read changed retired publication rejects instead of consuming the first receipt', async () => {
  const f = await fixture();
  await f.runRetirement();
  const name = await f.retirementPacketName('-retired.json'),
    open = f.cancellationTerraform.open;
  let reads = 0;
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args),
      read = session.readArtifactRetirement;
    if (!read) throw Error('authenticated fixture reader unavailable');
    session.readArtifactRetirement = async (...input) => {
      const result = await read(...input);
      if (++reads === 2) await f.store.write(name, { ...((await f.store.read(name)) as object), foreign: true });
      return result;
    };
    return session;
  };
  const commands = [...f.commands];
  await expect(inspectRetirement(f)).rejects.toThrow();
  expect(f.commands).toEqual(commands);
  expect(f.state.retireCalls).toBe(1);
}, 60000);
test('ignored read abort terminates inspection without acquiring locks or publishing late success', async () => {
  const f = await fixture();
  await f.runRetirement();
  const open = f.cancellationTerraform.open,
    started = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>(),
    controller = new AbortController();
  f.cancellationTerraform.open = async (...args) => {
    const session = await open(...args),
      read = session.readArtifactRetirement;
    if (!read) throw Error('authenticated fixture reader unavailable');
    session.readArtifactRetirement = async (...input) => {
      started.resolve();
      await gate.promise;
      return read(...input);
    };
    return session;
  };
  const inventory = await retainedInventory(f.store.directory),
    commands = [...f.commands];
  const attempt = inspectRetirement(f, controller.signal);
  await started.promise;
  controller.abort(Error('synthetic observer abort'));
  await expect(attempt).rejects.toThrow('synthetic observer abort');
  gate.resolve();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(await retainedInventory(f.store.directory)).toEqual(inventory);
  expect(f.commands).toEqual(commands);
  expect(f.state.retireCalls).toBe(1);
}, 60000);

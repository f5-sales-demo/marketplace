import { expect } from 'bun:test';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CleanupRequest,
  encode,
  hash,
  type IndependentCleanupEvidence,
} from '../../../terraform/src/cleanup-verifier-worker';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AzureTerraformNetworkCheckpoint } from '../../src/ce/terraform-network-checkpoint';
import {
  readAzureTerraformNetworkCompletedPowerRetirement,
  retireAzureTerraformNetworkCompletedPowerStage,
} from '../../src/ce/terraform-network-power-completed-retirement';
import { AzureTerraformPowerLifecycleInterrupted } from '../../src/ce/terraform-network-power-lifecycle';
import { readAzureTerraformNetworkPowerRunnerHistory } from '../../src/ce/terraform-network-power-runner-history';
import { readAzureTerraformNetworkRetirementGraph } from '../../src/ce/terraform-network-retirement-graph';
import { test } from './owned-fixture-test';

import { terraformNetworkCompletedPowerFixture } from './terraform-network-power-completed-fixture';

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
async function fixture(operation: 'start' | 'deallocate' = 'deallocate', existing = false, ha = false, node = 1) {
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
  const f = await terraformNetworkCompletedPowerFixture(ha, node, operation, existing, async (request) => {
    state.verifications++;
    if (state.failVerifier) throw Error('synthetic independent verifier unavailable');
    return evidence(request, f.selectedDeployment.terraformVersion);
  });
  const open = f.stageTerraform.open;
  f.stageTerraform.open = async (...args) => {
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
      args[0].startsWith('azure-power-completed-retirement-') && state.loseWrite && args[0].endsWith(state.loseWrite);
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
    retireAzureTerraformNetworkCompletedPowerStage(
      f.plan,
      node,
      operation,
      f.stageTerraform,
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
      (name) => name.startsWith('azure-power-completed-retirement-') && name.endsWith(suffix),
    );
    if (!name) throw Error('retirement packet missing');
    return name;
  };
  return { ...f, state, runRetirement: run, retirementPacketName: packetName };
}

async function inspect(f: Awaited<ReturnType<typeof fixture>>, signal?: AbortSignal) {
  const match = f.selectedDeployment.stage?.match(/-node-(\d+)-(start|deallocate)$/);
  if (!match) throw Error('selected fixture stage missing');
  return readAzureTerraformNetworkCompletedPowerRetirement(
    f.plan,
    Number(match[1]),
    match[2] as 'start' | 'deallocate',
    f.stageTerraform,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
    signal,
  );
}
async function inventory(directory: string): Promise<Record<string, string>> {
  const { lstat } = await import('node:fs/promises');
  const result: Record<string, string> = {};
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name),
      stat = await lstat(path);
    if (stat.isDirectory())
      for (const [key, value] of Object.entries(await inventory(path))) result[`${name}/${key}`] = value;
    else result[name] = hash(await readFile(path));
  }
  return result;
}
for (const operation of ['start', 'deallocate'] as const)
  for (const ha of [false, true])
    test(`completed ${operation} ${ha ? 'third-node HA' : 'single'} retires actual original runner without action replay`, async () => {
      const f = await fixture(operation, false, ha, ha ? 3 : 1),
        actions = [...f.vmPowerActions];
      expect(actions).toEqual([operation]);
      const result = await f.runRetirement();
      expect(result.scope).toBe('selected-completed-network-power-runner-retirement');
      expect(result.wholeAppliedStateEmptyQualified).toBe(true);
      expect(result.independentCleanupQualified).toBe(true);
      expect(result.runnerRetirementQualified).toBe(true);
      expect(result.currentOperationalAcceptanceQualified).toBe(false);
      expect(result.parentRetirementQualified).toBe(false);
      expect(result.retirementQualified).toBe(false);
      expect((await readdir(f.directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
      const commands = [...f.commands];
      expect(await f.runRetirement()).toEqual(result);
      expect(f.commands).toEqual(commands);
      expect(f.vmPowerActions).toEqual(actions);
      expect(f.state.verifications).toBe(1);
      expect(f.state.retireCalls).toBe(1);
      const retained = await inventory(f.store.directory);
      f.api.exec = async () => {
        throw Error('synthetic selected cloud already removed');
      };
      expect((await inspect(f)).status).toBe('retired');
      expect((await inspect(f)).runnerRetirementQualified).toBe(true);
      expect(f.commands).toEqual(commands);
      expect(await inventory(f.store.directory)).toEqual(retained);
    }, 90000);
for (const suffix of ['-preparing.json', '-retiring.json', '-retired.json'])
  for (const beforeWrite of [false, true])
    test(`completed retirement publication loss ${beforeWrite ? 'before' : 'after'} ${suffix} recovers exact original cleanup`, async () => {
      const f = await fixture();
      f.state.loseWrite = suffix;
      f.state.beforeWrite = beforeWrite;
      await expect(f.runRetirement()).rejects.toThrow('publication lost');
      expect((await f.runRetirement()).runnerRetirementQualified).toBe(true);
      expect(f.state.verifications).toBe(1);
      expect(f.state.retireCalls).toBe(1);
      expect(f.vmPowerActions).toEqual(['deallocate']);
      expect(f.commands.filter((value) => value === 'apply')).toHaveLength(2);
    }, 60000);
for (const afterEffect of [false, true])
  test(`completed retirement response loss ${afterEffect ? 'after' : 'before'} effect recovers without action replay`, async () => {
    const f = await fixture();
    f.state.loseRetireAfter = afterEffect;
    f.state.loseRetireBefore = !afterEffect;
    await expect(f.runRetirement()).rejects.toThrow('response lost');
    const retained = await inventory(f.store.directory),
      commands = [...f.commands],
      retired = await inspect(f);
    expect(retired.status).toBe(afterEffect ? 'retired-unpublished' : 'preparing');
    expect(retired.runnerRetirementQualified).toBe(false);
    expect(await inventory(f.store.directory)).toEqual(retained);
    expect(f.commands).toEqual(commands);
    expect((await f.runRetirement()).runnerRetirementQualified).toBe(true);
    expect(f.state.verifications).toBe(1);
    expect(f.vmPowerActions).toEqual(['deallocate']);
    expect(f.state.retireCalls).toBe(afterEffect ? 1 : 2);
  }, 60000);
for (const residual of ['resource', 'output'])
  test(`completed state-only release cannot retire residual full-state ${residual}`, async () => {
    const f = await fixture();
    if (residual === 'resource')
      f.appliedState.extraResources.push({
        address: 'terraform_data.foreign',
        type: 'terraform_data',
        values: { id: 'synthetic' },
      });
    else f.appliedState.extraOutputs.retained = { value: 'synthetic' };
    await expect(f.runRetirement()).rejects.toThrow();
    expect(f.appliedState.control).toBeNull();
    expect(f.state.verifications).toBe(0);
    expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
    expect(f.vmPowerActions).toEqual(['deallocate']);
  }, 60000);
test('completed independent cleanup failure preserves original final inputs for exact retry', async () => {
  const f = await fixture();
  f.state.failVerifier = true;
  await expect(f.runRetirement()).rejects.toThrow('verifier unavailable');
  expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
  f.state.failVerifier = false;
  expect((await f.runRetirement()).runnerRetirementQualified).toBe(true);
  expect(f.vmPowerActions).toEqual(['deallocate']);
}, 60000);
for (const suffix of ['-preparing.json', '-retiring.json', '-retired.json'])
  for (const missing of [false, true])
    test(`completed read-only ${missing ? 'missing' : 'foreign'} ${suffix} cannot substitute marker existence`, async () => {
      const f = await fixture();
      await f.runRetirement();
      const name = await f.retirementPacketName(suffix);
      if (missing) await rm(join(f.store.directory, name));
      else await f.store.write(name, { ...((await f.store.read(name)) as object), foreign: true });
      const retained = await inventory(f.store.directory),
        commands = [...f.commands];
      if (missing && suffix === '-retired.json') {
        const result = await inspect(f);
        expect(result.status).toBe('retired-unpublished');
        expect(result.runnerRetirementQualified).toBe(false);
      } else await expect(inspect(f)).rejects.toThrow();
      expect(f.commands).toEqual(commands);
      expect(await inventory(f.store.directory)).toEqual(retained);
    }, 60000);
for (const suffix of [
  'mutation-plan',
  'mutation-binding',
  'mutation-outcome',
  'mutation-complete',
  'release-plan',
  'release-binding',
  'release-outcome',
  'release-complete',
  'final-plan',
  'current-no-change-plan',
])
  test(`completed retired recovery rejects changed original ${suffix}`, async () => {
    const f = await fixture();
    await f.runRetirement();
    const name = `${f.plan.planId}-terraform-network-node-1-deallocate-${suffix}.json`;
    await f.store.write(name, { ...((await f.store.read(name)) as object), foreign: true });
    const commands = [...f.commands];
    await expect(inspect(f)).rejects.toThrow();
    await expect(f.runRetirement()).rejects.toThrow();
    expect(f.commands).toEqual(commands);
    expect(f.vmPowerActions).toEqual(['deallocate']);
  }, 60000);
test('completed retired recovery rejects changed original finalizing authorization', async () => {
  const f = await fixture();
  await f.runRetirement();
  const name = (await readdir(f.store.directory)).find((name) => name.startsWith('azure-power-finalize-'));
  if (!name) throw Error('finalizing packet missing');
  await f.store.write(name, { ...((await f.store.read(name)) as object), foreign: true });
  await expect(inspect(f)).rejects.toThrow();
  await expect(f.runRetirement()).rejects.toThrow();
  expect(f.vmPowerActions).toEqual(['deallocate']);
}, 60000);
for (const phase of ['mutation', 'release'] as const)
  for (const state of ['planned', 'applying', 'missing'] as const)
    test(`completed ${phase} ${state} journal cannot substitute submitted original phase custody`, async () => {
      const f = await fixture(),
        open = f.stageTerraform.open;
      f.stageTerraform.open = async (...args) => {
        const session = await open(...args),
          read = session.readPlanApplicationHistory;
        if (!read) throw Error('actual history unavailable');
        session.readPlanApplicationHistory = async (...input) => {
          const result = await read(...input);
          const receipt = await f.store.read(`${f.plan.planId}-terraform-network-node-1-deallocate-${phase}-plan.json`);
          if (canonicalSha256(receipt) !== result.receiptSha256) return result;
          return {
            ...result,
            matches:
              state === 'missing'
                ? []
                : result.matches.map((row) => ({ ...row, state: state as 'planned' | 'applying' })),
          };
        };
        return session;
      };
      await expect(f.runRetirement()).rejects.toThrow();
      expect(f.state.retireCalls).toBe(0);
      expect(f.vmPowerActions).toEqual(['deallocate']);
    }, 60000);
test('completed current later ordinary plan cannot replace original final plan bytes', async () => {
  const f = await fixture();
  await (await f.resumeSelectedRunner()).plan({});
  await expect(f.runRetirement()).rejects.toThrow('ordinary final journal');
  expect(f.state.retireCalls).toBe(0);
  expect(f.vmPowerActions).toEqual(['deallocate']);
}, 60000);
test('completed missing phase completion rejects before preparing cleanup', async () => {
  const f = await fixture();
  await rm(join(f.store.directory, `${f.plan.planId}-terraform-network-node-1-deallocate-mutation-complete.json`));
  await expect(f.runRetirement()).rejects.toThrow();
  expect(f.state.retireCalls).toBe(0);
}, 60000);
test('completed partial recorded retirement is read-only unqualified, then resumes original removal without execution', async () => {
  const f = await fixture();
  await writeFile(join(f.directory, 'private-fixture.txt'), 'SYNTHETIC_PRIVATE', { mode: 0o600 });
  await f.runRetirement();
  const path = join(f.directory, 'artifact-retirement.json'),
    marker = JSON.parse(await readFile(path, 'utf8'));
  marker.status = 'retiring';
  await writeFile(path, JSON.stringify(marker), { mode: 0o600 });
  await writeFile(join(f.directory, 'private-fixture.txt'), 'SYNTHETIC_PRIVATE', { mode: 0o600 });
  await rm(join(f.store.directory, await f.retirementPacketName('-retired.json')));
  const retained = await inventory(f.store.directory),
    commands = [...f.commands];
  expect((await inspect(f)).status).toBe('retiring');
  expect((await inspect(f)).runnerRetirementQualified).toBe(false);
  expect(await inventory(f.store.directory)).toEqual(retained);
  expect((await f.runRetirement()).runnerRetirementQualified).toBe(true);
  expect(f.commands).toEqual(commands);
  expect(f.state.verifications).toBe(1);
  expect(f.vmPowerActions).toEqual(['deallocate']);
}, 60000);
for (const fulfilled of [false, true])
  test(`completed ignored retirement ${fulfilled ? 'fulfillment' : 'rejection'} holds both lifecycle locks until settlement`, async () => {
    const f = await fixture(),
      controller = new AbortController(),
      started = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>();
    f.state.retireStarted = () => started.resolve();
    f.state.retireGate = gate.promise;
    f.state.ignoreRetireSignal = fulfilled;
    const attempt = f.runRetirement(controller.signal).catch((error: unknown) => error);
    await started.promise;
    controller.abort(Error('synthetic completed retirement interruption'));
    const caught = await attempt;
    expect(caught).toBeInstanceOf(AzureTerraformPowerLifecycleInterrupted);
    if (!(caught instanceof AzureTerraformPowerLifecycleInterrupted)) throw Error('owning interruption missing');
    expect(await readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).toBeDefined();
    expect(await readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).toBeDefined();
    await expect(f.runRetirement()).rejects.toThrow();
    gate.resolve();
    const settled = await caught.completion;
    expect(settled.locksReleased).toBe(true);
    expect(settled.mutationSettlements).toEqual([fulfilled ? 'fulfilled' : 'rejected']);
    expect(
      (await readdir(f.store.directory)).filter(
        (name) => name.startsWith('azure-power-completed-retirement-') && name.endsWith('-retired.json'),
      ),
    ).toEqual([]);
    f.state.retireStarted = undefined;
    f.state.retireGate = undefined;
    f.state.ignoreRetireSignal = false;
    expect((await f.runRetirement()).runnerRetirementQualified).toBe(true);
    expect(f.vmPowerActions).toEqual(['deallocate']);
  }, 60000);
test('completed pre-aborted retirement or inspection publishes nothing', async () => {
  const f = await fixture(),
    controller = new AbortController();
  controller.abort();
  const retained = await inventory(f.store.directory);
  await expect(f.runRetirement(controller.signal)).rejects.toThrow();
  await expect(inspect(f, controller.signal)).rejects.toThrow();
  expect(await inventory(f.store.directory)).toEqual(retained);
  expect(f.state.retireCalls).toBe(0);
}, 60000);
test('completed dummy cleanup acknowledgment cannot authorize a retired publication', async () => {
  const f = await fixture(),
    open = f.stageTerraform.open;
  f.stageTerraform.open = async (...args) => {
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
  await expect(f.runRetirement()).rejects.toThrow('remains incomplete');
  expect(f.state.verifications).toBe(0);
  expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
}, 60000);

test('completed stage with cancellation namespace cannot use submitted-phase retirement', async () => {
  const f = await fixture(),
    identity = canonicalSha256({
      planSha256: f.plan.planSha256,
      selectedNode: 1,
      selectedOperation: 'deallocate',
    }).slice(0, 24);
  await f.store.write(`azure-power-cancel-${identity}.json`, { status: 'cancelled', syntheticForeign: true });
  await expect(f.runRetirement()).rejects.toThrow('separate retirement contract');
  expect(f.state.retireCalls).toBe(0);
  expect(f.vmPowerActions).toEqual(['deallocate']);
}, 60000);
test('completed unavailable authenticated reader cannot use marker existence or acknowledge cleanup', async () => {
  const f = await fixture(),
    open = f.stageTerraform.open;
  f.stageTerraform.open = async (...args) => {
    const session = await open(...args);
    session.readArtifactRetirement = undefined;
    return session;
  };
  await expect(f.runRetirement()).rejects.toThrow('retirement reader unavailable');
  expect(f.state.retireCalls).toBe(0);
  expect(f.vmPowerActions).toEqual(['deallocate']);
}, 60000);
test('completed retired response recovery still requires current selected cloud evidence before publication', async () => {
  const f = await fixture();
  f.state.loseWrite = '-retired.json';
  f.state.beforeWrite = true;
  await expect(f.runRetirement()).rejects.toThrow('publication lost');
  f.api.exec = async () => {
    throw Error('synthetic selected cloud unavailable');
  };
  const commands = [...f.commands];
  await expect(f.runRetirement()).rejects.toThrow();
  expect((await inspect(f)).status).toBe('retired-unpublished');
  expect((await inspect(f)).runnerRetirementQualified).toBe(false);
  expect(f.commands).toEqual(commands);
  expect(f.state.retireCalls).toBe(1);
}, 60000);
test('completed read-only original custody needs no publication or mutation methods', async () => {
  const f = await fixture();
  await f.runRetirement();
  const open = f.stageTerraform.open;
  f.stageTerraform.open = async (...args) => {
    const session = await open(...args);
    session.retireArtifacts = undefined;
    return session;
  };
  f.store.write = async () => {
    throw Error('inspection attempted publication');
  };
  const retained = await inventory(f.store.directory),
    commands = [...f.commands];
  expect((await inspect(f)).status).toBe('retired');
  expect(await inventory(f.store.directory)).toEqual(retained);
  expect(f.commands).toEqual(commands);
}, 60000);
for (const mutation of [false, true])
  test(`completed ${mutation ? 'mutation recovery' : 'read-only'} boundary rejects changed retiring authorization`, async () => {
    const f = await fixture();
    await f.runRetirement();
    const name = await f.retirementPacketName('-retiring.json'),
      open = f.stageTerraform.open;
    let reads = 0;
    f.stageTerraform.open = async (...args) => {
      const session = await open(...args),
        read = session.readArtifactRetirement;
      if (!read) throw Error('actual reader unavailable');
      session.readArtifactRetirement = async (...input) => {
        const value = await read(...input);
        if (++reads === 2) await f.store.write(name, { ...((await f.store.read(name)) as object), foreign: true });
        return value;
      };
      return session;
    };
    const commands = [...f.commands];
    await expect(mutation ? f.runRetirement() : inspect(f)).rejects.toThrow();
    expect(f.commands).toEqual(commands);
    expect(f.state.retireCalls).toBe(1);
  }, 60000);
test('completed ignored read interruption leaves all retained bytes and no late publication', async () => {
  const f = await fixture();
  await f.runRetirement();
  const open = f.stageTerraform.open,
    started = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>(),
    controller = new AbortController();
  f.stageTerraform.open = async (...args) => {
    const session = await open(...args),
      read = session.readArtifactRetirement;
    if (!read) throw Error('actual reader unavailable');
    session.readArtifactRetirement = async (...input) => {
      started.resolve();
      await gate.promise;
      return read(...input);
    };
    return session;
  };
  const retained = await inventory(f.store.directory),
    commands = [...f.commands],
    attempt = inspect(f, controller.signal);
  await started.promise;
  controller.abort(Error('synthetic completed observer abort'));
  await expect(attempt).rejects.toThrow('synthetic completed observer abort');
  gate.resolve();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(await inventory(f.store.directory)).toEqual(retained);
  expect(f.commands).toEqual(commands);
}, 60000);
for (const published of [false, true])
  test(`completed runner history joins ${published ? 'published' : 'unpublished'} exact retirement without execution`, async () => {
    const f = await fixture();
    await f.runRetirement();
    if (!published) await rm(join(f.store.directory, await f.retirementPacketName('-retired.json')));
    const retained = await inventory(f.store.directory),
      commands = [...f.commands];
    const result = await readAzureTerraformNetworkPowerRunnerHistory(
      f.plan,
      f.store,
      f.stageTerraform,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    );
    const row = result.rows.find((row) => row.stage === f.selectedDeployment.stage);
    expect(row?.status).toBe(published ? 'retired' : 'retired-awaiting-receipt');
    expect(row?.retirement?.scope).toBe('selected-completed-network-power-retirement-history');
    expect(row?.retirement?.status).toBe(published ? 'retired' : 'retired-unpublished');
    expect(row?.retirement?.runnerRetirementQualified).toBe(published);
    expect(result.runnerRetirementQualified).toBe(false);
    expect(result.currentOperationalAcceptanceQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(await inventory(f.store.directory)).toEqual(retained);
    expect(f.commands).toEqual(commands);
  }, 60000);

for (const mode of ['foreign', 'missing-current', 'partial-phases', 'duplicate-phases', 'nonprimitive-location'])
  test(`completed read-only malformed frozen original ${mode} remains rejected before a barrier`, async () => {
    const f = await fixture();
    f.state.loseRetireBefore = true;
    await expect(f.runRetirement()).rejects.toThrow('response lost');
    const name = await f.retirementPacketName('-preparing.json'),
      packet = (await f.store.read(name)) as Record<string, unknown>,
      original = packet.original as Record<string, unknown>;
    if (mode === 'foreign') original.foreign = true;
    else if (mode === 'missing-current') delete original.current;
    else if (mode === 'partial-phases') original.phases = (original.phases as unknown[]).slice(0, 1);
    else if (mode === 'duplicate-phases')
      original.phases = [(original.phases as unknown[])[0], (original.phases as unknown[])[0]];
    else
      (
        original.phases as Array<{ history: { matches: Array<{ location: unknown }> } }>
      )[0].history.matches[0].location = ['revision'];
    await f.store.write(name, packet);
    const retained = await inventory(f.store.directory),
      commands = [...f.commands];
    await expect(inspect(f)).rejects.toThrow();
    expect(f.commands).toEqual(commands);
    expect(await inventory(f.store.directory)).toEqual(retained);
    expect(f.state.retireCalls).toBe(1);
  }, 60000);

async function advanceCompletedCheckpoint(f: Awaited<ReturnType<typeof fixture>>) {
  const graph = await readAzureTerraformNetworkRetirementGraph(
    f.plan,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  const checkpoint = await AzureTerraformNetworkCheckpoint.open(
    f.plan,
    graph.original.binding,
    f.store,
    f.dependencies.qualifyAcceptance,
  );
  const current = await checkpoint.read();
  expect(current.phase).toBe('prepared');
  await checkpoint.recordStage(current.checkpointSha256, 1, 'deallocated');
  return graph;
}
for (const operation of ['deallocate', 'start'] as const)
  for (const ha of [false, true])
    test(`completed retired provenance survives full ${ha ? 'three-node HA' : 'single'} serial continuation from ${operation}`, async () => {
      const f = await fixture(operation, false, ha, ha ? 3 : 1);
      await f.runRetirement();
      const original = await inspect(f);
      expect(original.runnerRetirementQualified).toBe(true);
      await f.run();
      const current = await readAzureTerraformNetworkRetirementGraph(
        f.plan,
        f.store,
        f.loaders,
        f.site,
        f.dependencies.qualifyAcceptance,
      );
      expect(current.nodes).toHaveLength(ha ? 3 : 1);
      expect(current.nodes.every((row) => row.phase === 'accepted')).toBe(true);
      expect(canonicalSha256(current)).not.toBe(original.graphSha256);
      const retained = await inventory(f.store.directory),
        commands = [...f.commands],
        calls = [...f.calls];
      f.api.exec = async () => {
        throw Error('synthetic cloud unavailable during history inspection');
      };
      expect(await inspect(f)).toEqual(original);
      expect(f.commands).toEqual(commands);
      expect(f.calls).toEqual(calls);
      expect(await inventory(f.store.directory)).toEqual(retained);
      expect(f.vmPowerActions).toEqual([operation]);
    }, 120000);
for (const corruption of ['missing', 'foreign-field', 'owner', 'digest', 'pointer', 'absence', 'qualification'])
  test(`completed retired history rejects ${corruption} frozen original graph after serial advancement`, async () => {
    const f = await fixture();
    await f.runRetirement();
    await advanceCompletedCheckpoint(f);
    const name = await f.retirementPacketName('-preparing.json'),
      prepared = (await f.store.read(name)) as Record<string, unknown>,
      graph = prepared.originalGraph as Awaited<ReturnType<typeof readAzureTerraformNetworkRetirementGraph>>;
    if (corruption === 'missing') delete prepared.originalGraph;
    else if (corruption === 'foreign-field') prepared.originalGraph = { ...graph, foreign: true };
    else if (corruption === 'owner') graph.original.binding.owner.deploymentId += '-foreign';
    else if (corruption === 'digest') prepared.graphSha256 = 'f'.repeat(64);
    else if (corruption === 'pointer')
      graph.packetSha256ByName[`${f.plan.planId}-terraform-network-driver-checkpoint.json`] = 'f'.repeat(64);
    else if (corruption === 'absence') graph.absentPackets.push(`${f.plan.planId}-terraform-network-undeclared.json`);
    else prepared.originalGraph = { ...graph, runnerRetirementQualified: true };
    await f.store.write(name, prepared);
    const retained = await inventory(f.store.directory),
      commands = [...f.commands];
    await expect(inspect(f)).rejects.toThrow();
    expect(f.commands).toEqual(commands);
    expect(await inventory(f.store.directory)).toEqual(retained);
  }, 60000);
test('completed retired history requires retained original immutable revision after serial advancement', async () => {
  const f = await fixture();
  await f.runRetirement();
  const graph = await advanceCompletedCheckpoint(f);
  const revision = graph.checkpoint.snapshot?.checkpoint.revision;
  expect(revision).toBeDefined();
  await rm(join(f.store.directory, `${f.plan.planId}-terraform-network-driver-revision-${revision}.json`));
  const retained = await inventory(f.store.directory),
    commands = [...f.commands];
  await expect(inspect(f)).rejects.toThrow();
  expect(f.commands).toEqual(commands);
  expect(await inventory(f.store.directory)).toEqual(retained);
}, 60000);
test('completed historical qualification does not relax mutation current cloud baseline after serial continuation', async () => {
  const f = await fixture();
  await f.runRetirement();
  await f.run();
  expect((await inspect(f)).runnerRetirementQualified).toBe(true);
  const retained = await inventory(f.store.directory),
    commands = [...f.commands];
  await expect(f.runRetirement()).rejects.toThrow();
  expect(f.commands).toEqual(commands);
  expect(await inventory(f.store.directory)).toEqual(retained);
}, 120000);

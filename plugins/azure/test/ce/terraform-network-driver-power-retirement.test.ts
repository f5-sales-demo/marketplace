import { expect } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CleanupRequest,
  encode,
  hash,
  type IndependentCleanupEvidence,
} from '../../../terraform/src/cleanup-verifier-worker';
import { retireAzureTerraformNetworkCompletedPowerStageInDriver } from '../../src/ce/terraform-network-power-completed-retirement';
import { AzureTerraformPowerLifecycleInterrupted } from '../../src/ce/terraform-network-power-lifecycle';
import { test } from './owned-fixture-test';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';

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

for (const ha of [false, true])
  test(`actual serial power runner retirement ${ha ? 'HA' : 'single'}`, async () => {
    const f = await terraformNetworkSerialPowerFixture(ha, async (request) => evidence(request, '1.16.5'));
    const checked: string[] = [];
    const assertRetired = async (node: number, operation: string) => {
      const stage = `network-${f.plan.planSha256.slice(0, 24)}-node-${node}-${operation}`;
      const directory = join(f.store.directory, 'terraform-stages', stage, f.plan.deploymentName);
      expect((await readdir(directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
      const marker = JSON.parse(await readFile(join(directory, 'artifact-retirement.json'), 'utf8'));
      expect(marker.status).toBe('runner-artifacts-retired');
      checked.push(`${node}:${operation}`);
    };
    const nic = f.dependencies.runNic,
      routing = f.dependencies.runRouting;
    f.dependencies.runNic = async (...args) => {
      await assertRetired(args[3], 'deallocate');
      return nic(...args);
    };
    f.dependencies.runRouting = async (...args) => {
      await assertRetired(args[4], 'start');
      return routing(...args);
    };
    expect((await f.run()).status).toBe('complete');
    expect(f.stages.size).toBe(ha ? 6 : 2);
    expect(f.vmPowerActions).toEqual(Array.from({ length: ha ? 3 : 1 }, () => ['deallocate', 'start']).flat());
    const names = await readdir(f.store.directory);
    expect(
      names.filter((name) => name.startsWith('azure-power-completed-retirement-') && name.endsWith('-retired.json'))
        .length,
    ).toBe(ha ? 6 : 2);
    expect(checked).toEqual(
      Array.from({ length: ha ? 3 : 1 }, (_, i) => [`${i + 1}:deallocate`, `${i + 1}:start`]).flat(),
    );
    const before = [...f.vmPowerActions];
    expect((await f.run()).status).toBe('complete');
    expect(f.vmPowerActions).toEqual(before);
  }, 240000);

test('lost actual retirement response resumes before NIC movement without VM replay', async () => {
  const f = await terraformNetworkSerialPowerFixture(false, async (request) => evidence(request, '1.16.5'));
  const open = f.terraform.open;
  let lost = false;
  f.terraform.open = async (...args) => {
    const session = await open(...args);
    if (args[1].stage) {
      const retire = session.retireArtifacts;
      if (!retire) throw Error('actual runner retirement method missing');
      session.retireArtifacts = async (...values) => {
        const result = await retire(...values);
        if (!lost) {
          lost = true;
          throw Error('synthetic retirement response lost after effect');
        }
        return result;
      };
    }
    return session;
  };
  await expect(f.run()).rejects.toThrow('retirement response lost after effect');
  expect(f.calls).toEqual(['1:deallocate']);
  expect(f.vmPowerActions).toEqual(['deallocate']);
  expect((await f.run()).status).toBe('complete');
  expect(f.vmPowerActions).toEqual(['deallocate', 'start']);
}, 120000);

for (const field of [
  'sourcePlanSha256',
  'node',
  'operation',
  'stage',
  'independentCleanupQualified',
  'wholeAppliedStateEmptyQualified',
  'runnerRetirementQualified',
  'markerSha256',
  'extra',
]) {
  test(`serial refuses wrong or incomplete retirement ${field} before checkpoint advancement`, async () => {
    const f = await terraformNetworkSerialPowerFixture(false, async (request) => evidence(request, '1.16.5'));
    f.dependencies.retirePower = async (...args) => {
      const result = await retireAzureTerraformNetworkCompletedPowerStageInDriver(...args);
      return {
        ...result,
        [field]: field === 'node' ? 2 : field.endsWith('Qualified') ? false : 'wrong',
      } as typeof result;
    };
    await expect(f.run()).rejects.toThrow('complete exact selected power runner retirement');
    expect(f.calls).toEqual(['1:deallocate']);
    expect(f.vmPowerActions).toEqual(['deallocate']);
    delete f.dependencies.retirePower;
    expect((await f.run()).status).toBe('complete');
    expect(f.vmPowerActions).toEqual(['deallocate', 'start']);
  }, 120000);
}
test('acknowledgment cannot authorize serial NIC advancement', async () => {
  const f = await terraformNetworkSerialPowerFixture(false, async (request) => evidence(request, '1.16.5'));
  f.dependencies.retirePower = async () => ({ ok: true }) as never;
  await expect(f.run()).rejects.toThrow('complete exact selected power runner retirement');
  expect(f.calls).toEqual(['1:deallocate']);
  delete f.dependencies.retirePower;
  expect((await f.run()).status).toBe('complete');
  expect(f.vmPowerActions).toEqual(['deallocate', 'start']);
}, 120000);
test('serial driver retains actual ownership through ignored retirement abort and settlement', async () => {
  const f = await terraformNetworkSerialPowerFixture(false, async (request) => evidence(request, '1.16.5'));
  const open = f.terraform.open,
    controller = new AbortController();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let gated = false;
  f.terraform.open = async (...args) => {
    const session = await open(...args);
    if (args[1].stage && !gated) {
      const retire = session.retireArtifacts;
      if (!retire) throw Error('retirement method missing');
      session.retireArtifacts = async (...values) => {
        gated = true;
        started();
        await gate;
        return retire(values[0], values[1], values[2]);
      };
    }
    return session;
  };
  const running = f.run(controller.signal).catch((error) => error);
  await ready;
  controller.abort(Error('synthetic serial interruption'));
  const error = await running;
  expect(error).toBeInstanceOf(AzureTerraformPowerLifecycleInterrupted);
  expect(await readdir(join(f.store.directory, '.terraform-network-driver-lock'))).toEqual(['claim.json']);
  await expect(f.run()).rejects.toThrow('Operation lock is held by a live process');
  release();
  const settled = await error.completion;
  expect(settled.locksReleased).toBe(true);
  expect(settled.mutationSettlements).toContain('fulfilled');
  expect(f.calls).toEqual(['1:deallocate']);
  expect((await f.run()).status).toBe('complete');
  expect(f.vmPowerActions).toEqual(['deallocate', 'start']);
}, 120000);

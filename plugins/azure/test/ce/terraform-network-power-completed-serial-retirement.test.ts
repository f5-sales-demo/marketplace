import { afterEach, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CleanupRequest,
  encode,
  hash,
  type IndependentCleanupEvidence,
} from '../../../terraform/src/cleanup-verifier-worker';
import {
  type AzureTerraformNetworkDriverLease,
  acquireAzureTerraformNetworkDriverLease,
  verifyAzureTerraformNetworkDriverLease,
} from '../../src/ce/terraform-network-driver-lease';
import {
  retireAzureTerraformNetworkCompletedPowerStage,
  retireAzureTerraformNetworkCompletedPowerStageInDriver,
} from '../../src/ce/terraform-network-power-completed-retirement';
import { AzureTerraformPowerLifecycleInterrupted } from '../../src/ce/terraform-network-power-lifecycle';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkCompletedPowerFixture } from './terraform-network-power-completed-fixture';

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

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
for (const operation of ['start', 'deallocate'] as const)
  for (const ha of [false, true])
    test(`actual completed ${operation} ${ha ? 'third-node HA' : 'single'} runner retires under already-held serial driver lock`, async () => {
      const f = await terraformNetworkCompletedPowerFixture(ha, ha ? 3 : 1, operation, false, async (request) =>
        evidence(request, f.selectedDeployment.terraformVersion),
      );
      const { lease, release } = await acquireAzureTerraformNetworkDriverLease(f.store.directory);
      try {
        const retired = await retireAzureTerraformNetworkCompletedPowerStageInDriver(
          lease,
          f.plan,
          ha ? 3 : 1,
          operation,
          f.stageTerraform,
          f.store,
          f.loaders,
          f.site,
          f.dependencies.qualifyAcceptance,
          f.api,
          {},
        );
        expect(retired.runnerRetirementQualified).toBe(true);
        expect(f.vmPowerActions).toEqual([operation]);
        await verifyAzureTerraformNetworkDriverLease(lease, f.store.directory);
      } finally {
        await release();
      }
    }, 90000);

for (const fulfilled of [false, true])
  test(`serial ignored retirement ${fulfilled ? 'fulfillment' : 'rejection'} retains driver and power locks until actual settlement`, async () => {
    const f = await terraformNetworkCompletedPowerFixture(false, 1, 'deallocate', false, async (request) =>
      evidence(request, f.selectedDeployment.terraformVersion),
    );
    const owner = await acquireAzureTerraformNetworkDriverLease(f.store.directory),
      open = f.stageTerraform.open,
      controller = new AbortController(),
      started = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>();
    f.stageTerraform.open = async (...args) => {
      const session = await open(...args),
        runner = await f.resumeSelectedRunner();
      session.retireArtifacts = async (...input) => {
        started.resolve();
        await gate.promise;
        if (!fulfilled) throw Error('synthetic settled retirement rejection');
        return runner.retireArtifacts(input[0], input[1], input[2]);
      };
      return session;
    };
    try {
      const attempt = retireAzureTerraformNetworkCompletedPowerStageInDriver(
        owner.lease,
        f.plan,
        1,
        'deallocate',
        f.stageTerraform,
        f.store,
        f.loaders,
        f.site,
        f.dependencies.qualifyAcceptance,
        f.api,
        {},
        controller.signal,
      ).catch((error: unknown) => error);
      await started.promise;
      controller.abort(Error('synthetic serial retirement abort'));
      const caught = await attempt;
      expect(caught).toBeInstanceOf(AzureTerraformPowerLifecycleInterrupted);
      if (!(caught instanceof AzureTerraformPowerLifecycleInterrupted)) throw Error('serial interruption missing');
      expect(await readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).toBeDefined();
      expect(await readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).toBeDefined();
      gate.resolve();
      const settlement = await caught.completion;
      expect(settlement.mutationSettlements).toEqual([fulfilled ? 'fulfilled' : 'rejected']);
      expect(settlement.locksReleased).toBe(true);
      await expect(readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).rejects.toThrow();
      expect(await readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).toBeDefined();
    } finally {
      gate.resolve();
      await owner.release();
    }
  }, 60000);

for (const invalid of ['missing', 'null', 'forged', 'copied', 'foreign', 'released', 'claim-changed'] as const)
  test(`serial retirement rejects ${invalid} driver ownership before opening a runner or probing cloud`, async () => {
    const f = await terraformNetworkCompletedPowerFixture(false, 1, 'deallocate', false, async (request) =>
      evidence(request, f.selectedDeployment.terraformVersion),
    );
    const owner = await acquireAzureTerraformNetworkDriverLease(f.store.directory),
      claim = join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'),
      bytes = await readFile(claim);
    let lease = owner.lease,
      released = false,
      foreign: Awaited<ReturnType<typeof acquireAzureTerraformNetworkDriverLease>> | undefined,
      opens = 0;
    const open = f.stageTerraform.open;
    f.stageTerraform.open = async (...args) => {
      opens++;
      return open(...args);
    };
    try {
      if (invalid === 'missing') lease = undefined as unknown as AzureTerraformNetworkDriverLease;
      else if (invalid === 'null') lease = null as unknown as AzureTerraformNetworkDriverLease;
      else if (invalid === 'forged') lease = {} as AzureTerraformNetworkDriverLease;
      else if (invalid === 'copied') lease = structuredClone(lease);
      else if (invalid === 'foreign') {
        const path = join(f.store.directory, 'foreign-driver-fixture');
        await mkdir(path, { mode: 0o700 });
        foreign = await acquireAzureTerraformNetworkDriverLease(path);
        lease = foreign.lease;
      } else if (invalid === 'released') {
        await owner.release();
        released = true;
      } else await writeFile(claim, Buffer.concat([bytes, Buffer.from(' ')]), { mode: 0o600 });
      const commands = [...f.commands],
        calls = [...f.calls];
      await expect(
        retireAzureTerraformNetworkCompletedPowerStageInDriver(
          lease,
          f.plan,
          1,
          'deallocate',
          f.stageTerraform,
          f.store,
          f.loaders,
          f.site,
          f.dependencies.qualifyAcceptance,
          f.api,
          {},
        ),
      ).rejects.toThrow();
      expect(opens).toBe(0);
      expect(f.commands).toEqual(commands);
      expect(f.calls).toEqual(calls);
    } finally {
      if (invalid === 'claim-changed') await writeFile(claim, bytes, { mode: 0o600 });
      await foreign?.release();
      if (!released) await owner.release();
    }
  }, 60000);
test('standalone retirement still rejects an already-held driver claim instead of bypassing ownership', async () => {
  const f = await terraformNetworkCompletedPowerFixture(false, 1, 'deallocate', false, async (request) =>
    evidence(request, f.selectedDeployment.terraformVersion),
  );
  const owner = await acquireAzureTerraformNetworkDriverLease(f.store.directory);
  try {
    await expect(
      retireAzureTerraformNetworkCompletedPowerStage(
        f.plan,
        1,
        'deallocate',
        f.stageTerraform,
        f.store,
        f.loaders,
        f.site,
        f.dependencies.qualifyAcceptance,
        f.api,
        {},
      ),
    ).rejects.toThrow('held by a live process');
  } finally {
    await owner.release();
  }
}, 60000);

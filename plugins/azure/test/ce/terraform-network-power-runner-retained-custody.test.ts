import { expect } from 'bun:test';
import { chmod, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CleanupRequest,
  encode,
  hash,
  type IndependentCleanupEvidence,
} from '../../../terraform/src/cleanup-verifier-worker';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkPowerRunnerHistory } from '../../src/ce/terraform-network-power-runner-history';
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

for (const damage of [
  'marker-bytes',
  'manifest-bytes',
  'marker-permissions',
  'manifest-symlink',
  'missing-marker',
  'extra-artifact',
  'missing-publication',
]) {
  test(`completed child custody rejects ${damage} after initial authenticated inspection`, async () => {
    const f = await terraformNetworkSerialPowerFixture(false, async (request) => evidence(request, '1.16.5'));
    expect((await f.run()).status).toBe('complete');
    const open = f.terraform.open;
    let changed = false;
    f.terraform.open = async (...args) => {
      const session = await open(...args);
      if (!changed && args[1].stage?.endsWith('-start')) {
        changed = true;
        const directory = join(
          f.store.directory,
          'terraform-stages',
          `network-${f.plan.planSha256.slice(0, 24)}-node-1-deallocate`,
          f.plan.deploymentName,
        );
        const marker = join(directory, 'artifact-retirement.json'),
          manifest = join(directory, 'deployment.json');
        if (damage === 'marker-bytes' || damage === 'manifest-bytes') {
          const path = damage === 'marker-bytes' ? marker : manifest;
          await writeFile(path, `${await readFile(path, 'utf8')}\n`, { mode: 0o600 });
        } else if (damage === 'marker-permissions') await chmod(marker, 0o644);
        else if (damage === 'manifest-symlink') {
          const target = join(f.store.directory, 'copied-retained-manifest.json');
          await writeFile(target, await readFile(manifest), { mode: 0o600 });
          await rm(manifest);
          await symlink(target, manifest);
        } else if (damage === 'missing-marker') await rm(marker);
        else if (damage === 'extra-artifact')
          await writeFile(join(directory, 'foreign.tfstate'), '{}', { mode: 0o600 });
        else {
          const identity = canonicalSha256({ planSha256: f.plan.planSha256, node: 1, operation: 'deallocate' }).slice(
            0,
            24,
          );
          await rm(join(f.store.directory, `azure-power-completed-retirement-${identity}-retired.json`));
        }
      }
      return session;
    };
    const commands = [...f.commands],
      actions = [...f.vmPowerActions];
    await expect(
      readAzureTerraformNetworkPowerRunnerHistory(
        f.plan,
        f.store,
        f.terraform,
        f.loaders,
        f.site,
        f.dependencies.qualifyAcceptance,
      ),
    ).rejects.toThrow();
    expect(changed).toBe(true);
    expect(f.commands).toEqual(commands);
    expect(f.vmPowerActions).toEqual(actions);
  }, 120000);
}
test('unpublished completed retirement remains partial rather than using completed byte shortcut', async () => {
  const f = await terraformNetworkSerialPowerFixture(false, async (request) => evidence(request, '1.16.5'));
  expect((await f.run()).status).toBe('complete');
  const identity = canonicalSha256({ planSha256: f.plan.planSha256, node: 1, operation: 'deallocate' }).slice(0, 24);
  await rm(join(f.store.directory, `azure-power-completed-retirement-${identity}-retired.json`));
  const result = await readAzureTerraformNetworkPowerRunnerHistory(
    f.plan,
    f.store,
    f.terraform,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  expect(result.rows.find((row) => row.operation === 'deallocate')?.status).toBe('retired-awaiting-receipt');
  expect(result.rows.find((row) => row.operation === 'deallocate')?.retirement?.runnerRetirementQualified).toBe(false);
  expect(result.runnerRetirementQualified).toBe(false);
  expect(result.parentRetirementQualified).toBe(false);
}, 120000);

test('all six completed retired children qualify without commands inside existing inspection deadline', async () => {
  const f = await terraformNetworkSerialPowerFixture(true, async (request) => evidence(request, '1.16.5'));
  expect((await f.run()).status).toBe('complete');
  const commands = [...f.commands],
    actions = [...f.vmPowerActions];
  const start = performance.now();
  const result = await readAzureTerraformNetworkPowerRunnerHistory(
    f.plan,
    f.store,
    f.terraform,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  const durationMs = performance.now() - start;
  expect(durationMs).toBeLessThanOrEqual(180000);
  expect(result.rows).toHaveLength(6);
  expect(
    result.rows.every((row) => row.status === 'retired' && row.retirement?.runnerRetirementQualified === true),
  ).toBe(true);
  expect(f.commands).toEqual(commands);
  expect(f.vmPowerActions).toEqual(actions);
  expect(result.currentOperationalAcceptanceQualified).toBe(false);
  expect(result.parentRetirementQualified).toBe(false);
  console.info('six-child read-only inspection durationMs', durationMs);
}, 360000);

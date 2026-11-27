/** Source qualification: original runner files and compiled admission over synthetic cloud observations. */
import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gcpCleanupAdmissionFixture } from '../../gcloud/test/ce/capture-cleanup-admission.test';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import type { CaptureCleanupRecovery, Deployment } from '../src/runner';
import { createCeTerraformService } from '../src/service';

async function fixture() {
  const f = await gcpCleanupAdmissionFixture(),
    admission = await f.open();
  const {
    configurationSha256: _configuration,
    providerLockSha256: _lock,
    ...manifest
  } = JSON.parse(await readFile(join(f.directory, 'deployment.json'), 'utf8'));
  const deployment: Deployment = {
    ...manifest,
    configuration: await readFile(join(f.directory, 'main.tf.json'), 'utf8'),
    providerLock: await readFile(join(f.directory, '.terraform.lock.hcl'), 'utf8'),
  };
  const owner: CeOwner = {
    provider: 'gcp',
    engine: 'terraform',
    account: f.i.project,
    region: f.i.region,
    deploymentId: f.i.deploymentName,
  };
  let storageCalls = 0;
  const platform = {
    storage: async (value: CeOwner) => {
      storageCalls++;
      expect(value).toEqual(owner);
      return { directory: dirname(f.directory) };
    },
  } as unknown as CePlatformService;
  const platformFor = async () => platform;
  return { ...f, admission, deployment, owner, platformFor, storageCalls: () => storageCalls };
}

test('shared service resumes a compiled original cleanup admission while preserving its failed claim and forbidding create replay', async () => {
  const f = await fixture(),
    failed = await readFile(join(f.lock, 'capture-unresolved.json'));
  try {
    const service = createCeTerraformService(f.platformFor, {
      execute: f.inspection.execute,
      captureCleanup: f.admission.recovery,
    });
    const before = f.commands.length;
    const session = await service.open(f.owner, f.deployment, true);
    expect((await session.readStateIdentity?.())?.lineage).toBe(f.state.lineage);
    await expect(session.apply(f.receipt, f.inspection.environment)).rejects.toThrow();
    expect(f.commands).toHaveLength(before);
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
  } finally {
    f.admission.close();
  }
});

test('captured cleanup service requires a compiled executor and refuses resolver/default capability mixing', async () => {
  const f = await fixture();
  try {
    expect(() => createCeTerraformService(f.platformFor, { captureCleanup: f.admission.recovery })).toThrow();
    expect(() =>
      createCeTerraformService(f.platformFor, {
        execute: f.inspection.execute,
        captureCleanup: f.admission.recovery,
        resolveRuntime: async () => ({}),
      }),
    ).toThrow();
  } finally {
    f.admission.close();
  }
});

for (const mode of ['new-prepare', 'foreign-deployment', 'foreign-provider', 'foreign-stage'] as const)
  test(`captured cleanup refuses a different session scope before storage or execution: ${mode}`, async () => {
    const f = await fixture();
    try {
      const service = createCeTerraformService(f.platformFor, {
        execute: f.inspection.execute,
        captureCleanup: f.admission.recovery,
      });
      let owner = f.owner,
        deployment = f.deployment;
      if (mode === 'foreign-deployment') {
        owner = { ...owner, deploymentId: 'example-foreign' };
        deployment = { ...deployment, deploymentId: owner.deploymentId };
      }
      if (mode === 'foreign-provider') {
        owner = { ...owner, provider: 'aws' };
        deployment = { ...deployment, scope: { ...deployment.scope, cloud: 'aws' } };
      }
      if (mode === 'foreign-stage') deployment = { ...deployment, stage: 'example-stage' };
      await expect(service.open(owner, deployment, mode !== 'new-prepare')).rejects.toThrow();
      expect(f.storageCalls()).toBe(0);
    } finally {
      f.admission.close();
    }
  });

test('captured cleanup service snapshots original recovery metadata before caller mutation', async () => {
  const f = await fixture();
  try {
    const recovery: CaptureCleanupRecovery = {
      ...f.admission.recovery,
      state: { ...f.admission.recovery.state },
      resources: f.admission.recovery.resources.map((row) => ({ ...row })),
    };
    const service = createCeTerraformService(f.platformFor, {
      execute: f.inspection.execute,
      captureCleanup: recovery,
    });
    Object.assign(recovery.state, { sha256: '0'.repeat(64) });
    Object.assign(recovery.resources[0], { id: 'example-foreign' });
    const session = await service.open(f.owner, f.deployment, true);
    expect((await session.readStateIdentity?.())?.lineage).toBe(f.state.lineage);
  } finally {
    f.admission.close();
  }
});

test('runtime resolver retains the same compiled cleanup capability and original closure remains mandatory', async () => {
  const f = await fixture();
  try {
    const service = createCeTerraformService(f.platformFor, {
      resolveRuntime: async (request) => {
        expect(request.owner).toEqual(f.owner);
        return { execute: f.inspection.execute, captureCleanup: f.admission.recovery };
      },
    });
    const session = await service.open(f.owner, f.deployment, true);
    f.admission.close();
    await expect(session.readStateIdentity?.()).rejects.toThrow();
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toBeDefined();
  } finally {
    f.admission.close();
  }
});

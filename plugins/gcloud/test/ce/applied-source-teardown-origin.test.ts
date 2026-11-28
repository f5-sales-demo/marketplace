import { expect, test } from 'bun:test';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GcpCapturedTeardownOrigin } from '../../src/ce/captured-teardown-origin';
import { fingerprint } from '../../src/ce/discovery';
import { assertPublicTerraformContext } from '../../src/ce/terraform-context';
import { readPublicTerraformCleanupOwnership } from '../../src/ce/terraform-public-teardown';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { appliedSourceFixture as fixture } from './applied-source-fixtures';

test('successful source cleanup joins original authorization, attested apply and all21 identities without failed flags or public journals', async () => {
  const f = await fixture(),
    origin = await f.open();
  try {
    const runtime = {
      ...f.runtime,
      appliedSourceTeardownOrigin: origin,
      store: {
        directory: f.worker,
        read: async () => {
          throw new Error('No substitute public journal');
        },
      },
    } as unknown as GcpTerraformTeardownRuntime;
    const value = await readPublicTerraformCleanupOwnership(runtime, f.i);
    expect(value.original.kind).toBe('applied-source-qualification');
    expect(value.owned.addresses).toHaveLength(21);
    expect(value.owned.complete).toBe(true);
    expect(value.original.receiptFingerprint).toBe(fingerprint(f.receipt));
    expect(origin.executionAuthorized).toBe(false);
    expect(f.attestations()).toBeGreaterThan(1);
    expect(Object.isFrozen(value.owned.resources)).toBe(true);
    await assertPublicTerraformContext(runtime, f.i);
    expect(await Bun.file(join(f.worker, '.terraform-executor-lock/capture-unresolved.json')).exists()).toBe(false);
  } finally {
    origin.close();
  }
});

for (const mode of [
  'wrong-kind',
  'wrong-plan',
  'wrong-owner',
  'unsubmitted',
  'stale-review',
  'foreign-absence',
  'wrong-image',
  'not-successful',
  'not-closed',
  'terminal-failure',
] as const)
  test(`successful source cleanup refuses invalid original evidence: ${mode}`, async () => {
    const f = await fixture((auth, review, terminal) => {
      if (mode === 'wrong-kind') auth.kind = 'example-unissued';
      if (mode === 'wrong-plan') auth.planSha256 = '0'.repeat(64);
      if (mode === 'wrong-owner') auth.owner = { ...(auth.owner as object), account: 'example-foreign' };
      if (mode === 'unsubmitted') terminal.applyAttempted = false;
      if (mode === 'stale-review') auth.createdAt = (review.reviewedAt as number) + 300001;
      if (mode === 'foreign-absence') (review.absences as Array<{ address: string }>)[0].address = 'example.foreign';
      if (mode === 'wrong-image') review.observerImageId = '1';
      if (mode === 'not-successful') terminal.applySucceeded = false;
      if (mode === 'not-closed') terminal.closeSucceeded = false;
      if (mode === 'terminal-failure') terminal.failure = { name: 'Error', message: 'original capture incomplete' };
    });
    await expect(f.open()).rejects.toThrow();
  });

for (const mode of ['closure', 'attestation', 'state', 'replacement', 'partial'] as const)
  test(`successful source cleanup refuses incomplete original proof: ${mode}`, async () => {
    const f = await fixture();
    f.change(mode);
    if (mode === 'replacement') {
      const live = f.live.get(f.scope[0].selfLink);
      if (!live) throw new Error('Synthetic original VM required');
      live.id = '99999';
    }
    if (mode === 'partial') {
      f.fields[f.addresses[0]] = null;
      f.live.delete(f.scope[0].selfLink);
    }
    await expect(f.open()).rejects.toThrow();
    if (mode === 'closure' || mode === 'attestation') expect(f.reads()).toBe(0);
  });

test('successful source capability rejects copying, replaced evidence, closed lifetime and ambiguous origins', async () => {
  const f = await fixture(),
    origin = await f.open();
  await expect(f.module.readGcpAppliedSourceTeardownOrigin({ ...origin }, f.i)).rejects.toThrow();
  await expect(
    readPublicTerraformCleanupOwnership(
      {
        ...f.runtime,
        appliedSourceTeardownOrigin: origin,
        capturedTeardownOrigin: {} as unknown as GcpCapturedTeardownOrigin,
      },
      f.i,
    ),
  ).rejects.toThrow();
  await expect(
    assertPublicTerraformContext(
      {
        ...f.runtime,
        appliedSourceTeardownOrigin: origin,
        capturedTeardownOrigin: {} as unknown as GcpCapturedTeardownOrigin,
      },
      f.i,
    ),
  ).rejects.toThrow();
  const bytes = await readFile(f.paths.authorization);
  await rename(f.paths.authorization, `${f.paths.authorization}.original`);
  await writeFile(f.paths.authorization, bytes, { mode: 0o400 });
  await expect(f.module.readGcpAppliedSourceTeardownOrigin(origin, f.i)).rejects.toThrow();
  origin.close();
  await expect(f.module.readGcpAppliedSourceTeardownOrigin(origin, f.i)).rejects.toThrow();
});

test('successful source lifetime permits credential rotation and rejects endpoint or closure changes', async () => {
  const f = await fixture(),
    origin = await f.open();
  try {
    const runtime = { ...f.runtime, appliedSourceTeardownOrigin: origin };
    f.runtime.environment.XCSH_API_TOKEN = 'synthetic-refreshed';
    await assertPublicTerraformContext(runtime, f.i);
    f.runtime.environment.XCSH_API_URL = 'https://other.example.test';
    await expect(assertPublicTerraformContext(runtime, f.i)).rejects.toThrow();
    f.runtime.environment.XCSH_API_URL = 'https://tenant.example.test';
    f.change('closure');
    await expect(f.module.readGcpAppliedSourceTeardownOrigin(origin, f.i)).rejects.toThrow();
  } finally {
    origin.close();
  }
});

test('successful source refuses a context change during the final independent closure await', async () => {
  const f = await fixture();
  let checks = 0;
  f.args.assertIndependentClosure = async () => {
    if (++checks === 4) f.runtime.environment.XCSH_API_URL = 'https://other.example.test';
  };
  await expect(f.open()).rejects.toThrow();
});

test('successful source refuses replacement of its original environment object during closure', async () => {
  const f = await fixture();
  f.args.assertIndependentClosure = async () => {
    f.runtime.environment = { ...f.runtime.environment };
  };
  await expect(f.open()).rejects.toThrow();
});

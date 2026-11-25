/** Source tests: real original evidence files with synthetic applied/cloud effects. */
import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import type { GcpCapturedTeardownOrigin } from '../../src/ce/captured-teardown-origin';
import { fingerprint } from '../../src/ce/discovery';
import { GCP_TERRAFORM_OBSERVER_IMAGE } from '../../src/ce/observer-scope';
import type { GcpSourceCampaignInputs } from '../../src/ce/source-campaign-evidence';
import { assertPublicTerraformContext } from '../../src/ce/terraform-context';
import { readPublicTerraformCleanupOwnership } from '../../src/ce/terraform-public-teardown';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { observerOwnershipFixture } from './observer-ownership-fixtures';

async function fixture(
  change?: (auth: Record<string, unknown>, review: Record<string, unknown>, terminal: Record<string, unknown>) => void,
) {
  const f = observerOwnershipFixture();
  const worker = await mkdtemp(join(tmpdir(), 'gcp-applied-source-'));
  await mkdir(join(worker, 'fresh-review'), { mode: 0o700 });
  const owner = {
    provider: 'gcp',
    engine: 'terraform',
    account: f.i.project,
    region: f.i.region,
    deploymentId: f.i.deploymentName,
  };
  const now = Date.now();
  const review = {
    owner,
    planSha256: f.receipt.planSha256,
    backendIdentity: f.receipt.backendIdentity,
    configurationSha256: f.receipt.configurationSha256,
    providerLockSha256: f.receipt.providerLockSha256,
    resourceCount: 21,
    absences: f.addresses.map((address) => ({ address, present: false })),
    reviewBegan: now - 500,
    reviewedAt: now - 300,
    ceImageId: f.i.image.id,
    observerImageId: GCP_TERRAFORM_OBSERVER_IMAGE.id,
    campaignKeysBound: true,
    creationReviewed: true,
    executionAuthorized: false,
  };
  const auth: Record<string, unknown> = {
    kind: 'user-authorized-source-gcp-qualification',
    owner,
    planSha256: f.receipt.planSha256,
    configurationSha256: f.receipt.configurationSha256,
    providerLockSha256: f.receipt.providerLockSha256,
    resourceCount: 21,
    ceImageId: f.i.image.id,
    observerImageId: GCP_TERRAFORM_OBSERVER_IMAGE.id,
    createdAt: now - 200,
  };
  const terminal = { applyAttempted: true, applySucceeded: true, closeSucceeded: true, finishedAt: now };
  change?.(auth, review, terminal);
  const paths = {
    authorization: join(worker, 'qualification-authorization.private.json'),
    review: join(worker, 'fresh-review/review.private.json'),
    identity: join(worker, 'worker-identity.private.json'),
    terminal: join(worker, 'worker-terminal.private.json'),
  };
  await writeFile(paths.review, JSON.stringify(review), { mode: 0o400 });
  auth.reviewSha256 = (await readOwnedInstalledInput(paths.review)).binding.sha256;
  for (const [name, value] of [
    ['authorization', auth],
    ['identity', { owner, planSha256: f.receipt.planSha256, startedAt: now - 1000 }],
    ['terminal', terminal],
  ] as const)
    await writeFile(paths[name], JSON.stringify(value), { mode: 0o400 });
  const source = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([name, path]) => [name, (await readOwnedInstalledInput(path)).binding]),
    ),
  ) as GcpSourceCampaignInputs;
  let closed = true,
    applied = true,
    stable = true;
  let attestations = 0,
    reads = 0;
  f.runtime.environment = { XCSH_API_URL: 'https://tenant.example.test', XCSH_API_TOKEN: 'synthetic-original' };
  const read = f.runtime.session.readApplyAttemptResourceFields;
  if (!read) throw new Error('Synthetic applied-state reader required');
  f.runtime.session.readApplyAttemptResourceFields = async (...args) => {
    reads++;
    return read(...args);
  };
  f.runtime.session.assertApplied = async (receipt) => {
    attestations++;
    if (!applied || fingerprint(receipt) !== fingerprint(f.receipt)) throw new Error('Original apply was not attested');
  };
  f.runtime.session.readStateIdentity = async () => ({
    sha256: (stable ? 'd' : 'e').repeat(64),
    lineage: 'original',
    serial: 1,
  });
  const args = {
    intent: f.i,
    source,
    receipt: f.receipt,
    runtime: f.runtime,
    assertIndependentClosure: async () => {
      if (!closed) throw new Error('Original reader remains live');
    },
  };
  const module = await import('../../src/ce/applied-source-teardown-origin');
  return {
    ...f,
    worker,
    paths,
    args,
    module,
    attestations: () => attestations,
    reads: () => reads,
    change: (mode: string) => {
      if (mode === 'closure') closed = false;
      if (mode === 'attestation') applied = false;
      if (mode === 'state') stable = false;
    },
    open: () => module.openGcpAppliedSourceTeardownOrigin(args),
  };
}

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

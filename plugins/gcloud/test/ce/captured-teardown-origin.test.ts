/** Source qualification: real durable original files with synthetic cloud ownership observations. */
import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import type { OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import { persistGcpCaptureCleanupOrigin } from '../../src/ce/capture-cleanup-durable';
import { openGcpCapturedTeardownOrigin, readGcpCapturedTeardownOrigin } from '../../src/ce/captured-teardown-origin';
import { fingerprint } from '../../src/ce/discovery';
import { GCP_TERRAFORM_OBSERVER_IMAGE } from '../../src/ce/observer-scope';
import { assertPublicTerraformContext, publicTerraformContextHash } from '../../src/ce/terraform-context';
import { publicTerraformAddresses } from '../../src/ce/terraform-public-ownership';
import * as publicTeardown from '../../src/ce/terraform-public-teardown';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { gcpCleanupAdmissionFixture } from './capture-cleanup-admission.test';

async function fixture(
  change?: (auth: Record<string, unknown>, review: Record<string, unknown>, terminal: Record<string, unknown>) => void,
) {
  const f = await gcpCleanupAdmissionFixture();
  Object.assign(f.inspection.environment, { XCSH_API_URL: 'https://tenant.example.test' });
  const readerInputs: Record<string, OriginalInputBinding> = {};
  for (const name of ['claim.json', 'lifetime.json', 'capture-unresolved.json'])
    readerInputs[`lock:${name}`] = (await readOwnedInstalledInput(join(f.lock, name))).binding;
  const common = {
    intent: f.i,
    executionDirectory: f.directory,
    environment: f.inspection.environment,
    api: f.api,
    observePlatform: f.runtime.observePlatform,
    assertIndependentClosure: async () => f.inspection.assertIndependentClosure(),
  };
  const persisted = await persistGcpCaptureCleanupOrigin({ ...common, inspection: f.inspection, readerInputs });
  const worker = await mkdtemp(join(tmpdir(), 'gcp-captured-origin-'));
  const fresh = join(worker, 'fresh-review');
  await mkdir(fresh, { mode: 0o700 });
  const owner = {
    provider: 'gcp',
    engine: 'terraform',
    account: f.i.project,
    region: f.i.region,
    deploymentId: f.i.deploymentName,
  };
  const now = Date.now();
  const review: Record<string, unknown> = {
    owner,
    planSha256: f.receipt.planSha256,
    backendIdentity: f.receipt.backendIdentity,
    configurationSha256: f.receipt.configurationSha256,
    providerLockSha256: f.receipt.providerLockSha256,
    resourceCount: 21,
    absences: publicTerraformAddresses(f.i).map((address) => ({ address, present: false })),
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
  const terminal: Record<string, unknown> = {
    applyAttempted: true,
    applySucceeded: false,
    closeSucceeded: false,
    finishedAt: now,
  };
  change?.(auth, review, terminal);
  const paths = {
    authorization: join(worker, 'qualification-authorization.private.json'),
    review: join(fresh, 'review.private.json'),
    identity: join(worker, 'worker-identity.private.json'),
    terminal: join(worker, 'worker-terminal.private.json'),
  };
  await writeFile(paths.review, JSON.stringify(review), { mode: 0o400 });
  const reviewed = await readOwnedInstalledInput(paths.review);
  auth.reviewSha256 = reviewed.binding.sha256;
  for (const [name, value] of [
    ['authorization', auth],
    ['identity', { owner, planSha256: f.receipt.planSha256, startedAt: now - 1000 }],
    ['terminal', terminal],
  ] as const)
    await writeFile(paths[name], JSON.stringify(value), { mode: 0o400 });
  const source = {
    authorization: (await readOwnedInstalledInput(paths.authorization)).binding,
    review: (await readOwnedInstalledInput(paths.review)).binding,
    identity: (await readOwnedInstalledInput(paths.identity)).binding,
    terminal: (await readOwnedInstalledInput(paths.terminal)).binding,
  };
  return {
    ...f,
    common,
    persisted,
    worker,
    paths,
    source,
    open: () => openGcpCapturedTeardownOrigin({ ...common, reference: persisted.reference, source }),
  };
}

test('captured teardown uses actual original source authorization and durable ownership without creating public deployment journals', async () => {
  const f = await fixture(),
    origin = await f.open();
  try {
    const value = await readGcpCapturedTeardownOrigin(origin, f.i);
    expect(value.original.kind).toBe('captured-source-qualification');
    expect(value.original.receiptFingerprint).toBe(fingerprint(f.receipt));
    expect(value.owned.addresses).toHaveLength(21);
    expect(origin.executionAuthorized).toBe(false);
    expect(origin.recovery.resources).toHaveLength(21);
    expect(await Bun.file(join(f.directory, 'gcp-tf-deploy-original-authorization.json')).exists()).toBe(false);
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toBeDefined();
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
] as const)
  test(`captured source provenance refuses invalid original evidence: ${mode}`, async () => {
    const f = await fixture((auth, review, terminal) => {
      if (mode === 'wrong-kind') auth.kind = 'example-unissued';
      if (mode === 'wrong-plan') auth.planSha256 = '0'.repeat(64);
      if (mode === 'wrong-owner') auth.owner = { ...(auth.owner as object), account: 'example-foreign' };
      if (mode === 'unsubmitted') terminal.applyAttempted = false;
      if (mode === 'stale-review') auth.createdAt = (review.reviewedAt as number) + 300001;
      if (mode === 'foreign-absence') (review.absences as Array<{ address: string }>)[0].address = 'example.foreign';
      if (mode === 'wrong-image') review.observerImageId = '1';
    });
    await expect(f.open()).rejects.toThrow();
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toBeDefined();
  });

test('copied source capabilities and replaced original authorization cannot grant teardown provenance', async () => {
  const f = await fixture(),
    origin = await f.open();
  await expect(readGcpCapturedTeardownOrigin({ ...origin }, f.i)).rejects.toThrow();
  const bytes = await readFile(f.paths.authorization);
  await rename(f.paths.authorization, `${f.paths.authorization}.original`);
  await writeFile(f.paths.authorization, bytes, { flag: 'wx', mode: 0o400 });
  await expect(readGcpCapturedTeardownOrigin(origin, f.i)).rejects.toThrow();
  origin.close();
  await expect(readGcpCapturedTeardownOrigin(origin, f.i)).rejects.toThrow();
});

test('normal public teardown ownership reader accepts source-issued captured origin without reading substitute deployment journals', async () => {
  const f = await fixture(),
    origin = await f.open();
  try {
    const runtime = {
      ...f.runtime,
      capturedTeardownOrigin: origin,
      store: {
        directory: f.directory,
        read: async () => {
          throw new Error('No public deployment journals belong to source qualification');
        },
      },
    } as unknown as GcpTerraformTeardownRuntime;
    const value = await publicTeardown.readPublicTerraformCleanupOwnership(runtime, f.i);
    expect(value.original.kind).toBe('captured-source-qualification');
    expect(value.owned.addresses).toHaveLength(21);
    origin.close();
    await expect(publicTeardown.readPublicTerraformCleanupOwnership(runtime, f.i)).rejects.toThrow();
  } finally {
    origin.close();
  }
});

test('captured teardown context comes from its durable original scope without a substitute public context journal', async () => {
  const f = await fixture(),
    origin = await f.open();
  try {
    const runtime = {
      ...f.runtime,
      capturedTeardownOrigin: origin,
      environment: f.inspection.environment,
      store: {
        directory: f.directory,
        read: async () => {
          throw new Error('No substitute public context journal');
        },
      },
    } as unknown as GcpTerraformTeardownRuntime;
    expect(await assertPublicTerraformContext(runtime, f.i)).toBe(
      publicTerraformContextHash(f.i, runtime.environment.XCSH_API_URL),
    );
    Object.assign(runtime.environment, { XCSH_API_TOKEN: 'example-rotated' });
    await assertPublicTerraformContext(runtime, f.i);
    Object.assign(runtime.environment, { XCSH_API_URL: 'https://other.example.test' });
    await expect(assertPublicTerraformContext(runtime, f.i)).rejects.toThrow();
  } finally {
    origin.close();
  }
});

export { fixture as capturedTeardownSourceFixture };

/** Source tests: real original evidence files with synthetic applied/cloud effects. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from '../../src/ce/discovery';
import { GCP_TERRAFORM_OBSERVER_IMAGE } from '../../src/ce/observer-scope';
import type { GcpSourceCampaignInputs } from '../../src/ce/source-campaign-evidence';
import { observerOwnershipFixture } from './observer-ownership-fixtures';

export async function appliedSourceFixture(
  change?: (auth: Record<string, unknown>, review: Record<string, unknown>, terminal: Record<string, unknown>) => void,
  receipt?: Partial<PlanReceipt>,
) {
  const f = observerOwnershipFixture();
  Object.assign(f.receipt, receipt);
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

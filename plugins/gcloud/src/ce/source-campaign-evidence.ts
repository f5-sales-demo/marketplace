import { dirname, join } from 'node:path';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import {
  assertSameOriginalInput,
  monitorOriginalInputs,
  type OriginalInputBinding,
} from '../../../terraform/src/original-input-monitor';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from './discovery';
import { GCP_TERRAFORM_OBSERVER_IMAGE } from './observer-scope';
import { publicTerraformAddresses } from './terraform-public-ownership';
import type { GcpCeIntent } from './types';

export type GcpSourceCampaignInputs = Readonly<
  Record<'authorization' | 'review' | 'identity' | 'terminal', OriginalInputBinding>
>;

/** Original immutable worker evidence shared by successful and captured cleanup.
 * It attests provenance only; it grants neither apply nor delete authorization. */
export async function openGcpSourceCampaignEvidence(input: { intent: GcpCeIntent; source: GcpSourceCampaignInputs }) {
  const intent = structuredClone(input.intent),
    source = structuredClone(input.source);
  const names = ['authorization', 'identity', 'review', 'terminal'];
  if (
    intent.schemaVersion !== 2 ||
    intent.engine !== 'terraform' ||
    Object.keys(source).sort().join(',') !== names.join(',')
  )
    throw new Error('Original captured GCP source evidence required');
  const directory = dirname(source.authorization.path);
  if (
    source.authorization.path !== join(directory, 'qualification-authorization.private.json') ||
    source.identity.path !== join(directory, 'worker-identity.private.json') ||
    source.terminal.path !== join(directory, 'worker-terminal.private.json') ||
    source.review.path !== join(directory, 'fresh-review', 'review.private.json') ||
    Object.values(source).some((row) => (Number(row.expectedIdentity?.mode) & 0o777) !== 0o400)
  )
    throw new Error('Original source worker evidence paths or private modes differ');
  const monitor = await monitorOriginalInputs(source);
  let closed = false,
    returned = false;
  const close = () => {
    closed = true;
    monitor.close();
  };
  try {
    const read = async (name: keyof typeof source) => {
      const value = await readOwnedInstalledInput(source[name].path, 1048576);
      assertSameOriginalInput(source[name], value.binding);
      return decodeEvidenceObject(value.bytes);
    };
    const authorization = await read('authorization'),
      review = await read('review');
    const identity = await read('identity'),
      terminal = await read('terminal');
    const owner = {
      provider: 'gcp',
      engine: 'terraform',
      account: intent.project,
      region: intent.region,
      deploymentId: intent.deploymentName,
    };
    const timestamp = (value: unknown): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
    if (
      authorization.kind !== 'user-authorized-source-gcp-qualification' ||
      (authorization.schemaVersion !== undefined && authorization.schemaVersion !== 1) ||
      [authorization.owner, review.owner, identity.owner].some((value) => fingerprint(value) !== fingerprint(owner)) ||
      authorization.reviewSha256 !== source.review.sha256 ||
      review.resourceCount !== 21 ||
      authorization.resourceCount !== 21 ||
      review.campaignKeysBound !== true ||
      review.creationReviewed !== true ||
      review.executionAuthorized !== false ||
      review.ceImageId !== intent.image.id ||
      authorization.ceImageId !== intent.image.id ||
      review.observerImageId !== GCP_TERRAFORM_OBSERVER_IMAGE.id ||
      authorization.observerImageId !== GCP_TERRAFORM_OBSERVER_IMAGE.id ||
      !Array.isArray(review.absences) ||
      review.absences.length !== 21 ||
      fingerprint(review.absences.map((row) => (row as Record<string, unknown>).address).sort()) !==
        fingerprint(publicTerraformAddresses(intent).sort()) ||
      review.absences.some((row) => (row as Record<string, unknown>).present !== false) ||
      !timestamp(identity.startedAt) ||
      !timestamp(review.reviewBegan) ||
      !timestamp(review.reviewedAt) ||
      !timestamp(authorization.createdAt) ||
      !timestamp(terminal.finishedAt) ||
      identity.startedAt > review.reviewBegan ||
      review.reviewBegan > review.reviewedAt ||
      review.reviewedAt > authorization.createdAt ||
      authorization.createdAt - review.reviewedAt >= 300000 ||
      authorization.createdAt > terminal.finishedAt ||
      terminal.finishedAt > Date.now() + 5000 ||
      terminal.applyAttempted !== true
    )
      throw new Error('Original captured source authorization or reviewed campaign evidence differs');
    await monitor.assertOriginal();
    const assertOriginal = async () => {
      if (closed) throw new Error('Original source campaign evidence is retired');
      await monitor.assertOriginal();
      if (closed) throw new Error('Original source campaign evidence retired during inspection');
    };
    const assertReceipt = async (receipt: PlanReceipt) => {
      await assertOriginal();
      if (
        authorization.planSha256 !== receipt.planSha256 ||
        review.planSha256 !== receipt.planSha256 ||
        identity.planSha256 !== receipt.planSha256 ||
        authorization.configurationSha256 !== receipt.configurationSha256 ||
        review.configurationSha256 !== receipt.configurationSha256 ||
        authorization.providerLockSha256 !== receipt.providerLockSha256 ||
        review.providerLockSha256 !== receipt.providerLockSha256 ||
        review.backendIdentity !== receipt.backendIdentity
      )
        throw new Error('Original source authorization and durable create receipt differ');
    };
    returned = true;
    return Object.freeze({
      terminal: Object.freeze(structuredClone(terminal)),
      assertOriginal,
      assertReceipt,
      close,
      authorizationSha256: source.authorization.sha256,
      reviewSha256: source.review.sha256,
      sourceHash: fingerprint(source),
    });
  } finally {
    if (!returned) close();
  }
}

import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Store = Pick<CeDeploymentStore, 'owner' | 'read' | 'write' | 'verify'>;
const markerFile = 'aws-terraform-lifecycle-retirement.json';
async function optional(storage: Store, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
/** Presence is sufficient to reject deployment; malformed or unavailable evidence never grants permission. */
export async function assertAwsTerraformDeploymentActive(storage: Store) {
  await storage.verify();
  for (const name of [
    markerFile,
    'aws-terraform-teardown-source.json',
    'terraform-cloud-teardown-source.json',
    'terraform-cloud-teardown.json',
    'aws-terraform-foundation-teardown-receipt.json',
    'aws-terraform-pending-teardown-receipt.json',
    'aws-terraform-teardown-receipt.json',
  ])
    if ((await optional(storage, name)) !== undefined)
      throw new Error('AWS Terraform retirement has started; resume teardown instead of deployment');
}
/** Called after the selected coordinator validates authorization and live prerequisites, before its first mutation. */
export async function beginAwsTerraformRetirement(
  base: AwsCePlan,
  plan: { kind: string; planSha256: string; sourcePlanSha256: string },
  storage: Store,
) {
  await storage.verify();
  if (
    base.engine !== 'terraform' ||
    plan.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(plan.planSha256) ||
    canonicalSha256(storage.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner)
  )
    throw new Error('AWS Terraform retirement owner or source plan differs');
  const marker = {
    schemaVersion: 1,
    engine: 'terraform',
    status: 'retiring',
    owner: storage.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: plan.planSha256,
    kind: plan.kind,
  };
  const existing = await optional(storage, markerFile);
  if (existing !== undefined && canonicalSha256(existing) !== canonicalSha256(marker))
    throw new Error('AWS Terraform retirement belongs to another immutable teardown');
  if (existing === undefined) await storage.write(markerFile, marker);
}
/** Public apply and teardown share one owner-bound lock, including interruption recovery. */
export async function withAwsTerraformLifecycle<T>(
  storage: Pick<CeDeploymentStore, 'directory' | 'verify'>,
  signal: AbortSignal | undefined,
  action: () => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  await storage.verify();
  const release = await acquireProcessLock(join(storage.directory, '.aws-terraform-lifecycle-lock'));
  try {
    signal?.throwIfAborted();
    await storage.verify();
    return await action();
  } finally {
    await release();
  }
}

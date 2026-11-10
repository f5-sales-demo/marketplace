import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from './canonical';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const marker = 'azure-terraform-lifecycle-retirement.json';
type Store = Pick<CeDeploymentStore, 'verify' | 'read' | 'write' | 'owner'>;
export async function assertAzureTerraformDeploymentActive(store: Pick<Store, 'verify' | 'read'>) {
  await store.verify();
  for (const name of [
    marker,
    'azure-terraform-foundation-teardown-checkpoint.json',
    'azure-terraform-teardown-receipt.json',
  ]) {
    try {
      await store.read(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    throw Error('Azure Terraform retirement has started; resume teardown instead of deployment');
  }
}
export async function beginAzureTerraformRetirement(
  base: AzureCePlan,
  teardown: { kind: string; sourcePlanSha256: string; planSha256: string },
  store: Store,
) {
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(teardown.planSha256) ||
    canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(base).owner)
  )
    throw Error('Azure Terraform retirement owner or source differs');
  const value = {
    schemaVersion: 1,
    engine: 'terraform',
    owner: store.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    kind: teardown.kind,
  };
  let existing: unknown;
  try {
    existing = await store.read(marker);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (existing !== undefined && canonicalSha256(existing) !== canonicalSha256(value))
    throw Error('Azure Terraform retirement belongs to another immutable teardown');
  if (existing === undefined) await store.write(marker, value);
}

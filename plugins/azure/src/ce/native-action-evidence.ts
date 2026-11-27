import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeAction, AzureCePlan } from './types';

/** Private source registry binds terminal cleanup to the exact plans that executed. No execution substitutions are stored here. */
export async function persistAzureNativeSource(
  plan: AzureCePlan,
  store: Pick<CeDeploymentStore, 'verify' | 'read' | 'write' | 'owner'>,
) {
  verifyAzureCePlan(plan);
  await store.verify();
  if (plan.engine !== 'native' || canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(plan).owner))
    throw Error('Azure native evidence owner differs');
  const name = `native-source-${plan.planSha256}.json`;
  let saved: unknown;
  try {
    saved = await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(plan))
    throw Error('Azure native source registry differs');
  if (saved === undefined) await store.write(name, plan);
}
export async function persistAzureNativeActionEvidence(
  plan: AzureCePlan,
  action: AzureCeAction,
  evidence: unknown,
  store: Pick<CeDeploymentStore, 'verify' | 'read' | 'write' | 'owner'>,
) {
  verifyAzureCePlan(plan);
  const expected = plan.actions.filter((row) => row.id === action.id);
  if (expected.length !== 1 || canonicalSha256(expected[0]) !== canonicalSha256(action))
    throw Error('Azure native evidence action differs');
  await persistAzureNativeSource(plan, store);
  await store.write(`native-action-${plan.planSha256}-${action.id}.json`, {
    schemaVersion: 1,
    engine: 'native',
    owner: store.owner,
    sourcePlanSha256: plan.planSha256,
    actionId: action.id,
    actionSha256: canonicalSha256(action),
    evidence,
  });
}

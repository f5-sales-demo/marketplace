import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { loadAwsTerraformBrownfieldBinding } from './terraform-brownfield-binding';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import type { AwsCePlan } from './types';

/** Resume the existing owner runner; brownfield references must be reloaded and freshly verified. */
export async function openAwsTerraformPowerSession(
  base: AwsCePlan,
  storage: CeDeploymentStore,
  terraform: CeTerraformService,
  api: AwsExecApi,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(base);
  const owner = storage.owner;
  if (
    base.engine !== 'terraform' ||
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== base.intent.deploymentName ||
    owner.account !== base.intent.accountId ||
    owner.region !== base.intent.region
  )
    throw Error('Terraform power runner owner differs');
  await storage.verify();
  signal?.throwIfAborted();
  const placement =
    base.intent.vpc.mode === 'brownfield'
      ? await loadAwsTerraformBrownfieldBinding(base, storage, api, signal)
      : undefined;
  return terraform.open(owner, await awsTerraformFoundationDeployment(base, {}, placement), 'current');
}

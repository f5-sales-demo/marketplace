import { renderAwsTerraformConnect } from './terraform-connect';
import { renderAwsTerraformStatic } from './terraform-static';
import type { AwsCeObservation, AwsCePlan } from './types';

export function renderAwsTerraformRouting(
  plan: AwsCePlan,
  observation: AwsCeObservation,
  bootstrap: Record<string, string>,
) {
  return plan.intent.routing.profile === 'tgw-static'
    ? renderAwsTerraformStatic(plan, bootstrap)
    : renderAwsTerraformConnect(plan, observation, bootstrap);
}

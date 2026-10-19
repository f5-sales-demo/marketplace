import type { GcpTerraformInputs } from './terraform-session';

/** Filled only from the verified immutable provider publication and platform locks. */
export const GCP_PUBLIC_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> | undefined = undefined;

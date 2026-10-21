export const AWS_CE_TERRAFORM_VERSION = '1.16.5';
export const AWS_CE_TERRAFORM_PROVIDER_VERSION = '6.63.0';
export const AWS_CE_PROVIDER_LOCK_SHA256 = 'b97165003c421c83098216c89f00ecbd10a7fb59cd6954c8abf74af0262ed843';

import type { AwsCeIntent } from './types';

/** Power operations need coordinated withdrawal/restoration, not just EC2 power actions. */
export function assertAwsDeploymentCompilerOperation(intent: Pick<AwsCeIntent, 'operation'>): void {
  if (intent.operation === 'start' || intent.operation === 'stop')
    throw new Error(
      `Whole-site ${intent.operation} requires aws_ce_power with the exact original deployment and saved power plan; the deployment compiler lacks immutable service and maintenance bindings`,
    );
}

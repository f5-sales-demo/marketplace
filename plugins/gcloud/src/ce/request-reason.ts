import { randomUUID } from 'node:crypto';
import { fingerprint } from './discovery';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

/** Private deployment correlation. It never establishes RPC or insert authority. */
export interface GcpTerraformRequestReason {
  readonly schemaVersion: 1;
  readonly scope: 'gcp-terraform-deployment';
  readonly intentFingerprint: string;
  readonly reason: string;
}
const reasonPattern = /^xcsh-gcp-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function createGcpTerraformRequestReason(intent: GcpCeIntent): Readonly<GcpTerraformRequestReason> {
  validateIntent(intent);
  if (intent.engine !== 'terraform' || intent.operation !== 'deploy')
    throw new Error('Original Terraform deployment intent required for request reason');
  return Object.freeze({
    schemaVersion: 1,
    scope: 'gcp-terraform-deployment',
    intentFingerprint: fingerprint(intent),
    reason: `xcsh-gcp-${randomUUID()}`,
  });
}

export function assertGcpTerraformRequestReason(
  value: unknown,
  intent: GcpCeIntent,
  googleVersion: string,
): asserts value is GcpTerraformRequestReason {
  validateIntent(intent);
  const reason = value as GcpTerraformRequestReason | null;
  if (
    !reason ||
    typeof reason !== 'object' ||
    Array.isArray(reason) ||
    Object.keys(reason).sort().join(',') !== 'intentFingerprint,reason,schemaVersion,scope' ||
    reason.schemaVersion !== 1 ||
    reason.scope !== 'gcp-terraform-deployment' ||
    intent.engine !== 'terraform' ||
    intent.operation !== 'deploy' ||
    googleVersion !== '8.7.0' ||
    reason.intentFingerprint !== fingerprint(intent) ||
    typeof reason.reason !== 'string' ||
    !reasonPattern.test(reason.reason)
  )
    throw new Error('Reviewed original GCP Terraform request reason and provider mapping required');
}

import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from './discovery';
export interface GcpTerraformTransition {
  operation: 'deploy' | 'start' | 'stop' | 'resize' | 'replace-node' | 'teardown';
  deploymentName: string;
  addresses: string[];
  expectedActions: Record<string, string[]>;
  savedPlanSha256: string;
  configurationSha256: string;
  providerLockSha256: string;
  backendIdentity: string;
}
/** Admit only exact reviewed saved-plan transitions; engine migration and unrelated drift cannot ride along. */
export function admitGcpTerraformTransition(intent: GcpTerraformTransition, receipt: PlanReceipt) {
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== intent.deploymentName ||
    receipt.backendIdentity !== intent.backendIdentity ||
    receipt.backendIdentity !== `local:${intent.deploymentName}`
  )
    throw new Error('Terraform transition ownership/backend differs');
  for (const [actual, expected] of [
    [receipt.planSha256, intent.savedPlanSha256],
    [receipt.configurationSha256, intent.configurationSha256],
    [receipt.providerLockSha256, intent.providerLockSha256],
  ])
    if (!/^[a-f0-9]{64}$/.test(actual) || actual !== expected)
      throw new Error('Reviewed Terraform transition artifact differs');
  if (
    !['deploy', 'start', 'stop', 'resize', 'replace-node', 'teardown'].includes(intent.operation) ||
    !intent.addresses.length ||
    new Set(intent.addresses).size !== intent.addresses.length
  )
    throw new Error('Explicit unique transition resource inventory required');
  if (receipt.actionInvocations?.length) throw new Error('Compute transitions do not admit implicit provider actions');
  const allowedTypes = new Set([
    'google_compute_instance',
    'google_compute_disk',
    'google_compute_network',
    'google_compute_subnetwork',
    'google_compute_address',
    'google_compute_firewall',
    'google_compute_route',
    'google_compute_router',
    'google_compute_router_nat',
    'google_compute_region_backend_service',
    'google_compute_forwarding_rule',
    'google_compute_region_health_check',
    'google_compute_instance_group',
    'xcsh_securemesh_site_v2',
    'xcsh_token',
  ]);
  const actual = new Map<string, string[]>();
  for (const change of receipt.changes) {
    if (actual.has(change.address) || !allowedTypes.has(change.type) || !change.address.startsWith(`${change.type}.`))
      throw new Error('Unknown or duplicate Terraform transition resource');
    actual.set(change.address, change.actions);
    if (change.actions.join(',') === 'no-op') continue;
    if (
      !intent.addresses.includes(change.address) ||
      fingerprint(change.actions) !== fingerprint(intent.expectedActions[change.address])
    )
      throw new Error('Terraform plan contains unrelated or unexpected changes');
    const actions = change.actions.join(',');
    if (intent.operation === 'deploy' && actions !== 'create') throw new Error('Deploy admits only owned creates');
    if (intent.operation === 'teardown' && actions !== 'delete') throw new Error('Teardown admits only owned deletes');
    if (
      ['start', 'stop', 'resize'].includes(intent.operation) &&
      (change.type !== 'google_compute_instance' || actions !== 'update')
    )
      throw new Error('Power/resize plan must update only the owned VM');
    if (
      intent.operation === 'replace-node' &&
      !['delete,create', 'create,delete', 'update', 'create', 'delete'].includes(actions)
    )
      throw new Error('Replacement transition unsupported');
  }
  for (const address of intent.addresses) {
    if (
      !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address) ||
      !intent.expectedActions[address] ||
      fingerprint(actual.get(address)) !== fingerprint(intent.expectedActions[address])
    )
      throw new Error('Expected Terraform transition missing from saved plan');
  }
  if ((intent.operation === 'teardown') !== (receipt.operation === 'destroy'))
    throw new Error('Saved-plan destroy mode differs');
  return {
    admitted: true,
    engine: 'terraform',
    operation: intent.operation,
    planSha256: receipt.planSha256,
    fingerprint: fingerprint({ intent, receipt }),
  };
}

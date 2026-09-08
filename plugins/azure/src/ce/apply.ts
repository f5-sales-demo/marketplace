import type { AzExecApi } from '../az/exec';
import { fingerprintObservation, safeHexEqual } from './canonical';
import type { AzureCeAction, AzureCeObservation, AzureCePlan } from './types';

export function assertObservationFresh(
  plan: AzureCePlan,
  current: AzureCeObservation,
  expectedFingerprint = plan.observationFingerprint,
): void {
  const fingerprint = fingerprintObservation(current, plan.intent.brownfield.resourceIds);
  if (!safeHexEqual(expectedFingerprint, fingerprint)) {
    throw new Error(
      `Stale Azure CE plan: observations changed (expected ${expectedFingerprint}, current ${fingerprint})`,
    );
  }
}

export function assertApplyAllowed(
  plan: AzureCePlan,
  request: { planId: string; planSha256: string; hasUI: boolean; env: Record<string, string | undefined> },
): void {
  if (plan.engine !== 'native')
    throw new Error('Terraform CE plans require the Terraform lifecycle adapter; native execution is forbidden');
  if (request.planId !== plan.planId) throw new Error('The requested plan ID does not match the persisted plan');
  if (!safeHexEqual(request.planSha256, plan.planSha256))
    throw new Error('The requested plan hash does not match the persisted plan');
  if (!request.hasUI && request.env.XCSH_CE_HEADLESS_MUTATIONS !== '1') {
    throw new Error('Headless Azure CE mutations require XCSH_CE_HEADLESS_MUTATIONS=1');
  }
  if (plan.intent.operation === 'teardown' && !request.hasUI && request.env.XCSH_CE_ALLOW_DESTROY !== '1') {
    throw new Error('Headless teardown requires XCSH_CE_ALLOW_DESTROY=1');
  }
  if (
    plan.actions.some((action) => action.kind === 'marketplace-terms-accept') &&
    !request.hasUI &&
    request.env.XCSH_CE_ACCEPT_MARKETPLACE_TERMS !== '1'
  ) {
    throw new Error('Headless Marketplace terms acceptance requires XCSH_CE_ACCEPT_MARKETPLACE_TERMS=1');
  }
}

export function resolveActionArgs(
  args: string[],
  planSha256: string,
  replacements: Record<string, string> = {},
): string[] {
  return args.map((arg) => {
    if (arg === '__PLAN_SHA256__') return planSha256;
    if (arg.includes('__PLAN_SHA256__')) return arg.replaceAll('__PLAN_SHA256__', planSha256);
    return replacements[arg] ?? arg;
  });
}

const CREATE_KINDS = new Set([
  'resource-group-create',
  'vnet-create',
  'subnet-create',
  'nsg-create',
  'nsg-rule-create',
  'public-ip-create',
  'nic-create',
  'vm-create',
  'route-table-create',
  'route-server-create',
  'route-server-peer-create',
]);
const OWNED_MUTATION_KINDS = new Set(['vm-start', 'vm-stop', 'vm-deallocate', 'vm-resize', 'vm-delete', 'nic-update']);

async function assertBrownfieldOwnership(plan: AzureCePlan, action: AzureCeAction, api: AzExecApi): Promise<void> {
  const id = action.resourceId ?? '';
  if (!id.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()))
    throw new Error('Brownfield mutation target is outside the selected subscription');
  const result = await api.exec('az', [
    'resource',
    'show',
    '--ids',
    id,
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Brownfield ownership observation unavailable');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw new Error('Malformed brownfield ownership observation');
  }
  if (!raw || typeof raw.id !== 'string' || raw.id.toLowerCase() !== id.toLowerCase() || raw.nextLink)
    throw new Error('Brownfield ownership identity is missing or substituted');
  if (raw.tags !== undefined && (!raw.tags || typeof raw.tags !== 'object' || Array.isArray(raw.tags)))
    throw new Error('Malformed brownfield ownership tags');
  const tags = (raw.tags ?? {}) as Record<string, unknown>;
  if (tags['xcsh-execution-engine'] !== undefined && tags['xcsh-execution-engine'] !== plan.engine)
    throw new Error('Brownfield resource belongs to another execution engine');
  if (
    tags['xcsh-managed-by'] === 'azure-ce' &&
    (tags['xcsh-deployment-id'] !== plan.deploymentName || tags['xcsh-execution-engine'] !== plan.engine)
  )
    throw new Error('Brownfield resource belongs to another or unknown CE deployment owner');
}

export async function assertActionOwnership(plan: AzureCePlan, action: AzureCeAction, api: AzExecApi): Promise<void> {
  if (!action.mutates || action.kind === 'marketplace-terms-accept') return;
  if (['route-association-update', 'brownfield-restore'].includes(action.kind)) {
    const allowed = plan.ownershipInventory.some(
      (item) => item.action === 'modify-approved' && item.resourceId.toLowerCase() === action.resourceId?.toLowerCase(),
    );
    if (!allowed)
      throw new Error(`Brownfield resource is outside the approved allowlist: ${action.resourceId ?? '<missing>'}`);
    await assertBrownfieldOwnership(plan, action, api);
    return;
  }
  if (!action.resourceId) {
    if (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length === 0) return;
    if (
      action.kind === 'vm-start' ||
      action.kind === 'vm-stop' ||
      action.kind === 'vm-deallocate' ||
      action.kind === 'vm-resize' ||
      action.kind === 'vm-delete'
    )
      return;
    throw new Error(`Mutating action ${action.id} has no canonical resource ID`);
  }
  if (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0) {
    const allowed = plan.ownershipInventory.some(
      (item) => item.action === 'modify-approved' && item.resourceId.toLowerCase() === action.resourceId?.toLowerCase(),
    );
    if (!allowed) throw new Error(`Brownfield route target is outside the approved allowlist: ${action.resourceId}`);
    await assertBrownfieldOwnership(plan, action, api);
    return;
  }
  if (!CREATE_KINDS.has(action.kind) && action.kind !== 'resource-delete' && !OWNED_MUTATION_KINDS.has(action.kind))
    return;
  const isGroup = !action.resourceId.toLowerCase().includes('/providers/');
  const args = isGroup
    ? ['group', 'show', '--name', plan.intent.resourceGroup, '--subscription', plan.subscription.id, '--output', 'json']
    : ['resource', 'show', '--ids', action.resourceId, '--subscription', plan.subscription.id, '--output', 'json'];
  const result = await api.exec('az', args);
  if (result.exitCode !== 0) {
    if (CREATE_KINDS.has(action.kind) && /not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return;
    if (action.kind === 'resource-delete' && /not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return;
    throw new Error(`Unable to verify ownership for ${action.resourceId}`);
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw new Error(`Ownership response was invalid for ${action.resourceId}`);
  }
  const observedId = String(raw.id ?? '').toLowerCase();
  if (!observedId || observedId !== action.resourceId.toLowerCase())
    throw new Error(`Azure substituted a different resource ID for ${action.resourceId}`);
  const tags = (raw.tags as Record<string, string> | undefined) ?? {};
  const owned = tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === plan.deploymentName;
  if (owned && tags['xcsh-execution-engine'] !== plan.engine)
    throw new Error('Azure resource belongs to another or unknown execution engine');
  if (!owned) throw new Error(`Refusing to mutate unmanaged resource ${action.resourceId}`);
  if (CREATE_KINDS.has(action.kind) && tags['xcsh-plan-sha256'] !== plan.planSha256)
    throw new Error(`Existing resource belongs to a different Azure CE plan: ${action.resourceId}`);
}

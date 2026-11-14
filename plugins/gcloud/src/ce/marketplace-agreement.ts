import { fingerprint } from './discovery';
import type { GcpOperationStore } from './native-operation';

export interface GcpMarketplaceBinding {
  project: string;
  projectNumber: string;
  imageId: string;
  imageSelfLink: string;
  licenseId: string;
  licenseSelfLink: string;
  billingService: string;
  agreement: string;
  agreementDocument: string;
}
export interface GcpMarketplaceConsentPort {
  binding(): Promise<GcpMarketplaceBinding>;
  check(binding: GcpMarketplaceBinding): Promise<unknown>;
  validateGrant(binding: GcpMarketplaceBinding): Promise<void>;
  grant(binding: GcpMarketplaceBinding): Promise<unknown>;
}
export function validateGcpMarketplaceBinding(binding: GcpMarketplaceBinding) {
  if (
    Object.keys(binding).some(
      (key) =>
        ![
          'project',
          'projectNumber',
          'imageId',
          'imageSelfLink',
          'licenseId',
          'licenseSelfLink',
          'billingService',
          'agreement',
          'agreementDocument',
        ].includes(key),
    ) ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(binding.project) ||
    ![binding.projectNumber, binding.imageId, binding.licenseId].every((id) => /^\d+$/.test(id)) ||
    !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/f5-7626-networks-public\/global\/images\/[a-z][a-z0-9-]{0,62}$/.test(
      binding.imageSelfLink,
    ) ||
    !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/f5-7626-networks-public\/global\/licenses\/[a-z][a-z0-9-]{0,62}$/.test(
      binding.licenseSelfLink,
    ) ||
    !/^[a-z][a-z0-9-]*\.endpoints\.f5-7626-networks-public\.cloud\.goog$/.test(binding.billingService)
  )
    throw new Error('Exact Marketplace image/project/license identity required');
  const prefix = `commerceoffercatalog.googleapis.com/services/${binding.billingService}/standardOffers/`;
  const suffix = binding.agreement.slice(prefix.length);
  if (
    !binding.agreement.startsWith(prefix) ||
    !/^[a-zA-Z0-9_-]+\/agreements\/[a-zA-Z0-9_-]+$/.test(suffix) ||
    !binding.agreementDocument.startsWith(`${binding.agreement}/documents/`) ||
    !/^[a-zA-Z0-9_-]+$/.test(binding.agreementDocument.slice(`${binding.agreement}/documents/`.length))
  )
    throw new Error('Agreement document must match the image billing service');
}
function activeConsent(value: unknown, binding: GcpMarketplaceBinding) {
  const consent = (value as { consent?: Record<string, unknown> } | null)?.consent;
  if (!consent) return undefined;
  if (
    consent.state !== 'ACTIVE' ||
    consent.agreement !== binding.agreement ||
    consent.agreementDocument !== binding.agreementDocument ||
    typeof consent.name !== 'string' ||
    !consent.name.startsWith(`projects/${binding.projectNumber}/consents/`) ||
    !/^[a-zA-Z0-9_-]+$/.test(consent.name.slice(`projects/${binding.projectNumber}/consents/`.length))
  )
    throw new Error('Marketplace consent identity/state differs');
  return {
    nameHash: fingerprint(consent.name),
    identityHash: fingerprint({
      name: consent.name,
      agreement: consent.agreement,
      agreementDocument: consent.agreementDocument,
    }),
  };
}
export async function planGcpMarketplaceAcceptance(port: GcpMarketplaceConsentPort, store: GcpOperationStore) {
  const binding = await port.binding();
  validateGcpMarketplaceBinding(binding);
  const current = activeConsent(await port.check(binding), binding);
  if (!current) await port.validateGrant(binding);
  const body = {
    schemaVersion: 1 as const,
    operation: 'marketplace-consent' as const,
    binding,
    createdAt: new Date().toISOString(),
    alreadyAccepted: !!current,
    action: current ? ('observe' as const) : ('grant-consent' as const),
    purchases: 0,
    approval: 'required' as const,
  };
  const plan = { ...body, planHash: fingerprint(body) };
  await store.write(`gcp-marketplace-plan-${plan.planHash.slice(7)}.json`, plan);
  return plan;
}
export type GcpMarketplaceAcceptancePlan = Awaited<ReturnType<typeof planGcpMarketplaceAcceptance>>;
/** Grant only a reviewed exact document; a lost grant is reconciled by check, never blind resubmission. */
export async function applyGcpMarketplaceAcceptance(
  port: GcpMarketplaceConsentPort,
  store: GcpOperationStore,
  approvedHash: string,
  onMutation?: () => void,
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact agreement review required');
  const plan = (await store.read(`gcp-marketplace-plan-${approvedHash.slice(7)}.json`)) as GcpMarketplaceAcceptancePlan;
  const { planHash, ...body } = plan;
  if (planHash !== approvedHash || fingerprint(body) !== approvedHash) throw new Error('Agreement review changed');
  validateGcpMarketplaceBinding(plan.binding);
  const live = await port.binding();
  if (fingerprint(live) !== fingerprint(plan.binding)) throw new Error('Marketplace binding changed after review');
  const checkpointName = `gcp-marketplace-grant-${approvedHash.slice(7)}.json`;
  let checkpoint: { planHash: string; state: 'submitting' | 'accepted' } | undefined;
  try {
    checkpoint = (await store.read(checkpointName)) as typeof checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (checkpoint && (checkpoint.planHash !== approvedHash || !['submitting', 'accepted'].includes(checkpoint.state)))
    throw new Error('Marketplace consent checkpoint differs');
  const age = Date.now() - Date.parse(plan.createdAt);
  if (!checkpoint && (!Number.isFinite(age) || age < 0 || age > 5 * 60_000))
    throw new Error('Marketplace review stale');
  let consent = activeConsent(await port.check(live), live);
  if (!consent) {
    if (checkpoint) throw new Error('Ambiguous or revoked Marketplace consent requires reconciliation');
    if (plan.alreadyAccepted) throw new Error('Reviewed Marketplace consent is no longer active');
    await port.validateGrant(live);
    await store.write(checkpointName, { planHash: approvedHash, state: 'submitting' });
    onMutation?.();
    await port.grant(live);
    consent = activeConsent(await port.check(live), live);
    if (!consent) throw new Error('Marketplace consent not independently established');
  }
  await store.write(checkpointName, { planHash: approvedHash, state: 'accepted' });
  const receipt = {
    schemaVersion: 1,
    project: live.project,
    planHash: approvedHash,
    bindingHash: fingerprint(live),
    ...consent,
    state: 'accepted' as const,
    observedAt: new Date().toISOString(),
    purchases: 0,
  };
  await store.write(`gcp-marketplace-receipt-${approvedHash.slice(7)}.json`, receipt);
  return receipt;
}

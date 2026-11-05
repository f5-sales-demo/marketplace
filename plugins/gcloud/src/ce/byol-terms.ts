import { createHash } from 'node:crypto';
import byolContract from '../../skills/gcp-ce/references/byol-vm-contract.json';
import { GCP_CE_API_RELEASE } from './contract';
import { assertGcpCorporateFundingCurrent, type GcpCorporateFundingReceipt } from './corporate-funding';
import { fingerprint } from './discovery';
import type { GcpOperationStore } from './native-operation';
import type { GcpPreflightPort } from './preflight';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';
export interface GcpByolSource {
  query: GcpPreflightPort['query'];
  document(url: string, signal?: AbortSignal): Promise<Uint8Array>;
}
export async function normalizedGoogleMarketplaceTerms(bytes: Uint8Array) {
  const cleaned = await new HTMLRewriter()
    .on('script,style,head', {
      element(element) {
        element.remove();
      },
    })
    .transform(new Response(new Uint8Array(bytes)))
    .text();
  const chunks: string[] = [];
  await new HTMLRewriter()
    .onDocument({
      text(text) {
        chunks.push(text.text);
      },
    })
    .transform(new Response(cleaned))
    .text();
  const text = chunks.join(' ').replace(/\s+/g, ' ').trim();
  const start = text.indexOf('Google Cloud Marketplace Terms of Service');
  const end = text.indexOf('Previous versions', start);
  if (start < 0 || end <= start || end - start < 1000 || !text.slice(start, end).includes('By using the Marketplace'))
    throw new Error('Current Google Marketplace legal text unavailable');
  return text.slice(start, end).trim();
}
export async function fetchGcpByolDocument(url: string, signal?: AbortSignal) {
  if (!byolContract.documents.some((document) => document.url === url))
    throw new Error('Unqualified BYOL document URL');
  const response = await fetch(url, {
    credentials: 'omit',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
  });
  if (!response.ok || !response.body) throw new Error('BYOL legal document unavailable');
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) throw new Error('BYOL document exceeds size limit');
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
async function binding(intent: GcpCeIntent, source: GcpByolSource, signal?: AbortSignal, profile = byolContract) {
  const contract = profile;
  validateIntent(intent);
  if (
    intent.image.name !== contract.evidence.imageVersion ||
    intent.image.id !== contract.evidence.imageId ||
    intent.image.licenses.length !== 1 ||
    intent.image.licenses[0] !== contract.evidence.licenseSelfLink
  )
    throw new Error('Evidence-backed BYOL image profile unavailable');
  const image = (await source.query(
    intent.image.selfLink.replace('https://www.googleapis.com', ''),
    undefined,
    signal,
  )) as { id?: string; name?: string; selfLink?: string; licenses?: string[]; status?: string };
  if (
    String(image.id) !== intent.image.id ||
    image.name !== intent.image.name ||
    image.selfLink !== intent.image.selfLink ||
    image.status !== 'READY' ||
    fingerprint(image.licenses) !== fingerprint(intent.image.licenses)
  )
    throw new Error('BYOL image identity changed');
  const link = intent.image.licenses[0];
  const license = (await source.query(link.replace('https://www.googleapis.com', ''), undefined, signal)) as {
    id?: string;
    selfLink?: string;
    chargesUseFee?: boolean;
    licenseCode?: string;
    description?: string;
  };
  if (
    String(license.id) !== contract.evidence.licenseId ||
    String(license.licenseCode) !== contract.evidence.licenseCode ||
    license.selfLink !== link ||
    license.chargesUseFee !== false ||
    license.description !==
      `License for Cloud Marketplace virtual machine image solution with billing service ${contract.billingService}: default`
  )
    throw new Error('BYOL license/product identity unqualified');
  const documents = [];
  for (const expected of contract.documents) {
    const bytes = await source.document(expected.url, signal);
    const content =
      expected.digestKind === 'normalized-current-legal-text' ? await normalizedGoogleMarketplaceTerms(bytes) : bytes;
    const sha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
    if (sha256 !== expected.sha256) throw new Error('BYOL legal document changed; requalification required');
    documents.push({ role: expected.role, url: expected.url, version: expected.version, sha256 });
  }
  return {
    contractId: contract.contractId,
    contractSha256: fingerprint(contract),
    apiRelease: GCP_CE_API_RELEASE,
    intentFingerprint: fingerprint(intent),
    project: intent.project,
    engine: intent.engine,
    platformContext: intent.platformContext,
    imageId: intent.image.id,
    imageSelfLink: intent.image.selfLink,
    licenseId: String(license.id),
    licenseCode: String(license.licenseCode),
    licenseSelfLink: link,
    billingService: contract.billingService,
    productUrl: contract.productUrl,
    documents,
  };
}
export async function planGcpByolTerms(
  intent: GcpCeIntent,
  source: GcpByolSource,
  funding: GcpCorporateFundingReceipt,
  store: GcpOperationStore,
  signal?: AbortSignal,
  profile = byolContract,
) {
  assertGcpCorporateFundingCurrent(funding, intent.project, funding.billingAccountName);
  const evidence = await binding(intent, source, signal, profile);
  const body = {
    schemaVersion: 1 as const,
    operation: 'authorize-byol-terms' as const,
    acceptanceMechanism: profile.acceptanceMechanism,
    binding: evidence,
    funding,
    createdAt: new Date().toISOString(),
    approval: 'required',
    purchases: 0,
    resourcesCreated: 0,
    softwareLicenseAcquired: false,
  };
  const plan = { ...body, planHash: fingerprint(body) };
  await store.write(`gcp-byol-reviewed-${plan.planHash.slice(7)}.json`, plan);
  return plan;
}
export type GcpByolTermsPlan = Awaited<ReturnType<typeof planGcpByolTerms>>;
export async function authorizeGcpByolTerms(
  intent: GcpCeIntent,
  source: GcpByolSource,
  funding: GcpCorporateFundingReceipt,
  store: GcpOperationStore,
  approvedHash: string,
  signal?: AbortSignal,
  profile = byolContract,
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact BYOL terms review required');
  const plan = (await store.read(`gcp-byol-reviewed-${approvedHash.slice(7)}.json`)) as GcpByolTermsPlan;
  const { planHash, ...body } = plan;
  const age = Date.now() - Date.parse(plan.createdAt);
  if (
    planHash !== approvedHash ||
    fingerprint(body) !== approvedHash ||
    plan.schemaVersion !== 1 ||
    plan.operation !== 'authorize-byol-terms' ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 5 * 60000
  )
    throw new Error('BYOL terms review changed or expired');
  assertGcpCorporateFundingCurrent(funding, intent.project, plan.funding.billingAccountName);
  if (funding.policySha256 !== plan.funding.policySha256)
    throw new Error('Corporate funding changed after terms review');
  const current = await binding(intent, source, signal, profile);
  if (fingerprint(current) !== fingerprint(plan.binding)) throw new Error('BYOL terms/image/context binding changed');
  const authorization = {
    schemaVersion: 1 as const,
    state: 'authorized-for-access-or-use' as const,
    planHash: approvedHash,
    binding: current,
    fundingPolicySha256: funding.policySha256,
    billingAccountName: funding.billingAccountName,
    authorizedAt: new Date().toISOString(),
    remoteConsentGranted: false,
    purchases: 0,
    resourcesCreated: 0,
    softwareLicenseAcquired: false,
  };
  const receipt = { ...authorization, authorizationHash: fingerprint(authorization) };
  await store.write('gcp-byol-authorization.json', receipt);
  return receipt;
}
export async function assertGcpByolAuthorization(
  intent: GcpCeIntent,
  source: GcpByolSource,
  funding: GcpCorporateFundingReceipt,
  store: GcpOperationStore,
  signal?: AbortSignal,
) {
  const receipt = (await store.read('gcp-byol-authorization.json')) as Awaited<
    ReturnType<typeof authorizeGcpByolTerms>
  >;
  const { authorizationHash, ...body } = receipt;
  if (
    receipt.schemaVersion !== 1 ||
    receipt.state !== 'authorized-for-access-or-use' ||
    authorizationHash !== fingerprint(body) ||
    !/^sha256:[a-f0-9]{64}$/.test(receipt.planHash)
  )
    throw new Error('Original BYOL terms authorization required');
  assertGcpCorporateFundingCurrent(funding, intent.project, receipt.billingAccountName);
  if (receipt.fundingPolicySha256 !== funding.policySha256) throw new Error('BYOL corporate funding policy changed');
  const current = await binding(intent, source, signal);
  if (fingerprint(current) !== fingerprint(receipt.binding))
    throw new Error('BYOL authorization image/context/documents changed');
  return receipt;
}

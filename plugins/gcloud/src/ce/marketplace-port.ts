import type { GcloudExecApi } from '../gcloud/exec';
import { fingerprint } from './discovery';
import {
  type GcpMarketplaceBinding,
  type GcpMarketplaceConsentPort,
  validateGcpMarketplaceBinding,
} from './marketplace-agreement';
import type { GcpCeIntent } from './types';
import { validateIntent, validateScope } from './validation';

export const GCP_CLOUD_TERMS_URL = 'https://console.developers.google.com/terms/cloud';
export function gcpMarketplacePrerequisiteGuidance(reason: GcpMarketplaceUnavailable['reason']) {
  if (reason !== 'cloud_terms_not_accepted') return {};
  return {
    prerequisite: 'google-cloud-terms',
    providerCode: 'UREQ_TOS_NOT_ACCEPTED',
    acceptanceUrl: GCP_CLOUD_TERMS_URL,
    nextSteps: [
      'Open the acceptance URL and sign in with the same Google account used by gcloud.',
      'Review and accept the Google Cloud terms shown; select the intended project if prompted.',
      'Retry scoped Consumer Procurement API enablement and agreement qualification to verify recovery.',
    ],
    marketplaceConsent: 'not-established',
  };
}
export class GcpMarketplaceUnavailable extends Error {
  constructor(
    readonly reason:
      | 'api_disabled'
      | 'permission_denied'
      | 'agreement_mapping_unavailable'
      | 'source_unavailable'
      | 'method_unavailable'
      | 'cloud_terms_not_accepted',
  ) {
    super(`GCP Marketplace unavailable: ${reason}`);
  }
}
export async function enableGcpMarketplaceApi(api: GcloudExecApi, project: string, signal?: AbortSignal) {
  validateScope(project);
  signal?.throwIfAborted();
  const response = await api.exec(
    'gcloud',
    ['services', 'enable', 'cloudcommerceconsumerprocurement.googleapis.com', `--project=${project}`, '--quiet'],
    { signal },
  );
  if (response.exitCode !== 0) {
    if (response.stderr.includes('UREQ_TOS_NOT_ACCEPTED'))
      throw new GcpMarketplaceUnavailable('cloud_terms_not_accepted');
    throw new GcpMarketplaceUnavailable('source_unavailable');
  }
}
/** Scoped Google SDK v1alpha1 consent methods; credentials and raw responses stay private. */
export function createGcpMarketplacePort(
  api: GcloudExecApi,
  intent: GcpCeIntent,
  reference?: { agreement: string; agreementDocument: string },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): GcpMarketplaceConsentPort {
  validateIntent(intent);
  const scoped = structuredClone(intent);
  const selected = reference ? structuredClone(reference) : undefined;
  let credential: string | undefined;
  let admittedBinding: string | undefined;
  const request = async (url: string, body?: Record<string, unknown>) => {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    combined.throwIfAborted();
    if (!credential) {
      const response = await api.exec(
        'gcloud',
        ['auth', 'print-access-token', `--project=${scoped.project}`, '--quiet'],
        { signal: combined },
      );
      if (response.exitCode !== 0 || !response.stdout.trim() || /\s/.test(response.stdout.trim()))
        throw new GcpMarketplaceUnavailable('source_unavailable');
      credential = response.stdout.trim();
    }
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: combined,
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': scoped.project,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) throw new GcpMarketplaceUnavailable('source_unavailable');
    let value: {
      error?: { message?: string; details?: { reason?: string }[] };
      projectId?: string;
      projectNumber?: string;
      id?: string;
      selfLink?: string;
      status?: string;
      licenses?: string[];
      description?: string;
      consents?: { agreement?: string; agreementDocument?: string }[];
      nextPageToken?: string;
    };
    try {
      value = JSON.parse(text);
    } catch {
      throw new GcpMarketplaceUnavailable('source_unavailable');
    }
    if (!response.ok) {
      const reasons = value.error?.details?.map((d: { reason?: string }) => d.reason) ?? [];
      if (reasons.includes('UREQ_TOS_NOT_ACCEPTED')) throw new GcpMarketplaceUnavailable('cloud_terms_not_accepted');
      if (reasons.includes('SERVICE_DISABLED')) throw new GcpMarketplaceUnavailable('api_disabled');
      if (response.status === 404 && value.error?.message === 'Method not found.')
        throw new GcpMarketplaceUnavailable('method_unavailable');
      if (response.status === 403) throw new GcpMarketplaceUnavailable('permission_denied');
      throw new GcpMarketplaceUnavailable('source_unavailable');
    }
    return value;
  };
  const apiRoot = 'https://cloudcommerceconsumerprocurement.googleapis.com/v1alpha1';
  const assertBinding = (b: GcpMarketplaceBinding) => {
    validateGcpMarketplaceBinding(b);
    if (
      admittedBinding !== fingerprint(b) ||
      b.project !== scoped.project ||
      b.imageId !== scoped.image.id ||
      b.imageSelfLink !== scoped.image.selfLink ||
      !scoped.image.licenses.includes(b.licenseSelfLink)
    )
      throw new Error('Consent escaped pinned image/project');
  };
  const grant = async (binding: GcpMarketplaceBinding, validateOnly: boolean) => {
    assertBinding(binding);
    return request(`${apiRoot}/projects/${binding.projectNumber}/consents:grant`, {
      consent: { agreementDocument: binding.agreementDocument },
      validateOnly,
    });
  };
  return {
    async binding() {
      if (scoped.image.licenses.length !== 1) throw new GcpMarketplaceUnavailable('agreement_mapping_unavailable');
      const project = await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${scoped.project}`);
      if (
        project.projectId !== scoped.project ||
        typeof project.projectNumber !== 'string' ||
        !/^\d+$/.test(project.projectNumber)
      )
        throw new Error('Marketplace project differs');
      const imagePrefix = 'https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/images/';
      if (
        !scoped.image.selfLink.startsWith(imagePrefix) ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(scoped.image.selfLink.slice(imagePrefix.length))
      )
        throw new Error('Pinned F5 image required');
      const image = await request(scoped.image.selfLink.replace('www.googleapis.com', 'compute.googleapis.com'));
      if (
        String(image.id) !== scoped.image.id ||
        image.selfLink !== scoped.image.selfLink ||
        image.status !== 'READY' ||
        JSON.stringify(image.licenses) !== JSON.stringify(scoped.image.licenses)
      )
        throw new Error('Marketplace image changed');
      const licenseLink = scoped.image.licenses[0];
      if (
        !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/f5-7626-networks-public\/global\/licenses\/[a-z][a-z0-9-]{0,62}$/.test(
          licenseLink,
        )
      )
        throw new Error('Pinned F5 license required');
      const license = await request(licenseLink.replace('www.googleapis.com', 'compute.googleapis.com'));
      const billingService =
        typeof license.description === 'string'
          ? license.description.match(
              /^License for Cloud Marketplace virtual machine image solution with billing service ([a-z][a-z0-9-]*\.endpoints\.f5-7626-networks-public\.cloud\.goog): default$/,
            )?.[1]
          : undefined;
      if (!billingService || license.selfLink !== licenseLink || !/^\d+$/.test(String(license.id)))
        throw new GcpMarketplaceUnavailable('agreement_mapping_unavailable');
      let resolved = selected;
      if (!resolved) {
        const prefix = `commerceoffercatalog.googleapis.com/services/${billingService}/standardOffers/`;
        const matches: { agreement: string; agreementDocument: string }[] = [];
        const tokens = new Set<string>();
        let pageToken = '';
        do {
          const url = new URL(`${apiRoot}/projects/${project.projectNumber}/consents`);
          url.searchParams.set('pageSize', '100');
          if (pageToken) url.searchParams.set('pageToken', pageToken);
          const page = await request(url.href);
          if (page.consents !== undefined && !Array.isArray(page.consents))
            throw new GcpMarketplaceUnavailable('source_unavailable');
          for (const consent of page.consents ?? [])
            if (
              typeof consent.agreement === 'string' &&
              consent.agreement.startsWith(prefix) &&
              typeof consent.agreementDocument === 'string'
            )
              matches.push({ agreement: consent.agreement, agreementDocument: consent.agreementDocument });
          if (page.nextPageToken !== undefined && typeof page.nextPageToken !== 'string')
            throw new GcpMarketplaceUnavailable('source_unavailable');
          pageToken = page.nextPageToken ?? '';
          if (pageToken && tokens.has(pageToken)) throw new GcpMarketplaceUnavailable('source_unavailable');
          tokens.add(pageToken);
          if (tokens.size > 100) throw new GcpMarketplaceUnavailable('source_unavailable');
        } while (pageToken);
        const unique = [...new Map(matches.map((m) => [m.agreementDocument, m])).values()];
        if (unique.length !== 1) throw new GcpMarketplaceUnavailable('agreement_mapping_unavailable');
        resolved = unique[0];
      }
      const binding = {
        project: scoped.project,
        projectNumber: String(project.projectNumber),
        imageId: scoped.image.id,
        imageSelfLink: scoped.image.selfLink,
        licenseId: String(license.id),
        licenseSelfLink: licenseLink,
        billingService,
        ...resolved,
      };
      validateGcpMarketplaceBinding(binding);
      admittedBinding = fingerprint(binding);
      return binding;
    },
    async check(binding) {
      assertBinding(binding);
      return request(`${apiRoot}/projects/${binding.projectNumber}/consents:check`, {
        agreement: binding.agreement,
      });
    },
    async validateGrant(binding) {
      await grant(binding, true);
    },
    grant(binding) {
      return grant(binding, false);
    },
  };
}

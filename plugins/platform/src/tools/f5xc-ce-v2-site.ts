import { createHash, timingSafeEqual } from 'node:crypto';
import type { CeV2Driver, CeV2SiteConfig } from '../ce/driver';
import { createDefaultCeV2Driver } from '../ce/driver';
import {
  assertSafeName,
  assertSecretFree,
  containsControlCharacters,
  PublicCeError,
  publicFailure,
  redactExternal,
} from '../ce/security';
import { assertCapabilitiesSupportConfig, assertCeV2SiteConfig } from '../ce/site-config';
import type { PlatformToolApi, PlatformToolContext } from '../types';

interface SiteParams {
  action: 'create' | 'read' | 'update' | 'delete';
  namespace: string;
  siteName: string;
  config?: CeV2SiteConfig;
  expectedEtag?: string;
  planSha256?: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function hashesEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function createSitePlan(request: Omit<SiteParams, 'planSha256'>) {
  assertSafeName(request.namespace, 'namespace');
  assertSafeName(request.siteName, 'siteName');
  assertSecretFree(request.config ?? {});
  if (request.action === 'create' || request.action === 'update') assertCeV2SiteConfig(request.config);
  if (request.expectedEtag && containsControlCharacters(request.expectedEtag))
    throw new PublicCeError('expectedEtag contains control characters');
  const draft = {
    schemaVersion: 2 as const,
    action: request.action,
    namespace: request.namespace,
    siteName: request.siteName,
    config: request.config ?? null,
    expectedEtag: request.expectedEtag ?? null,
  };
  const planSha256 = hash(draft);
  return { ...draft, planId: `f5xc-ce-v2-${planSha256.slice(0, 24)}`, planSha256 };
}

export function createF5xcCeV2SiteTool(pi: PlatformToolApi, makeDriver: () => CeV2Driver = createDefaultCeV2Driver) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_site',
    label: 'F5 Secure Mesh Site v2',
    description:
      'Plan, create, read, update, or delete Secure Mesh Site v2 configuration and its ordered interface, VRF, BGP, and network metadata. Mutations require the exact canonical plan hash.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('create'),
        Type.Literal('read'),
        Type.Literal('update'),
        Type.Literal('delete'),
      ]),
      namespace: Type.String(),
      siteName: Type.String(),
      config: Type.Optional(
        Type.Object({
          provider: Type.Union([Type.Literal('aws'), Type.Literal('azure')]),
          haMode: Type.Union([Type.Literal('one-node'), Type.Literal('three-node')]),
          vrfs: Type.Array(Type.Object({ index: Type.Number(), name: Type.String() })),
          interfaces: Type.Array(
            Type.Object({
              index: Type.Number(),
              role: Type.Union([
                Type.Literal('slo'),
                Type.Literal('sli'),
                Type.Literal('management'),
                Type.Literal('service'),
                Type.Literal('workload'),
              ]),
              vrf: Type.String(),
              addressing: Type.Object({
                mode: Type.Union([Type.Literal('dhcp'), Type.Literal('static')]),
                addresses: Type.Array(Type.String()),
                gateway: Type.Optional(Type.String()),
              }),
            }),
          ),
          bgpPeers: Type.Array(
            Type.Object({
              index: Type.Number(),
              vrf: Type.String(),
              interfaceIndex: Type.Number(),
              peerAddress: Type.String(),
              localAsn: Type.Number(),
              peerAsn: Type.Number(),
            }),
          ),
          providerNetwork: Type.Object({ profile: Type.String(), metadata: Type.Unknown() }),
        }),
      ),
      expectedEtag: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: SiteParams,
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      try {
        assertSafeName(params.namespace, 'namespace');
        assertSafeName(params.siteName, 'siteName');
        const driver = makeDriver();
        const capabilities = await driver.capabilities();
        if (params.action === 'read') {
          const result = await driver.site('read', params);
          return {
            content: [
              { type: 'text' as const, text: `Read Secure Mesh Site v2 ${params.namespace}/${params.siteName}.` },
            ],
            details: { tool: 'f5xc_ce_v2_site', site: redactExternal(result) },
          };
        }
        const plan = createSitePlan(params);
        if (plan.config && (params.action === 'create' || params.action === 'update'))
          assertCapabilitiesSupportConfig(capabilities, plan.config);
        if (!params.planSha256) {
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({ kind: 'f5xc-ce-v2-site-plan', plan }),
            'f5xc-ce-v2-site-plan',
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Site plan ID: ${plan.planId}\nSHA-256: ${plan.planSha256}\nArtifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
              },
            ],
            details: { tool: 'f5xc_ce_v2_site', plan, artifactId },
          };
        }
        if (!hashesEqual(params.planSha256, plan.planSha256))
          throw new Error('Site plan SHA-256 does not match the canonical request');
        if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
          throw new Error('Headless site mutation requires XCSH_CE_HEADLESS_MUTATIONS=1');
        if (params.action === 'delete' && !ctx.hasUI && process.env.XCSH_CE_ALLOW_DESTROY !== '1')
          throw new Error('Headless site deletion requires XCSH_CE_ALLOW_DESTROY=1');
        if (
          ctx.hasUI &&
          !(await ctx.ui.confirm(`${params.action} Secure Mesh Site v2`, `${plan.planId}\n${plan.planSha256}`))
        )
          throw new Error('Site mutation was not approved');
        const result = await driver.site(params.action, params);
        return {
          content: [
            {
              type: 'text' as const,
              text: `${params.action} completed for Secure Mesh Site v2 ${params.namespace}/${params.siteName}.`,
            },
          ],
          details: { tool: 'f5xc_ce_v2_site', planId: plan.planId, site: redactExternal(result) },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 operation failed: ${publicFailure(error, 'the authenticated tenant operation was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_site' },
        };
      }
    },
  };
}

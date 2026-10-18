import { createHash, timingSafeEqual } from 'node:crypto';
import type { SiteBinding } from '../ce/runtime';
import { assertSafeName, assertSecretFree, PublicCeError, publicFailure } from '../ce/security';
import { type CePlatformService, createCePlatformService } from '../ce/service';
import type { WireSiteIntent } from '../ce/wire-site';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export interface SiteParams {
  action: 'create' | 'read' | 'update' | 'delete';
  namespace: string;
  siteName: string;
  binding: SiteBinding;
  config?: WireSiteIntent;
  expectedUid?: string;
  expectedResourceVersion?: string;
  platformContext?: string;
  planSha256?: string;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function createSitePlan(request: Omit<SiteParams, 'planSha256'>, tenantOrigin?: string) {
  assertSafeName(request.siteName, 'siteName');
  if (request.namespace !== 'system' || request.binding?.siteName !== request.siteName)
    throw new PublicCeError('The exact system-namespace deployment binding is required');
  assertSecretFree(request);
  if (['create', 'update'].includes(request.action) && !request.config)
    throw new PublicCeError('A schema-valid site intent with resolved node interfaces is required');
  if (['update', 'delete'].includes(request.action) && !request.expectedUid)
    throw new PublicCeError('The exact existing site UID is required');
  if (request.action === 'update' && !request.expectedResourceVersion)
    throw new PublicCeError('The exact existing resource version is required');
  const { planSha256: _hash, ...params } = request as SiteParams;
  const draft = { schemaVersion: 3, ...params, tenantOrigin };
  const planSha256 = createHash('sha256').update(canonical(draft)).digest('hex');
  return { ...draft, planId: `f5xc-ce-v2-${planSha256.slice(0, 24)}`, planSha256 };
}
export function ceBindingSchema(pi: PlatformToolApi) {
  const { Type } = pi.typebox;
  return Type.Object({
    owner: Type.Object({
      deploymentId: Type.String(),
      engine: Type.Union([Type.Literal('native'), Type.Literal('terraform')]),
      provider: Type.Union([Type.Literal('aws'), Type.Literal('azure')]),
      account: Type.String(),
      region: Type.String(),
    }),
    siteName: Type.String(),
    nodes: Type.Array(Type.String()),
  });
}
export function createF5xcCeV2SiteTool(
  pi: PlatformToolApi,
  makeService: (ctx?: PlatformToolContext) => CePlatformService = () => createCePlatformService(),
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_site',
    label: 'F5 Secure Mesh Site v2',
    description:
      'Plan and execute owned CE site operations through the native or Terraform lifecycle service. Creation and replacement require resolved MAC/device interfaces and an exact tenant-bound plan hash.',
    parameters: Type.Object({
      action: Type.Union(['create', 'read', 'update', 'delete'].map((v) => Type.Literal(v))),
      namespace: Type.String(),
      siteName: Type.String(),
      binding: ceBindingSchema(pi),
      config: Type.Optional(
        Type.Object({
          schemaVersion: Type.Literal(2),
          provider: Type.Union([Type.Literal('aws'), Type.Literal('azure')]),
          haMode: Type.Union([Type.Literal('one-node'), Type.Literal('three-node')]),
          nodes: Type.Array(Type.Object({ hostname: Type.String(), interfaces: Type.Array(Type.Unknown()) })),
          settings: Type.Unknown(),
        }),
      ),
      expectedUid: Type.Optional(Type.String()),
      expectedResourceVersion: Type.Optional(Type.String()),
      platformContext: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: SiteParams,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      try {
        const service = makeService(ctx);
        const capability = await service.capabilities(params.platformContext);
        const plan = createSitePlan(params, capability.tenantOrigin);
        const runtime = await service.runtime(params.binding.owner.engine, params.platformContext);
        if (params.config) runtime.contract.buildSite(params.config);
        if (params.action === 'read') {
          const site = await runtime.observeOwnedSite(params.binding, signal);
          return {
            content: [{ type: 'text' as const, text: `Read ${params.siteName}.` }],
            details: {
              tool: 'f5xc_ce_v2_site',
              siteUid: (site.system_metadata as Record<string, unknown>).uid,
              resourceVersion: site.resource_version,
            },
          };
        }
        if (!params.planSha256) {
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({ kind: 'f5xc-ce-v2-site-plan', plan }),
            'f5xc-ce-v2-site-plan',
          );
          return {
            content: [{ type: 'text' as const, text: `Site plan: ${plan.planId}\nSHA-256: ${plan.planSha256}` }],
            details: { tool: 'f5xc_ce_v2_site', plan, artifactId },
          };
        }
        if (
          !/^[a-f0-9]{64}$/.test(params.planSha256) ||
          !timingSafeEqual(Buffer.from(params.planSha256, 'hex'), Buffer.from(plan.planSha256, 'hex'))
        )
          throw new PublicCeError('Site plan SHA-256 does not match the canonical request and tenant');
        if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
          throw new PublicCeError('Headless mutation requires XCSH_CE_HEADLESS_MUTATIONS=1');
        if (params.action === 'delete' && !ctx.hasUI && process.env.XCSH_CE_ALLOW_DESTROY !== '1')
          throw new PublicCeError('Headless deletion requires XCSH_CE_ALLOW_DESTROY=1');
        if (
          ctx.hasUI &&
          !(await ctx.ui.confirm(`${params.action} Secure Mesh Site v2`, `${plan.planId}\n${plan.planSha256}`))
        )
          throw new PublicCeError('Site mutation was not approved');
        const store = await service.storage(params.binding.owner);
        const checkpoint = (record: Record<string, unknown>) =>
          store.write(`public-site-${params.siteName}.json`, { planId: plan.planId, record });
        if (params.action === 'create') {
          if (!params.config) throw new PublicCeError('Site intent is required');
          await runtime.ensureSite(params.binding, params.config, checkpoint, signal);
        } else if (params.action === 'update') {
          if (!params.config || !params.expectedUid || !params.expectedResourceVersion)
            throw new PublicCeError('Exact replacement identity is required');
          await runtime.replaceSite(
            params.binding,
            params.config,
            { uid: params.expectedUid, resourceVersion: params.expectedResourceVersion },
            checkpoint,
            signal,
          );
        } else {
          if (!params.expectedUid) throw new PublicCeError('Exact deletion UID is required');
          await runtime.deleteSiteExact(params.binding, params.expectedUid, signal);
        }
        return {
          content: [{ type: 'text' as const, text: `${params.action} completed for ${params.siteName}.` }],
          details: { tool: 'f5xc_ce_v2_site', planId: plan.planId },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `CE site operation failed: ${publicFailure(error, 'the owned lifecycle operation was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_site' },
        };
      }
    },
  };
}

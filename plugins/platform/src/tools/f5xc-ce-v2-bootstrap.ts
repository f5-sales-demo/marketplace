import type { CeV2Driver } from '../ce/driver';
import { createDefaultCeV2Driver } from '../ce/driver';
import { assertSafeName, PublicCeError, publicFailure } from '../ce/security';
import { defaultBootstrapRoot, storeBootstrapToken } from '../ce/token-store';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2BootstrapTool(
  pi: PlatformToolApi,
  makeDriver: (context?: PlatformToolContext) => CeV2Driver = createDefaultCeV2Driver,
  root = defaultBootstrapRoot(),
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_bootstrap',
    label: 'Checkout CE v2 Bootstrap',
    description:
      'Checkout verified Azure site-bound JWT and issued cloud-init, or approved AWS console bootstrap, returning only a session-bound opaque reference. Preserve the upstream token name for revocation.',
    parameters: Type.Object({
      namespace: Type.String(),
      provider: Type.Optional(Type.Union([Type.Literal('aws'), Type.Literal('azure')])),
      siteName: Type.String(),
      nodeName: Type.String(),
      expiresInSeconds: Type.Number({ minimum: 1, maximum: 900 }),
    }),
    async execute(
      _id: string,
      params: {
        namespace: string;
        provider?: 'aws' | 'azure';
        siteName: string;
        nodeName: string;
        expiresInSeconds: number;
      },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      try {
        assertSafeName(params.namespace, 'namespace');
        assertSafeName(params.siteName, 'siteName');
        assertSafeName(params.nodeName, 'nodeName');
        if (!ctx.hasUI && !(params.provider === 'azure' && process.env.XCSH_CE_HEADLESS_MUTATIONS === '1'))
          throw new PublicCeError('Headless bootstrap checkout is unavailable until F5 publishes a supported API');
        const driver = makeDriver(ctx);
        const capabilities = await driver.capabilities();
        if (!capabilities.bootstrapDrivers.includes(params.provider === 'azure' ? 'api' : 'console'))
          throw new PublicCeError('Console-only bootstrap is unavailable in the verified SMSv2 release');
        if (capabilities.bootstrapDrivers.length === 0)
          throw new PublicCeError('Tenant exposes no supported Secure Mesh Site v2 bootstrap checkout capability');
        if (
          ctx.hasUI &&
          !(await ctx.ui.confirm(
            'Checkout one-use CE bootstrap',
            `Create a short-lived token for ${params.namespace}/${params.siteName}/${params.nodeName}?`,
          ))
        )
          throw new PublicCeError('Bootstrap checkout was not approved');
        const checkout = await driver.checkoutBootstrap(params, ctx.hasUI);
        const stored = await storeBootstrapToken({
          sessionId: ctx.sessionManager.getSessionId(),
          token: checkout.token,
          expiresInSeconds: params.expiresInSeconds,
          root,
        });
        return {
          content: [
            { type: 'text' as const, text: `Bootstrap reference: ${stored.reference}\nExpires: ${stored.expiresAt}` },
          ],
          details: {
            tool: 'f5xc_ce_v2_bootstrap',
            reference: stored.reference,
            expiresAt: stored.expiresAt,
            upstreamTokenName: checkout.upstreamTokenName,
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `CE v2 bootstrap checkout failed: ${publicFailure(error, 'the authenticated checkout driver was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_bootstrap' },
        };
      }
    },
  };
}

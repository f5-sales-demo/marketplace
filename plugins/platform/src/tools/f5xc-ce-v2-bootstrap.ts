import type { CeV2Driver } from '../ce/driver';
import { createDefaultCeV2Driver } from '../ce/driver';
import { assertSafeName, PublicCeError, publicFailure } from '../ce/security';
import { defaultBootstrapRoot, storeBootstrapToken } from '../ce/token-store';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2BootstrapTool(
  pi: PlatformToolApi,
  makeDriver: () => CeV2Driver = createDefaultCeV2Driver,
  root = defaultBootstrapRoot(),
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_bootstrap',
    label: 'Checkout CE v2 Bootstrap',
    description:
      'Obtain a one-use Secure Mesh Site v2 bootstrap token only through an advertised executable checkout contract, returning a session-bound opaque reference.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      nodeName: Type.String(),
      expiresInSeconds: Type.Number({ minimum: 1, maximum: 900 }),
    }),
    async execute(
      _id: string,
      params: { namespace: string; siteName: string; nodeName: string; expiresInSeconds: number },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      try {
        assertSafeName(params.namespace, 'namespace');
        assertSafeName(params.siteName, 'siteName');
        assertSafeName(params.nodeName, 'nodeName');
        if (!ctx.hasUI)
          throw new PublicCeError('Headless bootstrap checkout is unavailable until F5 publishes a supported API');
        const driver = makeDriver();
        const capabilities = await driver.capabilities();
        if (capabilities.bootstrapDrivers.length === 0)
          throw new PublicCeError('Published schema support does not establish a bootstrap checkout capability');
        if (!capabilities.bootstrapDrivers.includes('console'))
          throw new PublicCeError('Console bootstrap is unavailable in the executable SMSv2 contract');
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
          details: { tool: 'f5xc_ce_v2_bootstrap', reference: stored.reference, expiresAt: stored.expiresAt },
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

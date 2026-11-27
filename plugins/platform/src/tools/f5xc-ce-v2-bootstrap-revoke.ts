import { type CeV2Driver, createDefaultCeV2Driver } from '../ce/driver';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2BootstrapRevokeTool(
  pi: PlatformToolApi,
  makeDriver: (context?: PlatformToolContext) => CeV2Driver = createDefaultCeV2Driver,
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_bootstrap_revoke',
    label: 'Revoke CE Bootstrap',
    description:
      'Verify the upstream JWT token belongs to the requested SMSv2 site, revoke it and independently prove absence. Local reference expiry does not revoke upstream credentials.',
    parameters: Type.Object({ namespace: Type.Literal('system'), siteName: Type.String(), tokenName: Type.String() }),
    async execute(
      _id: string,
      params: { namespace: string; siteName: string; tokenName: string },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      try {
        if (!ctx.hasUI && process.env.XCSH_CE_ALLOW_DESTROY !== '1')
          throw new Error('Destruction authorization is required');
        if (
          ctx.hasUI &&
          !(await ctx.ui.confirm('Revoke site-bound bootstrap JWT', `${params.siteName}/${params.tokenName}`))
        )
          throw new Error('Revocation was not approved');
        const driver = makeDriver(ctx);
        if (!driver.revokeBootstrap) throw new Error('Verified upstream revocation is unavailable');
        await driver.revokeBootstrap(params);
        return {
          content: [{ type: 'text' as const, text: 'Site-bound bootstrap JWT absence verified.' }],
          details: { tool: 'f5xc_ce_v2_bootstrap_revoke', absent: true },
        };
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'Bootstrap JWT revocation or absence verification failed.' }],
          isError: true,
          details: { tool: 'f5xc_ce_v2_bootstrap_revoke', absent: false },
        };
      }
    },
  };
}

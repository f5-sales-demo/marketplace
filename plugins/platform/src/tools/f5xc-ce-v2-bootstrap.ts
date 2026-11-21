import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { acquireProcessLock } from '../ce/process-lock';
import { assertSafeName, PublicCeError, publicFailure } from '../ce/security';
import { type CePlatformService, createCePlatformService } from '../ce/service';
import { defaultBootstrapRoot, storeBootstrapToken } from '../ce/token-store';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2BootstrapTool(
  pi: PlatformToolApi,
  makeService: (ctx?: PlatformToolContext) => CePlatformService = () => createCePlatformService(),
  root = defaultBootstrapRoot(),
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_bootstrap',
    label: 'Checkout CE v2 Bootstrap',
    description:
      'Issue verified site-bound bootstrap through the API in interactive or headless execution, returning a short-lived, one-use local reference. The upstream token remains privately tracked for coordinated revocation.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      nodeName: Type.String(),
      expiresInSeconds: Type.Number({ minimum: 1, maximum: 900 }),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        namespace: string;
        siteName: string;
        nodeName: string;
        expiresInSeconds: number;
        platformContext?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      let release: (() => Promise<void>) | undefined;
      try {
        assertSafeName(params.siteName, 'siteName');
        assertSafeName(params.nodeName, 'nodeName');
        if (
          params.namespace !== 'system' ||
          !Number.isInteger(params.expiresInSeconds) ||
          params.expiresInSeconds < 1 ||
          params.expiresInSeconds > 900
        )
          throw new PublicCeError('A system-namespace site and expiry of 1 to 900 seconds are required');
        if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
          throw new PublicCeError('Headless bootstrap requires XCSH_CE_HEADLESS_MUTATIONS=1');
        const service = makeService(ctx);
        const known = await service.siteBinding?.(params.siteName, params.platformContext);
        if (!known?.binding.nodes.includes(params.nodeName))
          throw new PublicCeError('A trusted deployment and node binding is required');
        const runtime = await service.runtime(known.binding.owner.engine, params.platformContext);
        if (runtime.contract.fingerprint !== known.contractFingerprint)
          throw new PublicCeError('Deployment contract binding requires refresh');
        const site = await runtime.observeOwnedSite(known.binding, signal);
        if ((site.system_metadata as Record<string, unknown>).uid !== known.siteUid)
          throw new PublicCeError('Deployment site UID changed; refresh bindings');
        if (ctx.hasUI && !(await ctx.ui.confirm('Checkout CE bootstrap', `${params.siteName}/${params.nodeName}`)))
          throw new PublicCeError('Bootstrap checkout was not approved');
        const store = await service.storage(known.binding.owner);
        if (known.binding.owner.engine === 'terraform')
          release = await acquireProcessLock(
            join(store.directory, `.${known.binding.owner.provider}-terraform-lifecycle-lock`),
          );
        for (const marker of ['azure-terraform-lifecycle-retirement.json', 'aws-terraform-lifecycle-retirement.json']) {
          try {
            await store.read(marker);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw error;
          }
          throw new PublicCeError('Deployment retirement has started; bootstrap checkout is unavailable');
        }
        const tokenName = `${params.siteName.slice(0, 40)}-bt-${randomUUID().slice(0, 8)}`;
        let jwt: string | undefined;
        await runtime.bootstrap(
          known.binding,
          params.nodeName,
          tokenName,
          async (secret) => {
            await store.write(`${tokenName}.json`, secret);
            jwt = secret.jwt;
          },
          signal,
        );
        if (!jwt) throw new PublicCeError('Issued bootstrap token was not checkpointed');
        const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
        const lifetime = Math.min(params.expiresInSeconds, Math.floor((claims.exp * 1000 - Date.now()) / 1000));
        const stored = await storeBootstrapToken({
          sessionId: ctx.sessionManager.getSessionId(),
          token: jwt,
          expiresInSeconds: lifetime,
          root,
          onPrepared: async (checkout) => {
            await store.write(`bootstrap-checkout-${checkout.reference.split('/').at(-1)}.json`, {
              schemaVersion: 1,
              owner: known.binding.owner,
              binding: known.binding,
              siteUid: known.siteUid,
              contractFingerprint: known.contractFingerprint,
              tokenName,
              node: params.nodeName,
              checkout,
            });
          },
        });
        return {
          content: [
            { type: 'text' as const, text: `Bootstrap reference: ${stored.reference}\nExpires: ${stored.expiresAt}` },
          ],
          details: { tool: 'f5xc_ce_v2_bootstrap', ...stored },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `CE bootstrap failed: ${publicFailure(error, 'the owned API checkout was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_bootstrap' },
        };
      } finally {
        await release?.();
      }
    },
  };
}

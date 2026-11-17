// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/platform/src/tools/f5xc-ce-v2-bootstrap.ts
// plugins/platform/src/ce/token-store.ts
import { createHash, randomUUID, randomUUID as randomUUID2 } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, join as join2, resolve, sep } from 'node:path';
import { assertSafeName, PublicCeError, publicFailure } from './runtime-afkskas7.js';
import { acquireProcessLock, createCePlatformService } from './runtime-vzfrz4g3.js';

var SAFE_ID = /^[a-zA-Z0-9._-]{1,128}$/;
function defaultBootstrapRoot() {
  return join(tmpdir(), 'xcsh-f5xc-ce');
}
function assertWithin(root, target) {
  const base = resolve(root);
  const candidate = resolve(target);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`))
    throw new Error('Bootstrap path escapes the secure root');
}
async function storeBootstrapToken(input) {
  const root = input.root ?? defaultBootstrapRoot();
  if (!isAbsolute(root)) throw new Error('Bootstrap root must be absolute');
  if (!SAFE_ID.test(input.sessionId)) throw new Error('Invalid session identifier for bootstrap storage');
  if (!input.token || Array.from(input.token).some((character) => [0, 10, 13].includes(character.charCodeAt(0))))
    throw new Error('Bootstrap token is empty or malformed');
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 900)
    throw new Error('Bootstrap expiry must be between 1 and 900 seconds');
  const id = randomUUID();
  const sessionDir = join(root, input.sessionId);
  const itemDir = join(sessionDir, id);
  for (const target of [sessionDir, itemDir]) assertWithin(root, target);
  await mkdir(root, { recursive: true, mode: 448 });
  await chmod(root, 448);
  await mkdir(sessionDir, { recursive: true, mode: 448 });
  await chmod(sessionDir, 448);
  await mkdir(itemDir, { mode: 448 });
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
  const digest = createHash('sha256').update(input.token, 'utf8').digest('hex');
  const metadata = {
    version: 1,
    session: input.sessionId,
    id,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    digest,
    expiresAt,
    consumed: false,
    checkoutReady: false,
  };
  await writeFile(join(itemDir, 'metadata.json'), JSON.stringify(metadata), { mode: 384, flag: 'wx' });
  await input.onPrepared?.({
    schemaVersion: 1,
    reference: `f5xc-ce://${input.sessionId}/${id}`,
    root,
    digest,
    expiresAt,
    uid: metadata.uid,
  });
  await writeFile(join(itemDir, 'token'), input.token, { mode: 384, flag: 'wx' });
  await writeFile(join(itemDir, 'metadata.json'), JSON.stringify({ ...metadata, checkoutReady: true }), {
    mode: 384,
  });
  return { reference: `f5xc-ce://${input.sessionId}/${id}`, expiresAt };
}

// plugins/platform/src/tools/f5xc-ce-v2-bootstrap.ts
function createF5xcCeV2BootstrapTool(pi, makeService = () => createCePlatformService(), root = defaultBootstrapRoot()) {
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
    async execute(_id, params, signal, _update, ctx) {
      let release;
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
        const store = await service.storage(known.binding.owner);
        const owner = known.binding.owner;
        const lockName =
          owner.engine === 'terraform'
            ? `.${owner.provider}-terraform-lifecycle-lock`
            : owner.provider === 'aws'
              ? '.aws-native-teardown-lock'
              : '.azure-relay-native-mutation-lock';
        release = await acquireProcessLock(join2(store.directory, lockName));
        signal?.throwIfAborted();
        for (const marker of [
          'azure-terraform-lifecycle-retirement.json',
          'aws-terraform-lifecycle-retirement.json',
          'azure-native-lifecycle-retirement.json',
          'aws-native-lifecycle-retirement.json',
          'aws-native-bootstrap-retirement.json',
        ]) {
          try {
            await store.read(marker);
          } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
          }
          throw new PublicCeError('Deployment retirement has started; bootstrap checkout is unavailable');
        }
        signal?.throwIfAborted();
        const runtime = await service.runtime(owner.engine, params.platformContext);
        if (runtime.contract.fingerprint !== known.contractFingerprint)
          throw new PublicCeError('Deployment contract binding requires refresh');
        const site = await runtime.observeOwnedSite(known.binding, signal);
        if (site.system_metadata.uid !== known.siteUid)
          throw new PublicCeError('Deployment site UID changed; refresh bindings');
        if (ctx.hasUI && !(await ctx.ui.confirm('Checkout CE bootstrap', `${params.siteName}/${params.nodeName}`)))
          throw new PublicCeError('Bootstrap checkout was not approved');
        const tokenName = `${params.siteName.slice(0, 40)}-bt-${randomUUID2().slice(0, 8)}`;
        let jwt;
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
            {
              type: 'text',
              text: `Bootstrap reference: ${stored.reference}
Expires: ${stored.expiresAt}`,
            },
          ],
          details: { tool: 'f5xc_ce_v2_bootstrap', ...stored },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
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

export { createF5xcCeV2BootstrapTool };

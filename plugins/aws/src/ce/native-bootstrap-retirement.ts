import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type BootstrapCheckoutBinding, retireBootstrapToken } from '../../../platform/src/ce/token-store';
import { canonicalSha256 } from './canonical';
import type { AwsNativeTeardownPlan } from './native-teardown';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Item = {
  path: string;
  sha256: string;
  kind: 'token' | 'checkout' | 'cloud-init';
  tokenName: string;
  node: string;
  siteName: string;
  tokenDigest: string;
  checkout?: BootstrapCheckoutBinding;
};
const markerName = 'aws-native-bootstrap-retirement.json';
const hash = (body: string | Uint8Array) => createHash('sha256').update(body).digest('hex');
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Native credential binding is malformed');
  return value as Record<string, unknown>;
};
async function optional<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
async function directory(path: string) {
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o777) !== 0o700 ||
    (await realpath(path)) !== path
  )
    throw Error('Native credential directory ownership differs');
}
async function file(path: string) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o777) !== 0o600 ||
    info.size > 2 * 1024 * 1024 ||
    (await realpath(path)) !== path
  )
    throw Error('Native credential file ownership differs');
  return readFile(path);
}

/** Called after the coordinator's final cloud read and per-site deletion observations. */
export async function retireAwsNativeBootstrapCredentials(
  base: AwsCePlan,
  plan: Pick<AwsNativeTeardownPlan, 'sourcePlanSha256' | 'cloudPlanSha256' | 'planSha256' | 'drain'> & {
    retirement: Array<{ siteName: string; siteUid: string; tokens: Array<{ node: string; name: string }> }>;
  },
  store: CeDeploymentStore,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await store.verify();
  if (
    base.engine !== 'native' ||
    store.owner.engine !== 'native' ||
    store.owner.provider !== 'aws' ||
    plan.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(store.owner) !== canonicalSha256(plan.drain.owner)
  )
    throw Error('Native credential retirement owner differs');
  const evidence = {
    owner: store.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: plan.planSha256,
    cloudPlanSha256: plan.cloudPlanSha256,
    retirement: plan.retirement,
  };
  const evidenceSha256 = canonicalSha256(evidence);
  const tokens = new Map(
    plan.retirement.flatMap((site) =>
      site.tokens.map((token) => [token.name, { ...token, siteName: site.siteName } as const] as const),
    ),
  );
  if (tokens.size !== plan.retirement.reduce((count, site) => count + site.tokens.length, 0))
    throw Error('Native token retirement inventory is duplicated');
  let marker = (await optional(() => store.read(markerName))) as
    | { schemaVersion: number; evidenceSha256: string; items: Item[]; inventorySha256: string; status: string }
    | undefined;
  if (!marker) {
    const items: Item[] = [];
    const digests = new Map<string, { node: string; digest: string }>();
    for (const [name, expected] of tokens) {
      const bytes = await optional(() => file(join(store.directory, `${name}.json`)));
      if (!bytes) continue;
      const value = object(await store.read(`${name}.json`));
      if (
        value.tokenName !== name ||
        value.node !== expected.node ||
        value.siteName !== expected.siteName ||
        typeof value.jwt !== 'string' ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt)
      )
        throw Error('Native issued-token checkpoint differs');
      digests.set(name, { node: expected.node, digest: hash(value.jwt) });
      items.push({
        path: `${name}.json`,
        kind: 'token',
        sha256: hash(bytes),
        tokenName: name,
        node: expected.node,
        siteName: expected.siteName,
        tokenDigest: hash(value.jwt),
      });
    }
    for (const name of (await readdir(store.directory)).sort()) {
      if (name.endsWith('.json') && !tokens.has(name.slice(0, -5))) {
        const candidate = object(await store.read(name));
        if (Object.hasOwn(candidate, 'jwt')) throw Error('Unbound native token checkpoint blocks retirement');
      }
      if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name)) {
        const value = object(await store.read(name)),
          checkout = object(value.checkout);
        const site = plan.retirement.find((item) => item.siteUid === value.siteUid);
        const binding = siteBindings(base).find((item) => item.binding.siteName === site?.siteName)?.binding;
        const token = tokens.get(String(value.tokenName)),
          issued = digests.get(String(value.tokenName));
        if (
          value.schemaVersion !== 1 ||
          !site ||
          !binding ||
          !token ||
          !issued ||
          canonicalSha256(value.owner) !== canonicalSha256(store.owner) ||
          canonicalSha256(value.binding) !== canonicalSha256(binding) ||
          value.node !== token.node ||
          token.siteName !== site.siteName ||
          value.contractFingerprint !== plan.drain.siteContractFingerprint ||
          checkout.digest !== issued.digest ||
          name !== `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json`
        )
          throw Error('Native opaque checkout provenance differs');
        items.push({
          path: name,
          kind: 'checkout',
          tokenName: token.name,
          node: token.node,
          siteName: token.siteName,
          tokenDigest: issued.digest,
          sha256: hash(await file(join(store.directory, name))),
          checkout: checkout as unknown as BootstrapCheckoutBinding,
        });
      } else if (/^node-[A-Za-z0-9]{6}$/.test(name)) {
        const path = join(store.directory, name);
        await directory(path);
        if (JSON.stringify((await readdir(path)).sort()) !== JSON.stringify(['cloud-init.yaml']))
          throw Error('Native launch staging inventory differs');
        const bytes = await file(join(path, 'cloud-init.yaml'));
        let document: Record<string, unknown>, token: unknown;
        try {
          document = object(Bun.YAML.parse(bytes.toString()));
          const files = document.write_files;
          if (!Array.isArray(files)) throw Error();
          const userData = files.map(object).filter((item) => item.path === '/etc/vpm/user_data');
          if (userData.length !== 1 || typeof userData[0].content !== 'string') throw Error();
          token = object(Bun.YAML.parse(userData[0].content)).token;
        } catch {
          throw Error('Native launch staging is malformed');
        }
        if (
          typeof token !== 'string' ||
          ![...digests.values()].some((item) => item.node === document.hostname && item.digest === hash(token))
        )
          throw Error('Native launch staging token or node differs');
        const matched = [...digests.entries()].find(
          ([, item]) => item.node === document.hostname && item.digest === hash(token as string),
        );
        if (!matched) throw Error('Native launch staging binding is missing');
        const expected = tokens.get(matched[0]);
        if (!expected) throw Error('Native launch token inventory differs');
        items.push({
          path: `${name}/cloud-init.yaml`,
          kind: 'cloud-init',
          sha256: hash(bytes),
          tokenName: matched[0],
          node: expected.node,
          siteName: expected.siteName,
          tokenDigest: matched[1].digest,
        });
      }
    }
    marker = { schemaVersion: 1, evidenceSha256, items, inventorySha256: canonicalSha256(items), status: 'retiring' };
    await store.write(markerName, marker, signal);
  }
  if (
    marker.schemaVersion !== 1 ||
    marker.evidenceSha256 !== evidenceSha256 ||
    !Array.isArray(marker.items) ||
    marker.inventorySha256 !== canonicalSha256(marker.items) ||
    !['retiring', 'retired'].includes(marker.status)
  )
    throw Error('Native credential retirement journal differs');
  if (new Set(marker.items.map((item) => item.path)).size !== marker.items.length)
    throw Error('Native credential inventory paths are duplicated');
  for (const item of marker.items) {
    const expected = tokens.get(item.tokenName);
    if (
      !expected ||
      item.node !== expected.node ||
      item.siteName !== expected.siteName ||
      !/^[a-f0-9]{64}$/.test(item.tokenDigest) ||
      !['token', 'checkout', 'cloud-init'].includes(item.kind) ||
      (item.kind === 'token' && item.path !== `${item.tokenName}.json`) ||
      (item.kind === 'checkout' &&
        (!item.checkout ||
          item.checkout.digest !== item.tokenDigest ||
          item.path !== `bootstrap-checkout-${item.checkout.reference.split('/').at(-1)}.json`)) ||
      (item.kind === 'cloud-init' && !item.path.endsWith('/cloud-init.yaml'))
    )
      throw Error('Native credential journal target differs');
    if (
      !/^(?:[a-z][a-z0-9-]{0,62}\.json|bootstrap-checkout-[a-f0-9-]{36}\.json|node-[A-Za-z0-9]{6}\/cloud-init\.yaml)$/.test(
        item.path,
      ) ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw Error('Native credential retirement path differs');
    const bytes = await optional(() => file(join(store.directory, item.path)));
    if (bytes && hash(bytes) !== item.sha256) throw Error('Native credential staging changed after preparation');
  }
  for (const item of marker.items.filter((item) => item.kind === 'checkout')) {
    signal?.throwIfAborted();
    if (!item.checkout) throw Error('Native checkout retirement binding is missing');
    await retireBootstrapToken(item.checkout, evidenceSha256, signal);
  }
  for (const item of marker.items) {
    signal?.throwIfAborted();
    await store.verify();
    const path = join(store.directory, item.path),
      bytes = await optional(() => file(path));
    if (bytes && hash(bytes) !== item.sha256) throw Error('Native credential staging changed before retirement');
    if (bytes) await unlink(path);
    if (item.kind === 'cloud-init') {
      const parent = join(store.directory, item.path.split('/')[0]);
      if (await optional(() => lstat(parent))) {
        await directory(parent);
        await rmdir(parent);
      }
    }
  }
  for (const name of await readdir(store.directory)) {
    if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name) || /^node-[A-Za-z0-9]{6}$/.test(name))
      throw Error('New native credential staging blocks completion');
    if (name.endsWith('.json') && Object.hasOwn(object(await store.read(name)), 'jwt'))
      throw Error('Remaining native token checkpoint blocks completion');
  }
  await store.write(markerName, { ...marker, status: 'retired' }, signal);
  return {
    status: 'bootstrap-credentials-retired' as const,
    evidenceSha256,
    inventorySha256: marker.inventorySha256,
    retiredArtifacts: marker.items.length,
  };
}

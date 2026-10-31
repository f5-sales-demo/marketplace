import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseNodeHealthJson } from '../../../platform/src/ce/node-health';
import { loadPlanArtifact, type SessionManagerLike } from './artifacts';
import { canonicalSha256 } from './canonical';
import { createAzureOperationalAcquisitionCollector } from './network-operational-provenance';
import { azureUpgradeBinding } from './terraform-upgrade';

type Arguments = Parameters<typeof createAzureOperationalAcquisitionCollector>;
const toolType = 'azure-ce-network-operational-issuer';
const suffix = `.${toolType}.log`;
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(value: unknown, reason: string): asserts value {
  if (!value) throw Error(`Azure operational issuer session: ${reason}`);
}

/** The actual collector publishes its original issuer into the owning native artifact session
 * before its private pointer or an acquisition acknowledgement. Reopening obtains the pin
 * from exhaustive native session/source reads, never from an acquisition reference or private
 * pointer. This provides local acquisition provenance, not operational acceptance or freshness.
 */
export async function createAzureOperationalAcquisitionSession(
  request: Arguments[0],
  runtime: Arguments[1],
  api: Arguments[2],
  store: Arguments[3],
  session: SessionManagerLike,
  forwarding?: Arguments[4],
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = session.getArtifactsDir(),
    sessionId = session.getSessionId(),
    privateDirectory = store.directory;
  require(typeof directory === 'string' && directory.startsWith('/'), 'persistent native session required');
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    same(owner, azureUpgradeBinding(plan).owner), 'owning network plan required');
  const callbacks = [
    session.getSessionId,
    session.getArtifactsDir,
    session.getArtifactPath,
    session.saveArtifact,
    store.verify,
    store.read,
  ];
  const seal = () => {
    signal?.throwIfAborted();
    require(same(request, plan) &&
      same(store.owner, owner) &&
      store.directory === privateDirectory &&
      session.getSessionId() === sessionId &&
      session.getArtifactsDir() === directory &&
      same(owner, azureUpgradeBinding(plan).owner) &&
      callbacks.every(
        (fn, i) =>
          fn ===
          [
            session.getSessionId,
            session.getArtifactsDir,
            session.getArtifactPath,
            session.saveArtifact,
            store.verify,
            store.read,
          ][i],
      ), 'owning session changed');
  };
  const identities = new Map<string, string>();
  let rootIdentity: string | undefined, retained: string | undefined;
  const bounded = async <T>(work: (active: AbortSignal) => Promise<T>, parent?: AbortSignal) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    const step = async <V>(task: () => Promise<V>) => {
      seal();
      active.throwIfAborted();
      const aborted = Promise.withResolvers<never>(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        const value = await Promise.race([Promise.resolve().then(task), aborted.promise]);
        seal();
        active.throwIfAborted();
        return value;
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    };
    return step(() => work(active));
  };
  const readPins = async (active: AbortSignal) => {
    active.throwIfAborted();
    seal();
    await store.verify();
    const root = await lstat(directory);
    require(root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 0o077) === 0 &&
      (await realpath(directory)) === directory, 'native session directory custody differs');
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    require(rootIdentity === undefined || rootIdentity === identity, 'native session directory replaced');
    rootIdentity = identity;
    const original = await loadPlanArtifact(session, plan.planId, plan.planSha256);
    require(same(original.plan, plan), 'owning public source differs');
    const names = (await readdir(directory)).filter((n) => n.endsWith(suffix)).sort();
    const observed: string[] = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join(directory, name),
        file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      let raw: string;
      try {
        const before = await file.stat();
        require(before.isFile() &&
          before.uid === process.getuid?.() &&
          before.nlink === 1 &&
          (before.mode & 0o077) === 0 &&
          before.size <= 131072, 'issuer artifact custody differs');
        raw = await file.readFile('utf8');
        const after = await file.stat(),
          named = await lstat(path);
        const fileIdentity = (v: typeof before) =>
          `${v.dev}:${v.ino}:${v.size}:${v.mtimeMs}:${v.ctimeMs}:${v.birthtimeMs}:${v.uid}:${v.nlink}:${v.mode}`;
        require(named.isFile() &&
          !named.isSymbolicLink() &&
          fileIdentity(before) === fileIdentity(after) &&
          fileIdentity(after) === fileIdentity(named), 'issuer artifact changed while read');
        const custody = canonicalSha256({ identity: fileIdentity(after), raw });
        require(!identities.has(path) || identities.get(path) === custody, 'original issuer artifact changed');
        identities.set(path, custody);
      } finally {
        await file.close();
      }
      // Reuse the strict object parser solely for grammar and duplicate-key rejection.
      const row = parseNodeHealthJson(raw);
      require(same(
        Object.keys(row).sort(),
        ['engine', 'issuerSha256', 'kind', 'owner', 'planId', 'planSha256', 'schemaVersion'].sort(),
      ) &&
        row.schemaVersion === 1 &&
        row.engine === 'terraform' &&
        row.kind === 'azure-network-operational-issuer-binding' &&
        sha(row.issuerSha256) &&
        sha(row.planSha256) &&
        typeof row.planId === 'string', 'issuer binding schema differs');
      if (!same(row.owner, owner)) continue;
      const source = await loadPlanArtifact(session, row.planId, row.planSha256);
      require(source.plan.engine === 'terraform' &&
        source.plan.intent.operation === 'update-network' &&
        same(azureUpgradeBinding(source.plan).owner, owner), 'issuer source ownership differs');
      observed.push(row.issuerSha256);
    }
    require(same(
      names,
      (await readdir(directory)).filter((n) => n.endsWith(suffix)).sort(),
    ), 'issuer namespace changed while read');
    const final = await lstat(directory);
    require(`${final.dev}:${final.ino}:${final.birthtimeMs}` === rootIdentity &&
      (await realpath(directory)) === directory, 'native session directory changed');
    active.throwIfAborted();
    seal();
    const pins = [...new Set(observed)];
    require(pins.length <= 1, 'conflicting original issuer pins');
    return pins[0];
  };
  retained = await bounded(readPins);
  let pointer: unknown;
  try {
    pointer = await store.read('azure-network-observer-issuer.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  require(pointer === undefined || retained !== undefined, 'original public issuer pin unavailable');
  const originalIssuerPublication = async (issuerSha256: string, active: AbortSignal) => {
    require(sha(issuerSha256) && (retained === undefined || retained === issuerSha256), 'original issuer changed');
    const before = await readPins(active);
    require(before === undefined || before === issuerSha256, 'published issuer changed');
    if (before === undefined) {
      const record = {
        schemaVersion: 1,
        kind: 'azure-network-operational-issuer-binding',
        engine: 'terraform',
        owner,
        planId: plan.planId,
        planSha256: plan.planSha256,
        issuerSha256,
      };
      const id = await session.saveArtifact(JSON.stringify(record), toolType);
      require(typeof id === 'string' && id.length > 0, 'original issuer publication not acknowledged');
      const path = await session.getArtifactPath(id);
      require(typeof path === 'string' &&
        dirname(path) === directory &&
        path.endsWith(suffix), 'original issuer publication path differs');
    }
    require((await readPins(active)) === issuerSha256, 'original issuer publication unavailable');
    retained = issuerSha256;
  };
  const collector = createAzureOperationalAcquisitionCollector(
    request,
    runtime,
    api,
    store,
    forwarding,
    retained,
    originalIssuerPublication,
  );
  const check = async (active: AbortSignal) => {
    require((await readPins(active)) === retained, 'original public issuer binding changed');
  };
  return Object.freeze({
    collect(...args: Parameters<typeof collector.collect>) {
      return bounded(async (active) => {
        await check(active);
        const result = await collector.collect(args[0], args[1], active, args[3]);
        await check(active);
        require(retained === result.issuerSha256, 'acquisition issuer was not published');
        return result;
      }, args[2]);
    },
    authenticate(...args: Parameters<typeof collector.authenticate>) {
      return bounded(async (active) => {
        require(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.authenticate(args[0], args[1], args[2], args[3], active);
        await check(active);
        return result;
      }, args[4]);
    },
    retireSigningMaterial(parent?: AbortSignal) {
      return bounded(async (active) => {
        require(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.retireSigningMaterial(active);
        await check(active);
        return result;
      }, parent);
    },
  });
}

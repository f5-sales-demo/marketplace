import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { parseNodeHealthJson } from '../../../platform/src/ce/node-health';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { guardAzureCeApplyObject } from './apply-request';
import { loadPlanArtifact, type SessionManagerLike, verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import { createAzureOperationalAcquisitionSession } from './network-operational-session';
import { azureTerraformNetworkScope } from './terraform-network-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Arguments = Parameters<typeof createAzureOperationalAcquisitionSession>;
type Acquisition = Awaited<ReturnType<typeof createAzureOperationalAcquisitionSession>>;
type Inventory = Awaited<ReturnType<Acquisition['authenticateRetirementInventory']>>;
export type AzureOperationalRetirementInventory = Omit<Inventory, 'issuerSha256'> & {
  issuerSha256: string | null;
  observerState: 'absent' | 'present';
};
export interface AzureOperationalRetirementSession {
  authenticateRetirementInventory(signal?: AbortSignal): Promise<AzureOperationalRetirementInventory>;
  retireSigningMaterial(signal?: AbortSignal): Promise<{
    status: 'retired' | 'absent';
    scope: 'operational-observer-signing-material';
    artifactInventory: AzureOperationalRetirementInventory;
  }>;
}
const same = canonicalEqual;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const suffix = '.azure-ce-network-operational-issuer.log';
const observerName = (name: string) =>
  ['azure-network-observer-', 'azure-network-issuer-', 'azure-network-observation-'].some((prefix) =>
    name.startsWith(prefix),
  );
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure operational retirement session: ${message}`);
}
const sessions = new WeakMap<
  object,
  {
    source: AzureCePlan;
    store: CeDeploymentStore;
    publicSession: SessionManagerLike;
    read(signal?: AbortSignal): Promise<AzureOperationalRetirementInventory>;
  }
>();

/** Open the real owning acquisition history for teardown. No observer, cloud/provider command,
 * new key or publication is executed. Unknown/down facts remain unknown operational acceptance.
 * Absence is independently inspected under the same signing lock; it is never inferred from a
 * missing pointer, a candidate digest, or an in-memory source. Public pins and proof are retained.
 */
export async function createAzureOperationalRetirementSession(
  request: AzureCePlan,
  transport: Arguments[1],
  cloud: Arguments[2],
  storage: CeDeploymentStore,
  publicSession: SessionManagerLike,
  signal?: AbortSignal,
): Promise<AzureOperationalRetirementSession> {
  const original = structuredClone(request),
    requestMatches = canonicalSnapshot(original),
    owner = structuredClone(storage.owner),
    directory = storage.directory;
  verifyAzureCePlan(original);
  require(original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(original).owner, owner), 'original Terraform deployment required');
  const publicDirectory = publicSession.getArtifactsDir(),
    sessionId = publicSession.getSessionId();
  require(typeof publicDirectory === 'string' &&
    publicDirectory.startsWith('/'), 'persistent original public session required');
  const callbacks = [
    publicSession.getSessionId,
    publicSession.getArtifactsDir,
    publicSession.getArtifactPath,
    publicSession.saveArtifact,
  ];
  const storeCallbacks = [storage.verify, storage.read, storage.write, storage.remove];
  const seal = () => {
    signal?.throwIfAborted();
    require(requestMatches(request) &&
      requestMatches(original) &&
      same(storage.owner, owner) &&
      storage.directory === directory &&
      transport.engine === 'terraform' &&
      publicSession.getSessionId() === sessionId &&
      publicSession.getArtifactsDir() === publicDirectory &&
      callbacks.every(
        (fn, i) =>
          fn ===
          [
            publicSession.getSessionId,
            publicSession.getArtifactsDir,
            publicSession.getArtifactPath,
            publicSession.saveArtifact,
          ][i],
      ) &&
      storeCallbacks.every(
        (fn, i) => fn === [storage.verify, storage.read, storage.write, storage.remove][i],
      ), 'owning deployment or callbacks changed');
  };
  const store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']);
  const api = guardAzureCeApplyObject(cloud, seal);
  let privateIdentity: string | undefined, publicIdentity: string | undefined;
  const fileIdentities = new Map<string, string>();
  const bounded = async <T>(work: (active: AbortSignal) => Promise<T>, parent?: AbortSignal) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    seal();
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([work(active), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const inspect = async (active: AbortSignal) => {
    seal();
    active.throwIfAborted();
    await store.verify();
    const root = await lstat(directory),
      native = await lstat(publicDirectory);
    require(root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 0o077) === 0 &&
      (await realpath(directory)) === directory, 'private directory custody differs');
    require(native.isDirectory() &&
      !native.isSymbolicLink() &&
      native.uid === process.getuid?.() &&
      (native.mode & 0o022) === 0 &&
      (await realpath(publicDirectory)) === publicDirectory, 'public directory custody differs');
    const identity = (value: typeof root) => `${value.dev}:${value.ino}:${value.birthtimeMs}`;
    require((privateIdentity === undefined || privateIdentity === identity(root)) &&
      (publicIdentity === undefined || publicIdentity === identity(native)), 'owning directory replaced');
    privateIdentity = identity(root);
    publicIdentity = identity(native);
    const source = await loadPlanArtifact(publicSession, original.planId, original.planSha256);
    require(same(source.plan, original), 'original public deployment differs');
    const names = (await readdir(publicDirectory)).filter((name) => name.endsWith(suffix)).sort();
    const bindings: Array<{ issuerSha256: string; source: AzureCePlan }> = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join(publicDirectory, name),
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let raw: string;
      try {
        const before = await handle.stat();
        require(before.isFile() &&
          before.uid === process.getuid?.() &&
          before.nlink === 1 &&
          (before.mode & 0o022) === 0 &&
          before.size <= 131072, 'public issuer file custody differs');
        raw = await handle.readFile('utf8');
        const after = await handle.stat(),
          named = await lstat(path);
        const stamp = (value: typeof before) =>
          `${value.dev}:${value.ino}:${value.birthtimeMs}:${value.size}:${value.mtimeMs}:${value.ctimeMs}:${value.uid}:${value.mode}:${value.nlink}`;
        require(named.isFile() &&
          !named.isSymbolicLink() &&
          stamp(before) === stamp(after) &&
          stamp(after) === stamp(named), 'public issuer file changed');
        const retained = canonicalSha256({ stamp: stamp(named), raw });
        require(!fileIdentities.has(path) || fileIdentities.get(path) === retained, 'original public issuer replaced');
        fileIdentities.set(path, retained);
      } finally {
        await handle.close();
      }
      const row = parseNodeHealthJson(raw);
      require(same(
        Object.keys(row).sort(),
        ['schemaVersion', 'kind', 'engine', 'owner', 'planId', 'planSha256', 'issuerSha256'].sort(),
      ) &&
        row.schemaVersion === 1 &&
        row.kind === 'azure-network-operational-issuer-binding' &&
        row.engine === 'terraform' &&
        typeof row.planId === 'string' &&
        digest(row.planSha256) &&
        digest(row.issuerSha256), 'original public issuer schema differs');
      if (!same(row.owner, owner)) continue;
      const candidate = (await loadPlanArtifact(publicSession, row.planId, row.planSha256)).plan;
      require(candidate.engine === 'terraform' &&
        candidate.intent.operation === 'update-network' &&
        same(azureUpgradeBinding(candidate), azureUpgradeBinding(original)) &&
        same(azureTerraformNetworkScope(candidate, true), azureTerraformNetworkScope(original, true)) &&
        (!candidate.terraformNetworkProfile ||
          candidate.terraformNetworkProfile.originalPlanSha256 ===
            original.planSha256), 'original issuer network source differs from deployment');
      bindings.push({ issuerSha256: row.issuerSha256, source: candidate });
    }
    require(same(
      names,
      (await readdir(publicDirectory)).filter((name) => name.endsWith(suffix)).sort(),
    ), 'public issuer namespace changed');
    const pins = [...new Set(bindings.map((row) => row.issuerSha256))];
    require(pins.length <= 1, 'conflicting original public issuers');
    const privateNames = (await readdir(directory)).filter(observerName).sort();
    require(bindings.length > 0 || privateNames.length === 0, 'observer artifacts have no original public issuer');
    const finalPrivate = await lstat(directory),
      finalPublic = await lstat(publicDirectory);
    require(identity(finalPrivate) === privateIdentity &&
      identity(finalPublic) === publicIdentity &&
      (finalPrivate.mode & 0o077) === 0 &&
      (finalPublic.mode & 0o022) === 0, 'directory custody changed during source inspection');
    active.throwIfAborted();
    seal();
    return { bindings, privateNames };
  };
  const opening = await bounded(inspect);
  const acquisition = opening.bindings.length
    ? await createAzureOperationalAcquisitionSession(
        opening.bindings[0].source,
        runtime,
        api,
        store,
        publicSession,
        undefined,
        signal,
      )
    : undefined;
  const sameBindings = (value: Awaited<ReturnType<typeof inspect>>) =>
    same(
      value.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
      opening.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
    );
  const absent = async (active: AbortSignal): Promise<AzureOperationalRetirementInventory> => {
    const claim = acquireProcessLock(join(directory, '.azure-operational-acquisition-lock'));
    let release: () => Promise<void>;
    try {
      const aborted = Promise.withResolvers<never>(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        release = await Promise.race([claim, aborted.promise]);
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    } catch (error) {
      await claim.then(
        (unlock) => unlock(),
        () => {},
      );
      throw error;
    }
    try {
      const first = await inspect(active),
        last = await inspect(active);
      require(sameBindings(first) &&
        sameBindings(last) &&
        !first.privateNames.length &&
        !last.privateNames.length, 'observer absence changed');
      return {
        status: 'authenticated',
        scope: 'owning-observer-artifact-disposition',
        owner: structuredClone(owner),
        issuerSha256: null,
        observerState: 'absent',
        artifacts: [],
        signingMaterialPresent: false,
        operationalAcceptance: 'unknown',
        canSatisfyInterfaceMutationGate: false,
      };
    } finally {
      await release();
    }
  };
  const read = (parent?: AbortSignal) =>
    bounded(async (active): Promise<AzureOperationalRetirementInventory> => {
      if (!acquisition) return absent(active);
      require(sameBindings(await inspect(active)), 'original source binding changed');
      const inventory = await acquisition.authenticateRetirementInventory(active);
      require(sameBindings(await inspect(active)), 'original source binding changed');
      return { ...inventory, observerState: 'present' };
    }, parent);
  const facade: AzureOperationalRetirementSession = Object.freeze({
    authenticateRetirementInventory: read,
    retireSigningMaterial(parent?: AbortSignal) {
      return bounded(async (active) => {
        if (!acquisition)
          return {
            status: 'absent' as const,
            scope: 'operational-observer-signing-material' as const,
            artifactInventory: await absent(active),
          };
        require(sameBindings(await inspect(active)), 'original source binding changed');
        const retired = await acquisition.retireSigningMaterial(active);
        require(sameBindings(await inspect(active)), 'original source binding changed');
        return {
          status: retired.status,
          scope: retired.scope,
          artifactInventory: { ...retired.artifactInventory, observerState: 'present' as const },
        };
      }, parent);
    },
  });
  sessions.set(facade, { source: original, store: storage, publicSession, read });
  return facade;
}

/** Internal non-forgeable session enrollment. Read-only store proxies may retain the same
 * owner/directory; observation always executes against the originally bound real store.
 */
export async function readAuthenticatedAzureOperationalRetirementInventory(
  candidate: unknown,
  original: AzureCePlan,
  store: Pick<CeDeploymentStore, 'owner' | 'directory'>,
  publicSession: SessionManagerLike,
  signal?: AbortSignal,
) {
  const bound = candidate && typeof candidate === 'object' ? sessions.get(candidate) : undefined;
  require(bound &&
    same(bound.source, original) &&
    bound.publicSession === publicSession &&
    bound.store.directory === store.directory &&
    same(bound.store.owner, store.owner), 'genuine owning retirement session required');
  return bound.read(signal);
}

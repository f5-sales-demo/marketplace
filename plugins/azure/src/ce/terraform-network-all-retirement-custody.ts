import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open as openFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { SessionManagerLike } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkAllOriginalCustody } from './terraform-network-retirement-lineage';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform all-network custody preparation: ${message}`);
}
/** Caller holds the owning lifecycle lock. Publish one immutable exact all-generation snapshot.
 * Unstaged/replacement requests and incomplete journals remain explicit evidence states.
 * This preparation never authorizes parent destruction or claims operational acceptance.
 */
export async function prepareAzureTerraformNetworkAllRetirementCustody(
  originalRequest: AzureCePlan,
  publicSession: SessionManagerLike,
  store: CeDeploymentStore,
  terraform: CeTerraformService,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  const original = structuredClone(originalRequest),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    { target: publicSession, key: 'getSessionId', value: publicSession.getSessionId },
    { target: publicSession, key: 'getArtifactsDir', value: publicSession.getArtifactsDir },
    { target: publicSession, key: 'getArtifactPath', value: publicSession.getArtifactPath },
    { target: publicSession, key: 'saveArtifact', value: publicSession.saveArtifact },
  ];
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    active.throwIfAborted();
    require(same(originalRequest, original) &&
      same(siteRequest, site) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'request or owning dependencies changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const namespace = () =>
    step(async () => {
      const stat = await lstat(directory);
      require(stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0 &&
        (await realpath(directory)) === directory, 'private directory ownership differs');
      return { identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, names: (await readdir(directory)).sort() };
    });
  seal();
  await step(() => store.verify());
  const before = await namespace();
  const collect = () =>
    step(() =>
      readAzureTerraformNetworkAllOriginalCustody(
        original,
        publicSession,
        store,
        terraform,
        loaders,
        site,
        verifier,
        active,
        replacementVerifier,
      ),
    );
  const history = await collect();
  require(same(await namespace(), before), 'namespace changed before immutable preparation');
  const preparation = {
    schemaVersion: 1 as const,
    scope: 'all-network-original-main-and-power-journal-preparation' as const,
    owner,
    originalPlanSha256: original.planSha256,
    site,
    history,
    historySha256: canonicalSha256(history),
  };
  const preparationSha256 = canonicalSha256(preparation),
    name = `azure-network-all-custody-${preparationSha256.slice(0, 24)}.json`;
  const rawSha256 = createHash('sha256').update(JSON.stringify(preparation)).digest('hex');
  const optional = () =>
    step(async () => {
      try {
        return await store.read(name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    });
  const nativePublication = () =>
    step(async () => {
      const handle = await openFile(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = await handle.stat();
        require(before.isFile() &&
          before.uid === process.getuid?.() &&
          before.nlink === 1 &&
          (before.mode & 0o077) === 0, 'immutable publication ownership differs');
        const bytes = await handle.readFile(),
          after = await handle.stat(),
          named = await lstat(join(directory, name));
        require(after.dev === before.dev &&
          after.ino === before.ino &&
          after.size === before.size &&
          after.mtimeMs === before.mtimeMs &&
          after.ctimeMs === before.ctimeMs &&
          named.isFile() &&
          !named.isSymbolicLink() &&
          named.dev === before.dev &&
          named.ino === before.ino &&
          named.uid === before.uid &&
          named.nlink === 1 &&
          (named.mode & 0o077) === 0, 'immutable publication changed during native read');
        require(createHash('sha256').update(bytes).digest('hex') === rawSha256, 'immutable publication bytes differ');
      } finally {
        await handle.close();
      }
    });
  const previous = await optional();
  require(before.names.includes(name) ===
    (previous !== undefined), 'publication presence differs from native namespace');
  require(previous === undefined || same(previous, preparation), 'immutable preparation differs');
  if (previous !== undefined) await nativePublication();
  require(same(await optional(), previous) && same(await namespace(), before), 'publication changed before write');
  if (previous === undefined) await step(() => store.write(name, preparation));
  const expected = { identity: before.identity, names: [...new Set([...before.names, name])].sort() };
  require(same(await namespace(), expected) &&
    same(await optional(), preparation), 'foreign publication or persisted payload differs');
  await nativePublication();
  const refreshed = await collect();
  require(same(refreshed, history), 'actual all-generation journal custody changed across publication');
  require(same(await namespace(), expected) &&
    same(await optional(), preparation), 'immutable custody changed at final namespace boundary');
  await nativePublication();
  await step(() => store.verify());
  seal();
  return {
    schemaVersion: 1 as const,
    scope: preparation.scope,
    status: 'prepared' as const,
    name,
    preparationSha256,
    publicationBytesSha256: rawSha256,
    originalPlanSha256: original.planSha256,
    lineageSha256: history.lineageSha256,
    stagedNetworkPlanSha256s: history.rows.map((row) => row.planSha256),
    unqualifiedPublicRequestRows: history.allPublicRequestCustodyQualified
      ? []
      : history.lineage.rows.filter((row) => row.execution !== 'staged-network'),
    allStagedMainPublishedJournalsQualified:
      history.rows.length > 0 &&
      history.rows.every(
        (row) => row.main.originalPublishedJournalsQualified && row.main.terminalPublishedJournalsQualified,
      ),
    stagedPowerRows: history.rows.flatMap((row) =>
      row.power.rows.map((power) => ({
        planSha256: row.planSha256,
        node: power.node,
        operation: power.operation,
        status: power.status,
      })),
    ),
    allPublicRequestCustodyQualified: history.allPublicRequestCustodyQualified,
    childRetirementQualified: false as const,
    runnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
}

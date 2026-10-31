import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import type { readAzureTerraformNetworkParentInventory } from './terraform-network-parent-inventory';
import { recheckAzureTerraformNetworkRetiredMainNativeCustody } from './terraform-network-retired-main-custody';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import type { AzureCePlan } from './types';

const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');
const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
const safe = (v: string) =>
  v !== '' && v.split('/').every((part) => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..');
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure post-plaintext parent custody: ${message}`);
}
type Inventory = Awaited<ReturnType<typeof readAzureTerraformNetworkParentInventory>>;
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkEmptyMainBindingContext;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();

/** Fresh read-only custody of the exhaustive native-bound parent after main retirement
 * and plaintext projection. A genuine post-plaintext owning witness is mandatory. Frozen
 * decisions remain evidence; this reader grants no permission to delete or retire tokens.
 */
export async function qualifyAzureTerraformNetworkPostPlaintextParentCustody(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  nativeWitness: unknown,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    terminal = structuredClone(context.terminalCleanup),
    teardown = structuredClone(context.destroyTeardown),
    site = structuredClone(context.site),
    nativeDigest = canonicalSha256(nativeWitness);
  const read = store.read,
    verify = store.verify;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const guard = () => {
    deadline.throwIfAborted();
    require(store.directory === root && store.read === read && store.verify === verify, 'owning store changed');
  };
  const terminalSha256 = canonicalSha256({ value: terminal });
  const seal = () => {
    guard();
    require(same(request, original) &&
      same(store.owner, owner) &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, terminalSha256) &&
      same(context.destroyTeardown, teardown) &&
      same(context.site, site) &&
      canonicalSha256(nativeWitness) === nativeDigest, 'owning context changed');
  };
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    guard();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      guard();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const native = async (parent?: AbortSignal) => {
    seal();
    await step(
      () =>
        recheckAzureTerraformNetworkRetiredMainNativeCustody(
          nativeWitness,
          request,
          store,
          context,
          false,
          parent ? AbortSignal.any([deadline, parent]) : deadline,
        ),
      parent,
    );
    seal();
  };
  // Authenticate WeakMap-bound provenance before consulting the serialized inventory.
  await native();
  const proof = nativeWitness as {
    scope?: unknown;
    originalPlanSha256?: unknown;
    teardownPlanSha256?: unknown;
    mainRunnerRetirementQualified?: unknown;
    parentRetirementQualified?: unknown;
  };
  require(proof.scope === 'post-plaintext-retired-main-authenticated-network-stage-custody' &&
    proof.originalPlanSha256 === request.planSha256 &&
    proof.teardownPlanSha256 === context.destroyTeardown.planSha256 &&
    proof.mainRunnerRetirementQualified === true &&
    proof.parentRetirementQualified === false, 'post-plaintext owning scope required');
  const checkpoint = terminal as unknown as {
    retainedNetworkParentInventory?: Inventory;
    retirementEvidence?: { networkParentInventory?: unknown };
    retainedDestroyConfiguration?: unknown;
    retainedDestroyConfigurationSha256?: unknown;
  };
  const frozen = structuredClone(checkpoint.retainedNetworkParentInventory);
  require(frozen &&
    frozen.schemaVersion === 1 &&
    frozen.scope === 'native-bound-network-parent-inventory' &&
    frozen.completeParentDispositionQualified === true &&
    frozen.parentRetirementQualified === false &&
    same(frozen, checkpoint.retirementEvidence?.networkParentInventory) &&
    same(frozen.owner, owner) &&
    frozen.originalPlanSha256 === request.planSha256 &&
    frozen.teardownPlanSha256 === context.destroyTeardown.planSha256 &&
    frozen.mainDirectory === request.deploymentName &&
    safe(frozen.mainDirectory) &&
    !Object.hasOwn(checkpoint, 'retainedDestroyConfiguration') &&
    checkpoint.retainedDestroyConfigurationSha256 ===
      frozen.retainedDestroyConfigurationSha256, 'authenticated frozen parent differs');
  const expectedFiles = [...frozen.files, frozen.terminalFile];
  const files = new Map(expectedFiles.map((row) => [row.path, row]));
  const directories = new Map(frozen.directories.map((row) => [row.path, row]));
  const decisions = new Map(frozen.parentArtifactDecisions.map((row) => [row.path, row]));
  const directoryDecisions = new Map(frozen.parentDirectoryDecisions.map((row) => [row.path, row]));
  require(files.size === expectedFiles.length &&
    directories.size === frozen.directories.length &&
    decisions.size === files.size &&
    decisions.size === frozen.parentArtifactDecisions.length &&
    directoryDecisions.size === directories.size &&
    directoryDecisions.size === frozen.parentDirectoryDecisions.length &&
    same([...files.keys()].sort(), [...decisions.keys()].sort()) &&
    same(
      [...directories.keys()].sort(),
      [...directoryDecisions.keys()].sort(),
    ), 'exhaustive decisions missing or duplicate');
  for (const [path, file] of files) {
    const decision = decisions.get(path);
    require(safe(path) &&
      decision &&
      decision.identity === file.identity &&
      decision.sha256 === file.sha256 &&
      decision.packetSha256 === file.packetSha256 &&
      ['preserve', 'delete', 'owning-transition'].includes(decision.action) &&
      (decision.action !== 'owning-transition' ||
        path === 'azure-terraform-terminal-cleanup.json'), 'file decision native join differs');
  }
  for (const [path, dir] of directories) {
    const decision = directoryDecisions.get(path);
    require((path === '' || safe(path)) &&
      decision &&
      decision.identity === dir.identity &&
      same(decision.names, dir.names) &&
      decision.action ===
        (path === frozen.mainDirectory ? 'owning-transition' : 'preserve'), 'directory decision native join differs');
  }
  const snapshot = async (parent?: AbortSignal) => {
    seal();
    const actualFiles: Array<{ path: string; identity: string; sha256: string; packetSha256: string }> = [],
      actualDirectories: Array<{ path: string; identity: string; names: string[] }> = [];
    const walk = async (path: string) => {
      const full = path ? join(root, path) : root;
      const first = await step(() => lstat(full), parent);
      require(first.isDirectory() &&
        !first.isSymbolicLink() &&
        first.uid === process.getuid?.() &&
        (first.mode & 0o077) === 0 &&
        (await step(() => realpath(full), parent)) === full, 'private directory ownership differs');
      const allNames = (await step(() => readdir(full), parent)).sort();
      require(path !== '' ||
        !allNames.includes('azure-terraform-parent-artifact-retirement.json'), 'parent retirement already begun');
      const names = allNames.filter((name) => path !== '' || name !== '.azure-terraform-lifecycle-lock');
      const expected = directories.get(path);
      require(expected &&
        expected.identity === `${first.dev}:${first.ino}:${first.birthtimeMs}` &&
        same(
          names,
          path === frozen.mainDirectory ? ['artifact-retirement.json', 'deployment.json'] : expected.names,
        ), 'parent directory namespace differs');
      actualDirectories.push({ path, identity: expected.identity, names });
      for (const name of names) {
        const selected = path ? `${path}/${name}` : name;
        require(safe(selected), 'foreign path');
        const stat = await step(() => lstat(join(root, selected)), parent);
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          await walk(selected);
          continue;
        }
        require(stat.isFile() && !stat.isSymbolicLink(), 'foreign parent entry');
        const file = await step(
          () =>
            readAzureTerraformParentPrivateFile(
              join(root, selected),
              parent ? AbortSignal.any([deadline, parent]) : deadline,
            ),
          parent,
        );
        const fragment = selected.startsWith('terraform-original-deployment-publication-fragments/');
        const parsed = fragment ? undefined : JSON.parse(file.bytes.toString());
        const current = {
          path: selected,
          identity: file.identity,
          sha256: hash(file.bytes),
          packetSha256: fragment ? hash(file.bytes) : canonicalSha256(parsed),
        };
        const prior = files.get(selected);
        if (selected === 'azure-terraform-terminal-cleanup.json')
          require(same(parsed, terminal), 'projected terminal differs');
        else if (selected.startsWith(`${frozen.mainDirectory}/`))
          require(['artifact-retirement.json', 'deployment.json'].includes(name), 'foreign native main file');
        else require(prior && same(current, prior), 'frozen parent file bytes or identity differ');
        actualFiles.push(current);
      }
      const after = await step(() => lstat(full), parent),
        finalNames = (await step(() => readdir(full), parent)).sort();
      require(after.isDirectory() &&
        !after.isSymbolicLink() &&
        first.dev === after.dev &&
        first.ino === after.ino &&
        first.birthtimeMs === after.birthtimeMs &&
        after.uid === first.uid &&
        (after.mode & 0o077) === 0 &&
        same(allNames, finalNames), 'parent directory changed during snapshot');
    };
    await walk('');
    const expectedPaths = [
      ...files.keys(),
      `${frozen.mainDirectory}/artifact-retirement.json`,
      `${frozen.mainDirectory}/deployment.json`,
    ].sort();
    require(same(actualFiles.map((row) => row.path).sort(), expectedPaths) &&
      same(
        actualDirectories.map((row) => row.path).sort(),
        [...directories.keys()].sort(),
      ), 'partial parent discovery');
    seal();
    return {
      files: actualFiles.sort((a, b) => a.path.localeCompare(b.path)),
      directories: actualDirectories.sort((a, b) => a.path.localeCompare(b.path)),
    };
  };
  await step(() => verify.call(store));
  seal();
  await native();
  const first = await snapshot();
  await native();
  require(same(await snapshot(), first), 'parent custody changed across native recheck');
  const result = {
    schemaVersion: 1 as const,
    scope: 'post-plaintext-native-bound-exhaustive-parent-custody' as const,
    owner,
    originalPlanSha256: request.planSha256,
    teardownPlanSha256: context.destroyTeardown.planSha256,
    nativeWitnessSha256: nativeDigest,
    frozenParentInventorySha256: canonicalSha256(frozen),
    ...first,
    parentArtifactDecisions: frozen.parentArtifactDecisions,
    parentDirectoryDecisions: frozen.parentDirectoryDecisions,
    completeParentDispositionQualified: true as const,
    sensitiveDeletionExecutionQualified: false as const,
    parentRetirementQualified: false as const,
    installedQualified: false as const,
    liveQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parent) {
      seal();
      require(canonicalSha256(result) === digest, 'parent witness changed');
      await native(parent);
      require(same(await snapshot(parent), first), 'parent custody changed');
      await native(parent);
      require(same(await snapshot(parent), first), 'parent custody changed after recheck');
    },
  });
  return result;
}
export async function recheckAzureTerraformNetworkPostPlaintextParentCustody(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning post-plaintext parent witness required');
  await bound.recheck(signal);
}

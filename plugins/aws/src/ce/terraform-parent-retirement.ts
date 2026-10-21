import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

const markerName = 'aws-terraform-parent-artifact-retirement.json';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed parent retirement evidence');
  return value as Record<string, unknown>;
};
interface Teardown {
  kind: string;
  sourcePlanSha256: string;
  planSha256: string;
  planId: string;
}
interface Item {
  path: string;
  sha256: string;
  preserve: boolean;
}
async function directory(path: string) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(path)) !== path
  )
    throw Error('Parent retirement directory ownership differs');
}
async function file(path: string) {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    throw Error('Parent retirement file ownership differs');
  return readFile(path);
}
async function inventory(
  base: AwsCePlan,
  teardown: Teardown,
  evidenceSha256: string,
  store: CeDeploymentStore,
): Promise<Item[]> {
  await directory(store.directory);
  const items: Item[] = [];
  const add = async (path: string, preserve: boolean) =>
    items.push({ path, preserve, sha256: hash(await file(join(store.directory, path))) });
  const runner = async (prefix: string) => {
    const stage = prefix === base.deploymentName ? undefined : 'f5-resources';
    const path = join(store.directory, prefix);
    await directory(path);
    const names = (await readdir(path)).sort();
    if (JSON.stringify(names) !== JSON.stringify(['artifact-retirement.json', 'deployment.json']))
      throw Error('Runner has unretired artifacts');
    const encoded = await file(join(path, 'deployment.json')),
      manifest = object(JSON.parse(encoded.toString())),
      scope = object(manifest.scope);
    const marker = object(JSON.parse((await file(join(path, 'artifact-retirement.json'))).toString()));
    if (
      manifest.schemaVersion !== 1 ||
      manifest.engine !== 'terraform' ||
      manifest.deploymentId !== base.deploymentName ||
      manifest.stage !== stage ||
      manifest.backendIdentity !== `local:${base.deploymentName}${stage ? `:stage:${stage}` : ''}` ||
      scope.cloud !== 'aws' ||
      scope.account !== base.accountId ||
      scope.region !== base.region ||
      marker.schemaVersion !== 1 ||
      marker.status !== 'runner-artifacts-retired' ||
      marker.manifestSha256 !== canonicalSha256(manifest) ||
      marker.evidenceSha256 !== evidenceSha256 ||
      !sha(marker.finalPlanSha256) ||
      !sha(marker.planReceiptSha256) ||
      !Array.isArray(marker.artifacts) ||
      marker.inventorySha256 !== hash(JSON.stringify(marker.artifacts))
    )
      throw Error('Runner retirement provenance differs');
    for (const name of names) await add(`${prefix}/${name}`, true);
  };
  const preserve = new Set([
    'owner.json',
    'aws-terraform-lifecycle-retirement.json',
    'terraform-brownfield-placement.json',
    'terraform-authorization.json',
    'terraform-f5-resources.json',
    'terraform-f5-stage-retirement.json',
    'terraform-cloud-teardown-inventory.json',
    'aws-terraform-teardown-cloud-absence.json',
    'aws-terraform-terminal-cleanup.json',
    `${teardown.planId}.json`,
    `${teardown.planId}-authorization.json`,
  ]);
  const drainJournals = new Set([
    'platform-drain-source.json',
    'platform-drain-progress.json',
    'platform-drain-receipt.json',
  ]);
  let rootRunner = false;
  for (const name of (await readdir(store.directory)).sort()) {
    if (name === markerName || name === '.aws-terraform-lifecycle-lock') continue;
    if (name === base.deploymentName) {
      await runner(name);
      rootRunner = true;
      continue;
    }
    if (name === 'terraform-stages') {
      await directory(join(store.directory, name));
      for (const stage of (await readdir(join(store.directory, name))).sort()) {
        if (stage !== 'f5-resources') throw Error('Unqualified Terraform stage blocks parent retirement');
        const stagePath = join(store.directory, name, stage);
        await directory(stagePath);
        if (JSON.stringify(await readdir(stagePath)) !== JSON.stringify([base.deploymentName]))
          throw Error('Stage deployment inventory differs');
        await runner(`${name}/${stage}/${base.deploymentName}`);
      }
      continue;
    }
    if (
      !preserve.has(name) &&
      !drainJournals.has(name) &&
      !/^(?:terraform-|aws-terraform-|ingress-plan-|ingress-checkpoint-|ingress-origin-checkpoint-)[a-zA-Z0-9._-]+\.json$/.test(
        name,
      )
    ) {
      const value = object(JSON.parse((await file(join(store.directory, name))).toString()));
      const binding = siteBindings(base).find(
        ({ binding }) => value.siteName === binding.siteName && binding.nodes.includes(String(value.node)),
      );
      const site = siteBindings(base).find(({ binding }) => name === `site-binding-${binding.siteName}.json`);
      if (
        !(
          (binding && value.tokenName === name.slice(0, -5) && typeof value.jwt === 'string') ||
          (site && value.schemaVersion === 1 && canonicalSha256(value.binding) === canonicalSha256(site.binding))
        )
      )
        throw Error('Unqualified parent artifact blocks retirement');
    }
    await add(name, preserve.has(name));
  }
  if (!rootRunner) throw Error('Owning Terraform runner retirement is missing');
  return items.sort((a, b) => a.path.localeCompare(b.path));
}
/** Internal terminal parent cleanup. Caller binds separately qualified external absence and every runner retirement. */
export async function retireAwsTerraformParentArtifacts(
  base: AwsCePlan,
  teardown: Teardown,
  evidenceSha256: string,
  store: CeDeploymentStore,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  teardown = structuredClone(teardown);
  signal?.throwIfAborted();
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !sha(teardown.planSha256) ||
    !sha(evidenceSha256) ||
    !/^[a-z][a-z0-9-]{0,100}$/.test(teardown.planId) ||
    canonicalSha256(store.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner)
  )
    throw Error('Parent retirement owner or teardown binding differs');
  await store.verify();
  const lifecycle = object(await store.read('aws-terraform-lifecycle-retirement.json'));
  const authorization = object(await store.read(`${teardown.planId}-authorization.json`));
  if (
    lifecycle.sourcePlanSha256 !== base.planSha256 ||
    lifecycle.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.kind !== teardown.kind ||
    canonicalSha256(lifecycle.owner) !== canonicalSha256(store.owner) ||
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.sourcePlanSha256 !== base.planSha256 ||
    authorization.teardownPlanSha256 !== teardown.planSha256 ||
    authorization.mutations !== true ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
  )
    throw Error('Parent retirement authorization differs');
  let saved: unknown;
  try {
    saved = await store.read(markerName);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (saved === undefined) {
    const artifacts = await inventory(base, teardown, evidenceSha256, store);
    saved = {
      schemaVersion: 1,
      status: 'retiring',
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      evidenceSha256,
      artifacts,
      inventorySha256: canonicalSha256(artifacts),
    };
    signal?.throwIfAborted();
    await store.write(markerName, saved);
  }
  const marker = object(saved);
  if (
    marker.schemaVersion !== 1 ||
    !['retiring', 'deployment-artifacts-retired'].includes(String(marker.status)) ||
    canonicalSha256(marker.owner) !== canonicalSha256(store.owner) ||
    marker.sourcePlanSha256 !== base.planSha256 ||
    marker.teardownPlanSha256 !== teardown.planSha256 ||
    marker.evidenceSha256 !== evidenceSha256 ||
    !Array.isArray(marker.artifacts) ||
    marker.inventorySha256 !== canonicalSha256(marker.artifacts)
  )
    throw Error('Parent retirement checkpoint differs');
  const expected = new Map<string, Item>();
  for (const value of marker.artifacts) {
    const item = object(value);
    if (
      typeof item.path !== 'string' ||
      item.path.split('/').some((p) => !p || p === '.' || p === '..') ||
      !sha(item.sha256) ||
      typeof item.preserve !== 'boolean' ||
      expected.has(item.path)
    )
      throw Error('Parent retirement inventory malformed');
    expected.set(item.path, item as unknown as Item);
  }
  const current = await inventory(base, teardown, evidenceSha256, store);
  if (
    current.some((item) => canonicalSha256(item) !== canonicalSha256(expected.get(item.path))) ||
    [...expected.values()].some((item) => item.preserve && !current.some((row) => row.path === item.path)) ||
    (marker.status === 'deployment-artifacts-retired' && current.some((item) => !item.preserve))
  )
    throw Error('Parent retirement inventory changed');
  for (const item of current.filter((item) => !item.preserve)) {
    signal?.throwIfAborted();
    await directory(store.directory);
    await store.verify();
    if (hash(await file(join(store.directory, item.path))) !== item.sha256)
      throw Error('Parent retirement artifact changed before removal');
    signal?.throwIfAborted();
    await unlink(join(store.directory, item.path));
  }
  signal?.throwIfAborted();
  await store.write(markerName, { ...marker, status: 'deployment-artifacts-retired' });
  return {
    status: 'deployment-artifacts-retired' as const,
    owner: store.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    evidenceSha256,
    inventorySha256: marker.inventorySha256,
    retiredArtifacts: [...expected.values()].filter((item) => !item.preserve).length,
  };
}

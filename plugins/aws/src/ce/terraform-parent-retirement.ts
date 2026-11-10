import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type BootstrapCheckoutBinding, retireBootstrapToken } from '../../../platform/src/ce/token-store';
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
  recorded?: Map<string, Item>,
): Promise<Item[]> {
  await directory(store.directory);
  const items: Item[] = [];
  const add = async (path: string, preserve: boolean) =>
    items.push({ path, preserve, sha256: hash(await file(join(store.directory, path))) });
  const runner = async (prefix: string, stage?: string, upgrade?: Record<string, unknown>) => {
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
    if (upgrade) {
      const deployment = object(upgrade.deployment),
        retirement = object(await store.read(`${String(upgrade.planId)}-stage-retirement.json`)),
        final = object(retirement.receipt);
      if (
        retirement.schemaVersion !== 1 ||
        retirement.status !== 'retired' ||
        canonicalSha256(retirement.owner) !== canonicalSha256(store.owner) ||
        retirement.sourcePlanSha256 !== base.planSha256 ||
        retirement.upgradePlanSha256 !== upgrade.planSha256 ||
        retirement.deploymentSha256 !== canonicalSha256(deployment) ||
        retirement.evidenceSha256 !== evidenceSha256 ||
        retirement.receiptSha256 !== canonicalSha256(final) ||
        manifest.configurationSha256 !== hash(String(deployment.configuration)) ||
        manifest.providerLockSha256 !== hash(String(deployment.providerLock)) ||
        marker.finalPlanSha256 !== final.planSha256 ||
        marker.planReceiptSha256 !== canonicalSha256(final) ||
        final.noChanges !== true ||
        final.backendIdentity !== manifest.backendIdentity
      )
        throw Error('Upgrade runner retirement provenance differs');
    }
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
  const upgrades = new Map<string, Record<string, unknown>>();
  const upgradeJournals = new Set<string>();
  for (const name of (await readdir(store.directory)).filter((name) =>
    /^aws-ce-upgrade-[a-f0-9]{24}\.json$/.test(name),
  )) {
    const source = object(await store.read(name)),
      deployment = object(source.deployment);
    if (
      source.schemaVersion !== 2 ||
      source.engine !== 'terraform' ||
      source.kind !== 'aws-ce-terraform-upgrade' ||
      source.sourcePlanSha256 !== base.planSha256 ||
      name !== `${String(source.planId)}.json` ||
      !sha(source.planSha256) ||
      typeof deployment.stage !== 'string' ||
      !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(deployment.stage) ||
      upgrades.has(deployment.stage)
    )
      throw Error('Upgrade parent source identity differs');
    const { planId: _id, planSha256: _sha, ...draft } = source;
    if (canonicalSha256(draft) !== source.planSha256) throw Error('Upgrade parent source digest differs');
    upgrades.set(deployment.stage, source);
    for (const suffix of ['', '-authorization', '-checkpoint', '-action-plan', '-receipt', '-stage-retirement'])
      upgradeJournals.add(`${String(source.planId)}${suffix}.json`);
  }
  const replacementJournals = new Set<string>();
  if (recorded) {
    for (const item of recorded.values())
      if (
        !item.preserve &&
        /^aws-ce-replace-[a-f0-9]{24}(?:-mtu|-terraform-(?:source|quiesce-plan|launch-plan|launch|refresh|final-refresh))?\.json$/.test(
          item.path,
        )
      )
        replacementJournals.add(item.path);
  }
  for (const { binding } of siteBindings(base)) {
    const frozenName = `terraform-initial-replacement-${binding.siteName}.json`;
    if (!(await readdir(store.directory)).includes(frozenName)) continue;
    // The initial inventory qualifies every replacement source before recording any removal.
    // On resume its exact hashes admit surviving journals after source/checkpoint removal.
    if (recorded?.has(frozenName)) continue;
    const frozen = object(await store.read(frozenName)),
      plan = object(frozen.plan),
      checkpoint = object(await store.read(`${String(plan.planId)}.json`));
    const { planId: _id, planSha256: _digest, ...draft } = plan;
    const versions = object(plan.versions),
      preparation = object(plan.preparation),
      versionIdentity = object(versions.identity),
      instances = object(checkpoint.instances),
      bootstrap = object(checkpoint.bootstrap),
      bootstrapSha256 = object(checkpoint.bootstrapSha256);
    if (
      frozen.sourcePlanSha256 !== base.planSha256 ||
      !sha(frozen.configurationSha256) ||
      plan.schemaVersion !== 2 ||
      plan.kind !== 'aws-ce-site-replacement' ||
      plan.engine !== 'terraform' ||
      plan.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(plan.binding) !== canonicalSha256(binding) ||
      !sha(plan.planSha256) ||
      canonicalSha256(draft) !== plan.planSha256 ||
      plan.planId !== `aws-ce-replace-${String(plan.planSha256).slice(0, 24)}` ||
      versions.schemaVersion !== 1 ||
      canonicalSha256(versionIdentity.binding) !== canonicalSha256(binding) ||
      versionIdentity.siteUid !== preparation.uid ||
      !versionIdentity.physicalSiteUid ||
      checkpoint.physicalSiteUid === versionIdentity.physicalSiteUid ||
      checkpoint.schemaVersion !== 2 ||
      checkpoint.planSha256 !== plan.planSha256 ||
      checkpoint.phase !== 'complete' ||
      typeof checkpoint.siteUid !== 'string' ||
      !checkpoint.siteUid ||
      checkpoint.siteUid === preparation.uid ||
      typeof checkpoint.physicalSiteUid !== 'string' ||
      !checkpoint.physicalSiteUid ||
      !sha(checkpoint.quiesceConfigurationSha256) ||
      checkpoint.versionAdmissionSha256 !== canonicalSha256(versions) ||
      Object.keys(instances).length !== binding.nodes.length ||
      new Set(Object.values(instances)).size !== binding.nodes.length ||
      Object.keys(bootstrap).length !== binding.nodes.length ||
      Object.keys(bootstrapSha256).length !== binding.nodes.length ||
      binding.nodes.some(
        (node) =>
          !/^i-[a-f0-9]{8,17}$/.test(String(instances[node])) ||
          instances[node] === object(preparation.instances)[node] ||
          typeof bootstrap[node] !== 'string' ||
          !bootstrap[node] ||
          bootstrapSha256[node] !== canonicalSha256(bootstrap[node]),
      )
    )
      throw Error('Completed replacement parent provenance differs');
    for (const suffix of [
      '',
      '-mtu',
      '-terraform-source',
      '-terraform-quiesce-plan',
      '-terraform-launch-plan',
      '-terraform-launch',
      '-terraform-refresh',
      '-terraform-final-refresh',
    ])
      replacementJournals.add(`${String(plan.planId)}${suffix}.json`);
  }
  for (const name of upgradeJournals) preserve.add(name);
  if (upgrades.size) preserve.add('terraform-ce-upgrade-serial.json');
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
        if (stage !== 'f5-resources' && !upgrades.has(stage))
          throw Error('Unqualified Terraform stage blocks parent retirement');
        const stagePath = join(store.directory, name, stage);
        await directory(stagePath);
        if (JSON.stringify(await readdir(stagePath)) !== JSON.stringify([base.deploymentName]))
          throw Error('Stage deployment inventory differs');
        await runner(`${name}/${stage}/${base.deploymentName}`, stage, upgrades.get(stage));
      }
      continue;
    }
    if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name)) {
      const value = object(await store.read(name)),
        checkout = object(value.checkout);
      const match = siteBindings(base).find(
        ({ binding }) => canonicalSha256(value.binding) === canonicalSha256(binding),
      );
      if (
        value.schemaVersion !== 1 ||
        !match ||
        canonicalSha256(value.owner) !== canonicalSha256(match.binding.owner) ||
        !match.binding.nodes.includes(String(value.node)) ||
        typeof value.siteUid !== 'string' ||
        !value.siteUid ||
        typeof value.contractFingerprint !== 'string' ||
        !value.contractFingerprint ||
        typeof value.tokenName !== 'string' ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(value.tokenName) ||
        name !== `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json`
      )
        throw Error('AWS checkout provenance differs');
      if (!recorded?.has(name)) {
        const token = object(await store.read(`${String(value.tokenName)}.json`));
        if (
          token.tokenName !== value.tokenName ||
          token.siteName !== match.binding.siteName ||
          token.node !== value.node ||
          typeof token.jwt !== 'string' ||
          hash(token.jwt) !== checkout.digest
        )
          throw Error('AWS checkout upstream token differs');
      }
      await add(name, true);
      continue;
    }
    if (
      !preserve.has(name) &&
      !drainJournals.has(name) &&
      !replacementJournals.has(name) &&
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
  const current = await inventory(base, teardown, evidenceSha256, store, expected);
  if (
    current.some((item) => canonicalSha256(item) !== canonicalSha256(expected.get(item.path))) ||
    [...expected.values()].some((item) => item.preserve && !current.some((row) => row.path === item.path)) ||
    (marker.status === 'deployment-artifacts-retired' && current.some((item) => !item.preserve))
  )
    throw Error('Parent retirement inventory changed');
  for (const item of current.filter((item) => item.path.startsWith('bootstrap-checkout-'))) {
    signal?.throwIfAborted();
    const value = object(await store.read(item.path));
    await retireBootstrapToken(value.checkout as unknown as BootstrapCheckoutBinding, evidenceSha256, signal);
  }
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

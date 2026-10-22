import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type BootstrapCheckoutBinding, retireBootstrapToken } from '../../../platform/src/ce/token-store';
import { canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const markerName = 'azure-terraform-parent-artifact-retirement.json';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed Azure parent retirement');
  return value as Record<string, unknown>;
};
interface Teardown {
  kind: string;
  sourcePlanSha256: string;
  planSha256: string;
  planId: string;
  drain: { siteContractFingerprint: string };
  retirement: Array<{ siteName: string; siteUid: string; tokens: Array<{ node: string; name: string }> }>;
}
interface Item {
  path: string;
  sha256: string;
  preserve: boolean;
}
/** Called under the owning lifecycle lock after fresh external absence and exact runner retirement. */
export async function retireAzureTerraformParentArtifacts(
  base: AzureCePlan,
  teardown: Teardown,
  evidenceSha256: string,
  store: CeDeploymentStore,
  signal?: AbortSignal,
) {
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !sha(teardown.planSha256) ||
    !sha(evidenceSha256) ||
    !/^azure-ce-teardown-[a-z0-9-]+$/.test(teardown.planId)
  )
    throw Error('Azure parent retirement owner or source differs');
  signal?.throwIfAborted();
  await store.verify();
  const lifecycle = object(await store.read('azure-terraform-lifecycle-retirement.json')),
    authorization = object(await store.read(`${teardown.planId}-authorization.json`)),
    terminal = object(await store.read('azure-terraform-terminal-cleanup.json'));
  if (
    lifecycle.sourcePlanSha256 !== base.planSha256 ||
    lifecycle.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.kind !== teardown.kind ||
    canonicalSha256(lifecycle.owner) !== canonicalSha256(binding.owner) ||
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.sourcePlanSha256 !== base.planSha256 ||
    authorization.teardownPlanSha256 !== teardown.planSha256 ||
    authorization.mutations !== true ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown) ||
    terminal.phase !== 'retired' ||
    terminal.sourcePlanSha256 !== base.planSha256 ||
    terminal.teardownPlanSha256 !== teardown.planSha256 ||
    terminal.retirementEvidenceSha256 !== evidenceSha256
  )
    throw Error('Azure parent retirement authorization or terminal evidence differs');
  const directory = async (path: string) => {
    const stat = await lstat(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (await realpath(path)) !== path
    )
      throw Error('Azure parent directory differs');
  };
  const file = async (path: string) => {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 0o077
    )
      throw Error('Azure parent file differs');
    return readFile(path);
  };
  const deployment = await azureTerraformCurrentDeployment(base),
    { configuration, providerLock, ...rest } = deployment;
  const expectedManifest = {
    ...rest,
    configurationSha256: hash(configuration),
    providerLockSha256: hash(providerLock),
  };
  const preserve = new Set([
    'owner.json',
    'azure-terraform-lifecycle-retirement.json',
    'azure-terraform-terminal-cleanup.json',
    'azure-terraform-teardown-receipt.json',
    `${teardown.planId}.json`,
    `${teardown.planId}-authorization.json`,
  ]);
  const allowed = new Set([
    'terraform-workflow.json',
    'terraform-registration-configuration.json',
    'terraform-registration-observation.json',
    'terraform-foundation-plan.json',
    'terraform-site.json',
    'azure-terraform-cloud-destroy-plan.json',
    'azure-terraform-cloud-destroy-final.json',
    'platform-drain-source.json',
    'platform-drain-progress.json',
    'platform-drain-receipt.json',
    `site-binding-${base.siteName}.json`,
  ]);
  const tokens = new Map(
    teardown.retirement.flatMap((site) =>
      site.tokens.map((token) => [`${token.name}.json`, { ...token, siteName: site.siteName }]),
    ),
  );
  let saved: Record<string, unknown> | undefined;
  try {
    saved = object(await store.read(markerName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const inventory = async (recorded?: Map<string, Item>) => {
    await directory(store.directory);
    const items: Item[] = [];
    let runner = false;
    const add = async (path: string, keep: boolean) =>
      items.push({ path, preserve: keep, sha256: hash(await file(join(store.directory, path))) });
    for (const name of (await readdir(store.directory)).sort()) {
      if (name === markerName || name === '.azure-terraform-lifecycle-lock') continue;
      if (name === base.deploymentName) {
        runner = true;
        const path = join(store.directory, name);
        await directory(path);
        if (
          JSON.stringify((await readdir(path)).sort()) !==
          JSON.stringify(['artifact-retirement.json', 'deployment.json'])
        )
          throw Error('Azure runner has unretired artifacts');
        const manifest = object(JSON.parse((await file(join(path, 'deployment.json'))).toString())),
          marker = object(JSON.parse((await file(join(path, 'artifact-retirement.json'))).toString()));
        const receipt = object(terminal.artifacts),
          final = object(terminal.final);
        if (
          canonicalSha256(manifest) !== canonicalSha256(expectedManifest) ||
          marker.schemaVersion !== 1 ||
          marker.status !== 'runner-artifacts-retired' ||
          marker.manifestSha256 !== canonicalSha256(manifest) ||
          marker.evidenceSha256 !== evidenceSha256 ||
          marker.finalPlanSha256 !== final.planSha256 ||
          receipt.finalPlanSha256 !== final.planSha256 ||
          receipt.manifestSha256 !== marker.manifestSha256 ||
          receipt.evidenceSha256 !== evidenceSha256 ||
          receipt.inventorySha256 !== marker.inventorySha256 ||
          !Array.isArray(marker.artifacts) ||
          marker.inventorySha256 !== hash(JSON.stringify(marker.artifacts))
        )
          throw Error('Azure runner retirement provenance differs');
        for (const entry of ['artifact-retirement.json', 'deployment.json']) await add(`${name}/${entry}`, true);
        continue;
      }
      const checkout = /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name);
      if (
        !preserve.has(name) &&
        !allowed.has(name) &&
        !tokens.has(name) &&
        !checkout &&
        !/^terraform-(?:authorization-[a-f0-9]{64}|admission-plan-node-[1-3])\.json$/.test(name)
      )
        throw Error('Unknown Azure parent artifact blocks retirement');
      if (tokens.has(name) && !recorded?.has(name)) {
        const value = object(await store.read(name)),
          token = tokens.get(name);
        if (
          !token ||
          value.tokenName !== token.name ||
          value.siteName !== token.siteName ||
          value.node !== token.node ||
          typeof value.jwt !== 'string'
        )
          throw Error('Azure parent token identity differs');
      }
      if (checkout) {
        const value = object(await store.read(name)),
          checkoutBinding = object(value.checkout);
        if (
          value.schemaVersion !== 1 ||
          canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
          canonicalSha256(value.binding) !== canonicalSha256(binding) ||
          value.siteUid !== teardown.retirement[0]?.siteUid ||
          value.contractFingerprint !== teardown.drain.siteContractFingerprint ||
          !tokens.has(`${String(value.tokenName)}.json`) ||
          tokens.get(`${String(value.tokenName)}.json`)?.node !== value.node ||
          name !== `bootstrap-checkout-${String(checkoutBinding.reference).split('/').at(-1)}.json`
        )
          throw Error('Azure bootstrap checkout provenance differs');
      }
      await add(name, preserve.has(name) || checkout);
    }
    if (!runner) throw Error('Azure owning runner retirement missing');
    return items.sort((a, b) => a.path.localeCompare(b.path));
  };
  if (!saved) {
    const artifacts = await inventory();
    saved = {
      schemaVersion: 1,
      status: 'retiring',
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      evidenceSha256,
      artifacts,
      inventorySha256: canonicalSha256(artifacts),
    };
    await store.write(markerName, saved);
  }
  if (
    saved.schemaVersion !== 1 ||
    !['retiring', 'deployment-artifacts-retired'].includes(String(saved.status)) ||
    canonicalSha256(saved.owner) !== canonicalSha256(binding.owner) ||
    saved.sourcePlanSha256 !== base.planSha256 ||
    saved.teardownPlanSha256 !== teardown.planSha256 ||
    saved.evidenceSha256 !== evidenceSha256 ||
    !Array.isArray(saved.artifacts) ||
    saved.inventorySha256 !== canonicalSha256(saved.artifacts)
  )
    throw Error('Azure parent checkpoint differs');
  const expected = new Map<string, Item>();
  for (const row of saved.artifacts) {
    const item = object(row);
    if (
      typeof item.path !== 'string' ||
      item.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      !sha(item.sha256) ||
      typeof item.preserve !== 'boolean' ||
      expected.has(item.path)
    )
      throw Error('Azure parent inventory malformed');
    expected.set(item.path, item as unknown as Item);
  }
  const current = await inventory(expected);
  if (
    current.some((item) => canonicalSha256(item) !== canonicalSha256(expected.get(item.path))) ||
    [...expected.values()].some((item) => item.preserve && !current.some((row) => row.path === item.path)) ||
    (saved.status === 'deployment-artifacts-retired' && current.some((item) => !item.preserve))
  )
    throw Error('Azure parent inventory changed');
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
      throw Error('Azure parent artifact changed before deletion');
    signal?.throwIfAborted();
    await unlink(join(store.directory, item.path));
  }
  signal?.throwIfAborted();
  await store.write(markerName, { ...saved, status: 'deployment-artifacts-retired' });
  return {
    status: 'deployment-artifacts-retired' as const,
    owner: binding.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    evidenceSha256,
    inventorySha256: saved.inventorySha256,
    retiredArtifacts: [...expected.values()].filter((item) => !item.preserve).length,
  };
}

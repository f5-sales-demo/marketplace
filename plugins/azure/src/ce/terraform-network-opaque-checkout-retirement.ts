import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { type BootstrapCheckoutBinding, retireBootstrapToken } from '../../../platform/src/ce/token-store';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import { recheckAzureTerraformNetworkFreshParentAbsence } from './terraform-network-fresh-parent-absence';
import type { readAzureTerraformNetworkParentInventory } from './terraform-network-parent-inventory';
import {
  qualifyAzureTerraformNetworkRetiredBootstrapPackets,
  recheckAzureTerraformNetworkRetiredBootstrapPackets,
} from './terraform-network-sensitive-packet-retirement';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Inventory = Awaited<ReturnType<typeof readAzureTerraformNetworkParentInventory>>;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure network opaque checkout retirement: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'record required');
  return value as Record<string, unknown>;
}

/** Read-only frozen checkout selection. This helper grants no retirement authority.
 * The owning action separately requires actual completed native packet custody
 * and a current genuine absence witness before touching the token store.
 */
export async function readAzureTerraformNetworkFrozenCheckouts(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  inventory: Inventory,
  mainMarkerSha256: string,
  signal?: AbortSignal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const step = async <T>(action: () => Promise<T>) => {
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  active.throwIfAborted();
  const root = store.directory;
  const declarations = inventory.directories.filter((directory) => directory.path === '');
  require(declarations.length === 1, 'exact frozen root directory required');
  const rootIdentity = declarations[0]?.identity;
  const checkRoot = async () => {
    active.throwIfAborted();
    const stat = await lstat(root);
    require(store.directory === root &&
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === process.getuid?.() &&
      (stat.mode & 0o077) === 0 &&
      `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` ===
        rootIdentity, 'frozen checkout parent directory identity differs');
    active.throwIfAborted();
  };
  await checkRoot();
  const binding = azureUpgradeBinding(request),
    owner = structuredClone(store.owner);
  require(same(owner, binding.owner) &&
    same(inventory.owner, owner) &&
    inventory.originalPlanSha256 === request.planSha256 &&
    inventory.teardownPlanSha256 === context.destroyTeardown.planSha256 &&
    /^[a-f0-9]{64}$/.test(mainMarkerSha256), 'frozen owner or source differs');
  const rows = inventory.parentArtifactDecisions.filter((row) => row.schema === 'ce-bootstrap-checkout-v1');
  require(new Set(rows.map((row) => row.path)).size === rows.length, 'duplicate checkout decision');
  require(same(
    inventory.files
      .filter((file) => /^bootstrap-checkout-/.test(file.path))
      .map((file) => file.path)
      .sort(),
    rows.map((row) => row.path).sort(),
  ), 'partial or unclassified frozen checkout selection');
  const selected = [];
  for (const row of rows.sort((a, b) => a.path.localeCompare(b.path))) {
    active.throwIfAborted();
    require(row.action === 'preserve' &&
      /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(row.path), 'checkout preserve decision required');
    const declared = inventory.files.filter((file) => file.path === row.path);
    require(declared.length === 1 &&
      same(declared[0], {
        path: row.path,
        identity: row.identity,
        sha256: row.sha256,
        packetSha256: row.packetSha256,
      }), 'checkout file declaration differs');
    const path = join(store.directory, row.path);
    const native = await readAzureTerraformParentPrivateFile(path, active);
    const value = object(JSON.parse(native.bytes.toString()));
    require(native.identity === row.identity &&
      hash(native.bytes) === row.sha256 &&
      canonicalSha256(value) === row.packetSha256 &&
      same(value, await step(() => store.read(row.path))), 'checkout native identity or raw/logical bytes differ');
    const after = await readAzureTerraformParentPrivateFile(path, active);
    require(after.identity === native.identity &&
      after.bytes.equals(native.bytes), 'checkout changed across logical read');
    await checkRoot();
    require(same(
      Object.keys(value).sort(),
      ['binding', 'checkout', 'contractFingerprint', 'node', 'owner', 'schemaVersion', 'siteUid', 'tokenName'].sort(),
    ), 'checkout fields differ');
    const checkout = object(value.checkout);
    require(same(
      Object.keys(checkout).sort(),
      ['schemaVersion', 'reference', 'root', 'digest', 'expiresAt', 'uid'].sort(),
    ), 'opaque binding fields differ');
    const tokens = context.destroyTeardown.retirement.flatMap((site) =>
      site.tokens
        .filter((token) => token.name === value.tokenName)
        .map((token) => ({ ...token, siteName: site.siteName })),
    );
    require(tokens.length === 1, 'exact issued token required');
    const token = tokens[0];
    require(token &&
      value.schemaVersion === 1 &&
      same(value.owner, owner) &&
      same(value.binding, binding) &&
      value.siteUid === context.site.siteUid &&
      value.contractFingerprint === context.destroyTeardown.drain.siteContractFingerprint &&
      value.node === token.node &&
      row.path === `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json` &&
      checkout.schemaVersion === 1 &&
      checkout.uid === (process.getuid?.() ?? null) &&
      typeof checkout.reference === 'string' &&
      /^f5xc-ce:\/\/[a-zA-Z0-9._-]{1,128}\/[a-zA-Z0-9._-]{1,128}$/.test(checkout.reference) &&
      typeof checkout.root === 'string' &&
      isAbsolute(checkout.root) &&
      resolve(checkout.root) === checkout.root &&
      typeof checkout.digest === 'string' &&
      /^[a-f0-9]{64}$/.test(checkout.digest) &&
      typeof checkout.expiresAt === 'string' &&
      Number.isFinite(Date.parse(checkout.expiresAt)) &&
      row.semanticProvenanceSha256 ===
        canonicalSha256({ value, token }), 'checkout owner/site/node/token join differs');
    const issued = inventory.parentArtifactDecisions.filter(
      (item) =>
        item.path === `${token.name}.json` && item.schema === 'ce-bootstrap-token-v1' && item.action === 'delete',
    );
    require(issued.length === 1 &&
      issued[0]?.payloadSha256ByField?.jwt === checkout.digest, 'frozen upstream token digest differs');
    const evidenceSha256 = canonicalSha256({
      schemaVersion: 1,
      scope: 'azure-network-opaque-checkout-retirement',
      owner,
      originalPlanSha256: request.planSha256,
      teardownPlanSha256: context.destroyTeardown.planSha256,
      frozenInventorySha256: canonicalSha256(inventory),
      mainMarkerSha256,
      checkoutDecision: row,
      checkout,
    });
    selected.push({
      path: row.path,
      binding: structuredClone(checkout) as unknown as BootstrapCheckoutBinding,
      evidenceSha256,
    });
  }
  require(new Set(selected.map((row) => row.binding.reference)).size === selected.length, 'duplicate opaque reference');
  active.throwIfAborted();
  await checkRoot();
  return selected;
}

/** Internal action under the existing owning lifecycle lock. No new parent files
 * are introduced: the real token store owns pending/completed durable replay.
 * Fresh observation timestamps are deliberately excluded from replay digests.
 */
export async function retireAzureTerraformNetworkOpaqueCheckouts(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  absence: unknown,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const root = store.directory,
    read = store.read,
    verify = store.verify,
    write = store.write;
  const sealSha256 = canonicalSha256({
    request,
    owner: store.owner,
    terminal: context.terminalCleanup,
    teardown: context.destroyTeardown,
    site: context.site,
  });
  const guard = () => {
    active.throwIfAborted();
    require(store.directory === root &&
      store.read === read &&
      store.verify === verify &&
      store.write === write &&
      canonicalSha256({
        request,
        owner: store.owner,
        terminal: context.terminalCleanup,
        teardown: context.destroyTeardown,
        site: context.site,
      }) === sealSha256, 'owning context changed');
  };
  guard();
  const custody = await qualifyAzureTerraformNetworkRetiredBootstrapPackets(
    request,
    store,
    context,
    absence,
    runtime,
    contract,
    api,
    active,
  );
  guard();
  const inventory = structuredClone(object(context.terminalCleanup).retainedNetworkParentInventory) as Inventory;
  require(canonicalSha256(inventory) === custody.inventorySha256, 'completed native inventory differs');
  const marker = object(await store.read('azure-terraform-network-bootstrap-packet-retirement.json'));
  require(marker.status === 'packets-retired' &&
    marker.pending === null &&
    marker.frozenInventorySha256 === custody.inventorySha256 &&
    canonicalSha256(marker) === custody.checkpointSha256 &&
    typeof marker.mainMarkerSha256 === 'string', 'completed native bootstrap packet marker required');
  const selected = await readAzureTerraformNetworkFrozenCheckouts(
    request,
    store,
    context,
    inventory,
    marker.mainMarkerSha256,
    active,
  );
  const receipts = [];
  for (const row of selected) {
    guard();
    await recheckAzureTerraformNetworkFreshParentAbsence(
      absence,
      request,
      store,
      context,
      runtime,
      contract,
      api,
      active,
    );
    require(same(
      await readAzureTerraformNetworkFrozenCheckouts(
        request,
        store,
        context,
        inventory,
        marker.mainMarkerSha256,
        active,
      ),
      selected,
    ), 'checkout selection changed');
    guard();
    receipts.push(await retireBootstrapToken(row.binding, row.evidenceSha256, active));
    guard();
    const parts = row.binding.reference.slice('f5xc-ce://'.length).split('/');
    const directory = join(row.binding.root, ...parts);
    const metadata = object(
      JSON.parse(
        (await readAzureTerraformParentPrivateFile(join(directory, 'metadata.json'), active)).bytes.toString(),
      ),
    );
    const expectedReceipt = {
      schemaVersion: 1,
      status: 'bootstrap-secret-retired',
      reference: row.binding.reference,
      digest: row.binding.digest,
      evidenceSha256: row.evidenceSha256,
    };
    require(metadata.version === 1 &&
      metadata.session === parts[0] &&
      metadata.id === parts[1] &&
      metadata.uid === row.binding.uid &&
      metadata.digest === row.binding.digest &&
      metadata.expiresAt === row.binding.expiresAt &&
      metadata.checkoutReady === true &&
      metadata.consumed === true &&
      same(metadata.retirementPending, expectedReceipt) &&
      same(metadata.retirement, expectedReceipt), 'independent completed token metadata differs');
    try {
      await lstat(join(directory, 'token'));
      throw Error('Opaque bootstrap secret remains after retirement');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    guard();
  }
  // Reauthenticate both actual native packet custody and fresh external absence
  // after the token-store operation, including zero-checkout and completed replay.
  const after = await recheckAzureTerraformNetworkRetiredBootstrapPackets(
    custody,
    request,
    store,
    context,
    absence,
    runtime,
    contract,
    api,
    active,
  );
  guard();
  require(same(custody, after) &&
    same(
      await readAzureTerraformNetworkFrozenCheckouts(
        request,
        store,
        context,
        inventory,
        marker.mainMarkerSha256,
        active,
      ),
      selected,
    ), 'post-retirement custody differs');
  return {
    status: 'network-opaque-checkouts-retired' as const,
    sourcePlanSha256: request.planSha256,
    teardownPlanSha256: context.destroyTeardown.planSha256,
    inventorySha256: custody.inventorySha256,
    parent: after,
    receipts,
    opaqueCheckoutRetirementQualified: true as const,
    completeCleanup: false as const,
    parentRetirementQualified: false as const,
    interfaceAbsenceQualified: false as const,
    fullExternalCleanupQualified: false as const,
    liveQualified: false as const,
  };
}

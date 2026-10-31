import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import {
  qualifyAzureTerraformNetworkRetiredMainCustody,
  recheckAzureTerraformNetworkRetiredMainCustody,
  recheckAzureTerraformNetworkRetiredMainNativeCustody,
} from './terraform-network-retired-main-custody';
import { prepareAzureTerraformNetworkTerminalStagingProjection } from './terraform-network-terminal-staging-projection';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import type { AzureCePlan } from './types';

const name = 'azure-terraform-terminal-cleanup.json';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const same = (left: unknown, right: unknown) => canonicalEqual({ value: left }, { value: right });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure terminal plaintext retirement: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value as Record<string, unknown>;
}

/** Under the owning lock, transform only the authenticated terminal plaintext field.
 * The genuine pre-parent native witness, fresh owning absence gate, exact checkpoint
 * bytes/inode and unchanged permanent main marker are mandatory. This grants no parent
 * packet deletion or post-parent resume acceptance. Recovery after this transformation
 * must use the separately qualified post-parent reader, never the old plaintext reader.
 */
export async function retireAzureTerraformNetworkTerminalPlaintext(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  beforeTransformation: (signal: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    checkpoint = structuredClone(context.terminalCleanup),
    checkpointSha256 = canonicalSha256(checkpoint),
    site = structuredClone(context.site),
    teardown = structuredClone(context.destroyTeardown),
    { loaders, terraform, publicSession, verifier, replacementVerifier } = context;
  const methods = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    { target: terraform, key: 'open', value: terraform.open },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, original) &&
      same(store.owner, owner) &&
      store.directory === root &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, checkpointSha256, 'raw') &&
      same(context.site, site) &&
      same(context.destroyTeardown, teardown) &&
      context.loaders === loaders &&
      context.terraform === terraform &&
      context.publicSession === publicSession &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      methods.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning inputs or methods changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  // Mint genuine current native custody under this exact context. No serialized or
  // caller-supplied witness can authorize the transformation.
  const nativeWitness = await step(() =>
    qualifyAzureTerraformNetworkRetiredMainCustody(request, store, context, deadline),
  );
  const native = structuredClone(nativeWitness);
  const terminal = object(checkpoint);
  require(native.mainRunnerRetirementQualified === true &&
    native.parentRetirementQualified === false &&
    native.mainRetirementReceiptSha256 === canonicalSha256(terminal.artifacts), 'native retirement receipt differs');
  const projection = prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint, {
    status: 'runner-artifacts-retired',
    markerSha256: native.mainMarkerSha256,
    receipt: terminal.artifacts,
  });
  require(projection.transformationRequired, 'terminal plaintext already transformed; use post-parent reader');
  const path = join(root, name),
    markerPath = join(
      root,
      String(object(terminal.retainedNetworkParentInventory).mainDirectory),
      'artifact-retirement.json',
    );
  const before = await step(() => readAzureTerraformParentPrivateFile(path, deadline));
  require(same(JSON.parse(before.bytes.toString()), checkpoint), 'saved terminal checkpoint differs');
  const marker = await step(() => readAzureTerraformParentPrivateFile(markerPath, deadline));
  require(hash(marker.bytes) === native.mainMarkerSha256, 'permanent main marker differs');
  const custody = async () => {
    await step(() => store.verify());
    const current = await step(() => readAzureTerraformParentPrivateFile(path, deadline));
    const nativeMarker = await step(() => readAzureTerraformParentPrivateFile(markerPath, deadline));
    require(current.identity === before.identity &&
      hash(current.bytes) === hash(before.bytes) &&
      nativeMarker.identity === marker.identity &&
      hash(nativeMarker.bytes) === hash(marker.bytes), 'terminal bytes, inode or permanent marker changed');
  };
  await step(() => beforeTransformation(deadline));
  await step(() => recheckAzureTerraformNetworkRetiredMainCustody(nativeWitness, request, store, context, deadline));
  await custody();
  await step(() =>
    recheckAzureTerraformNetworkRetiredMainNativeCustody(nativeWitness, request, store, context, false, deadline),
  );
  await step(() => store.write(name, projection.checkpoint, deadline));
  await step(() =>
    recheckAzureTerraformNetworkRetiredMainNativeCustody(nativeWitness, request, store, context, true, deadline),
  );
  const transformed = await step(() => readAzureTerraformParentPrivateFile(path, deadline));
  require(same(
    JSON.parse(transformed.bytes.toString()),
    projection.checkpoint,
  ), 'owning terminal transformation differs');
  const afterMarker = await step(() => readAzureTerraformParentPrivateFile(markerPath, deadline));
  require(afterMarker.identity === marker.identity &&
    hash(afterMarker.bytes) === hash(marker.bytes), 'permanent main marker changed during transformation');
  return {
    schemaVersion: 1 as const,
    scope: 'native-authenticated-terminal-plaintext-transformation-only' as const,
    checkpoint: projection.checkpoint,
    checkpointSha256: projection.checkpointSha256,
    terminalFile: { path: name, identity: transformed.identity, sha256: hash(transformed.bytes) },
    mainMarkerSha256: native.mainMarkerSha256,
    retainedDestroyConfigurationSha256: projection.retainedDestroyConfigurationSha256,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
}

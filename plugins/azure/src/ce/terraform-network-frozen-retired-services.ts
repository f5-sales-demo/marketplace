import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import type { readAzureTerraformNetworkParentInventory } from './terraform-network-parent-inventory';
import { recheckAzureTerraformNetworkPostPlaintextParentCustody } from './terraform-network-post-plaintext-parent-custody';
import { azureTerraformNetworkRetiredPowerDeployment } from './terraform-network-power';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');
const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure frozen retired services: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v as Record<string, unknown>;
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

/** Mint from genuine exhaustive post-plaintext parent custody. Subsequent native
 * service rechecks retain main/child barriers and their exact final receipts without
 * reopening erased source configurations or replaying original graph inspectors.
 * This is in-process service custody only, not fresh post-deletion recovery, generic
 * stage retirement, permission to delete packets, parent retirement or live acceptance.
 */
export async function qualifyAzureTerraformNetworkFrozenRetiredServices(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  parentWitness: unknown,
  signal?: AbortSignal,
) {
  return qualifyServices(request, store, context, parentWitness, false, signal);
}

/** Fresh read-only main and power-child service custody, authenticated directly
 * against the permanent native main evidence. Public source identities must match
 * its frozen mapping. This does not authorize deletion, bootstrap retirement,
 * generic stage cleanup or claim whole-parent post-deletion recovery.
 */
export async function qualifyAzureTerraformNetworkFreshRetiredServices(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  return qualifyServices(request, store, context, undefined, true, signal);
}

async function qualifyServices(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  parentWitness: unknown,
  fresh: boolean,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    terminal = structuredClone(context.terminalCleanup),
    teardown = structuredClone(context.destroyTeardown),
    site = structuredClone(context.site),
    { terraform, loaders } = context;
  const methods: Array<{ target: object; key: string; value: unknown }> = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const terminalSha256 = canonicalSha256({ value: terminal });
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, original) &&
      same(store.owner, owner) &&
      store.directory === root &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, terminalSha256) &&
      same(context.destroyTeardown, teardown) &&
      same(context.site, site) &&
      context.terraform === terraform &&
      context.loaders === loaders &&
      methods.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
  };
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  if (!fresh)
    await step(() =>
      recheckAzureTerraformNetworkPostPlaintextParentCustody(parentWitness, request, store, context, deadline),
    );
  verifyAzureCePlan(original);
  const checkpoint = object(terminal),
    frozen = structuredClone(checkpoint.retainedNetworkParentInventory) as Inventory;
  require(frozen &&
    same(frozen, object(checkpoint.retirementEvidence).networkParentInventory) &&
    frozen.schemaVersion === 1 &&
    frozen.mainDirectory === request.deploymentName &&
    !Object.hasOwn(checkpoint, 'retainedDestroyConfiguration') &&
    frozen.scope === 'native-bound-network-parent-inventory' &&
    frozen.completeParentDispositionQualified === true &&
    same(frozen.owner, owner) &&
    frozen.originalPlanSha256 === request.planSha256 &&
    frozen.teardownPlanSha256 === teardown.planSha256, 'authenticated frozen parent required');
  const custody = new Map<string, { identity: string; bytesSha256: string }>();
  const file = async (path: string, parent?: AbortSignal) => {
    require(path !== '' &&
      path.split('/').every((p) => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== '.' && p !== '..'), 'foreign native path');
    const native = await step(
      () =>
        readAzureTerraformParentPrivateFile(join(root, path), parent ? AbortSignal.any([deadline, parent]) : deadline),
      parent,
    );
    const value = { identity: native.identity, bytesSha256: hash(native.bytes) };
    require(!custody.has(path) || same(custody.get(path), value), 'retained native bytes or identity changed');
    custody.set(path, value);
    return JSON.parse(native.bytes.toString()) as unknown;
  };
  const record = async (path: string, parent?: AbortSignal) => {
    const logical = await step(() => store.read(path), parent),
      native = await file(path, parent);
    require(same(logical, native), 'logical and native record differ');
    return structuredClone(native);
  };
  const boundary = async (parent?: AbortSignal) => {
    for (const path of custody.keys()) await file(path, parent);
    seal();
  };
  const declared = new Map([...frozen.files, frozen.terminalFile].map((row) => [row.path, row]));
  const frozenRecord = async (path: string, parent?: AbortSignal) => {
    const native = await record(path, parent),
      snapshot = custody.get(path),
      expected = declared.get(path),
      decision = frozen.parentArtifactDecisions.find((row) => row.path === path);
    require(snapshot &&
      expected &&
      decision &&
      decision.action === 'preserve' &&
      expected.identity === snapshot.identity &&
      expected.sha256 === snapshot.bytesSha256 &&
      expected.packetSha256 === canonicalSha256(native), 'retained record lacks frozen preserved decision');
    return native;
  };
  require(same(await record('azure-terraform-terminal-cleanup.json'), terminal), 'saved terminal differs');
  require(same(await frozenRecord('owner.json'), { schemaVersion: 2, owner }), 'saved owner differs');
  require(same(await frozenRecord(`${teardown.planId}.json`), teardown), 'saved teardown differs');
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const mainSession = await step(() => terraform.open(owner, deployment, 'current'));
  const bind = (session: TerraformSession) => {
    const reader = session.readArtifactRetirement;
    require(typeof reader === 'function', 'owning native retirement service reader required');
    methods.push({ target: session, key: 'readArtifactRetirement', value: reader });
    return reader;
  };
  const mainReader = bind(mainSession),
    final = object(checkpoint.final) as unknown as PlanReceipt;
  require(sha(checkpoint.retirementEvidenceSha256) &&
    checkpoint.retirementEvidenceSha256 ===
      canonicalSha256(checkpoint.retirementEvidence), 'native evidence digest differs');
  const main = await step(() =>
    mainReader.call(mainSession, final, checkpoint.retirementEvidenceSha256 as string, deadline),
  );
  require(main.status === 'runner-artifacts-retired' &&
    same(main.receipt, checkpoint.artifacts), 'main native barrier differs');
  const mainManifest = await file(`${deployment.deploymentId}/deployment.json`),
    mainMarker = await file(`${deployment.deploymentId}/artifact-retirement.json`);
  require(canonicalSha256(mainManifest) === main.receipt.manifestSha256 &&
    custody.get(`${deployment.deploymentId}/artifact-retirement.json`)?.bytesSha256 === main.markerSha256 &&
    object(mainMarker).status === 'runner-artifacts-retired', 'main native filesystem differs');
  const rows: Array<{
    child: Inventory['children'][number];
    session: TerraformSession;
    reader: NonNullable<TerraformSession['readArtifactRetirement']>;
    final: PlanReceipt;
    evidenceSha256: string;
    observed: typeof main;
  }> = [];
  const sources = new Map<string, AzureCePlan>();
  for (const child of frozen.children) {
    let source = sources.get(child.networkPlanSha256);
    if (!source) {
      source = structuredClone(await step(() => loaders.loadSource(child.networkPlanSha256)));
      verifyAzureCePlan(source);
      const publicBinding = frozen.publicBindings.sources.filter((row) => row.planSha256 === child.networkPlanSha256);
      require(source.planSha256 === child.networkPlanSha256 &&
        publicBinding.length === 1 &&
        publicBinding[0]?.sourceSha256 === canonicalSha256(source) &&
        same(azureUpgradeBinding(source).owner, owner), 'frozen public source differs');
      sources.set(source.planSha256, source);
    }
    require(child.operation === 'deallocate' || child.operation === 'start', 'exact selected operation required');
    const selected = await step(() =>
      azureTerraformNetworkRetiredPowerDeployment(
        source as AzureCePlan,
        child.node,
        child.operation as 'deallocate' | 'start',
      ),
    );
    require(selected.stage === child.stage, 'selected native stage differs');
    const proof = object(child.proof),
      expected = object(proof.observed);
    require(expected.status === 'runner-artifacts-retired' &&
      sha(expected.markerSha256) &&
      sha(proof.preparingSha256) &&
      sha(proof.finalReceiptSha256), 'complete frozen child proof required');
    const cancelId = canonicalSha256({
      planSha256: source.planSha256,
      selectedNode: child.node,
      selectedOperation: child.operation,
    }).slice(0, 24);
    const cancelled = frozen.networkPacketNames.includes(`azure-power-cancel-${cancelId}.json`);
    const receiptPath = cancelled
      ? `azure-power-runner-retirement-${cancelId}-preparing.json`
      : `${source.planId}-terraform-network-node-${child.node}-${child.operation}-final-plan.json`;
    const packet = await frozenRecord(receiptPath),
      receipt = (cancelled ? object(packet).finalReceipt : packet) as PlanReceipt;
    require(canonicalSha256(receipt) === proof.finalReceiptSha256, 'exact preserved final receipt differs');
    const session = await step(() => terraform.open(owner, selected, 'current')),
      reader = bind(session);
    const observed = await step(() => reader.call(session, receipt, proof.preparingSha256 as string, deadline));
    require(observed.status === 'runner-artifacts-retired' &&
      same(observed, expected), 'child native service differs from frozen proof');
    const directory = `terraform-stages/${child.stage}/${selected.deploymentId}`;
    const manifest = await file(`${directory}/deployment.json`);
    await file(`${directory}/artifact-retirement.json`);
    for (const path of [`${directory}/deployment.json`, `${directory}/artifact-retirement.json`]) {
      const expectedFile = declared.get(path),
        snapshot = custody.get(path);
      require(expectedFile &&
        snapshot &&
        expectedFile.identity === snapshot.identity &&
        expectedFile.sha256 === snapshot.bytesSha256, 'child frozen native identity differs');
    }
    require(canonicalSha256(manifest) === observed.receipt.manifestSha256 &&
      custody.get(`${directory}/artifact-retirement.json`)?.bytesSha256 ===
        observed.markerSha256, 'child native manifest or marker differs');
    rows.push({ child, session, reader, final: receipt, evidenceSha256: proof.preparingSha256 as string, observed });
  }
  require(rows.length === frozen.children.length &&
    new Set(rows.map((row) => row.child.stage)).size === rows.length, 'duplicate or partial child bindings');
  const inspect = async (parent?: AbortSignal) => {
    await boundary(parent);
    require(same(
      await step(
        () =>
          mainReader.call(
            mainSession,
            final,
            checkpoint.retirementEvidenceSha256 as string,
            parent ? AbortSignal.any([deadline, parent]) : deadline,
          ),
        parent,
      ),
      main,
    ), 'main native barrier changed');
    for (const row of rows)
      require(same(
        await step(
          () =>
            row.reader.call(
              row.session,
              row.final,
              row.evidenceSha256,
              parent ? AbortSignal.any([deadline, parent]) : deadline,
            ),
          parent,
        ),
        row.observed,
      ), 'child native barrier changed');
    await boundary(parent);
  };
  await inspect();
  const result = {
    schemaVersion: 1 as const,
    scope: fresh
      ? ('fresh-native-marker-authenticated-retired-service-custody' as const)
      : ('in-process-frozen-native-retired-service-custody' as const),
    owner,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    frozenParentInventorySha256: canonicalSha256(frozen),
    mainMarkerSha256: main.markerSha256,
    children: rows.map((row) => ({
      stage: row.child.stage,
      networkPlanSha256: row.child.networkPlanSha256,
      node: row.child.node,
      operation: row.child.operation,
      markerSha256: row.observed.markerSha256,
    })),
    nativeServicesQualified: true as const,
    freshNativeServiceObservation: fresh,
    freshPostDeletionRecoveryQualified: false as const,
    sensitiveDeletionExecutionQualified: false as const,
    parentRetirementQualified: false as const,
    liveQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parent) {
      require(canonicalSha256(result) === digest, 'retired service witness changed');
      await inspect(parent);
    },
  });
  return result;
}
export async function recheckAzureTerraformNetworkFrozenRetiredServices(
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
    canonicalSha256(witness) === bound.digest, 'owning frozen retired services witness required');
  await bound.recheck(signal);
}

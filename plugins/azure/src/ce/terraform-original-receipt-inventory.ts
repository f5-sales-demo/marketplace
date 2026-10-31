import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt, TerraformRunner } from '../../../terraform/src/runner';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureTerraformFoundationDeployment, renderAzureTerraformFoundation } from './terraform-foundation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform original receipt inventory: ${message}`);
}
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  require(value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.sort().join(','), 'artifact schema differs');
}
export type AzureTerraformOriginalReceiptStage =
  | { kind: 'foundation' }
  | { kind: 'node-admission'; node: number }
  | { kind: 'ingress-final' };
export interface AzureTerraformOriginalReceiptInput {
  plan: AzureCePlan;
  bootstrapByNode: Record<string, string>;
  stage: AzureTerraformOriginalReceiptStage;
  receipt: PlanReceipt;
}
export interface AzureTerraformOriginalReceiptRecord {
  schemaVersion: 1;
  engine: 'terraform';
  scope: 'original-deployment-plan-receipt-provenance';
  originalPlanSha256: string;
  ownerSha256: string;
  stage: AzureTerraformOriginalReceiptStage;
  bootstrapSha256ByNode: Record<string, string>;
  receiptSha256: string;
  receipt: PlanReceipt;
}

/** Receipt metadata only; the enrollment strings stay in the owning workflow storage. */
export async function buildAzureTerraformOriginalReceiptRecord(input: AzureTerraformOriginalReceiptInput) {
  const context = structuredClone(input),
    contextSha256 = canonicalSha256(context);
  const { plan, bootstrapByNode, stage, receipt } = context;
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' && plan.intent.operation === 'deploy', 'original Terraform deploy required');
  const count = Object.keys(bootstrapByNode).length;
  require(count <= plan.topology.nodeCount &&
    Object.keys(bootstrapByNode).every(
      (node, index) =>
        node === String(index + 1) &&
        typeof bootstrapByNode[node] === 'string' &&
        bootstrapByNode[node].startsWith('#cloud-config') &&
        bootstrapByNode[node].includes('/etc/vpm/user_data') &&
        !/__\w+__/.test(bootstrapByNode[node]),
    ), 'complete ordered resolved bootstrap prefix required');
  if (stage.kind === 'node-admission') {
    exact(stage, ['kind', 'node']);
    require(Number.isInteger(stage.node) &&
      stage.node >= 1 &&
      stage.node <= plan.topology.nodeCount &&
      count === stage.node, 'node admission requires its exact bootstrap prefix');
  } else {
    exact(stage, ['kind']);
    require(stage.kind === 'foundation' || stage.kind === 'ingress-final', 'original stage unsupported');
    if (stage.kind === 'ingress-final')
      require(count === plan.topology.nodeCount &&
        plan.intent.ingress?.mode === 'platform-http', 'ingress final requires all nodes and owning ingress intent');
  }
  exact(receipt, [
    'schemaVersion',
    'deploymentId',
    'engine',
    'backendIdentity',
    'configurationSha256',
    'providerLockSha256',
    'planSha256',
    'changes',
    'noChanges',
    ...(receipt.actionInvocations === undefined ? [] : ['actionInvocations']),
  ]);
  const source = renderAzureTerraformFoundation(plan, bootstrapByNode);
  const deployment = await azureTerraformFoundationDeployment(plan, bootstrapByNode);
  require(same(input, context) &&
    canonicalSha256(context) === contextSha256, 'caller changed original receipt request');
  require(receipt.schemaVersion === 1 &&
    receipt.engine === 'terraform' &&
    receipt.deploymentId === deployment.deploymentId &&
    receipt.backendIdentity === deployment.backendIdentity &&
    receipt.configurationSha256 === hash(source) &&
    receipt.providerLockSha256 === hash(deployment.providerLock) &&
    sha(receipt.planSha256) &&
    Array.isArray(receipt.changes) &&
    typeof receipt.noChanges === 'boolean', 'receipt configuration/provider/engine/owner differs');
  const addresses = new Set<string>();
  for (const change of receipt.changes) {
    exact(change, ['address', 'type', 'actions']);
    require(typeof change.address === 'string' &&
      !!change.address &&
      typeof change.type === 'string' &&
      !!change.type &&
      !addresses.has(change.address) &&
      Array.isArray(change.actions) &&
      change.actions.length > 0 &&
      change.actions.every(
        (action) =>
          ['create', 'read', 'no-op'].includes(action) ||
          (change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
      ), 'original receipt contains destructive, duplicate or malformed changes');
    addresses.add(change.address);
  }
  if (receipt.actionInvocations !== undefined) {
    require(Array.isArray(receipt.actionInvocations) &&
      receipt.actionInvocations.length ===
        0, 'original resource admission cannot authorize Terraform action invocations');
  }
  require(receipt.noChanges ===
    receipt.changes.every((change) =>
      change.actions.every((action) => action === 'no-op' || action === 'read'),
    ), 'receipt no-change state differs');
  if (stage.kind === 'ingress-final') require(receipt.noChanges, 'ingress final must be an ordinary no-change receipt');
  return {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    scope: 'original-deployment-plan-receipt-provenance' as const,
    originalPlanSha256: plan.planSha256,
    ownerSha256: canonicalSha256(azureUpgradeBinding(plan).owner),
    stage,
    bootstrapSha256ByNode: Object.fromEntries(
      Object.entries(bootstrapByNode).map(([node, value]) => [node, hash(value)]),
    ),
    receiptSha256: canonicalSha256(receipt),
    receipt,
  } satisfies AzureTerraformOriginalReceiptRecord;
}
const recordName = (record: AzureTerraformOriginalReceiptRecord) => `${canonicalSha256(record)}.json`;
const directoryName = 'terraform-original-deployment-receipts';
type Store = Pick<CeDeploymentStore, 'directory' | 'owner' | 'verify'>;
async function privateDirectory(path: string, create = false) {
  if (create) await mkdir(path, { mode: 0o700 });
  const stat = await lstat(path);
  require(stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    stat.uid === process.getuid?.() &&
    (stat.mode & 0o077) === 0 &&
    (await realpath(path)) === path, 'receipt directory ownership differs');
  return stat;
}
async function bytes(path: string, links = 1) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    require(before.isFile() &&
      before.uid === process.getuid?.() &&
      before.nlink === links &&
      (before.mode & 0o077) === 0, 'receipt file ownership differs');
    const value = await file.readFile(),
      after = await file.stat(),
      named = await lstat(path);
    require(before.dev === after.dev &&
      before.ino === after.ino &&
      before.size === after.size &&
      before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs &&
      named.dev === before.dev &&
      named.ino === before.ino &&
      named.nlink === links &&
      !named.isSymbolicLink() &&
      (named.mode & 0o077) === 0, 'receipt file changed during read');
    return value;
  } finally {
    await file.close();
  }
}
function checkedContext(store: Store, input: AzureTerraformOriginalReceiptInput, signal?: AbortSignal) {
  const expected = canonicalSha256({ input, owner: store.owner, directory: store.directory }),
    verifier = store.verify;
  const boundary = () => {
    signal?.throwIfAborted();
    require(store.verify === verifier, 'owning storage verifier changed');
    require(canonicalSha256({ input, owner: store.owner, directory: store.directory }) ===
      expected, 'owning original receipt context changed');
  };
  const step = async <T>(work: () => Promise<T>): Promise<T> => {
    boundary();
    let abort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      abort = () => reject(signal?.reason ?? Error('original receipt operation canceled'));
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      const result = await Promise.race([Promise.resolve().then(work), aborted]);
      boundary();
      return result;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };
  let nativeOwner: string | undefined;
  const inspectNativeOwner = async () => {
    const root = await privateDirectory(store.directory),
      path = join(store.directory, 'owner.json'),
      stat = await lstat(path),
      content = await bytes(path);
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(content.toString());
    } catch {
      throw Error('Malformed native owning manifest');
    }
    exact(value, ['schemaVersion', 'owner']);
    require(value.schemaVersion === 2 && same(value.owner, store.owner), 'native owner manifest differs');
    const observed = canonicalSha256({
      directory: { dev: root.dev, ino: root.ino },
      owner: { dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, sha256: hash(content) },
    });
    require(nativeOwner === undefined || nativeOwner === observed, 'native owner manifest changed');
    nativeOwner = observed;
  };
  const verifiedStore = async () => {
    await step(inspectNativeOwner);
    await step(() => verifier.call(store));
    await step(inspectNativeOwner);
  };
  return { boundary, step, verifiedStore };
}

/** Exclusive immutable publication. Interrupted .pending records remain explicit evidence. */
export async function publishAzureTerraformOriginalReceipt(
  input: AzureTerraformOriginalReceiptInput,
  store: Store,
  signal?: AbortSignal,
) {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180_000)]);
  const { boundary, step, verifiedStore } = checkedContext(store, input, signal);
  const record = await step(() => buildAzureTerraformOriginalReceiptRecord(input));
  require(record.ownerSha256 === canonicalSha256(store.owner), 'receipt publisher owner differs');
  await verifiedStore();
  const directory = join(store.directory, directoryName);
  try {
    await step(() => privateDirectory(directory, true));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await step(() => privateDirectory(directory));
  }
  const name = recordName(record),
    path = join(directory, name),
    content = Buffer.from(JSON.stringify(record));
  const pendingNames = async () =>
    (await step(() => readdir(directory)))
      .filter((candidate) => new RegExp(`^${canonicalSha256(record)}-[a-f0-9-]{36}\\.pending$`).test(candidate))
      .sort();
  try {
    const publishedStat = await step(() => lstat(path));
    if (publishedStat.nlink === 2) {
      const matches: string[] = [];
      for (const candidate of await pendingNames()) {
        const stat = await step(() => lstat(join(directory, candidate)));
        if (stat.dev === publishedStat.dev && stat.ino === publishedStat.ino) matches.push(candidate);
      }
      require(matches.length === 1, 'linked publication recovery identity is ambiguous');
      const pendingPath = join(directory, matches[0]);
      require((await step(() => bytes(path, 2))).equals(content) &&
        (await step(() => bytes(pendingPath, 2))).equals(content), 'linked pending receipt provenance differs');
      await verifiedStore();
      require((await step(() => bytes(path, 2))).equals(content) &&
        (await step(() => bytes(pendingPath, 2))).equals(content), 'linked pending receipt changed at recovery');
      await step(() => unlink(pendingPath));
    }
    const existing = await step(() => bytes(path));
    require(existing.equals(content), 'foreign immutable receipt collision retained');
    await verifiedStore();
    require((await step(() => bytes(path))).equals(content), 'published receipt changed');
    return { name, publicationSha256: canonicalSha256(record), receiptSha256: record.receiptSha256 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const retained = await pendingNames();
  require(retained.length <= 1, 'pending publication recovery identity is ambiguous');
  const pending = join(directory, retained[0] ?? `${canonicalSha256(record)}-${randomUUID()}.pending`);
  if (retained.length)
    require((await step(() => bytes(pending))).equals(content), 'incomplete or foreign pending receipt retained');
  const file = await step(() =>
    open(pending, retained.length ? constants.O_RDONLY | constants.O_NOFOLLOW : 'wx', 0o600),
  );
  try {
    if (!retained.length) await step(() => file.writeFile(content));
    await step(() => file.sync());
    await file.close();
    await verifiedStore();
    require((await step(() => bytes(pending))).equals(content), 'pending receipt changed');
    try {
      await step(() => link(pending, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      require((await step(() => bytes(path))).equals(content), 'late foreign immutable receipt collision retained');
    }
    await step(() => unlink(pending));
    const handle = await step(() => open(directory, constants.O_RDONLY));
    try {
      await step(() => handle.sync());
    } finally {
      await handle.close();
    }
    await verifiedStore();
    require((await step(() => bytes(path))).equals(content), 'published receipt changed');
    boundary();
    return { name, publicationSha256: canonicalSha256(record), receiptSha256: record.receiptSha256 };
  } catch (error) {
    await file.close().catch(() => {});
    // Retain partial publication evidence; cancellation is never converted into receipt success.
    throw error;
  }
}

/** Exhaustive descriptor inventory; incomplete descriptors cannot account native receipts. */
export async function readAzureTerraformOriginalReceiptInventory(
  plan: AzureCePlan,
  bootstrapByNode: Record<string, string>,
  store: Store,
  signal?: AbortSignal,
) {
  const input: AzureTerraformOriginalReceiptInput = {
    plan,
    bootstrapByNode,
    stage: { kind: 'foundation' },
    receipt: {} as PlanReceipt,
  };
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180_000)]);
  const { boundary, step, verifiedStore } = checkedContext(store, input, signal);
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(plan).owner, store.owner), 'inventory original owner differs');
  await verifiedStore();
  const directory = join(store.directory, directoryName);
  try {
    await step(() => privateDirectory(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await verifiedStore();
    try {
      await step(() => lstat(directory));
      throw Error('original receipt directory appeared during absence');
    } catch (later) {
      if ((later as NodeJS.ErrnoException).code !== 'ENOENT') throw later;
    }
    return {
      schemaVersion: 1 as const,
      status: 'absent' as const,
      records: [],
      incompleteEntrySha256s: [],
      nativeJournalsQualified: false as const,
      originalDeploymentQualified: false as const,
    };
  }
  const names = (await step(() => readdir(directory))).sort(),
    inventory = new Map<string, Buffer>(),
    records: Array<{ name: string; publicationSha256: string; record: AzureTerraformOriginalReceiptRecord }> = [],
    incompleteEntrySha256s: string[] = [];
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) {
      incompleteEntrySha256s.push(hash(name));
      continue;
    }
    const content = await step(() => bytes(join(directory, name)));
    inventory.set(name, content);
    let value: AzureTerraformOriginalReceiptRecord;
    try {
      value = JSON.parse(content.toString());
    } catch {
      throw Error('Malformed original receipt descriptor');
    }
    exact(value, [
      'schemaVersion',
      'engine',
      'scope',
      'originalPlanSha256',
      'ownerSha256',
      'stage',
      'bootstrapSha256ByNode',
      'receiptSha256',
      'receipt',
    ]);
    const prefix = Object.fromEntries(
      Object.keys(value.bootstrapSha256ByNode).map((node) => [node, bootstrapByNode[node]]),
    );
    const expected = await step(() =>
      buildAzureTerraformOriginalReceiptRecord({
        plan,
        bootstrapByNode: prefix,
        stage: value.stage,
        receipt: value.receipt,
      }),
    );
    require(same(value, expected) &&
      recordName(value) === name &&
      content.equals(Buffer.from(JSON.stringify(expected))), 'original receipt descriptor provenance differs');
    records.push({ name, publicationSha256: canonicalSha256(value), record: value });
  }
  await verifiedStore();
  await step(() => privateDirectory(directory));
  require(same(await step(() => readdir(directory).then((names) => names.sort())), names), 'receipt namespace changed');
  for (const [name, content] of inventory)
    require((await step(() => bytes(join(directory, name)))).equals(
      content,
    ), 'receipt inventory changed at final boundary');
  boundary();
  return {
    schemaVersion: 1 as const,
    status: incompleteEntrySha256s.length ? ('partial' as const) : ('complete' as const),
    records,
    incompleteEntrySha256s,
    nativeJournalsQualified: false as const,
    originalDeploymentQualified: false as const,
  };
}

/** Owning resume only: finish complete, identity-verified pending descriptors before a new plan.
 * Partial or foreign evidence is retained and rejects recovery; no Terraform/cloud operation occurs.
 */
export async function recoverAzureTerraformOriginalReceiptPublications(
  plan: AzureCePlan,
  bootstrapByNode: Record<string, string>,
  store: Store,
  signal?: AbortSignal,
  nativeCurrent?: () => Promise<Awaited<ReturnType<TerraformRunner['readCurrentPlanJournal']>>>,
) {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180_000)]);
  const input: AzureTerraformOriginalReceiptInput = {
    plan,
    bootstrapByNode,
    stage: { kind: 'foundation' },
    receipt: {} as PlanReceipt,
  };
  const { step, boundary, verifiedStore } = checkedContext(store, input, signal);
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(plan).owner, store.owner), 'recovery original owner differs');
  await verifiedStore();
  const directory = join(store.directory, directoryName);
  try {
    await step(() => privateDirectory(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    boundary();
    return [];
  }
  await restoreOriginalPublicationFragments(
    plan,
    bootstrapByNode,
    store,
    { step, boundary, verifiedStore },
    nativeCurrent,
  );
  const pending = (await step(() => readdir(directory))).filter((name) => name.endsWith('.pending')).sort(),
    publications = [];
  for (const name of pending) {
    require(/^[a-f0-9]{64}-[a-f0-9-]{36}\.pending$/.test(name), 'unrecognized pending original receipt retained');
    const stat = await step(() => lstat(join(directory, name)));
    require(stat.nlink === 1 || stat.nlink === 2, 'pending original receipt has foreign link ownership');
    const content = await step(() => bytes(join(directory, name), stat.nlink));
    let value: AzureTerraformOriginalReceiptRecord;
    try {
      value = JSON.parse(content.toString());
    } catch {
      publications.push(
        await recoverOriginalPublicationFragment(
          plan,
          bootstrapByNode,
          store,
          name,
          content,
          { step, boundary, verifiedStore },
          nativeCurrent,
          signal,
        ),
      );
      continue;
    }
    exact(value, [
      'schemaVersion',
      'engine',
      'scope',
      'originalPlanSha256',
      'ownerSha256',
      'stage',
      'bootstrapSha256ByNode',
      'receiptSha256',
      'receipt',
    ]);
    const prefix = Object.fromEntries(
      Object.keys(value.bootstrapSha256ByNode).map((node) => [node, bootstrapByNode[node]]),
    );
    const record = await step(() =>
      buildAzureTerraformOriginalReceiptRecord({
        plan,
        bootstrapByNode: prefix,
        stage: value.stage,
        receipt: value.receipt,
      }),
    );
    require(same(record, value) &&
      name.startsWith(`${canonicalSha256(record)}-`) &&
      content.equals(Buffer.from(JSON.stringify(record))), 'pending original receipt provenance differs');
    publications.push(
      await step(() =>
        publishAzureTerraformOriginalReceipt(
          { plan, bootstrapByNode: prefix, stage: value.stage, receipt: value.receipt },
          store,
          signal,
        ),
      ),
    );
  }
  await verifiedStore();
  boundary();
  return publications;
}

type NativeCurrent = () => Promise<Awaited<ReturnType<TerraformRunner['readCurrentPlanJournal']>>>;
type RecoveryContext = ReturnType<typeof checkedContext>;
const fragmentsName = 'terraform-original-deployment-publication-fragments';
const pendingPattern = /^([a-f0-9]{64})-([a-f0-9-]{36})\.pending$/;
async function syncDirectory(path: string, context: RecoveryContext) {
  const handle = await context.step(() => open(path, constants.O_RDONLY));
  try {
    await context.step(() => handle.sync());
  } finally {
    await handle.close();
  }
}
async function originalFragmentRecord(
  plan: AzureCePlan,
  bootstrapByNode: Record<string, string>,
  name: string,
  fragment: Buffer,
  context: RecoveryContext,
  nativeCurrent?: NativeCurrent,
) {
  require(nativeCurrent, 'Partial pending original receipt retained: native owner reader unavailable');
  const native = structuredClone(await context.step(nativeCurrent));
  require(native.schemaVersion === 1 &&
    native.scope === 'current-saved-plan-byte-and-journal-binding' &&
    native.state === 'planned' &&
    native.receipt &&
    sha(native.manifestSha256) &&
    sha(native.journalSha256) &&
    native.savedPlanSha256 === native.receipt.planSha256 &&
    native.ordinaryRefreshEnabled ===
      true, 'Partial pending original receipt retained: native journal is unavailable or requires reconciliation');
  const candidates: AzureTerraformOriginalReceiptInput[] = [
    { plan, bootstrapByNode: {}, stage: { kind: 'foundation' }, receipt: native.receipt },
  ];
  for (let node = 1; node <= Object.keys(bootstrapByNode).length; node++)
    candidates.push({
      plan,
      bootstrapByNode: Object.fromEntries(
        Array.from({ length: node }, (_, i) => [String(i + 1), bootstrapByNode[String(i + 1)]]),
      ),
      stage: { kind: 'node-admission', node },
      receipt: native.receipt,
    });
  if (plan.intent.ingress?.mode === 'platform-http' && Object.keys(bootstrapByNode).length === plan.topology.nodeCount)
    candidates.push({ plan, bootstrapByNode, stage: { kind: 'ingress-final' }, receipt: native.receipt });
  const matches = [];
  for (const input of candidates) {
    if (hash(renderAzureTerraformFoundation(plan, input.bootstrapByNode)) !== native.receipt.configurationSha256)
      continue;
    const record = await context.step(() => buildAzureTerraformOriginalReceiptRecord(input));
    if (!name.startsWith(`${canonicalSha256(record)}-`)) continue;
    const {
      configuration: _source,
      providerLock,
      ...identity
    } = await context.step(() => azureTerraformFoundationDeployment(plan, input.bootstrapByNode));
    require(native.manifestSha256 ===
      canonicalSha256({
        ...identity,
        configurationSha256: record.receipt.configurationSha256,
        providerLockSha256: hash(providerLock),
      }), 'Partial pending original receipt retained: native manifest differs');
    const expected = Buffer.from(JSON.stringify(record));
    require(fragment.length < expected.length &&
      expected
        .subarray(0, fragment.length)
        .equals(
          fragment,
        ), 'Partial pending original receipt retained: fragment is not an exact prefix of native publication');
    matches.push({ input, record });
  }
  require(matches.length ===
    1, 'Partial pending original receipt retained: native receipt does not resolve a unique original publication');
  require(same(
    await context.step(nativeCurrent),
    native,
  ), 'Partial pending original receipt retained: native journal changed');
  return { native, ...matches[0] };
}
/** Preserve the original bytes before rebuilding an exact native-backed descriptor.
 * No apply or reconciliation is performed; submitted/foreign evidence stays unresolved.
 */
async function recoverOriginalPublicationFragment(
  plan: AzureCePlan,
  bootstrapByNode: Record<string, string>,
  store: Store,
  name: string,
  fragment: Buffer,
  context: RecoveryContext,
  nativeCurrent?: NativeCurrent,
  signal?: AbortSignal,
) {
  require(pendingPattern.test(name), 'Partial pending original receipt retained: pending name differs');
  const bound = await originalFragmentRecord(plan, bootstrapByNode, name, fragment, context, nativeCurrent),
    directory = join(store.directory, directoryName),
    pending = join(directory, name),
    published = join(directory, recordName(bound.record)),
    audit = join(store.directory, fragmentsName),
    archived = join(audit, `${name}.${hash(fragment)}.fragment`);
  const final = await context.step(() =>
    lstat(published).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }),
  );
  require(!final, 'Partial pending original receipt retained: immutable publication already exists');
  try {
    await context.step(() => privateDirectory(audit, true));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await context.step(() => privateDirectory(audit));
  }
  let stat = await context.step(() => lstat(pending));
  require(stat.nlink === 1 || stat.nlink === 2, 'Partial pending original receipt retained: link ownership differs');
  require((await context.step(() => bytes(pending, stat.nlink))).equals(
    fragment,
  ), 'Partial pending original receipt changed during recovery');
  try {
    await context.step(() => link(pending, archived));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  stat = await context.step(() => lstat(pending));
  const retained = await context.step(() => lstat(archived));
  require(stat.nlink === 2 &&
    retained.nlink === 2 &&
    retained.dev === stat.dev &&
    retained.ino === stat.ino &&
    (await context.step(() => bytes(pending, 2))).equals(fragment) &&
    (await context.step(() => bytes(archived, 2))).equals(
      fragment,
    ), 'Partial pending original receipt retained: archive collision or ownership differs');
  await syncDirectory(audit, context);
  await context.verifiedStore();
  require(same(
    await context.step(nativeCurrent as NativeCurrent),
    bound.native,
  ), 'Partial pending original receipt retained: native binding changed before rebuild');
  require((await context.step(() => bytes(pending, 2))).equals(fragment) &&
    (await context.step(() => bytes(archived, 2))).equals(
      fragment,
    ), 'Partial pending original receipt changed before preserving');
  await context.step(() => unlink(pending));
  await syncDirectory(directory, context);
  await context.verifiedStore();
  const result = await context.step(() => publishAzureTerraformOriginalReceipt(bound.input, store, signal));
  require(same(
    await context.step(nativeCurrent as NativeCurrent),
    bound.native,
  ), 'Original native publication binding changed during recovery completion');
  require((await context.step(() => bytes(published))).equals(
    Buffer.from(JSON.stringify(bound.record)),
  ), 'Recovered immutable original publication changed');
  require((await context.step(() => bytes(archived))).equals(
    fragment,
  ), 'Original preserved publication fragment changed');
  context.boundary();
  return result;
}
/** Resume a power loss after the fragment was preserved but before publication.
 * Completed recoveries keep an immutable fragment whose digest and prefix join the descriptor.
 */
async function restoreOriginalPublicationFragments(
  plan: AzureCePlan,
  bootstrapByNode: Record<string, string>,
  store: Store,
  context: RecoveryContext,
  nativeCurrent?: NativeCurrent,
) {
  const audit = join(store.directory, fragmentsName),
    directory = join(store.directory, directoryName);
  try {
    await context.step(() => privateDirectory(audit));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const name of (await context.step(() => readdir(audit))).sort()) {
    const match = /^([a-f0-9]{64}-[a-f0-9-]{36}\.pending)\.([a-f0-9]{64})\.fragment$/.exec(name);
    require(match, 'Original publication fragment namespace differs');
    const path = join(audit, name),
      stat = await context.step(() => lstat(path));
    require(stat.nlink === 1 || stat.nlink === 2, 'Original publication fragment link ownership differs');
    const fragment = await context.step(() => bytes(path, stat.nlink));
    require(hash(fragment) === match[2], 'Original publication fragment digest differs');
    const published = join(directory, `${match[1].slice(0, 64)}.json`),
      final = await context.step(() =>
        lstat(published).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        }),
      );
    if (final) {
      require(stat.nlink === 1, 'Completed original fragment has an unresolved extra link');
      const content = await context.step(() => bytes(published));
      require(fragment.length < content.length &&
        content.subarray(0, fragment.length).equals(fragment) &&
        canonicalSha256(JSON.parse(content.toString())) ===
          match[1].slice(0, 64), 'Preserved original fragment differs from immutable publication');
      continue;
    }
    const pending = join(directory, match[1]),
      pendingStat = await context.step(() =>
        lstat(pending).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        }),
      );
    if (!pendingStat) {
      await originalFragmentRecord(plan, bootstrapByNode, match[1], fragment, context, nativeCurrent);
      await context.step(() => link(path, pending));
      await syncDirectory(directory, context);
    }
    const linked = await context.step(() => lstat(pending));
    require(linked.dev === stat.dev &&
      linked.ino === stat.ino &&
      linked.nlink === 2 &&
      (await context.step(() => bytes(pending, 2))).equals(
        fragment,
      ), 'Preserved original fragment continuation differs');
  }
  context.boundary();
}

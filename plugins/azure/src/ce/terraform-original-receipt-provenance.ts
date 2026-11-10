import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import { readAzureTerraformOriginalReceiptInventory } from './terraform-original-receipt-inventory';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform original receipt provenance: ${message}`);
}
type Loaders = {
  loadSource: (sha256: string) => Promise<AzureCePlan>;
  loadOutcome: (plan: AzureCePlan) => Promise<Record<string, unknown>>;
};

/** Read-only descriptor provenance authenticated by the exact owning public outcome.
 * Native saved-journal custody, site identity and operational acceptance remain separate.
 * No enrollment string, native source, cloud operation or synthetic outcome is returned.
 */
export async function readAzureTerraformOriginalReceiptProvenance(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: Loaders,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    deadline = AbortSignal.any([AbortSignal.timeout(180_000), ...(signal ? [signal] : [])]),
    bindings = [
      { target: store, key: 'read', value: store.read },
      { target: store, key: 'verify', value: store.verify },
      { target: loaders, key: 'loadSource', value: loaders.loadSource },
      { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ];
  const requestMatches = canonicalSnapshot(plan),
    ownerMatches = canonicalSnapshot(owner);
  const seal = () => {
    deadline.throwIfAborted();
    require(requestMatches(request) &&
      ownerMatches(store.owner) &&
      store.directory === directory &&
      bindings.every((row) => Reflect.get(row.target, row.key) === row.value), 'owning request or dependency changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    let aborted: () => void = () => {};
    const failure = new Promise<never>((_, reject) => {
      aborted = () => reject(deadline.reason);
      deadline.addEventListener('abort', aborted, { once: true });
    });
    try {
      const result = await Promise.race([Promise.resolve().then(action), failure]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', aborted);
    }
  };
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'deploy' &&
    same(owner, azureUpgradeBinding(plan).owner), 'exact original deployment owner required');
  await step(() => store.verify());
  const snapshot = async () => {
    const dirs: Record<string, { identity: string; names: string[] }> = {},
      files: Record<string, { identity: string; sha256: string }> = {},
      contents = new Map<string, Buffer>(),
      fragments: Array<{ name: string; publicationSha256: string; fragmentSha256: string; fragmentBytes: number }> = [];
    const audit = join(directory, 'terraform-original-deployment-publication-fragments'),
      auditStat = await step(() =>
        lstat(audit).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        }),
      );
    for (const path of [
      directory,
      join(directory, 'terraform-original-deployment-receipts'),
      ...(auditStat ? [audit] : []),
    ]) {
      const before = await step(() => lstat(path));
      require(before.isDirectory() &&
        !before.isSymbolicLink() &&
        before.uid === process.getuid?.() &&
        (before.mode & 0o077) === 0 &&
        (await step(() => realpath(path))) === path, 'private original packet directory differs');
      const names = (await step(() => readdir(path))).sort();
      dirs[path] = { identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, names };
      for (const name of names.filter((name) => (path === directory ? name.endsWith('.json') : true))) {
        require(path === audit
          ? /^[a-f0-9]{64}-[a-f0-9-]{36}\.pending\.[a-f0-9]{64}\.fragment$/.test(name)
          : /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'original packet namespace contains unresolved evidence');
        const selected = join(path, name),
          handle = await step(() => open(selected, constants.O_RDONLY | constants.O_NOFOLLOW));
        try {
          const stat = await step(() => handle.stat());
          require(stat.isFile() &&
            stat.uid === process.getuid?.() &&
            stat.nlink === 1 &&
            (stat.mode & 0o077) === 0, 'original packet file ownership differs');
          const bytes = await step(() => handle.readFile()),
            after = await step(() => handle.stat()),
            named = await step(() => lstat(selected));
          require(after.dev === stat.dev &&
            after.ino === stat.ino &&
            after.size === stat.size &&
            after.mtimeMs === stat.mtimeMs &&
            after.ctimeMs === stat.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === stat.dev &&
            named.ino === stat.ino &&
            named.nlink === 1 &&
            named.uid === stat.uid &&
            (named.mode & 0o077) === 0, 'original packet bytes changed during native read');
          contents.set(selected, bytes);
          files[selected] = {
            identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          };
        } finally {
          await handle.close();
        }
      }
      const after = await step(() => lstat(path));
      require(after.dev === before.dev &&
        after.ino === before.ino &&
        same(names, (await step(() => readdir(path))).sort()), 'original packet namespace changed');
    }
    for (const name of dirs[audit]?.names ?? []) {
      const bytes = contents.get(join(audit, name)),
        publicationSha256 = name.slice(0, 64),
        published = contents.get(
          join(directory, 'terraform-original-deployment-receipts', `${publicationSha256}.json`),
        ),
        fragmentSha256 = name.slice(-73, -9);
      require(bytes &&
        published &&
        createHash('sha256').update(bytes).digest('hex') === fragmentSha256 &&
        bytes.length < published.length &&
        published
          .subarray(0, bytes.length)
          .equals(bytes), 'preserved original fragment digest or publication prefix differs');
      fragments.push({ name, publicationSha256, fragmentSha256, fragmentBytes: bytes.length });
    }
    return { dirs, files, fragments };
  };
  const packets = await snapshot(),
    source = await step(() => loaders.loadSource(plan.planSha256));
  verifyAzureCePlan(source);
  require(same(source, plan), 'owning original public source differs');
  const outcome = structuredClone(await step(() => loaders.loadOutcome(plan)));
  require(outcome.planId === plan.planId &&
    outcome.planSha256 === plan.planSha256 &&
    outcome.engine === 'terraform' &&
    (outcome.status === 'registered' || outcome.status === 'accepted') &&
    typeof outcome.originalReceiptInventorySha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(
      outcome.originalReceiptInventorySha256,
    ), 'completed owning original public outcome and receipt inventory binding required');
  const checkpoint = structuredClone(await step(() => store.read('terraform-workflow.json'))) as {
    schemaVersion: number;
    engine: string;
    planSha256: string;
    stage: string;
    bootstrapByNode: Record<string, string>;
    originalReceiptInventorySha256: string;
  };
  require(checkpoint.schemaVersion === 1 &&
    checkpoint.engine === 'terraform' &&
    checkpoint.planSha256 === plan.planSha256 &&
    checkpoint.stage === 'registered' &&
    same(checkpoint.originalReceiptInventorySha256, outcome.originalReceiptInventorySha256) &&
    checkpoint.bootstrapByNode &&
    typeof checkpoint.bootstrapByNode === 'object' &&
    !Array.isArray(checkpoint.bootstrapByNode), 'owning original checkpoint differs from completed public outcome');
  const inventory = await step(() =>
    readAzureTerraformOriginalReceiptInventory(plan, checkpoint.bootstrapByNode, store, deadline),
  );
  require(inventory.status === 'complete' &&
    canonicalSha256(inventory) ===
      outcome.originalReceiptInventorySha256, 'original receipt inventory differs from authenticated public outcome');
  const records = inventory.records.map((row) => row.record);
  require(records.some(
    (record) => record.stage.kind === 'foundation' && Object.keys(record.bootstrapSha256ByNode).length === 0,
  ) &&
    Array.from({ length: plan.topology.nodeCount }, (_, index) => index + 1).every((node) =>
      records.some((record) => record.stage.kind === 'node-admission' && record.stage.node === node),
    ) &&
    (plan.intent.ingress?.mode !== 'platform-http' ||
      records.some(
        (record) => record.stage.kind === 'ingress-final',
      )), 'original receipt stage inventory is incomplete');
  require(same(await step(() => loaders.loadSource(plan.planSha256)), source) &&
    same(await step(() => loaders.loadOutcome(plan)), outcome), 'owning original public source or outcome changed');
  require(same(
    await step(() => store.read('terraform-workflow.json')),
    checkpoint,
  ), 'owning original checkpoint changed');
  require(same(
    await step(() => readAzureTerraformOriginalReceiptInventory(plan, checkpoint.bootstrapByNode, store, deadline)),
    inventory,
  ), 'original receipt descriptors changed');
  require(same(await snapshot(), packets), 'original packet bytes or namespace changed across callbacks');
  seal();
  return {
    schemaVersion: 1 as const,
    scope: 'owning-original-deployment-receipt-provenance' as const,
    originalPlanSha256: plan.planSha256,
    ownerSha256: canonicalSha256(owner),
    outcomeSha256: canonicalSha256(outcome),
    checkpointSha256: canonicalSha256(checkpoint),
    receiptInventorySha256: canonicalSha256(inventory),
    receipts: inventory.records,
    publicationFragments: packets.fragments,
    owningPublicOutcomeAuthenticated: true as const,
    nativeJournalsQualified: false as const,
    siteIdentityQualified: false as const,
    operationalAcceptanceQualified: false as const,
  };
}

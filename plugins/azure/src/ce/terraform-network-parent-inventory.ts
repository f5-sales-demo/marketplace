import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from './canonical';
import { readAzureTerraformNetworkAuthenticatedPacketInventory } from './terraform-network-authenticated-packet-inventory';
import {
  authenticateAzureTerraformNetworkDestroyJournalCustody,
  qualifyAzureTerraformNetworkTerminalJournalCustody,
  recheckAzureTerraformNetworkDestroyJournalCustody,
} from './terraform-network-destroy-journal-custody';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import { captureAzureNetworkParentPublicBindings } from './terraform-network-parent-public-bindings';
import { readAzureTerraformNetworkParentPublicCustody } from './terraform-network-parent-public-custody';
import { readAzureTerraformNetworkPowerRunnerHistory } from './terraform-network-power-runner-history';
import { readAzureTerraformOriginalParentDirectoryInventory } from './terraform-original-parent-directory-inventory';
import { collectAzureTerraformParentDispositions } from './terraform-parent-disposition';
import { compileAzureTerraformTeardown } from './terraform-teardown';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const identity = (stat: { dev: number; ino: number; birthtimeMs: number }) =>
  `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
const safe = (path: string) =>
  path.split('/').every((part) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(part) && part !== '.' && part !== '..');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure network parent inventory: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value as Record<string, unknown>;
}
export interface AzureNetworkParentFile {
  path: string;
  identity: string;
  sha256: string;
  packetSha256: string;
}
export interface AzureNetworkParentDirectory {
  path: string;
  identity: string;
  names: string[];
}
export interface AzureNetworkSensitiveStagingDecision {
  path: string;
  action: 'delete';
  schema:
    | 'network-source-v1'
    | 'network-replacement-source-v1'
    | 'replacement-private-source-v1'
    | 'completed-power-preparing-v1';
  sourcePlanSha256: string;
  identity: string;
  sha256: string;
  packetSha256: string;
  semanticProvenanceSha256: string;
  payloadSha256ByField: Record<string, string>;
}
const parentMarker = 'azure-terraform-parent-artifact-retirement.json';
const terminalName = 'azure-terraform-terminal-cleanup.json';
const lockName = '.azure-terraform-lifecycle-lock';
/** Fields changed only by the owning native barrier/parent payload transformation are
 * validated separately. Every other checkpoint field remains bound to this projection.
 */
export function azureNetworkParentTerminalProjection(value: unknown) {
  const record = structuredClone(object(value));
  for (const name of [
    'phase',
    'artifacts',
    'retirementEvidence',
    'retirementEvidenceSha256',
    'retainedTerminalNetworkCustody',
    'retainedNetworkParentInventory',
    'retainedDestroyConfiguration',
    'retainedDestroyConfigurationSha256',
    'sensitiveStagingRetired',
  ])
    delete record[name];
  return canonicalSha256(record);
}
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkEmptyMainBindingContext;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
    qualifyPublishedEnvelope(
      currentContext: AzureTerraformNetworkEmptyMainBindingContext,
      signal?: AbortSignal,
    ): Promise<void>;
  }
>();

/** Private read-only enrollment before the main native barrier. Root presence never supplies
 * network authority: only owning graph/replacement/power readers supply packet names. Full
 * root custody also binds generic items, whose separate parent validators remain required.
 * The owning recheck must succeed before freezing this inventory into native evidence.
 */
export async function readAzureTerraformNetworkParentInventory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  terminalWitness: unknown,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    checkpoint = structuredClone(context.terminalCleanup),
    site = structuredClone(context.site),
    { loaders, verifier, replacementVerifier, terraform, publicSession } = context;
  const bindings = [
    { target: store, key: 'read', value: store.read },
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
  const parentContracts = context.parentContracts;
  const contracts = {
    ingress: parentContracts?.ingress,
    upgrade: parentContracts?.upgrade,
    observer: parentContracts?.observer,
  };
  const contractBindings = Object.entries(contracts).flatMap(([kind, contract]) =>
    contract
      ? (kind === 'observer'
          ? ['authenticateRetirementInventory', 'retireSigningMaterial']
          : [
              'identity',
              'publication',
              'releaseTag',
              'commit',
              'fingerprint',
              ...(kind === 'upgrade'
                ? ['build', 'observationPaths']
                : ['build', 'buildOrigin', 'projectObserved', 'projectOriginObserved']),
            ]
        ).map((key) => ({
          target: contract,
          key,
          value: Reflect.get(contract, key),
        }))
      : [],
  );
  const sealContracts = (current: AzureTerraformNetworkEmptyMainBindingContext) => {
    require(current.parentContracts === parentContracts &&
      current.parentContracts?.ingress === contracts.ingress &&
      current.parentContracts?.upgrade === contracts.upgrade &&
      current.parentContracts?.observer === contracts.observer &&
      contractBindings.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning parent contract changed');
  };
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  // These owning snapshots stay private and unchanged for the operation. Hash the expected
  // side once; every external boundary still freshly hashes its current owning inputs.
  const planSha256 = canonicalSha256({ value: plan }),
    ownerSha256 = canonicalSha256({ value: owner }),
    teardownSha256 = canonicalSha256({ value: teardown }),
    checkpointSha256 = canonicalSha256({ value: checkpoint }),
    siteSha256 = canonicalSha256({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    sealContracts(context);
    require(canonicalSha256({ value: request }) === planSha256 &&
      canonicalSha256({ value: store.owner }) === ownerSha256 &&
      store.directory === root &&
      canonicalSha256({ value: context.destroyTeardown }) === teardownSha256 &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, checkpointSha256) &&
      canonicalSha256({ value: context.site }) === siteSha256 &&
      context.loaders === loaders &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      context.terraform === terraform &&
      context.publicSession === publicSession &&
      bindings.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
  };
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(plan).owner, owner) &&
    same(
      compileAzureTerraformTeardown(plan, teardown.drain, teardown.retirement, teardown.pendingAdmissionJournalSha256),
      teardown,
    ), 'compiled original deployment or teardown differs');
  const terminal = object(terminalWitness),
    lineage = object(terminal.retainedLineage);
  require(sha(lineage.publicPlanInventorySha256) &&
    sha(lineage.requestInventorySha256) &&
    terminal.currentEmptyMainJournalCustodyQualified === true &&
    terminal.powerRunnerRetirementQualified === true &&
    terminal.mainRunnerRetirementQualified === false &&
    same(terminal.owner, owner) &&
    terminal.originalPlanSha256 === plan.planSha256 &&
    terminal.teardownPlanSha256 === teardown.planSha256 &&
    Array.isArray(terminal.retainedPowerChildren) &&
    Array.isArray(lineage.rows), 'pre-main terminal custody required');
  const checkpointRecord = object(checkpoint);
  require(checkpointRecord.phase === 'retiring' &&
    typeof checkpointRecord.retainedDestroyConfiguration === 'string' &&
    hash(checkpointRecord.retainedDestroyConfiguration) ===
      checkpointRecord.configurationSha256, 'retained source digest required for sensitive staging retirement');
  const nativeStep = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    const boundary = () => {
      active.throwIfAborted();
      sealContracts(context);
      require(store.directory === root &&
        context.loaders === loaders &&
        context.terraform === terraform &&
        context.publicSession === publicSession &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        bindings.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
    };
    boundary();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      boundary();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const snapshot = async (parent?: AbortSignal, expectedCheckpoint: unknown = checkpoint) => {
    // Native reads operate only on frozen local values. Full semantic request checks
    // surround the snapshot and every external callback; cancellation and method
    // identity checks still surround every filesystem await.
    seal();
    const directories: AzureNetworkParentDirectory[] = [],
      files: AzureNetworkParentFile[] = [];
    let terminalFile: AzureNetworkParentFile | undefined;
    const directory = async (path: string) => {
      const full = path ? join(root, path) : root,
        first = await nativeStep(() => lstat(full), parent);
      require(first.isDirectory() &&
        !first.isSymbolicLink() &&
        first.uid === process.getuid?.() &&
        (first.mode & 0o077) === 0 &&
        (await nativeStep(() => realpath(full), parent)) === full, 'private directory ownership differs');
      const names = (await nativeStep(() => readdir(full), parent))
        .filter((name) => path || (name !== parentMarker && name !== lockName))
        .sort();
      const after = await nativeStep(() => lstat(full), parent);
      require(after.isDirectory() &&
        !after.isSymbolicLink() &&
        identity(first) === identity(after) &&
        after.uid === first.uid &&
        (after.mode & 0o077) === 0, 'directory changed during read');
      const value = { path, identity: identity(first), names };
      directories.push(value);
      return value;
    };
    const file = async (path: string, fragment = false) => {
      require(safe(path), 'foreign private file path');
      const full = join(root, path),
        handle = await nativeStep(() => open(full, constants.O_RDONLY | constants.O_NOFOLLOW), parent);
      try {
        const first = await nativeStep(() => handle.stat(), parent),
          bytes = await nativeStep(() => handle.readFile(), parent),
          after = await nativeStep(() => handle.stat(), parent),
          named = await nativeStep(() => lstat(full), parent);
        require(first.isFile() &&
          first.uid === process.getuid?.() &&
          first.nlink === 1 &&
          (first.mode & 0o077) === 0 &&
          identity(first) === identity(after) &&
          first.size === after.size &&
          first.mtimeMs === after.mtimeMs &&
          first.ctimeMs === after.ctimeMs &&
          named.isFile() &&
          !named.isSymbolicLink() &&
          identity(named) === identity(first) &&
          named.nlink === 1 &&
          named.uid === first.uid &&
          (named.mode & 0o077) === 0, 'private file bytes or identity changed');
        let logical: unknown;
        try {
          logical = fragment ? undefined : JSON.parse(bytes.toString());
        } catch {
          throw Error('Azure network parent inventory: malformed JSON staging');
        }
        const item = {
          path,
          identity: identity(first),
          sha256: hash(bytes),
          packetSha256: fragment ? hash(bytes) : canonicalSha256(logical),
        };
        files.push(item);
        return logical;
      } finally {
        await handle.close();
      }
    };
    const rootDirectory = await directory('');
    for (const name of rootDirectory.names) {
      if (name === terminalName) {
        require(same(await file(name), expectedCheckpoint), 'saved terminal checkpoint differs');
        terminalFile = files.pop();
        continue;
      }
      const full = join(root, name),
        stat = await nativeStep(() => lstat(full), parent);
      if (stat.isFile()) {
        await file(name);
        continue;
      }
      require(stat.isDirectory() && !stat.isSymbolicLink(), 'foreign root entry');
      const selected = await directory(name);
      if (name === plan.deploymentName) continue; // Native main barrier owns its transition.
      if (name === 'terraform-stages') {
        for (const stage of selected.names) {
          require(safe(stage), 'foreign stage path');
          const stageDirectory = await directory(`${name}/${stage}`);
          require(stageDirectory.names.length === 1, 'stage runner is missing or ambiguous');
          const runner = stageDirectory.names[0];
          require(runner && safe(runner), 'foreign runner path');
          const runnerPath = `${name}/${stage}/${runner}`,
            runnerDirectory = await directory(runnerPath);
          require(same(runnerDirectory.names, [
            'artifact-retirement.json',
            'deployment.json',
          ]), 'unretired stage artifacts');
          for (const entry of runnerDirectory.names) await file(`${runnerPath}/${entry}`);
        }
      } else if (name === 'terraform-original-deployment-receipts') {
        for (const entry of selected.names) await file(`${name}/${entry}`);
      } else if (name === 'terraform-original-deployment-publication-fragments') {
        for (const entry of selected.names) await file(`${name}/${entry}`, true);
      }
    }
    for (const selected of directories) {
      const full = selected.path ? join(root, selected.path) : root;
      const stat = await nativeStep(() => lstat(full), parent);
      const names = (await nativeStep(() => readdir(full), parent))
        .filter((name) => selected.path || (name !== parentMarker && name !== lockName))
        .sort();
      require(identity(stat) === selected.identity && same(names, selected.names), 'namespace changed during snapshot');
    }
    seal();
    require(terminalFile, 'owning terminal checkpoint is absent');
    return {
      terminalFile,
      rootIdentity: rootDirectory.identity,
      rootNames: rootDirectory.names,
      directories: directories.sort((a, b) => a.path.localeCompare(b.path)),
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    };
  };
  await step(() => store.verify());
  // Authenticate the genuine mint before any semantic reader. This is not a freshness
  // claim: the complete owning recheck remains mandatory at enrollment completion.
  authenticateAzureTerraformNetworkDestroyJournalCustody(terminalWitness, request, store, context, deadline);
  seal();
  const authenticatedTerminal = structuredClone(terminalWitness),
    authenticatedTerminalSha256 = canonicalSha256(authenticatedTerminal);
  const first = await snapshot(),
    nativeByName = new Map(first.files.map((row) => [row.path, row]));
  const authenticated = new Map<string, string>(),
    provenance: Array<{ sourcePlanSha256: string; kind: string; sha256: string }> = [];
  const absentNetworkPackets = new Set<string>();
  const remember = (name: string, digest: string) => {
    const native = nativeByName.get(name);
    require(native &&
      native.packetSha256 === digest &&
      (!authenticated.has(name) ||
        authenticated.get(name) === digest), 'semantic packet differs from frozen native bytes');
    authenticated.set(name, digest);
  };
  const read = async (name: string) => {
    const value = await step(() => store.read(name));
    remember(name, canonicalSha256(value));
    return structuredClone(value);
  };
  const verify = () => step(() => store.verify()),
    methods = new Map<PropertyKey, { value: unknown; bound: unknown }>();
  const rejectMutation = () => {
    throw Error('Parent enrollment cannot mutate storage');
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return verify;
      if (['write', 'remove', 'retire'].includes(String(key))) return rejectMutation;
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      const cached = methods.get(key);
      if (cached && cached.value === value) return cached.bound;
      const bound = value.bind(target);
      methods.set(key, { value, bound });
      return bound;
    },
  });
  const publicBindings = captureAzureNetworkParentPublicBindings(loaders, deadline, seal);
  const semanticLoaders = publicBindings.loaders;
  // Include the original and every public request, even requests with explicit absent
  // outcomes. Owning lineage/graph readers still determine execution and provenance.
  require(same(await semanticLoaders.loadSource(plan.planSha256), plan), 'original public source differs');
  await semanticLoaders.loadOutcome(plan);
  for (const raw of lineage.rows) {
    const row = object(raw);
    require(sha(row.planSha256), 'unresolved public execution source');
    const source = await semanticLoaders.loadSource(row.planSha256);
    let absent = false;
    try {
      await semanticLoaders.loadOutcome(source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      absent = true;
    }
    require(absent ===
      (row.execution === 'unstaged-no-outcome'), 'public outcome availability differs from owning lineage');
  }
  const packetAuthorities = new Map<
    string,
    { path: string; packetSha256: string; schema: string; semanticProvenanceSha256: string }
  >();
  const sensitiveDecisions = new Map<string, AzureNetworkSensitiveStagingDecision>();
  // These decisions cover only fields authenticated by owning network/replacement/power
  // readers. Complete generic/root/stage dispositions and post-parent deletion authority
  // remain separate. A matching filename or native hash alone never enrolls a decision.
  const sensitive = async (
    name: string,
    schema: AzureNetworkSensitiveStagingDecision['schema'],
    source: AzureCePlan,
    semanticProvenanceSha256: string,
    fields: string[],
  ) => {
    const native = nativeByName.get(name),
      expected = authenticated.get(name);
    require(native &&
      expected &&
      native.packetSha256 === expected &&
      sha(semanticProvenanceSha256), 'sensitive decision lacks owning semantic and native provenance');
    const value = object(await readonlyStore.read(name));
    require(value.schemaVersion === 1 &&
      (schema === 'completed-power-preparing-v1' ? value.sourcePlanSha256 : value.planSha256) ===
        source.planSha256, 'sensitive staging source identity differs');
    const payloadSha256ByField: Record<string, string> = {};
    for (const field of fields) {
      const payload = value[field];
      if (field === 'originalGraph') {
        require(payload &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          value.graphSha256 === canonicalSha256(payload), 'sensitive original graph binding differs');
        payloadSha256ByField[field] = canonicalSha256(payload);
      } else {
        require(typeof payload === 'string', 'sensitive persisted payload schema differs');
        payloadSha256ByField[field] = hash(payload);
      }
    }
    const decision: AzureNetworkSensitiveStagingDecision = {
      path: name,
      action: 'delete',
      schema,
      sourcePlanSha256: source.planSha256,
      identity: native.identity,
      sha256: native.sha256,
      packetSha256: native.packetSha256,
      semanticProvenanceSha256,
      payloadSha256ByField,
    };
    const existing = sensitiveDecisions.get(name);
    require(!existing || same(existing, decision), 'conflicting sensitive staging decisions');
    sensitiveDecisions.set(name, decision);
  };
  const allChildren: Array<{
    networkPlanSha256: string;
    node: number;
    operation: string;
    stage: string;
    retirementSha256: string;
    proof: unknown;
  }> = [];
  for (const raw of lineage.rows) {
    const row = object(raw);
    require(['staged-network', 'completed-replacement', 'unstaged-no-outcome'].includes(
      String(row.execution),
    ), 'unqualified public lineage');
    if (row.execution === 'unstaged-no-outcome') continue;
    require(sha(row.planSha256), 'unresolved public execution source');
    const source = await step(() => semanticLoaders.loadSource(row.planSha256 as string));
    require(source.planSha256 === row.planSha256, 'loaded public execution differs');
    const packets = await step(() =>
      readAzureTerraformNetworkAuthenticatedPacketInventory(
        source,
        store,
        { loaders: semanticLoaders, site, verifier, replacementVerifier },
        deadline,
      ),
    );
    for (const packet of packets.packets) {
      remember(packet.name, packet.packetSha256);
      const authority = {
        path: packet.name,
        packetSha256: packet.packetSha256,
        schema: `${packets.kind}-owning-packet-v1`,
        semanticProvenanceSha256: packets.provenanceSha256,
      };
      const existing = packetAuthorities.get(packet.name);
      require(!existing || existing.packetSha256 === authority.packetSha256, 'owning packet authority conflicts');
      packetAuthorities.set(packet.name, authority);
    }
    for (const name of packets.absentPackets) {
      require(!nativeByName.has(name) && !first.rootNames.includes(name), 'absent network packet is published');
      absentNetworkPackets.add(name);
    }
    provenance.push({ sourcePlanSha256: source.planSha256, kind: packets.kind, sha256: packets.provenanceSha256 });
    if (row.execution === 'staged-network') {
      await sensitive(
        `${source.planId}-terraform-network-source.json`,
        'network-source-v1',
        source,
        packets.provenanceSha256,
        ['source'],
      );
    } else {
      await sensitive(
        `${source.planId}-terraform-network-replacement-source.json`,
        'network-replacement-source-v1',
        source,
        packets.provenanceSha256,
        ['source'],
      );
      await sensitive(
        `${source.planId}-terraform-replacement-source.json`,
        'replacement-private-source-v1',
        source,
        packets.provenanceSha256,
        ['source', 'bootstrap'],
      );
    }

    if (row.execution === 'staged-network') {
      const power = await step(() =>
        readAzureTerraformNetworkPowerRunnerHistory(
          source,
          readonlyStore,
          terraform,
          semanticLoaders,
          site,
          verifier,
          deadline,
          replacementVerifier,
        ),
      );
      for (const [name, packetSha256] of authenticated) {
        if (packetAuthorities.has(name)) continue;
        packetAuthorities.set(name, {
          path: name,
          packetSha256,
          schema: 'owning-network-power-history-v1',
          semanticProvenanceSha256: canonicalSha256(power),
        });
      }
      for (const child of power.rows) {
        const retired = child.retirement;
        require(child.status === 'retired' &&
          retired?.runnerRetirementQualified, 'complete native child retirement required');
        if (retired.scope === 'selected-completed-network-power-retirement-history') {
          const selected = canonicalSha256({
            planSha256: source.planSha256,
            node: retired.node,
            operation: retired.operation,
          }).slice(0, 24);
          await sensitive(
            `azure-power-completed-retirement-${selected}-preparing.json`,
            'completed-power-preparing-v1',
            source,
            canonicalSha256(retired),
            ['originalGraph'],
          );
        }
        allChildren.push({
          networkPlanSha256: source.planSha256,
          node: retired.node,
          operation: retired.operation,
          stage: child.stage,
          retirementSha256: canonicalSha256(retired),
          proof: structuredClone(retired.proof),
        });
      }
    }
  }
  allChildren.sort((a, b) => a.stage.localeCompare(b.stage));
  require(same(allChildren, terminal.retainedPowerChildren), 'retained native child identities differ');
  for (const child of allChildren) {
    const proof = object(child.proof),
      observed = object(proof.observed),
      receipt = object(observed.receipt);
    const stage = first.directories.find((row) => row.path === `terraform-stages/${child.stage}`);
    require(stage && stage.names.length === 1, 'missing child directory');
    const runner = stage.names[0];
    require(runner, 'missing child runner');
    const prefix = `${stage.path}/${runner}`;
    require(nativeByName.get(`${prefix}/artifact-retirement.json`)?.sha256 === observed.markerSha256 &&
      nativeByName.get(`${prefix}/deployment.json`)?.packetSha256 ===
        receipt.manifestSha256, 'native child marker or manifest differs');
  }
  const originalDirectories = await step(() =>
    readAzureTerraformOriginalParentDirectoryInventory(plan, store, semanticLoaders, deadline),
  );
  for (const file of originalDirectories.files) {
    require(nativeByName.get(file.path)?.sha256 === file.bytesSha256 &&
      nativeByName.get(file.path)?.identity === file.identity, 'original metadata differs from frozen directory');
  }
  const parentNative = new Map([...first.files, first.terminalFile].map((row) => [row.path, row]));
  const parentRead = async (name: string) => {
    const native = parentNative.get(name);
    require(native && !name.includes('/'), 'unaccounted generic parent packet');
    const value = await step(() => store.read(name));
    require(canonicalSha256(value) === native.packetSha256, 'generic parent record differs from native bytes');
    return structuredClone(value);
  };
  const genericStore = new Proxy(readonlyStore, {
    get(target, key) {
      return key === 'read' ? parentRead : Reflect.get(target, key);
    },
  });
  const disposition = await step(() =>
    collectAzureTerraformParentDispositions(
      plan,
      genericStore,
      { ...context, loaders: semanticLoaders },
      first,
      {
        packets: [...packetAuthorities.values()],
        sensitive: [...sensitiveDecisions.values()],
        terminal: authenticatedTerminal,
        children: allChildren,
        originalDirectories,
      },
      deadline,
      contracts,
    ),
  );
  // Reauthenticate public/source/native/child freshness after all enrollment readers,
  // before the final exhaustive snapshot and before returning any parent witness.
  await step(() =>
    recheckAzureTerraformNetworkDestroyJournalCustody(terminalWitness, request, store, context, deadline),
  );
  await step(() => publicBindings.recheck());
  const publicMapping = {
    publicBindings: publicBindings.snapshot(),
    publicPlanInventorySha256: lineage.publicPlanInventorySha256,
    requestInventorySha256: lineage.requestInventorySha256,
  };
  const publicEvidence = await step(() =>
    readAzureTerraformNetworkParentPublicCustody(request, publicSession, publicMapping, deadline),
  );
  require(same(await snapshot(), first), 'parent bytes, inode or namespace changed across enrollment');
  const body = {
    schemaVersion: 1 as const,
    scope: 'native-bound-network-parent-inventory' as const,
    owner,
    originalPlanSha256: plan.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mainDirectory: plan.deploymentName,
    ...first,
    networkPacketNames: [...authenticated.keys()].sort(),
    sensitiveStagingDecisions: [...sensitiveDecisions.values()].sort((a, b) => a.path.localeCompare(b.path)),
    ...disposition,
    absentNetworkPacketNames: [...absentNetworkPackets].sort(),
    ...publicMapping,
    publicEvidenceSnapshotSha256: publicEvidence.publicEvidenceSnapshotSha256,
    publicLineageSha256: canonicalSha256(lineage),
    provenance: provenance.sort((a, b) => a.sourcePlanSha256.localeCompare(b.sourcePlanSha256)),
    children: allChildren,
    originalDirectories: structuredClone(originalDirectories),
    terminalProjectionSha256: azureNetworkParentTerminalProjection(checkpoint),
    retainedDestroyConfigurationSha256: hash(checkpointRecord.retainedDestroyConfiguration as string),
    parentRetirementQualified: false as const,
  };
  const digest = canonicalSha256(body);
  witnesses.set(body, {
    request,
    store,
    context,
    digest,
    async qualifyPublishedEnvelope(currentContext, parent) {
      // Only this mint can derive the allowed publication. A serialized inventory or a
      // caller-provided transformed checkpoint cannot supply its authority.
      seal();
      require(canonicalSha256(body) === digest &&
        canonicalSha256(terminalWitness) ===
          authenticatedTerminalSha256, 'owning parent enrollment or terminal witness changed');
      const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
      const retirementEvidence = {
        ...object(checkpointRecord.retirementEvidence),
        terminalNetwork: structuredClone(authenticatedTerminal),
        networkParentInventory: structuredClone(body),
      };
      const publishedCheckpoint = {
        ...checkpointRecord,
        retainedTerminalNetworkCustody: structuredClone(authenticatedTerminal),
        retainedNetworkParentInventory: structuredClone(body),
        retirementEvidence,
        retirementEvidenceSha256: canonicalSha256(retirementEvidence),
      };
      const publicationSeal = () => {
        active.throwIfAborted();
        sealContracts(currentContext);
        seal();
        require(same(currentContext.terminalCleanup, publishedCheckpoint) &&
          same(currentContext.destroyTeardown, teardown) &&
          same(currentContext.site, site) &&
          currentContext.loaders === loaders &&
          currentContext.verifier === verifier &&
          currentContext.replacementVerifier === replacementVerifier &&
          currentContext.terraform === terraform &&
          currentContext.publicSession === publicSession, 'exact owning frozen-envelope publication context required');
        require(canonicalSha256(body) === digest &&
          canonicalSha256(terminalWitness) ===
            authenticatedTerminalSha256, 'owning parent enrollment or terminal witness changed');
      };
      let publishedTerminalFile: AzureNetworkParentFile | undefined;
      const checkSnapshot = async () => {
        publicationSeal();
        const current = await snapshot(active, publishedCheckpoint);
        const { terminalFile: currentTerminalFile, ...currentParent } = current;
        const { terminalFile: originalTerminalFile, ...originalParent } = first;
        require(currentTerminalFile.path === terminalName &&
          originalTerminalFile.path === terminalName &&
          same(currentParent, originalParent), 'parent bytes, inode or namespace changed across owning publication');
        require(!publishedTerminalFile ||
          same(
            currentTerminalFile,
            publishedTerminalFile,
          ), 'published terminal bytes or inode changed during qualification');
        publishedTerminalFile ??= structuredClone(currentTerminalFile);
        publicationSeal();
      };
      await checkSnapshot();
      // Freshly mint terminal/source/public/child/native custody under the new exact
      // checkpoint between exhaustive snapshots. Never replay the old empty-main witness
      // after its owning terminal file has been atomically replaced.
      publicationSeal();
      const freshTerminal = await step(
        () => qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, currentContext, active),
        parent,
      );
      publicationSeal();
      const { recordSha256: currentRecordSha256, ...currentProof } = object(freshTerminal);
      const { recordSha256: originalRecordSha256, ...originalProof } = object(authenticatedTerminal);
      require(sha(currentRecordSha256) &&
        sha(originalRecordSha256) &&
        same(currentProof, originalProof), 'terminal custody changed across owning publication');
      await step(() => publicBindings.recheck(), parent);
      await step(() => publicEvidence.recheck(parent), parent);
      await checkSnapshot();
    },
    async recheck(parent) {
      require(canonicalSha256(body) === digest, 'parent inventory witness changed');
      const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
      require(same(await snapshot(parent), first), 'parent bytes, inode or namespace changed');
      await step(
        () => recheckAzureTerraformNetworkDestroyJournalCustody(terminalWitness, request, store, context, active),
        parent,
      );
      require(same(await snapshot(parent), first), 'parent bytes, inode or namespace changed');
      await step(() => publicBindings.recheck(), parent);
      await step(() => publicEvidence.recheck(parent), parent);
      require(same(await snapshot(parent), first), 'parent bytes, inode or namespace changed');
      seal();
    },
  });
  return body;
}
export async function recheckAzureTerraformNetworkParentInventory(
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
    canonicalSha256(witness) === bound.digest, 'owning parent inventory witness required');
  await bound.recheck(signal);
}

/** Private same-call publication boundary, read-only and still under the original mint's
 * deadline. Exact pre-main bytes/inodes remain mandatory except for the internally derived
 * owning terminal envelope. This grants no native mutation or parent retirement authority.
 */
export async function qualifyAzureTerraformNetworkParentPublishedEnvelope(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  originalContext: AzureTerraformNetworkEmptyMainBindingContext,
  currentContext: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === originalContext &&
    canonicalSha256(witness) === bound.digest, 'owning parent inventory witness required');
  await bound.qualifyPublishedEnvelope(currentContext, signal);
  require(canonicalSha256(witness) === bound.digest, 'owning parent inventory witness changed');
}

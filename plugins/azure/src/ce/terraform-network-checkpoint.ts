import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import {
  buildAzureTerraformNetworkPinnedNicStage,
  buildAzureTerraformNetworkRoutingStage,
} from './terraform-network-routing';
import type { AzureTerraformNetworkSourceBinding } from './terraform-network-source-binding';
import {
  type AzureTerraformNetworkNodeHistoryPhase,
  readAzureTerraformNetworkNodeHistory,
} from './terraform-network-stage-history';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type History = Awaited<ReturnType<typeof readAzureTerraformNetworkNodeHistory>>;
type Phase = 'prepared' | AzureTerraformNetworkNodeHistoryPhase | 'accepted';
export interface AzureTerraformNetworkAcceptanceIdentity {
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  node: number;
  siteName: string;
  siteUid: string;
  siteConfigurationSha256: string;
  configurationSha256: string;
  inventory: AzureNetworkUpdateInventory;
}
export interface AzureTerraformNetworkAcceptanceVerification {
  status: 'verified';
  scope: 'node-interfaces-routing-traffic';
  evidenceSha256: string;
}
/** The owning operational observer must authenticate evidence and join every expected identity.
 * Current mode also requires current node/interface/routing/traffic acceptance. Historical mode
 * verifies the original acceptance provenance; saved collection times are never heartbeat evidence.
 */
export type AzureTerraformNetworkAcceptanceVerifier = (
  receipt: unknown,
  identity: AzureTerraformNetworkAcceptanceIdentity,
  mode: 'current' | 'historical',
  signal?: AbortSignal,
) => Promise<AzureTerraformNetworkAcceptanceVerification>;
interface NodeRow {
  node: number;
  before: AzureNetworkUpdateInventory;
  phase: Phase;
  history?: History;
  acceptance?: { receipt: unknown; verification: AzureTerraformNetworkAcceptanceVerification };
}
interface Transition {
  kind: 'stage' | 'accept' | 'prepare';
  node: number;
  payloadSha256: string;
}
interface Checkpoint {
  schemaVersion: 1;
  kind: 'azure-terraform-network-serial-checkpoint';
  engine: 'terraform';
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  sourceBindingSha256: string;
  nodes: NodeRow[];
  revision: number;
  previousCheckpointSha256: string | null;
  lastTransition: Transition | null;
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const same = canonicalEqual;
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network checkpoint: ${message}`);
}
function keys(value: unknown, expected: string[]): void {
  require(value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    same(Object.keys(value).sort(), expected.toSorted()), 'saved schema differs');
}
async function optional(store: CeDeploymentStore, name: string): Promise<unknown | undefined> {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Internal private controller state. Open only with the original binding returned by the qualified
 * source binder. It never mutates Terraform/cloud resources or publishes private source to tools.
 * Each stage must have actual owning executor history; advancing nodes requires the trusted observer.
 */
export class AzureTerraformNetworkCheckpoint {
  private constructor(
    private readonly plan: AzureCePlan,
    private readonly binding: AzureTerraformNetworkSourceBinding,
    private readonly store: CeDeploymentStore,
    private readonly qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier,
  ) {}
  private get name() {
    return `${this.plan.planId}-terraform-network-driver-checkpoint.json`;
  }
  private get rootName() {
    return `${this.plan.planId}-terraform-network-driver-root.json`;
  }
  private revisionName(revision: number) {
    return `${this.plan.planId}-terraform-network-driver-revision-${revision}.json`;
  }
  private async publishRevision(value: Checkpoint, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const name = this.revisionName(value.revision),
      saved = await optional(this.store, name);
    if (saved !== undefined) require(same(saved, value), 'immutable revision differs from proposed transition');
    else await this.store.write(name, value);
    signal?.throwIfAborted();
  }
  private async verifyRevisions(value: Checkpoint, signal?: AbortSignal) {
    let previous = this.initial();
    const hashes: Record<string, string> = {};
    for (let revision = 0; revision <= value.revision; revision++) {
      signal?.throwIfAborted();
      const name = this.revisionName(revision),
        input = await this.store.read(name);
      hashes[name] = canonicalSha256(input);
      if (revision === 0) require(same(input, previous), 'original revision differs');
      else {
        keys(input, Object.keys(previous));
        const next = input as Checkpoint,
          transition = next.lastTransition;
        require(next.revision === revision &&
          next.previousCheckpointSha256 === canonicalSha256(previous) &&
          transition, 'immutable revision chain differs');
        keys(transition, ['kind', 'node', 'payloadSha256']);
        const expected = structuredClone(previous),
          last = expected.nodes.at(-1) as NodeRow;
        const proposed = next.nodes?.at(-1);
        require(proposed && transition.node === proposed.node, 'revision selected node differs');
        if (transition.kind === 'prepare') {
          require(last.phase === 'accepted' &&
            proposed.node === last.node + 1 &&
            proposed.phase === 'prepared' &&
            proposed.history === undefined &&
            proposed.acceptance === undefined, 'revision predecessor is not accepted');
          expected.nodes.push(structuredClone(proposed));
        } else {
          require(proposed.node === last.node &&
            same(proposed.before, last.before), 'revision changed original node boundary');
          if (transition.kind === 'stage') {
            require(['prepared', 'deallocated', 'nic-complete', 'restarted'].indexOf(last.phase) ===
              ['deallocated', 'nic-complete', 'restarted', 'routing-complete'].indexOf(proposed.phase) &&
              proposed.history &&
              proposed.acceptance === undefined, 'revision skipped a stage');
            last.phase = proposed.phase;
            last.history = structuredClone(proposed.history);
          } else {
            require(transition.kind === 'accept' &&
              last.phase === 'routing-complete' &&
              proposed.phase === 'accepted' &&
              same(proposed.history, last.history) &&
              proposed.acceptance, 'revision acceptance boundary differs');
            last.phase = 'accepted';
            last.acceptance = structuredClone(proposed.acceptance);
          }
        }
        expected.revision++;
        expected.previousCheckpointSha256 = canonicalSha256(previous);
        expected.lastTransition = structuredClone(transition);
        require(same(next, expected), 'revision changed an unrelated serial boundary');
        previous = structuredClone(next);
      }
    }
    require(same(previous, value), 'checkpoint differs from immutable revision');
    for (const [name, digest] of Object.entries(hashes)) {
      signal?.throwIfAborted();
      require(canonicalSha256(await this.store.read(name)) === digest, 'revision changed during validation');
    }
  }
  private initial(): Checkpoint {
    return {
      schemaVersion: 1,
      kind: 'azure-terraform-network-serial-checkpoint',
      engine: 'terraform',
      owner: structuredClone(this.store.owner),
      planSha256: this.plan.planSha256,
      sourceBindingSha256: canonicalSha256(this.binding),
      nodes: [{ node: 1, before: structuredClone(this.binding.before), phase: 'prepared' }],
      revision: 0,
      previousCheckpointSha256: null,
      lastTransition: null,
    };
  }
  private async verifyBinding(signal?: AbortSignal) {
    signal?.throwIfAborted();
    await this.store.verify();
    require(same(this.store.owner, azureUpgradeBinding(this.plan).owner) &&
      same(this.binding.owner, this.store.owner) &&
      this.binding.planSha256 === this.plan.planSha256 &&
      this.binding.kind === 'azure-terraform-network-original-source' &&
      this.binding.engine === 'terraform' &&
      this.binding.schemaVersion === 1 &&
      hash(this.binding.source) === this.binding.sourceConfigurationSha256 &&
      same(
        await this.store.read(`${this.plan.planId}-terraform-network-source.json`),
        this.binding,
      ), 'frozen original source binding differs');
    validateAzureNetworkUpdateInventory(this.plan, this.binding.before);
  }
  private async noStagePublication(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const names = await readdir(this.store.directory);
    require(!names.some((name) =>
      name.startsWith(`${this.plan.planId}-terraform-network-node-`),
    ), 'missing root checkpoint after stage publication');
  }
  /** Inspect existing immutable history without creating roots, revisions, checkpoints or locks. */
  static async inspect(
    plan: AzureCePlan,
    binding: AzureTerraformNetworkSourceBinding,
    store: CeDeploymentStore,
    qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    verifyAzureCePlan(plan);
    require(plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      typeof qualifyAcceptance === 'function', 'owning existing network history and operational verifier required');
    return new AzureTerraformNetworkCheckpoint(
      structuredClone(plan),
      structuredClone(binding),
      store,
      qualifyAcceptance,
    ).load(signal);
  }
  static async open(
    plan: AzureCePlan,
    binding: AzureTerraformNetworkSourceBinding,
    store: CeDeploymentStore,
    qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    verifyAzureCePlan(plan);
    require(plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      typeof qualifyAcceptance === 'function', 'owning network plan and operational verifier required');
    const instance = new AzureTerraformNetworkCheckpoint(
      structuredClone(plan),
      structuredClone(binding),
      store,
      qualifyAcceptance,
    );
    const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-checkpoint-lock`);
    try {
      await instance.verifyBinding(signal);
      const initial = instance.initial(),
        root = { schemaVersion: 1, initialCheckpointSha256: canonicalSha256(initial) };
      const savedRoot = await optional(store, instance.rootName),
        saved = await optional(store, instance.name);
      if (savedRoot === undefined) {
        require(saved === undefined, 'root marker missing after checkpoint publication');
        await instance.noStagePublication(signal);
        signal?.throwIfAborted();
        await store.write(instance.rootName, root);
      } else require(same(savedRoot, root), 'root marker differs');
      if (saved === undefined) {
        await instance.noStagePublication(signal);
        signal?.throwIfAborted();
        await instance.publishRevision(initial, signal);
        await store.write(instance.name, initial);
      }
      await instance.load(signal);
      return instance;
    } finally {
      await unlock();
    }
  }
  private appliedBefore(node: number) {
    return Array.from({ length: node - 1 }, (_, i) => this.plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  }
  private before(value: AzureNetworkUpdateInventory, node: number) {
    const applied = this.appliedBefore(node);
    verifyAzureNetworkUpdateProgress(this.plan, this.binding.before, value, applied);
    for (const [owner, vm] of Object.entries(this.binding.before.nodes))
      for (const [index, nic] of Object.entries(vm.nics))
        if (!applied.includes(`${owner}:${index}`))
          require(value.nodes[owner].nics[index].privateIp === nic.privateIp, 'unsubmitted private IP changed');
  }
  private identity(row: NodeRow): AzureTerraformNetworkAcceptanceIdentity {
    require(row.history?.phase ===
      'routing-complete', 'routing completion history required for operational acceptance');
    return {
      owner: structuredClone(this.store.owner),
      planSha256: this.plan.planSha256,
      node: row.node,
      siteName: this.plan.siteName,
      siteUid: this.binding.qualification.siteUid,
      siteConfigurationSha256: this.binding.qualification.siteConfigurationSha256,
      configurationSha256: row.history.configurationSha256,
      inventory: structuredClone(row.history.inventory),
    };
  }
  private async verification(receipt: unknown, row: NodeRow, mode: 'current' | 'historical', signal?: AbortSignal) {
    signal?.throwIfAborted();
    const verification = await this.qualifyAcceptance(structuredClone(receipt), this.identity(row), mode, signal);
    signal?.throwIfAborted();
    keys(verification, ['status', 'scope', 'evidenceSha256']);
    require(verification.status === 'verified' &&
      verification.scope === 'node-interfaces-routing-traffic' &&
      sha(verification.evidenceSha256), 'complete verified operational scope required');
    return structuredClone(verification);
  }
  private async validate(input: unknown, signal?: AbortSignal) {
    keys(input, [
      'schemaVersion',
      'kind',
      'engine',
      'owner',
      'planSha256',
      'sourceBindingSha256',
      'nodes',
      'revision',
      'previousCheckpointSha256',
      'lastTransition',
    ]);
    const value = input as Checkpoint;
    require(value.schemaVersion === 1 &&
      value.kind === 'azure-terraform-network-serial-checkpoint' &&
      value.engine === 'terraform' &&
      same(value.owner, this.store.owner) &&
      value.planSha256 === this.plan.planSha256 &&
      value.sourceBindingSha256 === canonicalSha256(this.binding) &&
      Array.isArray(value.nodes) &&
      value.nodes.length >= 1 &&
      value.nodes.length <= this.plan.topology.nodeCount &&
      Number.isInteger(value.revision) &&
      value.revision >= 0, 'checkpoint owner/order identity differs');
    let revision = value.nodes.length - 1,
      source = this.binding.source;
    for (const [i, row] of value.nodes.entries()) {
      signal?.throwIfAborted();
      keys(row, [
        'node',
        'before',
        'phase',
        ...(row.history !== undefined ? ['history'] : []),
        ...(row.acceptance !== undefined ? ['acceptance'] : []),
      ]);
      require(row.node === i + 1 &&
        ['prepared', 'deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'].includes(row.phase) &&
        (i === value.nodes.length - 1 || row.phase === 'accepted'), 'complete accepted serial prefix required');
      this.before(row.before, row.node);
      if (i === 0) require(same(row.before, this.binding.before), 'node one differs from original source inventory');
      const stage = buildAzureTerraformNetworkPinnedNicStage(this.plan, source, row.before, row.node);
      if (row.phase === 'prepared')
        require(row.history === undefined && row.acceptance === undefined, 'prepared node contains completion');
      else {
        const phase = row.phase === 'accepted' ? 'routing-complete' : row.phase;
        const history = await readAzureTerraformNetworkNodeHistory(
          this.plan,
          source,
          row.before,
          row.node,
          phase,
          this.store,
          signal,
        );
        require(same(row.history, history), 'persisted stage history differs');
        if (row.phase === 'accepted') {
          keys(row.acceptance, ['receipt', 'verification']);
          require(same(
            row.acceptance?.verification,
            await this.verification(row.acceptance?.receipt, row, 'historical', signal),
          ), 'operational acceptance provenance differs');
        } else require(row.acceptance === undefined, 'unaccepted stage contains acceptance');
      }
      revision += ['prepared', 'deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'].indexOf(
        row.phase,
      );
      if (row.phase === 'accepted') {
        require(row.history, 'accepted routing inventory required');
        source = buildAzureTerraformNetworkRoutingStage(
          this.plan,
          source,
          row.before,
          row.history.inventory,
          row.node,
        ).releasedConfiguration;
      } else source = stage.configuration;
    }
    require(value.revision === revision, 'checkpoint revision differs from serial progress');
    if (revision === 0) require(same(value, this.initial()), 'initial checkpoint differs');
    else {
      keys(value.lastTransition, ['kind', 'node', 'payloadSha256']);
      const t = value.lastTransition as Transition,
        last = value.nodes.at(-1) as NodeRow;
      require(sha(value.previousCheckpointSha256) &&
        sha(t.payloadSha256) &&
        t.node === last.node &&
        t.kind === (last.phase === 'prepared' ? 'prepare' : last.phase === 'accepted' ? 'accept' : 'stage') &&
        t.payloadSha256 ===
          canonicalSha256(
            last.phase === 'prepared' ? last.before : last.phase === 'accepted' ? last.acceptance?.receipt : last.phase,
          ), 'last transition differs');
    }
    return structuredClone(value);
  }
  private async load(signal?: AbortSignal) {
    await this.verifyBinding(signal);
    require(same(await this.store.read(this.rootName), {
      schemaVersion: 1,
      initialCheckpointSha256: canonicalSha256(this.initial()),
    }), 'root marker differs');
    const input = await this.store.read(this.name),
      checkpointSha256 = canonicalSha256(input);
    const checkpoint = await this.validate(input, signal);
    await this.verifyRevisions(checkpoint, signal);
    await this.verifyBinding(signal);
    require(canonicalSha256(await this.store.read(this.name)) ===
      checkpointSha256, 'checkpoint changed during validation');
    return this.snapshot(checkpoint, checkpointSha256);
  }
  private snapshot(checkpoint: Checkpoint, checkpointSha256: string) {
    let nodeSource = this.binding.source;
    for (const row of checkpoint.nodes.slice(0, -1)) {
      require(row.history?.phase === 'routing-complete', 'accepted predecessor routing history required');
      nodeSource = buildAzureTerraformNetworkRoutingStage(
        this.plan,
        nodeSource,
        row.before,
        row.history.inventory,
        row.node,
      ).releasedConfiguration;
    }
    const current = checkpoint.nodes.at(-1) as NodeRow;
    const stage = buildAzureTerraformNetworkPinnedNicStage(this.plan, nodeSource, current.before, current.node);
    const routed = ['routing-complete', 'accepted'].includes(current.phase);
    require(!routed || current.history, 'completed routing identity required');
    const configurationSha256 =
      routed && current.history
        ? buildAzureTerraformNetworkRoutingStage(
            this.plan,
            nodeSource,
            current.before,
            current.history.inventory,
            current.node,
          ).releasedConfigurationSha256
        : ['prepared', 'deallocated'].includes(current.phase)
          ? hash(nodeSource)
          : stage.configurationSha256;
    return {
      checkpoint,
      checkpointSha256,
      currentNode: current.node,
      phase: current.phase,
      nodeSource,
      configurationSha256,
      allNodesAccepted: current.node === this.plan.topology.nodeCount && current.phase === 'accepted',
    };
  }
  async read(signal?: AbortSignal) {
    return this.load(signal);
  }
  private async change(
    expectedSha256: string,
    transition: Transition,
    mutate: (row: Checkpoint, source: string) => Promise<void>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    require(sha(expectedSha256), 'resolved expected checkpoint digest required');
    const unlock = await acquireProcessLock(`${this.store.directory}/.terraform-network-checkpoint-lock`);
    try {
      const current = await this.load(signal);
      if (current.checkpointSha256 !== expectedSha256) {
        require(current.checkpoint.previousCheckpointSha256 === expectedSha256 &&
          same(current.checkpoint.lastTransition, transition), 'stale checkpoint comparison');
        return current;
      }
      // A revision packet can be durable even when its checkpoint-pointer write never completed.
      // Resume that exact transition using historical qualification, including accepted evidence,
      // rather than requiring a fresh current acceptance for an already recorded decision.
      const pending = await optional(this.store, this.revisionName(current.checkpoint.revision + 1));
      if (pending !== undefined) {
        const next = await this.validate(pending, signal);
        require(next.previousCheckpointSha256 === expectedSha256 &&
          same(next.lastTransition, transition), 'pending immutable revision belongs to another transition');
        await this.verifyRevisions(next, signal);
        await this.verifyBinding(signal);
        require(canonicalSha256(await this.store.read(this.name)) ===
          expectedSha256, 'checkpoint changed before recovery publication');
        signal?.throwIfAborted();
        await this.store.write(this.name, next);
        signal?.throwIfAborted();
        return this.load(signal);
      }
      const next = structuredClone(current.checkpoint);
      await mutate(next, current.nodeSource);
      next.revision++;
      next.previousCheckpointSha256 = expectedSha256;
      next.lastTransition = transition;
      await this.validate(next, signal);
      await this.verifyBinding(signal);
      require(canonicalSha256(await this.store.read(this.name)) ===
        expectedSha256, 'checkpoint changed before publication');
      signal?.throwIfAborted();
      await this.publishRevision(next, signal);
      await this.store.write(this.name, next);
      signal?.throwIfAborted();
      return this.load(signal);
    } finally {
      await unlock();
    }
  }
  async recordStage(
    expectedSha256: string,
    node: number,
    phase: AzureTerraformNetworkNodeHistoryPhase,
    signal?: AbortSignal,
  ) {
    return this.change(
      expectedSha256,
      { kind: 'stage', node, payloadSha256: canonicalSha256(phase) },
      async (next, source) => {
        const row = next.nodes.at(-1) as NodeRow;
        require(row.node === node &&
          ['prepared', 'deallocated', 'nic-complete', 'restarted'].indexOf(row.phase) ===
            ['deallocated', 'nic-complete', 'restarted', 'routing-complete'].indexOf(
              phase,
            ), 'next selected serial stage required');
        row.history = await readAzureTerraformNetworkNodeHistory(
          this.plan,
          source,
          row.before,
          node,
          phase,
          this.store,
          signal,
        );
        row.phase = phase;
      },
      signal,
    );
  }
  async acceptNode(expectedSha256: string, node: number, receipt: unknown, signal?: AbortSignal) {
    return this.change(
      expectedSha256,
      { kind: 'accept', node, payloadSha256: canonicalSha256(receipt) },
      async (next) => {
        const row = next.nodes.at(-1) as NodeRow;
        require(row.node === node && row.phase === 'routing-complete', 'selected routing-complete node required');
        row.acceptance = {
          receipt: structuredClone(receipt),
          verification: await this.verification(receipt, row, 'current', signal),
        };
        row.phase = 'accepted';
      },
      signal,
    );
  }
  async prepareNextNode(expectedSha256: string, before: AzureNetworkUpdateInventory, signal?: AbortSignal) {
    const current = await this.read(signal);
    const node =
      current.checkpoint.previousCheckpointSha256 === expectedSha256 &&
      current.checkpoint.lastTransition?.kind === 'prepare'
        ? current.checkpoint.lastTransition.node
        : current.currentNode + 1;
    return this.change(
      expectedSha256,
      { kind: 'prepare', node, payloadSha256: canonicalSha256(before) },
      async (next) => {
        const last = next.nodes.at(-1) as NodeRow;
        require(last.phase === 'accepted' &&
          node === last.node + 1 &&
          node <= this.plan.topology.nodeCount, 'accepted predecessor and next node required');
        this.before(before, node);
        next.nodes.push({ node, before: structuredClone(before), phase: 'prepared' });
      },
      signal,
    );
  }
}

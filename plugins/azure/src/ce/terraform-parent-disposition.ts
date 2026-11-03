import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyRetainedCleanup } from '../../../terraform/src/independent-cleanup';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { type AzureCeFailoverPlan, verifyAzureCeFailoverPlan } from './failover';
import {
  isAzureFailoverHistoricalArtifact,
  verifyAzureFailoverHistoricalArtifacts,
} from './failover-artifact-provenance';
import { isAzureIngressHistoricalArtifact, verifyAzureIngressHistoricalArtifacts } from './ingress-artifact-provenance';
import { collectAzureOperationalParentDispositions } from './network-operational-parent-disposition';
import { collectAzureReplacementOperationalParentDispositions } from './network-replacement-operational-parent-disposition';
import { collectAzureReplacementReadingsOperationalParentDispositions } from './network-replacement-readings-parent-disposition';
import { azureRelayHistoricalArtifacts, verifyAzureRelayHistoricalArtifacts } from './relay-artifact-provenance';
import { azureTerraformFailoverDeployment, validateAzureTerraformFailoverRetirement } from './terraform-failover';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import {
  type AzureTerraformNetworkEmptyMainBindingContext,
  qualifyAzureTerraformNetworkEmptyMainBinding,
} from './terraform-network-empty-main-binding';
import type {
  AzureNetworkParentDirectory,
  AzureNetworkParentFile,
  AzureNetworkSensitiveStagingDecision,
} from './terraform-network-parent-inventory';
import { readAzureTerraformOriginalReceiptProvenance } from './terraform-original-receipt-provenance';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { readAzureTerraformPendingImportProvenance } from './terraform-pending-import-provenance';
import {
  isAzureTerraformReplacementHistoricalArtifact,
  verifyAzureTerraformReplacementHistoricalArtifacts,
} from './terraform-replacement-artifact-provenance';
import { type AzureTerraformUpgrade, azureUpgradeBinding } from './terraform-upgrade';
import { verifyAzureTerraformUpgradeHistoricalArtifacts } from './terraform-upgrade-artifact-provenance';
import { readAzureTerraformUpgradeStageRetirement } from './terraform-upgrade-retirement';
import type { AzureCePlan } from './types';

const hash = (input: string | Uint8Array) => createHash('sha256').update(input).digest('hex');
const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure parent disposition: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete schema record required');
  return value as Record<string, unknown>;
}
function keys(value: unknown, fields: string[]) {
  require(same(Object.keys(object(value)).sort(), fields.toSorted()), 'record fields differ');
}
function timestamp(value: unknown) {
  require(typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now(), 'historical timestamp differs');
}
export interface AzureParentArtifactDecision extends AzureNetworkParentFile {
  action: 'preserve' | 'delete' | 'owning-transition';
  schema: string;
  semanticProvenanceSha256: string;
  payloadSha256ByField?: Record<string, string>;
}
export interface AzureParentDirectoryDecision extends AzureNetworkParentDirectory {
  action: 'preserve' | 'owning-transition';
  schema: string;
}
export interface AzureParentDispositionAuthority {
  packets: Array<{ path: string; packetSha256: string; schema: string; semanticProvenanceSha256: string }>;
  sensitive: AzureNetworkSensitiveStagingDecision[];
  terminal: unknown;
  children: Array<{ stage: string; retirementSha256: string; proof: unknown }>;
  originalDirectories: {
    provenanceSha256: string;
    files: Array<{ path: string; identity: string; bytesSha256: string }>;
  };
}
/** Internal read-only semantic collector. The caller authenticates the owning network
 * mints and seals native bytes/identities around this call. Authority paths are exact
 * validator outputs, never a root allowlist or an instruction to delete every read packet.
 * This does not perform retirement, establish absence or qualify operational acceptance.
 */
export function validateAzureTerraformParentTeardownReceipt(
  raw: unknown,
  base: AzureCePlan,
  teardown: AzureTerraformNetworkEmptyMainBindingContext['destroyTeardown'],
  final: unknown,
) {
  const receipt = object(raw),
    destroy = object(final);
  keys(receipt, [
    'status',
    'sourcePlanSha256',
    'teardownPlanSha256',
    'finalPlanSha256',
    'cloud',
    'sites',
    'observedAt',
  ]);
  require(receipt.status === 'retired' &&
    receipt.sourcePlanSha256 === base.planSha256 &&
    receipt.teardownPlanSha256 === teardown.planSha256 &&
    receipt.cloud === 'absent' &&
    receipt.sites === 'deleted' &&
    sha(receipt.finalPlanSha256) &&
    receipt.finalPlanSha256 === destroy.planSha256 &&
    destroy.operation === 'destroy' &&
    destroy.noChanges === true &&
    Array.isArray(destroy.changes) &&
    destroy.changes.length === 0, 'completed teardown receipt differs from owning final destroy');
  timestamp(receipt.observedAt);
  return receipt;
}
export async function collectAzureTerraformParentDispositions(
  base: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  snapshot: {
    files: AzureNetworkParentFile[];
    directories: AzureNetworkParentDirectory[];
    terminalFile: AzureNetworkParentFile;
  },
  authority: AzureParentDispositionAuthority,
  signal?: AbortSignal,
  contracts: NonNullable<AzureTerraformNetworkEmptyMainBindingContext['parentContracts']> = {},
) {
  signal?.throwIfAborted();
  const teardown = context.destroyTeardown,
    binding = azureUpgradeBinding(base),
    owner = binding.owner;
  require(base.engine === 'terraform' &&
    same(store.owner, owner) &&
    teardown.sourcePlanSha256 === base.planSha256 &&
    teardown.retirement.length === 1 &&
    teardown.retirement[0].siteName === base.siteName &&
    teardown.retirement[0].siteUid === context.site.siteUid, 'owning source or logical site differs');
  const files = [...snapshot.files, snapshot.terminalFile],
    byPath = new Map(files.map((file) => [file.path, file]));
  require(byPath.size === files.length, 'duplicate native file');
  const records = new Map<string, unknown>();
  for (const file of files.filter((file) => !file.path.includes('/'))) {
    signal?.throwIfAborted();
    const value = await store.read(file.path);
    require(canonicalSha256(value) === file.packetSha256, 'semantic record differs from native snapshot');
    records.set(file.path, structuredClone(value));
  }
  const decisions = new Map<string, AzureParentArtifactDecision>();
  const decide = (
    path: string,
    action: AzureParentArtifactDecision['action'],
    schema: string,
    provenance: unknown,
    payloadSha256ByField?: Record<string, string>,
  ) => {
    const file = byPath.get(path);
    require(file && schema.length > 0, 'decision lacks exact native file or schema');
    const decision: AzureParentArtifactDecision = {
      ...file,
      action,
      schema,
      semanticProvenanceSha256: canonicalSha256(provenance),
      ...(payloadSha256ByField ? { payloadSha256ByField } : {}),
    };
    require(!decisions.has(path), 'conflicting or duplicate semantic decision');
    decisions.set(path, decision);
  };
  const original = await readAzureTerraformOriginalReceiptProvenance(base, store, context.loaders, signal);
  require(canonicalSha256(original) ===
    authority.originalDirectories.provenanceSha256, 'original receipt directory authority differs');
  const outcome = await context.loaders.loadOutcome(base);
  require(canonicalSha256(outcome) === original.outcomeSha256, 'original public outcome differs');
  const rootGeneric = new Set<string>();
  const generic = (
    path: string,
    action: AzureParentArtifactDecision['action'],
    schema: string,
    provenance: unknown,
    payload?: Record<string, string>,
  ) => {
    rootGeneric.add(path);
    decide(path, action, schema, provenance, payload);
  };
  if (contracts.observer) {
    const observer = await collectAzureOperationalParentDispositions(
      base,
      store,
      context.publicSession,
      files,
      contracts.observer,
      signal,
    );
    for (const file of observer) {
      generic(file.path, file.action, file.schema, { observer: file.semanticProvenanceSha256 });
      const decision = decisions.get(file.path);
      require(decision, 'owning observer decision missing');
      decision.semanticProvenanceSha256 = file.semanticProvenanceSha256;
    }
  }
  if (contracts.replacementObserver) {
    const observer = await collectAzureReplacementOperationalParentDispositions(
      base,
      store,
      context.publicSession,
      files,
      contracts.replacementObserver,
      signal,
    );
    for (const file of observer) {
      generic(file.path, file.action, file.schema, { observer: file.semanticProvenanceSha256 });
      const decision = decisions.get(file.path);
      require(decision, 'owning replacement observer decision missing');
      decision.semanticProvenanceSha256 = file.semanticProvenanceSha256;
    }
  }
  if (contracts.replacementReadingsObserver) {
    const observer = await collectAzureReplacementReadingsOperationalParentDispositions(
      base,
      store,
      context.publicSession,
      files,
      contracts.replacementReadingsObserver,
      signal,
    );
    for (const file of observer) {
      generic(file.path, file.action, file.schema, { observer: file.semanticProvenanceSha256 });
      const decision = decisions.get(file.path);
      require(decision, 'owning replacement readings observer decision missing');
      decision.semanticProvenanceSha256 = file.semanticProvenanceSha256;
    }
  }
  const record = (name: string) => object(records.get(name));
  keys(record('owner.json'), ['schemaVersion', 'owner']);
  require(same(record('owner.json'), { schemaVersion: 2, owner }), 'owner manifest differs');
  generic('owner.json', 'preserve', 'ce-owner-v2', { owner });
  require(same(
    records.get('azure-terraform-terminal-cleanup.json'),
    context.terminalCleanup,
  ), 'owning terminal checkpoint differs');
  generic(
    'azure-terraform-terminal-cleanup.json',
    'owning-transition',
    'terraform-terminal-cleanup-v1',
    authority.terminal,
  );
  require(same(records.get(`${teardown.planId}.json`), teardown), 'saved compiled teardown differs');
  generic(`${teardown.planId}.json`, 'preserve', 'terraform-teardown-plan', teardown);
  require(same(records.get(`${teardown.planId}-authorization.json`), {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  }), 'teardown authorization differs');
  generic(`${teardown.planId}-authorization.json`, 'preserve', 'terraform-teardown-authorization-v1', teardown);
  require(same(records.get('azure-terraform-lifecycle-retirement.json'), {
    schemaVersion: 1,
    engine: 'terraform',
    owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    kind: teardown.kind,
  }), 'lifecycle retirement differs');
  generic('azure-terraform-lifecycle-retirement.json', 'preserve', 'terraform-lifecycle-retirement-v1', teardown);
  const terminal = object(authority.terminal);
  require(terminal.destroyJournalCustodyQualified === true &&
    terminal.publicJournalCustodyQualified === true &&
    terminal.currentEmptyMainJournalCustodyQualified === true &&
    same(terminal.owner, owner) &&
    terminal.originalPlanSha256 === base.planSha256 &&
    terminal.teardownPlanSha256 === teardown.planSha256 &&
    Array.isArray(terminal.consumed), 'owning terminal native journal authority required');
  for (const [name, phase] of [
    ['azure-terraform-cloud-destroy-plan.json', 'destroy'],
    ['azure-terraform-cloud-destroy-final.json', 'final'],
  ] as const) {
    const receipt = record(name),
      joins = terminal.consumed.map(object).filter((row) => row.phase === phase);
    require(joins.length === 1 &&
      joins[0].receiptSha256 === canonicalSha256(receipt) &&
      sha(joins[0].historySha256), 'destroy receipt lacks owning native application provenance');
    generic(name, 'preserve', 'terraform-native-destroy-receipt-v1', joins[0]);
  }
  if (records.has('azure-terraform-teardown-receipt.json')) {
    const receipt = record('azure-terraform-teardown-receipt.json');
    validateAzureTerraformParentTeardownReceipt(
      receipt,
      base,
      teardown,
      record('azure-terraform-cloud-destroy-final.json'),
    );
    generic('azure-terraform-teardown-receipt.json', 'preserve', 'terraform-completed-teardown-receipt-v1', {
      receipt,
      terminal: authority.terminal,
    });
  }
  const workflow = record('terraform-workflow.json');
  require(canonicalSha256(workflow) ===
    original.checkpointSha256, 'original workflow differs from owning completed public outcome');
  const bootstrap = object(workflow.bootstrapByNode),
    payload: Record<string, string> = {};
  for (const [node, value] of Object.entries(bootstrap)) {
    require(/^[1-3]$/.test(node) &&
      Number(node) <= base.topology.nodeCount &&
      typeof value === 'string', 'workflow bootstrap schema differs');
    payload[`bootstrapByNode.${node}`] = hash(value);
  }
  generic('terraform-workflow.json', 'delete', 'terraform-original-workflow-v1', original, payload);
  for (const [name, kind, node] of [
    ['terraform-foundation-plan.json', 'foundation', undefined],
    ...Array.from(
      { length: base.topology.nodeCount },
      (_, index) => [`terraform-admission-plan-node-${index + 1}.json`, 'node-admission', index + 1] as const,
    ),
  ] as const) {
    const value = records.get(name),
      matches = original.receipts.filter(
        (row) =>
          row.record.stage.kind === kind &&
          (kind !== 'node-admission' ||
            (row.record.stage.kind === 'node-admission' && row.record.stage.node === node)) &&
          same(row.record.receipt, value),
      );
    require(matches.length === 1, 'root foundation or admission receipt differs from exact original publication');
    generic(name, 'preserve', 'terraform-original-published-plan-receipt-v1', matches[0]);
  }
  require(same(
    records.get('terraform-registration-configuration.json'),
    outcome.configuration,
  ), 'registered configuration differs from original public outcome');
  require(same(
    records.get('terraform-registration-observation.json'),
    outcome.registrations,
  ), 'registration observation differs from original public outcome');
  for (const name of ['terraform-registration-configuration.json', 'terraform-registration-observation.json'])
    generic(name, 'preserve', 'terraform-original-registration-evidence', {
      originalOutcomeSha256: original.outcomeSha256,
      packetSha256: canonicalSha256(records.get(name)),
    });
  const tokens = new Map(
    teardown.retirement.flatMap((site) =>
      site.tokens.map((token) => [`${token.name}.json`, { ...token, siteName: site.siteName }]),
    ),
  );
  require(tokens.size ===
    teardown.retirement.reduce((total, site) => total + site.tokens.length, 0), 'duplicate issued token identity');
  for (const [name, token] of tokens) {
    if (!records.has(name)) continue; // Token absence is qualified externally; this inventory only classifies present files.
    const value = record(name);
    keys(value, ['jwt', 'node', 'siteName', 'tokenName']);
    require(value.tokenName === token.name &&
      value.node === token.node &&
      value.siteName === token.siteName &&
      typeof value.jwt === 'string' &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt), 'issued token schema or identity differs');
    generic(
      name,
      'delete',
      'ce-bootstrap-token-v1',
      { token, teardownPlanSha256: teardown.planSha256 },
      { jwt: hash(value.jwt) },
    );
  }
  if (records.has('azure-terraform-pending-vm-import.json')) {
    const pendingSession = await context.terraform.open(owner, await azureTerraformCurrentDeployment(base), 'current');
    const pendingAdmission = {
      witness: await qualifyAzureTerraformNetworkEmptyMainBinding(base, store, context, signal),
      context,
    };
    const proof = await readAzureTerraformPendingImportProvenance(
      base,
      store,
      pendingSession,
      signal,
      pendingAdmission,
    );
    const file = byPath.get(proof.path);
    require(file &&
      file.identity === proof.identity &&
      file.sha256 === proof.bytesSha256 &&
      file.packetSha256 === proof.packetSha256, 'pending import native custody differs from parent snapshot');
    generic(proof.path, 'delete', 'azure-terraform-pending-import-v2', proof, proof.payloadSha256ByField);
  }
  for (const [name, raw] of records) {
    if (rootGeneric.has(name)) continue;
    const value = object(raw);
    if (name === `terraform-authorization-${base.planSha256}.json`) {
      require(same(value, {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: base.planSha256,
        mutations: true,
      }), 'original deployment authorization differs');
      generic(name, 'preserve', 'terraform-original-authorization-v1', base);
    } else if (name === 'terraform-site.json') {
      keys(value, ['siteName', 'uid', 'owner', 'contractFingerprint']);
      require(value.siteName === base.siteName &&
        value.uid === context.site.siteUid &&
        same(value.owner, owner) &&
        value.contractFingerprint === teardown.drain.siteContractFingerprint, 'original site reservation differs');
      generic(name, 'preserve', 'ce-site-reservation', { owner, siteUid: context.site.siteUid });
    } else if (name === `site-binding-${base.siteName}.json`) {
      keys(value, ['schemaVersion', 'tenantOrigin', 'contractFingerprint', 'siteUid', 'binding', 'expectedInterfaces']);
      require(value.schemaVersion === 1 &&
        same(value.binding, binding) &&
        value.siteUid === context.site.siteUid &&
        value.contractFingerprint === teardown.drain.siteContractFingerprint &&
        typeof value.tenantOrigin === 'string' &&
        new URL(value.tenantOrigin).origin === value.tenantOrigin &&
        value.tenantOrigin.startsWith('https://') &&
        Array.isArray(value.expectedInterfaces), 'trusted site binding differs');
      const macs = new Set<string>(),
        roles = new Set<string>();
      for (const rawInterface of value.expectedInterfaces) {
        const row = object(rawInterface);
        keys(row, ['node', 'role', 'mac', ...(row.staticIp === undefined ? [] : ['staticIp'])]);
        const role = row.role === 'data' ? 'sli' : row.role;
        require(binding.nodes.includes(String(row.node)) &&
          ['slo', 'sli'].includes(String(role)) &&
          typeof row.mac === 'string' &&
          /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(row.mac) &&
          !macs.has(row.mac.toLowerCase()) &&
          !roles.has(`${row.node}/${role}`), 'bound physical interface differs');
        if (row.staticIp !== undefined) {
          const ip = object(row.staticIp),
            configured = String(ip.ip_address).split('/');
          keys(ip, [
            'ip_address',
            ...(ip.default_gw === undefined ? [] : ['default_gw']),
            ...(ip.dns_server === undefined ? [] : ['dns_server']),
          ]);
          require(configured.length === 2 &&
            isIP(configured[0]) === 4 &&
            /^\d{1,2}$/.test(configured[1]) &&
            Number(configured[1]) <= 32 &&
            [ip.default_gw, ip.dns_server].every(
              (v) => v === undefined || (typeof v === 'string' && isIP(v) === 4),
            ), 'static interface schema differs');
        }
        macs.add(row.mac.toLowerCase());
        roles.add(`${row.node}/${role}`);
      }
      require(value.expectedInterfaces.length ===
        binding.nodes.length * 2, 'complete authoritative interface binding required');
      generic(name, 'preserve', 'ce-deployment-site-binding-v1', { binding, siteUid: context.site.siteUid });
    } else if (name === `public-site-${base.siteName}.json`) {
      keys(value, ['planId', 'record']);
      const saved = object(value.record);
      keys(saved, ['phase', 'resourceVersion', 'uid']);
      require(typeof value.planId === 'string' &&
        /^f5xc-ce-v2-[a-f0-9]{24}$/.test(value.planId) &&
        ['replace-prepared', 'replace-observed'].includes(String(saved.phase)) &&
        saved.uid === context.site.siteUid &&
        typeof saved.resourceVersion === 'string' &&
        saved.resourceVersion.length > 0, 'public site replacement journal differs');
      generic(name, 'preserve', 'public-site-replacement-journal', { siteUid: context.site.siteUid, value });
    } else if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name)) {
      const checkout = object(value.checkout),
        token = tokens.get(`${String(value.tokenName)}.json`);
      require(value.schemaVersion === 1 &&
        same(value.owner, owner) &&
        same(value.binding, binding) &&
        value.siteUid === context.site.siteUid &&
        value.contractFingerprint === teardown.drain.siteContractFingerprint &&
        token &&
        token.node === value.node &&
        name === `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json` &&
        sha(checkout.digest), 'opaque checkout provenance differs');
      const upstream = record(`${token.name}.json`);
      require(typeof upstream.jwt === 'string' &&
        hash(upstream.jwt) === checkout.digest, 'opaque checkout upstream token differs');
      generic(name, 'preserve', 'ce-bootstrap-checkout-v1', { value, token });
    } else if (name === 'azure-terraform-cloud-destroy-reconciliation.json') {
      require(['absent', 'owned'].includes(String(value.status)) &&
        (value.status !== 'owned' || value.ownerPlanSha256 === base.planSha256) &&
        value.resourceGroupId ===
          `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}`, 'historical cloud reconciliation differs');
      timestamp(value.observedAt);
      generic(name, 'preserve', 'terraform-destroy-reconciliation', { value, owner });
    } else if (name === 'platform-drain-source.json') {
      require(same(value, { sha256: canonicalSha256(teardown.drain), plan: teardown.drain }), 'drain source differs');
      generic(name, 'preserve', 'ce-platform-drain-source', teardown.drain);
    } else if (name === 'platform-drain-progress.json' || name === 'platform-drain-receipt.json') {
      require(same(records.get('platform-drain-source.json'), {
        sha256: canonicalSha256(teardown.drain),
        plan: teardown.drain,
      }), 'drain source missing');
      const completed = [
        ...teardown.drain.listeners.map((row) => `listener:${row.namespace}/${row.name}`),
        ...teardown.drain.origins.map((row) => `origin:${row.origin.namespace}/${row.origin.name}`),
        ...['bgp', 'bgp_routing_policy', 'external_connector'].flatMap((kind) =>
          teardown.drain.sites.flatMap((site) =>
            site.routing.filter((row) => row.kind === kind).map((row) => `${row.kind}:${row.name}`),
          ),
        ),
      ];
      require(value.planSha256 === canonicalSha256(teardown.drain) &&
        same(value.completed, completed), 'drain completed target inventory differs');
      timestamp(value.observedAt);
      if (name.endsWith('progress.json')) {
        keys(value, ['schemaVersion', 'planSha256', 'completed', 'observedAt']);
        require(value.schemaVersion === 1, 'drain progress schema differs');
      } else {
        keys(value, ['status', 'owner', 'sourcePlanSha256', 'planSha256', 'completed', 'cloud', 'sites', 'observedAt']);
        require(value.status === 'platform-drained' &&
          same(value.owner, owner) &&
          value.sourcePlanSha256 === base.planSha256 &&
          value.cloud === 'unknown' &&
          value.sites === 'not-retired', 'drain receipt differs');
      }
      generic(name, 'preserve', 'ce-platform-drain-completed', teardown.drain);
    }
  }
  const locks = new Set(original.receipts.map((row) => row.record.receipt.providerLockSha256));
  require(locks.size === 1, 'original provider lock inventory differs');
  const providerLockSha256 = [...locks][0];
  // Owning historic validators authenticate complete families together, including cross-record joins.
  const networkPackets = new Set(authority.packets.map((packet) => packet.path));
  const replacement = new Map(
    [...records].filter(
      ([name]) =>
        (isAzureTerraformReplacementHistoricalArtifact(name) && !networkPackets.has(name)) || tokens.has(name),
    ),
  );
  if ([...replacement.keys()].some(isAzureTerraformReplacementHistoricalArtifact)) {
    require(sha(providerLockSha256), 'owning provider lock identity required');
    verifyAzureTerraformReplacementHistoricalArtifacts(base, teardown.retirement, replacement, providerLockSha256);
  }
  const relay = new Map([...records].filter(([name]) => azureRelayHistoricalArtifacts.has(name)));
  if (relay.size) verifyAzureRelayHistoricalArtifacts(base, context.site.siteUid, relay);
  const ingress = new Map([...records].filter(([name]) => isAzureIngressHistoricalArtifact(name)));
  if (ingress.size) {
    require(contracts.ingress, 'verified ingress contract required for historical schema validation');
    verifyAzureIngressHistoricalArtifacts(base, teardown.drain, contracts.ingress, records);
  }
  const failover = new Map(
    [...records].filter(
      ([name]) =>
        isAzureFailoverHistoricalArtifact(name) ||
        azureRelayHistoricalArtifacts.has(name) ||
        name === 'platform-routing.json',
    ),
  );
  if ([...failover.keys()].some(isAzureFailoverHistoricalArtifact))
    await verifyAzureFailoverHistoricalArtifacts(base, context.site.siteUid, failover);
  const upgradeHistory = await verifyAzureTerraformUpgradeHistoricalArtifacts(
    base,
    {
      siteUid: context.site.siteUid,
      physicalSiteUid: teardown.retirement[0].physicalSiteUid,
      siteContractFingerprint: teardown.drain.siteContractFingerprint,
    },
    contracts.upgrade,
    records,
    signal,
  );
  for (const artifact of upgradeHistory.rootArtifacts) {
    require(byPath.get(artifact.path)?.packetSha256 === artifact.packetSha256, 'upgrade root native identity differs');
    generic(artifact.path, 'preserve', 'azure-terraform-upgrade-root-history-v2', artifact);
  }
  const stages = new Map<
    string,
    { source: Record<string, unknown>; deployment: Record<string, unknown>; failover: boolean }
  >();
  const upgradeStages = new Set<string>();
  for (const upgrade of upgradeHistory.sources.values()) {
    const stage = upgrade.deployment.stage;
    require(typeof stage === 'string' && !upgradeStages.has(stage), 'upgrade stage source differs');
    upgradeStages.add(stage);
    const directory = `terraform-stages/${stage}`;
    const staged =
      snapshot.directories.some((row) => row.path === directory || row.path.startsWith(`${directory}/`)) ||
      files.some((row) => row.path.startsWith(`${directory}/`));
    if (!staged) {
      const serial = records.get('terraform-ce-upgrade-serial.json');
      require(!upgradeHistory.rootArtifacts.some((row) => row.path.startsWith(`${upgrade.planId}-`)) &&
        !upgradeHistory.stageRetirementPaths.includes(`${upgrade.planId}-stage-retirement.json`) &&
        (!serial ||
          (object(serial).activePlanId !== upgrade.planId &&
            object(serial).lastPlanId !== upgrade.planId)), 'unstaged upgrade has execution or retirement records');
      continue;
    }
    stages.set(stage, { source: object(upgrade), deployment: object(upgrade.deployment), failover: false });
  }
  for (const [name, raw] of records) {
    if (/^azure-ce-failover-[a-f0-9]{24}\.json$/.test(name)) {
      const source = raw as AzureCeFailoverPlan;
      verifyAzureCeFailoverPlan(base, source);
      const deployment = await azureTerraformFailoverDeployment(base, source, 'release');
      require(name === `${source.planId}.json` &&
        typeof deployment.stage === 'string' &&
        !stages.has(deployment.stage), 'failover stage source differs');
      stages.set(deployment.stage, { source: object(raw), deployment: object(deployment), failover: true });
    }
  }
  const networkStages = new Map(authority.children.map((child) => [child.stage, child]));
  require(networkStages.size === authority.children.length, 'duplicate owning network child');
  const directoryDecisions: AzureParentDirectoryDecision[] = [];
  const allowedDirectories = new Set(['', base.deploymentName, 'terraform-stages']);
  for (const child of authority.children) {
    const stage = snapshot.directories.find((row) => row.path === `terraform-stages/${child.stage}`);
    require(stage && same(stage.names, [base.deploymentName]), 'network child runner owner differs');
    const prefix = `${stage.path}/${base.deploymentName}`,
      proof = object(child.proof),
      observed = object(proof.observed),
      receipt = object(observed.receipt);
    require(byPath.get(`${prefix}/artifact-retirement.json`)?.sha256 === observed.markerSha256 &&
      byPath.get(`${prefix}/deployment.json`)?.packetSha256 ===
        receipt.manifestSha256, 'owning child marker or manifest differs');
    for (const name of ['deployment.json', 'artifact-retirement.json'])
      decide(`${prefix}/${name}`, 'preserve', 'native-network-child-retirement', {
        retirementSha256: child.retirementSha256,
        proof: child.proof,
      });
    allowedDirectories.add(stage.path);
    allowedDirectories.add(prefix);
  }
  for (const [stageName, stage] of stages) {
    const prefix = `terraform-stages/${stageName}/${base.deploymentName}`;
    const readStage = async (name: string) => {
      const path = `${prefix}/${name}`,
        native = await readAzureTerraformParentPrivateFile(join(store.directory, path), signal);
      require(native.identity === byPath.get(path)?.identity &&
        hash(native.bytes) === byPath.get(path)?.sha256, 'stage descriptor custody differs');
      return object(JSON.parse(native.bytes.toString()));
    };
    const marker = await readStage('artifact-retirement.json'),
      manifest = await readStage('deployment.json');
    const retirementName = `${String(stage.source.planId)}-stage-retirement.json`,
      retirement = record(retirementName),
      final = object(retirement.receipt);
    const { configuration, providerLock, ...identity } = stage.deployment;
    require(typeof configuration === 'string' &&
      typeof providerLock === 'string' &&
      same(manifest, {
        ...identity,
        configurationSha256: hash(configuration),
        providerLockSha256: hash(providerLock),
      }) &&
      retirement.schemaVersion === (stage.failover ? 1 : 2) &&
      retirement.status === 'retired' &&
      same(retirement.owner, owner) &&
      retirement.sourcePlanSha256 === base.planSha256 &&
      (stage.failover ? retirement.failoverPlanSha256 : retirement.upgradePlanSha256) === stage.source.planSha256 &&
      retirement.deploymentSha256 === canonicalSha256(stage.deployment) &&
      sha(retirement.evidenceSha256) &&
      retirement.receiptSha256 === canonicalSha256(final) &&
      final.noChanges === true &&
      final.backendIdentity === manifest.backendIdentity &&
      final.configurationSha256 === manifest.configurationSha256 &&
      final.providerLockSha256 === manifest.providerLockSha256 &&
      marker.schemaVersion === 1 &&
      marker.status === 'runner-artifacts-retired' &&
      marker.manifestSha256 === canonicalSha256(manifest) &&
      marker.evidenceSha256 === retirement.evidenceSha256 &&
      marker.finalPlanSha256 === final.planSha256 &&
      marker.planReceiptSha256 === canonicalSha256(final) &&
      Array.isArray(marker.artifacts) &&
      marker.inventorySha256 ===
        hash(JSON.stringify(marker.artifacts)), 'retained stage original evidence or native receipt differs');
    if (stage.failover)
      await validateAzureTerraformFailoverRetirement(
        base,
        stage.source as unknown as AzureCeFailoverPlan,
        retirement,
        String(retirement.evidenceSha256),
      );
    verifyRetainedCleanup(
      marker.independentCleanup,
      {
        manifestSha256: canonicalSha256(manifest),
        evidenceSha256: String(retirement.evidenceSha256),
        finalPlanSha256: String(final.planSha256),
        planReceiptSha256: canonicalSha256(final),
      },
      marker.independentCleanupSha256,
    );
    if (!stage.failover) {
      require(upgradeHistory.stageRetirementPaths.includes(retirementName) &&
        contracts.upgrade, 'upgrade native retirement root or trusted contract missing');
      const observed = await readAzureTerraformUpgradeStageRetirement(
        base,
        stage.source as unknown as AzureTerraformUpgrade,
        contracts.upgrade,
        context.terraform,
        store,
        signal,
      );
      require(same(observed, retirement.result) &&
        observed.manifestSha256 === canonicalSha256(manifest) &&
        observed.evidenceSha256 === retirement.evidenceSha256 &&
        observed.finalPlanSha256 === final.planSha256 &&
        observed.inventorySha256 === marker.inventorySha256 &&
        observed.independentCleanupSha256 === marker.independentCleanupSha256 &&
        observed.retiredArtifacts ===
          marker.artifacts.length, 'upgrade completed root result or permanent native barrier differs');
      generic(retirementName, 'preserve', 'azure-terraform-upgrade-native-retirement-v2', {
        originalEvidenceSha256: retirement.evidenceSha256,
        retirementSha256: canonicalSha256(retirement),
        markerSha256: canonicalSha256(marker),
      });
    }
    for (const name of ['deployment.json', 'artifact-retirement.json']) {
      const path = `${prefix}/${name}`,
        logical = name === 'deployment.json' ? manifest : marker;
      require(byPath.get(path)?.packetSha256 === canonicalSha256(logical), 'retained stage native record differs');
      decide(path, 'preserve', 'native-generic-stage-retirement', {
        sourcePlanSha256: stage.source.planSha256,
        retirement,
        markerSha256: canonicalSha256(marker),
      });
    }
    allowedDirectories.add(`terraform-stages/${stageName}`);
    allowedDirectories.add(prefix);
  }
  for (const file of authority.originalDirectories.files) {
    require(byPath.get(file.path)?.identity === file.identity &&
      byPath.get(file.path)?.sha256 === file.bytesSha256, 'original receipt metadata native identity differs');
    decide(
      file.path,
      'preserve',
      file.path.includes('publication-fragments/')
        ? 'original-authenticated-publication-fragment'
        : 'original-published-receipt-metadata',
      original,
    );
    allowedDirectories.add(file.path.split('/')[0]);
  }
  // An authenticated empty original directory still needs an explicit namespace decision.
  for (const name of ['terraform-original-deployment-receipts', 'terraform-original-deployment-publication-fragments'])
    if (snapshot.directories.some((row) => row.path === name)) allowedDirectories.add(name);
  for (const directory of snapshot.directories) {
    require(allowedDirectories.has(directory.path), 'unclassified root or nested directory');
    if (directory.path === 'terraform-stages')
      require(same(directory.names, [...networkStages.keys(), ...stages.keys()].sort()), 'unaccounted stage directory');
    if (directory.path.startsWith('terraform-stages/')) {
      const runner = directory.path.split('/').length === 3;
      require(same(
        directory.names,
        runner ? ['artifact-retirement.json', 'deployment.json'] : [base.deploymentName],
      ), 'stage namespace differs');
    }
    directoryDecisions.push({
      ...directory,
      action: directory.path === base.deploymentName ? 'owning-transition' : 'preserve',
      schema:
        directory.path === base.deploymentName ? 'owning-native-main-transition' : 'authenticated-parent-namespace',
    });
  }
  const sensitive = new Map(authority.sensitive.map((row) => [row.path, row]));
  require(sensitive.size === authority.sensitive.length, 'duplicate sensitive schema decision');
  for (const packet of authority.packets) {
    if (decisions.has(packet.path)) continue; // A complete generic schema, not network read occurrence, owns this record.
    const file = byPath.get(packet.path),
      selected = sensitive.get(packet.path);
    require(file &&
      file.packetSha256 === packet.packetSha256 &&
      sha(packet.semanticProvenanceSha256), 'owning packet authority differs from native bytes');
    if (selected) {
      require(same(
        {
          path: selected.path,
          identity: selected.identity,
          sha256: selected.sha256,
          packetSha256: selected.packetSha256,
        },
        file,
      ), 'sensitive schema decision native join differs');
      decide(
        packet.path,
        'delete',
        selected.schema,
        { semanticProvenanceSha256: selected.semanticProvenanceSha256, sourcePlanSha256: selected.sourcePlanSha256 },
        selected.payloadSha256ByField,
      );
    } else
      decide(packet.path, 'preserve', packet.schema, {
        semanticProvenanceSha256: packet.semanticProvenanceSha256,
        packetSha256: packet.packetSha256,
      });
  }
  for (const [name, raw] of records) {
    if (decisions.has(name)) continue;
    if (
      isAzureTerraformReplacementHistoricalArtifact(name) ||
      azureRelayHistoricalArtifacts.has(name) ||
      isAzureIngressHistoricalArtifact(name) ||
      isAzureFailoverHistoricalArtifact(name) ||
      (name === 'platform-routing.json' && [...failover.keys()].some(isAzureFailoverHistoricalArtifact))
    )
      generic(name, 'preserve', 'owning-generic-historical-artifact', {
        value: raw,
        originalPlanSha256: base.planSha256,
      });
  }
  require(files.every((file) => decisions.has(file.path)) &&
    decisions.size === files.length, `unclassified parent file blocks complete disposition: ${files
    .filter((file) => !decisions.has(file.path))
    .map((file) => file.path)
    .join(',')}`);
  require(sensitive.size ===
    authority.sensitive.filter((row) => decisions.get(row.path)?.action === 'delete')
      .length, 'sensitive staging lacks typed deletion');
  require(new Set(directoryDecisions.map((row) => row.path)).size ===
    snapshot.directories.length, 'duplicate directory disposition');
  signal?.throwIfAborted();
  return {
    parentArtifactDecisions: [...decisions.values()].sort((a, b) => a.path.localeCompare(b.path)),
    parentDirectoryDecisions: directoryDecisions.sort((a, b) => a.path.localeCompare(b.path)),
    completeParentDispositionQualified: true as const,
  };
}

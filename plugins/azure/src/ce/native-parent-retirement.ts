import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, unlink } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { type BootstrapCheckoutBinding, retireBootstrapToken } from '../../../platform/src/ce/token-store';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import {
  isAzureFailoverHistoricalArtifact,
  verifyAzureFailoverHistoricalArtifacts,
} from './failover-artifact-provenance';
import { isAzureIngressHistoricalArtifact, verifyAzureIngressHistoricalArtifacts } from './ingress-artifact-provenance';
import { isAzureNativeNetworkCheckpointHistory } from './native-network-checkpoint-history';
import {
  azureNativeNetworkGenerationCompletionName,
  isAzureNativeNetworkGenerationCompletion,
  readAzureNativeNetworkGenerationCompletion,
} from './native-network-generation';
import { isAzureNativeNetworkHistory, verifyAzureNativeNetworkHistoryRecords } from './native-network-history';
import { verifyAzureNativeNetworkReplacementRetirementSource } from './native-network-replacement-retirement';
import { isAzureNativeReplacementHistory, verifyAzureNativeReplacementHistories } from './native-replacement-history';
import { type AzureNativeTeardownPlan, compileAzureNativeTeardown } from './native-teardown';
import {
  isAzureNativeUpgradeHistoricalArtifact,
  verifyAzureNativeUpgradeHistoricalArtifacts,
} from './native-upgrade-artifact-provenance';
import type { NativeWorkflowCheckpoint } from './native-workflow';
import {
  azureRelayHistoricalArtifacts,
  isAzureRelayReplacementHistoricalArtifact,
  verifyAzureRelayHistoricalArtifacts,
  verifyAzureRelayReplacementHistories,
} from './relay-artifact-provenance';
import { azureRelayPlanForDeployment } from './relay-deployment-plan';
import { observeAzureNativeRetirementAbsence } from './relay-retirement';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
interface Item {
  name: string;
  sha256: string;
  preserve: boolean;
}
const markerName = 'azure-native-parent-artifact-retirement.json';
const lockName = '.azure-relay-native-mutation-lock';
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const require = (condition: unknown, message: string) => {
  if (!condition) throw Error(`Native parent retirement: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Json;
};
const keys = (value: Json, expected: string[]) =>
  require(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
const timestamp = (value: unknown) =>
  require(typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now(), 'historical collection time differs');
const optional = async (store: CeDeploymentStore, name: string) => {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

/** Exact historical provenance plus current independent absence. Historical action outcomes never establish live acceptance. */
export async function retireAzureNativeParentArtifacts(
  base: AzureCePlan,
  cloud: AzureCePlan,
  teardown: AzureNativeTeardownPlan,
  runtime: Pick<CeRuntime, 'engine' | 'contract' | 'unregisteredAbsence'>,
  contract: VerifiedIngressContract,
  store: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
  upgradeContract?: VerifiedUpgradeContract,
) {
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  deadline.throwIfAborted();
  await store.verify();
  const release = await acquireProcessLock(join(store.directory, lockName));
  try {
    const binding = azureUpgradeBinding(base),
      relay = base.relayProfile ? azureRelayPlanForDeployment(base) : undefined;
    require(base.engine === 'native' &&
      same(store.owner, binding.owner) &&
      same(
        compileAzureNativeTeardown(base, cloud, teardown.drain, teardown.retirement),
        teardown,
      ), 'source, owner or teardown differs');
    require(same(await store.read(`${teardown.planId}.json`), teardown), 'saved teardown differs');
    require(same(await store.read(`${teardown.planId}-authorization.json`), {
      schemaVersion: 1,
      engine: 'native',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    }), 'mutation authorization differs');
    require(same(await store.read('azure-native-lifecycle-retirement.json'), {
      schemaVersion: 1,
      engine: 'native',
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
    }), 'lifecycle barrier differs');
    const bootstrap = object(await store.read('azure-native-bootstrap-retirement.json'));
    const key = relay ? object(await store.read('azure-native-relay-key-retirement.json')) : undefined;
    require(relay ||
      (await optional(store, 'azure-native-relay-key-retirement.json')) === undefined, 'orphan relay key marker');
    for (const value of key ? [bootstrap, key] : [bootstrap]) {
      const { phase, checkpointSha256, ...draft } = value;
      require(phase === 'retired' &&
        value.schemaVersion === 1 &&
        value.engine === 'native' &&
        same(value.owner, binding.owner) &&
        value.sourcePlanSha256 === base.planSha256 &&
        value.teardownPlanSha256 === teardown.planSha256 &&
        checkpointSha256 === canonicalSha256(draft) &&
        sha(value.absenceSha256), 'exact completed secret retirement missing');
    }
    if (key && relay) {
      keys(key, [
        'schemaVersion',
        'engine',
        'owner',
        'sourcePlanSha256',
        'relayPlanSha256',
        'teardownPlanSha256',
        'journalSha256',
        'absenceSha256',
        'checkpointSha256',
        'phase',
      ]);
      require(key.relayPlanSha256 === relay.planSha256 &&
        (key.journalSha256 === null || sha(key.journalSha256)), 'key source differs');
    }
    keys(bootstrap, [
      'schemaVersion',
      'engine',
      'owner',
      'sourcePlanSha256',
      'teardownPlanSha256',
      'absenceSha256',
      'artifacts',
      'inventorySha256',
      'checkpointSha256',
      'phase',
    ]);
    require(Array.isArray(bootstrap.artifacts) &&
      bootstrap.inventorySha256 === canonicalSha256(bootstrap.artifacts), 'bootstrap inventory differs');
    const receipt = object(await store.read('azure-native-teardown-receipt.json'));
    keys(receipt, [
      'status',
      'sourcePlanSha256',
      'teardownPlanSha256',
      'cloudPlanSha256',
      'cloud',
      'sites',
      'observedAt',
    ]);
    require(receipt.status === 'retired' &&
      receipt.sourcePlanSha256 === base.planSha256 &&
      receipt.teardownPlanSha256 === teardown.planSha256 &&
      receipt.cloudPlanSha256 === cloud.planSha256 &&
      receipt.cloud === 'absent' &&
      receipt.sites === 'deleted', 'exact cloud/site receipt missing');
    timestamp(receipt.observedAt);
    const fresh = () => observeAzureNativeRetirementAbsence(base, teardown, runtime, contract, api, deadline);
    const absenceSha256 = await fresh();
    const directory = async () => {
      const stat = await lstat(store.directory);
      require(stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.() &&
        (await realpath(store.directory)) === store.directory, 'directory identity differs');
    };
    const bytes = async (name: string) => {
      const stat = await lstat(join(store.directory, name));
      require(stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.nlink === 1 &&
        stat.uid === process.getuid?.() &&
        !(stat.mode & 0o077), 'file identity differs');
      return readFile(join(store.directory, name));
    };
    // The completed enrollment inventory proves exactly which opaque references are retained, without deleted JWT bytes.
    const checkouts = new Map<string, string>();
    for (const row of bootstrap.artifacts as unknown[]) {
      const item = object(row);
      keys(item, ['name', 'sha256', 'preserve']);
      require(typeof item.name === 'string' &&
        sha(item.sha256) &&
        typeof item.preserve === 'boolean', 'bootstrap artifact malformed');
      if (item.preserve) {
        require(/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(String(item.name)) &&
          !checkouts.has(String(item.name)), 'opaque reference inventory differs');
        checkouts.set(String(item.name), String(item.sha256));
      } else require((await optional(store, String(item.name))) === undefined, 'enrollment staging reappeared');
    }
    const preserve = new Set([
      'owner.json',
      'azure-native-lifecycle-retirement.json',
      ...(relay ? ['azure-native-relay-key-retirement.json'] : []),
      'azure-native-bootstrap-retirement.json',
      'azure-native-teardown-receipt.json',
      `${teardown.planId}.json`,
      `${teardown.planId}-authorization.json`,
      ...checkouts.keys(),
    ]);
    const core = new Set([
      'native-site.json',
      'platform-drain-source.json',
      'platform-drain-progress.json',
      'platform-drain-receipt.json',
      `site-binding-${base.siteName}.json`,
      `public-site-${base.siteName}.json`,
    ]);
    const allowed = (name: string) =>
      preserve.has(name) ||
      core.has(name) ||
      (Boolean(relay) &&
        (azureRelayHistoricalArtifacts.has(name) || isAzureRelayReplacementHistoricalArtifact(name))) ||
      (!relay &&
        (isAzureNativeReplacementHistory(name) ||
          isAzureNativeNetworkHistory(name) ||
          isAzureNativeNetworkCheckpointHistory(name) ||
          isAzureNativeNetworkGenerationCompletion(name))) ||
      isAzureIngressHistoricalArtifact(name) ||
      isAzureFailoverHistoricalArtifact(name) ||
      isAzureNativeUpgradeHistoricalArtifact(name) ||
      /^native-source-[a-f0-9]{64}\.json$/.test(name) ||
      /^native-action-[a-f0-9]{64}-[a-zA-Z0-9._-]+\.json$/.test(name) ||
      /^native-registration-node-[1-3]\.json$/.test(name) ||
      /^azure-ce-teardown-[a-f0-9]{24}(?:-authorization)?\.json$/.test(name);
    const inventory = async () => {
      await directory();
      const result: Item[] = [],
        records = new Map<string, Json>();
      for (const name of (await readdir(store.directory)).sort()) {
        if (name === markerName || name === lockName) continue;
        require(allowed(name), 'unknown or unqualified artifact blocks retirement');
        const raw = await bytes(name);
        let record: Json;
        try {
          record = object(JSON.parse(raw.toString()));
        } catch {
          throw Error('Native parent retirement: malformed artifact');
        }
        records.set(name, record);
        result.push({ name, sha256: hash(raw), preserve: preserve.has(name) });
      }
      for (const name of preserve) require(records.has(name), 'terminal receipt or opaque reference missing');
      for (const [name, digest] of checkouts)
        require(result.find((item) => item.name === name)?.sha256 === digest, 'opaque reference changed');
      return { result, records };
    };
    let marker = await optional(store, markerName);
    if (marker === undefined) {
      const { result, records } = await inventory();
      const sources = new Map([
        [base.planSha256, base],
        [cloud.planSha256, cloud],
      ]);
      for (const [name, value] of records)
        if (name.startsWith('native-source-')) {
          const source = value as unknown as AzureCePlan;
          verifyAzureCePlan(source);
          require(source.engine === 'native' &&
            same(azureUpgradeBinding(source).owner, binding.owner) &&
            source.siteName === base.siteName &&
            name === `native-source-${source.planSha256}.json`, 'native source registry differs');
          sources.set(source.planSha256, source);
        }
      if (relay) verifyAzureRelayReplacementHistories(base, teardown.retirement[0].siteUid, records, sources);
      else {
        await verifyAzureNativeReplacementHistories(base, teardown.retirement[0].siteUid, records);
        await verifyAzureNativeNetworkHistoryRecords(base, teardown.retirement[0].siteUid, records);
        for (const source of sources.values())
          if (source.networkReplacementProfile) {
            const history = records.get(`native-replacement-history-${source.planSha256}.json`);
            if (history)
              await verifyAzureNativeNetworkReplacementRetirementSource(
                source,
                object(history).replacement as NonNullable<NativeWorkflowCheckpoint['replacement']>,
                {
                  async read(name: string) {
                    require(records.has(name), 'required network replacement record is missing');
                    return records.get(name);
                  },
                },
              );
          }
      }
      // Check local action envelopes, not their health claims. Owning source/action and any embedded identities must agree.
      const identity = (value: unknown, source: AzureCePlan): void => {
        if (Array.isArray(value)) {
          for (const row of value) identity(row, source);
          return;
        }
        if (!value || typeof value !== 'object') return;
        const row = value as Json;
        if (row.owner !== undefined) require(same(row.owner, binding.owner), 'action payload owner differs');
        if (row.siteName !== undefined) require(row.siteName === base.siteName, 'action payload site differs');
        if (row.engine !== undefined) require(row.engine === 'native', 'action payload engine differs');
        if (row.sourcePlanSha256 !== undefined)
          require(row.sourcePlanSha256 === source.planSha256, 'action payload source differs');
        for (const nested of Object.values(row)) identity(nested, source);
      };
      for (const [name, value] of records) {
        if (name === 'owner.json')
          require(same(value, { schemaVersion: 2, owner: binding.owner }), 'owner manifest differs');
        else if (/^azure-ce-teardown-[a-f0-9]{24}\.json$/.test(name) && name !== `${teardown.planId}.json`) {
          const prior = value as unknown as AzureNativeTeardownPlan;
          const priorCloud = sources.get(prior.cloudPlanSha256);
          require(priorCloud &&
            same(compileAzureNativeTeardown(base, priorCloud, prior.drain, prior.retirement), prior) &&
            name === `${prior.planId}.json`, 'historical teardown source differs');
        } else if (
          /^azure-ce-teardown-[a-f0-9]{24}-authorization\.json$/.test(name) &&
          name !== `${teardown.planId}-authorization.json`
        ) {
          const plan = records.get(name.replace('-authorization.json', '.json')) as unknown as AzureNativeTeardownPlan;
          require(plan &&
            same(value, {
              schemaVersion: 1,
              engine: 'native',
              sourcePlanSha256: base.planSha256,
              teardownPlanSha256: plan.planSha256,
              mutations: true,
            }), 'historical teardown authorization differs');
        } else if (isAzureNativeNetworkGenerationCompletion(name)) {
          const source = sources.get(String(value.sourcePlanSha256));
          if (!source || name !== azureNativeNetworkGenerationCompletionName(source))
            throw Error('Azure native parent retirement: public generation source filename differs');
          await readAzureNativeNetworkGenerationCompletion(source, {
            async read(key: string) {
              require(records.has(key), 'required completed generation record is missing');
              return records.get(key);
            },
          });
        } else if (name.startsWith('native-action-')) {
          keys(value, ['schemaVersion', 'engine', 'owner', 'sourcePlanSha256', 'actionId', 'actionSha256', 'evidence']);
          const source = sources.get(String(value.sourcePlanSha256));
          const actions = source?.actions.filter((row) => row.id === value.actionId);
          require(source &&
            actions?.length === 1 &&
            value.schemaVersion === 1 &&
            value.engine === 'native' &&
            same(value.owner, binding.owner) &&
            value.actionSha256 === canonicalSha256(actions[0]) &&
            name ===
              `native-action-${source.planSha256}-${value.actionId}.json`, 'action source, owner or action differs');
          const payload = object(value.evidence);
          const action = actions?.[0];
          require(action &&
            [
              'relay-provision',
              'vm-state-gate',
              'health-gate',
              'bgp-gate',
              'f5-ingress-configure',
              'traffic-gate',
            ].includes(action.kind), 'unqualified action evidence kind');
          if (payload.planId !== undefined) require(payload.planId === source?.planId, 'action payload plan differs');
          if (payload.planSha256 !== undefined)
            require(payload.planSha256 === source?.planSha256, 'action payload plan hash differs');
          if (action?.kind === 'relay-provision') {
            keys(payload, [
              'status',
              'sourcePlanSha256',
              'relayPlanSha256',
              'resourceIds',
              'observedAt',
              'software',
              'routing',
              'traffic',
            ]);
            const profile = azureRelayPlanForDeployment(source as AzureCePlan);
            const ids = profile.relays.flatMap((row) => [
              ...(row.publicIpId ? [row.publicIpId] : []),
              row.nicId,
              row.vmId,
              `${profile.routeServerId}/bgpConnections/${row.name}`,
            ]);
            require(payload.status === 'provisioned' &&
              payload.sourcePlanSha256 === source?.planSha256 &&
              payload.relayPlanSha256 === profile.planSha256 &&
              same(payload.resourceIds, ids) &&
              payload.software === 'unknown' &&
              payload.routing === 'unknown' &&
              payload.traffic === 'unknown', 'relay provisioning evidence differs');
            timestamp(payload.observedAt);
          } else if (action?.kind === 'vm-state-gate') {
            require(payload.engine === 'native' &&
              payload.subscriptionId === source?.subscription.id &&
              payload.region === source?.region &&
              payload.deploymentId === source?.deploymentName &&
              payload.node === action.node &&
              payload.ownerPlanSha256 === action.expectedOwnerPlanSha256 &&
              payload.expectedPowerState === action.expectedPowerState &&
              ['healthy', 'degraded'].includes(String(payload.status)) &&
              payload.resourceId ===
                `/subscriptions/${source?.subscription.id}/resourceGroups/${source?.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${source?.deploymentName}-${action.node}`, 'VM gate evidence differs');
            timestamp(payload.observedAt);
          } else if (action?.kind === 'health-gate') {
            require(payload.engine === 'native' &&
              payload.subscriptionId === source?.subscription.id &&
              payload.siteName === source?.siteName &&
              ['healthy', 'degraded', 'unknown'].includes(String(payload.status)) &&
              payload.scope === 'site-global-and-registration-only' &&
              ['nodeHealth', 'bgp', 'routes', 'traffic'].every(
                (key) => payload[key] === 'unknown',
              ), 'CE health evidence differs');
            timestamp(payload.observedAt);
          } else if (action?.kind === 'bgp-gate' && source?.relayProfile) {
            const prefix = source.relayProfile.schemaVersion === 2 ? `${source.planId}-replacement-` : '';
            require(same(payload.configuration, records.get(`${prefix}relay-routing-configuration.json`)) &&
              same(
                payload.observation,
                records.get(`${prefix}relay-routing-observation.json`),
              ), 'relay action and workflow observations differ');
          } else if (action?.kind === 'f5-ingress-configure') {
            keys(payload, [
              'ingressPlanId',
              'contractFingerprint',
              'uid',
              'listener',
              'routes',
              'traffic',
              'observedAt',
            ]);
            require(typeof payload.ingressPlanId === 'string' &&
              /^[a-f0-9]{24}$/.test(payload.ingressPlanId) &&
              payload.contractFingerprint === contract.fingerprint &&
              typeof payload.uid === 'string' &&
              payload.uid.length > 0 &&
              payload.listener === 'configured', 'ingress action evidence differs');
            timestamp(payload.observedAt);
          } else if (action?.kind === 'traffic-gate') {
            const ingress = source?.intent.ingress;
            const probe = ingress?.mode === 'platform-http' ? ingress.probe : undefined;
            require(payload.source === 'azure:vm-run-command' &&
              payload.status === 'healthy' &&
              probe &&
              payload.httpStatus === probe.expectedStatus &&
              payload.expectedStatus === payload.httpStatus &&
              payload.bodySha256 === probe?.expectedBodySha256 &&
              payload.expectedBodySha256 === payload.bodySha256, 'traffic gate evidence differs');
            timestamp(payload.observedAt);
          }
          identity(value.evidence, source as AzureCePlan);
        } else if (name === 'native-site.json') {
          keys(value, ['siteName', 'uid', 'owner', 'contractFingerprint']);
          require(value.siteName === base.siteName &&
            value.uid === teardown.retirement[0].siteUid &&
            same(value.owner, binding.owner) &&
            value.contractFingerprint === teardown.drain.siteContractFingerprint, 'site reservation differs');
        } else if (name.startsWith('native-registration-node-')) {
          keys(value, ['siteName', 'node', 'registration', 'instanceId', 'action', 'state']);
          const count = Number(name.match(/node-([1-3])/)?.[1]);
          require(count <= binding.nodes.length &&
            binding.nodes.slice(0, count).includes(String(value.node)) &&
            value.siteName === base.siteName &&
            value.action === 'approve-registration' &&
            ['requested', 'submitted'].includes(String(value.state)) &&
            typeof value.registration === 'string' &&
            /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value.registration) &&
            typeof value.instanceId === 'string' &&
            /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.instanceId), 'registration binding differs');
        } else if (name === `site-binding-${base.siteName}.json`) {
          keys(value, [
            'schemaVersion',
            'tenantOrigin',
            'contractFingerprint',
            'siteUid',
            'binding',
            'expectedInterfaces',
          ]);
          require(value.schemaVersion === 1 &&
            same(value.binding, binding) &&
            value.siteUid === teardown.retirement[0].siteUid &&
            value.contractFingerprint === teardown.drain.siteContractFingerprint &&
            typeof value.tenantOrigin === 'string' &&
            new URL(value.tenantOrigin).origin === value.tenantOrigin &&
            value.tenantOrigin.startsWith('https://') &&
            Array.isArray(value.expectedInterfaces), 'deployment site binding differs');
          const used = new Set<string>(),
            roles = new Set<string>();
          for (const raw of value.expectedInterfaces as unknown[]) {
            const row = object(raw);
            keys(row, ['node', 'role', 'mac', ...(row.staticIp !== undefined ? ['staticIp'] : [])]);
            require(binding.nodes.includes(String(row.node)) &&
              ['slo', 'sli', 'data'].includes(String(row.role)) &&
              typeof row.mac === 'string' &&
              /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(row.mac) &&
              !used.has(row.mac.toLowerCase()) &&
              !roles.has(`${row.node}/${row.role === 'data' ? 'sli' : row.role}`), 'bound interface identity differs');
            if (row.staticIp !== undefined) {
              const configured = object(row.staticIp);
              keys(configured, [
                'ip_address',
                ...(configured.default_gw !== undefined ? ['default_gw'] : []),
                ...(configured.dns_server !== undefined ? ['dns_server'] : []),
              ]);
              const ip = String(configured.ip_address).split('/');
              require(ip.length === 2 &&
                isIP(ip[0]) === 4 &&
                /^\d{1,2}$/.test(ip[1]) &&
                Number(ip[1]) <= 32 &&
                [configured.default_gw, configured.dns_server].every(
                  (value) => value === undefined || (typeof value === 'string' && isIP(value) === 4),
                ), 'bound static interface configuration differs');
            }
            used.add(String(row.mac).toLowerCase());
            roles.add(`${row.node}/${row.role === 'data' ? 'sli' : row.role}`);
          }
          require((value.expectedInterfaces as unknown[]).length === 0 ||
            (value.expectedInterfaces as unknown[]).length === binding.nodes.length * 2, 'partial bound interfaces');
        } else if (name === `public-site-${base.siteName}.json`) {
          keys(value, ['planId', 'record']);
          const record = object(value.record);
          keys(record, ['phase', 'resourceVersion', 'uid']);
          require(typeof value.planId === 'string' &&
            /^f5xc-ce-v2-[a-f0-9]{24}$/.test(value.planId) &&
            ['replace-prepared', 'replace-observed'].includes(String(record.phase)) &&
            record.uid === teardown.retirement[0].siteUid &&
            typeof record.resourceVersion === 'string' &&
            record.resourceVersion.length > 0, 'public site journal differs');
        } else if (name === 'platform-drain-source.json')
          require(same(value, {
            sha256: canonicalSha256(teardown.drain),
            plan: teardown.drain,
          }), 'drain source differs');
        else if (name === 'platform-drain-progress.json' || name === 'platform-drain-receipt.json') {
          require(records.has('platform-drain-source.json'), 'drain source missing');
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
            same(value.completed, completed), 'drain completed inventory differs');
          timestamp(value.observedAt);
          if (name.endsWith('progress.json')) {
            keys(value, ['schemaVersion', 'planSha256', 'completed', 'observedAt']);
            require(value.schemaVersion === 1, 'drain checkpoint schema differs');
          } else {
            keys(value, [
              'status',
              'owner',
              'sourcePlanSha256',
              'planSha256',
              'completed',
              'cloud',
              'sites',
              'observedAt',
            ]);
            require(value.status === 'platform-drained' &&
              same(value.owner, binding.owner) &&
              value.sourcePlanSha256 === base.planSha256 &&
              value.cloud === 'unknown' &&
              value.sites === 'not-retired', 'drain receipt differs');
          }
        }
      }
      const relayRecords = new Map([...records].filter(([name]) => azureRelayHistoricalArtifacts.has(name)));
      if (relay) verifyAzureRelayHistoricalArtifacts(base, teardown.retirement[0].siteUid, relayRecords);
      verifyAzureIngressHistoricalArtifacts(base, teardown.drain, contract, records);
      verifyAzureNativeUpgradeHistoricalArtifacts(base, teardown, upgradeContract, records);
      await verifyAzureFailoverHistoricalArtifacts(base, teardown.retirement[0].siteUid, records);
      const draft = {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        cloudPlanSha256: cloud.planSha256,
        teardownPlanSha256: teardown.planSha256,
        absenceSha256,
        artifacts: result,
        inventorySha256: canonicalSha256(result),
      };
      marker = { ...draft, checkpointSha256: canonicalSha256(draft), phase: 'retiring' };
      deadline.throwIfAborted();
      await store.write(markerName, marker);
    }
    const value = object(marker),
      { phase, checkpointSha256, ...draft } = value;
    keys(value, [
      'schemaVersion',
      'engine',
      'owner',
      'sourcePlanSha256',
      'cloudPlanSha256',
      'teardownPlanSha256',
      'absenceSha256',
      'artifacts',
      'inventorySha256',
      'checkpointSha256',
      'phase',
    ]);
    require(value.schemaVersion === 1 &&
      value.engine === 'native' &&
      same(value.owner, binding.owner) &&
      value.sourcePlanSha256 === base.planSha256 &&
      value.cloudPlanSha256 === cloud.planSha256 &&
      value.teardownPlanSha256 === teardown.planSha256 &&
      sha(value.absenceSha256) &&
      Array.isArray(value.artifacts) &&
      value.inventorySha256 === canonicalSha256(value.artifacts) &&
      checkpointSha256 === canonicalSha256(draft) &&
      ['retiring', 'retired'].includes(String(phase)), 'checkpoint differs');
    const recorded = new Map<string, Item>();
    for (const raw of value.artifacts as unknown[]) {
      const item = object(raw);
      keys(item, ['name', 'sha256', 'preserve']);
      require(typeof item.name === 'string' &&
        allowed(item.name) &&
        sha(item.sha256) &&
        item.preserve === preserve.has(String(item.name)) &&
        !recorded.has(String(item.name)), 'inventory malformed');
      recorded.set(String(item.name), item as unknown as Item);
    }
    const current = (await inventory()).result;
    require(current.every((item) => same(item, recorded.get(item.name))) &&
      [...recorded.values()].every((item) => !item.preserve || current.some((row) => row.name === item.name)) &&
      (phase !== 'retired' || current.every((item) => item.preserve)), 'inventory changed after preflight');
    for (const name of checkouts.keys()) {
      await fresh();
      deadline.throwIfAborted();
      const checkout = object(await store.read(name)).checkout as BootstrapCheckoutBinding;
      await retireBootstrapToken(checkout, String(bootstrap.absenceSha256), deadline);
    }
    for (const item of current.filter((item) => !item.preserve)) {
      await fresh();
      deadline.throwIfAborted();
      await store.verify();
      await directory();
      require(hash(await bytes(item.name)) === item.sha256, 'artifact changed before deletion');
      deadline.throwIfAborted();
      await unlink(join(store.directory, item.name));
    }
    await fresh();
    deadline.throwIfAborted();
    const final = (await inventory()).result;
    require(final.every(
      (item) => item.preserve && same(item, recorded.get(item.name)),
    ), 'final retained inventory differs');
    if (phase !== 'retired') await store.write(markerName, { ...value, phase: 'retired' });
    return {
      status: 'native-deployment-artifacts-retired' as const,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      inventorySha256: value.inventorySha256,
      retiredArtifacts: [...recorded.values()].filter((item) => !item.preserve).length,
      remainingStaging: 0,
      completeCleanup: true as const,
    };
  } finally {
    await release();
  }
}

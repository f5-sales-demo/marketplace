import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { guardAzureCeApplyObject } from './apply-request';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import { collectAzureReplacementNodeReadiness } from './network-replacement-node-readiness';
import {
  type AzureOperationalIdentityRuntime,
  collectAzureOperationalIdentityJoins,
} from './operational-identity-joins';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { observeAzureTerraformNetworkReplacementCurrent } from './terraform-network-replacement-current';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from './terraform-network-replacement-execution';
import { readAzureTerraformNetworkReplacementExecutionBinding } from './terraform-network-replacement-execution-journal';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export interface AzureReplacementOperationalIdentityDependencies {
  loaders: AzureTerraformNetworkHistoryLoaders;
  qualifyHistorical: AzureTerraformNetworkAcceptanceVerifier;
  qualifyReplacementCompleted?: AzureTerraformNetworkReplacementCompletedVerifier;
}
const same = canonicalEqual;
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure replacement operational identity: ${message}`);
}

/** Read-only replacement observation. The entire journal/source/configuration/site/phase/node
 * identity is retained; quiesced nodes cannot satisfy this contract. Authenticating the source
 * and cloud generation does not establish original sample freshness, routing or traffic health.
 * This reader creates no issuer, signing key, bootstrap token or operational acceptance. */
export async function collectAzureReplacementOperationalIdentity(
  request: AzureCePlan,
  expected: AzureTerraformNetworkReplacementOperationalIdentity,
  transport: AzureOperationalIdentityRuntime & Partial<Pick<CeRuntime, 'observeNodeReadiness'>>,
  cloud: AzExecApi,
  storage: CeDeploymentStore,
  terraform: TerraformSession,
  dependencies: AzureReplacementOperationalIdentityDependencies,
  purpose: 'preflight' | 'final',
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const readinessReader = transport.observeNodeReadiness;
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    requestMatches = canonicalSnapshot(request),
    identityMatches = canonicalSnapshot(expected),
    directory = storage.directory,
    owner = structuredClone(storage.owner),
    binding = azureUpgradeBinding(plan);
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require(same(
    Object.keys(identity).sort(),
    [
      'owner',
      'planSha256',
      'journalSha256',
      'sourceBindingSha256',
      'configurationSha256',
      'site',
      'phase',
      'nodes',
    ].sort(),
  ) &&
    plan.engine === 'terraform' &&
    transport.engine === 'terraform' &&
    same(identity.owner, binding.owner) &&
    same(identity.owner, owner) &&
    identity.planSha256 === plan.planSha256 &&
    sha(identity.journalSha256) &&
    sha(identity.sourceBindingSha256) &&
    sha(identity.configurationSha256) &&
    identity.site &&
    typeof identity.site.siteUid === 'string' &&
    identity.site.siteUid.trim() &&
    sha(identity.site.siteConfigurationSha256) &&
    same(Object.keys(identity.site).sort(), ['siteConfigurationSha256', 'siteUid']) &&
    ((purpose === 'preflight' && identity.phase === 'intact') ||
      (purpose === 'final' && identity.phase === 'launched')) &&
    identity.nodes &&
    same(
      Object.keys(identity.nodes).sort(),
      Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1)).sort(),
    ) &&
    typeof dependencies.qualifyHistorical ===
      'function', 'resolved exact owning replacement identity and purpose required');
  const instances: Record<string, string> = {},
    interfaces: ExpectedCeInterface[] = [];
  for (const [node, vm] of Object.entries(identity.nodes)) {
    require(vm &&
      vm.vmState === 'present' &&
      typeof vm.vmId === 'string' &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(vm.vmId) &&
      typeof vm.resourceId === 'string' &&
      vm.resourceId.startsWith('/subscriptions/') &&
      sha(vm.ownerPlanSha256) &&
      vm.nics &&
      same(
        Object.keys(vm.nics).sort(),
        plan.nics.map((nic) => String(nic.index)).sort(),
      ), 'complete present replacement node scope required');
    const name = `${plan.deploymentName}-${node}`;
    instances[name] = vm.vmId;
    for (const nic of plan.nics) {
      const current = vm.nics[String(nic.index)];
      require(nic.role === 'slo' ||
        nic.role === 'data' ||
        nic.role === 'sli', 'configured replacement interface role required');
      require(current &&
        current.attachment === vm.resourceId &&
        typeof current.mac === 'string' &&
        /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(current.mac), 'attached exact replacement interface scope required');
      interfaces.push({ node: name, role: nic.role, mac: current.mac });
    }
  }
  require(new Set(Object.values(instances).map((v) => v.toLowerCase())).size === plan.topology.nodeCount &&
    new Set(interfaces.map((v) => v.mac)).size ===
      interfaces.length, 'distinct replacement VM and MAC identities required');
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const callbacks = [
    [transport, ['observeOwnedSite', 'ownedSiteConfiguration', 'observeRegistrations', 'observeAzureInterfaces']],
    [cloud, ['exec']],
    [storage, ['verify', 'read']],
    [terraform, ['readConfiguration', 'readConfigurationSha256']],
    [dependencies.loaders, ['loadSource']],
    [
      dependencies,
      ['qualifyHistorical', ...(dependencies.qualifyReplacementCompleted ? ['qualifyReplacementCompleted'] : [])],
    ],
  ] as const;
  const pinned = callbacks.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target as unknown as Record<string, unknown>,
        callback = object[name];
      require(typeof callback === 'function', 'owning observation callback required');
      return { object, name, callback };
    }),
  );
  const seal = () => {
    deadline.throwIfAborted();
    require(requestMatches(request) &&
      requestMatches(plan) &&
      identityMatches(expected) &&
      identityMatches(identity) &&
      storage.directory === directory &&
      same(storage.owner, owner) &&
      transport.engine === 'terraform' &&
      transport.observeNodeReadiness === readinessReader &&
      pinned.every((v) => v.object[v.name] === v.callback), 'owning observation context changed');
  };
  seal();
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal),
    store = guardAzureCeApplyObject(storage, seal, {}, ['directory', 'owner']),
    session = guardAzureCeApplyObject(terraform, seal),
    loaders = guardAzureCeApplyObject(dependencies.loaders, seal),
    historical = dependencies.qualifyHistorical,
    completed = dependencies.qualifyReplacementCompleted;
  const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([Promise.resolve().then(work), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const authenticate = () =>
    bounded(async () => {
      const read = await readAzureTerraformNetworkReplacementExecutionBinding(
        plan,
        store,
        loaders,
        identity.site,
        identity.journalSha256,
        async (...args) => bounded(() => historical(...args)),
        deadline,
        undefined,
        completed ? async (...args) => bounded(() => completed(...args)) : undefined,
      );
      require(read.source.sourceBindingSha256 === identity.sourceBindingSha256 &&
        read.execution.journal.sourceBindingSha256 ===
          identity.sourceBindingSha256, 'authenticated replacement source differs');
      return read.source.binding;
    });
  // Source/configuration failures reject before CE observation; runtime evidence failures remain unknown.
  const source = await authenticate(),
    retainedPlan = structuredClone(await bounded(() => loaders.loadSource(source.retainedPlanSha256)));
  const configuration = () =>
    bounded(async () => {
      require((await session.readConfigurationSha256?.()) === identity.configurationSha256 &&
        createHash('sha256')
          .update(await session.readConfiguration(identity.configurationSha256))
          .digest('hex') === identity.configurationSha256, 'current private configuration bytes or revision differ');
    });
  await configuration();
  const base = {
    schemaVersion: 1,
    scope: 'replacement-registration-interface-identity' as const,
    owner,
    planSha256: plan.planSha256,
    journalSha256: identity.journalSha256,
    sourceBindingSha256: identity.sourceBindingSha256,
    configurationSha256: identity.configurationSha256,
    site: structuredClone(identity.site),
    phase: identity.phase,
    purpose,
    expectedIdentitySha256: canonicalSha256(identity),
    expectedInventorySha256: canonicalSha256(identity.nodes),
    collectedAt: new Date().toISOString(),
    operationalAcceptance: 'unknown' as const,
    nodeHealth: 'unknown' as const,
    freshness: 'unqualified' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
  const selected = String(plan.intent.replacementNode);
  const observeCloud = async () => {
    await authenticate();
    await configuration();
    const current = await bounded(() =>
      observeAzureTerraformNetworkReplacementCurrent(
        {
          plan,
          retainedPlan,
          binding: source,
          sourceBindingSha256: identity.sourceBindingSha256,
          phase: identity.phase,
          ...(identity.phase === 'launched' ? { newVmId: identity.nodes[selected].vmId as string } : {}),
        },
        api,
        deadline,
      ),
    );
    require(same(current.nodes, identity.nodes), 'current replacement generation differs');
    await configuration();
    return canonicalSha256(current.nodes);
  };
  const result = await collectAzureOperationalIdentityJoins(
    base,
    binding,
    identity.site,
    instances,
    interfaces,
    runtime,
    observeCloud,
    deadline,
  );
  const nodeReadiness = await collectAzureReplacementNodeReadiness(
    plan,
    identity,
    'registrations' in result ? result.registrations : undefined,
    transport,
    deadline,
  );
  require(transport.observeNodeReadiness === readinessReader, 'node readiness reader changed');
  if (typeof readinessReader === 'function') {
    const final = await collectAzureOperationalIdentityJoins(
      base,
      binding,
      identity.site,
      instances,
      interfaces,
      runtime,
      observeCloud,
      deadline,
    );
    require(same(result, final), 'replacement identities changed across node readiness collection');
  }
  // Do not hide guard failures, even if an unavailable observation already returned unknown.
  await authenticate();
  await configuration();
  seal();
  return { ...result, nodeReadiness };
}

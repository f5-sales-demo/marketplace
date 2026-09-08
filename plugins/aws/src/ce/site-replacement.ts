import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256, safeHexEqual } from './canonical';
import { renderAwsCeCloudInit } from './cloud-init';
import { siteBindings } from './topology';
import { AWS_CE_DEFAULT_INTERFACE_MTU, type AwsCePlan } from './types';

type Json = Record<string, unknown>;
const phases = [
  'quiesce',
  'remove-tokens',
  'remove-site',
  'create-site',
  'bootstrap',
  'launch',
  'registration',
  'complete',
] as const;
type Phase = (typeof phases)[number];
export interface AwsSiteReplacementPlan {
  schemaVersion: 1;
  kind: 'aws-ce-site-replacement';
  engine: 'native' | 'terraform';
  sourcePlanSha256: string;
  binding: SiteBinding;
  preparation: Json;
  interfaceIds: Record<string, string>;
  elasticIpAllocationIds: Record<string, string>;
  oldTokenNames: Record<string, string>;
  planId: string;
  planSha256: string;
}
export type AwsQuiescenceState = 'intact' | 'partial' | 'complete';
export type AwsQuiescenceAdmission = (state: AwsQuiescenceState) => Promise<void>;
export interface AwsSiteReplacementDriver {
  readonly quiescenceAdmissionVersion: 1;
  engine: 'native' | 'terraform';
  assertOwnership(
    plan: AwsSiteReplacementPlan,
    phase: Phase,
    instances?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Must reconcile an already terminated node; retained ENIs must remain owned and unattached. */
  quiesce(plan: AwsSiteReplacementPlan, signal?: AbortSignal, admission?: AwsQuiescenceAdmission): Promise<void>;
  /** Must reconcile lost responses using the immutable replacement hash, not repeat an ambiguous create. */
  launch(
    plan: AwsSiteReplacementPlan,
    bootstrap: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Record<string, string>>;
  /** Commit engine-specific admission state only after fresh registration and configuration convergence. */
  finalize?(plan: AwsSiteReplacementPlan, instances: Record<string, string>, signal?: AbortSignal): Promise<void>;
}
interface Checkpoint {
  schemaVersion: 1;
  planSha256: string;
  phase: Phase;
  bootstrap: Record<string, string>;
  bootstrapSha256: Record<string, string>;
  instances: Record<string, string>;
  siteUid?: string;
  quiesceConfigurationSha256?: string;
}
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement evidence');
  return value as Json;
};

/** Compile only from tool-collected registration and ENI observations, then obtain authorization for this exact plan. */
export function compileAwsSiteReplacement(
  base: AwsCePlan,
  siteName: string,
  preparation: Json,
  resources: {
    interfaceIds: Record<string, string>;
    elasticIpAllocationIds: Record<string, string>;
    bootstrapTokenNames: Record<string, string>;
  },
): AwsSiteReplacementPlan {
  verifyAwsCePlan(base);
  const { interfaceIds, elasticIpAllocationIds, bootstrapTokenNames } = resources;
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (!selected) throw new Error('Replacement site is outside the deployment');
  const observed = Date.parse(String(preparation.observedAt));
  if (!Number.isFinite(observed) || Date.now() - observed > 300_000 || observed > Date.now() + 5000)
    throw new Error('Fresh replacement evidence is required');
  const { binding } = selected;
  if (
    preparation.evidenceKind !== 'preboot-interface-configuration-required' ||
    preparation.siteName !== siteName ||
    canonicalSha256(preparation.owner) !== canonicalSha256(binding.owner)
  )
    throw new Error('Replacement evidence ownership differs');
  if (
    typeof preparation.uid !== 'string' ||
    !preparation.uid ||
    typeof preparation.resourceVersion !== 'string' ||
    !preparation.resourceVersion ||
    !/^sha256:[a-f0-9]{64}$/.test(String(preparation.contractFingerprint)) ||
    preparation.source !== `/api/config/namespaces/system/securemesh_site_v2s/${siteName}` ||
    preparation.deviceSource !== `/api/register/namespaces/system/registrations_by_site/${siteName}`
  )
    throw new Error('Replacement evidence provenance is incomplete');
  const instances = object(preparation.instances);
  if (
    Object.keys(instances).length !== binding.nodes.length ||
    new Set(Object.values(instances)).size !== binding.nodes.length ||
    binding.nodes.some((node) => !/^i-[0-9a-f]{8,17}$/.test(String(instances[node])))
  )
    throw new Error('Replacement instance inventory is incomplete');
  const interfaces = preparation.interfaces;
  if (!Array.isArray(interfaces) || !interfaces.length) throw new Error('Replacement interfaces are missing');
  const keys = interfaces.map((value) => {
    const item = object(value);
    if (!binding.nodes.includes(String(item.node)) || !['slo', 'sli'].includes(String(item.role)))
      throw new Error('Replacement interface scope differs');
    return `${item.node}/${item.role}`;
  });
  const requiredKeys = binding.nodes.flatMap((node) => base.intent.interfaces.map((item) => `${node}/${item.role}`));
  if (canonicalSha256([...keys].sort()) !== canonicalSha256(requiredKeys.sort()))
    throw new Error('Replacement layout differs from plan');
  const macs = new Set<string>();
  const devices = new Set<string>();
  for (const value of interfaces) {
    const item = object(value);
    const desired = base.intent.interfaces.find((entry) => entry.role === item.role);
    if (
      !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(String(item.mac)) ||
      macs.has(String(item.mac)) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(String(item.device)) ||
      devices.has(`${item.node}/${item.device}`) ||
      item.mtu !== (desired?.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU)
    )
      throw new Error('Replacement MAC, device or MTU differs from plan');
    macs.add(String(item.mac));
    devices.add(`${item.node}/${item.device}`);
  }
  if (
    new Set(keys).size !== keys.length ||
    keys.length !== Object.keys(interfaceIds).length ||
    keys.some((key) => !/^eni-[0-9a-f]{8,17}$/.test(interfaceIds[key] ?? '')) ||
    new Set(Object.values(interfaceIds)).size !== keys.length
  )
    throw new Error('Replacement ENI inventory is incomplete or duplicated');
  if (
    Object.keys(bootstrapTokenNames).length !== binding.nodes.length ||
    binding.nodes.some((node) => !/^[a-z][a-z0-9-]{0,62}$/.test(bootstrapTokenNames[node] ?? ''))
  )
    throw new Error('Observed bootstrap token inventory is incomplete');
  if (
    base.intent.egress.mode === 'elastic-ip' &&
    (Object.keys(elasticIpAllocationIds).length !== binding.nodes.length ||
      binding.nodes.some((node) => !/^eipalloc-[0-9a-f]{8,17}$/.test(elasticIpAllocationIds[node] ?? '')) ||
      new Set(Object.values(elasticIpAllocationIds)).size !== binding.nodes.length)
  )
    throw new Error('Replacement EIP inventory is incomplete or duplicated');
  object(preparation.request);
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-site-replacement' as const,
    engine: base.engine,
    sourcePlanSha256: base.planSha256,
    binding,
    preparation: structuredClone(preparation),
    interfaceIds: { ...interfaceIds },
    elasticIpAllocationIds: { ...elasticIpAllocationIds },
    oldTokenNames: { ...bootstrapTokenNames },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-replace-${planSha256.slice(0, 24)}`, planSha256 };
}

type Runtime = Pick<
  CeRuntime,
  | 'engine'
  | 'observeOwnedSite'
  | 'ownedSiteConfiguration'
  | 'deleteBootstrapToken'
  | 'deleteSite'
  | 'ensureAwsPreparedSite'
  | 'bootstrap'
  | 'approveRegistrations'
  | 'observeRegistrations'
  | 'observeAwsRegisteredConfiguration'
  | 'ensureAwsInterfaceMtu'
>;
type Storage = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>;

/** Internal cross-engine coordinator. Cloud drivers own Terraform/native mutations; F5 operations remain shared. */
export async function runAwsSiteReplacement(
  plan: AwsSiteReplacementPlan,
  authorizedPlanSha256: string,
  driver: AwsSiteReplacementDriver,
  runtime: Runtime,
  storage: Storage,
  signal?: AbortSignal,
) {
  const { planId, planSha256, ...draft } = plan;
  if (
    plan.schemaVersion !== 1 ||
    plan.kind !== 'aws-ce-site-replacement' ||
    !safeHexEqual(canonicalSha256(draft), planSha256) ||
    planId !== `aws-ce-replace-${planSha256.slice(0, 24)}`
  )
    throw new Error('Replacement plan integrity differs');
  if (!safeHexEqual(planSha256, authorizedPlanSha256)) throw new Error('Exact replacement authorization is required');
  if (driver.engine !== plan.engine || runtime.engine !== plan.engine || storage.owner.engine !== plan.engine)
    throw new Error('Only the owning engine may replace this site');
  if (typeof runtime.ownedSiteConfiguration !== 'function')
    throw new Error('AWS site replacement requires an updated platform runtime with owned configuration projection');
  if (canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner))
    throw new Error('Replacement storage ownership differs');
  await storage.verify();
  const path = `${planId}.json`;
  let checkpoint: Checkpoint;
  try {
    checkpoint = (await storage.read(path)) as Checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    checkpoint = { schemaVersion: 1, planSha256, phase: 'quiesce', bootstrap: {}, bootstrapSha256: {}, instances: {} };
  }
  if (checkpoint.schemaVersion !== 1 || checkpoint.planSha256 !== planSha256 || !phases.includes(checkpoint.phase))
    throw new Error('Replacement checkpoint differs from plan');
  if (
    checkpoint.quiesceConfigurationSha256 !== undefined &&
    !/^[a-f0-9]{64}$/.test(checkpoint.quiesceConfigurationSha256)
  )
    throw new Error('Replacement configuration checkpoint is malformed');
  object(checkpoint.bootstrap);
  object(checkpoint.bootstrapSha256);
  object(checkpoint.instances);
  const nodes = plan.binding.nodes;
  if (
    Object.entries(checkpoint.bootstrap).some(
      ([node, material]) =>
        !nodes.includes(node) ||
        typeof material !== 'string' ||
        !safeHexEqual(canonicalSha256(material), checkpoint.bootstrapSha256[node] ?? ''),
    )
  )
    throw new Error('Replacement bootstrap checkpoint integrity differs');
  if (
    phases.indexOf(checkpoint.phase) >= phases.indexOf('bootstrap') &&
    (!checkpoint.siteUid || checkpoint.siteUid === plan.preparation.uid)
  )
    throw new Error('Replacement site checkpoint identity is missing');
  if (phases.indexOf(checkpoint.phase) >= phases.indexOf('launch') && nodes.some((node) => !checkpoint.bootstrap[node]))
    throw new Error('Replacement bootstrap checkpoint is incomplete');
  if (
    phases.indexOf(checkpoint.phase) >= phases.indexOf('registration') &&
    (Object.keys(checkpoint.instances).length !== nodes.length ||
      nodes.some(
        (node) =>
          !/^i-[0-9a-f]{8,17}$/.test(checkpoint.instances[node] ?? '') ||
          checkpoint.instances[node] === object(plan.preparation.instances)[node],
      ) ||
      new Set(Object.values(checkpoint.instances)).size !== nodes.length)
  )
    throw new Error('Replacement instance checkpoint identity is invalid');
  const save = () => storage.write(path, checkpoint);
  await save();
  const binding = plan.binding;
  for (let index = phases.indexOf(checkpoint.phase); index < phases.length; index++) {
    const phase = phases[index];
    signal?.throwIfAborted();
    await storage.verify();
    await driver.assertOwnership(plan, phase, checkpoint.instances, signal);
    if (['quiesce', 'remove-tokens', 'bootstrap', 'launch', 'registration', 'complete'].includes(phase)) {
      const currentSite = await runtime.observeOwnedSite(binding, signal);
      const expectedUid = ['quiesce', 'remove-tokens'].includes(phase) ? plan.preparation.uid : checkpoint.siteUid;
      if (!expectedUid || object(currentSite.system_metadata).uid !== expectedUid)
        throw new Error('Site UID changed at a replacement boundary');
      if (phase === 'quiesce' || (phase === 'remove-tokens' && checkpoint.quiesceConfigurationSha256)) {
        const configurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, currentSite));
        if (checkpoint.quiesceConfigurationSha256) {
          if (!safeHexEqual(configurationSha256, checkpoint.quiesceConfigurationSha256))
            throw new Error('Site configuration changed during replacement');
        } else {
          if (currentSite.resource_version !== plan.preparation.resourceVersion)
            throw new Error('Site configuration changed before replacement');
          // Persist the verified configuration before the first cloud mutation. A lost response
          // may leave this phase while XC advances its version because a node went offline.
          checkpoint.quiesceConfigurationSha256 = configurationSha256;
          await save();
        }
      }
    }
    if (phase === 'quiesce') await driver.quiesce(plan, signal);
    if (phase === 'remove-tokens') {
      for (const node of binding.nodes)
        await runtime.deleteBootstrapToken(binding, node, plan.oldTokenNames[node], signal);
    }
    if (phase === 'remove-site') {
      let existing: Json | undefined;
      try {
        existing = await runtime.observeOwnedSite(binding, signal);
      } catch (error) {
        if ((error as { category?: string }).category !== 'not-found') throw error;
      }
      if (existing) {
        if (object(existing.system_metadata).uid !== plan.preparation.uid)
          throw new Error('Original site UID changed before deletion');
        if (
          checkpoint.quiesceConfigurationSha256 &&
          !safeHexEqual(
            canonicalSha256(runtime.ownedSiteConfiguration(binding, existing)),
            checkpoint.quiesceConfigurationSha256,
          )
        )
          throw new Error('Site configuration changed before deletion');
        await runtime.deleteSite(binding, signal);
      }
    }
    if (phase === 'create-site') {
      await runtime.ensureAwsPreparedSite(
        binding,
        plan.preparation,
        async (record) => {
          if (typeof record.uid !== 'string' || !record.uid || record.uid === plan.preparation.uid)
            throw new Error('Replacement site UID is invalid');
          if (checkpoint.siteUid && checkpoint.siteUid !== record.uid)
            throw new Error('Replacement site UID changed during recovery');
          checkpoint.siteUid = record.uid;
          await save();
        },
        signal,
      );
    }
    if (phase === 'bootstrap') {
      for (const [index, node] of binding.nodes.entries()) {
        if (checkpoint.bootstrap[node]) continue;
        const token = `${binding.siteName.slice(0, 36)}-${index + 1}-r-${planSha256.slice(0, 12)}`;
        const material = await runtime.bootstrap(
          binding,
          node,
          token,
          (secret) => storage.write(`${token}.json`, secret),
          signal,
        );
        checkpoint.bootstrap[node] = renderAwsCeCloudInit({ nodeName: node, material });
        checkpoint.bootstrapSha256[node] = canonicalSha256(checkpoint.bootstrap[node]);
        await save();
      }
    }
    if (phase === 'launch') {
      if (binding.nodes.some((node) => typeof checkpoint.bootstrap[node] !== 'string'))
        throw new Error('Replacement bootstrap is incomplete');
      checkpoint.instances = await driver.launch(plan, checkpoint.bootstrap, signal);
      if (
        Object.keys(checkpoint.instances).length !== binding.nodes.length ||
        binding.nodes.some(
          (node) =>
            !/^i-[0-9a-f]{8,17}$/.test(checkpoint.instances[node] ?? '') ||
            checkpoint.instances[node] === object(plan.preparation.instances)[node],
        ) ||
        new Set(Object.values(checkpoint.instances)).size !== binding.nodes.length
      )
        throw new Error('Replacement launch identities are incomplete or unchanged');
      await driver.assertOwnership(plan, phase, checkpoint.instances, signal);
    }
    if (phase === 'registration' || phase === 'complete') {
      const expected = plan.preparation.interfaces as Parameters<Runtime['ensureAwsInterfaceMtu']>[2];
      const registration = await runtime.approveRegistrations(
        binding,
        checkpoint.instances,
        (record) => storage.write(`${planId}-registration.json`, record),
        signal,
      );
      const configuration = await runtime.observeAwsRegisteredConfiguration(
        binding,
        checkpoint.instances,
        expected,
        signal,
      );
      if (registration.status !== 'healthy' || configuration.status !== 'configured')
        return { status: 'pending-registration', registration, configuration, routing: 'unknown', traffic: 'unknown' };
      await runtime.ensureAwsInterfaceMtu(
        binding,
        checkpoint.instances,
        expected,
        (record) => storage.write(`${planId}-mtu.json`, { ...record, planSha256 }),
        signal,
      );
      if ((await runtime.observeRegistrations(binding, checkpoint.instances, signal)).status !== 'healthy')
        return { status: 'pending-registration', routing: 'unknown', traffic: 'unknown' };
      await driver.finalize?.(plan, checkpoint.instances, signal);
      checkpoint.phase = 'complete';
      await save();
      return {
        status: 'registered-with-configured-interfaces',
        instances: checkpoint.instances,
        siteUid: checkpoint.siteUid,
        routing: 'unknown',
        traffic: 'unknown',
      };
    }
    checkpoint.phase = phases[index + 1];
    await save();
  }
  throw new Error('Invalid replacement phase');
}

import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';
import { collectAwsPowerIdentities } from './whole-site-power-identities';

type Json = Record<string, unknown>;
function exactInterfaces(value: unknown, nodes: AwsWholeSitePowerPlan['bindings']['nodes']) {
  if (!Array.isArray(value)) return false;
  const expected = nodes.flatMap((node) => node.interfaces.map((item) => ({ node: node.nodeName, ...item })));
  return (
    value.length === expected.length &&
    expected.every(
      (item) =>
        value.filter(
          (row) =>
            row &&
            typeof row === 'object' &&
            row.node === item.node &&
            row.role === item.role &&
            typeof row.mac === 'string' &&
            row.mac.toLowerCase() === item.mac.toLowerCase() &&
            row.device === item.device,
        ).length === 1,
    )
  );
}
/** Owned operational snapshots. No collector time or healthy interface promotes unqualified publisher freshness. */
export async function collectAwsPowerOperational(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
) {
  verifyAwsWholeSitePowerPlan(base, plan);
  const result = {
    source: 'live' as const,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    identity: 'unknown' as 'verified' | 'unknown',
    cloud: 'unknown' as 'running' | 'stopped' | 'unknown',
    registration: 'unknown' as 'healthy' | 'unknown',
    configuration: 'unknown' as 'verified' | 'unknown',
    versions: 'unknown' as 'stable' | 'unknown',
    interfaceState: 'unknown' as 'up' | 'down' | 'unknown',
    traffic: 'unknown' as const,
    freshness: 'unqualified' as const,
    canSatisfyInterfaceMutationGate: false as const,
    contractFingerprint: runtime.contract.fingerprint,
    collectedAt: new Date().toISOString(),
  };
  try {
    const identities = await collectAwsPowerIdentities(base, values, api, runtime, signal);
    if (
      canonicalSha256({ owner: identities.owner, nodes: identities.nodes }) !==
      canonicalSha256({ owner: plan.bindings.owner, nodes: plan.bindings.nodes })
    )
      throw Error('Operational identity differs');
    result.identity = 'verified';
    result.cloud = identities.cloud;
    const observations = [];
    for (const { binding } of siteBindings(base)) {
      const nodes = plan.bindings.nodes.filter((node) => node.siteName === binding.siteName),
        instances = Object.fromEntries(nodes.map((node) => [node.nodeName, node.instanceId]));
      const expected: ExpectedCeInterface[] = nodes.flatMap((node) =>
        node.interfaces.map((item) => ({
          node: node.nodeName,
          role: item.role as ExpectedCeInterface['role'],
          mac: item.mac,
        })),
      );
      const before = await runtime.observeOwnedSite(binding, signal),
        uid = (before.system_metadata as Json)?.uid;
      if (typeof uid !== 'string' || !uid.trim()) throw Error('Operational site UID missing');
      const health = await runtime.observeHealth(binding, signal),
        registration = await runtime.observeRegistrations(binding, instances, signal),
        configuration = await runtime.observeAwsRegisteredConfiguration(binding, instances, expected, signal),
        versions = await runtime.observePowerVersions(binding, signal);
      let interfaces: Awaited<ReturnType<CeRuntime['observeAwsInterfaces']>>;
      try {
        interfaces = await runtime.observeAwsInterfaces(binding, expected, signal);
      } catch {
        signal?.throwIfAborted();
        interfaces = { status: 'unknown', interfaces: [], observedAt: new Date().toISOString() };
      }
      const after = await runtime.observeOwnedSite(binding, signal);
      if (
        (after.system_metadata as Json)?.uid !== uid ||
        canonicalSha256(after.spec) !== canonicalSha256(before.spec) ||
        (configuration.status === 'configured' && configuration.siteUid !== uid) ||
        health.siteUid !== uid ||
        versions.status !== 'observed' ||
        versions.siteUid !== uid
      )
        throw Error('Operational site changed or unavailable');
      const boundInterfaces =
        exactInterfaces(interfaces.interfaces, nodes) &&
        interfaces.interfaces.every((row) => typeof row.linkUp === 'boolean');
      observations.push({
        registration: health.status === 'healthy' && registration.status === 'healthy',
        configuration: configuration.status === 'configured' && exactInterfaces(configuration.interfaces, nodes),
        versions: versions.stable === true,
        interfaceState:
          boundInterfaces && interfaces.status === 'observed' && interfaces.interfaces.every((row) => row.linkUp)
            ? 'up'
            : boundInterfaces && interfaces.status === 'down' && interfaces.interfaces.some((row) => !row.linkUp)
              ? 'down'
              : 'unknown',
      });
    }
    const finalIdentity = await collectAwsPowerIdentities(base, values, api, runtime, signal);
    if (
      canonicalSha256({ owner: finalIdentity.owner, nodes: finalIdentity.nodes }) !==
      canonicalSha256({ owner: plan.bindings.owner, nodes: plan.bindings.nodes })
    ) {
      result.identity = 'unknown';
      result.cloud = 'unknown';
      throw Error('Operational hardware changed during observation');
    }
    result.cloud = finalIdentity.cloud;
    result.registration = observations.every((row) => row.registration) ? 'healthy' : 'unknown';
    result.configuration = observations.every((row) => row.configuration) ? 'verified' : 'unknown';
    result.versions = observations.every((row) => row.versions) ? 'stable' : 'unknown';
    result.interfaceState = observations.some((row) => row.interfaceState === 'unknown')
      ? 'unknown'
      : observations.some((row) => row.interfaceState === 'down')
        ? 'down'
        : 'up';
  } catch {
    signal?.throwIfAborted();
  }
  return { ...result, collectedAt: new Date().toISOString() };
}

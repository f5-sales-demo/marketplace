import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AwsCePlan } from './types';
import { type AwsBgpPowerSiteBinding, collectAwsPowerBgpServices } from './whole-site-power-bgp-services';
import { collectAwsPowerDirectRoutes } from './whole-site-power-routes';
import type { AwsPowerServiceInventory } from './whole-site-power-service-binding';
import { collectAwsPowerNlbServices } from './whole-site-power-services';
import { collectAwsPowerStaticTgwRoutes } from './whole-site-power-tgw';

/** All requested cloud/F5 service memberships. Membership cannot establish traffic or CE sample freshness. */
export async function collectAwsPowerServiceInventory(
  base: AwsCePlan,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
  retainedBgp?: AwsBgpPowerSiteBinding[],
) {
  verifyAwsCePlan(base);
  const components: Array<{
    kind: 'direct' | 'static-tgw' | 'bgp' | 'nlb';
    services: unknown;
    servicesSha256: string;
    status: 'active' | 'withdrawn' | 'pending';
  }> = [];
  let bgpBindings: AwsBgpPowerSiteBinding[] | undefined;
  const profile = base.intent.routing.profile;
  if (profile === 'tgw-connect') {
    const observation = await collectAwsPowerBgpServices(base, values, api, runtime, signal, retainedBgp);
    bgpBindings = observation.services.platform;
    components.push({
      kind: 'bgp',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  } else if (profile === 'tgw-static') {
    const observation = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
    components.push({
      kind: 'static-tgw',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  } else if (profile === 'direct-eni') {
    const observation = await collectAwsPowerDirectRoutes(base, values, api, signal);
    components.push({
      kind: 'direct',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  } else if (profile !== 'nlb-ingress') throw Error('Whole-site service routing profile lacks an owned observer');
  if (base.intent.ingress?.mode === 'nlb') {
    const observation = await collectAwsPowerNlbServices(base, values, api, signal);
    components.push({
      kind: 'nlb',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  }
  if (!components.length) throw Error('Whole-site services are missing');
  const services: AwsPowerServiceInventory = {
    schemaVersion: 1,
    kind: 'aws-ce-whole-site-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    components: components.map(({ kind, services, servicesSha256 }) => ({ kind, services, servicesSha256 })),
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    components,
    bgpBindings,
    status: components.every((row) => row.status === 'active')
      ? ('active' as const)
      : components.every((row) => row.status === 'withdrawn')
        ? ('withdrawn' as const)
        : ('pending' as const),
    freshness: 'unqualified' as const,
    traffic: 'unknown' as const,
    collectedAt: new Date().toISOString(),
  };
}

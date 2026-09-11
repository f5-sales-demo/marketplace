import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { collectAzureRouteServerHealth, discoverAzureRouteServerIdentity } from './route-server-health';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

/** Configure and collect Azure Route Server BGP only from authoritative cloud and platform observations. */
export async function configureAzureRouteServerRouting(
  plan: AzureCePlan,
  expectedInterfaces: ExpectedCeInterface[],
  runtime: Pick<CeRuntime, 'observeAzureInterfaces' | 'ensureAzureRouting' | 'observeBgpSessions' | 'observeBgpRoutes'>,
  storage: Pick<CeDeploymentStore, 'write' | 'verify'>,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode !== 'route-server') throw new Error('Azure Route Server routing is not selected');
  const binding = azureUpgradeBinding(plan);
  await storage.verify();
  const observed = await runtime.observeAzureInterfaces(binding, expectedInterfaces, signal);
  if (observed.status !== 'observed') throw new Error('Authoritative Azure platform interface evidence is unavailable');
  const slo = observed.interfaces.filter((item) => item.role === 'slo');
  if (
    slo.length !== binding.nodes.length ||
    binding.nodes.some((node) => slo.filter((item) => item.node === node).length !== 1)
  )
    throw new Error('Exactly one authoritative SLO interface per Azure CE node is required');
  const routeServer = await discoverAzureRouteServerIdentity(plan, api, signal);
  const interfaces = slo.map(({ node, interfaceName }) => ({ node, interfaceName }));
  await runtime.ensureAzureRouting(
    binding,
    plan.routing.localAsn,
    routeServer.asn,
    interfaces,
    routeServer.serviceAddresses,
    (record) => storage.write('platform-routing.json', record),
    signal,
  );
  const expectedSessions = interfaces.flatMap((item) =>
    routeServer.serviceAddresses.map((peerAddress) => ({ ...item, peerAddress })),
  );
  const sessions = await runtime.observeBgpSessions(binding, expectedSessions, signal);
  const effectiveRoutes = await runtime.observeBgpRoutes(binding, signal);
  const cloud = await collectAzureRouteServerHealth(plan, api, signal);
  const routeExchange = cloud.status === 'healthy' ? ('healthy' as const) : ('unknown' as const);
  const evidence = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    siteName: plan.siteName,
    routeServerId: routeServer.routeServerId,
    serviceAddresses: routeServer.serviceAddresses,
    status:
      sessions.status === 'healthy' && effectiveRoutes.status === 'observed' && routeExchange === 'healthy'
        ? ('healthy' as const)
        : ('unknown' as const),
    sessions,
    routeExchange,
    effectiveRoutes,
    traffic: cloud.traffic,
    observedAt: new Date().toISOString(),
  };
  await storage.write('route-server-health.json', evidence);
  return evidence;
}

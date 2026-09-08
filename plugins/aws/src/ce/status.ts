import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { collectAwsCeInventory } from './inventory';
import { collectAwsNetworkHealth } from './network-health';
import { scopedAwsApi } from './scoped-exec';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

type RuntimeObserver = Pick<CeRuntime, 'observeHealth' | 'observeRegistrations'>;
export async function collectAwsCeStatus(
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint | undefined,
  api: AwsExecApi,
  runtime?: RuntimeObserver,
  signal?: AbortSignal,
) {
  const observedAt = new Date().toISOString();
  let aws: Record<string, unknown>;
  const expectedInstances: Record<string, string> = {};
  let identitiesVerified = false;
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  try {
    const inventory = await collectAwsCeInventory(
      { accountId: plan.accountId, awsProfile: plan.intent.awsProfile, regions: [plan.region] },
      api,
      signal,
    );
    const deployed = inventory.nodes.filter((node) => node.deploymentId === plan.deploymentName);
    const conflicts = deployed.some(
      (node) => node.ownership !== 'managed' || node.engine !== plan.engine || node.siteName !== plan.siteName,
    );
    for (const [index, hostname] of nodes.entries()) {
      const id = checkpoint?.resolvedValues[`__INSTANCE_${index + 1}__`];
      if (id && deployed.filter((node) => node.instanceId === id).length === 1) expectedInstances[hostname] = id;
    }
    identitiesVerified =
      !conflicts &&
      deployed.length === nodes.length &&
      Object.keys(expectedInstances).length === nodes.length &&
      new Set(Object.values(expectedInstances)).size === nodes.length;
    aws = {
      status: conflicts ? 'ownership-conflict' : identitiesVerified ? 'observed' : 'incomplete',
      source: inventory.source,
      observedAt: inventory.collectedAt,
      nodes: deployed,
      counts: {
        instances: deployed.length,
        interfaces: deployed.reduce((sum, node) => sum + node.interfaces.length, 0),
      },
    };
  } catch {
    signal?.throwIfAborted();
    aws = { status: 'unknown', reason: 'inventory-unavailable', observedAt };
  }
  const binding: SiteBinding = {
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    },
    siteName: plan.siteName,
    nodes,
  };
  const unknown = (reason: string) => ({ status: 'unknown', reason, observedAt });
  let registration: Record<string, unknown> = unknown('platform-service-unavailable');
  let health: Record<string, unknown> = unknown('platform-service-unavailable');
  if (runtime) {
    try {
      health = await runtime.observeHealth(binding, signal);
    } catch {
      signal?.throwIfAborted();
      health = unknown('platform-observation-unavailable');
    }
    if (identitiesVerified) {
      try {
        registration = await runtime.observeRegistrations(binding, expectedInstances, signal);
      } catch {
        signal?.throwIfAborted();
        registration = unknown('platform-observation-unavailable');
      }
    } else registration = unknown('cloud-instance-identities-unverified');
  }
  return {
    schemaVersion: 2,
    deploymentId: plan.deploymentName,
    siteName: plan.siteName,
    engine: plan.engine,
    scope: { accountId: plan.accountId, region: plan.region },
    observedAt,
    checkpoint: {
      state: checkpoint?.state ?? 'not-started',
      completedActions: checkpoint?.completedActionIds.length ?? 0,
    },
    aws,
    f5: { registration, health },
    routing:
      plan.routing?.profile === 'tgw-connect' || plan.routing?.profile === 'nlb-ingress'
        ? await collectAwsNetworkHealth(
            plan.routing.profile === 'tgw-connect' ? 'bgp' : 'nlb',
            plan,
            checkpoint,
            scopedAwsApi(api, plan.intent.awsProfile, signal),
            signal,
          )
        : unknown('route-collector-pending'),
    traffic: unknown('traffic-collector-pending'),
  };
}

import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

export interface AwsNativeRoutingCheckpoint {
  schemaVersion: 2;
  engine: 'native';
  planId: string;
  planSha256: string;
  ownerSha256: string;
  resources: Array<{
    siteName: string;
    kind: 'external_connector' | 'bgp_routing_policy' | 'bgp';
    name: string;
    uid: string;
  }>;
}

export function compileAwsNativeRoutingCheckpoint(
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  owner: CeDeploymentStore['owner'],
): AwsNativeRoutingCheckpoint {
  verifyAwsCePlan(plan);
  if (
    plan.engine !== 'native' ||
    plan.routing.profile !== 'tgw-connect' ||
    checkpoint.schemaVersion !== 2 ||
    checkpoint.engine !== 'native' ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256 ||
    owner.engine !== 'native' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region
  )
    throw new Error('Native routing checkpoint source or ownership differs');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (!actions.length) throw new Error('Native routing checkpoint has no Connect topology');
  const resources = siteBindings(plan)
    .flatMap(({ site }) => {
      const connectors = actions
        .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
        .map((action) => ({
          siteName: site.name,
          kind: 'external_connector' as const,
          name: `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`,
        }));
      if (!connectors.length) throw new Error('Native routing checkpoint site has no Connect peers');
      return [
        ...connectors,
        {
          siteName: site.name,
          kind: 'bgp_routing_policy' as const,
          name: `${site.name.slice(0, 43)}-tgw-export-policy`,
        },
        { siteName: site.name, kind: 'bgp' as const, name: `${site.name.slice(0, 55)}-tgw-bgp` },
      ];
    })
    .map((resource) => {
      const uid = checkpoint.resolvedValues[`__XC_ROUTING_${resource.name}__`];
      if (typeof uid !== 'string' || !uid.trim()) throw new Error('Native routing checkpoint UID is missing');
      return { ...resource, uid };
    });
  if (new Set(resources.map((resource) => resource.uid)).size !== resources.length)
    throw new Error('Native routing checkpoint UIDs are duplicated');
  return {
    schemaVersion: 2,
    engine: 'native',
    planId: plan.planId,
    planSha256: plan.planSha256,
    ownerSha256: canonicalSha256(owner),
    resources,
  };
}

export async function persistAwsNativeRoutingCheckpoint(
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify' | 'write'>,
): Promise<AwsNativeRoutingCheckpoint> {
  await storage.verify();
  const result = compileAwsNativeRoutingCheckpoint(plan, checkpoint, storage.owner);
  await storage.write('native-routing-checkpoint.json', result);
  return result;
}

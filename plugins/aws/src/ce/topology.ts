import type { SiteBinding } from '../../../platform/src/ce/runtime';
import type { AwsCeIntent, AwsCePlan } from './types';

export interface AwsCeSiteTopology {
  name: string;
  nodeIndexes: number[];
}
export function siteTopology(intent: Pick<AwsCeIntent, 'siteName' | 'topology'>): AwsCeSiteTopology[] {
  const sites = intent.topology.sites ?? [
    { name: intent.siteName, nodeIndexes: Array.from({ length: intent.topology.nodeCount }, (_, index) => index + 1) },
  ];
  if (!Array.isArray(sites) || !sites.length) throw new Error('CE site topology is required');
  const names = new Set<string>();
  const indexes = new Set<number>();
  for (const site of sites) {
    if (
      !site ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(site.name) ||
      names.has(site.name) ||
      !Array.isArray(site.nodeIndexes) ||
      ![1, 3].includes(site.nodeIndexes.length)
    )
      throw new Error('CE sites require unique identities and one or three nodes each');
    names.add(site.name);
    for (const index of site.nodeIndexes) {
      if (!Number.isInteger(index) || index < 1 || index > intent.topology.nodeCount || indexes.has(index))
        throw new Error('CE node must belong to exactly one site');
      indexes.add(index);
    }
  }
  if (indexes.size !== intent.topology.nodeCount) throw new Error('CE topology does not assign every node to a site');
  return sites
    .map((site) => ({ name: site.name, nodeIndexes: [...site.nodeIndexes].sort((a, b) => a - b) }))
    .sort((a, b) => a.nodeIndexes[0] - b.nodeIndexes[0]);
}
export function siteForNode(intent: Pick<AwsCeIntent, 'siteName' | 'topology'>, node: number): AwsCeSiteTopology {
  const site = siteTopology(intent).find((site) => site.nodeIndexes.includes(node));
  if (!site) throw new Error('CE node has no site binding');
  return site;
}
export function siteBindings(plan: AwsCePlan): Array<{ site: AwsCeSiteTopology; binding: SiteBinding }> {
  return siteTopology(plan.intent).map((site) => ({
    site,
    binding: {
      owner: {
        deploymentId: plan.deploymentName,
        engine: plan.engine,
        provider: 'aws',
        account: plan.accountId,
        region: plan.region,
      },
      siteName: site.name,
      ...(plan.intent.initialVersions ? { initialVersions: structuredClone(plan.intent.initialVersions) } : {}),
      nodes: site.nodeIndexes.map((index) => `${plan.deploymentName}-${index}`),
    },
  }));
}

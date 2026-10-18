import type { GcpOperationStore } from './native-operation';
import { readGcpResourceInventory } from './ownership';
import { type GcpStatusSource, observeGcpSiteStatus } from './status';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

/** Internal collector: persisted intent and ledger identities precede all external reads. */
export async function observeGcpOwnedDeployment(
  store: GcpOperationStore,
  intent: GcpCeIntent,
  source: (node: string, zone: string) => GcpStatusSource,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  validateIntent(intent);
  const resources = await readGcpResourceInventory(store, intent);
  const instances = resources.filter((resource) => resource.kind === 'instance');
  const nodes = intent.sites.flatMap((site) => site.nodes.map((node) => ({ site, node })));
  if (instances.length !== nodes.length) throw new Error('Complete owned deployment node inventory required');
  const identities = nodes.map(({ site, node }) => {
    const matches = instances.filter((resource) => resource.siteName === site.name && resource.nodeName === node.name);
    const expectedLink = `https://www.googleapis.com/compute/v1/projects/${intent.project}/zones/${node.zone}/instances/${node.name}`;
    if (matches.length !== 1 || matches[0].selfLink !== expectedLink)
      throw new Error('Owned deployment node identity differs');
    return {
      project: intent.project,
      zone: node.zone,
      instanceId: matches[0].id,
      siteName: site.name,
      nodeName: node.name,
      nics: node.interfaces.map((nic) => {
        if (nic.role === 'management') throw new Error('Management interface observation is not qualified');
        return {
          index: nic.index,
          role: nic.role,
          vrf: nic.vrf,
          network: `https://www.googleapis.com/compute/v1/projects/${intent.project}/global/networks/${nic.network}`,
          subnet: `https://www.googleapis.com/compute/v1/projects/${intent.project}/regions/${intent.region}/subnetworks/${nic.subnet}`,
        };
      }),
    };
  });
  const observations = [];
  for (const expected of identities) {
    signal?.throwIfAborted();
    observations.push(
      await observeGcpSiteStatus(expected, intent.engine, source(expected.nodeName, expected.zone), signal),
    );
  }
  return {
    schemaVersion: 1,
    project: intent.project,
    region: intent.region,
    deploymentName: intent.deploymentName,
    platformContext: intent.platformContext,
    engine: intent.engine,
    nodes: observations,
    routing: 'unknown',
    applicationTraffic: 'unknown',
    haHealth: 'not-established',
    absence: 'not-established',
  };
}

import { fingerprint } from './discovery';
import { evaluateGcpHaHealth } from './health';
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
  const saved = (await store.read(
    intent.engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
  )) as {
    intent?: GcpCeIntent;
    intentFingerprint?: string;
    platformContext?: string;
  };
  if (
    !saved?.intent ||
    saved.intentFingerprint !== fingerprint(saved.intent) ||
    saved.intentFingerprint !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Status intent is not bound to persisted deployment context');
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
  const haResults = [];
  for (const site of intent.sites.filter((site) => site.nodes.length === 3)) {
    const expected = identities
      .filter((n) => n.siteName === site.name)
      .map(({ nodeName, instanceId }) => ({ nodeName, instanceId }));
    const port = source(site.nodes[0].name, site.nodes[0].zone);
    let collection: unknown;
    try {
      collection = await port.haHealth?.(site.name, signal);
    } catch {
      signal?.throwIfAborted();
    }
    const health = evaluateGcpHaHealth(collection, expected, port.contractFingerprint ?? '', port.haHealthContract);
    for (const node of health.nodes) {
      const observed = observations.find((n) => n.nodeName === node.nodeName && n.siteName === site.name);
      if (observed?.registration !== 'online' || observed.physicalInterfaceIdentity !== 'observed') {
        node.status = 'unknown';
        node.reasonCodes.push('node-not-online-with-both-nics');
        health.status = 'unknown';
        health.reasonCodes.push('node-not-online-with-both-nics');
      }
    }
    haResults.push(health);
  }
  const reloaded = await store.read(
    intent.engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
  );
  if (
    fingerprint(reloaded) !== fingerprint(saved) ||
    fingerprint(await readGcpResourceInventory(store, intent)) !== fingerprint(resources)
  )
    throw new Error('Status ownership changed during collection');
  const ha = haResults.length
    ? {
        schemaVersion: 1,
        status: haResults.some((r) => r.status === 'unknown')
          ? 'unknown'
          : haResults.some((r) => r.status === 'degraded')
            ? 'degraded'
            : 'healthy',
        sites: haResults,
      }
    : undefined;
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
    ...(ha ? { ha } : {}),
    absence: 'not-established',
  };
}

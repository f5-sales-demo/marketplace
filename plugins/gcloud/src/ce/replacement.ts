import { fingerprint } from './discovery';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';
/** Compare desired topology against the persisted original intent, never against caller labels alone. */
export function classifyGcpNetworkChange(original: GcpCeIntent, desired: GcpCeIntent) {
  validateIntent(original);
  validateIntent(desired);
  if (
    original.project !== desired.project ||
    original.region !== desired.region ||
    original.deploymentName !== desired.deploymentName ||
    original.platformContext !== desired.platformContext ||
    original.engine !== desired.engine
  )
    throw new Error('Network change cannot migrate deployment ownership');
  if (original.sites.length !== desired.sites.length)
    throw new Error('Site collection changes require explicit independent deployment planning');
  const reasons: string[] = [];
  for (const site of original.sites) {
    const target = desired.sites.find((s) => s.name === site.name);
    if (!target || site.nodes.length !== target.nodes.length)
      throw new Error('HA/site identity changes require explicit replacement plan');
    for (const node of site.nodes) {
      const next = target.nodes.find((n) => n.name === node.name);
      if (!next) throw new Error('Node identity change requires explicit replacement');
      if (node.zone !== next.zone) reasons.push(`node-zone:${node.name}`);
      const slo = node.interfaces[0],
        desiredSlo = next.interfaces[0];
      if (fingerprint(slo) !== fingerprint(desiredSlo)) reasons.push(`immutable-slo:${node.name}`);
      if (node.interfaces.length !== next.interfaces.length) reasons.push(`interface-count:${node.name}`);
    }
  }
  return {
    kind: reasons.length ? 'replacement-required' : 'network-update-candidate',
    reasons,
    requires: reasons.length
      ? [
          'coupled node/site replacement',
          'original resource restoration inventory',
          'fresh node-bound bootstrap',
          'physical interface requalification',
          'registration/traffic recovery',
        ]
      : ['reviewed network diff', 'maintenance window', 'routing/traffic verification'],
    sha256: fingerprint({ original, desired }),
  };
}

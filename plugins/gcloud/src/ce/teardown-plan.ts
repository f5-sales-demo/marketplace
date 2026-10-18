import { fingerprint } from './discovery';
import { type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';

const ORDER: Record<GcpResourceIdentity['kind'], number> = {
  route: 0,
  firewall: 1,
  instance: 2,
  disk: 3,
  address: 4,
  router: 5,
  subnetwork: 6,
  network: 7,
};
export function planGcpOwnedTeardown(
  resources: GcpResourceIdentity[],
  scope: { project: string; deploymentName: string; engine: 'native' | 'terraform'; region: string },
) {
  if (!resources.length) throw new Error('Independent absence verification required for empty teardown inventory');
  const identities = new Set<string>();
  for (const r of resources) {
    validateGcpResourceIdentity(r);
    if (
      r.project !== scope.project ||
      r.deploymentName !== scope.deploymentName ||
      r.engine !== scope.engine ||
      !/^\d+$/.test(r.id) ||
      identities.has(r.selfLink)
    )
      throw new Error('Teardown inventory ownership differs or duplicates');
    identities.add(r.selfLink);
    const prefix = `https://www.googleapis.com/compute/v1/projects/${scope.project}/`;
    if (!r.selfLink.startsWith(prefix) || !Number.isInteger(ORDER[r.kind]))
      throw new Error('Teardown inventory identity is invalid');
  }
  const ordered = [...resources].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.selfLink.localeCompare(b.selfLink));
  return {
    schemaVersion: 1,
    scope: structuredClone(scope),
    resources: structuredClone(ordered),
    executable: false,
    required: [
      'exact ledger/live ownership recheck',
      'reviewed teardown approval',
      'platform drain and registration cleanup',
      'brownfield restoration inventory',
      'independent absence checks',
    ],
    sha256: fingerprint({ scope, resources: ordered }),
  };
}

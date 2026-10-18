import type { GcpOperationStore } from './native-operation';
import type { GcpCeEngine } from './types';

export interface GcpResourceIdentity {
  id: string;
  selfLink: string;
  kind: 'instance' | 'disk' | 'network' | 'subnetwork' | 'address' | 'firewall' | 'router' | 'route';
  project: string;
  deploymentName: string;
  siteName?: string;
  nodeName?: string;
  engine: GcpCeEngine;
}
interface Ledger {
  schemaVersion: 1;
  project: string;
  deploymentName: string;
  engine: GcpCeEngine;
  resources: GcpResourceIdentity[];
}
const COLLECTIONS = {
  instance: 'instances',
  disk: 'disks',
  network: 'networks',
  subnetwork: 'subnetworks',
  address: 'addresses',
  firewall: 'firewalls',
  router: 'routers',
  route: 'routes',
} as const;
export function validateGcpResourceIdentity(resource: GcpResourceIdentity) {
  if (
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(resource.project) ||
    !/^\d+$/.test(resource.id) ||
    !['native', 'terraform'].includes(resource.engine)
  )
    throw new Error('Invalid GCP resource identity');
  for (const name of [resource.deploymentName, resource.siteName, resource.nodeName].filter((x) => x !== undefined))
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name as string)) throw new Error('Invalid GCP ownership binding');
  const collection = COLLECTIONS[resource.kind];
  if (!collection) throw new Error('Unsupported GCP resource kind');
  const prefix = `https://www.googleapis.com/compute/v1/projects/${resource.project}/`;
  const suffix = resource.selfLink.slice(prefix.length);
  if (
    !resource.selfLink.startsWith(prefix) ||
    !new RegExp(
      `^${resource.kind === 'instance' || resource.kind === 'disk' ? 'zones/[a-z]+(?:-[a-z]+)+[0-9]-[a-z]' : resource.kind === 'subnetwork' || resource.kind === 'router' ? 'regions/[a-z]+(?:-[a-z]+)+[0-9]' : resource.kind === 'address' ? '(?:global|regions/[a-z]+(?:-[a-z]+)+[0-9])' : 'global'}/${collection}/[a-z][a-z0-9-]{0,62}$`,
    ).test(suffix)
  )
    throw new Error('Resource must have an exact scoped selfLink');
}
function sameScope(
  a: Pick<GcpResourceIdentity, 'project' | 'deploymentName' | 'engine'>,
  b: Pick<GcpResourceIdentity, 'project' | 'deploymentName' | 'engine'>,
) {
  return a.project === b.project && a.deploymentName === b.deploymentName && a.engine === b.engine;
}

/** Exact numeric identities supplement labels; caller must bind this store to shared ownership. */
export async function recordGcpResource(store: GcpOperationStore, resource: GcpResourceIdentity): Promise<void> {
  validateGcpResourceIdentity(resource);
  let ledger: Ledger;
  try {
    ledger = (await store.read('gcp-resources.json')) as Ledger;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    ledger = {
      schemaVersion: 1,
      project: resource.project,
      deploymentName: resource.deploymentName,
      engine: resource.engine,
      resources: [],
    };
  }
  if (ledger?.schemaVersion !== 1 || !sameScope(ledger, resource) || !Array.isArray(ledger.resources))
    throw new Error('GCP ledger scope differs');
  for (const existing of ledger.resources) validateGcpResourceIdentity(existing);
  const prior = ledger.resources.find((r) => r.selfLink === resource.selfLink);
  if (prior && JSON.stringify(prior) !== JSON.stringify(resource))
    throw new Error('GCP resource identity changed; explicit replacement required');
  if (!prior) {
    ledger.resources.push(structuredClone(resource));
    await store.write('gcp-resources.json', ledger);
  }
}

export async function assertGcpResourceOwnership(
  store: GcpOperationStore,
  expected: GcpResourceIdentity,
  observed: Pick<GcpResourceIdentity, 'id' | 'selfLink'>,
): Promise<void> {
  validateGcpResourceIdentity(expected);
  const ledger = (await store.read('gcp-resources.json')) as Ledger;
  if (ledger?.schemaVersion !== 1 || !sameScope(ledger, expected) || !Array.isArray(ledger.resources))
    throw new Error('GCP ownership ledger is unavailable');
  const owned = ledger.resources.find((r) => r.id === expected.id && r.selfLink === expected.selfLink);
  if (
    !owned ||
    JSON.stringify(owned) !== JSON.stringify(expected) ||
    observed.id !== expected.id ||
    observed.selfLink !== expected.selfLink
  )
    throw new Error('GCP resource ownership mismatch');
}

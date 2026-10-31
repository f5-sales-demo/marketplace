import { fingerprint } from './discovery';
import { type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';
import { ipv4Range, validateScope } from './validation';

export interface GcpStaticRouteIntent {
  schemaVersion: 1;
  project: string;
  deploymentName: string;
  engine: 'native' | 'terraform';
  node: GcpResourceIdentity;
  network: GcpResourceIdentity;
  routes: Array<{ name: string; destinationCidr: string; priority: number; clientTags: string[] }>;
}
/** Single-node insertion only; ingress and return-path validation remain independent gates. */
export function planGcpStaticInsertion(
  intent: GcpStaticRouteIntent,
  observedVm: { id: string; selfLink: string; canIpForward: boolean; networks: string[] },
) {
  validateScope(intent.project);
  if (intent.schemaVersion !== 1 || !['native', 'terraform'].includes(intent.engine))
    throw new Error('Unsupported static route intent');
  for (const resource of [intent.node, intent.network]) {
    validateGcpResourceIdentity(resource);
    if (
      resource.project !== intent.project ||
      resource.deploymentName !== intent.deploymentName ||
      resource.engine !== intent.engine
    )
      throw new Error('Route resource ownership differs');
  }
  if (intent.node.kind !== 'instance' || intent.network.kind !== 'network')
    throw new Error('Static insertion needs instance and network identities');
  if (
    observedVm.id !== intent.node.id ||
    observedVm.selfLink !== intent.node.selfLink ||
    missingObservedNetwork(observedVm, intent.network.selfLink)
  )
    throw new Error('Observed route next-hop identity differs');
  if (observedVm.canIpForward !== true) throw new Error('Next-hop VM must forward IP packets');
  if (!Array.isArray(intent.routes) || !intent.routes.length)
    throw new Error('Explicit insertion destinations required');
  const names = new Set<string>();
  const destinations = new Set<string>();
  const resources: Record<string, unknown> = {};
  const actions = intent.routes.map((route) => {
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(route.name) || names.has(route.name))
      throw new Error('Unique route names required');
    names.add(route.name);
    ipv4Range(route.destinationCidr);
    if (destinations.has(route.destinationCidr)) throw new Error('Duplicate insertion destination');
    destinations.add(route.destinationCidr);
    if (!Number.isInteger(route.priority) || route.priority < 0 || route.priority > 65535)
      throw new Error('Invalid GCP route priority');
    if (
      !route.clientTags.length ||
      new Set(route.clientTags).size !== route.clientTags.length ||
      route.clientTags.some((tag) => !/^[a-z][a-z0-9-]{0,62}$/.test(tag))
    )
      throw new Error('Explicit unique client tags required');
    // Restrict routing to named clients; a global untagged route can route the CE through itself.
    resources[route.name.replaceAll('-', '_')] = {
      name: route.name,
      project: intent.project,
      network: intent.network.selfLink,
      dest_range: route.destinationCidr,
      priority: route.priority,
      tags: [...route.clientTags],
      next_hop_instance: intent.node.selfLink,
    };
    return {
      id: `route-${route.name}`,
      argv: [
        'compute',
        'routes',
        'create',
        route.name,
        `--project=${intent.project}`,
        `--network=${intent.network.selfLink}`,
        `--destination-range=${route.destinationCidr}`,
        `--priority=${route.priority}`,
        `--tags=${route.clientTags.join(',')}`,
        `--next-hop-instance=${intent.node.selfLink.split('/').at(-1)}`,
        `--next-hop-instance-zone=${intent.node.selfLink.split('/')[8]}`,
        '--quiet',
        '--format=json',
      ],
    };
  });
  return {
    schemaVersion: 1,
    engine: intent.engine,
    executable: false,
    actions: intent.engine === 'native' ? actions : [],
    terraformResources: intent.engine === 'terraform' ? resources : {},
    required: [
      'reviewed route plan',
      'exact ledger ownership recheck',
      'client tag exclusion from CE',
      'return-path symmetry',
      'content-verified traffic',
    ],
    sha256: fingerprint({ intent, observedVm }),
  };
}
function missingObservedNetwork(vm: { networks: string[] }, network: string): boolean {
  return !Array.isArray(vm.networks) || !vm.networks.includes(network);
}

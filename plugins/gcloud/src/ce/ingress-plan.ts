import { fingerprint } from './discovery';
import { type GcpResourceIdentity, validateGcpResourceIdentity } from './ownership';
import { validateScope } from './validation';

export interface GcpInternalIngressIntent {
  schemaVersion: 1;
  project: string;
  region: string;
  deploymentName: string;
  engine: 'native' | 'terraform';
  name: string;
  network: GcpResourceIdentity;
  subnet: GcpResourceIdentity;
  subnetNetwork: string;
  backendNodes: GcpResourceIdentity[];
  protocol: 'TCP' | 'UDP';
  ports: number[];
  healthCheck: { protocol: 'TCP' | 'HTTP'; port: number; requestPath?: string };
  backendInterface: 'slo' | 'sli';
  allowGlobalAccess: boolean;
}
/** Regional passthrough ingress does not create destination routes or prove return-path symmetry. */
export function planGcpInternalIngress(intent: GcpInternalIngressIntent) {
  validateScope(intent.project, intent.region);
  if (
    intent.schemaVersion !== 1 ||
    !['native', 'terraform'].includes(intent.engine) ||
    !/^[a-z][a-z0-9-]{0,39}$/.test(intent.name)
  )
    throw new Error('Invalid internal ingress identity');
  for (const resource of [intent.network, intent.subnet, ...intent.backendNodes]) {
    validateGcpResourceIdentity(resource);
    if (
      resource.project !== intent.project ||
      resource.deploymentName !== intent.deploymentName ||
      resource.engine !== intent.engine
    )
      throw new Error('Ingress ownership differs');
  }
  if (
    intent.network.kind !== 'network' ||
    intent.subnet.kind !== 'subnetwork' ||
    intent.subnetNetwork !== intent.network.selfLink ||
    !intent.subnet.selfLink.includes(`/regions/${intent.region}/`)
  )
    throw new Error('Ingress network/subnet/region differs');
  if (
    ![1, 3].includes(intent.backendNodes.length) ||
    new Set(intent.backendNodes.map((node) => node.selfLink)).size !== intent.backendNodes.length
  )
    throw new Error('Complete one-node or HA ingress inventory required');
  if (
    !['TCP', 'UDP'].includes(intent.protocol) ||
    !intent.ports.length ||
    intent.ports.length > 5 ||
    new Set(intent.ports).size !== intent.ports.length ||
    intent.ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
  )
    throw new Error('Explicit valid ingress ports required');
  if (
    !['TCP', 'HTTP'].includes(intent.healthCheck.protocol) ||
    !Number.isInteger(intent.healthCheck.port) ||
    intent.healthCheck.port < 1 ||
    intent.healthCheck.port > 65535
  )
    throw new Error('Explicit backend health-check required');
  if (
    intent.healthCheck.protocol === 'HTTP' &&
    (!intent.healthCheck.requestPath || !/^\/[a-zA-Z0-9_./-]*$/.test(intent.healthCheck.requestPath))
  )
    throw new Error('Exact HTTP health-check path required');
  if (!['slo', 'sli'].includes(intent.backendInterface)) throw new Error('Explicit backend interface required');
  // GCP instance-group backend identity alone cannot select a nonprimary CE
  // interface. SLI support needs a qualified binding rather than an inferred name.
  if (intent.backendInterface !== 'slo')
    throw new Error('SLI passthrough backend binding is unavailable until interface-specific contract qualification');
  const groups: Record<string, unknown> = {};
  for (const node of intent.backendNodes) {
    if (node.kind !== 'instance') throw new Error('Ingress backend must be an instance');
    const zone = node.selfLink.split('/')[8];
    if (!zone.startsWith(`${intent.region}-`)) throw new Error('Ingress backend zone belongs to another region');
    const key = zone.replaceAll('-', '_');
    const prior = groups[key] as { instances: string[] } | undefined;
    if (prior) prior.instances.push(node.selfLink);
    else
      groups[key] = {
        name: `${intent.name}-${zone.at(-1)}-group`,
        project: intent.project,
        zone,
        network: intent.network.selfLink,
        instances: [node.selfLink],
      };
  }
  const key = intent.name.replaceAll('-', '_');
  const health = {
    name: `${intent.name}-health`,
    project: intent.project,
    region: intent.region,
    ...(intent.healthCheck.protocol === 'TCP'
      ? { tcp_health_check: [{ port: intent.healthCheck.port }] }
      : { http_health_check: [{ port: intent.healthCheck.port, request_path: intent.healthCheck.requestPath }] }),
  };
  const backend = {
    name: `${intent.name}-backend`,
    project: intent.project,
    region: intent.region,
    network: intent.network.selfLink,
    load_balancing_scheme: 'INTERNAL',
    protocol: intent.protocol,
    health_checks: [`\${google_compute_region_health_check.${key}.id}`],
    backend: Object.keys(groups).map((groupKey) => ({
      group: `\${google_compute_instance_group.${groupKey}.id}`,
      balancing_mode: 'CONNECTION',
    })),
  };
  const forwarding = {
    name: `${intent.name}-ingress`,
    project: intent.project,
    region: intent.region,
    network: intent.network.selfLink,
    subnetwork: intent.subnet.selfLink,
    load_balancing_scheme: 'INTERNAL',
    ip_protocol: intent.protocol,
    ports: intent.ports.map(String),
    allow_global_access: intent.allowGlobalAccess,
    backend_service: `\${google_compute_region_backend_service.${key}.id}`,
  };
  return {
    schemaVersion: 1,
    engine: intent.engine,
    executable: false,
    ingress: true,
    createsRoutes: false,
    terraformResources: {
      google_compute_instance_group: groups,
      google_compute_region_health_check: { [key]: health },
      google_compute_region_backend_service: { [key]: backend },
      google_compute_forwarding_rule: { [key]: forwarding },
    },
    nativeExecution: 'unavailable-pending-exact-health-backend-binding',
    required: [
      'exact ledger/live resource recheck',
      'health-check firewall/source policy',
      'verified CE backend listening',
      'return-path symmetry',
      'content-verified ingress traffic',
      ...(intent.backendNodes.length === 3 ? ['HA backend health and serial failure acceptance'] : []),
    ],
    sha256: fingerprint(intent),
  };
}
